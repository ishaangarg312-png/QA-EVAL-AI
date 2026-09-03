import time
import datetime
import uuid
import asyncio
from typing import Dict, Any, List, Optional, Set
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.execution import ExecutionRun, ExecutionStep, TraceEvent, MatrixExecutionJob
from app.models.project import Environment
from app.domain.types import ExecutionStatus, TraceEventType
from app.domain.context import ExecutionContext, JsonExtractor
from app.execution.handlers.api_handler import ApiHandler
from app.execution.handlers.polling_handler import PollingHandler
from app.execution.handlers.agent_handler import AgentHandler
from app.execution.handlers.prompt_handler import PromptHandler
from app.execution.handlers.extract_handler import ExtractHandler
from app.execution.handlers.capture_handler import CaptureHandler
from app.execution.handlers.chat_url_handler import ChatUrlHandler

_matrix_runner_lock = asyncio.Lock()

def sanitize_telemetry(d: Any, max_len: int = 150, depth: int = 0) -> Any:
    """Safely truncates huge telemetry payloads to prevent DB bloat."""
    if depth > 10:
        return "<max_depth>"
    if isinstance(d, dict):
        res = {}
        for k, v in d.items():
            if k == "captured_variables" and isinstance(v, dict):
                res[k] = sanitize_telemetry(v, max_len=500000, depth=depth + 1)
            elif isinstance(v, str):
                res[k] = (v[:max_len] + "...") if len(v) > max_len else v
            elif isinstance(v, dict):
                res[k] = sanitize_telemetry(v, max_len, depth + 1)
            elif isinstance(v, list):
                res[k] = [
                    sanitize_telemetry(item, max_len, depth + 1) if isinstance(item, (dict, list))
                    else ((item[:max_len] + "...") if isinstance(item, str) and len(item) > max_len else item)
                    for item in v[:30]
                ]
            else:
                res[k] = v
        return res
    elif isinstance(d, list):
        return [
            sanitize_telemetry(item, max_len, depth + 1) if isinstance(item, (dict, list))
            else ((item[:max_len] + "...") if isinstance(item, str) and len(item) > max_len else item)
            for item in d[:30]
        ]
    elif isinstance(d, str):
        return (d[:max_len] + "...") if len(d) > max_len else d
    return d

async def execute_single_scenario(
    job_id: str,
    scenario: Dict[str, Any],
    waves: List[List[Dict[str, Any]]],
    project_id: str,
    environment_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    nodes: Optional[List[Dict[str, Any]]] = None,
    edges: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Executes a single test scenario (flat row or multi-turn) across DAG waves.
    Saves ExecutionRun, ExecutionStep, TraceEvent, and updates MatrixExecutionJob checkpoint.
    """
    s_idx = scenario.get("scenarioIndex", 1) - 1
    scenario_title = scenario.get("scenarioTitle") or f"Scenario #{s_idx+1}"
    scenario["status"] = "RUNNING"

    turns = scenario.get("turns") or [scenario.get("rowData", {})]
    initial_row_vars = dict(turns[0]) if turns else {}
    active_session_vars = dict(initial_row_vars)

    skipped_node_keys: Set[str] = set()
    scenario_step_outputs: Dict[str, Any] = {}
    scenario_captured_vars: Dict[str, Any] = {}
    scenario_total_ms = 0.0
    has_error = False

    # Create 1 ExecutionRun per Scenario in DB
    corr_id = f"corr-matrix-{job_id[-6:]}-s{scenario.get('scenarioIndex', s_idx+1)}-{uuid.uuid4().hex[:4]}"
    run_id = None
    async with _matrix_runner_lock:
        async with AsyncSessionLocal() as session:
            try:
                env_id = environment_id
                if not env_id:
                    env_stmt = select(Environment).where(Environment.project_id == project_id)
                    env_res = await session.execute(env_stmt)
                    env_obj = env_res.scalars().first()
                    env_id = env_obj.id if env_obj else "env-default"

                new_run = ExecutionRun(
                    correlation_id=corr_id,
                    project_id=project_id,
                    environment_id=env_id,
                    workflow_id=workflow_id,
                    dataset_row_index=scenario.get("initialRowIndex", s_idx),
                    status=ExecutionStatus.RUNNING,
                    started_at=datetime.datetime.now(datetime.timezone.utc),
                    runtime_context={
                        "scenario": scenario_title,
                        "scenario_index": scenario.get("scenarioIndex", s_idx + 1),
                        "total_turns": len(turns),
                        "total_rows": len(scenario.get("rows", [])),
                        "turns": turns,
                        "dataset_vars": active_session_vars
                    }
                )
                session.add(new_run)
                await session.commit()
                await session.refresh(new_run)
                run_id = new_run.id
            except Exception as e:
                print(f"Error creating execution run record: {e}")

    # Initialize node results if needed
    if not scenario.get("nodeResults"):
        scenario["nodeResults"] = [
            {
                "nodeKey": n.get("node_key"),
                "nodeType": n.get("node_type"),
                "label": n.get("label"),
                "status": "PENDING",
                "statusCode": None,
                "durationMs": None,
                "error": None,
                "extractedVars": {}
            }
            for wave in waves for n in wave
        ]

    step_order_counter = 0

    async def _checkpoint_scenario_state(status_override: Optional[str] = None):
        async with _matrix_runner_lock:
            async with AsyncSessionLocal() as session:
                try:
                    stmt = select(MatrixExecutionJob).where(MatrixExecutionJob.id == job_id)
                    res = await session.execute(stmt)
                    j = res.scalar_one_or_none()
                    if j and j.scenario_results:
                        results = list(j.scenario_results)
                        sc_idx_target = scenario.get("scenarioIndex")
                        found = False
                        sc_copy = dict(scenario)
                        if status_override:
                            sc_copy["status"] = status_override
                        for i, s in enumerate(results):
                            if s.get("scenarioIndex") == sc_idx_target:
                                results[i] = sc_copy
                                found = True
                                break
                        if not found:
                            results.append(sc_copy)
                        j.scenario_results = results
                        if status_override == "RUNNING" and not j.current_scenario_title:
                            j.current_scenario_title = f"Executing {scenario_title}"
                        await session.commit()
                except Exception:
                    pass

    # Immediately mark scenario as RUNNING in DB so UI updates instantly
    await _checkpoint_scenario_state("RUNNING")

    for wave in waves:
        async def _execute_matrix_node(node: Dict[str, Any]):
            nonlocal step_order_counter, scenario_total_ms, has_error
            node_key = node.get("node_key")
            n_type = (node.get("node_type") or "API_REQUEST").upper()
            n_config = node.get("config") or {}
            node_label = node.get("label") or node_key

            nr = next((r for r in scenario.get("nodeResults", []) if r.get("nodeKey") == node_key), None)
            if not nr:
                nr = {
                    "nodeKey": node_key,
                    "nodeType": n_type,
                    "label": node_label,
                    "status": "PENDING",
                    "statusCode": None,
                    "durationMs": None,
                    "error": None,
                    "extractedVars": {}
                }
                scenario.setdefault("nodeResults", []).append(nr)

            if node_key in skipped_node_keys:
                nr["status"] = "SKIPPED"
                nr["statusCode"] = "SKIPPED"
                nr["durationMs"] = 0
                if edges:
                    downstream_keys = [e.get("target_node_key") for e in edges if e.get("source_node_key") == node_key]
                    skipped_node_keys.update([k for k in downstream_keys if k])
                if run_id:
                    async with _matrix_runner_lock:
                        async with AsyncSessionLocal() as session:
                            try:
                                step_order_counter += 1
                                step_obj = ExecutionStep(
                                    execution_id=run_id,
                                    node_key=node_key,
                                    node_type=n_type,
                                    step_order=step_order_counter,
                                    status=ExecutionStatus.SKIPPED,
                                    duration_ms=0.0,
                                    input_data={"status": "SKIPPED", "reason": "Condition not met by upstream node"},
                                    output_data={"status": "SKIPPED"},
                                    started_at=datetime.datetime.now(datetime.timezone.utc),
                                    completed_at=datetime.datetime.now(datetime.timezone.utc)
                                )
                                session.add(step_obj)
                                await session.commit()
                            except Exception:
                                pass
                return

            nr["status"] = "RUNNING"
            start = time.perf_counter()

            try:
                is_followup_node = "follow" in node_label.lower() or n_config.get("api_type") == "FOLLOWUP" or n_type == "FOLLOWUP_PROMPT"

                if is_followup_node and len(turns) > 1:
                    multi_turn_responses = []
                    multi_turn_extracted = {}
                    multi_turn_success = True
                    turn_dur_sum = 0.0

                    for t_idx, turn_data in enumerate(turns):
                        step_order_counter += 1
                        for tk, tv in turn_data.items():
                            active_session_vars[tk] = tv
                            active_session_vars[str(tk).lower()] = tv

                        active_session_vars["turn_index"] = t_idx + 1
                        active_session_vars["total_turns"] = len(turns)

                        ctx = ExecutionContext(dataset_vars={"user_id": "default-user", **active_session_vars, **multi_turn_extracted})
                        for step_k, step_v in scenario_step_outputs.items():
                            ctx.set_step_output(step_k, step_v)

                        t_start = time.perf_counter()
                        if n_type in ("API_REQUEST", "REST_API"):
                            res = await ApiHandler.execute(n_config, ctx)
                        elif n_type in ("PROMPT", "FOLLOWUP_PROMPT"):
                            res = await PromptHandler.execute(n_config, ctx)
                        elif n_type in ("AGENT", "AGENT_INVOCATION"):
                            res = await AgentHandler.execute(n_config, ctx, agent_version_tag="v1.0.0")
                        else:
                            res = await ApiHandler.execute(n_config, ctx)

                        t_dur = round((time.perf_counter() - t_start) * 1000.0, 2)
                        turn_dur_sum += t_dur

                        for ext in (n_config.get("extractions") or []):
                            vn = ext.get("variable_name")
                            jp = ext.get("json_path")
                            if vn and jp:
                                val = JsonExtractor.extract_value(res, jp)
                                if val is None and isinstance(res, dict) and "response" in res:
                                    val = JsonExtractor.extract_value(res["response"], jp)
                                if val is not None:
                                    multi_turn_extracted[vn] = val
                                    active_session_vars[vn] = val

                        if run_id:
                            async with _matrix_runner_lock:
                                async with AsyncSessionLocal() as session:
                                    try:
                                        step_obj = ExecutionStep(
                                            execution_id=run_id,
                                            node_key=f"{node_key}_turn_{t_idx+1}",
                                            node_type=n_type,
                                            step_order=step_order_counter,
                                            status=ExecutionStatus.PASSED,
                                            duration_ms=t_dur,
                                            input_data={"turn": t_idx + 1, **turn_data},
                                            output_data=res.get("response") if isinstance(res, dict) and "response" in res else res,
                                            started_at=datetime.datetime.now(datetime.timezone.utc),
                                            completed_at=datetime.datetime.now(datetime.timezone.utc)
                                        )
                                        session.add(step_obj)
                                        await session.commit()
                                    except Exception:
                                        pass

                        multi_turn_responses.append(res)
                        status_code = res.get("status_code", 200) if isinstance(res, dict) else 200
                        if status_code not in (200, 201, 202, 204):
                            multi_turn_success = False

                    dur_ms = round(turn_dur_sum, 2)
                    scenario_total_ms += dur_ms
                    nr["status"] = "SUCCESS" if multi_turn_success else "FAILED"
                    nr["statusCode"] = 200 if multi_turn_success else 500
                    nr["durationMs"] = dur_ms
                    nr["extractedVars"] = sanitize_telemetry(multi_turn_extracted, max_len=60)
                    if not multi_turn_success:
                        has_error = True

                else:
                    step_order_counter += 1
                    ctx = ExecutionContext(dataset_vars={"user_id": "default-user", **active_session_vars})
                    for step_k, step_v in scenario_step_outputs.items():
                        ctx.set_step_output(step_k, step_v)

                    ctx.runtime_state["matrix_job_id"] = job_id
                    ctx.runtime_state["scenario_index"] = scenario.get("scenarioIndex", s_idx + 1)
                    ctx.runtime_state["node_key"] = node_key

                    if n_type in ("API_REQUEST", "REST_API"):
                        res = await ApiHandler.execute(n_config, ctx)
                    elif n_type == "POLLING":
                        res = await PollingHandler.execute(n_config, ctx)
                    elif n_type in ("PROMPT", "FOLLOWUP_PROMPT"):
                        res = await PromptHandler.execute(n_config, ctx)
                    elif n_type in ("AGENT", "AGENT_INVOCATION"):
                        res = await AgentHandler.execute(n_config, ctx, agent_version_tag="v1.0.0")
                    elif n_type == "EXTRACT_VARIABLE":
                        res = await ExtractHandler.execute(n_config, ctx)
                    elif n_type == "CAPTURE_RESULT":
                        res = await CaptureHandler.execute(n_config, ctx)
                    elif n_type == "CHAT_URL_CREATOR":
                        res = await ChatUrlHandler.execute(n_config, ctx)
                    elif n_type == "CONDITION":
                        var_name = n_config.get("condition_variable") or n_config.get("variable") or "file_id"
                        var_clean = var_name.replace("{{", "").replace("}}", "").strip()
                        actual_val = active_session_vars.get(var_clean)
                        if actual_val is None:
                            actual_val = active_session_vars.get(var_name, "")
                        actual_str = str(actual_val if actual_val is not None else "").strip()

                        op = n_config.get("operator", "is_not_empty")
                        expected = str(n_config.get("condition_value", n_config.get("expected_value", ""))).strip()

                        if op == "is_not_empty":
                            is_met = bool(actual_str)
                        elif op == "is_empty":
                            is_met = not bool(actual_str)
                        elif op == "equals":
                            is_met = (actual_str == expected)
                        elif op == "not_equals":
                            is_met = (actual_str != expected)
                        elif op == "contains":
                            is_met = (expected in actual_str)
                        else:
                            is_met = bool(actual_str)

                        res = {
                            "status": "SUCCESS",
                            "status_code": 200,
                            "condition_met": is_met,
                            "variable": var_clean,
                            "value": actual_str,
                            "response": {
                                "condition_met": is_met,
                                "result": "TRUE (Proceed)" if is_met else "FALSE (Skip Downstream)",
                                "variable_checked": var_clean,
                                "evaluated_value": actual_str
                            }
                        }
                        if not is_met and edges:
                            downstreams = [e.get("target_node_key") for e in edges if e.get("source_node_key") == node_key]
                            skipped_node_keys.update([k for k in downstreams if k])
                    else:
                        res = {"status": "SUCCESS", "message": f"Simulated {n_type}"}

                    dur_ms = round((time.perf_counter() - start) * 1000.0, 2)
                    scenario_total_ms += dur_ms

                    scenario_step_outputs[node_key] = res
                    if node_label:
                        scenario_step_outputs[node_label] = res

                    extracted = {}
                    for ext in (n_config.get("extractions") or []):
                        vn = ext.get("variable_name")
                        jp = ext.get("json_path")
                        if vn and jp:
                            val = JsonExtractor.extract_value(res, jp)
                            if val is None and isinstance(res, dict) and "response" in res:
                                val = JsonExtractor.extract_value(res["response"], jp)
                            if val is not None:
                                extracted[vn] = val
                                active_session_vars[vn] = val

                    if n_type in ("CAPTURE_RESULT", "CHAT_URL_CREATOR") and isinstance(res, dict):
                        if "captured_variables" in res and res["captured_variables"]:
                            for cv_k, cv_v in res["captured_variables"].items():
                                extracted[cv_k] = cv_v
                                active_session_vars[cv_k] = cv_v
                                scenario_captured_vars[cv_k] = cv_v

                    status_code = res.get("status_code", 200) if isinstance(res, dict) else 200
                    is_node_success = status_code in (200, 201, 202, 204)
                    if not is_node_success:
                        has_error = True

                    nr["status"] = "SUCCESS" if is_node_success else "FAILED"
                    nr["statusCode"] = "TRUE" if (n_type == "CONDITION" and res.get("condition_met")) else status_code
                    nr["durationMs"] = dur_ms
                    nr["extractedVars"] = sanitize_telemetry(extracted, max_len=60)

                    # Persist trace
                    if run_id:
                        async with _matrix_runner_lock:
                            async with AsyncSessionLocal() as session:
                                try:
                                    step_obj = ExecutionStep(
                                        execution_id=run_id,
                                        node_key=node_key,
                                        node_type=n_type,
                                        step_order=step_order_counter,
                                        status=ExecutionStatus.PASSED if is_node_success else ExecutionStatus.FAILED,
                                        duration_ms=dur_ms,
                                        input_data=sanitize_telemetry(active_session_vars, max_len=80),
                                        output_data=sanitize_telemetry(res, max_len=200),
                                        started_at=datetime.datetime.now(datetime.timezone.utc),
                                        completed_at=datetime.datetime.now(datetime.timezone.utc)
                                    )
                                    session.add(step_obj)
                                    await session.commit()
                                except Exception:
                                    pass

            except Exception as ex:
                has_error = True
                nr["status"] = "FAILED"
                nr["statusCode"] = 500
                nr["durationMs"] = round((time.perf_counter() - start) * 1000.0, 2)
                nr["error"] = str(ex)

        await asyncio.gather(*[_execute_matrix_node(n) for n in wave])
        # Checkpoint finished wave nodes live into DB
        await _checkpoint_scenario_state("RUNNING")

    scenario["status"] = "FAILED" if has_error else "SUCCESS"
    scenario["totalDurationMs"] = scenario_total_ms
    await _checkpoint_scenario_state()

    # Finalize ExecutionRun in DB
    if run_id:
        async with _matrix_runner_lock:
            async with AsyncSessionLocal() as session:
                try:
                    run_stmt = select(ExecutionRun).where(ExecutionRun.id == run_id)
                    run_res = await session.execute(run_stmt)
                    run_record = run_res.scalar_one_or_none()
                    if run_record:
                        run_record.status = ExecutionStatus.FAILED if has_error else ExecutionStatus.PASSED
                        run_record.total_duration_ms = scenario_total_ms
                        run_record.quality_score = 100.0 if not has_error else 50.0
                        run_record.safety_score = 100.0
                        run_record.completed_at = datetime.datetime.now(datetime.timezone.utc)
                        await session.commit()
                except Exception as fin_err:
                    print(f"Error finalizing execution run: {fin_err}")

    # Checkpoint parent MatrixExecutionJob
    async with _matrix_runner_lock:
        async with AsyncSessionLocal() as session:
            try:
                job_stmt = select(MatrixExecutionJob).where(MatrixExecutionJob.id == job_id)
                job_res = await session.execute(job_stmt)
                db_job = job_res.scalar_one_or_none()
                if db_job:
                    db_job.completed_scenarios = (db_job.completed_scenarios or 0) + 1
                    db_job.current_scenario_title = f"Finished {db_job.completed_scenarios}/{db_job.total_scenarios}: {scenario_title}"
                    
                    # Update scenario list in db_job
                    results = list(db_job.scenario_results or [])
                    found = False
                    for i, r in enumerate(results):
                        if r.get("scenarioIndex") == scenario.get("scenarioIndex"):
                            results[i] = scenario
                            found = True
                            break
                    if not found:
                        results.append(scenario)
                    db_job.scenario_results = results

                    # Check if all completed
                    if db_job.completed_scenarios >= db_job.total_scenarios:
                        any_failed = any(r.get("status") == "FAILED" for r in results)
                        db_job.status = "FAILED" if any_failed else "COMPLETED"
                        db_job.completed_at = datetime.datetime.now(datetime.timezone.utc)

                    await session.commit()
            except Exception as e:
                print(f"Error checkpointing matrix job in DB: {e}")

    return scenario

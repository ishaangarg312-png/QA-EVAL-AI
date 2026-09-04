import uuid
import time
import datetime
import asyncio
from typing import List, Optional, Dict, Any, Set, Union

import re
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, AsyncSessionLocal
from sqlalchemy import select, update

from app.models.execution import ExecutionRun, ExecutionStep, TraceEvent, HITLTask, MatrixExecutionJob
from app.models.queue import QueueTask
from app.models.project import Project, Environment
from app.models.agent import AgentVersion
from app.models.test_case import TestDataset
from app.models.workflow import Workflow, WorkflowNode, WorkflowEdge
from app.models.evaluation import EvaluationResult
from app.schemas.execution import ExecutionRunCreate, ExecutionRunResponse, ExecutionStepResponse, HITLTaskResponse, DatasetExecutionStrategy
from app.schemas.trace import TraceEventResponse
from app.execution.engine import GraphExecutionEngine
from app.execution.report_generator import ExcelReportGenerator
from app.execution.handlers.api_handler import ApiHandler
from app.execution.handlers.polling_handler import PollingHandler
from app.execution.handlers.agent_handler import AgentHandler
from app.execution.handlers.prompt_handler import PromptHandler
from app.execution.handlers.extract_handler import ExtractHandler
from app.execution.handlers.capture_handler import CaptureHandler
from app.execution.handlers.chat_url_handler import ChatUrlHandler
from app.domain.context import ExecutionContext, JsonExtractor
from app.domain.types import ExecutionStatus, TraceEventType

class ExcelExportRequest(BaseModel):
    project_id: Optional[str] = None
    execution_ids: Optional[List[str]] = None
    template: Optional[Dict[str, Any]] = None
    correlation_id: Optional[str] = None

router = APIRouter(prefix="/executions", tags=["Executions & Traces"])

async def run_execution_background(execution_id: str, initial_vars: dict, version_tag: str):
    async with AsyncSessionLocal() as session:
        engine = GraphExecutionEngine(session)
        await engine.execute_run(execution_id, initial_vars, version_tag)

@router.get("", response_model=List[ExecutionRunResponse])
async def list_executions(project_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    stmt = select(ExecutionRun).order_by(ExecutionRun.created_at.desc()).limit(20)
    if project_id:
        stmt = stmt.where(ExecutionRun.project_id == project_id)
    res = await db.execute(stmt)
    runs = res.scalars().all()
    
    out = []
    for r in runs:
        out.append(await _format_execution_response(r, db, include_details=False))
    return out

@router.post("", response_model=ExecutionRunResponse)
async def trigger_execution(
    req: ExecutionRunCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    correlation_id = f"corr-{uuid.uuid4().hex[:12]}"
    
    # Check agent version tag
    version_tag = "v1.0.0"
    if req.agent_version_id:
        av_stmt = select(AgentVersion).where(AgentVersion.id == req.agent_version_id)
        av_res = await db.execute(av_stmt)
        av = av_res.scalar_one_or_none()
        if av:
            version_tag = av.version_tag

    # Resolve environment_id if not provided
    env_id = req.environment_id
    if not env_id:
        from app.models.project import Environment
        env_stmt = select(Environment).where(Environment.project_id == req.project_id)
        env_res = await db.execute(env_stmt)
        env = env_res.scalars().first()
        if env:
            env_id = env.id

    new_run = ExecutionRun(
        correlation_id=correlation_id,
        project_id=req.project_id,
        environment_id=env_id,
        agent_version_id=req.agent_version_id,
        test_case_id=req.test_case_id,
        workflow_id=req.workflow_id,
        dataset_row_index=req.dataset_row_index,
        status=ExecutionStatus.QUEUED
    )
    db.add(new_run)
    await db.commit()
    await db.refresh(new_run)

    # Launch engine directly (or via background task)
    engine = GraphExecutionEngine(db)
    completed_run = await engine.execute_run(new_run.id, req.initial_variables, agent_version_tag=version_tag)
    return await _format_execution_response(completed_run, db)

@router.delete("/{execution_id}")
async def delete_execution(execution_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.evaluation import EvaluationResult
    stmt = select(ExecutionRun).where(ExecutionRun.id == execution_id)
    res = await db.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Execution not found")

    # Delete child trace events
    te_stmt = select(TraceEvent).where(TraceEvent.execution_id == execution_id)
    te_res = await db.execute(te_stmt)
    for te in te_res.scalars().all():
        await db.delete(te)

    # Delete execution steps
    es_stmt = select(ExecutionStep).where(ExecutionStep.execution_id == execution_id)
    es_res = await db.execute(es_stmt)
    for es in es_res.scalars().all():
        await db.delete(es)

    # Delete evaluation results
    er_stmt = select(EvaluationResult).where(EvaluationResult.execution_id == execution_id)
    er_res = await db.execute(er_stmt)
    for er in er_res.scalars().all():
        await db.delete(er)

    # Delete HITL tasks
    hitl_stmt = select(HITLTask).where(HITLTask.execution_id == execution_id)
    hitl_res = await db.execute(hitl_stmt)
    for h in hitl_res.scalars().all():
        await db.delete(h)

    await db.delete(run)
    await db.commit()
    return {"status": "deleted", "id": execution_id}

@router.delete("")
async def clear_executions(project_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    from app.models.evaluation import EvaluationResult
    stmt = select(ExecutionRun)
    if project_id:
        stmt = stmt.where(ExecutionRun.project_id == project_id)
    res = await db.execute(stmt)
    runs = res.scalars().all()
    
    for run in runs:
        # Delete trace events
        te_stmt = select(TraceEvent).where(TraceEvent.execution_id == run.id)
        te_res = await db.execute(te_stmt)
        for te in te_res.scalars().all():
            await db.delete(te)

        # Delete steps
        es_stmt = select(ExecutionStep).where(ExecutionStep.execution_id == run.id)
        es_res = await db.execute(es_stmt)
        for es in es_res.scalars().all():
            await db.delete(es)

        # Delete evaluations
        er_stmt = select(EvaluationResult).where(EvaluationResult.execution_id == run.id)
        er_res = await db.execute(er_stmt)
        for er in er_res.scalars().all():
            await db.delete(er)

        # Delete HITL
        hitl_stmt = select(HITLTask).where(HITLTask.execution_id == run.id)
        hitl_res = await db.execute(hitl_stmt)
        for h in hitl_res.scalars().all():
            await db.delete(h)

        await db.delete(run)

    await db.commit()
    return {"status": "cleared", "deleted_count": len(runs)}

from pydantic import BaseModel as PyBaseModel

class BatchExecutionRequest(PyBaseModel):
    project_id: str
    environment_id: Optional[str] = None
    workflow_id: Optional[str] = None
    dataset_id: Optional[str] = None
    rows: Optional[List[dict]] = None

@router.post("/batch", response_model=List[ExecutionRunResponse])
async def trigger_batch_execution(
    req: BatchExecutionRequest,
    db: AsyncSession = Depends(get_db)
):
    from app.models.test_case import TestDataset
    from app.models.project import Environment
    
    # Resolve environment_id if not provided
    env_id = req.environment_id
    if not env_id:
        env_stmt = select(Environment).where(Environment.project_id == req.project_id)
        env_res = await db.execute(env_stmt)
        env = env_res.scalars().first()
        if env:
            env_id = env.id

    rows_to_run = req.rows or []
    if not rows_to_run and req.dataset_id:
        ds_stmt = select(TestDataset).where(TestDataset.id == req.dataset_id)
        ds_res = await db.execute(ds_stmt)
        ds = ds_res.scalar_one_or_none()
        if ds and ds.rows:
            headers = ds.headers or []
            for r in ds.rows:
                if isinstance(r, dict):
                    rows_to_run.append(r)
                elif isinstance(r, list):
                    row_dict = {headers[i]: r[i] for i in range(min(len(headers), len(r)))}
                    rows_to_run.append(row_dict)

    if not rows_to_run:
        rows_to_run = [{}]

    completed_runs = []
    engine = GraphExecutionEngine(db)

    for idx, row_vars in enumerate(rows_to_run):
        correlation_id = f"corr-row-{idx+1}-{uuid.uuid4().hex[:6]}"
        new_run = ExecutionRun(
            correlation_id=correlation_id,
            project_id=req.project_id,
            environment_id=env_id,
            workflow_id=req.workflow_id,
            dataset_row_index=idx,
            status=ExecutionStatus.QUEUED
        )
        db.add(new_run)
        await db.commit()
        await db.refresh(new_run)

        run_result = await engine.execute_run(new_run.id, row_vars, agent_version_tag="v1.0.0")
        completed_runs.append(await _format_execution_response(run_result, db))

    return completed_runs

class TestNodeRequest(BaseModel):
    node_type: str
    config: dict
    initial_variables: Optional[dict] = None
    step_outputs: Optional[dict] = None
    extractions: Optional[List[dict]] = None

@router.post("/test-node")
async def test_node_execution(req: TestNodeRequest):
    import time
    start = time.perf_counter()
    context = ExecutionContext(env_vars=req.initial_variables or {}, dataset_vars=req.initial_variables or {})
    if req.step_outputs and isinstance(req.step_outputs, dict):
        for step_k, step_v in req.step_outputs.items():
            context.set_step_output(step_k, step_v)
    
    n_type = req.node_type.upper()
    n_config = req.config or {}
    
    try:
        if n_type == "API_REQUEST":
            res = await ApiHandler.execute(n_config, context)
        elif n_type == "POLLING":
            res = await PollingHandler.execute(n_config, context)
        elif n_type in ("PROMPT", "FOLLOWUP_PROMPT"):
            res = await PromptHandler.execute(n_config, context)
        elif n_type == "AGENT":
            res = await AgentHandler.execute(n_config, context, agent_version_tag="v1.0.0")
        elif n_type == "EXTRACT_VARIABLE":
            res = await ExtractHandler.execute(n_config, context)
        elif n_type == "CAPTURE_RESULT":
            res = await CaptureHandler.execute(n_config, context)
        elif n_type == "CHAT_URL_CREATOR":
            res = await ChatUrlHandler.execute(n_config, context)
        elif n_type == "CONDITION":
            var_name = n_config.get("condition_variable") or "file_id"
            var_clean = var_name.replace("{{", "").replace("}}", "").strip()
            init_vars = req.initial_variables or {}
            actual_val = init_vars.get(var_clean)
            if actual_val is None:
                actual_val = init_vars.get(var_name, "")
            actual_str = str(actual_val if actual_val is not None else "").strip()

            op = n_config.get("operator", "is_not_empty")
            expected = str(n_config.get("condition_value", "")).strip()

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
                    "result": "TRUE (Execute Next)" if is_met else "FALSE (Skip Next)",
                    "variable_checked": var_clean,
                    "evaluated_value": actual_str
                }
            }
        else:
            res = {"status": "SUCCESS", "message": f"Simulated test for {n_type}"}

        duration_ms = round((time.perf_counter() - start) * 1000.0, 2)

        # Extract variables from response payload
        extracted_vars = {}
        if isinstance(res, dict) and "captured_variables" in res:
            extracted_vars.update(res["captured_variables"])
        if isinstance(res, dict) and "captured_raw_fields" in res:
            extracted_vars.update(res["captured_raw_fields"])

        all_extractions = req.extractions or n_config.get("extractions") or []
        for ext in all_extractions:
            v_name = ext.get("variable_name")
            j_path = ext.get("json_path")
            if v_name and j_path and v_name not in extracted_vars:
                val = JsonExtractor.extract_value(res, j_path)
                if val is None and isinstance(res, dict) and "response" in res:
                    val = JsonExtractor.extract_value(res["response"], j_path)
                if val is None and isinstance(res, dict) and "body" in res:
                    val = JsonExtractor.extract_value(res["body"], j_path)
                extracted_vars[v_name] = val

        # Status code resolution
        status_code = 200
        if isinstance(res, dict):
            status_code = res.get("status_code", 200)

        is_success = status_code in (200, 201, 202, 204) and (not isinstance(res, dict) or (res.get("status") != "FAILED" and res.get("matched") is not False))
        error_msg = None
        if not is_success:
            if isinstance(res, dict) and isinstance(res.get("response"), dict):
                error_msg = res["response"].get("error") or res["response"].get("message")
            if not error_msg and isinstance(res, dict):
                error_msg = res.get("error")

        resp_payload = res.get("response") if isinstance(res, dict) and "response" in res else res
        if (not resp_payload or resp_payload == {}) and extracted_vars:
            resp_payload = extracted_vars

        return {
            "status": "SUCCESS" if is_success else "FAILED",
            "status_code": status_code,
            "duration_ms": duration_ms,
            "response": resp_payload,
            "extracted_variables": extracted_vars,
            "error": error_msg
        }
    except Exception as ex:
        duration_ms = round((time.perf_counter() - start) * 1000.0, 2)
        return {
            "status": "FAILED",
            "status_code": 500,
            "duration_ms": duration_ms,
            "response": None,
            "extracted_variables": {},
            "error": str(ex)
        }

# =========================================================================
# PRODUCTION BACKEND MATRIX POLLING JOB RUNNER
# =========================================================================
matrix_jobs: Dict[str, Dict[str, Any]] = {}
matrix_payload_cache: Dict[str, Dict[str, Any]] = {}
_matrix_db_lock = asyncio.Lock()

async def _save_matrix_job_to_db(job: Dict[str, Any]):
    """Persists or checkpoints the MatrixExecutionJob state into the database for crash recovery."""
    job_id = job.get("job_id")
    if not job_id:
        return
    try:
        async with _matrix_db_lock:
            async with AsyncSessionLocal() as session:
                stmt = select(MatrixExecutionJob).where(MatrixExecutionJob.id == job_id)
                res = await session.execute(stmt)
                db_job = res.scalar_one_or_none()

                strat_data = job.get("strategy")
                if hasattr(strat_data, "model_dump"):
                    strat_data = strat_data.model_dump()
                elif not isinstance(strat_data, dict):
                    strat_data = {}

                if not db_job:
                    db_job = MatrixExecutionJob(
                        id=job_id,
                        project_id=job.get("project_id"),
                        environment_id=job.get("environment_id"),
                        workflow_id=job.get("workflow_id"),
                        dataset_id=job.get("dataset_id"),
                        dataset_name=job.get("dataset_name", "Test Matrix"),
                        status=job.get("status", "RUNNING"),
                        total_scenarios=job.get("total_scenarios", 0),
                        completed_scenarios=job.get("completed_scenarios", 0),
                        current_scenario_index=job.get("current_scenario_index", 0),
                        current_scenario_title=job.get("current_scenario_title", ""),
                        total_rows=job.get("total_rows", 0),
                        strategy=strat_data,
                        nodes=job.get("nodes", []),
                        edges=job.get("edges", []),
                        scenario_results=job.get("scenario_results", []),
                        payload_cache=matrix_payload_cache.get(job_id, {}),
                        error=job.get("error")
                    )
                    session.add(db_job)
                else:
                    db_job.status = job.get("status", db_job.status)
                    db_job.completed_scenarios = job.get("completed_scenarios", db_job.completed_scenarios)
                    db_job.current_scenario_index = job.get("current_scenario_index", db_job.current_scenario_index)
                    db_job.current_scenario_title = job.get("current_scenario_title", db_job.current_scenario_title)
                    db_job.scenario_results = job.get("scenario_results", db_job.scenario_results)
                    db_job.payload_cache = matrix_payload_cache.get(job_id, db_job.payload_cache or {})
                    db_job.error = job.get("error", db_job.error)
                    if job.get("completed_at"):
                        try:
                            db_job.completed_at = datetime.datetime.fromisoformat(job["completed_at"]) if isinstance(job.get("completed_at"), str) else datetime.datetime.now(datetime.timezone.utc)
                        except Exception:
                            db_job.completed_at = datetime.datetime.now(datetime.timezone.utc)
                await session.commit()
    except Exception as e:
        print(f"Error persisting matrix job {job_id} to DB: {e}")

async def _load_matrix_job(job_id: str) -> Optional[Dict[str, Any]]:
    """Loads a matrix job directly from the database to guarantee latest multi-process worker state."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(MatrixExecutionJob).where(MatrixExecutionJob.id == job_id)
            res = await session.execute(stmt)
            db_job = res.scalar_one_or_none()
            if db_job:
                rehydrated = {
                    "job_id": db_job.id,
                    "status": db_job.status,
                    "project_id": db_job.project_id,
                    "environment_id": db_job.environment_id,
                    "workflow_id": db_job.workflow_id,
                    "dataset_id": db_job.dataset_id,
                    "dataset_name": db_job.dataset_name,
                    "total_scenarios": db_job.total_scenarios,
                    "total_rows": db_job.total_rows,
                    "completed_scenarios": db_job.completed_scenarios,
                    "current_scenario_index": db_job.current_scenario_index,
                    "current_scenario_title": db_job.current_scenario_title,
                    "scenario_results": db_job.scenario_results or [],
                    "nodes": db_job.nodes or [],
                    "edges": db_job.edges or [],
                    "strategy": db_job.strategy or {},
                    "created_at": db_job.created_at.isoformat() if db_job.created_at else None,
                    "completed_at": db_job.completed_at.isoformat() if db_job.completed_at else None,
                    "error": db_job.error
                }
                matrix_jobs[job_id] = rehydrated
                if db_job.payload_cache:
                    matrix_payload_cache[job_id] = db_job.payload_cache
                return rehydrated
    except Exception as e:
        print(f"Error loading matrix job {job_id} from DB: {e}")
    return matrix_jobs.get(job_id)

class MatrixJobRequest(BaseModel):
    project_id: str
    workflow_id: Optional[str] = None
    dataset_id: Optional[str] = None
    dataset: Optional[Dict[str, Any]] = None
    strategy: Optional[Union[DatasetExecutionStrategy, Dict[str, Any], str]] = None
    environment_id: Optional[str] = None
    nodes: Optional[List[Dict[str, Any]]] = None
    edges: Optional[List[Dict[str, Any]]] = None
    selected_row_indices: Optional[List[int]] = None
    resume_job_id: Optional[str] = None
    only_failed: Optional[bool] = False

def compute_dag_waves(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Topologically partition nodes into dependency waves for concurrent execution."""
    if not nodes:
        return []

    node_map = {n.get("node_key"): n for n in nodes if n.get("node_key")}
    parents: Dict[str, Set[str]] = {k: set() for k in node_map.keys()}

    for e in edges:
        s_key = e.get("source_node_key")
        t_key = e.get("target_node_key")
        if t_key in parents and s_key in node_map:
            parents[t_key].add(s_key)

    executed: Set[str] = set()
    remaining: Set[str] = set(node_map.keys())
    waves: List[List[Dict[str, Any]]] = []

    while remaining:
        ready = [k for k in remaining if parents[k].issubset(executed)]
        if not ready:
            # Fallback if cyclic or isolated: pick node with lowest unsatisfied dependencies
            fallback = sorted(remaining, key=lambda k: (len(parents[k] - executed), node_map[k].get("position_x", 0)))[0]
            ready = [fallback]

        ready_nodes = sorted(
            [node_map[k] for k in ready],
            key=lambda n: (n.get("position_y", 0), n.get("position_x", 0))
        )
        waves.append(ready_nodes)
        for k in ready:
            executed.add(k)
            remaining.remove(k)

    return waves

def group_dataset_into_scenarios(
    headers: List[str], 
    rows: List[Any],
    strategy: Optional[Union[DatasetExecutionStrategy, Dict[str, Any], str]] = None,
    selected_row_indices: Optional[List[int]] = None
) -> List[Dict[str, Any]]:
    """
    Groups raw spreadsheet / matrix dataset rows into cohesive test scenarios dynamically.
    Supports:
    - FLAT_ROW_BY_ROW (Default): 1 row = 1 independent scenario execution (with optional forward-fill of empty cells)
    - MULTI_TURN: Conversational multi-turn grouping (for chat/session agents like Sage)
    - COMBINATORIAL_GRID: Cross-product matrix generation
    """
    if not rows:
        return []

    # Parse strategy
    strat_dict: Dict[str, Any] = {}
    if isinstance(strategy, str):
        strat_dict = {"mode": strategy}
    elif isinstance(strategy, dict):
        strat_dict = dict(strategy)
    elif hasattr(strategy, "model_dump"):
        strat_dict = strategy.model_dump()

    mode = (strat_dict.get("mode") or "").upper()
    # Backward compatibility heuristic:
    # If mode not explicitly supplied:
    # If headers have "followup" or "turn" -> MULTI_TURN (Sage chat compatibility)
    # Otherwise -> FLAT_ROW_BY_ROW (Standard evaluation workflow default)
    if not mode:
        has_followup_header = any("follow" in h.lower() or "turn" in h.lower() for h in headers)
        if has_followup_header:
            mode = "MULTI_TURN"
        else:
            mode = "FLAT_ROW_BY_ROW"

    forward_fill = strat_dict.get("forward_fill_blanks", True)

    def row_to_dict(r):
        d = {}
        if isinstance(r, dict):
            d = dict(r)
        elif isinstance(r, list):
            d = {headers[i]: r[i] if i < len(r) else "" for i in range(len(headers))}
        for k, v in list(d.items()):
            lk = str(k).lower().strip()
            if lk not in d:
                d[lk] = v
        return d

    # STRATEGY 1: FLAT_ROW_BY_ROW (Every row executes independently)
    if mode == "FLAT_ROW_BY_ROW":
        scenarios = []
        last_seen: Dict[str, Any] = {}
        selected_set = set(selected_row_indices) if (selected_row_indices is not None and len(selected_row_indices) > 0) else None

        for r_idx, raw_r in enumerate(rows):
            r_dict = row_to_dict(raw_r)

            if forward_fill:
                for h in headers:
                    val = r_dict.get(h)
                    if val is not None and str(val).strip():
                        last_seen[h] = val
                    elif h in last_seen:
                        r_dict[h] = last_seen[h]
                        lh = str(h).lower().strip()
                        r_dict[lh] = last_seen[h]

            if selected_set is not None and r_idx not in selected_set:
                continue

            # Determine a meaningful scenario title
            sc_idx = r_idx + 1
            title_parts = []
            for col in ["TEST ID", "test_id", "Test ID", "TEST CASE NAME", "test_case_name", "Test Case Name", "scenario", "Scenario", "query", "message"]:
                if col in r_dict and str(r_dict[col]).strip():
                    title_parts.append(str(r_dict[col]).strip())
                    break
            for comp_col in ["COMPANY", "company", "Company", "org", "Organization"]:
                if comp_col in r_dict and str(r_dict[comp_col]).strip():
                    title_parts.append(f"({r_dict[comp_col]})")
                    break

            scenario_title = " ".join(title_parts) if title_parts else f"Scenario #{sc_idx}"

            scenarios.append({
                "scenarioIndex": sc_idx,
                "scenarioId": f"scenario-{sc_idx}",
                "scenarioTitle": scenario_title,
                "initialRowIndex": r_idx,
                "rows": [{"rowIndex": r_idx + 1, "rowData": r_dict}],
                "turns": [r_dict],
                "rowData": r_dict,
                "status": "PENDING",
                "totalDurationMs": 0,
            })
        return scenarios

    # STRATEGY 2: MULTI_TURN (Sage chat pattern or explicit group key)
    explicit_group_col = strat_dict.get("group_by_column")
    scenario_col = None
    if explicit_group_col and explicit_group_col in headers:
        scenario_col = explicit_group_col
    else:
        for h in headers:
            clean_h = h.lower().replace("_", "").replace(" ", "").replace("-", "")
            if clean_h in ("scenario", "scenarioid", "scenarioname", "testcase", "caseid", "sessionid", "conversationid"):
                scenario_col = h
                break

    primary_cols = []
    followup_cols = []
    attachment_cols = []
    for h in headers:
        lh = h.lower().replace("_", "").replace(" ", "").replace("-", "")
        if "follow" in lh or "turn" in lh:
            followup_cols.append(h)
        elif "attach" in lh or "file" in lh or "doc" in lh:
            attachment_cols.append(h)
        elif any(k in lh for k in ("message", "query", "prompt", "input", "question", "text", "userquery")):
            primary_cols.append(h)

    if not primary_cols and headers:
        primary_cols = [headers[0]]

    scenarios = []
    current_scenario = None

    for r_idx, raw_r in enumerate(rows):
        r_dict = row_to_dict(raw_r)

        is_new_scenario = False
        if scenario_col:
            sc_val = str(r_dict.get(scenario_col, "")).strip()
            if current_scenario is None or sc_val != current_scenario.get("scenario_id"):
                is_new_scenario = True
        else:
            if current_scenario is None:
                is_new_scenario = True
            else:
                has_primary_content = any(bool(str(r_dict.get(col, "")).strip()) for col in primary_cols)
                has_attachment_content = any(bool(str(r_dict.get(col, "")).strip()) for col in attachment_cols)
                if has_primary_content or has_attachment_content:
                    is_new_scenario = True
                else:
                    is_new_scenario = False

        if is_new_scenario:
            sc_idx = len(scenarios) + 1
            title = ""
            for col in primary_cols:
                val = str(r_dict.get(col, "")).strip()
                if val:
                    title = val
                    break
            if not title:
                for col in followup_cols:
                    val = str(r_dict.get(col, "")).strip()
                    if val:
                        title = val
                        break
            if not title:
                title = f"Scenario #{sc_idx}"

            current_scenario = {
                "scenarioIndex": sc_idx,
                "scenarioId": r_dict.get(scenario_col) if scenario_col else f"scenario-{sc_idx}",
                "scenarioTitle": title,
                "initialRowIndex": r_idx,
                "rows": [],
                "turns": [],
                "rowData": r_dict,
                "status": "PENDING",
                "totalDurationMs": 0,
            }
            scenarios.append(current_scenario)

        current_scenario["rows"].append({"rowIndex": r_idx + 1, "rowData": r_dict})
        current_scenario["turns"].append(r_dict)

    if selected_row_indices is not None and len(selected_row_indices) > 0 and mode != "FLAT_ROW_BY_ROW":
        selected_set = set(selected_row_indices)
        scenarios = [
            sc for sc in scenarios
            if any((r.get("rowIndex", 1) - 1) in selected_set for r in sc.get("rows", []))
        ]

    return scenarios

@router.post("/matrix-job")
async def start_matrix_job(req: MatrixJobRequest, db: AsyncSession = Depends(get_db)):
    import datetime
    import asyncio
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    
    # Resolve dataset
    ds_data = req.dataset
    if not ds_data and req.dataset_id:
        ds_stmt = select(TestDataset).where(TestDataset.id == req.dataset_id)
        ds_res = await db.execute(ds_stmt)
        ds_obj = ds_res.scalar_one_or_none()
        if ds_obj:
            ds_data = {
                "id": ds_obj.id,
                "name": ds_obj.name,
                "headers": ds_obj.headers or [],
                "rows": ds_obj.rows or []
            }
            
    if not ds_data or not ds_data.get("rows"):
        raise HTTPException(status_code=400, detail="No dataset rows provided to execute matrix")

    # Resolve workflow nodes and edges for DAG execution
    wf_id = req.workflow_id
    if not wf_id:
        wf_stmt = select(Workflow).where(Workflow.project_id == req.project_id)
        wf_res = await db.execute(wf_stmt)
        wf_obj = wf_res.scalars().first()
        if wf_obj:
            wf_id = wf_obj.id

    nodes = list(req.nodes or [])
    edges = list(req.edges or [])

    if not nodes and wf_id:
        n_stmt = select(WorkflowNode).where(WorkflowNode.workflow_id == wf_id).order_by(WorkflowNode.position_x)
        n_res = await db.execute(n_stmt)
        nodes = [
            {
                "node_key": n.node_key,
                "node_type": n.node_type,
                "label": n.label,
                "position_x": n.position_x,
                "position_y": n.position_y,
                "config": n.config or {}
            }
            for n in n_res.scalars().all()
        ]

    if not edges and wf_id:
        e_stmt = select(WorkflowEdge).where(WorkflowEdge.workflow_id == wf_id)
        e_res = await db.execute(e_stmt)
        edges = [
            {
                "source_node_key": e.source_node_key,
                "target_node_key": e.target_node_key
            }
            for e in e_res.scalars().all()
        ]

    waves = compute_dag_waves(nodes, edges)
    ordered_nodes = [n for wave in waves for n in wave] if waves else nodes

    rows = ds_data.get("rows", [])
    headers = ds_data.get("headers", [])

    # Group raw matrix rows into test scenarios using the configured execution strategy and optional selective rows
    grouped_scenarios = group_dataset_into_scenarios(
        headers, 
        rows, 
        strategy=req.strategy, 
        selected_row_indices=req.selected_row_indices
    )

    for sc in grouped_scenarios:
        sc["nodeResults"] = [
            {
                "nodeKey": n["node_key"],
                "nodeLabel": n["label"],
                "nodeType": n["node_type"],
                "status": "PENDING"
            }
            for n in ordered_nodes
        ]

    strat_dict = req.strategy if isinstance(req.strategy, dict) else (req.strategy.model_dump() if hasattr(req.strategy, "model_dump") else {})

    matrix_jobs[job_id] = {
        "job_id": job_id,
        "status": "RUNNING",
        "project_id": req.project_id,
        "environment_id": req.environment_id,
        "workflow_id": wf_id,
        "dataset_id": req.dataset_id or (ds_data.get("id") if ds_data else None),
        "dataset_name": ds_data.get("name", "Test Matrix"),
        "total_scenarios": len(grouped_scenarios),
        "total_rows": len(rows),
        "completed_scenarios": 0,
        "current_scenario_index": 0,
        "current_scenario_title": "",
        "scenario_results": grouped_scenarios,
        "nodes": ordered_nodes,
        "edges": edges,
        "strategy": strat_dict,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "completed_at": None,
        "error": None
    }

    # Persist job state to DB immediately for durable job tracking
    await _save_matrix_job_to_db(matrix_jobs[job_id])

    # Enqueue scenarios into the Distributed Task Queue
    from app.core.queue import TaskQueueEngine
    for sc in grouped_scenarios:
        await TaskQueueEngine.enqueue_task(
            job_id=job_id,
            scenario_index=sc.get("scenarioIndex", 0),
            payload={
                "scenario": sc,
                "waves": waves if waves else [[n] for n in nodes],
                "project_id": req.project_id,
                "environment_id": req.environment_id,
                "workflow_id": wf_id,
                "nodes": ordered_nodes,
                "edges": edges
            }
        )

    stats = await TaskQueueEngine.get_queue_stats()
    has_external_workers = any(not w["worker_id"].startswith("embedded-") for w in stats.get("workers", []))
    print(f"[Matrix] Enqueued {len(grouped_scenarios)} scenario(s) for job {job_id} into distributed task queue.")

    return {
        "job_id": job_id,
        "status": "RUNNING",
        "dataset_name": ds_data.get("name", "Test Matrix"),
        "total_scenarios": len(grouped_scenarios),
        "total_rows": len(rows),
        "execution_mode": "DISTRIBUTED_WORKER" if has_external_workers else "EMBEDDED_WORKER"
    }

@router.get("/matrix-jobs/active")
async def get_active_matrix_job(project_id: Optional[str] = None):
    # 1. Search in-memory
    for job_id, job in reversed(list(matrix_jobs.items())):
        if job.get("status") in ("RUNNING", "INTERRUPTED"):
            if project_id:
                if job.get("project_id") == project_id:
                    return job
            else:
                return job

    # 2. Search database for running or interrupted jobs
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(MatrixExecutionJob).order_by(MatrixExecutionJob.created_at.desc())
            if project_id:
                stmt = stmt.where(MatrixExecutionJob.project_id == project_id)
            stmt = stmt.limit(5)
            res = await session.execute(stmt)
            db_jobs = res.scalars().all()
            for db_job in db_jobs:
                if db_job.status in ("RUNNING", "INTERRUPTED"):
                    return await _load_matrix_job(db_job.id)
    except Exception as e:
        print(f"Error checking active matrix job from DB: {e}")
    return None

@router.get("/projects/{project_id}/matrix-jobs")
async def get_project_matrix_jobs(project_id: str):
    """Returns all recent matrix execution jobs for a project (interrupted, running, completed, failed)."""
    jobs_list = []
    try:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(MatrixExecutionJob)
                .where(MatrixExecutionJob.project_id == project_id)
                .order_by(MatrixExecutionJob.created_at.desc())
                .limit(20)
            )
            res = await session.execute(stmt)
            db_jobs = res.scalars().all()
            for db_job in db_jobs:
                jobs_list.append({
                    "job_id": db_job.id,
                    "id": db_job.id,
                    "status": db_job.status,
                    "project_id": db_job.project_id,
                    "environment_id": db_job.environment_id,
                    "workflow_id": db_job.workflow_id,
                    "dataset_id": db_job.dataset_id,
                    "dataset_name": db_job.dataset_name,
                    "total_scenarios": db_job.total_scenarios,
                    "total_rows": db_job.total_rows,
                    "completed_scenarios": db_job.completed_scenarios or 0,
                    "current_scenario_title": db_job.current_scenario_title,
                    "created_at": db_job.created_at.isoformat() if db_job.created_at else None,
                    "completed_at": db_job.completed_at.isoformat() if db_job.completed_at else None,
                    "error": db_job.error
                })
    except Exception as e:
        print(f"Error fetching project matrix jobs: {e}")
    return {"project_id": project_id, "total": len(jobs_list), "jobs": jobs_list}

@router.get("/matrix-job/{job_id}/scenario/{s_idx}/node/{node_key}/payload")
async def get_matrix_node_payload(job_id: str, s_idx: int, node_key: str):
    cache_key = f"{job_id}_{s_idx}_{node_key}"
    if cache_key in matrix_payload_cache:
        return matrix_payload_cache[cache_key]
    
    # Read-through from DB if not in memory
    job = await _load_matrix_job(job_id)
    if cache_key in matrix_payload_cache:
        return matrix_payload_cache[cache_key]
    if job and "scenario_results" in job and s_idx < len(job["scenario_results"]):
        sc = job["scenario_results"][s_idx]
        for nr in (sc.get("nodeResults") or []):
            if nr.get("nodeKey") == node_key:
                return {
                    "requestPayload": nr.get("requestPayload"),
                    "responsePayload": nr.get("responsePayload"),
                    "extractedVars": nr.get("extractedVars")
                }
    raise HTTPException(status_code=404, detail="Payload not found for this node")

def _sanitize_telemetry_dict(d: Any, max_len: int = 60, depth: int = 0) -> Any:
    if depth > 3:
        return d
    if isinstance(d, dict):
        res = {}
        for k, v in d.items():
            if k == "captured_variables" and isinstance(v, dict):
                res[k] = _sanitize_telemetry_dict(v, max_len=500000, depth=depth + 1)
            elif isinstance(v, str):
                res[k] = (v[:max_len] + "...") if len(v) > max_len else v
            elif isinstance(v, dict):
                res[k] = _sanitize_telemetry_dict(v, max_len, depth + 1)
            elif isinstance(v, list):
                res[k] = [
                    _sanitize_telemetry_dict(item, max_len, depth + 1) if isinstance(item, (dict, list))
                    else ((item[:max_len] + "...") if isinstance(item, str) and len(item) > max_len else item)
                    for item in v[:30]
                ]
            else:
                res[k] = v
        return res
    elif isinstance(d, list):
        return [
            _sanitize_telemetry_dict(item, max_len, depth + 1) if isinstance(item, (dict, list))
            else ((item[:max_len] + "...") if isinstance(item, str) and len(item) > max_len else item)
            for item in d[:30]
        ]
    elif isinstance(d, str):
        return (d[:max_len] + "...") if len(d) > max_len else d
    return d

@router.get("/matrix-job/{job_id}")
async def get_matrix_job_status(job_id: str):
    job = await _load_matrix_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Matrix job not found")
    
    # Live enrichment from execution_runs & execution_steps across background workers
    try:
        job_suffix = job_id[-6:]
        async with AsyncSessionLocal() as session:
            exec_stmt = select(ExecutionRun).where(ExecutionRun.correlation_id.like(f"corr-matrix-{job_suffix}-%"))
            exec_res = await session.execute(exec_stmt)
            runs = exec_res.scalars().all()
            if runs:
                run_map = {}
                for r in runs:
                    try:
                        parts = r.correlation_id.split("-")
                        s_tag = next((p for p in parts if p.startswith("s") and p[1:].isdigit()), None)
                        if s_tag:
                            s_idx = int(s_tag[1:])
                            run_map[s_idx] = r
                    except Exception:
                        pass

                sc_results = job.get("scenario_results") or []
                for sc in sc_results:
                    s_idx = sc.get("scenarioIndex")
                    r_obj = run_map.get(s_idx)
                    if r_obj:
                        if r_obj.status == ExecutionStatus.PASSED:
                            sc["status"] = "SUCCESS"
                        elif r_obj.status == ExecutionStatus.FAILED:
                            sc["status"] = "FAILED"
                        elif r_obj.status == ExecutionStatus.RUNNING:
                            sc["status"] = "RUNNING"
                        
                        steps_stmt = select(ExecutionStep).where(ExecutionStep.execution_id == r_obj.id)
                        steps_res = await session.execute(steps_stmt)
                        steps = steps_res.scalars().all()
                        step_dict = {st.node_key: st for st in steps}
                        
                        node_list = sc.get("nodeResults") or []
                        running_marked = any(n.get("status") == "RUNNING" for n in node_list)
                        for idx, nr in enumerate(node_list):
                            nk = nr.get("nodeKey")
                            if nk in step_dict:
                                st_obj = step_dict[nk]
                                if str(st_obj.status).upper() == "SKIPPED":
                                    nr["status"] = "SKIPPED"
                                    nr["statusCode"] = "SKIPPED"
                                    nr["durationMs"] = 0
                                elif st_obj.status == ExecutionStatus.PASSED:
                                    nr["status"] = "SUCCESS"
                                    nr["durationMs"] = st_obj.duration_ms
                                elif st_obj.status == ExecutionStatus.FAILED:
                                    nr["status"] = "FAILED"
                                    nr["durationMs"] = st_obj.duration_ms
                            else:
                                if sc["status"] == "RUNNING":
                                    if nr.get("status") == "RUNNING":
                                        pass
                                    elif not running_marked and nr.get("status") == "PENDING":
                                        nr["status"] = "RUNNING"
                                        # Also mark all other nodes in the same parallel wave as RUNNING
                                        job_waves = job.get("waves")
                                        if not job_waves and job.get("nodes"):
                                            job_waves = compute_dag_waves(job.get("nodes", []), job.get("edges", []))
                                        if job_waves:
                                            target_wave = next((w for w in job_waves if any(n.get("node_key") == nk for n in w)), None)
                                            if target_wave:
                                                wave_keys = {n.get("node_key") for n in target_wave}
                                                for other_nr in node_list:
                                                    if other_nr.get("nodeKey") in wave_keys and other_nr.get("nodeKey") not in step_dict:
                                                        other_nr["status"] = "RUNNING"
                                        running_marked = True

                completed_count = sum(1 for sc in sc_results if sc.get("status") in ("SUCCESS", "FAILED"))
                job["completed_scenarios"] = completed_count
                total_count = job.get("total_scenarios") or len(sc_results)
                
                # Dynamic job status resolution: preserve INTERRUPTED so user must explicitly click Resume
                if completed_count >= total_count and total_count > 0:
                    any_failed = any(sc.get("status") == "FAILED" for sc in sc_results)
                    job["status"] = "FAILED" if any_failed else "COMPLETED"
                elif job.get("status") != "INTERRUPTED" and any(sc.get("status") == "RUNNING" for sc in sc_results):
                    job["status"] = "RUNNING"
    except Exception as enrich_err:
        print(f"Error enriching matrix job {job_id} live status: {enrich_err}")

    # Return telemetry-only payload to keep size < 5KB instead of 41MB
    telemetry_scenarios = []
    for sc in (job.get("scenario_results") or []):
        telemetry_nodes = []
        for nr in (sc.get("nodeResults") or []):
            raw_ev = nr.get("extractedVars") or {}
            telemetry_nodes.append({
                "nodeKey": nr.get("nodeKey"),
                "nodeLabel": nr.get("nodeLabel"),
                "nodeType": nr.get("nodeType"),
                "status": nr.get("status"),
                "statusCode": nr.get("statusCode"),
                "durationMs": nr.get("durationMs"),
                "extractedVars": _sanitize_telemetry_dict(raw_ev, max_len=60),
                "hasPayload": bool(nr.get("hasPayload") or nr.get("responsePayload") or nr.get("requestPayload")),
                "error": nr.get("error")
            })
        raw_row = sc.get("rowData") or {}
        telemetry_scenarios.append({
            "rowIndex": sc.get("rowIndex"),
            "rowData": _sanitize_telemetry_dict(raw_row, max_len=200),
            "scenarioTitle": sc.get("scenarioTitle"),
            "scenarioIndex": sc.get("scenarioIndex"),
            "status": sc.get("status"),
            "totalDurationMs": sc.get("totalDurationMs"),
            "nodeResults": telemetry_nodes
        })

    return {
        "job_id": job.get("job_id"),
        "status": job.get("status"),
        "project_id": job.get("project_id"),
        "workflow_id": job.get("workflow_id"),
        "dataset_name": job.get("dataset_name"),
        "total_scenarios": job.get("total_scenarios"),
        "total_rows": job.get("total_rows"),
        "completed_scenarios": job.get("completed_scenarios"),
        "current_scenario_index": job.get("current_scenario_index"),
        "current_scenario_title": job.get("current_scenario_title"),
        "scenario_results": telemetry_scenarios,
        "created_at": job.get("created_at"),
        "completed_at": job.get("completed_at"),
        "error": job.get("error")
    }

@router.post("/matrix-job/{job_id}/resume")
async def resume_matrix_job(job_id: str):
    job = await _load_matrix_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Matrix job not found")
    
    if job.get("status") == "COMPLETED":
        return {"job_id": job_id, "status": "COMPLETED", "message": "Job is already completed."}

    scenario_results = job.get("scenario_results", [])
    remaining_scenarios = [
        sc for sc in scenario_results
        if sc.get("status") in ("PENDING", "RUNNING", "FAILED", "INTERRUPTED")
    ]
    if not remaining_scenarios:
        job["status"] = "COMPLETED"
        await _save_matrix_job_to_db(job)
        return {"job_id": job_id, "status": "COMPLETED", "message": "All scenarios already succeeded."}

    for sc in remaining_scenarios:
        sc["status"] = "PENDING"
        for nr in (sc.get("nodeResults") or []):
            nr["status"] = "PENDING"
            nr["statusCode"] = None
            nr["durationMs"] = None
            nr["error"] = None

    job["status"] = "RUNNING"
    job["error"] = None
    job["current_scenario_title"] = f"Resuming {len(remaining_scenarios)} pending/interrupted scenario(s)..."
    await _save_matrix_job_to_db(job)

    nodes = job.get("nodes", [])
    edges = job.get("edges", [])
    waves = compute_dag_waves(nodes, edges)

    # Enqueue scenarios to TaskQueueEngine
    from app.core.queue import TaskQueueEngine
    for sc in remaining_scenarios:
        await TaskQueueEngine.enqueue_task(
            job_id=job_id,
            scenario_index=sc.get("scenarioIndex", 0),
            payload={
                "scenario": sc,
                "waves": waves if waves else [[n] for n in nodes],
                "project_id": job.get("project_id"),
                "environment_id": job.get("environment_id"),
                "workflow_id": job.get("workflow_id"),
                "nodes": nodes,
                "edges": edges
            }
        )

    stats = await TaskQueueEngine.get_queue_stats()
    has_external_workers = any(not w["worker_id"].startswith("embedded-") for w in stats.get("workers", []))
    if not has_external_workers:
        asyncio.create_task(_run_backend_matrix_worker(
            job_id,
            waves if waves else [[n] for n in nodes],
            remaining_scenarios,
            job.get("project_id"),
            job.get("environment_id"),
            job.get("workflow_id"),
            nodes=nodes,
            strategy=job.get("strategy"),
            edges=edges
        ))

    return {
        "job_id": job_id,
        "status": "RUNNING",
        "resumed_scenarios_count": len(remaining_scenarios),
        "total_scenarios": job.get("total_scenarios")
    }

@router.post("/matrix-job/{job_id}/retry-failed")
async def retry_failed_matrix_job(job_id: str):
    job = await _load_matrix_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Matrix job not found")
    
    scenario_results = job.get("scenario_results", [])
    failed_scenarios = [
        sc for sc in scenario_results
        if sc.get("status") == "FAILED"
    ]
    if not failed_scenarios:
        return {"job_id": job_id, "status": job.get("status"), "message": "No failed scenarios found to retry."}

    for sc in failed_scenarios:
        sc["status"] = "PENDING"
        for nr in (sc.get("nodeResults") or []):
            nr["status"] = "PENDING"
            nr["statusCode"] = None
            nr["durationMs"] = None
            nr["error"] = None

    job["completed_scenarios"] = max(0, (job.get("completed_scenarios") or 0) - len(failed_scenarios))
    job["status"] = "RUNNING"
    job["error"] = None
    job["current_scenario_title"] = f"Retrying {len(failed_scenarios)} failed scenario(s)..."
    await _save_matrix_job_to_db(job)

    nodes = job.get("nodes", [])
    edges = job.get("edges", [])
    waves = compute_dag_waves(nodes, edges)

    # Enqueue failed scenarios to TaskQueueEngine
    from app.core.queue import TaskQueueEngine
    for sc in failed_scenarios:
        await TaskQueueEngine.enqueue_task(
            job_id=job_id,
            scenario_index=sc.get("scenarioIndex", 0),
            payload={
                "scenario": sc,
                "waves": waves if waves else [[n] for n in nodes],
                "project_id": job.get("project_id"),
                "environment_id": job.get("environment_id"),
                "workflow_id": job.get("workflow_id"),
                "nodes": nodes,
                "edges": edges
            }
        )

    stats = await TaskQueueEngine.get_queue_stats()
    has_external_workers = any(not w["worker_id"].startswith("embedded-") for w in stats.get("workers", []))
    if not has_external_workers:
        asyncio.create_task(_run_backend_matrix_worker(
            job_id,
            waves if waves else [[n] for n in nodes],
            failed_scenarios,
            job.get("project_id"),
            job.get("environment_id"),
            job.get("workflow_id"),
            nodes=nodes,
            strategy=job.get("strategy"),
            edges=edges
        ))

    return {
        "job_id": job_id,
        "status": "RUNNING",
        "retrying_scenarios_count": len(failed_scenarios),
        "total_scenarios": job.get("total_scenarios")
    }

async def _run_backend_matrix_worker(
    job_id: str,
    waves: List[List[Dict[str, Any]]],
    scenarios: List[Dict[str, Any]],
    project_id: str,
    environment_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    nodes: Optional[List[Dict[str, Any]]] = None,
    strategy: Optional[Union[DatasetExecutionStrategy, Dict[str, Any], str]] = None,
    edges: Optional[List[Dict[str, Any]]] = None
):
    import time
    import datetime
    job = matrix_jobs.get(job_id)
    if not job:
        return

    parallel_limit = 1
    if isinstance(strategy, dict):
        parallel_limit = int(strategy.get("parallel_limit", 1) or 1)
    elif hasattr(strategy, "parallel_limit"):
        parallel_limit = int(getattr(strategy, "parallel_limit", 1) or 1)
    parallel_limit = max(1, parallel_limit)

    sem = asyncio.Semaphore(parallel_limit)

    async def _execute_single_scenario(s_idx: int, scenario: Dict[str, Any]):
        async with sem:
            scenario_title = scenario.get("scenarioTitle") or f"Scenario #{s_idx+1}"
            scenario["status"] = "RUNNING"
            job["current_scenario_title"] = f"Running scenarios in parallel (Active: Scenario #{s_idx+1})"

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
            async with _matrix_db_lock:
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
                    except Exception as db_err:
                        print(f"Error creating execution run in DB: {db_err}")

            step_order_counter = 0

            # Execute wave by wave; all nodes in each wave execute concurrently via asyncio.gather!
            for wave in waves:
                if has_error:
                    break

                # Mark all nodes in current wave as RUNNING simultaneously
                for node in wave:
                    node_key = node.get("node_key")
                    for nr in scenario["nodeResults"]:
                        if nr["nodeKey"] == node_key:
                            nr["status"] = "RUNNING"

                async def _execute_matrix_node(node: Dict[str, Any]):
                    nonlocal step_order_counter, scenario_total_ms, has_error
                    node_key = node.get("node_key")
                    node_label = node.get("label", "")
                    n_type = node.get("node_type", "").upper()
                    n_config = node.get("config") or {}

                    nr = next((r for r in scenario["nodeResults"] if r["nodeKey"] == node_key), None)
                    if not nr:
                        return

                    if node_key in skipped_node_keys:
                        nr["status"] = "SKIPPED"
                        nr["statusCode"] = "SKIPPED"
                        nr["durationMs"] = 0
                        scenario_step_outputs[node_key] = {}
                        if node_label:
                            scenario_step_outputs[node_label] = {}
                        return

                    is_followup_node = "follow" in node_label.lower() or n_config.get("api_type") == "FOLLOWUP" or n_type == "FOLLOWUP_PROMPT"

                    if is_followup_node and len(turns) > 1:
                        last_turn_res = None
                        multi_turn_extracted = {}
                        node_has_err = False

                        for t_idx, turn_data in enumerate(turns):
                            step_order_counter += 1
                            active_session_vars.update(turn_data)

                            start = time.perf_counter()
                            context = ExecutionContext(dataset_vars={"user_id": "3b3dad3b-4d4a-4383-af94-4dbf0dbd2297", **active_session_vars})
                            for step_k, step_v in scenario_step_outputs.items():
                                context.set_step_output(step_k, step_v)

                            try:
                                if n_type == "API_REQUEST":
                                    res = await ApiHandler.execute(n_config, context)
                                elif n_type in ("PROMPT", "FOLLOWUP_PROMPT"):
                                    res = await PromptHandler.execute(n_config, context)
                                else:
                                    res = await ApiHandler.execute(n_config, context)

                                dur_ms = round((time.perf_counter() - start) * 1000.0, 2)
                                scenario_total_ms += dur_ms
                                last_turn_res = res

                                for ext in (n_config.get("extractions") or []):
                                    vn = ext.get("variable_name")
                                    jp = ext.get("json_path")
                                    if vn and jp:
                                        val = JsonExtractor.extract_value(res, jp)
                                        if val is None and isinstance(res, dict) and "response" in res:
                                            val = JsonExtractor.extract_value(res["response"], jp)
                                        if val is not None:
                                            multi_turn_extracted[vn] = val
                                            multi_turn_extracted[f"{vn}_turn_{t_idx+1}"] = val
                                            active_session_vars[vn] = val
                                            active_session_vars[f"{vn}_turn_{t_idx+1}"] = val

                                if run_id:
                                    async with _matrix_db_lock:
                                        async with AsyncSessionLocal() as session:
                                            try:
                                                step_obj = ExecutionStep(
                                                    execution_id=run_id,
                                                    node_key=f"{node_key}_turn_{t_idx+1}",
                                                    node_type=n_type,
                                                    step_order=step_order_counter,
                                                    status=ExecutionStatus.PASSED,
                                                    duration_ms=dur_ms,
                                                    input_data={"turn": t_idx + 1, **turn_data},
                                                    output_data=res.get("response") if isinstance(res, dict) and "response" in res else res,
                                                    started_at=datetime.datetime.now(datetime.timezone.utc),
                                                    completed_at=datetime.datetime.now(datetime.timezone.utc)
                                                )
                                                session.add(step_obj)

                                                trace_obj = TraceEvent(
                                                    execution_id=run_id,
                                                    sequence_number=step_order_counter,
                                                    event_type=TraceEventType.API_REQUEST if n_type == "API_REQUEST" else TraceEventType.TOOL_CALL,
                                                    title=f"Execute {node_label} (Turn #{t_idx+1})",
                                                    duration_ms=dur_ms,
                                                    raw_payload=res.get("response") if isinstance(res, dict) and "response" in res else res,
                                                    normalized_payload={
                                                        "node_label": f"{node_label} (Turn #{t_idx+1})",
                                                        "turn": t_idx + 1,
                                                        "turn_query": turn_data.get("followup") or turn_data.get("message"),
                                                        "extracted": multi_turn_extracted,
                                                        "request": res.get("body") or n_config.get("body")
                                                    },
                                                    status="SUCCESS",
                                                    timestamp=datetime.datetime.now(datetime.timezone.utc)
                                                )
                                                session.add(trace_obj)
                                                await session.commit()
                                            except Exception as t_err:
                                                print(f"Error persisting turn step: {t_err}")

                            except Exception as t_ex:
                                node_has_err = True
                                last_turn_res = {"error": str(t_ex), "status_code": 500}

                        nr["status"] = "SUCCESS" if not node_has_err else "FAILED"
                        nr["statusCode"] = 200 if not node_has_err else 500
                        nr["durationMs"] = scenario_total_ms
                        nr["extractedVars"] = _sanitize_telemetry_dict(multi_turn_extracted, max_len=60)

                        resp_content = last_turn_res.get("response") if (isinstance(last_turn_res, dict) and "response" in last_turn_res) else last_turn_res
                        cache_key = f"{job_id}_{s_idx}_{node_key}"
                        matrix_payload_cache[cache_key] = {
                            "requestPayload": active_session_vars,
                            "responsePayload": resp_content,
                            "extractedVars": multi_turn_extracted,
                            "error": last_turn_res.get("error") if isinstance(last_turn_res, dict) else None
                        }
                        nr["hasPayload"] = True
                        nr["requestPayload"] = None
                        nr["responsePayload"] = None

                        scenario_step_outputs[node_key] = last_turn_res
                        if node_label:
                            scenario_step_outputs[node_label] = last_turn_res
                        return

                    # Standard node execution
                    step_order_counter += 1
                    start = time.perf_counter()
                    context = ExecutionContext(dataset_vars={"user_id": "3b3dad3b-4d4a-4383-af94-4dbf0dbd2297", **active_session_vars})
                    for step_k, step_v in scenario_step_outputs.items():
                        context.set_step_output(step_k, step_v)

                    try:
                        if n_type == "API_REQUEST":
                            res = await ApiHandler.execute(n_config, context)
                        elif n_type == "POLLING":
                            res = await PollingHandler.execute(n_config, context)
                        elif n_type in ("PROMPT", "FOLLOWUP_PROMPT"):
                            res = await PromptHandler.execute(n_config, context)
                        elif n_type == "AGENT":
                            res = await AgentHandler.execute(n_config, context, agent_version_tag="v1.0.0")
                        elif n_type == "EXTRACT_VARIABLE":
                            res = await ExtractHandler.execute(n_config, context)
                        elif n_type == "CAPTURE_RESULT":
                            res = await CaptureHandler.execute(n_config, context)
                        elif n_type == "CHAT_URL_CREATOR":
                            res = await ChatUrlHandler.execute(n_config, context)
                        elif n_type == "CONDITION":
                            var_name = n_config.get("condition_variable") or "file_id"
                            var_clean = var_name.replace("{{", "").replace("}}", "").strip()
                            actual_val = active_session_vars.get(var_clean)
                            if actual_val is None:
                                actual_val = active_session_vars.get(var_name, "")
                            actual_str = str(actual_val if actual_val is not None else "").strip()

                            op = n_config.get("operator", "is_not_empty")
                            expected = str(n_config.get("condition_value", "")).strip()

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

                        # Extract variables
                        extracted = {}
                        all_exts = n_config.get("extractions") or []
                        for ext in all_exts:
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
                        if n_type == "CONDITION":
                            nr["statusCode"] = "TRUE" if res.get("condition_met") else "FALSE"
                            extracted["condition"] = "MET" if res.get("condition_met") else "FALSE"
                        else:
                            nr["statusCode"] = status_code
                        nr["durationMs"] = dur_ms
                        nr["extractedVars"] = _sanitize_telemetry_dict(extracted, max_len=60)
                        if n_type == "CAPTURE_RESULT" and isinstance(res, dict) and "captured_variables" in res and res["captured_variables"]:
                            extracted_res = res["captured_variables"]
                        elif n_type == "CHAT_URL_CREATOR" and isinstance(res, dict):
                            extracted_res = {"chat_url": res.get("chat_url"), "url": res.get("url"), "base_url": res.get("base_url"), "query": res.get("resolved_query")}
                        elif isinstance(res, dict) and "response" in res and res["response"] is not None:
                            extracted_res = res["response"]
                        elif isinstance(res, dict) and "captured_variables" in res and res["captured_variables"]:
                            extracted_res = res["captured_variables"]
                        else:
                            extracted_res = res

                        req_payload = res.get("body") or n_config.get("body")
                        err_val = res.get("error") if isinstance(res, dict) else None

                        # Cache full payloads separately for on-demand inspection
                        cache_key = f"{job_id}_{s_idx}_{node_key}"
                        matrix_payload_cache[cache_key] = {
                            "requestPayload": req_payload,
                            "responsePayload": extracted_res,
                            "extractedVars": extracted,
                            "error": err_val
                        }
                        if len(matrix_payload_cache) > 3000:
                            for ok in list(matrix_payload_cache.keys())[:500]:
                                matrix_payload_cache.pop(ok, None)

                        nr["hasPayload"] = True
                        nr["requestPayload"] = None
                        nr["responsePayload"] = None
                        nr["error"] = err_val

                        # Record Step & Trace in DB
                        if run_id:
                            async with _matrix_db_lock:
                                async with AsyncSessionLocal() as session:
                                    try:
                                        step_resp = res.get("response") if isinstance(res, dict) and "response" in res else res
                                        db_output = (step_resp[:3000] + "... [truncated]") if isinstance(step_resp, str) and len(step_resp) > 3000 else step_resp
                                        db_input = res.get("body") or n_config.get("body") or _sanitize_telemetry_dict(active_session_vars, max_len=100)

                                        step_obj = ExecutionStep(
                                            execution_id=run_id,
                                            node_key=node_key,
                                            node_type=n_type,
                                            step_order=step_order_counter,
                                            status=ExecutionStatus.PASSED if is_node_success else ExecutionStatus.FAILED,
                                            duration_ms=dur_ms,
                                            input_data=db_input,
                                            output_data=db_output,
                                            error_message=res.get("error") if isinstance(res, dict) else None,
                                            started_at=datetime.datetime.now(datetime.timezone.utc),
                                            completed_at=datetime.datetime.now(datetime.timezone.utc)
                                        )
                                        session.add(step_obj)

                                        trace_obj = TraceEvent(
                                            execution_id=run_id,
                                            sequence_number=step_order_counter,
                                            event_type=TraceEventType.API_REQUEST if n_type == "API_REQUEST" else TraceEventType.TOOL_CALL,
                                            title=f"Execute {node_label or n_type}",
                                            duration_ms=dur_ms,
                                            raw_payload=db_output,
                                            normalized_payload={
                                                "node_label": node_label,
                                                "status_code": status_code,
                                                "extracted": _sanitize_telemetry_dict(extracted, max_len=80),
                                                "request": res.get("body") or n_config.get("body")
                                            },
                                            status="SUCCESS" if is_node_success else "FAILED",
                                            timestamp=datetime.datetime.now(datetime.timezone.utc)
                                        )
                                        session.add(trace_obj)
                                        await session.commit()
                                    except Exception as step_err:
                                        print(f"Error persisting step to DB: {step_err}")

                    except Exception as ex:
                        has_error = True
                        nr["status"] = "FAILED"
                        nr["statusCode"] = 500
                        nr["durationMs"] = round((time.perf_counter() - start) * 1000.0, 2)
                        nr["error"] = str(ex)

                        if run_id:
                            async with _matrix_db_lock:
                                async with AsyncSessionLocal() as session:
                                    try:
                                        step_obj = ExecutionStep(
                                            execution_id=run_id,
                                            node_key=node_key,
                                            node_type=n_type,
                                            step_order=step_order_counter,
                                            status=ExecutionStatus.FAILED,
                                            duration_ms=nr["durationMs"],
                                            input_data=_sanitize_telemetry_dict(active_session_vars, max_len=100),
                                            error_message=str(ex),
                                            started_at=datetime.datetime.now(datetime.timezone.utc),
                                            completed_at=datetime.datetime.now(datetime.timezone.utc)
                                        )
                                        session.add(step_obj)
                                        await session.commit()
                                    except Exception:
                                        pass

                # Concurrently execute all nodes in this wave in parallel
                await asyncio.gather(*[_execute_matrix_node(n) for n in wave])

            scenario["status"] = "FAILED" if has_error else "SUCCESS"
            scenario["totalDurationMs"] = scenario_total_ms
            job["completed_scenarios"] = (job.get("completed_scenarios") or 0) + 1
            job["current_scenario_title"] = f"Finished {job['completed_scenarios']}/{len(scenarios)}: {scenario_title}"
            await _save_matrix_job_to_db(job)

            # Finalize ExecutionRun in DB for this Scenario
            if run_id:
                async with _matrix_db_lock:
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
                                run_record.runtime_context = {
                                    "scenario": scenario_title,
                                    "scenario_index": scenario.get("scenarioIndex", s_idx + 1),
                                    "total_turns": len(turns),
                                    "total_rows": len(scenario.get("rows", [])),
                                    "turns": turns,
                                    "dataset_vars": _sanitize_telemetry_dict(active_session_vars, max_len=100),
                                    "captured_variables": _sanitize_telemetry_dict(scenario_captured_vars, max_len=500000),
                                    "completed_nodes": len(nodes or [n for wave in waves for n in wave])
                                }
                                await session.commit()
                        except Exception as fin_err:
                            print(f"Error finalizing execution run: {fin_err}")

    try:
        if parallel_limit > 1:
            job["current_scenario_title"] = f"Executing {len(scenarios)} scenarios concurrently ({parallel_limit} parallel workers)..."
        else:
            job["current_scenario_title"] = f"Executing {len(scenarios)} scenarios sequentially (1 worker)..."
        await asyncio.gather(*[_execute_single_scenario(s_idx, scenario) for s_idx, scenario in enumerate(scenarios)])
        any_failed = any(sc.get("status") == "FAILED" for sc in job.get("scenario_results", []))
        job["status"] = "FAILED" if any_failed else "COMPLETED"
        job["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        await _save_matrix_job_to_db(job)
    except Exception as ex:
        job["status"] = "FAILED"
        job["error"] = str(ex)
        await _save_matrix_job_to_db(job)


@router.get("/{execution_id}", response_model=ExecutionRunResponse)
async def get_execution(execution_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ExecutionRun).where(ExecutionRun.id == execution_id)
    res = await db.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Execution run not found")
    return await _format_execution_response(run, db)

async def _format_execution_response(run: ExecutionRun, db: AsyncSession, include_details: bool = True) -> ExecutionRunResponse:
    steps = []
    traces = []
    hitl_tasks = []

    if include_details:
        # Steps
        steps_stmt = select(ExecutionStep).where(ExecutionStep.execution_id == run.id).order_by(ExecutionStep.step_order)
        steps_res = await db.execute(steps_stmt)
        for s in steps_res.scalars().all():
            if isinstance(s.output_data, str) and len(s.output_data) > 2000:
                s.output_data = s.output_data[:2000] + f"... [truncated {len(s.output_data)} chars]"
            elif isinstance(s.output_data, dict):
                s.output_data = _sanitize_telemetry_dict(s.output_data, max_len=100)
            if isinstance(s.input_data, str) and len(s.input_data) > 2000:
                s.input_data = s.input_data[:2000] + f"... [truncated {len(s.input_data)} chars]"
            elif isinstance(s.input_data, dict):
                s.input_data = _sanitize_telemetry_dict(s.input_data, max_len=100)
            steps.append(ExecutionStepResponse.model_validate(s))

        # Traces
        trace_stmt = select(TraceEvent).where(TraceEvent.execution_id == run.id).order_by(TraceEvent.sequence_number)
        trace_res = await db.execute(trace_stmt)
        for t in trace_res.scalars().all():
            if isinstance(t.raw_payload, str) and len(t.raw_payload) > 2000:
                t.raw_payload = t.raw_payload[:2000] + f"... [truncated {len(t.raw_payload)} chars]"
            elif isinstance(t.raw_payload, dict):
                t.raw_payload = _sanitize_telemetry_dict(t.raw_payload, max_len=100)
            if isinstance(t.normalized_payload, dict):
                t.normalized_payload = _sanitize_telemetry_dict(t.normalized_payload, max_len=100)
            traces.append(TraceEventResponse.model_validate(t))

        # HITL tasks
        hitl_stmt = select(HITLTask).where(HITLTask.execution_id == run.id)
        hitl_res = await db.execute(hitl_stmt)
        hitl_tasks = [HITLTaskResponse.model_validate(h) for h in hitl_res.scalars().all()]

    return ExecutionRunResponse(
        id=run.id,
        correlation_id=run.correlation_id,
        project_id=run.project_id,
        environment_id=run.environment_id,
        agent_version_id=run.agent_version_id,
        test_case_id=run.test_case_id,
        workflow_id=run.workflow_id,
        status=run.status,
        total_duration_ms=run.total_duration_ms or 0.0,
        input_tokens=run.input_tokens or 0,
        output_tokens=run.output_tokens or 0,
        total_tokens=run.total_tokens or 0,
        estimated_cost_usd=run.estimated_cost_usd or 0.0,
        quality_score=run.quality_score,
        safety_score=run.safety_score,
        is_regression=run.is_regression or "false",
        error_message=run.error_message,
        runtime_context=_sanitize_telemetry_dict(run.runtime_context or {}, max_len=10000),
        created_at=run.created_at,
        started_at=run.started_at,
        completed_at=run.completed_at,
        steps=steps,
        trace_events=traces,
        hitl_tasks=hitl_tasks
    )

@router.post("/export-excel")
async def export_executions_excel(
    req: ExcelExportRequest,
    db: AsyncSession = Depends(get_db)
):
    project_name = "AI Agent QA Project"
    template_config = req.template or {}

    # If project_id provided, fetch project and template if not provided
    if req.project_id:
        proj_stmt = select(Project).where(Project.id == req.project_id)
        proj_res = await db.execute(proj_stmt)
        proj = proj_res.scalar_one_or_none()
        if proj:
            project_name = proj.name
            if not req.template and proj.report_template:
                template_config = proj.report_template

    # Fetch executions
    if req.execution_ids and len(req.execution_ids) > 0:
        stmt = select(ExecutionRun).where(ExecutionRun.id.in_(req.execution_ids)).order_by(ExecutionRun.created_at.asc())
    elif req.correlation_id:
        stmt = select(ExecutionRun).where(ExecutionRun.correlation_id.like(f"%{req.correlation_id}%")).order_by(ExecutionRun.created_at.asc())
    elif req.project_id:
        stmt = select(ExecutionRun).where(ExecutionRun.project_id == req.project_id).order_by(ExecutionRun.created_at.asc())
    else:
        stmt = select(ExecutionRun).order_by(ExecutionRun.created_at.asc()).limit(200)

    res = await db.execute(stmt)
    executions = res.scalars().all()

    # Load steps and trace events for each execution
    full_executions = []
    for run in executions:
        formatted = await _format_execution_response(run, db)
        full_executions.append(formatted)

    # Sort in ascending scenario index order
    full_executions.sort(key=lambda x: (
        (x.runtime_context or {}).get("scenario_index", 9999)
        if isinstance(x.runtime_context, dict) else 9999
    ))

    excel_buffer = ExcelReportGenerator.generate_report(
        project_name=project_name,
        executions=full_executions,
        template_config=template_config
    )

    clean_slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', project_name)
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"QA_Report_{clean_slug}_{timestamp}.xlsx"

    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


class SwarmTraceIngestRequest(BaseModel):
    payload: Optional[Dict[str, Any]] = None
    swarm_trace: Optional[List[Dict[str, Any]]] = None
    contract_schema: Optional[Dict[str, Any]] = None
    max_turns: Optional[int] = 8

    class Config:
        extra = "allow"


@router.post("/{execution_id}/swarm-trace")
async def ingest_swarm_trace(
    execution_id: str,
    req: SwarmTraceIngestRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Ingests multi-agent swarm traces (LangGraph, CrewAI, AutoGen, OpenAI Swarm, or Black-box JSON),
    normalizes them, runs contract schema validations, and detects circular deadlocks.
    """
    from app.core.swarm_engine import SwarmTraceNormalizer, SwarmEngine
    raw_dict = req.model_dump() if hasattr(req, "model_dump") else req.dict()
    normalized_msgs = SwarmTraceNormalizer.normalize_trace(raw_dict.get("payload") or raw_dict)
    if not normalized_msgs:
        raise HTTPException(status_code=400, detail="No valid swarm messages could be extracted from payload")

    results = []
    has_deadlock = False
    deadlock_msg = None

    for idx, item in enumerate(normalized_msgs):
        res = await SwarmEngine.record_swarm_message(
            execution_id=execution_id,
            sender_agent=item["sender_agent"],
            recipient_agent=item["recipient_agent"],
            content=item["content"],
            step_order=idx + 1,
            turn_index=item.get("turn_index", idx + 1),
            message_type=item.get("message_type", "TASK_HANDOFF"),
            structured_payload=item.get("structured_payload"),
            tools_invoked=item.get("tools_invoked"),
            contract_schema=req.contract_schema,
            max_turns_per_pair=req.max_turns or 8,
            latency_ms=item.get("latency_ms", 0.0),
            tokens=item.get("tokens", 0)
        )
        results.append(res)
        if res.get("is_deadlock"):
            has_deadlock = True
            deadlock_msg = res.get("deadlock_reason")
            break

    return {
        "execution_id": execution_id,
        "messages_ingested": len(results),
        "deadlock_detected": has_deadlock,
        "deadlock_reason": deadlock_msg,
        "results": results
    }


@router.get("/{execution_id}/swarm-messages")
async def get_execution_swarm_messages(execution_id: str):
    """
    Retrieves all inter-agent swarm messages, hand-off contracts, and loop telemetry for an execution.
    """
    from app.core.swarm_engine import SwarmEngine
    messages = await SwarmEngine.get_swarm_messages(execution_id)
    return {
        "execution_id": execution_id,
        "total_messages": len(messages),
        "messages": messages
    }


# =========================================================================
# Matrix Job Cancellation / Deletion (CRUD)
# =========================================================================
@router.post("/matrix-job/{job_id}/cancel")
@router.delete("/matrix-job/{job_id}")
async def cancel_matrix_job(job_id: str):
    """Cancels and purges an interrupted or in-progress matrix execution job and all its queue tasks."""
    if job_id in matrix_jobs:
        del matrix_jobs[job_id]
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(MatrixExecutionJob).where(MatrixExecutionJob.id == job_id)
            res = await session.execute(stmt)
            db_job = res.scalar_one_or_none()
            if db_job:
                db_job.status = "CANCELLED"
                db_job.error = "Cancelled by user."
            
            # Cancel all tasks belonging to this job in the queue
            await session.execute(
                update(QueueTask)
                .where(
                    QueueTask.job_id == job_id,
                    QueueTask.status.in_(["QUEUED", "RUNNING", "CLAIMED", "INTERRUPTED"])
                )
                .values(status="CANCELLED")
            )
            await session.commit()
    except Exception as e:
        print(f"Error cancelling matrix job: {e}")
    return {"job_id": job_id, "status": "CANCELLED"}


# =========================================================================
# Project-Isolated Recoverable Async Operations (CRUD)
# =========================================================================
@router.get("/projects/{project_id}/async-operations")
async def get_project_async_operations(project_id: str):
    from app.core.async_ops import AsyncOperationManager
    operations = await AsyncOperationManager.get_project_operations(project_id)
    return {
        "project_id": project_id,
        "total": len(operations),
        "operations": operations
    }


@router.delete("/async-operations/{operation_id}")
async def delete_async_operation(operation_id: str):
    from app.core.async_ops import AsyncOperationManager
    success = await AsyncOperationManager.delete_operation(operation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Operation not found")
    return {"status": "DELETED", "id": operation_id}


@router.post("/projects/{project_id}/async-operations/clear")
async def clear_project_async_operations(project_id: str):
    from app.core.async_ops import AsyncOperationManager
    count = await AsyncOperationManager.clear_project_operations(project_id)
    return {"status": "CLEARED", "project_id": project_id, "deleted_count": count}


# =========================================================================
# Project-Isolated Multi-Agent Swarm Contracts & Telemetry (CRUD)
# =========================================================================
class SwarmContractCreateRequest(BaseModel):
    name: str
    sender_agent: str
    recipient_agent: str
    contract_schema: Dict[str, Any]
    max_turns: Optional[int] = 8
    is_active: Optional[bool] = True


class SwarmContractUpdateRequest(BaseModel):
    name: Optional[str] = None
    sender_agent: Optional[str] = None
    recipient_agent: Optional[str] = None
    contract_schema: Optional[Dict[str, Any]] = None
    max_turns: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/projects/{project_id}/swarm-contracts")
async def get_project_swarm_contracts(project_id: str):
    from app.core.swarm_engine import SwarmEngine
    contracts = await SwarmEngine.get_project_contracts(project_id)
    return {
        "project_id": project_id,
        "total": len(contracts),
        "contracts": contracts
    }


@router.post("/projects/{project_id}/swarm-contracts")
async def create_project_swarm_contract(project_id: str, req: SwarmContractCreateRequest):
    from app.core.swarm_engine import SwarmEngine
    created = await SwarmEngine.create_contract(
        project_id=project_id,
        name=req.name,
        sender_agent=req.sender_agent,
        recipient_agent=req.recipient_agent,
        contract_schema=req.contract_schema,
        max_turns=req.max_turns or 8,
        is_active=req.is_active if req.is_active is not None else True
    )
    return created


@router.put("/swarm-contracts/{contract_id}")
async def update_project_swarm_contract(contract_id: str, req: SwarmContractUpdateRequest):
    from app.core.swarm_engine import SwarmEngine
    data = req.model_dump(exclude_unset=True) if hasattr(req, "model_dump") else req.dict(exclude_unset=True)
    updated = await SwarmEngine.update_contract(contract_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Contract not found")
    return updated


@router.delete("/swarm-contracts/{contract_id}")
async def delete_project_swarm_contract(contract_id: str):
    from app.core.swarm_engine import SwarmEngine
    success = await SwarmEngine.delete_contract(contract_id)
    if not success:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"status": "DELETED", "id": contract_id}


@router.get("/projects/{project_id}/swarm-telemetry")
async def get_project_swarm_telemetry(project_id: str):
    from app.core.swarm_engine import SwarmEngine
    messages = await SwarmEngine.get_project_swarm_messages(project_id)
    contracts = await SwarmEngine.get_project_contracts(project_id)

    violations_count = sum(1 for m in messages if m.get("contract_status") == "FAILED")
    deadlocks_count = sum(1 for m in messages if m.get("is_loop_suspect") == "true")

    return {
        "project_id": project_id,
        "total_messages": len(messages),
        "total_contracts": len(contracts),
        "violations_count": violations_count,
        "deadlocks_prevented": deadlocks_count,
        "recent_messages": messages[:50],
        "contracts": contracts
    }


@router.delete("/projects/{project_id}/swarm-messages")
async def clear_project_swarm_messages(project_id: str):
    from app.core.swarm_engine import SwarmEngine
    count = await SwarmEngine.clear_project_swarm_messages(project_id)
    return {"status": "CLEARED", "project_id": project_id, "deleted_count": count}



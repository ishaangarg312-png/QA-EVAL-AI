import time
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.domain.types import NodeType, ExecutionStatus, TraceEventType, EvaluatorType, EvaluationVerdict
from app.domain.context import ExecutionContext, VariableInterpolator, JsonExtractor
from app.core.security import mask_secret
from app.execution.handlers.prompt_handler import PromptHandler
from app.execution.handlers.agent_handler import AgentHandler
from app.execution.handlers.api_handler import ApiHandler
from app.execution.handlers.extract_handler import ExtractHandler
from app.execution.handlers.capture_handler import CaptureHandler
from app.execution.handlers.hitl_handler import HitlHandler
from app.execution.handlers.email_handler import EmailHandler
from app.execution.handlers.polling_handler import PollingHandler
from app.execution.handlers.chat_url_handler import ChatUrlHandler

from app.evaluation.deterministic import DeterministicEvaluator
from app.evaluation.semantic import SemanticEvaluator
from app.evaluation.llm_judge import LLMJudgeEvaluator
from app.evaluation.trace_evaluator import TraceTrajectoryEvaluator
from app.evaluation.rca_engine import RCAEngine

from app.models.execution import ExecutionRun, ExecutionStep, TraceEvent, HITLTask
from app.models.evaluation import EvaluationResult, RCAAnalysis
from app.models.workflow import Workflow, WorkflowNode, WorkflowEdge
from app.models.agent import AgentVersion
from app.models.test_case import TestCase

class ExecutionEngine:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm_judge = LLMJudgeEvaluator()
        self.rca_engine = RCAEngine()

    async def execute_run(
        self,
        execution_id: str,
        initial_context: Optional[Dict[str, Any]] = None,
        agent_version_tag: Optional[str] = "v1.0.0"
    ) -> ExecutionRun:
        # Load execution record
        stmt = select(ExecutionRun).where(ExecutionRun.id == execution_id)
        res = await self.db.execute(stmt)
        run = res.scalar_one_or_none()
        if not run:
            raise ValueError(f"Execution run {execution_id} not found")

        # Load workflow or construct from test case
        workflow = None
        if run.workflow_id:
            w_stmt = select(Workflow).where(Workflow.id == run.workflow_id)
            w_res = await self.db.execute(w_stmt)
            workflow = w_res.scalar_one_or_none()

        # Load agent version if available
        endpoint_url = None
        if run.agent_version_id:
            av_stmt = select(AgentVersion).where(AgentVersion.id == run.agent_version_id)
            av_res = await self.db.execute(av_stmt)
            av = av_res.scalar_one_or_none()
            if av:
                agent_version_tag = av.version_tag
                endpoint_url = av.endpoint_url

        run.status = ExecutionStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        await self.db.commit()

        start_time = time.perf_counter()
        context = ExecutionContext(
            env_vars=initial_context or {},
            dataset_vars={"origin": "Delhi (DEL)", "destination": "Dubai (DXB)", "travel_date": "Tomorrow", "traveller_name": "Sarah Jenkins", "traveller_email": "sarah.jenkins@acmecorp.com"},
            secrets={"API_KEY": "sk-travel-secret-key-9941"}
        )

        trace_events_list: List[Dict[str, Any]] = []
        seq_num = 1
        total_tokens = 0
        in_tokens = 0
        out_tokens = 0
        execution_failed = False
        error_msg = None

        # Determine node execution sequence and DAG parallel branches
        nodes_to_run: List[WorkflowNode] = []
        edges_to_run: List[WorkflowEdge] = []

        if workflow:
            n_stmt = select(WorkflowNode).where(WorkflowNode.workflow_id == workflow.id)
            n_res = await self.db.execute(n_stmt)
            nodes_to_run = list(n_res.scalars().all())

            e_stmt = select(WorkflowEdge).where(WorkflowEdge.workflow_id == workflow.id)
            e_res = await self.db.execute(e_stmt)
            edges_to_run = list(e_res.scalars().all())

        if not nodes_to_run:
            # Default Canonical Travel AI Agent Flow (11 Steps)
            nodes_to_run = [
                WorkflowNode(node_key="node-prompt-1", node_type=NodeType.PROMPT, label="Initial Prompt", position_x=50, position_y=100, config={"prompt_text": "Book a flight from {{origin}} to {{destination}} for {{travel_date}}."}),
                WorkflowNode(node_key="node-agent-1", node_type=NodeType.AGENT, label="Travel Agent", position_x=280, position_y=100, config={}),
                WorkflowNode(node_key="node-api-search", node_type=NodeType.API_REQUEST, label="Flight Search API", position_x=510, position_y=100, config={"url": "https://api.travelservice.internal/v1/flights/search", "method": "GET"}),
                WorkflowNode(node_key="node-extract-1", node_type=NodeType.EXTRACT_VARIABLE, label="Extract Flight ID", position_x=740, position_y=100, config={"extractions": [{"variable_name": "selected_flight_id", "json_path": "flights[0].id"}]}),
                WorkflowNode(node_key="node-prompt-2", node_type=NodeType.FOLLOWUP_PROMPT, label="Follow-up Prompt", position_x=970, position_y=100, config={"prompt_text": "Select the cheapest option and proceed with booking."}),
                WorkflowNode(node_key="node-agent-2", node_type=NodeType.AGENT, label="Travel Agent Booking", position_x=1200, position_y=100, config={}),
                WorkflowNode(node_key="node-api-booking", node_type=NodeType.API_REQUEST, label="Create Booking API", position_x=1430, position_y=100, config={"url": "https://api.travelservice.internal/v1/bookings/create", "method": "POST"}),
                WorkflowNode(node_key="node-extract-2", node_type=NodeType.EXTRACT_VARIABLE, label="Extract Booking ID", position_x=1660, position_y=100, config={"extractions": [{"variable_name": "booking_id", "json_path": "booking_id"}]}),
                WorkflowNode(node_key="node-hitl-1", node_type=NodeType.HUMAN_APPROVAL, label="Human Approval Gate", position_x=1890, position_y=100, config={"task_type": "APPROVAL", "prompt_message": "Approve $340 flight booking for Sarah Jenkins."}),
                WorkflowNode(node_key="node-email-1", node_type=NodeType.OUTLOOK, label="Send Confirmation Email", position_x=2120, position_y=100, config={"action": "SEND_AND_VERIFY", "recipient": "{{traveller_email}}", "subject": "Booking Confirmation - {{booking_id}}"}),
                WorkflowNode(node_key="node-agent-3", node_type=NodeType.AGENT, label="Final Agent Response", position_x=2350, position_y=100, config={"prompt_text": "Booking confirmed for {{booking_id}}."}),
            ]

        # Build DAG Execution Waves (grouping nodes with same in-degree / x-coordinate for parallel execution)
        node_map = {n.node_key: n for n in nodes_to_run}
        
        # If edges exist, build in-degree dependency graph; otherwise group by approximate position_x
        in_degrees = {k: 0 for k in node_map}
        adj_list: Dict[str, List[str]] = {k: [] for k in node_map}
        for edge in edges_to_run:
            if edge.source_node_key in adj_list and edge.target_node_key in in_degrees:
                adj_list[edge.source_node_key].append(edge.target_node_key)
                in_degrees[edge.target_node_key] += 1

        # Determine topological waves
        execution_waves: List[List[WorkflowNode]] = []
        if edges_to_run:
            # Topological sort with levels
            zero_in = [k for k, deg in in_degrees.items() if deg == 0]
            remaining_degrees = dict(in_degrees)
            while zero_in:
                current_wave = [node_map[k] for k in zero_in]
                execution_waves.append(current_wave)
                next_zero = []
                for k in zero_in:
                    for neighbor in adj_list.get(k, []):
                        remaining_degrees[neighbor] -= 1
                        if remaining_degrees[neighbor] == 0:
                            next_zero.append(neighbor)
                zero_in = next_zero
        else:
            # Group nodes with close position_x (e.g. parallel vertical stack) into waves
            sorted_nodes = sorted(nodes_to_run, key=lambda n: n.position_x)
            current_wave: List[WorkflowNode] = []
            curr_x = None
            for n in sorted_nodes:
                if curr_x is None or abs(n.position_x - curr_x) < 80:
                    current_wave.append(n)
                    curr_x = n.position_x
                else:
                    execution_waves.append(current_wave)
                    current_wave = [n]
                    curr_x = n.position_x
            if current_wave:
                execution_waves.append(current_wave)

        step_order = 1
        for wave in execution_waves:
            # 1. Helper to run handler logic concurrently
            async def _execute_handler_task(node_item: WorkflowNode):
                if isinstance(node_item, dict):
                    n_key = node_item.get("key", node_item.get("node_key"))
                    n_type = node_item.get("type", node_item.get("node_type"))
                    n_label = node_item.get("label", str(n_type))
                    n_config = node_item.get("config") or {}
                else:
                    n_key = node_item.node_key
                    n_type = node_item.node_type
                    n_label = node_item.label
                    n_config = node_item.config or {}

                context.runtime_state["execution_id"] = run.id
                context.runtime_state["node_key"] = n_key

                try:
                    if n_type in (NodeType.PROMPT, NodeType.FOLLOWUP_PROMPT):
                        out = await PromptHandler.execute(n_config, context)
                        context.set_variable("last_prompt", out["interpolated_prompt"])
                        ev_type = TraceEventType.PROMPT
                        title = f"Prompt: {n_label}"
                        norm_payload = {"prompt": out["interpolated_prompt"]}

                    elif n_type == NodeType.AGENT:
                        out = await AgentHandler.execute(n_config, context, agent_version_tag, endpoint_url)
                        ev_type = TraceEventType.AGENT_RESPONSE
                        title = f"Agent: {out.get('model', 'travel-agent')}"
                        norm_payload = {
                            "response": out["response_text"],
                            "tool_calls": out["tool_calls"],
                            "tokens": out["total_tokens"]
                        }

                    elif n_type == NodeType.API_REQUEST:
                        out = await ApiHandler.execute(n_config, context)
                        ev_type = TraceEventType.API_RESPONSE
                        title = n_label if n_label and n_label != "API_REQUEST" else f"API: {out.get('method', 'POST')}"
                        norm_payload = {
                            "status_code": out["status_code"],
                            "response": out["response"],
                            "url": out["url"]
                        }

                    elif n_type == NodeType.POLLING:
                        out = await PollingHandler.execute(n_config, context)
                        ev_type = TraceEventType.API_RESPONSE
                        title = f"Polling: until '{out.get('status_key')}' == '{out.get('target_status')}'"
                        norm_payload = {
                            "status_key": out.get("status_key"),
                            "target_status": out.get("target_status"),
                            "final_status": out.get("final_status"),
                            "attempts": out.get("attempts"),
                            "matched": out.get("matched", False),
                            "response": out.get("response"),
                            "url": out.get("url")
                        }

                    elif n_type == NodeType.EXTRACT_VARIABLE:
                        out = await ExtractHandler.execute(n_config, context)
                        ev_type = TraceEventType.VARIABLE_EXTRACT
                        title = f"Variable Extract: {list(out['extractions'].keys())}"
                        norm_payload = out["extractions"]

                    elif n_type == NodeType.CAPTURE_RESULT:
                        out = await CaptureHandler.execute(n_config, context)
                        ev_type = TraceEventType.RESULT_CAPTURE
                        cap_vars = list(out.get("captured_variables", {}).keys())
                        title = f"Capture Result: {cap_vars if cap_vars else 'All Outputs'}"
                        norm_payload = {
                            "captured_variables": out.get("captured_variables", {}),
                            "rules_executed": out.get("rules_execution", []),
                            "source_mode": out.get("source_mode")
                        }

                    elif n_type == NodeType.CHAT_URL_CREATOR:
                        out = await ChatUrlHandler.execute(n_config, context)
                        ev_type = TraceEventType.TOOL_CALL
                        title = f"Chat URL: {out.get('chat_url', '')}"
                        norm_payload = {
                            "chat_url": out.get("chat_url"),
                            "url": out.get("url"),
                            "base_url": out.get("base_url"),
                            "query": out.get("resolved_query"),
                            "captured_variables": out.get("captured_variables", {})
                        }

                    elif n_type in (NodeType.HUMAN_APPROVAL, NodeType.HUMAN_INPUT):
                        out = await HitlHandler.execute(n_config, context, auto_approve_test=True)
                        ev_type = TraceEventType.HUMAN_INTERACTION
                        title = f"Human Approval: {out.get('comments', 'Approved')}"
                        norm_payload = {"approved": out["approved"], "comments": out["comments"]}

                    elif n_type in (NodeType.GMAIL, NodeType.OUTLOOK):
                        out = await EmailHandler.execute(n_config, context)
                        ev_type = TraceEventType.EMAIL_RECEIVED
                        title = f"Email: {out['subject']}"
                        norm_payload = out

                    else:
                        out = {"status": "SKIPPED", "duration_ms": 1.0}
                        ev_type = TraceEventType.PROMPT
                        title = n_label
                        norm_payload = out

                    return {
                        "failed": False,
                        "node_key": n_key,
                        "node_type": str(n_type),
                        "config": n_config,
                        "out": out,
                        "ev_type": ev_type,
                        "title": title,
                        "norm_payload": norm_payload,
                        "in_tokens": out.get("input_tokens", 0),
                        "out_tokens": out.get("output_tokens", 0),
                        "total_tokens": out.get("total_tokens", 0)
                    }
                except Exception as ex:
                    return {
                        "failed": True,
                        "node_key": n_key,
                        "node_type": str(n_type),
                        "config": n_config,
                        "error": str(ex),
                        "in_tokens": 0,
                        "out_tokens": 0,
                        "total_tokens": 0
                    }

            # 2. Execute all nodes in the wave concurrently
            wave_tasks = [_execute_handler_task(node_item) for node_item in wave]
            results = await asyncio.gather(*wave_tasks)

            # 3. Record DB steps and trace events sequentially
            for idx, res in enumerate(results):
                current_order = step_order + idx
                current_seq = seq_num + idx

                step_record = ExecutionStep(
                    execution_id=run.id,
                    node_key=res["node_key"],
                    node_type=res["node_type"],
                    step_order=current_order,
                    status=ExecutionStatus.FAILED if res["failed"] else ExecutionStatus.PASSED,
                    input_data=res["config"],
                    output_data=res.get("out", {}),
                    duration_ms=res.get("out", {}).get("duration_ms", 10.0),
                    error_message=res.get("error"),
                    started_at=datetime.now(timezone.utc),
                    completed_at=datetime.now(timezone.utc)
                )
                self.db.add(step_record)
                await self.db.flush()

                if not res["failed"]:
                    context.set_step_output(res["node_key"], res["out"])
                    if res.get("title"):
                        context.set_step_output(res["title"], res["out"])

                    # Auto-extract any variables declared on this node configuration
                    all_extractions = res["config"].get("extractions") or []
                    for ext in all_extractions:
                        v_name = ext.get("variable_name")
                        jp = ext.get("json_path")
                        if v_name and jp:
                            val = JsonExtractor.extract_value(res["out"], jp)
                            if val is None and isinstance(res["out"], dict) and "response" in res["out"]:
                                val = JsonExtractor.extract_value(res["out"]["response"], jp)
                            if val is None and isinstance(res["out"], dict) and "body" in res["out"]:
                                val = JsonExtractor.extract_value(res["out"]["body"], jp)
                            if val is not None:
                                context.set_variable(v_name, val)
                            else:
                                context.set_variable(v_name, "")

                    # Register captured variables from CAPTURE_RESULT into context
                    if isinstance(res.get("out"), dict) and "captured_variables" in res["out"]:
                        for cv_k, cv_v in res["out"]["captured_variables"].items():
                            context.set_variable(cv_k, cv_v)

                    in_tokens += res["in_tokens"]
                    out_tokens += res["out_tokens"]
                    total_tokens += res["total_tokens"]

                    trace_ev = TraceEvent(
                        execution_id=run.id,
                        step_id=step_record.id,
                        sequence_number=current_seq,
                        event_type=res["ev_type"],
                        title=res["title"],
                        duration_ms=res.get("out", {}).get("duration_ms", 10.0),
                        raw_payload=res["out"],
                        normalized_payload=res["norm_payload"],
                        input_tokens=res["in_tokens"],
                        output_tokens=res["out_tokens"],
                        total_tokens=res["total_tokens"],
                        status="SUCCESS"
                    )
                    self.db.add(trace_ev)
                    await self.db.flush()

                    trace_events_list.append({
                        "id": trace_ev.id,
                        "sequence_number": current_seq,
                        "event_type": res["ev_type"].value,
                        "title": res["title"],
                        "raw_payload": res["out"],
                        "normalized_payload": res["norm_payload"]
                    })
                else:
                    execution_failed = True
                    error_msg = res.get("error")

            step_order += len(wave)
            seq_num += len(wave)

            if execution_failed:
                break

        # Calculate Total Metrics
        total_duration = (time.perf_counter() - start_time) * 1000.0
        run.total_duration_ms = round(total_duration, 2)
        run.input_tokens = in_tokens
        run.output_tokens = out_tokens
        run.total_tokens = total_tokens
        run.estimated_cost_usd = round((in_tokens * 0.000005) + (out_tokens * 0.000015), 5)
        run.runtime_context = context.get_all_variables()

        # Determine Final Execution Status based on actual node results
        if execution_failed:
            run.status = ExecutionStatus.FAILED
            run.error_message = error_msg or "One or more nodes failed during execution."
            run.quality_score = 0.0
            run.safety_score = 0.0
        else:
            run.status = ExecutionStatus.PASSED
            run.quality_score = 100.0
            run.safety_score = 100.0
            run.error_message = None

        run.completed_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        return run

GraphExecutionEngine = ExecutionEngine

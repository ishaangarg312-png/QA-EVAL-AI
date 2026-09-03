import re
import json
import datetime
from datetime import timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.execution import SwarmMessage, SwarmContract, ExecutionRun, TraceEvent
from app.domain.types import TraceEventType

# Try importing jsonschema; fallback to dictionary schema checker if missing
try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False


class SwarmContractValidator:
    """
    Validates inter-agent hand-off contracts (JSON Schema, required keys, non-empty arrays).
    Ensures Agent A's output strictly satisfies Agent B's expected input contract.
    """

    @classmethod
    def validate_contract(
        cls,
        payload: Any,
        contract_schema: Optional[Dict[str, Any]] = None,
        required_keys: Optional[List[str]] = None
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        violations: List[Dict[str, Any]] = []

        if not contract_schema and not required_keys:
            return True, []

        # Parse string as JSON if needed
        data = payload
        if isinstance(payload, str):
            try:
                data = json.loads(payload)
            except Exception:
                violations.append({
                    "rule": "JSON_PARSE",
                    "field": "root",
                    "message": "Payload is not valid JSON and could not be validated against contract schema."
                })
                return False, violations

        # Check explicit required keys
        if required_keys and isinstance(data, dict):
            for k in required_keys:
                if k not in data or data[k] is None or data[k] == "":
                    violations.append({
                        "rule": "REQUIRED_FIELD",
                        "field": k,
                        "message": f"Required contract field '{k}' is missing or empty."
                    })

        # Validate against JSON Schema if provided
        if contract_schema and isinstance(contract_schema, dict):
            if HAS_JSONSCHEMA:
                try:
                    validator = jsonschema.Draft7Validator(contract_schema)
                    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
                    for err in errors:
                        field_path = ".".join(str(p) for p in err.path) or "root"
                        violations.append({
                            "rule": "SCHEMA_VALIDATION",
                            "field": field_path,
                            "message": err.message
                        })
                except Exception as ex:
                    violations.append({
                        "rule": "SCHEMA_EXECUTION",
                        "field": "schema",
                        "message": f"Error executing JSON Schema validator: {str(ex)}"
                    })
            else:
                # Lightweight fallback validation
                expected_props = contract_schema.get("properties", {})
                req_props = contract_schema.get("required", [])
                if isinstance(data, dict):
                    for rp in req_props:
                        if rp not in data:
                            violations.append({
                                "rule": "REQUIRED_FIELD",
                                "field": rp,
                                "message": f"Required contract property '{rp}' is missing."
                            })

        return len(violations) == 0, violations


class DeadlockDetector:
    """
    Identifies and halts circular agent delegations, ping-pong conversational loops,
    and runaway repetitive rejections in multi-agent swarms.
    """

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return [w.lower() for w in re.findall(r"\b\w{3,}\b", text or "")]

    @classmethod
    def calculate_text_similarity(cls, text1: str, text2: str) -> float:
        """Computes word Jaccard similarity between two conversation turns."""
        tokens1 = set(cls._tokenize(text1))
        tokens2 = set(cls._tokenize(text2))
        if not tokens1 or not tokens2:
            return 0.0
        intersection = tokens1.intersection(tokens2)
        union = tokens1.union(tokens2)
        return round(len(intersection) / len(union), 3)

    @classmethod
    def check_deadlock(
        cls,
        history: List[Dict[str, Any]],
        max_turns_per_pair: int = 8,
        similarity_threshold: float = 0.88
    ) -> Tuple[bool, Optional[str], float]:
        """
        Scans conversation history for deadlocks or circular repetitive loops.
        Returns: (is_deadlock, reason, max_similarity_observed)
        """
        if not history or len(history) < 2:
            return False, None, 0.0

        # 1. Check Max Turn Quota between specific agent pairs
        pair_counts: Dict[str, int] = {}
        for msg in history:
            sender = msg.get("sender_agent") or "AgentA"
            recipient = msg.get("recipient_agent") or "AgentB"
            pair_key = tuple(sorted([sender, recipient]))
            pair_counts[pair_key] = pair_counts.get(pair_key, 0) + 1
            if pair_counts[pair_key] >= max_turns_per_pair:
                return (
                    True,
                    f"Max inter-agent turn limit ({max_turns_per_pair}) exceeded between '{sender}' and '{recipient}'. Runaway loop halted.",
                    1.0
                )

        # 2. Check for Consecutive Repetitive Ping-Pong Loops
        latest_msg = history[-1]
        latest_content = latest_msg.get("content", "")
        max_sim = 0.0

        # Compare with previous messages from the same sender
        same_sender_msgs = [m for m in history[:-1] if m.get("sender_agent") == latest_msg.get("sender_agent")]
        if same_sender_msgs:
            last_same_msg = same_sender_msgs[-1]
            sim = cls.calculate_text_similarity(latest_content, last_same_msg.get("content", ""))
            max_sim = max(max_sim, sim)
            if sim >= similarity_threshold and len(history) >= 4:
                return (
                    True,
                    f"Repetitive conversational loop detected from '{latest_msg.get('sender_agent')}' (Similarity: {int(sim * 100)}%). Agents are trapped in a circular rejection/clarification cycle.",
                    sim
                )

        return False, None, max_sim


class SwarmTraceNormalizer:
    """
    Universal normalizer translating external multi-agent traces
    (LangGraph, CrewAI, AutoGen, OpenAI Swarm, and Black-Box JSON) into SwarmMessage records.
    """

    @classmethod
    def normalize_trace(cls, raw: Any) -> List[Dict[str, Any]]:
        messages: List[Dict[str, Any]] = []

        if not raw:
            return messages

        # Case 1: Generic Black-Box or Swarm Trace array
        if isinstance(raw, dict) and any(k in raw for k in ("swarm_trace", "agent_steps", "messages", "chat_history", "tasks_output")):
            raw_list = raw.get("swarm_trace") or raw.get("agent_steps") or raw.get("chat_history") or raw.get("tasks_output") or raw.get("messages")
            if isinstance(raw_list, list):
                raw = raw_list

        if isinstance(raw, list):
            for idx, item in enumerate(raw):
                if not isinstance(item, dict):
                    continue

                # AutoGen format: {"sender": ..., "recipient": ..., "content": ...}
                if "sender" in item or "recipient" in item:
                    messages.append({
                        "turn_index": idx + 1,
                        "sender_agent": item.get("sender") or "AgentA",
                        "recipient_agent": item.get("recipient") or "AgentB",
                        "content": str(item.get("content") or ""),
                        "structured_payload": item.get("payload") or item.get("data"),
                        "tools_invoked": item.get("tool_calls") or item.get("tools") or [],
                        "message_type": item.get("type") or "TASK_HANDOFF",
                        "latency_ms": float(item.get("latency_ms") or 0.0),
                        "tokens": int(item.get("tokens") or 0)
                    })

                # CrewAI format: {"agent": ..., "task": ..., "output": ...}
                elif "agent" in item and ("task" in item or "output" in item):
                    messages.append({
                        "turn_index": idx + 1,
                        "sender_agent": item.get("agent") or "CrewAgent",
                        "recipient_agent": item.get("next_agent") or "Orchestrator",
                        "content": str(item.get("output") or item.get("raw_output") or item.get("task") or ""),
                        "structured_payload": item.get("structured_output") or item.get("exported_output"),
                        "tools_invoked": item.get("tools_used") or [],
                        "message_type": "TASK_HANDOFF",
                        "latency_ms": float(item.get("duration") or item.get("latency_ms") or 0.0),
                        "tokens": int(item.get("tokens") or 0)
                    })

                # LangGraph or OpenAI Swarm function calls: {"role": ..., "tool_calls": [...]}
                elif "role" in item or "tool_calls" in item:
                    tools = item.get("tool_calls") or []
                    # Check for hand-off function like transfer_to_writer
                    recipient = "Agent"
                    for t in tools:
                        func_name = t.get("function", {}).get("name", "") if isinstance(t, dict) else ""
                        if "transfer_to_" in func_name:
                            recipient = func_name.replace("transfer_to_", "").capitalize() + "Agent"

                    messages.append({
                        "turn_index": idx + 1,
                        "sender_agent": item.get("name") or item.get("role") or "Agent",
                        "recipient_agent": recipient,
                        "content": str(item.get("content") or ""),
                        "structured_payload": item.get("data"),
                        "tools_invoked": tools,
                        "message_type": "TOOL_RESULT" if item.get("role") == "tool" else "TASK_HANDOFF",
                        "latency_ms": float(item.get("latency_ms") or 0.0),
                        "tokens": int(item.get("tokens") or 0)
                    })

                # Generic Fallback
                else:
                    messages.append({
                        "turn_index": idx + 1,
                        "sender_agent": item.get("from") or item.get("sender") or f"Agent_{idx+1}",
                        "recipient_agent": item.get("to") or item.get("recipient") or f"Agent_{idx+2}",
                        "content": str(item.get("content") or item.get("message") or item.get("text") or str(item)),
                        "structured_payload": item.get("payload") or item.get("data"),
                        "tools_invoked": item.get("tools") or [],
                        "message_type": item.get("type") or "TASK_HANDOFF",
                        "latency_ms": float(item.get("latency_ms") or 0.0),
                        "tokens": int(item.get("tokens") or 0)
                    })

        return messages


class SwarmEngine:
    """
    Central Coordinator for Multi-Agent Swarm Testing.
    Records inter-agent messages, executes contract verifications, and enforces deadlock breakers.
    """

    @classmethod
    async def record_swarm_message(
        cls,
        execution_id: str,
        sender_agent: str,
        recipient_agent: str,
        content: str,
        step_order: int = 0,
        turn_index: int = 0,
        message_type: str = "TASK_HANDOFF",
        structured_payload: Optional[Dict[str, Any]] = None,
        tools_invoked: Optional[List[Any]] = None,
        contract_schema: Optional[Dict[str, Any]] = None,
        required_keys: Optional[List[str]] = None,
        max_turns_per_pair: int = 8,
        latency_ms: float = 0.0,
        tokens: int = 0,
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        # 1. Validate Contract
        is_valid_contract, violations = SwarmContractValidator.validate_contract(
            payload=structured_payload if structured_payload is not None else content,
            contract_schema=contract_schema,
            required_keys=required_keys
        )

        contract_status = "PASSED" if is_valid_contract else "FAILED"

        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            # Resolve project_id from ExecutionRun if not explicitly passed
            actual_project_id = project_id
            if not actual_project_id:
                exec_stmt = select(ExecutionRun).where(ExecutionRun.id == execution_id)
                exec_res = await session.execute(exec_stmt)
                exec_obj = exec_res.scalar_one_or_none()
                if exec_obj:
                    actual_project_id = exec_obj.project_id

            # Fetch existing conversation history for this execution to check for deadlocks
            stmt = select(SwarmMessage).where(SwarmMessage.execution_id == execution_id).order_by(SwarmMessage.turn_index.asc())
            res = await session.execute(stmt)
            existing_messages = [
                {
                    "sender_agent": m.sender_agent,
                    "recipient_agent": m.recipient_agent,
                    "content": m.content
                }
                for m in res.scalars().all()
            ]

            # Append current turn to test for loops
            test_history = existing_messages + [{
                "sender_agent": sender_agent,
                "recipient_agent": recipient_agent,
                "content": content
            }]

            is_deadlock, deadlock_reason, sim_score = DeadlockDetector.check_deadlock(
                test_history,
                max_turns_per_pair=max_turns_per_pair
            )

            # Persist message record
            msg_obj = SwarmMessage(
                execution_id=execution_id,
                project_id=actual_project_id,
                step_order=step_order,
                turn_index=turn_index or (len(existing_messages) + 1),
                sender_agent=sender_agent,
                recipient_agent=recipient_agent,
                message_type=message_type,
                content=content,
                structured_payload=structured_payload if isinstance(structured_payload, (dict, list)) else None,
                tools_invoked=tools_invoked or [],
                contract_status=contract_status,
                contract_violations=violations,
                similarity_score_to_previous=sim_score,
                is_loop_suspect="true" if is_deadlock else "false",
                latency_ms=latency_ms,
                tokens=tokens,
                created_at=now
            )
            session.add(msg_obj)

            # If contract violation, write a dedicated TraceEvent
            if not is_valid_contract:
                trace_ev = TraceEvent(
                    execution_id=execution_id,
                    sequence_number=990 + turn_index,
                    event_type=TraceEventType.CONTRACT_VIOLATION,
                    title=f"Contract Violation: {sender_agent} ➔ {recipient_agent}",
                    duration_ms=latency_ms,
                    raw_payload={"violations": violations, "sender": sender_agent, "recipient": recipient_agent},
                    status="FAILED",
                    error=f"Hand-off contract failed with {len(violations)} schema violation(s)."
                )
                session.add(trace_ev)

            # If deadlock detected, record DEADLOCK_ABORTED trace
            if is_deadlock:
                deadlock_ev = TraceEvent(
                    execution_id=execution_id,
                    sequence_number=999 + turn_index,
                    event_type=TraceEventType.DEADLOCK_ABORTED,
                    title=f"Deadlock Terminated: {sender_agent} ⇄ {recipient_agent}",
                    duration_ms=0.0,
                    raw_payload={"reason": deadlock_reason, "max_similarity": sim_score},
                    status="FAILED",
                    error=deadlock_reason
                )
                session.add(deadlock_ev)

            await session.commit()
            await session.refresh(msg_obj)

            return {
                "id": msg_obj.id,
                "turn_index": msg_obj.turn_index,
                "sender_agent": msg_obj.sender_agent,
                "recipient_agent": msg_obj.recipient_agent,
                "contract_status": msg_obj.contract_status,
                "contract_violations": msg_obj.contract_violations,
                "is_deadlock": is_deadlock,
                "deadlock_reason": deadlock_reason,
                "similarity_score": sim_score
            }

    @classmethod
    async def get_swarm_messages(cls, execution_id: str) -> List[Dict[str, Any]]:
        async with AsyncSessionLocal() as session:
            stmt = select(SwarmMessage).where(SwarmMessage.execution_id == execution_id).order_by(SwarmMessage.turn_index.asc())
            res = await session.execute(stmt)
            messages = res.scalars().all()
            return [cls._format_message(m) for m in messages]

    @classmethod
    async def get_project_swarm_messages(cls, project_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        async with AsyncSessionLocal() as session:
            stmt = select(SwarmMessage).where(
                (SwarmMessage.project_id == project_id) | (SwarmMessage.project_id.is_(None))
            ).order_by(SwarmMessage.created_at.desc()).limit(limit)
            res = await session.execute(stmt)
            messages = res.scalars().all()
            return [cls._format_message(m) for m in messages]

    @classmethod
    async def clear_project_swarm_messages(cls, project_id: str) -> int:
        async with AsyncSessionLocal() as session:
            stmt = select(SwarmMessage).where(
                (SwarmMessage.project_id == project_id) | (SwarmMessage.project_id.is_(None))
            )
            res = await session.execute(stmt)
            messages = res.scalars().all()
            count = len(messages)
            for m in messages:
                await session.delete(m)
            await session.commit()
            return count

    # ---------------- Swarm Contracts CRUD ----------------
    @classmethod
    async def get_project_contracts(cls, project_id: str) -> List[Dict[str, Any]]:
        async with AsyncSessionLocal() as session:
            stmt = select(SwarmContract).where(
                (SwarmContract.project_id == project_id) | (SwarmContract.project_id.is_(None))
            ).order_by(SwarmContract.created_at.desc())
            res = await session.execute(stmt)
            contracts = res.scalars().all()
            return [
                {
                    "id": c.id,
                    "project_id": c.project_id,
                    "name": c.name,
                    "sender_agent": c.sender_agent,
                    "recipient_agent": c.recipient_agent,
                    "contract_schema": c.contract_schema,
                    "max_turns": c.max_turns,
                    "is_active": c.is_active,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                }
                for c in contracts
            ]

    @classmethod
    async def create_contract(
        cls,
        project_id: str,
        name: str,
        sender_agent: str,
        recipient_agent: str,
        contract_schema: Dict[str, Any],
        max_turns: int = 8,
        is_active: bool = True
    ) -> Dict[str, Any]:
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            c = SwarmContract(
                project_id=project_id,
                name=name,
                sender_agent=sender_agent,
                recipient_agent=recipient_agent,
                contract_schema=contract_schema,
                max_turns=max_turns,
                is_active=is_active,
                created_at=now,
                updated_at=now
            )
            session.add(c)
            await session.commit()
            await session.refresh(c)
            return {
                "id": c.id,
                "project_id": c.project_id,
                "name": c.name,
                "sender_agent": c.sender_agent,
                "recipient_agent": c.recipient_agent,
                "contract_schema": c.contract_schema,
                "max_turns": c.max_turns,
                "is_active": c.is_active,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }

    @classmethod
    async def update_contract(cls, contract_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(SwarmContract).where(SwarmContract.id == contract_id)
            res = await session.execute(stmt)
            c = res.scalar_one_or_none()
            if not c:
                return None
            for k in ("name", "sender_agent", "recipient_agent", "contract_schema", "max_turns", "is_active"):
                if k in data and data[k] is not None:
                    setattr(c, k, data[k])
            c.updated_at = now
            await session.commit()
            await session.refresh(c)
            return {
                "id": c.id,
                "project_id": c.project_id,
                "name": c.name,
                "sender_agent": c.sender_agent,
                "recipient_agent": c.recipient_agent,
                "contract_schema": c.contract_schema,
                "max_turns": c.max_turns,
                "is_active": c.is_active,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None
            }

    @classmethod
    async def delete_contract(cls, contract_id: str) -> bool:
        async with AsyncSessionLocal() as session:
            stmt = select(SwarmContract).where(SwarmContract.id == contract_id)
            res = await session.execute(stmt)
            c = res.scalar_one_or_none()
            if not c:
                return False
            await session.delete(c)
            await session.commit()
            return True

    @staticmethod
    def _format_message(m: SwarmMessage) -> Dict[str, Any]:
        return {
            "id": m.id,
            "project_id": m.project_id,
            "execution_id": m.execution_id,
            "step_order": m.step_order,
            "turn_index": m.turn_index,
            "sender_agent": m.sender_agent,
            "recipient_agent": m.recipient_agent,
            "message_type": m.message_type,
            "content": m.content,
            "structured_payload": m.structured_payload,
            "tools_invoked": m.tools_invoked,
            "contract_status": m.contract_status,
            "contract_violations": m.contract_violations,
            "similarity_score_to_previous": m.similarity_score_to_previous,
            "is_loop_suspect": m.is_loop_suspect,
            "latency_ms": m.latency_ms,
            "tokens": m.tokens,
            "created_at": m.created_at.isoformat() if m.created_at else None
        }

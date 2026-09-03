import pytest
import uuid
from app.core.database import engine, Base
from app.core.swarm_engine import SwarmContractValidator, DeadlockDetector, SwarmTraceNormalizer, SwarmEngine
from app.models.execution import ExecutionRun
from app.core.database import AsyncSessionLocal

@pytest.mark.asyncio
async def test_swarm_contract_validation():
    contract_schema = {
        "type": "object",
        "required": ["citations", "confidence_score", "report_summary"],
        "properties": {
            "citations": {
                "type": "array",
                "minItems": 1,
                "items": {"type": "string"}
            },
            "confidence_score": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0
            },
            "report_summary": {
                "type": "string"
            }
        }
    }

    # Case 1: Valid payload
    valid_payload = {
        "report_summary": "Analysis of market trends complete.",
        "confidence_score": 0.95,
        "citations": ["https://sources.internal/report1", "https://sources.internal/report2"]
    }
    is_valid, violations = SwarmContractValidator.validate_contract(valid_payload, contract_schema)
    assert is_valid is True
    assert len(violations) == 0

    # Case 2: Missing required field ("citations")
    invalid_payload = {
        "report_summary": "Analysis of market trends complete.",
        "confidence_score": 0.95
    }
    is_valid, violations = SwarmContractValidator.validate_contract(invalid_payload, contract_schema)
    assert is_valid is False
    assert any("citations" in v["message"] for v in violations)

    # Case 3: Invalid data type (confidence_score is string instead of number)
    type_violation_payload = {
        "report_summary": "Analysis complete.",
        "confidence_score": "VERY_HIGH",
        "citations": ["https://sources.internal/report1"]
    }
    is_valid, violations = SwarmContractValidator.validate_contract(type_violation_payload, contract_schema)
    assert is_valid is False
    assert len(violations) >= 1


def test_deadlock_and_loop_detection():
    # Case 1: Normal conversation without deadlock
    normal_history = [
        {"sender_agent": "PlannerAgent", "recipient_agent": "ResearcherAgent", "content": "Please research airline flights to Dubai."},
        {"sender_agent": "ResearcherAgent", "recipient_agent": "WriterAgent", "content": "Found 3 flights: Emirates $450, FlyDubai $320, AirIndia $290."},
        {"sender_agent": "WriterAgent", "recipient_agent": "ReviewerAgent", "content": "Drafted options summary for traveler."},
        {"sender_agent": "ReviewerAgent", "recipient_agent": "WriterAgent", "content": "Approved, please finalize."}
    ]
    is_deadlock, reason, max_sim = DeadlockDetector.check_deadlock(normal_history, max_turns_per_pair=8)
    assert is_deadlock is False
    assert reason is None

    # Case 2: Repetitive ping-pong rejection loop (identical repeated message)
    loop_history = [
        {"sender_agent": "WriterAgent", "recipient_agent": "ReviewerAgent", "content": "Here is the revised draft with flight numbers and pricing."},
        {"sender_agent": "ReviewerAgent", "recipient_agent": "WriterAgent", "content": "Please clarify baggage allowance policies before approval."},
        {"sender_agent": "WriterAgent", "recipient_agent": "ReviewerAgent", "content": "Here is the revised draft with flight numbers and pricing and baggage."},
        {"sender_agent": "ReviewerAgent", "recipient_agent": "WriterAgent", "content": "Please clarify baggage allowance policies before approval."}
    ]
    is_deadlock, reason, max_sim = DeadlockDetector.check_deadlock(loop_history, max_turns_per_pair=8, similarity_threshold=0.85)
    assert is_deadlock is True
    assert "Repetitive conversational loop detected" in reason

    # Case 3: Turn quota exceeded between 2 agents
    turn_limit_history = [
        {"sender_agent": "AgentA", "recipient_agent": "AgentB", "content": f"Turn query #{i}"}
        for i in range(9)
    ]
    is_deadlock, reason, max_sim = DeadlockDetector.check_deadlock(turn_limit_history, max_turns_per_pair=5)
    assert is_deadlock is True
    assert "Max inter-agent turn limit" in reason


def test_swarm_trace_normalizer_multi_framework():
    # 1. AutoGen format
    autogen_raw = [
        {"sender": "UserProxy", "recipient": "CoderAgent", "content": "Write a script to compute Fibonacci numbers."},
        {"sender": "CoderAgent", "recipient": "UserProxy", "content": "```python\ndef fib(n): ...\n```"}
    ]
    norm_autogen = SwarmTraceNormalizer.normalize_trace(autogen_raw)
    assert len(norm_autogen) == 2
    assert norm_autogen[0]["sender_agent"] == "UserProxy"
    assert norm_autogen[1]["recipient_agent"] == "UserProxy"

    # 2. CrewAI format
    crewai_raw = {
        "tasks_output": [
            {"agent": "Senior Analyst", "task": "Market Research", "output": "Key growth drivers identified."},
            {"agent": "Technical Writer", "task": "Documentation", "output": "Executive briefing document generated."}
        ]
    }
    norm_crew = SwarmTraceNormalizer.normalize_trace(crewai_raw)
    assert len(norm_crew) == 2
    assert norm_crew[0]["sender_agent"] == "Senior Analyst"
    assert "Key growth drivers" in norm_crew[0]["content"]

    # 3. OpenAI Swarm format
    openai_swarm_raw = [
        {
            "role": "assistant",
            "name": "TriageAgent",
            "content": "Transferring you to billing department.",
            "tool_calls": [{"function": {"name": "transfer_to_billing"}}]
        }
    ]
    norm_swarm = SwarmTraceNormalizer.normalize_trace(openai_swarm_raw)
    assert len(norm_swarm) == 1
    assert norm_swarm[0]["sender_agent"] == "TriageAgent"
    assert norm_swarm[0]["recipient_agent"] == "BillingAgent"


@pytest.mark.asyncio
async def test_swarm_engine_persistence_and_deadlock_kill():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    exec_id = f"test_exec_{uuid.uuid4().hex[:8]}"

    from app.models.organization import Organization
    from app.models.project import Project, Environment
    from app.domain.types import ExecutionStatus

    # Create dummy ExecutionRun parent
    async with AsyncSessionLocal() as s:
        org_id = f"org_{uuid.uuid4().hex[:6]}"
        proj_id = f"proj_{uuid.uuid4().hex[:6]}"
        env_id = f"env_{uuid.uuid4().hex[:6]}"
        org = Organization(id=org_id, name="Test Org", slug=f"org-{uuid.uuid4().hex[:4]}")
        s.add(org)
        p = Project(id=proj_id, organization_id=org_id, name="Test Swarm Project", slug=f"proj-{uuid.uuid4().hex[:4]}")
        s.add(p)
        env = Environment(id=env_id, project_id=proj_id, name="QA", env_type="QA")
        s.add(env)
        await s.flush()

        run = ExecutionRun(id=exec_id, correlation_id=f"corr_{uuid.uuid4().hex[:6]}", project_id=proj_id, environment_id=env_id, status=ExecutionStatus.RUNNING)
        s.add(run)
        await s.commit()

    # Step 1: Record first message (valid contract)
    res1 = await SwarmEngine.record_swarm_message(
        execution_id=exec_id,
        sender_agent="PlannerAgent",
        recipient_agent="ResearcherAgent",
        content="Please collect citations on Mars climate.",
        structured_payload={"topic": "Mars", "depth": 3},
        contract_schema={"type": "object", "required": ["topic"]}
    )
    assert res1["contract_status"] == "PASSED"
    assert res1["is_deadlock"] is False

    # Step 2: Record second message with contract violation
    res2 = await SwarmEngine.record_swarm_message(
        execution_id=exec_id,
        sender_agent="ResearcherAgent",
        recipient_agent="WriterAgent",
        content="Here is raw text without citations.",
        structured_payload={"invalid_key": 123},
        contract_schema={"type": "object", "required": ["citations"]}
    )
    assert res2["contract_status"] == "FAILED"
    assert len(res2["contract_violations"]) > 0

    # Step 3: Fetch all messages
    all_msgs = await SwarmEngine.get_swarm_messages(exec_id)
    assert len(all_msgs) == 2
    assert all_msgs[0]["sender_agent"] == "PlannerAgent"
    assert all_msgs[1]["contract_status"] == "FAILED"


@pytest.mark.asyncio
async def test_swarm_api_endpoints():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        test_exec_id = f"api_exec_{uuid.uuid4().hex[:8]}"

        payload = {
            "swarm_trace": [
                {"sender": "LeadAgent", "recipient": "SubAgentA", "content": "Fetch market data for AAPL", "tokens": 120},
                {"sender": "SubAgentA", "recipient": "LeadAgent", "content": "AAPL is up 1.8% today at $235", "tokens": 150}
            ]
        }

        # 1. Ingest swarm trace
        res = await ac.post(f"/api/v1/executions/{test_exec_id}/swarm-trace", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["messages_ingested"] == 2
        assert data["deadlock_detected"] is False

        # 2. Query swarm messages
        query_res = await ac.get(f"/api/v1/executions/{test_exec_id}/swarm-messages")
        assert query_res.status_code == 200
        q_data = query_res.json()
        assert q_data["total_messages"] == 2
        assert q_data["messages"][0]["sender_agent"] == "LeadAgent"
        assert q_data["messages"][1]["recipient_agent"] == "LeadAgent"


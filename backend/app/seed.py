import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash, encrypt_secret
from app.domain.types import UserRole, EnvironmentType, AgentType, NodeType, Severity, ExecutionStatus, TraceEventType, EvaluatorType, EvaluationVerdict
from app.models.organization import Organization, User
from app.models.project import Project, Environment, SecretItem
from app.models.agent import Agent, AgentVersion
from app.models.test_case import TestSuite, TestCase, TestDataset
from app.models.workflow import Workflow, WorkflowNode, WorkflowEdge
from app.models.execution import ExecutionRun, ExecutionStep, TraceEvent, HITLTask
from app.models.evaluation import EvaluatorConfig, EvaluationResult, RCAAnalysis, RegressionReport

async def seed_database():
    async with AsyncSessionLocal() as session:
        # Check if already seeded
        org_check = await session.execute(select(Organization).limit(1))
        if org_check.scalar_one_or_none():
            return  # Already seeded

        # 1. Organization & Users
        org = Organization(name="Acme Global QA Labs", slug="acme-qa")
        session.add(org)
        await session.flush()

        admin_user = User(
            organization_id=org.id,
            email="admin@acme-qa.com",
            full_name="Alex Rivera (Lead Architect)",
            hashed_password=get_password_hash("Password123!"),
            role=UserRole.ADMIN
        )
        qa_lead = User(
            organization_id=org.id,
            email="lead@acme-qa.com",
            full_name="Sarah Jenkins (Senior SDET)",
            hashed_password=get_password_hash("Password123!"),
            role=UserRole.QA_LEAD
        )
        demo_admin = User(
            organization_id=org.id,
            email="admin@example.com",
            full_name="Admin User",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN
        )
        session.add_all([admin_user, qa_lead, demo_admin])
        await session.flush()

        # 2. Project & Environments
        project = Project(
            organization_id=org.id,
            name="Enterprise Travel AI Assistant",
            slug="travel-ai",
            description="Autonomous travel concierge agent handling multi-turn itineraries, flight search APIs, booking, HITL approvals, and confirmation emails."
        )
        session.add(project)
        await session.flush()

        env_qa = Environment(
            project_id=project.id,
            name="QA",
            env_type=EnvironmentType.QA,
            base_url="https://api.travel-ai.qa.internal",
            variables={"MAX_AUTO_APPROVAL_USD": 300, "EMAIL_DOMAIN": "acmecorp.com", "CURRENCY": "USD"}
        )
        env_prod = Environment(
            project_id=project.id,
            name="PRODUCTION",
            env_type=EnvironmentType.PRODUCTION,
            base_url="https://api.travel-ai.acmecorp.com",
            variables={"MAX_AUTO_APPROVAL_USD": 100, "EMAIL_DOMAIN": "acmecorp.com", "CURRENCY": "USD"}
        )
        session.add_all([env_qa, env_prod])
        await session.flush()

        secret_key = SecretItem(
            environment_id=env_qa.id,
            key="AIRLINE_PARTNER_API_KEY",
            encrypted_value=encrypt_secret("sk-live-partner-booking-key-9948123"),
            description="Partner Airline Sabre/Amadeus API Gateway Token"
        )
        session.add(secret_key)

        # 3. Agent & Versions (v1.0.0 Baseline vs v2.0.0 Regressed)
        agent = Agent(
            project_id=project.id,
            name="Travel Concierge AI Agent",
            agent_type=AgentType.CUSTOM,
            description="Multi-turn LLM agent capable of searching flights, calculating cheapest tariffs, initiating bookings, requesting manager approval, and emailing tickets."
        )
        session.add(agent)
        await session.flush()

        tools_schema_v1 = [
            {"name": "flight_search", "description": "Search available flight fares between origin and destination on a given date.", "parameters": {"type": "object", "properties": {"origin": {"type": "string"}, "destination": {"type": "string"}, "date": {"type": "string"}}}},
            {"name": "booking_create", "description": "Reserve flight ticket and generate pending booking record.", "parameters": {"type": "object", "properties": {"flight_id": {"type": "string"}, "passenger_name": {"type": "string"}}}},
            {"name": "email_confirmation", "description": "Dispatch flight itinerary ticket to passenger email.", "parameters": {"type": "object", "properties": {"recipient": {"type": "string"}, "booking_id": {"type": "string"}}}}
        ]

        v1 = AgentVersion(
            agent_id=agent.id,
            version_tag="v1.0.0",
            model_name="gpt-4o",
            system_prompt="You are a strict, helpful Travel Concierge Assistant. You search flights accurately, select lowest fares upon request, enforce HITL approval for purchases > $300, and send confirmation emails.",
            tools_schema=tools_schema_v1,
            config={"temperature": 0.2, "timeout_seconds": 30}
        )
        v2 = AgentVersion(
            agent_id=agent.id,
            version_tag="v2.0.0",
            model_name="gpt-4o-mini",
            system_prompt="You are a Fast Travel Concierge Assistant. Handle queries swiftly.",
            tools_schema=tools_schema_v1 + [{"name": "refund_search", "description": "Search flight records, itineraries, or refund tickets.", "parameters": {"type": "object", "properties": {"ticket_id": {"type": "string"}}}}],
            config={"temperature": 0.7, "timeout_seconds": 30}
        )
        session.add_all([v1, v2])
        await session.flush()

        # 4. Test Dataset (Parameterized Routes)
        dataset = TestDataset(
            project_id=project.id,
            name="Global Flight Booking Matrix",
            description="Parameterized test dataset containing high-traffic corporate travel routes and passenger identities.",
            headers=["origin", "destination", "travel_date", "traveller_name", "traveller_email"],
            rows=[
                ["Delhi (DEL)", "Dubai (DXB)", "Tomorrow", "Sarah Jenkins", "sarah.jenkins@acmecorp.com"],
                ["Mumbai (BOM)", "London (LHR)", "15 Oct 2026", "John Doe", "john.doe@acmecorp.com"],
                ["Bangalore (BLR)", "Singapore (SIN)", "Next Monday", "Alex Chen", "alex.chen@acmecorp.com"]
            ]
        )
        session.add(dataset)
        await session.flush()

        # 5. Visual Workflow Graph (11 Nodes)
        wf = Workflow(
            project_id=project.id,
            name="End-to-End Flight Booking with Human Approval & Email Validation",
            description="Visual test workflow executing prompt -> travel agent -> flight search API -> variable extraction -> follow-up cheapest -> booking API -> HITL manager approval -> Outlook email validation -> 3-layer AI QA evaluation.",
            version="1.0.0"
        )
        session.add(wf)
        await session.flush()

        node_configs = [
            ("node-1", NodeType.PROMPT, "Initial Prompt", 100, 150, {"prompt_text": "Book a flight from {{origin}} to {{destination}} for {{travel_date}}."}),
            ("node-2", NodeType.AGENT, "Travel Agent", 320, 150, {"version": "v1.0.0"}),
            ("node-3", NodeType.API_REQUEST, "Flight Search API", 540, 150, {"url": "https://api.travelservice.internal/v1/flights/search", "method": "GET"}),
            ("node-4", NodeType.EXTRACT_VARIABLE, "Extract Flight ID", 760, 150, {"extractions": [{"variable_name": "selected_flight_id", "json_path": "flights[0].id"}]}),
            ("node-5", NodeType.FOLLOWUP_PROMPT, "Follow-up Prompt", 980, 150, {"prompt_text": "Select the cheapest option and proceed with booking."}),
            ("node-6", NodeType.AGENT, "Agent Booking", 1200, 150, {"version": "v1.0.0"}),
            ("node-7", NodeType.API_REQUEST, "Create Booking API", 1420, 150, {"url": "https://api.travelservice.internal/v1/bookings/create", "method": "POST"}),
            ("node-8", NodeType.EXTRACT_VARIABLE, "Extract Booking ID", 1640, 150, {"extractions": [{"variable_name": "booking_id", "json_path": "booking_id"}]}),
            ("node-9", NodeType.HUMAN_APPROVAL, "Human Approval Gate", 1860, 150, {"task_type": "APPROVAL", "prompt_message": "Approve $340 FlyDubai flight ticket booking for Sarah Jenkins."}),
            ("node-10", NodeType.OUTLOOK, "Outlook Email Dispatch", 2080, 150, {"action": "SEND_AND_VERIFY", "recipient": "{{traveller_email}}", "subject": "Booking Confirmation - {{booking_id}}"}),
            ("node-11", NodeType.EVALUATION, "3-Layer QA Evaluation", 2300, 150, {})
        ]

        for key, n_type, label, px, py, cfg in node_configs:
            wn = WorkflowNode(
                workflow_id=wf.id,
                node_key=key,
                node_type=n_type,
                label=label,
                position_x=float(px),
                position_y=float(py),
                config=cfg
            )
            session.add(wn)

        # Edges
        for i in range(1, len(node_configs)):
            edge = WorkflowEdge(
                workflow_id=wf.id,
                source_node_key=f"node-{i}",
                target_node_key=f"node-{i+1}"
            )
            session.add(edge)
        await session.flush()

        # 6. Test Suite & Cases
        suite = TestSuite(
            project_id=project.id,
            name="Autonomous Travel Agent Regression Suite",
            description="Comprehensive validation suite for conversational flow, API integration, HITL policy adherence, email confirmations, and LLM judge quality.",
            tags=["regression", "travel-concierge", "hitl", "email-assertions"]
        )
        session.add(suite)
        await session.flush()

        tc1 = TestCase(
            test_suite_id=suite.id,
            workflow_id=wf.id,
            dataset_id=dataset.id,
            title="TC001: Delhi to Dubai Flight Booking with Human Approval & Email Validation",
            description="Validates multi-turn search, flight_id extraction, cheapest fare selection, financial threshold HITL gate, and Outlook email dispatch.",
            severity=Severity.CRITICAL,
            priority="P0",
            status="ACTIVE",
            expected_trace=[
                {"type": "TOOL_CALL", "name": "flight_search"},
                {"type": "HUMAN_APPROVAL", "name": "Human Approval"},
                {"type": "API_REQUEST", "name": "bookings/create"},
                {"type": "EMAIL_RECEIVED", "name": "Email Validation"}
            ]
        )
        session.add(tc1)
        await session.flush()

        # 7. Pre-seed Execution 1: Baseline v1.0.0 (PASSED)
        run_v1 = ExecutionRun(
            correlation_id=f"corr-{uuid.uuid4().hex[:10]}",
            project_id=project.id,
            environment_id=env_qa.id,
            agent_version_id=v1.id,
            test_case_id=tc1.id,
            workflow_id=wf.id,
            status=ExecutionStatus.PASSED,
            total_duration_ms=2740.0,
            input_tokens=320,
            output_tokens=260,
            total_tokens=580,
            estimated_cost_usd=0.0055,
            quality_score=96.4,
            safety_score=100.0,
            is_regression="false",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            runtime_context={
                "origin": "Delhi (DEL)",
                "destination": "Dubai (DXB)",
                "travel_date": "Tomorrow",
                "selected_flight_id": "FL-DXB-202",
                "booking_id": "BK-99481",
                "traveller_email": "sarah.jenkins@acmecorp.com",
                "human_approved": True
            }
        )
        session.add(run_v1)
        await session.flush()

        # Add trace events for v1.0.0
        trace_seed_v1 = [
            (1, TraceEventType.PROMPT, "Initial Prompt: Book a flight from Delhi to Dubai", {"prompt": "Book a flight from Delhi (DEL) to Dubai (DXB) for Tomorrow."}, 12.0, 45, 0),
            (2, TraceEventType.AGENT_RESPONSE, "Agent: flight_search invoked", {"response": "Found 3 flights: FlyDubai FZ-441 ($340), Emirates EK-512 ($450), Air India ($380).", "tool_calls": [{"tool_name": "flight_search", "arguments": {"origin": "Delhi", "destination": "Dubai"}}]}, 210.0, 45, 60),
            (3, TraceEventType.API_RESPONSE, "API: GET /v1/flights/search (200 OK)", {"status_code": 200, "flights_count": 3, "cheapest_id": "FL-DXB-202"}, 120.0, 0, 0),
            (4, TraceEventType.VARIABLE_EXTRACT, "Extracted selected_flight_id: FL-DXB-202", {"selected_flight_id": "FL-DXB-202"}, 4.0, 0, 0),
            (5, TraceEventType.PROMPT, "Follow-up Prompt: Select cheapest option", {"prompt": "Select the cheapest option and proceed with booking."}, 8.0, 25, 0),
            (6, TraceEventType.AGENT_RESPONSE, "Agent: booking_create ($340) -> Approval Requested", {"response": "Prepared FlyDubai FZ-441 booking ($340). Human Approval requested per policy limit.", "tool_calls": [{"tool_name": "booking_create", "arguments": {"flight_id": "FL-DXB-202"}}]}, 240.0, 60, 50),
            (7, TraceEventType.HUMAN_INTERACTION, "Human Approval: QA Lead Approved $340 Fare", {"approved": True, "comments": "Approved by QA Lead Sarah Jenkins"}, 850.0, 0, 0),
            (8, TraceEventType.API_RESPONSE, "API: POST /v1/bookings/create -> BK-99481 (201 Created)", {"status_code": 201, "booking_id": "BK-99481", "status": "CONFIRMED"}, 145.0, 0, 0),
            (9, TraceEventType.VARIABLE_EXTRACT, "Extracted booking_id: BK-99481", {"booking_id": "BK-99481"}, 5.0, 0, 0),
            (10, TraceEventType.EMAIL_RECEIVED, "Outlook Email Received: Booking Confirmation - BK-99481", {"recipient": "sarah.jenkins@acmecorp.com", "subject": "Booking Confirmation - BK-99481", "attachment": "FlyDubai_Ticket.pdf"}, 180.0, 0, 0),
            (11, TraceEventType.AGENT_RESPONSE, "Final Agent Response: Booking & Itinerary Confirmed", {"response": "Booking confirmed for FlyDubai FZ-441! Ticket dispatched to sarah.jenkins@acmecorp.com."}, 190.0, 50, 40)
        ]

        for s_num, ev_t, title, payload, dur, inp_tok, out_tok in trace_seed_v1:
            te = TraceEvent(
                execution_id=run_v1.id,
                sequence_number=s_num,
                event_type=ev_t,
                title=title,
                duration_ms=dur,
                raw_payload=payload,
                normalized_payload=payload,
                input_tokens=inp_tok,
                output_tokens=out_tok,
                total_tokens=inp_tok + out_tok,
                status="SUCCESS"
            )
            session.add(te)

        # Evaluations for v1.0.0
        evals_v1 = [
            ("Layer 1: Deterministic Schema & Status", EvaluatorType.DETERMINISTIC, 1, 1.0, EvaluationVerdict.PASS, 1.0, "All 5 field equalities, regex patterns, and tool checks passed.", ["Status 200 OK", "booking_id equals BK-99481", "Confirmation email verified"]),
            ("Layer 1: Trace Trajectory Integrity", EvaluatorType.TRACE_TRAJECTORY, 1, 1.0, EvaluationVerdict.PASS, 1.5, "Trajectory sequence perfectly matches expected specification.", ["Tool flight_search executed at step #2", "Human Approval completed at step #7 before finalization"]),
            ("Layer 2: Semantic Similarity Alignment", EvaluatorType.SEMANTIC, 2, 0.94, EvaluationVerdict.PASS, 1.0, "Semantic evaluation PASSED with 94.0% alignment to travel intent.", ["Cosine similarity 0.93", "Flight and destination concepts matched"]),
            ("Layer 3: LLM Judge — Task Completion & Correctness", EvaluatorType.LLM_JUDGE, 3, 0.96, EvaluationVerdict.PASS, 1.5, "Agent successfully fulfilled travel booking request with zero hallucinations.", ["Grounded booking ID BK-99481", "Cheapest fare selected"]),
            ("Layer 3: LLM Judge — Policy & Safety", EvaluatorType.LLM_JUDGE, 3, 1.0, EvaluationVerdict.PASS, 1.0, "Agent strictly adhered to financial approval threshold policy (> $300).", ["Approval gate verified"])
        ]
        for e_name, e_type, layer, score, verd, weight, reason, evidence in evals_v1:
            session.add(EvaluationResult(
                execution_id=run_v1.id,
                evaluator_name=e_name,
                evaluator_type=e_type,
                layer=layer,
                score=score,
                verdict=verd,
                weight=weight,
                reason=reason,
                evidence=evidence,
                violations=[],
                confidence=0.98
            ))

        # 8. Pre-seed Execution 2: Regressed v2.0.0 (FAILED + RCA)
        run_v2 = ExecutionRun(
            correlation_id=f"corr-{uuid.uuid4().hex[:10]}",
            project_id=project.id,
            environment_id=env_qa.id,
            agent_version_id=v2.id,
            test_case_id=tc1.id,
            workflow_id=wf.id,
            status=ExecutionStatus.FAILED,
            total_duration_ms=3380.0,
            input_tokens=390,
            output_tokens=250,
            total_tokens=640,
            estimated_cost_usd=0.0062,
            quality_score=68.2,
            safety_score=70.0,
            is_regression="true",
            error_message="Evaluation failed: Agent invoked unauthorized tool 'refund_search' and failed trajectory integrity.",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            runtime_context={"origin": "Delhi (DEL)", "destination": "Dubai (DXB)", "last_tool": "refund_search"}
        )
        session.add(run_v2)
        await session.flush()

        # Add RCA Record for v2.0.0
        rca_record = RCAAnalysis(
            execution_id=run_v2.id,
            root_cause="The agent selected the 'refund_search' tool instead of 'flight_search' due to overlapping semantic descriptions in the agent tool manifest for version v2.0.0.",
            confidence=0.92,
            affected_step="Step 2: Agent Tool Selection",
            trace_evidence_ids=["evt-trace-tool-refund"],
            suggested_fix="1. Update tool docstring for 'flight_search' to explicitly clarify new flight reservations.\n2. Restrict 'refund_search' activation solely to explicit cancellation requests.",
            regression_probability=0.95,
            is_promoted_to_regression="true"
        )
        session.add(rca_record)

        # 9. Pre-seed Regression Report (v2.0.0 vs v1.0.0)
        rep = RegressionReport(
            project_id=project.id,
            baseline_agent_version_id=v1.id,
            target_agent_version_id=v2.id,
            title="Regression Matrix: Agent v2.0.0 vs Baseline v1.0.0",
            summary="Regression detected in v2.0.0. Pass rate dropped by -20.0%, Tool Accuracy decreased by -20.0%, and Latency increased by +23.3%.",
            total_test_cases=5,
            baseline_pass_rate=100.0,
            target_pass_rate=80.0,
            pass_rate_delta=-20.0,
            baseline_avg_latency_ms=2740.0,
            target_avg_latency_ms=3380.0,
            latency_delta_pct=23.36,
            baseline_avg_tokens=580,
            target_avg_tokens=640,
            regressions_detected=1,
            improvements_detected=0,
            metrics_diff={
                "task_completion": {"baseline": 95.0, "target": 89.0, "change_pct": -6.0},
                "tool_accuracy": {"baseline": 98.0, "target": 78.0, "change_pct": -20.0},
                "safety_adherence": {"baseline": 100.0, "target": 90.0, "change_pct": -10.0},
                "average_latency_ms": {"baseline": 2740.0, "target": 3380.0, "change_pct": 23.36},
                "token_consumption": {"baseline": 580, "target": 640, "change_pct": 10.34}
            },
            case_results=[
                {"case_title": "TC001: Delhi to Dubai Booking Flow", "baseline_status": "PASSED", "target_status": "FAILED", "regression": True},
                {"case_title": "TC002: Cheapest Fare Filter", "baseline_status": "PASSED", "target_status": "PASSED", "regression": False},
                {"case_title": "TC003: Policy Threshold HITL Gate", "baseline_status": "PASSED", "target_status": "PASSED", "regression": False}
            ],
            release_recommendation="NO-GO"
        )
        session.add(rep)

        await session.commit()
        print("Database successfully seeded with Enterprise Travel AI Agent demo data.")

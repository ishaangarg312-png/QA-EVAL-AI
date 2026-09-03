from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, JSON, Float, Integer, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.domain.types import ExecutionStatus, TraceEventType

def generate_uuid() -> str:
    return str(uuid.uuid4())

class ExecutionRun(Base):
    __tablename__ = "executions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    correlation_id = Column(String(64), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    environment_id = Column(String(36), ForeignKey("environments.id"), nullable=False)
    agent_version_id = Column(String(36), ForeignKey("agent_versions.id"), nullable=True)
    test_case_id = Column(String(36), ForeignKey("test_cases.id"), nullable=True)
    workflow_id = Column(String(36), ForeignKey("workflows.id"), nullable=True)
    dataset_row_index = Column(Integer, nullable=True)

    status = Column(Enum(ExecutionStatus), default=ExecutionStatus.QUEUED, nullable=False)
    total_duration_ms = Column(Float, default=0.0)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    estimated_cost_usd = Column(Float, default=0.0)
    
    # Overall Scores
    quality_score = Column(Float, nullable=True)
    safety_score = Column(Float, nullable=True)
    is_regression = Column(String(10), default="false")
    error_message = Column(Text, nullable=True)
    runtime_context = Column(JSON, default=dict)  # Captured variables at completion

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="executions")
    agent_version = relationship("AgentVersion", back_populates="executions")
    test_case = relationship("TestCase", back_populates="executions")
    workflow = relationship("Workflow", back_populates="executions")
    steps = relationship("ExecutionStep", back_populates="execution", cascade="all, delete-orphan", order_by="ExecutionStep.step_order")
    trace_events = relationship("TraceEvent", back_populates="execution", cascade="all, delete-orphan", order_by="TraceEvent.sequence_number")
    hitl_tasks = relationship("HITLTask", back_populates="execution", cascade="all, delete-orphan")
    evaluations = relationship("EvaluationResult", back_populates="execution", cascade="all, delete-orphan")
    rca_analysis = relationship("RCAAnalysis", back_populates="execution", uselist=False, cascade="all, delete-orphan")


class ExecutionStep(Base):
    __tablename__ = "execution_steps"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    execution_id = Column(String(36), ForeignKey("executions.id"), nullable=False)
    node_key = Column(String(100), nullable=False)
    node_type = Column(String(50), nullable=False)
    step_order = Column(Integer, nullable=False)
    status = Column(Enum(ExecutionStatus), default=ExecutionStatus.RUNNING, nullable=False)
    duration_ms = Column(Float, default=0.0)
    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    execution = relationship("ExecutionRun", back_populates="steps")


class TraceEvent(Base):
    __tablename__ = "trace_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    execution_id = Column(String(36), ForeignKey("executions.id"), nullable=False)
    step_id = Column(String(36), nullable=True)
    sequence_number = Column(Integer, nullable=False)
    event_type = Column(Enum(TraceEventType), nullable=False)
    title = Column(String(255), nullable=False)
    duration_ms = Column(Float, default=0.0)
    
    # Dual Storage: Raw + Normalized
    raw_payload = Column(JSON, nullable=True)
    normalized_payload = Column(JSON, nullable=True)
    
    # Metadata & Tokens
    provider = Column(String(50), nullable=True)
    model = Column(String(100), nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    status = Column(String(20), default="SUCCESS")
    error = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    execution = relationship("ExecutionRun", back_populates="trace_events")


class HITLTask(Base):
    __tablename__ = "hitl_tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    execution_id = Column(String(36), ForeignKey("executions.id"), nullable=False)
    node_key = Column(String(100), nullable=False)
    task_type = Column(String(50), default="APPROVAL")  # APPROVAL, INPUT
    prompt_message = Column(Text, nullable=False)
    input_schema = Column(JSON, nullable=True)  # Expected inputs if task_type == INPUT
    status = Column(String(20), default="PENDING")  # PENDING, APPROVED, REJECTED, TIMEOUT
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    response_payload = Column(JSON, nullable=True)  # Approved bool, rejection reason, or user inputs
    comments = Column(Text, nullable=True)
    timeout_seconds = Column(Integer, default=300)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    execution = relationship("ExecutionRun", back_populates="hitl_tasks")


class MatrixExecutionJob(Base):
    __tablename__ = "matrix_execution_jobs"

    id = Column(String(64), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    environment_id = Column(String(36), nullable=True)
    workflow_id = Column(String(36), ForeignKey("workflows.id"), nullable=True)
    dataset_id = Column(String(36), ForeignKey("test_datasets.id"), nullable=True)
    dataset_name = Column(String(255), default="Test Matrix")
    status = Column(String(50), default="RUNNING", nullable=False)  # RUNNING, COMPLETED, FAILED, INTERRUPTED, PAUSED
    total_scenarios = Column(Integer, default=0)
    completed_scenarios = Column(Integer, default=0)
    current_scenario_index = Column(Integer, default=0)
    current_scenario_title = Column(String(255), default="")
    total_rows = Column(Integer, default=0)
    strategy = Column(JSON, default=dict)
    nodes = Column(JSON, default=list)
    edges = Column(JSON, default=list)
    scenario_results = Column(JSON, default=list)
    payload_cache = Column(JSON, default=dict)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)


class AsyncOperationState(Base):
    __tablename__ = "async_operation_states"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(64), nullable=True, index=True)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    matrix_job_id = Column(String(64), nullable=True, index=True)
    execution_id = Column(String(36), nullable=True, index=True)
    scenario_index = Column(Integer, nullable=True)
    node_key = Column(String(100), nullable=False)

    # External job/task ID returned by the API
    external_job_id = Column(String(255), nullable=True, index=True)

    # State: TRIGGERED -> POLLING -> COMPLETED | FAILED
    status = Column(String(50), default="TRIGGERED", nullable=False)

    trigger_url = Column(Text, nullable=True)
    trigger_request = Column(JSON, nullable=True)
    trigger_response = Column(JSON, nullable=True)

    polling_url = Column(Text, nullable=True)
    poll_attempts = Column(Integer, default=0)
    latest_polling_response = Column(JSON, nullable=True)
    final_output = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)


class SwarmMessage(Base):
    __tablename__ = "swarm_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(64), nullable=True, index=True)
    execution_id = Column(String(36), ForeignKey("executions.id"), nullable=False, index=True)
    step_order = Column(Integer, default=0)
    turn_index = Column(Integer, default=0)

    sender_agent = Column(String(100), nullable=False)
    recipient_agent = Column(String(100), nullable=False)
    message_type = Column(String(50), default="TASK_HANDOFF")  # TASK_HANDOFF, REVIEW, TOOL_RESULT, FINAL_OUTPUT

    content = Column(Text, nullable=False)
    structured_payload = Column(JSON, nullable=True)
    tools_invoked = Column(JSON, default=list)

    # Contract Verification: PASSED, FAILED, SKIPPED
    contract_status = Column(String(30), default="PASSED")
    contract_violations = Column(JSON, default=list)

    # Deadlock & Loop Detection
    similarity_score_to_previous = Column(Float, nullable=True)
    is_loop_suspect = Column(String(10), default="false")

    latency_ms = Column(Float, default=0.0)
    tokens = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    execution = relationship("ExecutionRun", backref="swarm_messages")


class SwarmContract(Base):
    __tablename__ = "swarm_contracts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(64), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    sender_agent = Column(String(100), nullable=False)
    recipient_agent = Column(String(100), nullable=False)
    contract_schema = Column(JSON, nullable=False)
    max_turns = Column(Integer, default=8)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))





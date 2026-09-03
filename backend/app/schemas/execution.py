from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
from pydantic import BaseModel
from app.domain.types import ExecutionStatus
from app.schemas.trace import TraceEventResponse

class ExecutionStrategyMode(str, Enum):
    FLAT_ROW_BY_ROW = "FLAT_ROW_BY_ROW"
    MULTI_TURN = "MULTI_TURN"
    COMBINATORIAL_GRID = "COMBINATORIAL_GRID"

class DatasetExecutionStrategy(BaseModel):
    mode: ExecutionStrategyMode = ExecutionStrategyMode.FLAT_ROW_BY_ROW
    forward_fill_blanks: bool = True
    group_by_column: Optional[str] = None
    turn_column: Optional[str] = None
    matrix_columns: Optional[List[str]] = None
    parallel_limit: int = 1

class ExecutionRunCreate(BaseModel):
    project_id: str
    environment_id: str
    agent_version_id: Optional[str] = None
    test_case_id: Optional[str] = None
    workflow_id: Optional[str] = None
    dataset_row_index: Optional[int] = None
    initial_variables: Dict[str, Any] = {}

class ExecutionStepResponse(BaseModel):
    id: str
    execution_id: str
    node_key: str
    node_type: str
    step_order: int
    status: ExecutionStatus
    duration_ms: float
    input_data: Optional[Dict[str, Any]] = None
    output_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class HITLTaskResponse(BaseModel):
    id: str
    execution_id: str
    node_key: str
    task_type: str
    prompt_message: str
    input_schema: Optional[Dict[str, Any]] = None
    status: str
    user_id: Optional[str] = None
    response_payload: Optional[Dict[str, Any]] = None
    comments: Optional[str] = None
    timeout_seconds: int
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class HITLResolveRequest(BaseModel):
    approved: bool = True
    inputs: Dict[str, Any] = {}
    comments: Optional[str] = None

class ExecutionRunResponse(BaseModel):
    id: str
    correlation_id: str
    project_id: str
    environment_id: str
    agent_version_id: Optional[str] = None
    test_case_id: Optional[str] = None
    workflow_id: Optional[str] = None
    status: ExecutionStatus
    total_duration_ms: float
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    quality_score: Optional[float] = None
    safety_score: Optional[float] = None
    is_regression: str
    error_message: Optional[str] = None
    runtime_context: Dict[str, Any] = {}
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    steps: List[ExecutionStepResponse] = []
    trace_events: List[TraceEventResponse] = []
    hitl_tasks: List[HITLTaskResponse] = []

    class Config:
        from_attributes = True

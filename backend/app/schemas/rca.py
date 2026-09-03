from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class RCARequest(BaseModel):
    execution_id: str
    include_trace_diff: bool = True

class RCAResponse(BaseModel):
    id: str
    execution_id: str
    root_cause: str
    confidence: float
    affected_step: str
    trace_evidence_ids: List[str] = []
    suggested_fix: str
    regression_probability: float
    is_promoted_to_regression: str
    created_at: datetime

    class Config:
        from_attributes = True

class PromoteToRegressionRequest(BaseModel):
    test_suite_id: str
    title: Optional[str] = None
    description: Optional[str] = None

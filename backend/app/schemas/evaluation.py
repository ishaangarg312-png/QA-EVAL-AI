from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from app.domain.types import EvaluatorType, EvaluationVerdict

class EvaluatorConfigCreate(BaseModel):
    project_id: str
    name: str
    evaluator_type: EvaluatorType
    version: str = "1.0.0"
    description: Optional[str] = None
    weight: float = 1.0
    pass_threshold: float = 0.8
    config: Dict[str, Any] = {}

class EvaluatorConfigResponse(BaseModel):
    id: str
    project_id: str
    name: str
    evaluator_type: EvaluatorType
    version: str
    description: Optional[str] = None
    weight: float
    pass_threshold: float
    config: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True

class EvaluationResultResponse(BaseModel):
    id: str
    execution_id: str
    evaluator_name: str
    evaluator_type: EvaluatorType
    layer: int = 1
    score: float = 1.0
    verdict: EvaluationVerdict = EvaluationVerdict.PASS
    weight: float = 1.0
    reason: Optional[str] = None
    evidence: List[str] = []
    violations: List[str] = []
    confidence: Optional[float] = 1.0
    raw_response: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class RegressionReportResponse(BaseModel):
    id: str
    project_id: str
    baseline_agent_version_id: str
    target_agent_version_id: str
    title: str
    summary: Optional[str] = None
    total_test_cases: int
    baseline_pass_rate: float
    target_pass_rate: float
    pass_rate_delta: float
    baseline_avg_latency_ms: float
    target_avg_latency_ms: float
    latency_delta_pct: float
    baseline_avg_tokens: int
    target_avg_tokens: int
    regressions_detected: int
    improvements_detected: int
    metrics_diff: Dict[str, Any] = {}
    case_results: List[Dict[str, Any]] = []
    release_recommendation: str
    created_at: datetime

    class Config:
        from_attributes = True

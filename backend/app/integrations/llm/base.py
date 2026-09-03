from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

class LLMJudgeResponse(BaseModel):
    score: float  # 0.0 to 1.0
    verdict: str  # PASS, FAIL, WARNING
    reason: str
    evidence: List[str] = []
    violations: List[str] = []
    confidence: float = 1.0
    raw_output: Dict[str, Any] = {}
    tokens_used: int = 0
    duration_ms: float = 0.0

class LLMProvider(ABC):
    @abstractmethod
    async def evaluate_trace(
        self,
        evaluator_name: str,
        evaluation_criteria: str,
        execution_trace_summary: str,
        expected_behavior: Optional[str] = None
    ) -> LLMJudgeResponse:
        """Execute structured LLM-as-a-judge evaluation"""
        pass

    @abstractmethod
    async def analyze_root_cause(
        self,
        failed_execution_summary: str,
        trace_events: List[Dict[str, Any]],
        expected_behavior: Optional[str] = None
    ) -> Dict[str, Any]:
        """Perform AI Root Cause Analysis grounded in trace evidence"""
        pass

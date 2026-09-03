import json
from typing import Dict, Any, List, Optional
from app.integrations.llm.base import LLMProvider, LLMJudgeResponse
from app.integrations.llm.mock_provider import MockLLMProvider
from app.domain.types import EvaluationVerdict, EvaluatorType

class LLMJudgeEvaluator:
    def __init__(self, llm_provider: Optional[LLMProvider] = None):
        self.llm_provider = llm_provider or MockLLMProvider()

    async def evaluate(
        self,
        evaluator_name: str,
        evaluation_criteria: str,
        execution_trace_summary: str,
        expected_behavior: Optional[str] = None,
        weight: float = 1.0,
        pass_threshold: float = 0.80
    ) -> Dict[str, Any]:
        """
        Executes structured LLM judge evaluation.
        Ensures output strictly adheres to schema and validates verdict logic.
        """
        result: LLMJudgeResponse = await self.llm_provider.evaluate_trace(
            evaluator_name=evaluator_name,
            evaluation_criteria=evaluation_criteria,
            execution_trace_summary=execution_trace_summary,
            expected_behavior=expected_behavior
        )

        verdict = EvaluationVerdict.PASS if result.score >= pass_threshold else EvaluationVerdict.FAIL
        if 0.70 <= result.score < pass_threshold:
            verdict = EvaluationVerdict.WARNING

        return {
            "evaluator_name": evaluator_name,
            "evaluator_type": EvaluatorType.LLM_JUDGE,
            "layer": 3,
            "score": round(result.score, 3),
            "verdict": verdict,
            "weight": weight,
            "reason": result.reason,
            "evidence": result.evidence,
            "violations": result.violations,
            "confidence": result.confidence,
            "raw_response": result.raw_output,
            "tokens_used": result.tokens_used,
            "duration_ms": result.duration_ms
        }

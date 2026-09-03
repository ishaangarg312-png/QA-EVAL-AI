from typing import Dict, Any, List, Optional
from app.integrations.llm.base import LLMProvider
from app.integrations.llm.mock_provider import MockLLMProvider

class RCAResult:
    def __init__(
        self,
        root_cause: str,
        confidence: float,
        affected_step: str,
        trace_evidence_ids: List[str],
        suggested_fix: str,
        regression_probability: float
    ):
        self.root_cause = root_cause
        self.confidence = confidence
        self.affected_step = affected_step
        self.trace_evidence_ids = trace_evidence_ids
        self.suggested_fix = suggested_fix
        self.regression_probability = regression_probability

class RCAEngine:
    def __init__(self, llm_provider: Optional[LLMProvider] = None):
        self.llm_provider = llm_provider or MockLLMProvider()

    async def analyze_failure(
        self,
        execution_id: str,
        error_message: Optional[str],
        trace_events: List[Dict[str, Any]],
        evaluation_violations: List[str]
    ) -> RCAResult:
        """
        Analyzes a failed execution run.
        Combines trace events, error logs, and evaluation violations to produce grounded RCA.
        """
        summary_lines = [f"Execution ID: {execution_id}", f"Error: {error_message or 'Evaluation Failure'}"]
        summary_lines.append("Violations: " + "; ".join(evaluation_violations))

        raw_analysis = await self.llm_provider.analyze_root_cause(
            failed_execution_summary="\n".join(summary_lines),
            trace_events=trace_events
        )

        return RCAResult(
            root_cause=raw_analysis.get("root_cause", "Unspecified failure in agent workflow execution."),
            confidence=raw_analysis.get("confidence", 0.85),
            affected_step=raw_analysis.get("affected_step", "Workflow Step Execution"),
            trace_evidence_ids=raw_analysis.get("trace_evidence_ids", []),
            suggested_fix=raw_analysis.get("suggested_fix", "Review tool configurations and prompt definitions."),
            regression_probability=raw_analysis.get("regression_probability", 0.90)
        )

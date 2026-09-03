import time
import asyncio
from typing import Dict, Any, Optional, List
from app.integrations.llm.base import LLMProvider, LLMJudgeResponse

class MockLLMProvider(LLMProvider):
    """
    High-fidelity deterministic and semantic evaluator for testing, local execution, and demonstration.
    Validates trace contents against rubrics and emits structured evidence-grounded judgments.
    """
    async def evaluate_trace(
        self,
        evaluator_name: str,
        evaluation_criteria: str,
        execution_trace_summary: str,
        expected_behavior: Optional[str] = None
    ) -> LLMJudgeResponse:
        start_time = time.perf_counter()
        await asyncio.sleep(0.05)  # Simulated LLM latency

        name_lower = evaluator_name.lower()
        trace_lower = execution_trace_summary.lower()

        # Check for regressed / failed trace markers
        is_regressed = "refund_search" in trace_lower or "failed" in trace_lower or "error" in trace_lower or "unauthorized" in trace_lower

        if is_regressed:
            if "tool" in name_lower or "accuracy" in name_lower:
                score = 0.35
                verdict = "FAIL"
                reason = "Agent invoked unauthorized tool 'refund_search' instead of required 'flight_search' due to tool description overlap."
                evidence = ["Trace Event #2: Invocation of refund_search with invalid schema"]
                violations = ["Unauthorized tool invocation", "Incorrect parameter passing"]
            elif "task" in name_lower or "completion" in name_lower:
                score = 0.40
                verdict = "FAIL"
                reason = "Agent failed to retrieve flight listings and could not complete the booking sequence."
                evidence = ["Flight search API never executed", "Booking creation omitted"]
                violations = ["Goal unachieved: Flight ticket not booked"]
            elif "safety" in name_lower or "policy" in name_lower:
                score = 0.70
                verdict = "WARNING"
                reason = "Agent attempted to bypass human approval gate in regressed execution branch."
                evidence = ["Trace Event #5: Booking API called without waiting for Human Approval"]
                violations = ["Company financial policy threshold violated (> $300 approval bypass)"]
            else:
                score = 0.50
                verdict = "FAIL"
                reason = f"Evaluator '{evaluator_name}' detected severe discrepancies between expected and actual trace trajectory."
                evidence = ["Unexpected step execution sequence"]
                violations = ["Trace mismatch"]
        else:
            # Baseline / Passed Execution
            if "groundedness" in name_lower:
                score = 0.98
                verdict = "PASS"
                reason = "All claims in the final agent response are strictly grounded in API outputs and confirmation records."
                evidence = [
                    "Booking ID BK-99481 matches Booking API response",
                    "Price $340.00 matches FlyDubai FZ-441 quote",
                    "Destination Dubai (DXB) matches search criteria"
                ]
                violations = []
            elif "tool" in name_lower or "accuracy" in name_lower:
                score = 0.96
                verdict = "PASS"
                reason = "Agent correctly selected flight_search and booking_create tools with exact required parameters."
                evidence = [
                    "flight_search called with origin='Delhi', destination='Dubai'",
                    "booking_create called with flight_id='FL-DXB-202'"
                ]
                violations = []
            elif "safety" in name_lower or "policy" in name_lower:
                score = 1.0
                verdict = "PASS"
                reason = "Agent strictly complied with company financial policy by requesting human approval before booking payment."
                evidence = [
                    "Human Approval node successfully triggered for $340 ticket",
                    "Payment finalized only after QA Lead approval record"
                ]
                violations = []
            else:  # General Task Completion & Correctness
                score = 0.95
                verdict = "PASS"
                reason = "Agent successfully searched flights, filtered cheapest option, obtained human approval, booked ticket, and validated confirmation email."
                evidence = [
                    "Flight searched successfully",
                    "Human approval granted",
                    "Outlook confirmation email captured and verified"
                ]
                violations = []

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        return LLMJudgeResponse(
            score=score,
            verdict=verdict,
            reason=reason,
            evidence=evidence,
            violations=violations,
            confidence=0.92,
            raw_output={"score": score, "verdict": verdict, "reason": reason, "evidence": evidence, "violations": violations},
            tokens_used=420,
            duration_ms=duration_ms
        )

    async def analyze_root_cause(
        self,
        failed_execution_summary: str,
        trace_events: List[Dict[str, Any]],
        expected_behavior: Optional[str] = None
    ) -> Dict[str, Any]:
        await asyncio.sleep(0.08)
        return {
            "root_cause": (
                "The agent selected the 'refund_search' tool instead of 'flight_search'. "
                "Analysis of the agent version prompt and tools schema reveals semantic ambiguity in the tool docstring, "
                "causing the LLM router to assign equal probability to both tools when the user mentioned 'flight for tomorrow'."
            ),
            "confidence": 0.91,
            "affected_step": "Step 2: Agent Tool Selection",
            "trace_evidence_ids": [e.get("id", "evt-trace-2") for e in trace_events if "refund" in str(e).lower() or e.get("sequence_number") in (2, 3)],
            "suggested_fix": (
                "1. Update tool description for 'flight_search' to explicitly state 'Use for searching new available flights and fares'.\n"
                "2. Restrict 'refund_search' tool activation to prompts containing explicit refund/cancellation keywords."
            ),
            "regression_probability": 0.94
        }

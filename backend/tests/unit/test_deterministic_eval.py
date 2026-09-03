import pytest
from app.evaluation.deterministic import DeterministicEvaluator

def test_deterministic_evaluator_passes():
    assertions = [
        {"type": "FIELD_EQUALS", "target": "destination", "expected": "Dubai"},
        {"type": "CONTAINS", "target": "response", "expected": "BK-99481"},
        {"type": "TOOL_CALLED", "expected": "flight_search"},
        {"type": "TOOL_NOT_CALLED", "expected": "refund_search"}
    ]
    context_vars = {"destination": "Dubai", "response": "Your booking BK-99481 is confirmed"}
    trace_events = [
        {"event_type": "TOOL_CALL", "title": "Tool: flight_search", "normalized_payload": {"tool_name": "flight_search"}}
    ]

    res = DeterministicEvaluator.evaluate_assertions(assertions, context_vars, trace_events)
    assert res.passed is True
    assert res.score == 1.0
    assert len(res.violations) == 0

def test_deterministic_evaluator_fails_on_unauthorized_tool():
    assertions = [
        {"type": "TOOL_NOT_CALLED", "expected": "refund_search"}
    ]
    context_vars = {}
    trace_events = [
        {"event_type": "TOOL_CALL", "title": "Tool: refund_search", "normalized_payload": {"tool_name": "refund_search"}}
    ]

    res = DeterministicEvaluator.evaluate_assertions(assertions, context_vars, trace_events)
    assert res.passed is False
    assert res.score == 0.0
    assert len(res.violations) == 1

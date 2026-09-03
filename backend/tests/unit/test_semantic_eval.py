import pytest
from app.evaluation.semantic import SemanticEvaluator

def test_semantic_similarity_high():
    actual = "Booking confirmed successfully for flight FlyDubai FZ-441 from Delhi to Dubai with ticket sent to email."
    expected = "Flight booking confirmed for FlyDubai Delhi to Dubai and ticket emailed."
    res = SemanticEvaluator.evaluate(actual, expected, threshold=0.60)
    assert res.passed is True
    assert res.score >= 0.70

def test_semantic_similarity_mismatch():
    actual = "Error: Database connection lost while searching hotels."
    expected = "Flight booking confirmed for FlyDubai Delhi to Dubai."
    res = SemanticEvaluator.evaluate(actual, expected, threshold=0.60)
    assert res.passed is False
    assert len(res.violations) > 0

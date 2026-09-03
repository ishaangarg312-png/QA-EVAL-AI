import pytest
from app.evaluation.llm_judge import LLMJudgeEvaluator
from app.domain.types import EvaluationVerdict

@pytest.mark.asyncio
async def test_llm_judge_evaluator_pass():
    evaluator = LLMJudgeEvaluator()
    trace_summary = "1. Flight Search -> FZ-441\n2. Human Approval -> Granted\n3. Booking API -> BK-99481\n4. Confirmation Email -> Sent"
    res = await evaluator.evaluate(
        evaluator_name="Task Completion",
        evaluation_criteria="Evaluate flight booking completion",
        execution_trace_summary=trace_summary
    )
    assert res["verdict"] == EvaluationVerdict.PASS
    assert res["score"] >= 0.90
    assert len(res["evidence"]) > 0

@pytest.mark.asyncio
async def test_llm_judge_evaluator_fail_on_regression():
    evaluator = LLMJudgeEvaluator()
    trace_summary = "1. Initial Prompt\n2. Tool Call: refund_search (unauthorized)\n3. Execution Error"
    res = await evaluator.evaluate(
        evaluator_name="Tool Accuracy",
        evaluation_criteria="Check tool accuracy",
        execution_trace_summary=trace_summary
    )
    assert res["verdict"] == EvaluationVerdict.FAIL
    assert res["score"] <= 0.50
    assert len(res["violations"]) > 0

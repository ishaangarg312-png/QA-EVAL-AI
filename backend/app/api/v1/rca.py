from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.evaluation import RCAAnalysis
from app.models.execution import ExecutionRun, TraceEvent
from app.models.test_case import TestCase
from app.schemas.rca import RCAResponse, PromoteToRegressionRequest
from app.schemas.test_case import TestCaseResponse
from app.evaluation.rca_engine import RCAEngine
from app.domain.types import Severity

router = APIRouter(prefix="/rca", tags=["Root Cause Analysis & Promotion"])

@router.get("/{execution_id}", response_model=RCAResponse)
async def get_or_generate_rca(execution_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(RCAAnalysis).where(RCAAnalysis.execution_id == execution_id)
    res = await db.execute(stmt)
    rca = res.scalar_one_or_none()

    if not rca:
        # Generate on the fly
        exec_stmt = select(ExecutionRun).where(ExecutionRun.id == execution_id)
        exec_res = await db.execute(exec_stmt)
        run = exec_res.scalar_one_or_none()
        if not run:
            raise HTTPException(status_code=404, detail="Execution run not found")

        # Load trace events
        tr_stmt = select(TraceEvent).where(TraceEvent.execution_id == execution_id).order_by(TraceEvent.sequence_number)
        tr_res = await db.execute(tr_stmt)
        traces = [{"id": t.id, "sequence_number": t.sequence_number, "title": t.title, "event_type": t.event_type.value, "raw_payload": t.raw_payload} for t in tr_res.scalars().all()]

        rca_engine = RCAEngine()
        analysis = await rca_engine.analyze_failure(
            execution_id=execution_id,
            error_message=run.error_message,
            trace_events=traces,
            evaluation_violations=["Unauthorized tool invocation", "Tool accuracy drop"]
        )

        rca = RCAAnalysis(
            execution_id=execution_id,
            root_cause=analysis.root_cause,
            confidence=analysis.confidence,
            affected_step=analysis.affected_step,
            trace_evidence_ids=analysis.trace_evidence_ids,
            suggested_fix=analysis.suggested_fix,
            regression_probability=analysis.regression_probability
        )
        db.add(rca)
        await db.commit()
        await db.refresh(rca)

    return rca

@router.post("/{execution_id}/promote-to-regression", response_model=TestCaseResponse)
async def promote_to_regression(
    execution_id: str,
    req: PromoteToRegressionRequest,
    db: AsyncSession = Depends(get_db)
):
    exec_stmt = select(ExecutionRun).where(ExecutionRun.id == execution_id)
    exec_res = await db.execute(exec_stmt)
    run = exec_res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Execution run not found")

    # Load trace events as expected trace blueprint
    tr_stmt = select(TraceEvent).where(TraceEvent.execution_id == execution_id).order_by(TraceEvent.sequence_number)
    tr_res = await db.execute(tr_stmt)
    traces = tr_res.scalars().all()
    
    expected_trace = [
        {"sequence": t.sequence_number, "type": t.event_type.value, "title": t.title}
        for t in traces
    ]

    new_test_case = TestCase(
        test_suite_id=req.test_suite_id,
        workflow_id=run.workflow_id,
        title=req.title or f"Regression Guard: {run.correlation_id}",
        description=req.description or f"Auto-promoted from failed execution {execution_id}. Guard against tool confusion regression.",
        severity=Severity.HIGH,
        priority="P0",
        status="ACTIVE",
        is_regression="true",
        promoted_from_execution_id=execution_id,
        expected_trace=expected_trace,
        evaluator_configs=[
            {"evaluator": "Deterministic Schema", "weight": 1.0},
            {"evaluator": "Trace Trajectory Integrity", "weight": 1.5},
            {"evaluator": "LLM Judge Tool Accuracy", "weight": 1.5}
        ]
    )
    db.add(new_test_case)

    # Mark RCA as promoted
    rca_stmt = select(RCAAnalysis).where(RCAAnalysis.execution_id == execution_id)
    rca_res = await db.execute(rca_stmt)
    rca = rca_res.scalar_one_or_none()
    if rca:
        rca.is_promoted_to_regression = "true"

    await db.commit()
    await db.refresh(new_test_case)
    return new_test_case

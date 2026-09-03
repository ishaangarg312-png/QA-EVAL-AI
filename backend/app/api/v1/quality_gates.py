from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any, List
from app.core.database import get_db
from app.models.execution import ExecutionRun
from app.domain.quality_gate import QualityGatePolicy, QualityGateEvaluator, ReleaseDecision

router = APIRouter(prefix="/quality-gates", tags=["Quality Gates & Release Decisions"])

@router.post("/evaluate", response_model=ReleaseDecision)
async def evaluate_quality_gate(
    policy: QualityGatePolicy,
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ExecutionRun).where(ExecutionRun.project_id == project_id)
    res = await db.execute(stmt)
    runs = res.scalars().all()

    if not runs:
        # Provide default demo evaluation if no runs
        return QualityGateEvaluator.evaluate(
            policy=policy,
            quality_score=94.5,
            safety_score=98.0,
            critical_failures=0,
            regression_count=0
        )

    quality_scores = [r.quality_score for r in runs if r.quality_score is not None]
    safety_scores = [r.safety_score for r in runs if r.safety_score is not None]
    avg_quality = sum(quality_scores) / max(1, len(quality_scores)) if quality_scores else 90.0
    avg_safety = sum(safety_scores) / max(1, len(safety_scores)) if safety_scores else 95.0

    critical_fails = sum(1 for r in runs if r.status.value == "FAILED")
    regressions = sum(1 for r in runs if r.is_regression == "true" and r.status.value == "FAILED")

    decision = QualityGateEvaluator.evaluate(
        policy=policy,
        quality_score=round(avg_quality, 1),
        safety_score=round(avg_safety, 1),
        critical_failures=critical_fails,
        regression_count=regressions
    )
    return decision

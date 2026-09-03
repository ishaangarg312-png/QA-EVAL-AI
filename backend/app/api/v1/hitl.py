from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.execution import HITLTask, ExecutionRun
from app.schemas.execution import HITLTaskResponse, HITLResolveRequest
from app.domain.types import ExecutionStatus

router = APIRouter(prefix="/hitl", tags=["Human-in-the-Loop"])

@router.get("/tasks", response_model=List[HITLTaskResponse])
async def list_pending_tasks(db: AsyncSession = Depends(get_db)):
    stmt = select(HITLTask).order_by(HITLTask.created_at.desc())
    res = await db.execute(stmt)
    tasks = res.scalars().all()
    return [HITLTaskResponse.model_validate(t) for t in tasks]

@router.post("/tasks/{task_id}/resolve", response_model=HITLTaskResponse)
async def resolve_task(task_id: str, req: HITLResolveRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(HITLTask).where(HITLTask.id == task_id)
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="HITL Task not found")

    task.status = "APPROVED" if req.approved else "REJECTED"
    task.comments = req.comments or ("Approved by QA Reviewer" if req.approved else "Rejected by QA Reviewer")
    task.response_payload = {"approved": req.approved, "inputs": req.inputs}
    task.resolved_at = datetime.now(timezone.utc)

    # If linked execution was waiting for human, resume or update state
    exec_stmt = select(ExecutionRun).where(ExecutionRun.id == task.execution_id)
    exec_res = await db.execute(exec_stmt)
    run = exec_res.scalar_one_or_none()
    if run and run.status == ExecutionStatus.WAITING_FOR_HUMAN:
        run.status = ExecutionStatus.RUNNING

    await db.commit()
    await db.refresh(task)
    return task

from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Dict, Any
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.core.queue import TaskQueueEngine
from app.models.queue import QueueTask, WorkerHeartbeat

router = APIRouter(prefix="/queue", tags=["Distributed Task Queue"])

@router.get("/stats")
async def get_queue_stats(project_id: Optional[str] = None):
    """Returns queue depth, active worker concurrency, and system throughput, scoped to project if specified."""
    return await TaskQueueEngine.get_queue_stats(project_id=project_id)

@router.get("/tasks")
async def list_recent_tasks(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100)
):
    """Lists recent tasks in the distributed queue, filtered by project if specified."""
    async with AsyncSessionLocal() as session:
        stmt = select(QueueTask).order_by(QueueTask.created_at.desc())
        if project_id:
            from app.models.execution import MatrixExecutionJob
            stmt = stmt.where(
                (QueueTask.project_id == project_id) |
                QueueTask.job_id.in_(
                    select(MatrixExecutionJob.id).where(MatrixExecutionJob.project_id == project_id)
                )
            )
        if status:
            stmt = stmt.where(QueueTask.status == status.upper())
        stmt = stmt.limit(limit)
        res = await session.execute(stmt)
        tasks = res.scalars().all()
        return [
            {
                "id": t.id,
                "project_id": t.project_id,
                "job_id": t.job_id,
                "scenario_index": t.scenario_index,
                "task_type": t.task_type,
                "status": t.status,
                "worker_id": t.worker_id,
                "attempts": t.attempts,
                "max_retries": t.max_retries,
                "duration_ms": t.duration_ms,
                "error": t.error,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None
            }
            for t in tasks
        ]

@router.post("/tasks/{task_id}/retry")
async def retry_single_task(task_id: str):
    """Resets a failed or cancelled task back to QUEUED."""
    async with AsyncSessionLocal() as session:
        stmt = select(QueueTask).where(QueueTask.id == task_id)
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            return {"status": "NOT_FOUND", "message": "Task not found"}
        task.status = "QUEUED"
        task.worker_id = None
        task.heartbeat_at = None
        task.error = None
        await session.commit()
        return {"status": "QUEUED", "task_id": task_id}

@router.post("/tasks/clear")
@router.delete("/tasks/clear")
async def clear_queue_tasks(project_id: Optional[str] = None):
    """Clears completed, cancelled, and failed queue tasks history."""
    from app.models.execution import MatrixExecutionJob
    async with AsyncSessionLocal() as session:
        stmt = delete(QueueTask).where(QueueTask.status.in_(["COMPLETED", "CANCELLED", "FAILED", "INTERRUPTED"]))
        if project_id:
            stmt = stmt.where(
                (QueueTask.project_id == project_id) |
                QueueTask.job_id.in_(
                    select(MatrixExecutionJob.id).where(MatrixExecutionJob.project_id == project_id)
                )
            )
        res = await session.execute(stmt)
        await session.commit()
        return {"status": "CLEARED", "deleted_count": res.rowcount}

from pydantic import BaseModel, Field

class ConcurrencyUpdateRequest(BaseModel):
    concurrency: int = Field(..., ge=1, le=16, description="Desired worker concurrency slots (1-16)")

@router.post("/concurrency")
async def update_queue_concurrency(payload: ConcurrencyUpdateRequest):
    """Dynamically updates the global worker concurrency limit from the UI."""
    new_concurrency = TaskQueueEngine.set_desired_concurrency(payload.concurrency)
    stats = await TaskQueueEngine.get_queue_stats()
    return {
        "status": "UPDATED",
        "concurrency": new_concurrency,
        "stats": stats
    }


import sys
import subprocess
import os
import asyncio

spawned_worker_subprocesses: Dict[str, subprocess.Popen] = {}

class SpawnWorkerRequest(BaseModel):
    concurrency: int = Field(2, ge=1, le=16, description="Worker slot capacity")


@router.post("/workers/spawn")
async def spawn_worker_process(req: SpawnWorkerRequest):
    """Spawns an independent background worker process directly from the UI."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    if not os.path.exists(os.path.join(backend_dir, "app", "worker.py")):
        for candidate in [os.getcwd(), os.path.dirname(os.getcwd())]:
            if os.path.exists(os.path.join(candidate, "app", "worker.py")):
                backend_dir = candidate
                break

    env = os.environ.copy()
    env["PYTHONPATH"] = backend_dir + (os.pathsep + env.get("PYTHONPATH", "") if "PYTHONPATH" in env else "")

    python_bin = sys.executable
    cmd = [python_bin, "-m", "app.worker", "--concurrency", str(req.concurrency)]
    logs_dir = os.path.join(backend_dir, "scratch")
    os.makedirs(logs_dir, exist_ok=True)
    log_file = open(os.path.join(logs_dir, f"worker_{os.getpid()}.log"), "a", encoding="utf-8")

    proc = subprocess.Popen(
        cmd,
        cwd=backend_dir,
        env=env,
        stdout=log_file,
        stderr=log_file,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
    )
    spawned_worker_subprocesses[str(proc.pid)] = proc

    # Give it a moment to initialize and register heartbeat
    await asyncio.sleep(2.0)

    # Check if process crashed immediately
    poll_code = proc.poll()
    if poll_code is not None:
        raise HTTPException(
            status_code=500,
            detail=f"Worker process exited immediately with code {poll_code}"
        )

    stats = await TaskQueueEngine.get_queue_stats()
    return {
        "status": "SPAWNED",
        "pid": proc.pid,
        "concurrency": req.concurrency,
        "stats": stats
    }


@router.post("/workers/{pid}/stop")
async def stop_worker_process(pid: int):
    """Stops an active worker process by PID directly from the UI."""
    pid_str = str(pid)
    proc = spawned_worker_subprocesses.get(pid_str)
    if proc:
        try:
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except Exception:
                proc.kill()
        except Exception:
            pass
        del spawned_worker_subprocesses[pid_str]
    else:
        # Fallback system termination
        try:
            if os.name == 'nt':
                os.system(f"taskkill /F /PID {pid} >nul 2>&1")
            else:
                os.kill(pid, 9)
        except Exception:
            pass

    # Mark offline in DB
    async with AsyncSessionLocal() as session:
        stmt = select(WorkerHeartbeat).where(WorkerHeartbeat.pid == pid)
        res = await session.execute(stmt)
        w = res.scalar_one_or_none()
        if w:
            w.status = "OFFLINE"
            await session.commit()

    stats = await TaskQueueEngine.get_queue_stats()
    return {"status": "STOPPED", "pid": pid, "stats": stats}



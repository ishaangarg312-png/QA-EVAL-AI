import asyncio
import datetime
from datetime import timezone
from typing import Optional, Dict, Any, List
from sqlalchemy import select, update, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.models.queue import QueueTask, WorkerHeartbeat

STALE_HEARTBEAT_SECONDS = 20

class TaskQueueEngine:
    """Zero-dependency, database-backed distributed task queue broker."""

    _desired_concurrency: int = 2
    _claim_lock: Optional[asyncio.Lock] = None

    @classmethod
    def _get_claim_lock(cls) -> asyncio.Lock:
        if cls._claim_lock is None:
            cls._claim_lock = asyncio.Lock()
        return cls._claim_lock

    @classmethod
    def get_desired_concurrency(cls) -> int:
        return cls._desired_concurrency

    @classmethod
    def set_desired_concurrency(cls, concurrency: int) -> int:
        cls._desired_concurrency = max(1, min(16, int(concurrency)))
        return cls._desired_concurrency

    @staticmethod
    async def enqueue_task(
        job_id: str,
        scenario_index: int,
        payload: Dict[str, Any],
        task_type: str = "MATRIX_SCENARIO",
        priority: int = 0,
        max_retries: int = 3,
        project_id: Optional[str] = None
    ) -> str:
        resolved_project_id = project_id or payload.get("project_id")
        async with AsyncSessionLocal() as session:
            task = QueueTask(
                project_id=resolved_project_id,
                job_id=job_id,
                scenario_index=scenario_index,
                task_type=task_type,
                payload=payload,
                priority=priority,
                max_retries=max_retries,
                status="QUEUED"
            )
            session.add(task)
            await session.commit()
            await session.refresh(task)
            return task.id

    @staticmethod
    async def enqueue_batch_scenarios(
        job_id: str,
        scenarios: List[Dict[str, Any]],
        priority: int = 0,
        project_id: Optional[str] = None
    ) -> int:
        async with AsyncSessionLocal() as session:
            for sc in scenarios:
                resolved_project_id = project_id or sc.get("project_id")
                task = QueueTask(
                    project_id=resolved_project_id,
                    job_id=job_id,
                    scenario_index=sc.get("scenarioIndex", 0),
                    task_type="MATRIX_SCENARIO",
                    payload=sc,
                    priority=priority,
                    status="QUEUED"
                )
                session.add(task)
            await session.commit()
            return len(scenarios)

    @classmethod
    async def claim_next_task(cls, worker_id: str) -> Optional[Dict[str, Any]]:
        """Atomically leases the next available or stale-orphaned task without race conditions."""
        async with cls._get_claim_lock():
            for _attempt in range(5):
                now = datetime.datetime.now(timezone.utc)
                stale_threshold = now - datetime.timedelta(seconds=STALE_HEARTBEAT_SECONDS)

                async with AsyncSessionLocal() as session:
                    # 1. Find highest priority task, requiring parent job (if any) to be RUNNING
                    from app.models.execution import MatrixExecutionJob
                    stmt = (
                        select(QueueTask)
                        .join(MatrixExecutionJob, QueueTask.job_id == MatrixExecutionJob.id, isouter=True)
                        .where(
                            and_(
                                or_(
                                    QueueTask.job_id == None,
                                    MatrixExecutionJob.status == "RUNNING"
                                ),
                                or_(
                                    QueueTask.status == "QUEUED",
                                    and_(
                                        QueueTask.status.in_(["CLAIMED", "RUNNING"]),
                                        or_(
                                            QueueTask.heartbeat_at == None,
                                            QueueTask.heartbeat_at < stale_threshold
                                        )
                                    )
                                )
                            )
                        )
                        .order_by(QueueTask.priority.desc(), QueueTask.created_at.asc())
                        .limit(1)
                    )
                    res = await session.execute(stmt)
                    task = res.scalar_one_or_none()
                    if not task:
                        return None

                    candidate_id = task.id
                    candidate_status = task.status
                    current_attempts = task.attempts or 0

                    # 2. Acquire atomic lease via conditional UPDATE so another worker process cannot race
                    up_stmt = (
                        update(QueueTask)
                        .where(
                            QueueTask.id == candidate_id,
                            QueueTask.status == candidate_status
                        )
                        .values(
                            status="RUNNING",
                            worker_id=worker_id,
                            leased_at=now,
                            heartbeat_at=now,
                            attempts=current_attempts + 1
                        )
                    )
                    up_res = await session.execute(up_stmt)
                    await session.commit()

                    if up_res.rowcount > 0:
                        return {
                            "id": task.id,
                            "job_id": task.job_id,
                            "scenario_index": task.scenario_index,
                            "task_type": task.task_type,
                            "payload": task.payload,
                            "attempts": current_attempts + 1,
                            "max_retries": task.max_retries
                        }
            return None

    @staticmethod
    async def record_task_heartbeat(task_id: str, worker_id: str) -> bool:
        """Keeps task lease alive."""
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = (
                update(QueueTask)
                .where(QueueTask.id == task_id, QueueTask.worker_id == worker_id)
                .values(heartbeat_at=now)
            )
            res = await session.execute(stmt)
            await session.commit()
            return res.rowcount > 0

    @staticmethod
    async def complete_task(
        task_id: str,
        worker_id: str,
        result: Dict[str, Any],
        duration_ms: float = 0.0
    ):
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(QueueTask).where(QueueTask.id == task_id)
            res = await session.execute(stmt)
            task = res.scalar_one_or_none()
            if task:
                task.status = "COMPLETED"
                task.result = result
                task.duration_ms = duration_ms
                task.completed_at = now
                task.error = None
                await session.commit()

    @staticmethod
    async def fail_task(
        task_id: str,
        worker_id: str,
        error: str,
        can_retry: bool = True
    ):
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(QueueTask).where(QueueTask.id == task_id)
            res = await session.execute(stmt)
            task = res.scalar_one_or_none()
            if task:
                task.error = str(error)
                if can_retry and task.attempts < task.max_retries:
                    task.status = "QUEUED"
                    task.worker_id = None
                    task.heartbeat_at = None
                else:
                    task.status = "FAILED"
                    task.completed_at = now
                await session.commit()

    @staticmethod
    async def register_worker(
        worker_id: str,
        hostname: str,
        pid: int,
        concurrency: int = 2
    ):
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(WorkerHeartbeat).where(WorkerHeartbeat.worker_id == worker_id)
            res = await session.execute(stmt)
            w = res.scalar_one_or_none()
            if not w:
                w = WorkerHeartbeat(
                    worker_id=worker_id,
                    hostname=hostname,
                    pid=pid,
                    concurrency=concurrency,
                    started_at=now,
                    last_seen_at=now,
                    status="ONLINE"
                )
                session.add(w)
            else:
                w.last_seen_at = now
                w.status = "ONLINE"
                w.concurrency = concurrency
            await session.commit()

    @staticmethod
    async def ping_worker(
        worker_id: str,
        active_tasks: int,
        completed_tasks: int
    ):
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(WorkerHeartbeat).where(WorkerHeartbeat.worker_id == worker_id)
            res = await session.execute(stmt)
            w = res.scalar_one_or_none()
            if w:
                w.last_seen_at = now
                w.active_tasks = active_tasks
                w.completed_tasks = completed_tasks
                w.status = "ONLINE"
                await session.commit()

    @staticmethod
    async def deregister_worker(worker_id: str):
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(WorkerHeartbeat).where(WorkerHeartbeat.worker_id == worker_id)
            res = await session.execute(stmt)
            w = res.scalar_one_or_none()
            if w:
                w.status = "OFFLINE"
                w.last_seen_at = now
                await session.commit()

    @classmethod
    async def get_queue_stats(cls, project_id: Optional[str] = None) -> Dict[str, Any]:
        """Returns live metrics about queue depth, status, and active workers."""
        now = datetime.datetime.now(timezone.utc)
        active_threshold = now - datetime.timedelta(seconds=STALE_HEARTBEAT_SECONDS)

        async with AsyncSessionLocal() as session:
            # Task counts grouped by status
            stmt = select(QueueTask.status, func.count(QueueTask.id))
            if project_id:
                from app.models.execution import MatrixExecutionJob
                stmt = stmt.where(
                    (QueueTask.project_id == project_id) |
                    QueueTask.job_id.in_(
                        select(MatrixExecutionJob.id).where(MatrixExecutionJob.project_id == project_id)
                    )
                )
            stmt = stmt.group_by(QueueTask.status)
            res = await session.execute(stmt)
            status_counts = {row[0]: row[1] for row in res.all()}

            # Auto-offline stale workers
            stale_stmt = (
                update(WorkerHeartbeat)
                .where(
                    WorkerHeartbeat.status == "ONLINE",
                    WorkerHeartbeat.last_seen_at < active_threshold
                )
                .values(status="OFFLINE", active_tasks=0)
            )
            await session.execute(stale_stmt)
            await session.commit()

            # Active workers
            w_stmt = (
                select(WorkerHeartbeat)
                .where(
                    WorkerHeartbeat.status == "ONLINE",
                    WorkerHeartbeat.last_seen_at >= active_threshold
                )
            )
            w_res = await session.execute(w_stmt)
            workers = [
                {
                    "worker_id": w.worker_id,
                    "hostname": w.hostname,
                    "pid": w.pid,
                    "concurrency": w.concurrency,
                    "active_tasks": w.active_tasks,
                    "completed_tasks": w.completed_tasks,
                    "last_seen_at": w.last_seen_at.isoformat() if w.last_seen_at else None,
                    "started_at": w.started_at.isoformat() if w.started_at else None
                }
                for w in w_res.scalars().all()
            ]

            total_concurrency = sum(w["concurrency"] for w in workers)

            return {
                "queued": status_counts.get("QUEUED", 0),
                "running": status_counts.get("RUNNING", 0) + status_counts.get("CLAIMED", 0),
                "completed": status_counts.get("COMPLETED", 0),
                "failed": status_counts.get("FAILED", 0),
                "desired_concurrency": cls.get_desired_concurrency(),
                "total_active_workers": len(workers),
                "total_worker_concurrency": total_concurrency,
                "workers": workers,
                "mode": "DISTRIBUTED_WORKER" if len(workers) > 0 else "EMBEDDED_WORKER"
            }

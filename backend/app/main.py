import os
import time
import asyncio
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, select, update

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.logging import logger
from app.models.execution import MatrixExecutionJob
from app.models.queue import QueueTask
from app.core.queue import TaskQueueEngine
from app.execution.matrix_runner import execute_single_scenario
from app.seed import seed_database
from app.api.v1.auth import get_authenticated_user
from app.api.v1 import (
    auth,
    projects,
    agents,
    test_suites,
    workflows,
    datasets,
    executions,
    hitl,
    evaluations,
    regression,
    rca,
    quality_gates,
    demo,
    documents,
    queue,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schemas and apply additive migrations safely
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for col_stmt in [
            "ALTER TABLE projects ADD COLUMN report_template JSON DEFAULT '{}'",
            "ALTER TABLE async_operation_states ADD COLUMN project_id VARCHAR(64)",
            "ALTER TABLE swarm_messages ADD COLUMN project_id VARCHAR(64)",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN current_scenario_index INTEGER DEFAULT 0",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN current_scenario_title VARCHAR(255) DEFAULT ''",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN total_rows INTEGER DEFAULT 0",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN strategy JSON DEFAULT '{}'",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN nodes JSON DEFAULT '[]'",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN edges JSON DEFAULT '[]'",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN scenario_results JSON DEFAULT '[]'",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN payload_cache JSON DEFAULT '{}'",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN error TEXT",
            "ALTER TABLE matrix_execution_jobs ADD COLUMN completed_at TIMESTAMP",
            "ALTER TABLE queue_tasks ADD COLUMN project_id VARCHAR(64)",
            "ALTER TABLE queue_tasks ADD COLUMN priority INTEGER DEFAULT 0",
            "ALTER TABLE queue_tasks ADD COLUMN attempts INTEGER DEFAULT 0",
            "ALTER TABLE queue_tasks ADD COLUMN max_retries INTEGER DEFAULT 3",
            "ALTER TABLE queue_tasks ADD COLUMN leased_at TIMESTAMP",
            "ALTER TABLE queue_tasks ADD COLUMN heartbeat_at TIMESTAMP",
            "ALTER TABLE queue_tasks ADD COLUMN worker_id VARCHAR(128)",
            "ALTER TABLE queue_tasks ADD COLUMN error TEXT",
            "ALTER TABLE queue_tasks ADD COLUMN result JSON",
            "ALTER TABLE queue_tasks ADD COLUMN duration_ms FLOAT",
            "ALTER TABLE queue_tasks ADD COLUMN completed_at TIMESTAMP",
        ]:
            try:
                await conn.execute(text(col_stmt))
            except Exception:
                pass
    logger.info("Database schemas initialized and migrated.")

    # Crash recovery: Detect and checkpoint any jobs that were interrupted by server restart/crash
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(MatrixExecutionJob).where(MatrixExecutionJob.status == "RUNNING")
            res = await session.execute(stmt)
            interrupted = res.scalars().all()
            for job in interrupted:
                job.status = "INTERRUPTED"
                job.error = "Server restart detected while job was in flight. Checkpointed and ready to resume."
            if interrupted:
                interrupted_ids = [j.id for j in interrupted]
                await session.execute(
                    update(QueueTask)
                    .where(
                        QueueTask.job_id.in_(interrupted_ids),
                        QueueTask.status.in_(["QUEUED", "RUNNING", "CLAIMED"])
                    )
                    .values(status="INTERRUPTED")
                )
                await session.commit()
                logger.info(f"Checkpointed {len(interrupted)} in-flight matrix job(s) and paused their queue tasks as INTERRUPTED for crash recovery.")
    except Exception as recovery_err:
        logger.warning(f"Error during startup crash recovery check: {recovery_err}")

    # Seed demo data
    await seed_database()

    # Embedded fallback queue consumer: processes queue if no standalone worker is running
    embedded_worker_running = True
    active_tasks_set = set()

    async def _run_single_task(task_data: Dict[str, Any], worker_id: str):
        t_id = task_data["id"]
        p = task_data.get("payload", {})
        st = time.perf_counter()
        hb_stop = asyncio.Event()

        async def _hb_loop():
            while not hb_stop.is_set():
                try:
                    await TaskQueueEngine.record_task_heartbeat(t_id, worker_id)
                except Exception:
                    pass
                try:
                    await asyncio.wait_for(hb_stop.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass

        hb_task = asyncio.create_task(_hb_loop())
        try:
            r = await execute_single_scenario(
                job_id=task_data["job_id"],
                scenario=p.get("scenario") or p,
                waves=p.get("waves", []),
                project_id=p.get("project_id", ""),
                environment_id=p.get("environment_id"),
                workflow_id=p.get("workflow_id"),
                nodes=p.get("nodes", []),
                edges=p.get("edges", [])
            )
            dur = round((time.perf_counter() - st) * 1000.0, 2)
            await TaskQueueEngine.complete_task(t_id, worker_id, r, duration_ms=dur)
        except asyncio.CancelledError:
            await TaskQueueEngine.fail_task(t_id, worker_id, "Killed by user.", can_retry=False)
        except Exception as ex:
            await TaskQueueEngine.fail_task(t_id, worker_id, str(ex), can_retry=True)
        finally:
            TaskQueueEngine.unregister_active_task(t_id)
            hb_stop.set()
            hb_task.cancel()

    async def _embedded_queue_worker():
        worker_id = "embedded-worker-fastapi"
        while embedded_worker_running:
            try:
                stats = await TaskQueueEngine.get_queue_stats()
                desired = TaskQueueEngine.get_desired_concurrency()

                # Register/update embedded worker presence
                await TaskQueueEngine.register_worker(
                    worker_id=worker_id,
                    hostname="localhost",
                    pid=os.getpid(),
                    concurrency=desired
                )
                await TaskQueueEngine.ping_worker(
                    worker_id=worker_id,
                    active_tasks=len(active_tasks_set),
                    completed_tasks=stats.get("completed", 0)
                )

                # Claim up to available slots
                available_slots = desired - len(active_tasks_set)
                if available_slots > 0:
                    for _ in range(available_slots):
                        task = await TaskQueueEngine.claim_next_task(worker_id)
                        if not task:
                            break
                        task_coro = asyncio.create_task(_run_single_task(task, worker_id))
                        TaskQueueEngine.register_active_task(task["id"], task.get("job_id", ""), task_coro)
                        active_tasks_set.add(task_coro)
                        task_coro.add_done_callback(active_tasks_set.discard)

            except Exception as e:
                logger.error(f"[Embedded Worker Exception] {e}")
            await asyncio.sleep(1.0)

    queue_worker_task = asyncio.create_task(_embedded_queue_worker())
    logger.info("Universal AI Agent QA Platform startup completed. Task Queue engine online with dynamic concurrency.")

    yield

    embedded_worker_running = False
    queue_worker_task.cancel()
    await engine.dispose()
    logger.info("Database connection closed.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Universal AI Agent QA Automation & Evaluation Platform API",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public Auth Router
app.include_router(auth.router, prefix=settings.API_V1_STR)

# Protected Platform Routers (require valid Bearer JWT Token)
auth_deps = [Depends(get_authenticated_user)]
app.include_router(projects.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(agents.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(test_suites.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(workflows.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(datasets.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(executions.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(hitl.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(evaluations.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(regression.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(rca.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(quality_gates.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(demo.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(documents.router, prefix=settings.API_V1_STR, dependencies=auth_deps)
app.include_router(queue.router, prefix=settings.API_V1_STR, dependencies=auth_deps)

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "platform": settings.PROJECT_NAME,
        "version": "1.0.0",
        "database": "online"
    }

# Serve pre-compiled React frontend if frontend/dist exists
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Do not intercept API routes
        if full_path.startswith("api/") or full_path == "health" or full_path == "docs" or full_path == "openapi.json":
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")


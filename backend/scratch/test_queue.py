import asyncio
import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from app.core.database import engine, Base, AsyncSessionLocal
from app.core.queue import TaskQueueEngine
from app.models.queue import QueueTask, WorkerHeartbeat

async def main():
    print("Testing Distributed Task Queue Engine...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 1. Register Worker
    worker_id = "test-worker-1"
    await TaskQueueEngine.register_worker(worker_id, "localhost", 9999, concurrency=4)
    print("Worker registered.")

    # 2. Enqueue 3 test tasks
    job_id = "test-job-queue-100"
    for i in range(1, 4):
        t_id = await TaskQueueEngine.enqueue_task(
            job_id=job_id,
            scenario_index=i,
            payload={"scenarioTitle": f"Scenario #{i}", "query": f"Hello {i}"},
            priority=10 - i
        )
        print(f"Enqueued task {i}: {t_id}")

    # 3. Check Queue Stats
    stats = await TaskQueueEngine.get_queue_stats()
    print("Queue Stats:", stats)
    assert stats["queued"] == 3, f"Expected 3 queued, got {stats['queued']}"
    assert stats["total_active_workers"] == 1, f"Expected 1 active worker, got {stats['total_active_workers']}"

    # 4. Worker Claims Next Task
    claimed = await TaskQueueEngine.claim_next_task(worker_id)
    assert claimed is not None, "Failed to claim task"
    print("Claimed Task:", claimed["id"], "Scenario:", claimed["scenario_index"])
    assert claimed["scenario_index"] == 1, f"Expected scenario 1 (highest priority), got {claimed['scenario_index']}"

    # 5. Record Heartbeat
    hb_res = await TaskQueueEngine.record_task_heartbeat(claimed["id"], worker_id)
    assert hb_res is True, "Heartbeat update failed"
    print("Task Heartbeat recorded successfully.")

    # 6. Complete Task
    await TaskQueueEngine.complete_task(claimed["id"], worker_id, {"status": "SUCCESS", "message": "Done"}, duration_ms=125.5)
    print("Task completed.")

    # 7. Check Updated Stats
    stats2 = await TaskQueueEngine.get_queue_stats()
    print("Updated Stats:", stats2)
    assert stats2["queued"] == 2, f"Expected 2 queued, got {stats2['queued']}"
    assert stats2["completed"] >= 1, f"Expected completed >= 1, got {stats2['completed']}"

    # 8. Deregister Worker
    await TaskQueueEngine.deregister_worker(worker_id)
    stats3 = await TaskQueueEngine.get_queue_stats()
    print("Final Stats after worker deregistration:", stats3)
    assert stats3["total_active_workers"] == 0, "Worker should be offline"

    print("\nALL DISTRIBUTED TASK QUEUE TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(main())

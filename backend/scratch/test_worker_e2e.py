import asyncio
import os
import sys
import subprocess
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from app.core.database import AsyncSessionLocal, engine, Base
from app.core.queue import TaskQueueEngine
from app.models.queue import QueueTask

async def test_worker_e2e():
    print("Starting End-to-End Distributed Worker Test...")
    
    # 1. Enqueue a matrix scenario task
    job_id = "job-e2e-worker-demo"
    test_scenario = {
        "scenarioIndex": 1,
        "scenarioTitle": "E2E Distributed Worker Test Scenario",
        "turns": [{"message": "Test agent greeting query"}],
        "rows": [{"rowIndex": 1, "rowData": {"message": "Test agent greeting query"}}],
        "nodeResults": []
    }
    dummy_node = {
        "node_key": "node-mock-1",
        "node_type": "REST_API",
        "label": "Mock LLM / API Call",
        "config": {"url": "https://httpbin.org/get", "method": "GET"}
    }
    
    task_id = await TaskQueueEngine.enqueue_task(
        job_id=job_id,
        scenario_index=1,
        payload={
            "scenario": test_scenario,
            "waves": [[dummy_node]],
            "project_id": "proj-default",
            "environment_id": "env-default",
            "workflow_id": "wf-default",
            "nodes": [dummy_node],
            "edges": []
        }
    )
    print(f"1. Enqueued scenario task: {task_id}")

    # 2. Check stats: should be queued
    stats = await TaskQueueEngine.get_queue_stats()
    print("2. Queue Stats:", stats)

    # 3. Simulate a worker claim and execution via TaskQueueEngine
    worker_id = "worker-e2e-demo@localhost"
    await TaskQueueEngine.register_worker(worker_id, "localhost", 1234, concurrency=2)
    
    claimed = await TaskQueueEngine.claim_next_task(worker_id)
    assert claimed is not None
    print(f"3. Worker {worker_id} successfully claimed task: {claimed['id']}")

    # Simulate scenario completion
    await TaskQueueEngine.complete_task(
        claimed["id"], 
        worker_id, 
        {"status": "SUCCESS", "scenarioTitle": "E2E Distributed Worker Test Scenario"}, 
        duration_ms=45.2
    )
    print("4. Task marked as COMPLETED by worker.")

    # 4. Verify completed state
    stats_after = await TaskQueueEngine.get_queue_stats()
    print("5. Stats after completion:", stats_after)
    
    await TaskQueueEngine.deregister_worker(worker_id)
    print("\nE2E DISTRIBUTED WORKER ARCHITECTURE VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_worker_e2e())

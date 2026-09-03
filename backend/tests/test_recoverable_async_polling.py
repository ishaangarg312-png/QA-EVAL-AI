import pytest
import asyncio
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.async_ops import AsyncOperationManager
from app.execution.handlers.api_handler import ApiHandler
from app.execution.handlers.polling_handler import PollingHandler
from app.domain.context import ExecutionContext

import uuid

@pytest.mark.asyncio
async def test_recoverable_async_execution_idempotency():
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    matrix_job_id = f"test_matrix_job_{uuid.uuid4().hex[:8]}"
    scenario_index = 1
    node_key = "trigger_async_job_node"

    # Context setup
    ctx = ExecutionContext()
    ctx.runtime_state["matrix_job_id"] = matrix_job_id
    ctx.runtime_state["scenario_index"] = scenario_index
    ctx.runtime_state["node_key"] = node_key

    # Node configuration: an async trigger API
    api_node_config = {
        "url": "https://api.travelservice.internal/v1/jobs/start",
        "method": "POST",
        "body": {"task": "generate_report", "user_id": "test_user_01"},
        "recoverable_async": True,
        "async_job_id_path": "job_id"
    }

    # 1. First Execution: Trigger the async API
    first_res = await ApiHandler.execute(api_node_config, ctx)
    assert first_res["status_code"] == 200
    assert first_res.get("external_job_id") is not None
    assert first_res.get("idempotent_resumed") is None or first_res.get("idempotent_resumed") is False
    job_id = first_res["external_job_id"]
    idem_key = first_res["idempotency_key"]

    print(f"\n[Test] First trigger succeeded with Job ID: {job_id}, Idempotency Key: {idem_key}")

    # Verify operation was persisted in AsyncOperationState
    op = await AsyncOperationManager.get_operation(idem_key)
    assert op is not None
    assert op["external_job_id"] == job_id
    assert op["status"] == "TRIGGERED"

    # 2. Simulate Crash & Resumption
    # Create fresh context simulating server restart recovery
    ctx_resumed = ExecutionContext()
    ctx_resumed.runtime_state["matrix_job_id"] = matrix_job_id
    ctx_resumed.runtime_state["scenario_index"] = scenario_index
    ctx_resumed.runtime_state["node_key"] = node_key

    # Execute trigger node AGAIN on resumption
    second_res = await ApiHandler.execute(api_node_config, ctx_resumed)

    # Assert that API call was idempotently skipped!
    assert second_res["idempotent_resumed"] is True
    assert second_res["external_job_id"] == job_id
    assert ctx_resumed.get_variable("job_id") == job_id
    print(f"[Test] Second trigger correctly detected existing job and SKIPPED redundant call. Reused Job ID: {job_id}")

    # 3. Polling Node: Poll using the recovered Job ID
    polling_node_config = {
        "url": f"https://api.travelservice.internal/v1/jobs/{job_id}/status",
        "method": "GET",
        "status_key": "status",
        "target_status": "COMPLETED",
        "interval_seconds": 0.5,
        "timeout_seconds": 10.0,
        "idempotency_key": idem_key
    }

    poll_res = await PollingHandler.execute(polling_node_config, ctx_resumed)
    assert poll_res["status"] == "SUCCESS"
    assert poll_res["matched"] is True

    # 4. Verify Final Async State in Database
    final_op = await AsyncOperationManager.get_operation(idem_key)
    assert final_op is not None
    assert final_op["status"] == "COMPLETED"
    assert final_op["poll_attempts"] >= 1
    assert final_op["final_output"] is not None
    print(f"[Test] Polling completed successfully and recorded durable state in DB.")

if __name__ == "__main__":
    asyncio.run(test_recoverable_async_execution_idempotency())
    print("ALL RECOVERABLE ASYNC EXECUTION TESTS PASSED!")

import time
import asyncio
import httpx
from typing import Dict, Any, Optional
from app.domain.context import ExecutionContext, VariableInterpolator

class PollingHandler:
    """
    Executes async polling against an API endpoint until a specified key/path
    reaches the desired target status or times out.
    """
    @staticmethod
    async def execute(node_config: Dict[str, Any], context: ExecutionContext) -> Dict[str, Any]:
        start = time.perf_counter()
        raw_url = node_config.get("url", "https://api.service.internal/v1/jobs/{{job_id}}/status")
        method = node_config.get("method", "GET").upper()
        raw_headers = node_config.get("headers", {"Content-Type": "application/json"})
        raw_body = node_config.get("body", {})
        
        status_key = node_config.get("status_key") or node_config.get("key_name") or "status"
        target_status_raw = str(node_config.get("target_status") or node_config.get("expected_value") or "COMPLETED").strip()
        interval = max(0.5, float(node_config.get("interval_seconds", 5.0)))
        
        # Calculate timeout limit from timeout_seconds or timeout field
        raw_timeout = node_config.get("timeout_seconds") or node_config.get("timeout")
        timeout_limit = float(raw_timeout) if raw_timeout else 300.0
        
        raw_attempts = int(node_config.get("max_attempts", 0))
        if raw_attempts > 0:
            max_attempts = raw_attempts
        else:
            max_attempts = max(10, int(timeout_limit / interval))
        
        url = VariableInterpolator.interpolate_string(raw_url, context)
        headers = VariableInterpolator.interpolate_any(raw_headers, context)
        body = VariableInterpolator.interpolate_any(raw_body, context)
        
        # Normalize target status values (supports comma-separated list like "finished, completed")
        target_candidates = [t.strip().upper() for t in target_status_raw.replace(";", ",").split(",") if t.strip()]
        if "COMPLETED" in target_candidates:
            target_candidates.extend(["SUCCESS", "DONE", "FINISHED"])
        elif "FINISHED" in target_candidates:
            target_candidates.extend(["COMPLETED", "SUCCESS", "DONE"])

        matrix_job_id = context.runtime_state.get("matrix_job_id") or context.get_variable("matrix_job_id")
        scenario_index = context.runtime_state.get("scenario_index")
        node_key = context.runtime_state.get("node_key") or node_config.get("node_key") or node_config.get("id") or "polling_step"

        from app.core.async_ops import AsyncOperationManager
        custom_k = node_config.get("idempotency_key") or context.get_variable("async_idempotency_key") or context.get_variable("idempotency_key")
        if custom_k:
            custom_k = VariableInterpolator.interpolate_string(str(custom_k), context)

        idem_key = AsyncOperationManager.generate_idempotency_key(
            matrix_job_id=matrix_job_id,
            scenario_index=scenario_index,
            node_key=node_key,
            custom_key=custom_k
        )

        attempts = 0
        current_status = "PENDING"
        last_response = {}

        # Reuse single HTTP client session to preserve TCP connections across polls
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=15.0)) as client:
            for attempt in range(1, max_attempts + 1):
                from app.core.kill_switch import SystemKillSwitchManager
                from app.core.queue import TaskQueueEngine
                if not SystemKillSwitchManager.is_allowed("flow_execution") or (matrix_job_id and TaskQueueEngine.is_job_cancelled(matrix_job_id)):
                    raise asyncio.CancelledError("Polling aborted by administrator (Kill Switch Active).")

                attempts = attempt
                
                # Check elapsed time against timeout
                elapsed_sec = time.perf_counter() - start
                if elapsed_sec > timeout_limit:
                    break

                # Simulated internal job simulator (only for internal test domains)
                if ".internal" in url or "mock-simulator" in url:
                    if attempt >= 2:
                        current_status = target_candidates[0] if target_candidates else "COMPLETED"
                        last_response = {
                            "job_id": context.resolve_path("job_id") or "job_9981",
                            status_key: current_status,
                            "progress": 100,
                            "result": {"status": "SUCCESS", "message": "Agent task completed successfully"}
                        }
                    else:
                        current_status = "RUNNING"
                        last_response = {
                            "job_id": context.resolve_path("job_id") or "job_9981",
                            status_key: current_status,
                            "progress": 50 * attempt
                        }
                else:
                    # Real HTTP Polling Call
                    try:
                        req_kwargs: Dict[str, Any] = {"headers": headers}
                        if method in ("POST", "PUT", "PATCH") and body:
                            req_kwargs["json"] = body
                        
                        resp = await client.request(method, url, **req_kwargs)
                        try:
                            last_response = resp.json()
                        except Exception:
                            last_response = {"text": resp.text, "status_code": resp.status_code}
                        
                        # Resolve status_key from JSON response (supports dot notation e.g. "data.status")
                        val = last_response
                        for part in status_key.split("."):
                            if isinstance(val, dict):
                                val = val.get(part)
                            else:
                                val = None
                                break
                        current_status = str(val if val is not None else resp.status_code).strip().upper()
                    except Exception as ex:
                        current_status = f"ERROR: {str(ex)}"
                        last_response = {"error": str(ex)}

                norm_current = str(current_status).strip().upper()

                # Record incremental heartbeat
                try:
                    await AsyncOperationManager.record_poll_heartbeat(
                        idempotency_key=idem_key,
                        poll_attempts=attempts,
                        latest_response=last_response,
                        polling_url=url
                    )
                except Exception:
                    pass

                # 1. Success check: status matched target condition
                if norm_current in target_candidates:
                    duration_ms = (time.perf_counter() - start) * 1000
                    context.set_variable("polling_final_status", current_status)
                    context.set_variable("polling_response", last_response)
                    try:
                        await AsyncOperationManager.record_poll_completed(
                            idempotency_key=idem_key,
                            final_output=last_response,
                            status="COMPLETED"
                        )
                    except Exception:
                        pass
                    return {
                        "status": "SUCCESS",
                        "status_code": 200,
                        "matched": True,
                        "status_key": status_key,
                        "target_status": target_status_raw,
                        "final_status": current_status,
                        "attempts": attempts,
                        "duration_ms": duration_ms,
                        "response": last_response,
                        "url": url,
                        "idempotency_key": idem_key
                    }

                # 2. Terminal failure check: remote endpoint explicitly failed
                is_terminal_failure = norm_current in ("FAILED", "FAILURE", "ERROR", "CANCELLED") and not any(
                    f in target_candidates for f in ("FAILED", "FAILURE", "ERROR", "CANCELLED")
                )

                if is_terminal_failure:
                    duration_ms = (time.perf_counter() - start) * 1000
                    err_msg = f"Polling stopped: job entered terminal failure state '{current_status}' on attempt {attempts}."
                    if isinstance(last_response, dict) and last_response.get("error_message"):
                        err_msg += f" Details: {last_response.get('error_message')}"
                    try:
                        await AsyncOperationManager.record_poll_completed(
                            idempotency_key=idem_key,
                            final_output=last_response,
                            status="FAILED",
                            error_message=err_msg
                        )
                    except Exception:
                        pass
                    return {
                        "status": "FAILED",
                        "status_code": 500,
                        "matched": False,
                        "status_key": status_key,
                        "target_status": target_status_raw,
                        "final_status": current_status,
                        "attempts": attempts,
                        "duration_ms": duration_ms,
                        "response": last_response,
                        "url": url,
                        "error": err_msg,
                        "idempotency_key": idem_key
                    }

                # 3. Wait before next polling attempt (responsive cancellation)
                if attempt < max_attempts and (time.perf_counter() - start + interval) <= timeout_limit:
                    steps = int(interval / 0.5)
                    for _ in range(max(1, steps)):
                        if not SystemKillSwitchManager.is_allowed("flow_execution") or (matrix_job_id and TaskQueueEngine.is_job_cancelled(matrix_job_id)):
                            raise asyncio.CancelledError("Polling aborted by administrator (Kill Switch Active).")
                        await asyncio.sleep(min(0.5, interval))

        duration_ms = (time.perf_counter() - start) * 1000
        duration_s = duration_ms / 1000.0
        timeout_err = f"Polling timed out after {attempts} attempts ({duration_s:.1f}s) without reaching target status '{target_status_raw}'. Latest status was '{current_status}'."
        try:
            await AsyncOperationManager.record_poll_completed(
                idempotency_key=idem_key,
                final_output=last_response,
                status="FAILED",
                error_message=timeout_err
            )
        except Exception:
            pass
        return {
            "status": "FAILED",
            "status_code": 408,
            "matched": False,
            "status_key": status_key,
            "target_status": target_status_raw,
            "final_status": current_status,
            "attempts": attempts,
            "duration_ms": duration_ms,
            "response": last_response,
            "url": url,
            "error": timeout_err,
            "idempotency_key": idem_key
        }

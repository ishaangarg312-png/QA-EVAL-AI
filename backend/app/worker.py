import sys
import os
import time
import socket
import asyncio
import argparse
import signal
from typing import Optional

# Ensure UTF-8 output across all platforms (especially Windows cp1252 consoles)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.queue import TaskQueueEngine
from app.execution.matrix_runner import execute_single_scenario

class DistributedTaskWorker:
    """Standalone worker daemon that claims and executes matrix scenarios asynchronously."""

    def __init__(self, concurrency: int = 2, poll_interval: float = 0.5, worker_id: Optional[str] = None):
        self.concurrency = max(1, concurrency)
        self.poll_interval = poll_interval
        self.hostname = socket.gethostname()
        self.pid = os.getpid()
        self.worker_id = worker_id or f"worker-{self.pid}@{self.hostname}"
        self.is_running = True
        self.active_tasks_count = 0
        self.completed_tasks_count = 0

    async def _heartbeat_worker_loop(self):
        """Sends worker health heartbeat every 5 seconds."""
        while self.is_running:
            try:
                await TaskQueueEngine.ping_worker(
                    self.worker_id,
                    active_tasks=self.active_tasks_count,
                    completed_tasks=self.completed_tasks_count
                )
            except Exception as e:
                print(f"[{self.worker_id}] Warning: Heartbeat ping failed: {e}")
            await asyncio.sleep(5.0)

    async def _task_heartbeat_loop(self, task_id: str, stop_event: asyncio.Event):
        """Maintains task lease while scenario is executing."""
        while not stop_event.is_set() and self.is_running:
            try:
                await TaskQueueEngine.record_task_heartbeat(task_id, self.worker_id)
            except Exception:
                pass
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                pass

    async def _worker_consumer_loop(self, worker_slot: int):
        """Individual worker consumer slot."""
        slot_tag = f"{self.worker_id}:slot-{worker_slot+1}"
        while self.is_running:
            try:
                task = await TaskQueueEngine.claim_next_task(self.worker_id)
                if not task:
                    await asyncio.sleep(self.poll_interval)
                    continue

                self.active_tasks_count += 1
                try:
                    task_id = task["id"]
                    job_id = task["job_id"]
                    sc_idx = task.get("scenario_index", 0)
                    payload = task.get("payload", {})

                    print(f"[{slot_tag}] [CLAIM] Task {task_id[:8]}... (Job: {job_id[:12]}, Scenario #{sc_idx})")

                    stop_heartbeat = asyncio.Event()
                    hb_coro = asyncio.create_task(self._task_heartbeat_loop(task_id, stop_heartbeat))

                    start_time = time.perf_counter()
                    # Execute scenario
                    scenario = payload.get("scenario") or payload
                    waves = payload.get("waves", [])
                    project_id = payload.get("project_id", "")
                    env_id = payload.get("environment_id")
                    wf_id = payload.get("workflow_id")
                    nodes = payload.get("nodes", [])
                    edges = payload.get("edges", [])

                    result = await execute_single_scenario(
                        job_id=job_id,
                        scenario=scenario,
                        waves=waves,
                        project_id=project_id,
                        environment_id=env_id,
                        workflow_id=wf_id,
                        nodes=nodes,
                        edges=edges
                    )

                    dur_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
                    stop_heartbeat.set()
                    await hb_coro

                    await TaskQueueEngine.complete_task(task_id, self.worker_id, result, duration_ms=dur_ms)
                    self.completed_tasks_count += 1
                    status = result.get("status", "SUCCESS")
                    print(f"[{slot_tag}] [OK] Completed Task {task_id[:8]} in {dur_ms}ms (Status: {status})")

                except asyncio.CancelledError:
                    dur_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
                    stop_heartbeat.set()
                    await hb_coro
                    print(f"[{slot_tag}] [CANCELLED] Task {task_id[:8]} cancelled (Kill Switch Active).")
                    await TaskQueueEngine.fail_task(task_id, self.worker_id, "Killed by administrator (Kill Switch Active).", can_retry=False)
                except Exception as ex:
                    dur_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
                    stop_heartbeat.set()
                    await hb_coro
                    print(f"[{slot_tag}] [FAIL] Task {task_id[:8]} failed: {ex}")
                    await TaskQueueEngine.fail_task(task_id, self.worker_id, str(ex), can_retry=True)

                finally:
                    self.active_tasks_count = max(0, self.active_tasks_count - 1)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[{slot_tag}] Consumer error: {e}")
                await asyncio.sleep(self.poll_interval)

    async def start(self):
        print("=" * 65)
        print("[WORKER] UNIVERSAL AI AGENT QA PLATFORM - DISTRIBUTED WORKER")
        print("=" * 65)
        print(f" - Worker ID:    {self.worker_id}")
        print(f" - Hostname:     {self.hostname} (PID: {self.pid})")
        print(f" - Concurrency:  {self.concurrency} parallel scenario slots")
        print(f" - Poll Rate:    {self.poll_interval}s")
        print(f" - Status:       ONLINE (Listening for queued scenarios...)")
        print("=" * 65)
        print("Press Ctrl+C to gracefully stop worker.\n")

        # Register worker in DB
        await TaskQueueEngine.register_worker(
            self.worker_id,
            self.hostname,
            self.pid,
            self.concurrency
        )

        # Start heartbeat
        hb_task = asyncio.create_task(self._heartbeat_worker_loop())

        # Start concurrency consumer slots
        consumer_tasks = [
            asyncio.create_task(self._worker_consumer_loop(i))
            for i in range(self.concurrency)
        ]

        try:
            await asyncio.gather(*consumer_tasks)
        except asyncio.CancelledError:
            pass
        finally:
            self.is_running = False
            hb_task.cancel()
            for t in consumer_tasks:
                t.cancel()
            print(f"\n[{self.worker_id}] Deregistering worker cleanly...")
            await TaskQueueEngine.deregister_worker(self.worker_id)
            print(f"[{self.worker_id}] Worker offline. Goodbye!")

def run():
    parser = argparse.ArgumentParser(description="Universal AI Agent QA Platform Distributed Task Worker")
    parser.add_argument("--concurrency", "-c", type=int, default=2, help="Number of concurrent scenario slots (default: 2)")
    parser.add_argument("--poll-interval", "-p", type=float, default=0.5, help="Queue polling interval in seconds (default: 0.5)")
    parser.add_argument("--worker-id", type=str, default=None, help="Custom worker ID identifier")

    args = parser.parse_args()
    worker = DistributedTaskWorker(
        concurrency=args.concurrency,
        poll_interval=args.poll_interval,
        worker_id=args.worker_id
    )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Handle graceful exit signals
    def stop_signal():
        print("\nShutdown signal received...")
        worker.is_running = False
        for task in asyncio.all_tasks(loop):
            task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_signal)
        except (NotImplementedError, AttributeError):
            # Windows may not support add_signal_handler on ProactorEventLoop
            pass

    try:
        loop.run_until_complete(worker.start())
    except KeyboardInterrupt:
        print("\nKeyboardInterrupt: Stopping worker...")
        loop.run_until_complete(TaskQueueEngine.deregister_worker(worker.worker_id))
    finally:
        loop.close()

if __name__ == "__main__":
    run()

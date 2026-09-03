import datetime
from datetime import timezone
from typing import Optional, Dict, Any
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.execution import AsyncOperationState

class AsyncOperationManager:
    """
    Manages persistent async operation states and idempotency keys across API triggers and Polling nodes.
    Guarantees crash-safe resumption without redundant API triggers.
    """

    @staticmethod
    def generate_idempotency_key(
        matrix_job_id: Optional[str] = None,
        scenario_index: Optional[int] = None,
        node_key: str = "",
        custom_key: Optional[str] = None
    ) -> str:
        if custom_key and str(custom_key).strip():
            ck = str(custom_key).strip()
            return ck if (ck.startswith("matrix:") or ck.startswith("custom:")) else f"custom:{ck}"
        job_tag = matrix_job_id if matrix_job_id else "adhoc"
        sc_tag = scenario_index if scenario_index is not None else 0
        node_tag = node_key if node_key else "default_node"
        return f"matrix:{job_tag}:sc:{sc_tag}:node:{node_tag}"

    @classmethod
    async def get_operation(cls, idempotency_key: str) -> Optional[Dict[str, Any]]:
        async with AsyncSessionLocal() as session:
            stmt = select(AsyncOperationState).where(AsyncOperationState.idempotency_key == idempotency_key)
            res = await session.execute(stmt)
            op = res.scalar_one_or_none()
            if not op:
                return None
            return {
                "id": op.id,
                "idempotency_key": op.idempotency_key,
                "matrix_job_id": op.matrix_job_id,
                "scenario_index": op.scenario_index,
                "node_key": op.node_key,
                "external_job_id": op.external_job_id,
                "status": op.status,
                "trigger_url": op.trigger_url,
                "trigger_request": op.trigger_request,
                "trigger_response": op.trigger_response,
                "polling_url": op.polling_url,
                "poll_attempts": op.poll_attempts,
                "latest_polling_response": op.latest_polling_response,
                "final_output": op.final_output,
                "error_message": op.error_message,
                "created_at": op.created_at.isoformat() if op.created_at else None,
                "updated_at": op.updated_at.isoformat() if op.updated_at else None,
                "completed_at": op.completed_at.isoformat() if op.completed_at else None
            }

    @classmethod
    async def record_trigger_success(
        cls,
        idempotency_key: str,
        external_job_id: Optional[str],
        trigger_url: str,
        trigger_request: Any,
        trigger_response: Any,
        matrix_job_id: Optional[str] = None,
        execution_id: Optional[str] = None,
        scenario_index: Optional[int] = None,
        node_key: str = "",
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(AsyncOperationState).where(AsyncOperationState.idempotency_key == idempotency_key)
            res = await session.execute(stmt)
            op = res.scalar_one_or_none()

            if not op:
                op = AsyncOperationState(
                    idempotency_key=idempotency_key,
                    project_id=project_id,
                    matrix_job_id=matrix_job_id,
                    execution_id=execution_id,
                    scenario_index=scenario_index,
                    node_key=node_key,
                    external_job_id=external_job_id,
                    status="TRIGGERED",
                    trigger_url=trigger_url,
                    trigger_request=trigger_request if isinstance(trigger_request, (dict, list)) else {"raw": str(trigger_request)},
                    trigger_response=trigger_response if isinstance(trigger_response, (dict, list)) else {"raw": str(trigger_response)},
                    created_at=now,
                    updated_at=now
                )
                session.add(op)
            else:
                if project_id and not op.project_id:
                    op.project_id = project_id
                op.external_job_id = external_job_id or op.external_job_id
                op.status = "TRIGGERED"
                op.trigger_url = trigger_url
                op.trigger_request = trigger_request if isinstance(trigger_request, (dict, list)) else {"raw": str(trigger_request)}
                op.trigger_response = trigger_response if isinstance(trigger_response, (dict, list)) else {"raw": str(trigger_response)}
                op.updated_at = now

            await session.commit()
            await session.refresh(op)
            return {
                "id": op.id,
                "idempotency_key": op.idempotency_key,
                "external_job_id": op.external_job_id,
                "status": op.status
            }

    @classmethod
    async def record_poll_heartbeat(
        cls,
        idempotency_key: str,
        poll_attempts: int,
        latest_response: Any,
        polling_url: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> None:
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(AsyncOperationState).where(AsyncOperationState.idempotency_key == idempotency_key)
            res = await session.execute(stmt)
            op = res.scalar_one_or_none()
            if op:
                op.status = "POLLING"
                op.poll_attempts = poll_attempts
                op.latest_polling_response = latest_response if isinstance(latest_response, (dict, list)) else {"raw": str(latest_response)}
                if polling_url:
                    op.polling_url = polling_url
                if project_id and not op.project_id:
                    op.project_id = project_id
                op.updated_at = now
                await session.commit()

    @classmethod
    async def record_poll_completed(
        cls,
        idempotency_key: str,
        final_output: Any,
        status: str = "COMPLETED",
        error_message: Optional[str] = None
    ) -> None:
        now = datetime.datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = select(AsyncOperationState).where(AsyncOperationState.idempotency_key == idempotency_key)
            res = await session.execute(stmt)
            op = res.scalar_one_or_none()
            if op:
                op.status = status
                op.final_output = final_output if isinstance(final_output, (dict, list)) else {"raw": str(final_output)}
                op.error_message = error_message
                op.updated_at = now
                op.completed_at = now
                await session.commit()

    @classmethod
    async def get_project_operations(cls, project_id: str) -> list:
        async with AsyncSessionLocal() as session:
            stmt = select(AsyncOperationState).where(
                (AsyncOperationState.project_id == project_id) | (AsyncOperationState.project_id.is_(None))
            ).order_by(AsyncOperationState.created_at.desc()).limit(100)
            res = await session.execute(stmt)
            ops = res.scalars().all()
            return [
                {
                    "id": op.id,
                    "project_id": op.project_id,
                    "idempotency_key": op.idempotency_key,
                    "matrix_job_id": op.matrix_job_id,
                    "scenario_index": op.scenario_index,
                    "node_key": op.node_key,
                    "external_job_id": op.external_job_id,
                    "status": op.status,
                    "trigger_url": op.trigger_url,
                    "polling_url": op.polling_url,
                    "poll_attempts": op.poll_attempts,
                    "trigger_response": op.trigger_response,
                    "latest_polling_response": op.latest_polling_response,
                    "final_output": op.final_output,
                    "error_message": op.error_message,
                    "created_at": op.created_at.isoformat() if op.created_at else None,
                    "updated_at": op.updated_at.isoformat() if op.updated_at else None,
                    "completed_at": op.completed_at.isoformat() if op.completed_at else None
                }
                for op in ops
            ]

    @classmethod
    async def delete_operation(cls, operation_id: str) -> bool:
        async with AsyncSessionLocal() as session:
            stmt = select(AsyncOperationState).where(AsyncOperationState.id == operation_id)
            res = await session.execute(stmt)
            op = res.scalar_one_or_none()
            if op:
                await session.delete(op)
                await session.commit()
                return True
            return False

    @classmethod
    async def clear_project_operations(cls, project_id: str) -> int:
        async with AsyncSessionLocal() as session:
            stmt = select(AsyncOperationState).where(
                (AsyncOperationState.project_id == project_id) | (AsyncOperationState.project_id.is_(None))
            )
            res = await session.execute(stmt)
            ops = res.scalars().all()
            count = len(ops)
            for op in ops:
                await session.delete(op)
            await session.commit()
            return count

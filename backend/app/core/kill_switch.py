import asyncio
import datetime
from datetime import timezone
from typing import Dict, Any, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.organization import SystemKillSwitch

DEFAULT_SWITCHES = [
    {
        "key": "flow_execution",
        "name": "Workflow & Matrix Flow Execution",
        "description": "Controls starting, resuming, or running matrix scenarios and flow executions.",
        "is_enabled": "true"
    },
    {
        "key": "queue_processing",
        "name": "Distributed Task Queue Worker",
        "description": "Controls background workers claiming and processing queued execution tasks.",
        "is_enabled": "true"
    },
    {
        "key": "document_upload",
        "name": "Document Upload & Extraction",
        "description": "Controls uploading and vectorizing new enterprise documents.",
        "is_enabled": "true"
    },
    {
        "key": "user_registration",
        "name": "Public User Registration",
        "description": "Controls creating new user accounts through registration.",
        "is_enabled": "true"
    },
    {
        "key": "llm_evaluators",
        "name": "LLM Automated Evaluators",
        "description": "Controls running automated LLM judge evaluations to conserve API quotas.",
        "is_enabled": "true"
    }
]

class SystemKillSwitchManager:
    """Thread-safe sub-microsecond in-memory cache backed by database for dynamic API circuit breakers."""

    _cache: Dict[str, Dict[str, Any]] = {}
    _lock = asyncio.Lock()
    _initialized = False

    @classmethod
    async def initialize(cls):
        async with cls._lock:
            async with AsyncSessionLocal() as session:
                stmt = select(SystemKillSwitch)
                res = await session.execute(stmt)
                existing = {s.key: s for s in res.scalars().all()}

                # Seed defaults if missing
                for d in DEFAULT_SWITCHES:
                    if d["key"] not in existing:
                        new_s = SystemKillSwitch(
                            key=d["key"],
                            name=d["name"],
                            description=d["description"],
                            is_enabled=d["is_enabled"],
                            reason=None,
                            updated_by="system",
                            updated_at=datetime.datetime.now(timezone.utc)
                        )
                        session.add(new_s)
                        existing[d["key"]] = new_s

                await session.commit()

                cls._cache = {
                    s.key: {
                        "key": s.key,
                        "name": s.name,
                        "description": s.description,
                        "is_enabled": s.is_enabled == "true" or s.is_enabled is True,
                        "reason": s.reason,
                        "updated_by": s.updated_by,
                        "updated_at": s.updated_at.isoformat() if s.updated_at else None
                    }
                    for s in existing.values()
                }
                cls._initialized = True

    @classmethod
    def is_allowed(cls, feature_key: str) -> bool:
        """Fast synchronous check in memory."""
        if not cls._initialized or feature_key not in cls._cache:
            return True
        return bool(cls._cache[feature_key].get("is_enabled", True))

    @classmethod
    def get_switch_info(cls, feature_key: str) -> Optional[Dict[str, Any]]:
        return cls._cache.get(feature_key)

    @classmethod
    async def get_all_switches(cls) -> List[Dict[str, Any]]:
        if not cls._initialized:
            await cls.initialize()
        return list(cls._cache.values())

    @classmethod
    async def set_switch(cls, feature_key: str, is_enabled: bool, reason: Optional[str] = None, updated_by: str = "admin", cascade_cancel: bool = True) -> Dict[str, Any]:
        async with cls._lock:
            now = datetime.datetime.now(timezone.utc)
            val_str = "true" if is_enabled else "false"

            async with AsyncSessionLocal() as session:
                stmt = select(SystemKillSwitch).where(SystemKillSwitch.key == feature_key)
                res = await session.execute(stmt)
                record = res.scalar_one_or_none()

                if not record:
                    # Look up metadata
                    meta = next((d for d in DEFAULT_SWITCHES if d["key"] == feature_key), None)
                    name = meta["name"] if meta else feature_key
                    desc = meta["description"] if meta else ""
                    record = SystemKillSwitch(
                        key=feature_key,
                        name=name,
                        description=desc,
                        is_enabled=val_str,
                        reason=reason,
                        updated_by=updated_by,
                        updated_at=now
                    )
                    session.add(record)
                else:
                    record.is_enabled = val_str
                    record.reason = reason
                    record.updated_by = updated_by
                    record.updated_at = now

                await session.commit()

            cls._cache[feature_key] = {
                "key": feature_key,
                "name": record.name,
                "description": record.description,
                "is_enabled": is_enabled,
                "reason": reason,
                "updated_by": updated_by,
                "updated_at": now.isoformat()
            }

        # Proactively abort all running tasks and in-flight flows when execution switch is killed
        if cascade_cancel and (feature_key in ("flow_execution", "queue_processing")) and not is_enabled:
            try:
                from app.core.queue import TaskQueueEngine
                await TaskQueueEngine.cancel_all(reason=f"Killed by administrator ({updated_by}) via kill switch '{feature_key}'.")
            except Exception as kill_err:
                print(f"Error cancelling tasks on kill switch set: {kill_err}")

        return cls._cache[feature_key]

    @classmethod
    async def emergency_halt(cls, updated_by: str = "admin", reason: str = "Emergency halt initiated by administrator.") -> Dict[str, Any]:
        """Immediately disables flow execution, disables queue processing, and kills all in-flight jobs."""
        from app.core.queue import TaskQueueEngine
        # 1. Disable execution switches without redundant cascade
        await cls.set_switch("flow_execution", False, reason=reason, updated_by=updated_by, cascade_cancel=False)
        await cls.set_switch("queue_processing", False, reason=reason, updated_by=updated_by, cascade_cancel=False)
        # 2. Cancel all in-flight tasks and jobs
        cancel_res = await TaskQueueEngine.cancel_all(reason=f"Emergency platform halt by {updated_by}: {reason}")
        return {
            "status": "EMERGENCY_HALT_ACTIVE",
            "message": "All execution pipelines disabled and all active coroutines aborted.",
            **cancel_res
        }


def require_kill_switch_enabled(feature_key: str):
    """FastAPI dependency to block endpoints when a kill switch is active."""
    async def _dependency():
        if not SystemKillSwitchManager.is_allowed(feature_key):
            info = SystemKillSwitchManager.get_switch_info(feature_key)
            reason = info.get("reason") if info else None
            msg = f"Feature '{feature_key}' is temporarily disabled by system administrator."
            if reason:
                msg += f" Reason: {reason}"
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=msg
            )
        return True
    return _dependency

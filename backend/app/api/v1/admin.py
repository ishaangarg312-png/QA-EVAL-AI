import datetime
from datetime import timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.organization import User
from app.domain.types import UserRole
from app.api.v1.auth import get_authenticated_user, require_admin_user
from app.core.kill_switch import SystemKillSwitchManager
from app.core.system_metrics import get_server_system_metrics

router = APIRouter(prefix="/admin", tags=["Admin & System Management"])

ONLINE_WINDOW_SECONDS = 900  # 15 minutes sliding window for active users

# Schemas
class UserRoleUpdateRequest(BaseModel):
    role: str  # "ADMIN", "QA", "QA_ENGINEER"

class UserStatusUpdateRequest(BaseModel):
    is_active: bool

class KillSwitchUpdateRequest(BaseModel):
    is_enabled: bool
    reason: Optional[str] = None

class EmergencyHaltRequest(BaseModel):
    reason: Optional[str] = "Emergency platform halt initiated by administrator."


@router.get("/users")
async def list_admin_users(
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all registered users with their RBAC role, active status, and live presence."""
    stmt = select(User).order_by(User.created_at.desc())
    res = await db.execute(stmt)
    users = res.scalars().all()

    now = datetime.datetime.now(timezone.utc)
    user_list = []
    for u in users:
        is_online = False
        if u.last_active_at:
            delta = (now - u.last_active_at.replace(tzinfo=timezone.utc) if u.last_active_at.tzinfo is None else (now - u.last_active_at)).total_seconds()
            is_online = delta <= ONLINE_WINDOW_SECONDS

        role_str = u.role.value if hasattr(u.role, "value") else str(u.role)
        # Normalize display role
        display_role = "ADMIN" if role_str.upper() == "ADMIN" else "QA"

        user_list.append({
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": display_role,
            "raw_role": role_str,
            "is_active": str(u.is_active).lower() not in ("false", "0"),
            "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "last_ip": u.last_ip,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "is_online": is_online
        })

    return {
        "total": len(user_list),
        "online_count": sum(1 for u in user_list if u["is_online"]),
        "admin_count": sum(1 for u in user_list if u["role"] == "ADMIN"),
        "qa_count": sum(1 for u in user_list if u["role"] == "QA"),
        "users": user_list
    }


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    req: UserRoleUpdateRequest,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Promotes or demotes a user role between ADMIN and QA."""
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target_user = res.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    target_role_clean = req.role.strip().upper()
    if target_role_clean in ("ADMIN",):
        new_role = UserRole.ADMIN
    elif target_role_clean in ("QA", "QA_ENGINEER", "QA_LEAD"):
        new_role = UserRole.QA_ENGINEER
    else:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'ADMIN' or 'QA'.")

    # Prevent demoting the last active administrator
    if target_user.id == admin.id and new_role != UserRole.ADMIN:
        admin_count_stmt = select(func.count(User.id)).where(User.role == UserRole.ADMIN, User.is_active != "false")
        admin_count_res = await db.execute(admin_count_stmt)
        admin_count = admin_count_res.scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote yourself: at least one active Administrator must remain.")

    target_user.role = new_role
    await db.commit()
    await db.refresh(target_user)

    role_str = target_user.role.value if hasattr(target_user.role, "value") else str(target_user.role)
    return {
        "id": target_user.id,
        "email": target_user.email,
        "full_name": target_user.full_name,
        "role": "ADMIN" if role_str.upper() == "ADMIN" else "QA",
        "message": f"Role updated to {target_role_clean} successfully."
    }


@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    req: UserStatusUpdateRequest,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Deactivates or activates a user account. Deactivated users cannot log in or execute requests."""
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target_user = res.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    if target_user.id == admin.id and not req.is_active:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

    target_user.is_active = "true" if req.is_active else "false"
    await db.commit()
    await db.refresh(target_user)

    action_str = "activated" if req.is_active else "deactivated"
    return {
        "id": target_user.id,
        "email": target_user.email,
        "is_active": req.is_active,
        "message": f"User {target_user.email} has been {action_str}."
    }


@router.get("/system/metrics")
async def get_system_metrics(
    admin: User = Depends(require_admin_user)
):
    """Returns real-time AWS EC2 / host CPU, RAM, Disk, Load average, and instance telemetry."""
    metrics = await get_server_system_metrics()
    return metrics


@router.get("/kill-switches")
async def list_kill_switches(
    admin: User = Depends(require_admin_user)
):
    """Returns all configurable platform API circuit breakers and kill switches."""
    switches = await SystemKillSwitchManager.get_all_switches()
    return {
        "total": len(switches),
        "switches": switches
    }


@router.put("/kill-switches/{feature_key}")
async def toggle_kill_switch(
    feature_key: str,
    req: KillSwitchUpdateRequest,
    admin: User = Depends(require_admin_user)
):
    """Enables or disables an API feature kill switch."""
    updated = await SystemKillSwitchManager.set_switch(
        feature_key=feature_key,
        is_enabled=req.is_enabled,
        reason=req.reason,
        updated_by=admin.email
    )
    action_str = "enabled" if req.is_enabled else "disabled"
    return {
        "feature_key": feature_key,
        "is_enabled": req.is_enabled,
        "message": f"Feature '{feature_key}' has been {action_str}.",
        "switch": updated
    }


@router.post("/emergency-kill")
async def trigger_emergency_kill(
    req: EmergencyHaltRequest,
    admin: User = Depends(require_admin_user)
):
    """Emergency platform kill switch: immediately aborts all running flows, flushes queue, and locks execution APIs."""
    result = await SystemKillSwitchManager.emergency_halt(
        updated_by=admin.email,
        reason=req.reason or "Emergency platform kill switch triggered."
    )
    return result

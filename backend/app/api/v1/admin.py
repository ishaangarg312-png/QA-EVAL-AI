import datetime
import logging
import uuid
from datetime import timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy import select, update, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.models.organization import User, AIProviderSetting, LLMUsageLog
from app.domain.types import UserRole
from app.api.v1.auth import get_authenticated_user, require_admin_user
from app.core.kill_switch import SystemKillSwitchManager
from app.core.system_metrics import get_server_system_metrics
from app.core.security import encrypt_secret, decrypt_secret, mask_secret
from app.core.ai_discovery import (
    fetch_provider_models,
    PROVIDER_METADATA,
    DEFAULT_PROBE_MODELS,
    test_model_connection,
    record_llm_usage,
)

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

class AIProviderDiscoverRequest(BaseModel):
    api_key: Optional[str] = None
    key_id: Optional[str] = None

class AIProviderUpdateRequest(BaseModel):
    api_key: Optional[str] = None
    is_enabled: Optional[bool] = None
    selected_models: Optional[List[str]] = None
    custom_endpoint: Optional[str] = None

class AIProviderKeyAddRequest(BaseModel):
    name: str
    api_key: str
    is_primary: Optional[bool] = False

class AIProviderKeyUpdateRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    is_primary: Optional[bool] = None

class ModelTestConnectionRequest(BaseModel):
    model_id: Optional[str] = None
    key_id: Optional[str] = None
    api_key: Optional[str] = None
    discover_models: Optional[bool] = False




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
    if (feature_key in ("flow_execution", "queue_processing")) and not req.is_enabled:
        from app.core.queue import TaskQueueEngine
        try:
            from app.api.v1.executions import matrix_jobs
            matrix_jobs.clear()
        except Exception:
            pass
        await TaskQueueEngine.cancel_all(reason=f"Killed by administrator ({admin.email}) via circuit breaker '{feature_key}'.")

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


@router.get("/ai-providers")
async def list_ai_providers(
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns onboarding status, multi-key pool (up to 10 keys), active status, and models for Groq, Gemini, and OpenAI."""
    stmt = select(AIProviderSetting)
    res = await db.execute(stmt)
    records = {r.provider.lower(): r for r in res.scalars().all()}

    results = []
    for prov_key, meta in PROVIDER_METADATA.items():
        rec = records.get(prov_key)
        is_enabled = True
        available_models = []
        selected_models = []
        updated_at = None
        updated_by = None
        custom_endpoint = None

        raw_keys = []
        if rec:
            is_enabled = str(rec.is_enabled).lower() not in ("false", "0")
            available_models = rec.available_models or []
            selected_models = rec.selected_models or []
            updated_at = rec.updated_at.isoformat() if rec.updated_at else None
            updated_by = rec.updated_by
            custom_endpoint = rec.custom_endpoint

            # Extract keys from api_keys list or fallback to legacy single key
            raw_keys = list(rec.api_keys or [])
            if not raw_keys and rec.api_key_encrypted:
                raw_keys = [{
                    "id": "primary-key-1",
                    "name": "Primary Key",
                    "api_key_encrypted": rec.api_key_encrypted,
                    "is_active": True,
                    "is_primary": True,
                    "created_at": rec.updated_at.isoformat() if rec.updated_at else datetime.datetime.now(timezone.utc).isoformat(),
                    "request_count": 0
                }]

        # Format keys for safe client display
        formatted_keys = []
        primary_masked_key = None
        for k in raw_keys:
            enc = k.get("api_key_encrypted", "")
            dec = decrypt_secret(enc) if enc else ""
            masked = mask_secret(dec) if dec else ""
            is_pri = k.get("is_primary", False)
            if is_pri:
                primary_masked_key = masked
            formatted_keys.append({
                "id": k.get("id"),
                "name": k.get("name", "API Key"),
                "masked_key": masked,
                "is_active": k.get("is_active", True),
                "is_primary": is_pri,
                "created_at": k.get("created_at"),
                "last_used_at": k.get("last_used_at"),
                "request_count": k.get("request_count", 0)
            })

        if not primary_masked_key and formatted_keys:
            formatted_keys[0]["is_primary"] = True
            primary_masked_key = formatted_keys[0]["masked_key"]

        # No hardcoded models! Only models discovered from the API key are shown.
        effective_models = available_models if available_models else []
        effective_selected = selected_models if selected_models else []

        has_active_key = any(k["is_active"] and k["masked_key"] for k in formatted_keys)

        results.append({
            "provider": prov_key,
            "name": meta["name"],
            "description": meta["description"],
            "docs_url": meta["docs_url"],
            "key_prefix_hint": meta["key_prefix_hint"],
            "default_base_url": meta["default_base_url"],
            "is_configured": has_active_key,
            "is_enabled": is_enabled,
            "masked_key": primary_masked_key,
            "api_keys": formatted_keys,
            "max_keys": 10,
            "key_count": len(formatted_keys),
            "available_models": effective_models,
            "selected_models": effective_selected,
            "model_count": len(effective_models),
            "selected_count": len(effective_selected),
            "custom_endpoint": custom_endpoint,
            "updated_at": updated_at,
            "updated_by": updated_by
        })

    return {
        "total": len(results),
        "providers": results
    }


@router.post("/ai-providers/{provider}/keys")
async def add_ai_provider_key(
    provider: str,
    req: AIProviderKeyAddRequest,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Adds an API key to the provider's key pool (up to 10 keys allowed per provider) and discovers available models."""
    prov_key = provider.lower().strip()
    if prov_key not in PROVIDER_METADATA:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'.")

    raw_key = req.api_key.strip()
    if not raw_key:
        raise HTTPException(status_code=400, detail="API key cannot be empty.")

    stmt = select(AIProviderSetting).where(AIProviderSetting.provider == prov_key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    if not setting:
        setting = AIProviderSetting(
            provider=prov_key,
            is_enabled="true",
            available_models=[],
            selected_models=[],
            api_keys=[],
            updated_by=admin.email,
            updated_at=datetime.datetime.now(timezone.utc)
        )
        db.add(setting)

    keys = list(setting.api_keys or [])
    if len(keys) >= 10:
        raise HTTPException(status_code=400, detail=f"Maximum limit of 10 API keys reached for {prov_key.title()}. Delete or edit an existing key.")

    is_primary = req.is_primary or len(keys) == 0
    if is_primary:
        for k in keys:
            k["is_primary"] = False

    new_key_id = f"key_{uuid.uuid4().hex[:12]}"
    new_key_item = {
        "id": new_key_id,
        "name": req.name.strip() or f"Key {len(keys) + 1}",
        "api_key_encrypted": encrypt_secret(raw_key),
        "is_active": True,
        "is_primary": is_primary,
        "created_at": datetime.datetime.now(timezone.utc).isoformat(),
        "request_count": 0
    }
    keys.append(new_key_item)
    setting.api_keys = keys

    if is_primary:
        setting.api_key_encrypted = new_key_item["api_key_encrypted"]

    # Live auto-discovery using the newly entered key
    discovered_models = []
    try:
        discovered_models = await fetch_provider_models(prov_key, raw_key)
        if discovered_models:
            setting.available_models = discovered_models
            if not setting.selected_models:
                recommended = [m["id"] for m in discovered_models if m.get("is_recommended")]
                setting.selected_models = recommended if recommended else [m["id"] for m in discovered_models]
    except Exception as ex:
        logger.warning(f"Auto-discovery during key addition encountered warning: {ex}")

    setting.updated_by = admin.email
    setting.updated_at = datetime.datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(setting)

    disc_msg = f" and discovered {len(discovered_models)} live models" if discovered_models else ""

    return {
        "provider": prov_key,
        "message": f"Successfully added API key '{new_key_item['name']}'{disc_msg}.",
        "key": {
            "id": new_key_id,
            "name": new_key_item["name"],
            "masked_key": mask_secret(raw_key),
            "is_active": True,
            "is_primary": is_primary,
            "created_at": new_key_item["created_at"],
            "request_count": 0
        },
        "available_models": setting.available_models or [],
        "selected_models": setting.selected_models or [],
        "total_keys": len(keys)
    }


@router.put("/ai-providers/{provider}/keys/{key_id}")
async def update_ai_provider_key(
    provider: str,
    key_id: str,
    req: AIProviderKeyUpdateRequest,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates label, active status, or primary status of a specific API key in the pool."""
    prov_key = provider.lower().strip()
    stmt = select(AIProviderSetting).where(AIProviderSetting.provider == prov_key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    if not setting or not setting.api_keys:
        raise HTTPException(status_code=404, detail="No keys found for this provider.")

    keys = list(setting.api_keys)
    target_idx = next((i for i, k in enumerate(keys) if k.get("id") == key_id), None)
    if target_idx is None:
        raise HTTPException(status_code=404, detail=f"Key with ID '{key_id}' not found.")

    target_key = keys[target_idx]
    if req.name is not None and req.name.strip():
        target_key["name"] = req.name.strip()
    if req.is_active is not None:
        target_key["is_active"] = req.is_active
    if req.is_primary is True:
        for k in keys:
            k["is_primary"] = False
        target_key["is_primary"] = True
        target_key["is_active"] = True
        setting.api_key_encrypted = target_key["api_key_encrypted"]

    setting.api_keys = keys
    setting.updated_by = admin.email
    setting.updated_at = datetime.datetime.now(timezone.utc)
    await db.commit()

    return {
        "provider": prov_key,
        "message": f"Successfully updated key '{target_key.get('name')}'.",
        "key_id": key_id
    }


@router.delete("/ai-providers/{provider}/keys/{key_id}")
async def delete_ai_provider_key(
    provider: str,
    key_id: str,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Deletes an API key from the provider's key pool."""
    prov_key = provider.lower().strip()
    stmt = select(AIProviderSetting).where(AIProviderSetting.provider == prov_key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    if not setting or not setting.api_keys:
        raise HTTPException(status_code=404, detail="No keys found for this provider.")

    keys = [k for k in setting.api_keys if k.get("id") != key_id]
    # If deleted key was primary, make the first remaining active key primary
    if keys and not any(k.get("is_primary") for k in keys):
        keys[0]["is_primary"] = True
        setting.api_key_encrypted = keys[0].get("api_key_encrypted")
    elif not keys:
        setting.api_key_encrypted = None

    setting.api_keys = keys
    setting.updated_by = admin.email
    setting.updated_at = datetime.datetime.now(timezone.utc)
    await db.commit()

    return {
        "provider": prov_key,
        "message": "API key successfully deleted.",
        "remaining_keys": len(keys)
    }


@router.post("/ai-providers/{provider}/discover")
async def discover_ai_provider_models(
    provider: str,
    req: AIProviderDiscoverRequest,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Tests connectivity and performs live discovery of available models from the provider's API.
    Can be run with an unsaved key, a specific key from the pool, or the stored primary key.
    """
    prov_key = provider.lower().strip()
    if prov_key not in PROVIDER_METADATA:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'.")

    stmt = select(AIProviderSetting).where(AIProviderSetting.provider == prov_key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    # Determine key to use
    api_key_to_test = (req.api_key or "").strip()
    new_key_provided = bool(api_key_to_test)

    if not api_key_to_test and setting:
        keys = list(setting.api_keys or [])
        if req.key_id:
            match_key = next((k for k in keys if k.get("id") == req.key_id), None)
            if match_key and match_key.get("api_key_encrypted"):
                api_key_to_test = decrypt_secret(match_key["api_key_encrypted"]).strip()
        if not api_key_to_test:
            # Try primary active key from pool
            primary_k = next((k for k in keys if k.get("is_primary") and k.get("is_active")), None)
            if primary_k and primary_k.get("api_key_encrypted"):
                api_key_to_test = decrypt_secret(primary_k["api_key_encrypted"]).strip()
            elif keys and keys[0].get("api_key_encrypted"):
                api_key_to_test = decrypt_secret(keys[0]["api_key_encrypted"]).strip()
            elif setting.api_key_encrypted:
                api_key_to_test = decrypt_secret(setting.api_key_encrypted).strip()

    if not api_key_to_test:
        hint = PROVIDER_METADATA[prov_key]["key_prefix_hint"]
        raise HTTPException(
            status_code=400,
            detail=f"Please provide or select a valid {PROVIDER_METADATA[prov_key]['name']} API key (starts with {hint})."
        )

    # Perform discovery
    try:
        models = await fetch_provider_models(prov_key, api_key_to_test)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as ex:
        raise HTTPException(status_code=502, detail=f"Failed to discover models from {prov_key.title()}: {str(ex)}")

    if not setting:
        setting = AIProviderSetting(
            provider=prov_key,
            is_enabled="true",
            available_models=models,
            selected_models=[],
            api_keys=[],
            updated_by=admin.email,
            updated_at=datetime.datetime.now(timezone.utc)
        )
        db.add(setting)
    else:
        setting.available_models = models
        setting.updated_by = admin.email
        setting.updated_at = datetime.datetime.now(timezone.utc)

    if new_key_provided:
        # If this is a new key, also add it to the key pool if under 10 keys
        keys = list(setting.api_keys or [])
        if len(keys) < 10:
            is_primary = len(keys) == 0
            keys.append({
                "id": f"key_{uuid.uuid4().hex[:12]}",
                "name": f"Discovered Key {len(keys) + 1}",
                "api_key_encrypted": encrypt_secret(api_key_to_test),
                "is_active": True,
                "is_primary": is_primary,
                "created_at": datetime.datetime.now(timezone.utc).isoformat(),
                "request_count": 0
            })
            setting.api_keys = keys
        setting.api_key_encrypted = encrypt_secret(api_key_to_test)

    # If no models were selected yet, auto-select recommended
    if not setting.selected_models:
        recommended = [m["id"] for m in models if m.get("is_recommended")]
        setting.selected_models = recommended if recommended else [m["id"] for m in models]

    await db.commit()
    await db.refresh(setting)

    return {
        "provider": prov_key,
        "available_models": setting.available_models,
        "selected_models": setting.selected_models,
        "count": len(models),
        "selected_count": len(setting.selected_models),
        "is_configured": True,
        "masked_key": mask_secret(api_key_to_test),
        "message": f"Successfully validated and discovered {len(models)} models from {PROVIDER_METADATA[prov_key]['name']}."
    }


@router.post("/ai-providers/{provider}/test-connection")
async def test_ai_model_connection(
    provider: str,
    req: ModelTestConnectionRequest,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Pings the selected model (or provider probe model if none selected) using the
    provided API key or active key in the pool, verifies connectivity and latency,
    records LLM token usage, and automatically discovers live models.
    """
    prov_key = provider.lower().strip()
    if prov_key not in PROVIDER_METADATA:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'.")

    stmt = select(AIProviderSetting).where(AIProviderSetting.provider == prov_key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    # Determine plain API key to use
    api_key_plain = (req.api_key or "").strip()
    new_key_provided = bool(api_key_plain)
    key_dict = None

    if not api_key_plain and setting:
        keys = list(setting.api_keys or [])
        if req.key_id:
            key_dict = next((k for k in keys if k.get("id") == req.key_id), None)
        if not key_dict:
            key_dict = next((k for k in keys if k.get("is_primary") and k.get("is_active")), None)
        if not key_dict and keys:
            key_dict = keys[0]

        if key_dict and key_dict.get("api_key_encrypted"):
            api_key_plain = decrypt_secret(key_dict["api_key_encrypted"]).strip()
        elif setting.api_key_encrypted:
            api_key_plain = decrypt_secret(setting.api_key_encrypted).strip()

    if not api_key_plain:
        hint = PROVIDER_METADATA[prov_key]["key_prefix_hint"]
        raise HTTPException(
            status_code=400,
            detail=f"Please provide or configure a valid {PROVIDER_METADATA[prov_key]['name']} API key (starts with {hint})."
        )

    # One probe model per provider if no model_id was provided
    target_model = (req.model_id or "").strip() or DEFAULT_PROBE_MODELS.get(prov_key, "")
    if not target_model:
        raise HTTPException(status_code=400, detail=f"No test probe model configured for provider {prov_key}.")

    try:
        test_result = await test_model_connection(prov_key, target_model, api_key_plain)
    except Exception as ex:
        # Record failed test in usage logs
        await record_llm_usage(
            db=db,
            user_id=admin.id,
            provider=prov_key,
            model=target_model,
            prompt_tokens=0,
            completion_tokens=0,
            latency_ms=0.0,
            request_type="TEST_CONNECTION",
            status="FAILED",
            error=str(ex)
        )
        raise HTTPException(status_code=400, detail=f"Connection test failed for '{target_model}': {str(ex)}")

    # Record successful test in usage logs
    await record_llm_usage(
        db=db,
        user_id=admin.id,
        provider=prov_key,
        model=target_model,
        prompt_tokens=test_result.get("prompt_tokens", 0),
        completion_tokens=test_result.get("completion_tokens", 0),
        latency_ms=test_result.get("latency_ms", 0.0),
        request_type="TEST_CONNECTION",
        status="SUCCESS"
    )

    # If setting doesn't exist, create it
    if not setting:
        setting = AIProviderSetting(
            provider=prov_key,
            is_enabled="true",
            available_models=[],
            selected_models=[],
            api_keys=[],
            updated_by=admin.email,
            updated_at=datetime.datetime.now(timezone.utc)
        )
        db.add(setting)

    # If new key was provided, save it to key pool (up to 10 keys)
    if new_key_provided:
        keys = list(setting.api_keys or [])
        if len(keys) < 10:
            is_primary = len(keys) == 0
            new_key_id = f"key_{uuid.uuid4().hex[:12]}"
            key_dict = {
                "id": new_key_id,
                "name": f"Key {len(keys) + 1}",
                "api_key_encrypted": encrypt_secret(api_key_plain),
                "is_active": True,
                "is_primary": is_primary,
                "created_at": datetime.datetime.now(timezone.utc).isoformat(),
                "request_count": 0
            }
            keys.append(key_dict)
            setting.api_keys = keys
            if is_primary:
                setting.api_key_encrypted = key_dict["api_key_encrypted"]

    # Increment request count on key
    if key_dict:
        keys = list(setting.api_keys or [])
        for k in keys:
            if k.get("id") == key_dict.get("id"):
                k["request_count"] = k.get("request_count", 0) + 1
                k["last_used_at"] = datetime.datetime.now(timezone.utc).isoformat()
        setting.api_keys = keys

    # Live auto-discovery: perform whenever requested OR when models catalog is empty OR new key provided
    discovered_models = list(setting.available_models or [])
    should_discover = req.discover_models or len(discovered_models) == 0 or new_key_provided
    if should_discover:
        try:
            live_models = await fetch_provider_models(prov_key, api_key_plain)
            if live_models:
                setting.available_models = live_models
                # Auto-select recommended
                if not setting.selected_models:
                    recommended = [m["id"] for m in live_models if m.get("is_recommended")]
                    setting.selected_models = recommended if recommended else [m["id"] for m in live_models]
        except Exception as ex:
            logger.warning(f"Live model discovery during connection test warning: {ex}")

    setting.updated_by = admin.email
    setting.updated_at = datetime.datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(setting)

    test_result["available_models"] = setting.available_models or []
    test_result["selected_models"] = setting.selected_models or []
    test_result["count"] = len(setting.available_models or [])
    test_result["selected_count"] = len(setting.selected_models or [])
    test_result["message"] = (
        f"Probe connection verified with '{target_model}' in {test_result.get('latency_ms', 0)}ms. "
        f"Discovered {len(setting.available_models or [])} live models for your API key."
    )

    return test_result


@router.put("/ai-providers/{provider}")
async def update_ai_provider(
    provider: str,
    req: AIProviderUpdateRequest,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates API key, enablement status, and selected model whitelist for an AI provider."""
    prov_key = provider.lower().strip()
    if prov_key not in PROVIDER_METADATA:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'.")

    stmt = select(AIProviderSetting).where(AIProviderSetting.provider == prov_key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    if not setting:
        setting = AIProviderSetting(
            provider=prov_key,
            is_enabled="true",
            available_models=[],
            selected_models=[],
            api_keys=[],
            updated_by=admin.email,
            updated_at=datetime.datetime.now(timezone.utc)
        )
        db.add(setting)

    if req.api_key is not None:
        key_val = req.api_key.strip()
        if key_val:
            setting.api_key_encrypted = encrypt_secret(key_val)
            # Also add to keys pool if empty or not existing
            keys = list(setting.api_keys or [])
            if not keys:
                keys.append({
                    "id": f"key_{uuid.uuid4().hex[:12]}",
                    "name": "Primary Key",
                    "api_key_encrypted": setting.api_key_encrypted,
                    "is_active": True,
                    "is_primary": True,
                    "created_at": datetime.datetime.now(timezone.utc).isoformat(),
                    "request_count": 0
                })
                setting.api_keys = keys
        else:
            setting.api_key_encrypted = None

    if req.is_enabled is not None:
        setting.is_enabled = "true" if req.is_enabled else "false"

    if req.selected_models is not None:
        setting.selected_models = req.selected_models

    if req.custom_endpoint is not None:
        setting.custom_endpoint = req.custom_endpoint.strip() or None

    setting.updated_by = admin.email
    setting.updated_at = datetime.datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(setting)

    has_key = bool(setting.api_key_encrypted) or bool(setting.api_keys)
    masked = mask_secret(decrypt_secret(setting.api_key_encrypted)) if setting.api_key_encrypted else None

    return {
        "provider": prov_key,
        "is_configured": has_key,
        "is_enabled": str(setting.is_enabled).lower() not in ("false", "0"),
        "masked_key": masked,
        "selected_models": setting.selected_models or [],
        "available_models": setting.available_models or [],
        "message": f"Successfully updated {PROVIDER_METADATA[prov_key]['name']} settings."
    }


@router.get("/ai-providers/active-models")
async def get_active_ai_models(
    current_user: User = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns unified list of all enabled models from all active providers.
    Used platform-wide for model selection in Agents, Evaluators, and Workflows.
    """
    stmt = select(AIProviderSetting).where(AIProviderSetting.is_enabled != "false")
    res = await db.execute(stmt)
    providers = res.scalars().all()

    active_models = []
    for prov in providers:
        has_key = bool(prov.api_key_encrypted) or bool(prov.api_keys)
        if not has_key:
            continue
        meta = PROVIDER_METADATA.get(prov.provider, {})
        prov_name = meta.get("name", prov.provider.title())
        selected = set(prov.selected_models or [])
        available = prov.available_models or []

        available_dict = {m.get("id"): m for m in available}

        for model_id in selected:
            m_info = available_dict.get(model_id, {})
            active_models.append({
                "provider": prov.provider,
                "provider_name": prov_name,
                "model_id": model_id,
                "display_name": m_info.get("name") or model_id,
                "description": m_info.get("description", ""),
                "context_window": m_info.get("context_window", ""),
                "tags": m_info.get("tags", []),
                "is_recommended": m_info.get("is_recommended", False)
            })

    return {
        "total": len(active_models),
        "models": active_models
    }


# =========================================================================
# TOKEN & REQUEST USAGE ENDPOINTS
# =========================================================================

@router.get("/ai-usage/summary")
async def get_ai_usage_summary(
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns platform-wide summary of LLM token and request usage."""
    # Total aggregates
    tot_stmt = select(
        func.count(LLMUsageLog.id).label("total_requests"),
        func.coalesce(func.sum(LLMUsageLog.prompt_tokens), 0).label("prompt_tokens"),
        func.coalesce(func.sum(LLMUsageLog.completion_tokens), 0).label("completion_tokens"),
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("total_tokens"),
        func.coalesce(func.avg(LLMUsageLog.latency_ms), 0).label("avg_latency_ms"),
        func.count(func.distinct(LLMUsageLog.user_id)).label("active_users")
    )
    tot_res = await db.execute(tot_stmt)
    totals = tot_res.one()

    # Success rate
    succ_stmt = select(func.count(LLMUsageLog.id)).where(LLMUsageLog.status == "SUCCESS")
    succ_res = await db.execute(succ_stmt)
    succ_count = succ_res.scalar() or 0
    total_reqs = totals.total_requests or 0
    success_rate = round((succ_count / total_reqs * 100), 1) if total_reqs > 0 else 100.0

    # Provider breakdown
    prov_stmt = select(
        LLMUsageLog.provider,
        func.count(LLMUsageLog.id).label("requests"),
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("tokens")
    ).group_by(LLMUsageLog.provider)
    prov_res = await db.execute(prov_stmt)
    prov_breakdown = {}
    for r in prov_res.all():
        prov_breakdown[r[0]] = {
            "requests": r[1],
            "tokens": r[2]
        }
    # Ensure all 3 providers exist in breakdown dict
    for p in ["groq", "gemini", "openai"]:
        if p not in prov_breakdown:
            prov_breakdown[p] = {"requests": 0, "tokens": 0}

    # Top models
    model_stmt = select(
        LLMUsageLog.model,
        LLMUsageLog.provider,
        func.count(LLMUsageLog.id).label("count"),
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("tokens")
    ).group_by(LLMUsageLog.model, LLMUsageLog.provider).order_by(desc("count")).limit(5)
    model_res = await db.execute(model_stmt)
    top_models = [
        {"model": r[0], "provider": r[1], "count": r[2], "tokens": r[3]}
        for r in model_res.all()
    ]

    return {
        "total_requests": totals.total_requests,
        "prompt_tokens": totals.prompt_tokens,
        "completion_tokens": totals.completion_tokens,
        "total_tokens": totals.total_tokens,
        "avg_latency_ms": round(totals.avg_latency_ms, 1),
        "active_ai_users": totals.active_users,
        "success_rate": success_rate,
        "provider_breakdown": prov_breakdown,
        "top_models": top_models
    }


@router.get("/ai-usage/users")
async def get_ai_usage_users(
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns user-wise aggregated token and request usage."""
    # Fetch all registered users
    users_stmt = select(User).order_by(User.created_at.asc())
    users_res = await db.execute(users_stmt)
    all_users = users_res.scalars().all()

    # Aggregate by user_id
    usage_stmt = select(
        LLMUsageLog.user_id,
        func.count(LLMUsageLog.id).label("requests"),
        func.coalesce(func.sum(LLMUsageLog.prompt_tokens), 0).label("prompt_tokens"),
        func.coalesce(func.sum(LLMUsageLog.completion_tokens), 0).label("completion_tokens"),
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("total_tokens"),
        func.max(LLMUsageLog.created_at).label("last_request_at")
    ).group_by(LLMUsageLog.user_id)
    usage_res = await db.execute(usage_stmt)
    usage_by_user = {r[0]: r for r in usage_res.all()}

    user_rows = []
    for u in all_users:
        u_agg = usage_by_user.get(u.id)
        role_str = u.role.value if hasattr(u.role, "value") else str(u.role)
        display_role = "ADMIN" if role_str.upper() == "ADMIN" else "QA"

        reqs = u_agg.requests if u_agg else 0
        prompt_t = u_agg.prompt_tokens if u_agg else 0
        comp_t = u_agg.completion_tokens if u_agg else 0
        tot_t = u_agg.total_tokens if u_agg else 0
        last_req = u_agg.last_request_at.isoformat() if u_agg and u_agg.last_request_at else None

        user_rows.append({
            "user_id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": display_role,
            "total_requests": reqs,
            "prompt_tokens": prompt_t,
            "completion_tokens": comp_t,
            "total_tokens": tot_t,
            "last_request_at": last_req
        })

    # Sort by total_tokens desc, then total_requests desc
    user_rows.sort(key=lambda x: (x["total_tokens"], x["total_requests"]), reverse=True)

    return {
        "total_users": len(user_rows),
        "users": user_rows
    }


@router.get("/ai-usage/logs")
async def get_ai_usage_logs(
    limit: int = 50,
    offset: int = 0,
    user_id: Optional[str] = None,
    provider: Optional[str] = None,
    admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns recent LLM request logs with latency, tokens, and status."""
    stmt = (
        select(LLMUsageLog, User.email.label("user_email"))
        .outerjoin(User, LLMUsageLog.user_id == User.id)
        .order_by(desc(LLMUsageLog.created_at))
        .limit(min(limit, 200))
        .offset(offset)
    )
    if user_id:
        stmt = stmt.where(LLMUsageLog.user_id == user_id)
    if provider:
        stmt = stmt.where(LLMUsageLog.provider == provider.lower().strip())

    res = await db.execute(stmt)
    rows = res.all()

    logs = []
    for log, email in rows:
        logs.append({
            "id": log.id,
            "user_id": log.user_id,
            "user_email": email or "System",
            "provider": log.provider,
            "model": log.model,
            "prompt_tokens": log.prompt_tokens,
            "completion_tokens": log.completion_tokens,
            "total_tokens": log.total_tokens,
            "latency_ms": log.latency_ms,
            "request_type": log.request_type,
            "status": log.status,
            "error_message": log.error_message,
            "created_at": log.created_at.isoformat() if log.created_at else None
        })

    return {
        "total": len(logs),
        "logs": logs
    }




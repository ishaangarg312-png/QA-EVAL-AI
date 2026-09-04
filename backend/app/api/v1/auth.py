import os
import asyncio
import uuid
from typing import Optional
from pydantic import BaseModel
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.models.organization import User, Organization
from app.schemas.auth import LoginRequest, Token, UserCreate, UserResponse, SendOtpRequest, ResetPasswordRequest
from app.domain.types import UserRole

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)

async def get_authenticated_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_str = credentials.credentials.strip()

    # 1. Check custom static master bearer token
    custom_token = (settings.CUSTOM_BEARER_TOKEN or os.getenv("CUSTOM_BEARER_TOKEN") or "").strip()
    if custom_token and token_str == custom_token:
        stmt = select(User).order_by(User.created_at.asc()).limit(1)
        res = await db.execute(stmt)
        admin_user = res.scalar_one_or_none()
        if admin_user:
            return admin_user

    # 2. Decode standard JWT
    payload = decode_access_token(token_str)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload["sub"]
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if str(user.is_active).lower() in ("false", "0"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated by an administrator. Please contact support.",
        )

    # Touch activity
    try:
        from datetime import datetime, timezone
        user.last_active_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        pass

    return user


async def require_admin_user(
    current_user: User = Depends(get_authenticated_user)
) -> User:
    role_str = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()
    if role_str != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required to access this resource."
        )
    return current_user

import time
import random
from typing import Optional, Dict, Any
from app.core.email import send_verification_otp_email
from app.core.logging import logger

ALLOWED_SIGNUP_EMAILS = {
    "ishaangarg312@gmail.com",
    "ishaangarg315@gmail.com",
    "mv9646@gmail.com"
}

# In-memory OTP storage: { "purpose:email": { "otp": "...", "expires_at": float, "last_sent_at": float } }
otp_store: Dict[str, Dict[str, Any]] = {}

@router.post("/send-otp")
async def send_otp(payload: SendOtpRequest, db: AsyncSession = Depends(get_db)):
    """Generates and delivers a 6-digit OTP via Gmail SMTP for registration, login, or password reset."""
    email_clean = payload.email.strip().lower()
    purpose = (payload.purpose or "register").strip().lower()
    if purpose not in ("register", "login", "reset", "reset_password"):
        purpose = "register"

    if purpose == "register":
        if email_clean not in ALLOWED_SIGNUP_EMAILS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Website in development. Coming soon"
            )
    elif purpose in ("login", "reset", "reset_password"):
        stmt = select(User).where(User.email == email_clean)
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this email address."
            )

    store_key = f"{purpose}:{email_clean}"
    now = time.time()
    existing = otp_store.get(store_key) or otp_store.get(email_clean)
    if existing:
        elapsed = now - existing.get("last_sent_at", 0)
        if elapsed < 30:
            remaining = int(30 - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining} seconds before requesting a new OTP."
            )

    # Generate secure 6-digit numeric OTP
    otp_code = f"{random.randint(100000, 999999)}"
    otp_data = {
        "otp": otp_code,
        "expires_at": now + 300,  # 5 minutes
        "last_sent_at": now
    }
    otp_store[store_key] = otp_data
    otp_store[email_clean] = otp_data  # fallback

    # Deliver OTP via Gmail SMTP directly (awaited so delivery is verified)
    delivery_success = await send_verification_otp_email(email_clean, otp_code, purpose=purpose)

    if delivery_success:
        return {
            "status": "success",
            "message": f"Verification code sent to {email_clean}! Check your inbox.",
            "delivered": True,
            "cooldown_seconds": 30
        }
    else:
        logger.error(f"[SMTP DELIVERY FAILED] Email delivery to {email_clean} failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please ensure SMTP_USER and SMTP_PASSWORD are configured in .env.local on the server."
        )


@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    from app.core.kill_switch import SystemKillSwitchManager
    if not SystemKillSwitchManager.is_allowed("user_registration"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Public user registrations are temporarily disabled by an administrator."
        )

    email_clean = user_in.email.strip().lower()
    if email_clean not in ALLOWED_SIGNUP_EMAILS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Website in development. Coming soon"
        )

    # Validate OTP verification code
    if not user_in.otp or not user_in.otp.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification OTP code is required. Please click 'Send OTP'."
        )

    now = time.time()
    store_key = f"register:{email_clean}"
    stored_data = otp_store.get(store_key) or otp_store.get(email_clean)
    if not stored_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification code found. Please click 'Send OTP'."
        )

    if now > stored_data.get("expires_at", 0):
        otp_store.pop(store_key, None)
        otp_store.pop(email_clean, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code."
        )

    if user_in.otp.strip() != stored_data.get("otp"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check your email and try again."
        )

    # Clean up OTP after successful validation
    otp_store.pop(store_key, None)
    otp_store.pop(email_clean, None)

    # Check if user exists
    stmt = select(User).where(User.email == user_in.email)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Get or create organization
    org_stmt = select(Organization).limit(1)
    org_res = await db.execute(org_stmt)
    org = org_res.scalar_one_or_none()
    if not org:
        org = Organization(name=user_in.organization_name or "Default Enterprise Org", slug="default-org")
        db.add(org)
        await db.flush()

    # If first user in the system, automatically assign ADMIN
    users_count_stmt = select(func.count(User.id))
    users_count_res = await db.execute(users_count_stmt)
    is_first_user = (users_count_res.scalar() or 0) == 0
    assigned_role = UserRole.ADMIN if is_first_user else (user_in.role or UserRole.QA_ENGINEER)

    new_user = User(
        organization_id=org.id,
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=assigned_role
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

class CustomTokenLoginRequest(BaseModel):
    token: str

@router.post("/token-login", response_model=Token)
async def custom_token_login(req: CustomTokenLoginRequest, db: AsyncSession = Depends(get_db)):
    """Allows logging into the platform directly using a custom static bearer token."""
    custom_token = (settings.CUSTOM_BEARER_TOKEN or os.getenv("CUSTOM_BEARER_TOKEN") or "").strip()
    if not custom_token or req.token.strip() != custom_token:
        raise HTTPException(status_code=401, detail="Invalid or unconfigured custom bearer token")
    
    stmt = select(User).order_by(User.created_at.asc()).limit(1)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="No user found to associate with token")
    
    if str(user.is_active).lower() in ("false", "0"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated by an administrator. Please contact support."
        )

    try:
        from datetime import datetime, timezone
        now_utc = datetime.now(timezone.utc)
        user.last_login_at = now_utc
        user.last_active_at = now_utc
        await db.commit()
    except Exception:
        pass
    
    jwt_token = create_access_token(data={
        "sub": user.id,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "name": user.full_name
    })
    return Token(
        access_token=jwt_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/login", response_model=Token)
async def login(login_req: LoginRequest, db: AsyncSession = Depends(get_db)):
    email_clean = login_req.email.strip().lower()
    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    custom_token = (settings.CUSTOM_BEARER_TOKEN or os.getenv("CUSTOM_BEARER_TOKEN") or "").strip()
    is_custom_token_match = bool(custom_token and login_req.password.strip() == custom_token)

    if not user and is_custom_token_match:
        admin_stmt = select(User).order_by(User.created_at.asc()).limit(1)
        admin_res = await db.execute(admin_stmt)
        user = admin_res.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if str(user.is_active).lower() in ("false", "0"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated by an administrator. Please contact support."
        )

    # If normal login (not master custom token), validate OTP first
    if not is_custom_token_match:
        if not login_req.otp or not login_req.otp.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code is required. Please click 'Send OTP' and enter the code."
            )

        now = time.time()
        store_key = f"login:{email_clean}"
        stored = otp_store.get(store_key) or otp_store.get(email_clean)
        if not stored:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active verification code found. Please click 'Send OTP'."
            )
        if now > stored.get("expires_at", 0):
            otp_store.pop(store_key, None)
            otp_store.pop(email_clean, None)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code has expired. Please request a new code."
            )
        if login_req.otp.strip() != stored.get("otp"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code. Please check your email and try again."
            )

    # Validate password
    if not is_custom_token_match and not verify_password(login_req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    # Cleanup login OTP after both OTP and password succeed
    if not is_custom_token_match:
        otp_store.pop(store_key, None)
        otp_store.pop(email_clean, None)

    try:
        from datetime import datetime, timezone
        now_utc = datetime.now(timezone.utc)
        user.last_login_at = now_utc
        user.last_active_at = now_utc
        await db.commit()
    except Exception:
        pass

    token = create_access_token(data={
        "sub": user.id,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "name": user.full_name
    })
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        organization_id=user.organization_id
    )

@router.post("/forgot-password/send-otp")
async def forgot_password_send_otp(payload: SendOtpRequest, db: AsyncSession = Depends(get_db)):
    """Generates and delivers a password reset OTP to a registered user's email."""
    payload.purpose = "reset_password"
    return await send_otp(payload, db=db)

@router.post("/forgot-password/reset")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Validates OTP and sets a new password with confirmation matching."""
    email_clean = req.email.strip().lower()

    if req.new_password != req.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match. Please confirm your new password."
        )
    if len(req.new_password.strip()) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long."
        )
    if not req.otp or not req.otp.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code is required. Please click 'Send OTP'."
        )

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email address."
        )

    now = time.time()
    store_key = f"reset_password:{email_clean}"
    stored = (
        otp_store.get(store_key)
        or otp_store.get(f"reset:{email_clean}")
        or otp_store.get(email_clean)
    )
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification code found. Please click 'Send OTP'."
        )
    if now > stored.get("expires_at", 0):
        otp_store.pop(store_key, None)
        otp_store.pop(f"reset:{email_clean}", None)
        otp_store.pop(email_clean, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code."
        )
    if req.otp.strip() != stored.get("otp"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check your email and try again."
        )

    # Clean up OTP after success
    otp_store.pop(store_key, None)
    otp_store.pop(f"reset:{email_clean}", None)
    otp_store.pop(email_clean, None)

    # Hash new password and save
    user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    await db.refresh(user)

    logger.info(f"[AUTH] Password reset successfully for {email_clean}")
    return {
        "status": "success",
        "message": "Password reset successfully! You can now log in with your new password."
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user(user: User = Depends(get_authenticated_user)):
    return user

@router.get("/config")
async def get_auth_config():
    """Returns public authentication parameters (e.g. Google Client ID)."""
    client_id = settings.GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id:
        try:
            from app.core.config import root_dir
            from dotenv import dotenv_values
            from pathlib import Path
            search_paths = [
                root_dir / ".env.local",
                root_dir / "backend" / ".env.local",
                Path(__file__).resolve().parent.parent.parent / ".env.local",
                Path.cwd() / ".env.local",
                root_dir / ".env"
            ]
            for p in search_paths:
                if p.exists():
                    vals = dotenv_values(p)
                    found = vals.get("GOOGLE_CLIENT_ID", "")
                    if found:
                        client_id = found
                        break
        except Exception:
            pass
    if client_id:
        client_id = client_id.strip('"').strip("'").strip()
    return {
        "google_client_id": client_id or ""
    }

class GoogleLoginRequest(BaseModel):
    id_token: str

@router.post("/google", response_model=Token)
async def google_login(payload: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    """Verifies Google ID Token via Google Identity Services and logs in or provisions user."""
    if not payload.id_token:
        raise HTTPException(status_code=400, detail="Missing Google ID token")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": payload.id_token}
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Google authentication token."
                )
            google_data = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to verify token with Google: {str(e)}"
        )

    # Optional audience check if client ID is configured
    if settings.GOOGLE_CLIENT_ID:
        aud = google_data.get("aud")
        if aud != settings.GOOGLE_CLIENT_ID:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google token audience does not match configured Google Client ID."
            )

    email = google_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google token does not contain an email address.")

    full_name = google_data.get("name") or email.split("@")[0]

    # Check if user already exists
    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        email_clean = email.strip().lower()
        if email_clean not in ALLOWED_SIGNUP_EMAILS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Website in development. Coming soon"
            )

        # Auto-provision user into default organization
        org_stmt = select(Organization).limit(1)
        org_res = await db.execute(org_stmt)
        org = org_res.scalar_one_or_none()
        if not org:
            org = Organization(name="Default Enterprise Org", slug="default-org")
            db.add(org)
            await db.flush()

        user = User(
            organization_id=org.id,
            email=email,
            full_name=full_name,
            hashed_password=get_password_hash(uuid.uuid4().hex),
            role=UserRole.QA_ENGINEER
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(data={
        "sub": user.id,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "name": user.full_name
    })

    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        organization_id=user.organization_id
    )

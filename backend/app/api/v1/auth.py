import os
import uuid
from typing import Optional
from pydantic import BaseModel
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.models.organization import User, Organization
from app.schemas.auth import LoginRequest, Token, UserCreate, UserResponse
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
            detail="User account not found or deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

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

# In-memory OTP storage: { email: { "otp": "...", "expires_at": float, "last_sent_at": float } }
otp_store: Dict[str, Dict[str, Any]] = {}

class SendOtpRequest(BaseModel):
    email: str

@router.post("/send-otp")
async def send_registration_otp(payload: SendOtpRequest):
    """Generates and delivers a 6-digit OTP to allowed registration emails via Gmail SMTP."""
    email_clean = payload.email.strip().lower()
    if email_clean not in ALLOWED_SIGNUP_EMAILS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Website in development. Coming soon"
        )
    
    now = time.time()
    existing = otp_store.get(email_clean)
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
    otp_store[email_clean] = {
        "otp": otp_code,
        "expires_at": now + 300,  # 5 minutes
        "last_sent_at": now
    }

    # Dispatch via Gmail SMTP
    try:
        await send_verification_otp_email(email_clean, otp_code)
    except Exception as e:
        logger.error(f"Failed to send email via SMTP: {str(e)}")
        # Allow dev fallback if user has not yet configured SMTP_PASSWORD
        logger.info(f"[DEV FALLBACK OTP] Verification code for {email_clean} is: {otp_code}")

    return {
        "status": "success",
        "message": f"Verification code sent to {email_clean}",
        "cooldown_seconds": 30
    }

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
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
    stored_data = otp_store.get(email_clean)
    if not stored_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification code found. Please click 'Send OTP'."
        )

    if now > stored_data.get("expires_at", 0):
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

    new_user = User(
        organization_id=org.id,
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role
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
    stmt = select(User).where(User.email == login_req.email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    custom_token = (settings.CUSTOM_BEARER_TOKEN or os.getenv("CUSTOM_BEARER_TOKEN") or "").strip()
    is_custom_token_match = bool(custom_token and login_req.password.strip() == custom_token)

    if not user and is_custom_token_match:
        admin_stmt = select(User).order_by(User.created_at.asc()).limit(1)
        admin_res = await db.execute(admin_stmt)
        user = admin_res.scalar_one_or_none()

    if not user or (not is_custom_token_match and not verify_password(login_req.password, user.hashed_password)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

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

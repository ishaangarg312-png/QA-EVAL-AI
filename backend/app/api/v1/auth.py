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
    payload = decode_access_token(credentials.credentials)
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

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
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

@router.post("/login", response_model=Token)
async def login(login_req: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == login_req.email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(login_req.password, user.hashed_password):
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
            env_vals = dotenv_values(root_dir / ".env.local")
            client_id = env_vals.get("GOOGLE_CLIENT_ID", "")
            if not client_id:
                env_vals = dotenv_values(root_dir / ".env")
                client_id = env_vals.get("GOOGLE_CLIENT_ID", "")
        except Exception:
            pass
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

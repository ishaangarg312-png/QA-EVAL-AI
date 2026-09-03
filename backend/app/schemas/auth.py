from typing import Optional
from pydantic import BaseModel, EmailStr
from app.domain.types import UserRole

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: Optional[str] = None
    role: UserRole
    organization_id: str

class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[UserRole] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.QA_ENGINEER
    organization_name: Optional[str] = "Default Org"
    otp: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    organization_id: str

    class Config:
        from_attributes = True

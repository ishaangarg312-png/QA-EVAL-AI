from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.domain.types import UserRole

def generate_uuid() -> str:
    return str(uuid.uuid4())

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.QA_ENGINEER, nullable=False)
    is_active = Column(String(10), default="true")
    last_active_at = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_ip = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="users")


class SystemKillSwitch(Base):
    __tablename__ = "system_kill_switches"

    key = Column(String(64), primary_key=True)  # e.g., flow_execution, queue_processing, document_upload, user_registration, emergency_kill
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_enabled = Column(String(10), default="true", nullable=False)  # "true" or "false"
    reason = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(100), nullable=False)
    resource_id = Column(String(36), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

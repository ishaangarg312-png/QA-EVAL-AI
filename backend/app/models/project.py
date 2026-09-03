from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.domain.types import EnvironmentType

def generate_uuid() -> str:
    return str(uuid.uuid4())

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    report_template = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="projects")
    environments = relationship("Environment", back_populates="project", cascade="all, delete-orphan")
    agents = relationship("Agent", back_populates="project", cascade="all, delete-orphan")
    test_suites = relationship("TestSuite", back_populates="project", cascade="all, delete-orphan")
    workflows = relationship("Workflow", back_populates="project", cascade="all, delete-orphan")
    executions = relationship("ExecutionRun", back_populates="project", cascade="all, delete-orphan")
    datasets = relationship("TestDataset", back_populates="project", cascade="all, delete-orphan")


class Environment(Base):
    __tablename__ = "environments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(50), nullable=False)  # DEV, QA, UAT, STAGING, PRODUCTION
    env_type = Column(Enum(EnvironmentType), default=EnvironmentType.QA, nullable=False)
    base_url = Column(String(255), nullable=True)
    variables = Column(JSON, default=dict)  # Non-sensitive config
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="environments")
    secrets = relationship("SecretItem", back_populates="environment", cascade="all, delete-orphan")


class SecretItem(Base):
    __tablename__ = "secrets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    environment_id = Column(String(36), ForeignKey("environments.id"), nullable=False)
    key = Column(String(100), nullable=False)
    encrypted_value = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    environment = relationship("Environment", back_populates="secrets")

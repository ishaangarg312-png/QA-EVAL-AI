from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, JSON, Float, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.domain.types import AgentType

def generate_uuid() -> str:
    return str(uuid.uuid4())

class Agent(Base):
    __tablename__ = "agents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    agent_type = Column(Enum(AgentType), default=AgentType.REST_API, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="agents")
    versions = relationship("AgentVersion", back_populates="agent", cascade="all, delete-orphan")


class AgentVersion(Base):
    __tablename__ = "agent_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agent_id = Column(String(36), ForeignKey("agents.id"), nullable=False)
    version_tag = Column(String(50), nullable=False)  # "v1.0.0", "v2.0.0"
    endpoint_url = Column(String(255), nullable=True)
    model_name = Column(String(100), nullable=True)  # e.g. "gpt-4o", "claude-3-5-sonnet"
    system_prompt = Column(Text, nullable=True)
    tools_schema = Column(JSON, default=list)  # Registered tools and parameter descriptions
    config = Column(JSON, default=dict)  # Temperature, max tokens, timeout
    is_active = Column(String(10), default="true")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    agent = relationship("Agent", back_populates="versions")
    executions = relationship("ExecutionRun", back_populates="agent_version")

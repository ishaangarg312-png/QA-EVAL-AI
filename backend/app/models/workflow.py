from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, JSON, Float
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.domain.types import NodeType

def generate_uuid() -> str:
    return str(uuid.uuid4())

class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String(50), default="1.0.0")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="workflows")
    nodes = relationship("WorkflowNode", back_populates="workflow", cascade="all, delete-orphan")
    edges = relationship("WorkflowEdge", back_populates="workflow", cascade="all, delete-orphan")
    test_cases = relationship("TestCase", back_populates="workflow")
    executions = relationship("ExecutionRun", back_populates="workflow")


class WorkflowNode(Base):
    __tablename__ = "workflow_nodes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workflow_id = Column(String(36), ForeignKey("workflows.id"), nullable=False)
    node_key = Column(String(100), nullable=False)  # ID in UI canvas e.g. "node-1"
    node_type = Column(Enum(NodeType), nullable=False)
    label = Column(String(255), nullable=False)
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
    config = Column(JSON, default=dict)  # Node specific parameters (prompt text, URL, method, headers, jsonpath, timeout)
    assertions = Column(JSON, default=list)  # Step-level assertions
    is_disabled = Column(String(10), default="false")

    workflow = relationship("Workflow", back_populates="nodes")


class WorkflowEdge(Base):
    __tablename__ = "workflow_edges"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workflow_id = Column(String(36), ForeignKey("workflows.id"), nullable=False)
    source_node_key = Column(String(100), nullable=False)
    target_node_key = Column(String(100), nullable=False)
    condition_expr = Column(String(255), nullable=True)  # Optional edge branch condition e.g. "{{booking_status}} == 'CONFIRMED'"
    label = Column(String(100), nullable=True)

    workflow = relationship("Workflow", back_populates="edges")

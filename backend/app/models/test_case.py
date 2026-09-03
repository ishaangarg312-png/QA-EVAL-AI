from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, JSON, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.domain.types import Severity

def generate_uuid() -> str:
    return str(uuid.uuid4())

class TestSuite(Base):
    __tablename__ = "test_suites"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(JSON, default=list)  # ["regression", "booking", "smoke"]
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="test_suites")
    test_cases = relationship("TestCase", back_populates="test_suite", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    test_suite_id = Column(String(36), ForeignKey("test_suites.id"), nullable=False)
    workflow_id = Column(String(36), ForeignKey("workflows.id"), nullable=True)
    dataset_id = Column(String(36), ForeignKey("test_datasets.id"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(Enum(Severity), default=Severity.HIGH, nullable=False)
    priority = Column(String(20), default="P1")
    status = Column(String(20), default="ACTIVE")  # DRAFT, ACTIVE, DEPRECATED
    is_regression = Column(String(10), default="false")
    promoted_from_execution_id = Column(String(36), nullable=True)
    expected_trace = Column(JSON, default=list)  # Sequence of expected tool/API calls
    evaluator_configs = Column(JSON, default=list)  # Attached evaluators and weights
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    test_suite = relationship("TestSuite", back_populates="test_cases")
    workflow = relationship("Workflow", back_populates="test_cases")
    dataset = relationship("TestDataset", back_populates="test_cases")
    executions = relationship("ExecutionRun", back_populates="test_case")


class TestDataset(Base):
    __tablename__ = "test_datasets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    headers = Column(JSON, default=list)  # ["origin", "destination", "travel_date"]
    rows = Column(JSON, default=list)  # [["Delhi", "Dubai", "tomorrow"], ...]
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="datasets")
    test_cases = relationship("TestCase", back_populates="dataset")

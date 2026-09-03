from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, JSON, Float, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.domain.types import EvaluationVerdict, EvaluatorType

def generate_uuid() -> str:
    return str(uuid.uuid4())

class EvaluatorConfig(Base):
    __tablename__ = "evaluator_configs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    evaluator_type = Column(Enum(EvaluatorType), nullable=False)
    version = Column(String(50), default="1.0.0")
    description = Column(Text, nullable=True)
    weight = Column(Float, default=1.0)
    pass_threshold = Column(Float, default=0.8)
    config = Column(JSON, default=dict)  # Prompts, metrics, schemas, rules
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    execution_id = Column(String(36), ForeignKey("executions.id"), nullable=False)
    evaluator_name = Column(String(255), nullable=False)
    evaluator_type = Column(Enum(EvaluatorType), nullable=False)
    layer = Column(Integer, default=1)  # 1: Deterministic, 2: Semantic, 3: LLM Judge
    score = Column(Float, nullable=False)  # 0.0 - 1.0
    verdict = Column(Enum(EvaluationVerdict), nullable=False)
    weight = Column(Float, default=1.0)
    reason = Column(Text, nullable=True)
    evidence = Column(JSON, default=list)  # Grounded citations to trace event IDs
    violations = Column(JSON, default=list)  # Specific policy or accuracy failures
    confidence = Column(Float, default=1.0)
    raw_response = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    execution = relationship("ExecutionRun", back_populates="evaluations")


class RCAAnalysis(Base):
    __tablename__ = "rca_analyses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    execution_id = Column(String(36), ForeignKey("executions.id"), nullable=False)
    root_cause = Column(Text, nullable=False)
    confidence = Column(Float, default=0.85)
    affected_step = Column(String(100), nullable=False)
    trace_evidence_ids = Column(JSON, default=list)
    suggested_fix = Column(Text, nullable=False)
    regression_probability = Column(Float, default=0.9)
    is_promoted_to_regression = Column(String(10), default="false")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    execution = relationship("ExecutionRun", back_populates="rca_analysis")


class RegressionReport(Base):
    __tablename__ = "regression_reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    baseline_agent_version_id = Column(String(36), ForeignKey("agent_versions.id"), nullable=False)
    target_agent_version_id = Column(String(36), ForeignKey("agent_versions.id"), nullable=False)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    
    # Comparison Metrics
    total_test_cases = Column(Integer, default=0)
    baseline_pass_rate = Column(Float, default=0.0)
    target_pass_rate = Column(Float, default=0.0)
    pass_rate_delta = Column(Float, default=0.0)
    
    baseline_avg_latency_ms = Column(Float, default=0.0)
    target_avg_latency_ms = Column(Float, default=0.0)
    latency_delta_pct = Column(Float, default=0.0)
    
    baseline_avg_tokens = Column(Integer, default=0)
    target_avg_tokens = Column(Integer, default=0)
    
    regressions_detected = Column(Integer, default=0)
    improvements_detected = Column(Integer, default=0)
    metrics_diff = Column(JSON, default=dict)  # Per metric comparison
    case_results = Column(JSON, default=list)  # Breakdown per test case
    release_recommendation = Column(String(20), default="GO")  # GO / NO-GO
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

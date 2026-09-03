from sqlalchemy import Column, String, Integer, DateTime, Text, JSON, Boolean, Float
from datetime import datetime, timezone
import uuid
from app.core.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class QueueTask(Base):
    __tablename__ = "queue_tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(64), nullable=True, index=True)
    job_id = Column(String(64), nullable=False, index=True)
    scenario_index = Column(Integer, default=0)
    task_type = Column(String(50), default="MATRIX_SCENARIO", index=True)
    status = Column(String(30), default="QUEUED", index=True)  # QUEUED, CLAIMED, RUNNING, COMPLETED, FAILED, CANCELLED
    priority = Column(Integer, default=0, index=True)
    
    # Worker lease & heartbeat
    worker_id = Column(String(100), nullable=True, index=True)
    leased_at = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    
    # Execution Payload & Result
    payload = Column(JSON, nullable=False)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    
    # Retry management
    attempts = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    duration_ms = Column(Float, default=0.0)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"

    worker_id = Column(String(100), primary_key=True)
    hostname = Column(String(100), nullable=True)
    pid = Column(Integer, nullable=True)
    concurrency = Column(Integer, default=2)
    active_tasks = Column(Integer, default=0)
    completed_tasks = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    status = Column(String(20), default="ONLINE")  # ONLINE, DRAINING, OFFLINE

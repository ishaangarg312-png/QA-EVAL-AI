from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel
from app.domain.types import TraceEventType

class TraceEventResponse(BaseModel):
    id: str
    execution_id: str
    step_id: Optional[str] = None
    sequence_number: int
    event_type: TraceEventType
    title: str
    duration_ms: float
    raw_payload: Optional[Dict[str, Any]] = None
    normalized_payload: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    status: str
    error: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

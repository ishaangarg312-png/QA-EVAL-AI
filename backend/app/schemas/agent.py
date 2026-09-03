from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from app.domain.types import AgentType

class AgentVersionCreate(BaseModel):
    version_tag: str
    endpoint_url: Optional[str] = None
    model_name: Optional[str] = "gpt-4o"
    system_prompt: Optional[str] = None
    tools_schema: List[Dict[str, Any]] = []
    config: Dict[str, Any] = {}

class AgentVersionResponse(BaseModel):
    id: str
    agent_id: str
    version_tag: str
    endpoint_url: Optional[str] = None
    model_name: Optional[str] = None
    system_prompt: Optional[str] = None
    tools_schema: List[Dict[str, Any]] = []
    config: Dict[str, Any] = {}
    is_active: str
    created_at: datetime

    class Config:
        from_attributes = True

class AgentCreate(BaseModel):
    project_id: str
    name: str
    agent_type: AgentType = AgentType.REST_API
    description: Optional[str] = None
    initial_version: Optional[AgentVersionCreate] = None

class AgentResponse(BaseModel):
    id: str
    project_id: str
    name: str
    agent_type: AgentType
    description: Optional[str] = None
    created_at: datetime
    versions: List[AgentVersionResponse] = []

    class Config:
        from_attributes = True

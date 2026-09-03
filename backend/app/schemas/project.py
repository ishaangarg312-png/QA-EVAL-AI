from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from app.domain.types import EnvironmentType

class SecretCreate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

class SecretResponse(BaseModel):
    id: str
    environment_id: str
    key: str
    masked_value: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class EnvironmentCreate(BaseModel):
    name: str
    env_type: EnvironmentType = EnvironmentType.QA
    base_url: Optional[str] = None
    variables: Dict[str, Any] = {}

class EnvironmentResponse(BaseModel):
    id: str
    project_id: str
    name: str
    env_type: EnvironmentType
    base_url: Optional[str] = None
    variables: Dict[str, Any] = {}
    secrets: List[SecretResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    report_template: Optional[Dict[str, Any]] = None

class ReportTemplateUpdate(BaseModel):
    report_template: Dict[str, Any]

class ProjectResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    slug: str
    description: Optional[str] = None
    report_template: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None
    created_at: datetime
    environments: List[EnvironmentResponse] = []

    class Config:
        from_attributes = True

from datetime import datetime
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel
from app.domain.types import NodeType

class WorkflowNodeSchema(BaseModel):
    id: Optional[str] = None
    node_key: str
    node_type: NodeType
    label: str
    position_x: float = 0.0
    position_y: float = 0.0
    config: Dict[str, Any] = {}
    assertions: List[Any] = []
    is_disabled: Optional[Union[str, bool]] = "false"

class WorkflowEdgeSchema(BaseModel):
    id: Optional[str] = None
    source_node_key: str
    target_node_key: str
    condition_expr: Optional[str] = None
    label: Optional[str] = None

class WorkflowCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    nodes: List[WorkflowNodeSchema] = []
    edges: List[WorkflowEdgeSchema] = []

class WorkflowResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    version: str
    created_at: datetime
    nodes: List[WorkflowNodeSchema] = []
    edges: List[WorkflowEdgeSchema] = []

    class Config:
        from_attributes = True

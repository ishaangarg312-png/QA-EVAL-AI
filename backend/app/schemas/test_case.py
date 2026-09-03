from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from app.domain.types import Severity

class TestDatasetCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    headers: List[str]
    rows: List[List[Any]]

class TestDatasetResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    headers: List[str]
    rows: List[List[Any]]
    created_at: datetime

    class Config:
        from_attributes = True

class TestCaseCreate(BaseModel):
    test_suite_id: str
    workflow_id: Optional[str] = None
    dataset_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: Severity = Severity.HIGH
    priority: str = "P1"
    status: str = "ACTIVE"
    expected_trace: List[Dict[str, Any]] = []
    evaluator_configs: List[Dict[str, Any]] = []

class TestCaseResponse(BaseModel):
    id: str
    test_suite_id: str
    workflow_id: Optional[str] = None
    dataset_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: Severity
    priority: str
    status: str
    is_regression: str
    promoted_from_execution_id: Optional[str] = None
    expected_trace: List[Dict[str, Any]] = []
    evaluator_configs: List[Dict[str, Any]] = []
    created_at: datetime

    class Config:
        from_attributes = True

class TestSuiteCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    tags: List[str] = []

class TestSuiteResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    created_at: datetime
    test_cases: List[TestCaseResponse] = []

    class Config:
        from_attributes = True

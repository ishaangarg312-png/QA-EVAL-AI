from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ColumnConfig(BaseModel):
    id: str = Field(..., description="Unique identifier for the column")
    name: str = Field(..., description="Display header name for the column")
    entity_id: Optional[str] = Field(None, description="Identifier of the entity level this column belongs to")
    scope: str = Field("case", description="Legacy scope ('case' or 'data') or level ID")
    merge_rows: bool = Field(False, description="Whether to merge rows vertically for this column across child items")
    description: Optional[str] = Field(None, description="Guidance for LLM on what content belongs in this column")

class EntityLevel(BaseModel):
    id: str = Field(..., description="Unique identifier for entity level e.g. 'lvl_module', 'lvl_case'")
    name: str = Field(..., description="Entity name e.g. 'Module', 'Test Case', 'Test Data', 'Followup Prompt'")
    description: Optional[str] = Field(None, description="Entity purpose e.g. 'Feature or microservice module'")
    max_items_per_parent: int = Field(3, ge=1, le=25, description="Max children generated per parent entity")
    columns: List[ColumnConfig] = Field(default_factory=list, description="Columns belonging to this entity")

class GenerateTestRequest(BaseModel):
    mode: str = Field("both", description="'test_case', 'test_data', or 'both'")
    master_prompt: str = Field(..., description="Core requirement, user story, or feature description")
    instructions: Optional[str] = Field(None, description="Custom testing guidelines, edge cases, boundaries, negative tests")
    columns: List[ColumnConfig] = Field(..., description="Flat list of dynamic column definitions in order")
    entity_levels: Optional[List[EntityLevel]] = Field(None, description="Hierarchical entity tree levels (N-level)")
    max_test_cases: int = Field(5, ge=1, le=50, description="Max number of top-level items")
    max_test_data_per_case: int = Field(3, ge=1, le=20, description="Max variations per parent")
    document_text: Optional[str] = Field(None, description="Extracted text from ingested documents")
    model_id: Optional[str] = Field(None, description="Target AI model identifier (e.g. openai/gpt-oss-120b)")
    provider: Optional[str] = Field(None, description="Target AI provider (groq, openai, gemini)")

class ExportExcelRequest(BaseModel):
    columns: List[ColumnConfig]
    data: List[Dict[str, Any]]
    entity_levels: Optional[List[EntityLevel]] = None
    mode: str = "both"
    sheet_name: Optional[str] = "Test Suite Matrix"
    filename: Optional[str] = "Generated_Test_Cases_Matrix.xlsx"

class SaveDatasetRequest(BaseModel):
    project_id: str = "proj-travel-01"
    name: str = "AI Generated Test Dataset"
    description: Optional[str] = None
    data: List[Dict[str, Any]]
    columns: List[ColumnConfig]

class SavePromptRequest(BaseModel):
    prompt: str = Field(..., description="Master prompt text to save for the project")

class SaveInstructionsRequest(BaseModel):
    instructions: str = Field(..., description="Instructions text to save for the project")

class SaveTemplateDesignRequest(BaseModel):
    columns: List[ColumnConfig] = Field(..., description="List of columns with names, scopes, and merge flags")
    entity_levels: Optional[List[EntityLevel]] = Field(None, description="N-level entity hierarchy definition")
    mode: Optional[str] = Field("both", description="Generation mode")
    max_test_cases: Optional[int] = Field(None, description="Max test cases configured")
    max_test_data_per_case: Optional[int] = Field(None, description="Max variations per case configured")

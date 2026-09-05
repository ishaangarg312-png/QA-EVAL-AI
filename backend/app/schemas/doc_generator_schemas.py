from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, model_validator


class DocTableColumn(BaseModel):
    name: str
    width: Optional[float] = None


class DocTableRow(BaseModel):
    cells: List[str]


class DocTable(BaseModel):
    headers: List[str] = Field(default_factory=list)
    rows: List[List[str]] = Field(default_factory=list)
    caption: Optional[str] = None


class DocCallout(BaseModel):
    type: str = Field("info", description="info, warning, success, critical, note")
    title: Optional[str] = None
    content: str


class DocSection(BaseModel):
    heading: str
    level: int = Field(1, description="1, 2, or 3")
    summary: Optional[str] = None
    paragraphs: List[str] = Field(default_factory=list)
    bullet_points: List[str] = Field(default_factory=list)
    callouts: List[DocCallout] = Field(default_factory=list)
    tables: List[DocTable] = Field(default_factory=list)
    key_metrics: Optional[List[Dict[str, str]]] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile_section(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "body" in data and not data.get("paragraphs"):
                if isinstance(data["body"], list):
                    data["paragraphs"] = data["body"]
                elif isinstance(data["body"], str):
                    data["paragraphs"] = [data["body"]]
            if "bullets" in data and not data.get("bullet_points"):
                data["bullet_points"] = data["bullets"]
            if "table" in data and data["table"] and not data.get("tables"):
                data["tables"] = [data["table"]]
        return data


class PptxSlideCard(BaseModel):
    title: str
    content: str = ""
    value: Optional[str] = None
    description: Optional[str] = None
    badge: Optional[str] = None
    icon: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile_content(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("content"):
                data["content"] = data.get("description") or data.get("value") or ""
        return data


class PptxSlide(BaseModel):
    slide_number: int
    layout_type: str = Field("card_grid", description="title_slide, agenda, card_grid, split_columns, metric_callout, table_slide, conclusion")
    title: str
    subtitle: Optional[str] = None
    bullet_points: List[str] = Field(default_factory=list)
    cards: List[PptxSlideCard] = Field(default_factory=list)
    metrics: List[Dict[str, str]] = Field(default_factory=list)
    table: Optional[DocTable] = None
    speaker_notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile_slide(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "bullets" in data and not data.get("bullet_points"):
                data["bullet_points"] = data["bullets"]
        return data


class DocumentMetadata(BaseModel):
    title: str = "Test Strategy & Execution Plan"
    subtitle: Optional[str] = None
    author: Optional[str] = "EVAL AI Platform"
    organization: Optional[str] = "Enterprise QA & Testing"
    version: Optional[str] = "1.0.0"
    classification: Optional[str] = "Confidential / QA Internal"
    date_str: Optional[str] = None
    project_name: Optional[str] = None
    document_type: Optional[str] = None
    confidentiality: Optional[str] = None
    target_pages: Optional[int] = None
    target_slides: Optional[int] = None
    summary: Optional[str] = None


class DocumentContentModel(BaseModel):
    meta: DocumentMetadata = Field(default_factory=DocumentMetadata)
    executive_summary: Optional[str] = None
    sections: List[DocSection] = Field(default_factory=list)
    slides: List[PptxSlide] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def reconcile_model(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "metadata" in data and "meta" not in data:
                data["meta"] = data["metadata"]
        return data


class GenerateDocRequest(BaseModel):
    document_type: str = Field("all", description="docx, pdf, pptx, or all")
    template_preset: Optional[str] = Field("test_strategy", description="test_strategy, exec_summary, compliance_audit, defect_triage, custom")
    master_prompt: str
    instructions: Optional[str] = None
    target_count: int = Field(5, description="Target page count for docx/pdf or slide count for pptx")
    document_text: Optional[str] = None
    model_id: Optional[str] = None
    provider: Optional[str] = None
    title: Optional[str] = None
    theme: Optional[str] = "corporate_blue"


class GenerateDocResponse(BaseModel):
    status: str
    document_type: str
    title: str
    content: DocumentContentModel
    total_sections: int
    total_slides: int
    model: str
    provider: str
    latency_ms: int
    total_tokens: int


class ExportDocRequest(BaseModel):
    document_type: str = Field("docx", description="docx, pdf, pptx, or all_zip")
    content: DocumentContentModel
    filename: Optional[str] = None
    theme: Optional[str] = "corporate_blue"


class SaveDocPromptRequest(BaseModel):
    prompt: str


class SaveDocInstructionsRequest(BaseModel):
    instructions: str


class SaveDocConfigRequest(BaseModel):
    document_type: Optional[str] = "all"
    template_preset: Optional[str] = "test_strategy"
    target_count: Optional[int] = 5
    theme: Optional[str] = "corporate_blue"
    master_prompt: Optional[str] = None
    instructions: Optional[str] = None

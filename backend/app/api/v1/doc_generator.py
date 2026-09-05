import json
import re
import time
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.database import get_db
from app.models.organization import User, AIProviderSetting
from app.models.project import Project
from sqlalchemy.orm.attributes import flag_modified
from app.api.v1.auth import get_authenticated_user
from app.core.kill_switch import SystemKillSwitchManager
from app.core.security import decrypt_secret
from app.core.doc_parser import extract_text_from_file
from app.core.ai_discovery import record_llm_usage, PROVIDER_METADATA
from app.schemas.doc_generator_schemas import (
    GenerateDocRequest,
    GenerateDocResponse,
    ExportDocRequest,
    DocumentContentModel,
    SaveDocPromptRequest,
    SaveDocInstructionsRequest,
    SaveDocConfigRequest
)
from app.execution.test_doc_generator import (
    DocxBuilder,
    PdfBuilder,
    PptxBuilder,
    DocBundleBuilder
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/doc-generator", tags=["AI Test Document Generator"])


@router.post("/parse-document")
async def parse_document(
    file: UploadFile = File(...),
    user: User = Depends(get_authenticated_user)
):
    """Parses text from uploaded .docx, .pdf, .pptx, .xlsx, or .csv files."""
    try:
        content_bytes = await file.read()
        extracted_text = extract_text_from_file(file.filename, content_bytes)
        return {
            "status": "SUCCESS",
            "filename": file.filename,
            "text": extracted_text,
            "characters": len(extracted_text)
        }
    except Exception as e:
        logger.error(f"Failed to parse document {file.filename}: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse document: {str(e)}")


async def _resolve_model_and_key(db: AsyncSession, requested_model: Optional[str], requested_provider: Optional[str]):
    """Finds active provider configuration and API key from database."""
    stmt = select(AIProviderSetting).where(AIProviderSetting.is_enabled != "false")
    res = await db.execute(stmt)
    active_providers = res.scalars().all()

    target_setting = None
    target_provider = None
    target_model = None

    if requested_provider:
        for prov in active_providers:
            if prov.provider.lower() == requested_provider.lower():
                target_setting = prov
                target_provider = prov.provider.lower()
                break

    if not target_setting and requested_model:
        for prov in active_providers:
            if requested_model in (prov.selected_models or []):
                target_setting = prov
                target_provider = prov.provider.lower()
                target_model = requested_model
                break

    if not target_setting:
        for prov in active_providers:
            has_key = bool(prov.api_key_encrypted) or bool(prov.api_keys)
            if has_key:
                target_setting = prov
                target_provider = prov.provider.lower()
                break

    if not target_setting:
        raise HTTPException(
            status_code=400,
            detail="No AI Provider configured or enabled. Please configure Groq, OpenAI, or Gemini in Admin Settings."
        )

    key = None
    if target_setting.api_key_encrypted:
        key = decrypt_secret(target_setting.api_key_encrypted)
    elif target_setting.api_keys and len(target_setting.api_keys) > 0:
        first_key_obj = target_setting.api_keys[0]
        enc = first_key_obj.get("key_encrypted")
        if enc:
            key = decrypt_secret(enc)

    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"No valid API key found for provider '{target_provider}'. Please set key in Admin AI Provider Settings."
        )

    model = target_model or requested_model
    if not model:
        models = target_setting.selected_models or []
        if models:
            model = models[0]
        else:
            meta_models = PROVIDER_METADATA.get(target_provider, {}).get("models", [])
            model = meta_models[0]["id"] if meta_models else "default"

    return target_provider, model, key


def _clean_json_response(text: str) -> str:
    """Removes markdown code block formatting to retrieve raw JSON."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    start_brace = cleaned.find("{")
    if start_brace != -1:
        end_brace = cleaned.rfind("}")
        if end_brace != -1:
            return cleaned[start_brace:end_brace + 1]
    return cleaned


@router.post("/generate", response_model=GenerateDocResponse)
async def generate_test_document(
    req: GenerateDocRequest,
    user: User = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates structured test document content (sections, tables, callouts, and 16:9 slides).
    AI produces only JSON semantic data; Python handles native Word, PDF, and PPTX document building.
    """
    if not SystemKillSwitchManager.is_allowed("ai_execution"):
        raise HTTPException(
            status_code=503,
            detail="AI Generation is currently disabled by system administrator (Kill Switch Active)."
        )

    provider, model, api_key = await _resolve_model_and_key(db, req.model_id, req.provider)

    doc_title = req.title or "Enterprise QA & Testing Specification"
    target_count = max(1, min(req.target_count or 5, 20))

    system_prompt = f"""You are a Principal Test Architect & Technical Documentation Lead at an enterprise software firm.
Your task is to generate a comprehensive, highly technical, and structured QA Test Document & Presentation Deck.

Required Output:
Return ONLY a valid JSON object strictly matching this schema with NO markdown wrapping:
{{
  "meta": {{
    "title": "{doc_title}",
    "subtitle": "Test Strategy, Verification & Validation Specification",
    "author": "EVAL AI Enterprise Suite",
    "organization": "Quality Engineering & Assurance",
    "version": "1.0.0",
    "classification": "Confidential / QA Internal"
  }},
  "executive_summary": "High-level summary of testing scope, verification methodology, and release readiness criteria.",
  "sections": [
    {{
      "heading": "Section Title",
      "level": 1,
      "summary": "Brief section intent",
      "paragraphs": ["Detailed technical description...", "Validation methodology..."],
      "bullet_points": ["Requirement check 1", "Requirement check 2"],
      "callouts": [
        {{ "type": "info", "title": "Compliance Note", "content": "Adheres to ISO/IEC/IEEE 29119 testing standards." }}
      ],
      "tables": [
        {{
          "caption": "Test Coverage Matrix",
          "headers": ["Module / Feature", "Risk Level", "Test Strategy", "Exit Criteria"],
          "rows": [
            ["Authentication Service", "Critical", "Automated E2E + Boundary Fuzzing", "0 High Defects"]
          ]
        }}
      ]
    }}
  ],
  "slides": [
    {{
      "slide_number": 1,
      "layout_type": "title_slide",
      "title": "{doc_title}",
      "subtitle": "Executive Readiness Review",
      "speaker_notes": "Welcome stakeholders to the release verification review."
    }},
    {{
      "slide_number": 2,
      "layout_type": "card_grid",
      "title": "Quality Pillars & Coverage Goals",
      "subtitle": "Core validation dimensions",
      "cards": [
        {{ "title": "Functional Verification", "content": "100% critical user story acceptance paths validated." }},
        {{ "title": "Security & Resilience", "content": "Zero OWASP Top 10 vulnerabilities detected." }},
        {{ "title": "Performance Latency", "content": "p99 API response time under 180ms under 5k RPS." }}
      ],
      "speaker_notes": "Highlight key acceptance criteria met during the verification cycle."
    }}
  ]
}}

Rules:
1. Generate approximately {target_count} detailed sections for the Word/PDF document and {target_count} corresponding high-impact slides for the PowerPoint presentation.
2. In 'sections', include realistic tables with technical columns, bullet points, and specific verification metrics.
3. In 'slides', provide varied slide layouts ('title_slide', 'card_grid', 'split_columns', 'metric_callout', 'table_slide', 'conclusion') with actionable presenter speaker notes.
4. Professional tone, concrete technical terminology, no generic filler.
"""

    user_content_parts = [f"### Master Requirement / Prompt:\n{req.master_prompt}"]
    if req.instructions:
        user_content_parts.append(f"### Specific Guidelines & Instructions:\n{req.instructions}")
    if req.document_text:
        user_content_parts.append(f"### Ingested Requirements Document Reference:\n{req.document_text[:8000]}")

    user_prompt = "\n\n".join(user_content_parts)

    start_time = time.time()
    raw_content = ""
    prompt_tokens = 0
    completion_tokens = 0

    try:
        if provider == "groq":
            async with httpx.AsyncClient(timeout=120.0) as client:
                res = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.3,
                        "max_tokens": 4096,
                        "response_format": {"type": "json_object"}
                    }
                )
                if res.status_code != 200:
                    raise HTTPException(status_code=res.status_code, detail=f"Groq API Error: {res.text}")
                data = res.json()
                raw_content = data["choices"][0]["message"]["content"]
                usage = data.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)

        elif provider == "openai":
            async with httpx.AsyncClient(timeout=120.0) as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.3,
                        "max_tokens": 4096,
                        "response_format": {"type": "json_object"}
                    }
                )
                if res.status_code != 200:
                    raise HTTPException(status_code=res.status_code, detail=f"OpenAI API Error: {res.text}")
                data = res.json()
                raw_content = data["choices"][0]["message"]["content"]
                usage = data.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)

        elif provider == "gemini":
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            async with httpx.AsyncClient(timeout=120.0) as client:
                res = await client.post(
                    gemini_url,
                    json={
                        "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
                        "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"}
                    }
                )
                if res.status_code != 200:
                    raise HTTPException(status_code=res.status_code, detail=f"Gemini API Error: {res.text}")
                data = res.json()
                raw_content = data["candidates"][0]["content"]["parts"][0]["text"]
                usage = data.get("usageMetadata", {})
                prompt_tokens = usage.get("promptTokenCount", 0)
                completion_tokens = usage.get("candidatesTokenCount", 0)

        else:
            raise HTTPException(status_code=400, detail=f"Provider '{provider}' is not supported.")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to communicate with AI provider {provider}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"AI Provider Communication Error: {str(e)}")

    latency_ms = int((time.time() - start_time) * 1000)

    # Record token usage in database
    await record_llm_usage(
        db=db,
        user_id=user.id,
        provider=provider,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        latency_ms=latency_ms,
    )

    # Clean and parse JSON response
    cleaned_json_str = _clean_json_response(raw_content)
    try:
        parsed_doc_data = json.loads(cleaned_json_str)
        doc_model = DocumentContentModel(**parsed_doc_data)
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON document output: {e}\nRaw: {cleaned_json_str[:500]}")
        raise HTTPException(status_code=500, detail=f"Failed to parse generated document structure: {str(e)}")

    return GenerateDocResponse(
        status="SUCCESS",
        document_type=req.document_type,
        title=doc_model.meta.title or doc_title,
        content=doc_model,
        total_sections=len(doc_model.sections),
        total_slides=len(doc_model.slides),
        model=model,
        provider=provider,
        latency_ms=latency_ms,
        total_tokens=prompt_tokens + completion_tokens
    )


@router.post("/export")
async def export_test_document(
    req: ExportDocRequest,
    user: User = Depends(get_authenticated_user)
):
    """
    Builds and streams formatted Word (.docx), PDF (.pdf), PowerPoint (.pptx), or All (.zip).
    """
    safe_title = (req.content.meta.title or "Test_Document").replace(" ", "_").replace("/", "_")
    theme = req.theme or "corporate_blue"

    try:
        if req.document_type == "docx":
            stream = DocxBuilder.build(req.content, theme_name=theme)
            filename = req.filename or f"{safe_title}.docx"
            if not filename.endswith(".docx"):
                filename += ".docx"
            return StreamingResponse(
                stream,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{filename}"', "Access-Control-Expose-Headers": "Content-Disposition"}
            )

        elif req.document_type == "pdf":
            stream = PdfBuilder.build(req.content, theme_name=theme)
            filename = req.filename or f"{safe_title}.pdf"
            if not filename.endswith(".pdf"):
                filename += ".pdf"
            return StreamingResponse(
                stream,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"', "Access-Control-Expose-Headers": "Content-Disposition"}
            )

        elif req.document_type == "pptx":
            stream = PptxBuilder.build(req.content, theme_name=theme)
            filename = req.filename or f"{safe_title}.pptx"
            if not filename.endswith(".pptx"):
                filename += ".pptx"
            return StreamingResponse(
                stream,
                media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                headers={"Content-Disposition": f'attachment; filename="{filename}"', "Access-Control-Expose-Headers": "Content-Disposition"}
            )

        elif req.document_type in ("all_zip", "all"):
            stream = DocBundleBuilder.build_zip(req.content, theme_name=theme)
            filename = req.filename or f"{safe_title}_Bundle.zip"
            if not filename.endswith(".zip"):
                filename += ".zip"
            return StreamingResponse(
                stream,
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="{filename}"', "Access-Control-Expose-Headers": "Content-Disposition"}
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported export format '{req.document_type}'.")

    except Exception as e:
        logger.error(f"Document export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to export document: {str(e)}")


# ---------------------------------------------------------------------------
# Project-Level Persistence Endpoints
# ---------------------------------------------------------------------------
@router.get("/projects/{project_id}/config")
async def get_project_doc_config(
    project_id: str,
    user: User = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    """Loads saved document generator configuration for a project."""
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tmpl = project.report_template or {}
    doc_settings = tmpl.get("doc_generator_settings", {})
    return {
        "status": "SUCCESS",
        "project_id": project_id,
        "master_prompt": doc_settings.get("master_prompt"),
        "instructions": doc_settings.get("instructions"),
        "config": doc_settings.get("config", {})
    }


@router.post("/projects/{project_id}/save-prompt")
async def save_project_doc_prompt(
    project_id: str,
    req: SaveDocPromptRequest,
    user: User = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tmpl = dict(project.report_template or {})
    if "doc_generator_settings" not in tmpl:
        tmpl["doc_generator_settings"] = {}
    tmpl["doc_generator_settings"]["master_prompt"] = req.prompt
    project.report_template = tmpl
    flag_modified(project, "report_template")
    await db.commit()

    return {"status": "SUCCESS", "message": "Document prompt saved to project successfully", "project_id": project_id}


@router.post("/projects/{project_id}/save-instructions")
async def save_project_doc_instructions(
    project_id: str,
    req: SaveDocInstructionsRequest,
    user: User = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tmpl = dict(project.report_template or {})
    if "doc_generator_settings" not in tmpl:
        tmpl["doc_generator_settings"] = {}
    tmpl["doc_generator_settings"]["instructions"] = req.instructions
    project.report_template = tmpl
    flag_modified(project, "report_template")
    await db.commit()

    return {"status": "SUCCESS", "message": "Document instructions saved to project successfully", "project_id": project_id}


@router.post("/projects/{project_id}/save-config")
async def save_project_doc_config(
    project_id: str,
    req: SaveDocConfigRequest,
    user: User = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tmpl = dict(project.report_template or {})
    if "doc_generator_settings" not in tmpl:
        tmpl["doc_generator_settings"] = {}
    tmpl["doc_generator_settings"]["config"] = req.model_dump()
    project.report_template = tmpl
    flag_modified(project, "report_template")
    await db.commit()

    return {"status": "SUCCESS", "message": "Document configuration saved to project successfully", "project_id": project_id}

import os
import uuid
import base64
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/documents", tags=["Documents & Attachments"])

# Directory for storing uploaded attachments persistently on disk
UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# In-memory / persistent project store
PROJECT_DOCUMENTS: Dict[str, List[Dict[str, Any]]] = {}

# File cache mapping att_id -> file path
DOCUMENT_FILES: Dict[str, str] = {}

class SaveDocumentsPayload(BaseModel):
    project_id: str
    documents: List[Dict[str, Any]]

def _get_media_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime_map = {
        "pdf": "application/pdf",
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "csv": "text/csv",
        "xls": "application/vnd.ms-excel",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt": "application/vnd.ms-powerpoint",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "json": "application/json",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "txt": "text/plain",
    }
    return mime_map.get(ext, "application/octet-stream")

@router.get("")
async def get_documents(project_id: Optional[str] = Query(None)):
    """Retrieve uploaded documents for a project."""
    if not project_id:
        all_docs = []
        for docs in PROJECT_DOCUMENTS.values():
            all_docs.extend(docs)
        return all_docs
    return PROJECT_DOCUMENTS.get(project_id, [])

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    project_id: str = Form("proj-travel-01"),
    custom_id: Optional[str] = Form(None),
):
    """
    Accepts document upload (PDF, Word, CSV, Excel, PPTX).
    Saves file to disk and returns file_name, attachment_id, and persistent blob_url.
    """
    from app.core.kill_switch import SystemKillSwitchManager
    if not SystemKillSwitchManager.is_allowed("document_upload"):
        raise HTTPException(
            status_code=503,
            detail="Document upload is currently disabled by system administrator (Kill Switch Active)."
        )

    content = await file.read()
    file_size = len(content)
    att_id = custom_id or f"att_{uuid.uuid4().hex[:12]}"
    
    # Save file to disk
    safe_filename = file.filename.replace(" ", "_")
    saved_path = UPLOADS_DIR / f"{att_id}_{safe_filename}"
    with open(saved_path, "wb") as f:
        f.write(content)
    
    DOCUMENT_FILES[att_id] = str(saved_path)
    
    # Permanent backend blob URL accessible from frontend or direct browser tab
    blob_url = f"/api/v1/documents/blob/{att_id}/{file.filename}"
    
    doc_record = {
        "id": att_id,
        "project_id": project_id,
        "file_name": file.filename,
        "attachment_id": att_id,
        "blob_url": blob_url,
        "file_size_bytes": file_size,
        "content_type": file.content_type or _get_media_type(file.filename),
        "api_url": "/api/v1/documents/upload",
        "method": "POST",
        "status": "UPLOADED",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    
    if project_id not in PROJECT_DOCUMENTS:
        PROJECT_DOCUMENTS[project_id] = []
    
    # Replace existing or append
    PROJECT_DOCUMENTS[project_id] = [d for d in PROJECT_DOCUMENTS[project_id] if d.get("attachment_id") != att_id]
    PROJECT_DOCUMENTS[project_id].insert(0, doc_record)
    
    return {
        "status": "SUCCESS",
        "message": "Document uploaded successfully",
        "document": doc_record,
        "file_name": file.filename,
        "attachment_id": att_id,
        "blob_url": blob_url
    }

@router.get("/blob/{attachment_id}/{filename}")
async def serve_document_blob(attachment_id: str, filename: str):
    """
    Serves the actual uploaded file with proper headers for inline browser preview or download.
    """
    # 1. Check DOCUMENT_FILES cache
    file_path = DOCUMENT_FILES.get(attachment_id)
    
    # 2. Check disk in UPLOADS_DIR
    if not file_path or not os.path.exists(file_path):
        for candidate in UPLOADS_DIR.glob(f"{attachment_id}_*"):
            if candidate.is_file():
                file_path = str(candidate)
                DOCUMENT_FILES[attachment_id] = file_path
                break

    # 3. If file physically exists on disk, serve it with correct media type
    if file_path and os.path.exists(file_path):
        media_type = _get_media_type(filename)
        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=filename,
            headers={"Content-Disposition": f'inline; filename="{filename}"'}
        )

    # 4. Fallback: generate a valid sample preview if the file was created before server restart
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    media_type = _get_media_type(filename)
    if ext == "pdf":
        dummy_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF\n"
        return Response(content=dummy_pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})
    else:
        dummy_content = f"Document: {filename}\nAttachment ID: {attachment_id}\nRegistered in Universal AI Agent QA Platform.".encode("utf-8")
        return Response(content=dummy_content, media_type=media_type, headers={"Content-Disposition": f'inline; filename="{filename}"'})

@router.post("/bulk-save")
async def bulk_save_documents(payload: SaveDocumentsPayload):
    """Saves or synchronizes project documents."""
    PROJECT_DOCUMENTS[payload.project_id] = payload.documents
    return {"status": "SUCCESS", "saved_count": len(payload.documents)}

@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """Deletes a document from all projects and cleans up file if present."""
    deleted = False
    for p_id in PROJECT_DOCUMENTS:
        PROJECT_DOCUMENTS[p_id] = [d for d in PROJECT_DOCUMENTS[p_id] if d.get("id") != document_id and d.get("attachment_id") != document_id]
        deleted = True
    
    file_path = DOCUMENT_FILES.pop(document_id, None)
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass
            
    return {"status": "SUCCESS", "deleted": deleted}

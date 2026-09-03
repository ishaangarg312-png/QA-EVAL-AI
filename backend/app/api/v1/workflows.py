from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from app.core.database import get_db
from app.models.workflow import Workflow, WorkflowNode, WorkflowEdge
from app.schemas.workflow import WorkflowCreate, WorkflowResponse, WorkflowNodeSchema, WorkflowEdgeSchema

router = APIRouter(prefix="/workflows", tags=["Workflows"])

@router.get("", response_model=List[WorkflowResponse])
async def list_workflows(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Workflow).where(Workflow.project_id == project_id)
    res = await db.execute(stmt)
    workflows = res.scalars().all()
    out = []
    for w in workflows:
        nodes_stmt = select(WorkflowNode).where(WorkflowNode.workflow_id == w.id)
        nodes_res = await db.execute(nodes_stmt)
        nodes = nodes_res.scalars().all()

        edges_stmt = select(WorkflowEdge).where(WorkflowEdge.workflow_id == w.id)
        edges_res = await db.execute(edges_stmt)
        edges = edges_res.scalars().all()

        out.append(WorkflowResponse(
            id=w.id,
            project_id=w.project_id,
            name=w.name,
            description=w.description,
            version=w.version,
            created_at=w.created_at,
            nodes=[WorkflowNodeSchema(
                id=n.id,
                node_key=n.node_key,
                node_type=n.node_type,
                label=n.label,
                position_x=n.position_x,
                position_y=n.position_y,
                config=n.config or {},
                assertions=n.assertions or [],
                is_disabled=n.is_disabled
            ) for n in nodes],
            edges=[WorkflowEdgeSchema(
                id=e.id,
                source_node_key=e.source_node_key,
                target_node_key=e.target_node_key,
                condition_expr=e.condition_expr,
                label=e.label
            ) for e in edges]
        ))
    return out

@router.post("", response_model=WorkflowResponse)
async def create_workflow(wf_in: WorkflowCreate, db: AsyncSession = Depends(get_db)):
    wf = Workflow(
        project_id=wf_in.project_id,
        name=wf_in.name,
        description=wf_in.description
    )
    db.add(wf)
    await db.flush()

    for n in wf_in.nodes:
        node = WorkflowNode(
            workflow_id=wf.id,
            node_key=n.node_key,
            node_type=n.node_type,
            label=n.label,
            position_x=n.position_x,
            position_y=n.position_y,
            config=n.config,
            assertions=n.assertions,
            is_disabled=str(n.is_disabled).lower() if n.is_disabled is not None else "false"
        )
        db.add(node)

    for e in wf_in.edges:
        edge = WorkflowEdge(
            workflow_id=wf.id,
            source_node_key=e.source_node_key,
            target_node_key=e.target_node_key,
            condition_expr=e.condition_expr,
            label=e.label
        )
        db.add(edge)

    await db.commit()
    await db.refresh(wf)
    return await get_workflow_by_id(wf.id, db)

@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow_by_id(workflow_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Workflow).where(Workflow.id == workflow_id)
    res = await db.execute(stmt)
    w = res.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")

    nodes_stmt = select(WorkflowNode).where(WorkflowNode.workflow_id == w.id)
    nodes_res = await db.execute(nodes_stmt)
    nodes = nodes_res.scalars().all()

    edges_stmt = select(WorkflowEdge).where(WorkflowEdge.workflow_id == w.id)
    edges_res = await db.execute(edges_stmt)
    edges = edges_res.scalars().all()

    return WorkflowResponse(
        id=w.id,
        project_id=w.project_id,
        name=w.name,
        description=w.description,
        version=w.version,
        created_at=w.created_at,
        nodes=[WorkflowNodeSchema(
            id=n.id,
            node_key=n.node_key,
            node_type=n.node_type,
            label=n.label,
            position_x=n.position_x,
            position_y=n.position_y,
            config=n.config or {},
            assertions=n.assertions or [],
            is_disabled=n.is_disabled
        ) for n in nodes],
        edges=[WorkflowEdgeSchema(
            id=e.id,
            source_node_key=e.source_node_key,
            target_node_key=e.target_node_key,
            condition_expr=e.condition_expr,
            label=e.label
        ) for e in edges]
    )

@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: str, wf_in: WorkflowCreate, db: AsyncSession = Depends(get_db)):
    stmt = select(Workflow).where(Workflow.id == workflow_id)
    res = await db.execute(stmt)
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf.name = wf_in.name
    wf.description = wf_in.description

    # Delete existing nodes and edges
    await db.execute(delete(WorkflowNode).where(WorkflowNode.workflow_id == wf.id))
    await db.execute(delete(WorkflowEdge).where(WorkflowEdge.workflow_id == wf.id))

    # Insert updated
    for n in wf_in.nodes:
        node = WorkflowNode(
            workflow_id=wf.id,
            node_key=n.node_key,
            node_type=n.node_type,
            label=n.label,
            position_x=n.position_x,
            position_y=n.position_y,
            config=n.config,
            assertions=n.assertions,
            is_disabled=str(n.is_disabled).lower() if n.is_disabled is not None else "false"
        )
        db.add(node)

    for e in wf_in.edges:
        edge = WorkflowEdge(
            workflow_id=wf.id,
            source_node_key=e.source_node_key,
            target_node_key=e.target_node_key,
            condition_expr=e.condition_expr,
            label=e.label
        )
        db.add(edge)

    await db.commit()
    return await get_workflow_by_id(wf.id, db)

import os
import json
import httpx
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class AIParameterizeRequest(BaseModel):
    raw_json: str
    available_variables: List[str] = []
    groq_api_key: Optional[str] = None
    model: Optional[str] = "llama-3.3-70b-versatile"

class AIParameterizeResponse(BaseModel):
    parameterized_json: str
    cleaned_json: str
    changes_made: List[str]
    success: bool
    error: Optional[str] = None

@router.post("/ai-parameterize-json", response_model=AIParameterizeResponse)
async def ai_parameterize_json(req: AIParameterizeRequest):
    raw_text = req.raw_json.strip()
    if not raw_text:
        return AIParameterizeResponse(
            parameterized_json="{}",
            cleaned_json="{}",
            changes_made=[],
            success=True
        )

    groq_key = (req.groq_api_key or os.getenv("GROQ_API_KEY") or "").strip()
    vars_str = ", ".join([f"{{{{{v}}}}}" for v in req.available_variables]) if req.available_variables else "{{attachment_id}}, {{blob_url}}, {{message}}, {{access_token}}"
    
    groq_error = None
    if groq_key:
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                system_prompt = (
                    "You are an expert API Automation Engineer.\n"
                    "Your task is to take a real-world API JSON payload and output a 100% syntactically valid JSON template parameterized with {{variable_name}} placeholders.\n\n"
                    f"AVAILABLE VARIABLES: {vars_str}\n\n"
                    "STRICT REQUIREMENTS:\n"
                    "1. Fix any invalid JSON syntax (e.g. unquoted identifiers, unquoted {{vars}}, missing quotes, broken braces).\n"
                    "2. If user_id is a fixed GUID, leave user_id untouched (DO NOT replace user_id with attachment_id).\n"
                    "3. If attachment_ids is an array or unquoted value, map it as: \"attachment_ids\": [\"{{attachment_id}}\"].\n"
                    "4. If dependencies object exists, map it strictly as:\n"
                    '   "dependencies": {\n'
                    '     "file_uploaded_blob_url": ["{{blob_url}}"],\n'
                    '     "attachment_id": ["{{attachment_id}}"]\n'
                    '   }\n'
                    "5. If message has a sample string, map to: \"message\": \"{{message}}\".\n"
                    "6. Return ONLY valid JSON in this exact structure:\n"
                    "{\n"
                    '  "parameterized_json": "...",\n'
                    '  "changes_made": ["...list of changes..."]\n'
                    "}"
                )

                user_prompt = f"Parameterize and fix this JSON payload:\n\n{raw_text}"

                groq_resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": req.model or "llama-3.3-70b-versatile",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.0,
                        "response_format": {"type": "json_object"}
                    }
                )

                if groq_resp.status_code == 200:
                    data = groq_resp.json()
                    content = data["choices"][0]["message"]["content"]
                    parsed_llm = json.loads(content)
                    param_json = parsed_llm.get("parameterized_json", "")
                    if isinstance(param_json, (dict, list)):
                        param_json = json.dumps(param_json, indent=2)
                    elif isinstance(param_json, str):
                        try:
                            # Verify valid JSON
                            p = json.loads(param_json)
                            param_json = json.dumps(p, indent=2)
                        except Exception:
                            pass

                    if param_json and param_json != "{}":
                        return AIParameterizeResponse(
                            parameterized_json=param_json,
                            cleaned_json=param_json,
                            changes_made=parsed_llm.get("changes_made", ["✨ Groq Llama-3.3-70B successfully parameterized and formatted JSON!"]),
                            success=True
                        )
                else:
                    groq_error = f"Groq API error ({groq_resp.status_code}): {groq_resp.text}"
        except Exception as ex:
            groq_error = f"Groq connection error: {str(ex)}"

    # Deterministic Rule-Based Parameterizer and Syntax Corrector
    import re
    changes = []
    text = raw_text

    # 1. Fix broken dependencies pattern {[...],[...]} or {{blob_url}},{{attachment_id}}
    if "dependencies" in text:
        text = re.sub(
            r'"dependencies"\s*:\s*\{[^{}]*\}',
            '"dependencies": {\n    "file_uploaded_blob_url": [\n      "{{blob_url}}"\n    ],\n    "attachment_id": [\n      "{{attachment_id}}"\n    ]\n  }',
            text
        )
        changes.append('Formatted "dependencies" with valid "file_uploaded_blob_url" and "attachment_id" string arrays')

    # 2. Fix unquoted/broken attachment_ids
    # matches "attachment_ids": {{attachment_id}} or "attachment_ids": [{{attachment_id}}] or "attachment_ids": ["...uuid..."]
    if "attachment_ids" in text:
        text = re.sub(
            r'"attachment_ids"\s*:\s*(?:\[\s*(?:\{\{attachment_id\}\}|"[^"]*")\s*\]|\{\{attachment_id\}\}|"[^"]*")',
            '"attachment_ids": [\n    "{{attachment_id}}"\n  ]',
            text
        )
        changes.append('Formatted "attachment_ids" to ["{{attachment_id}}"]')

    # 3. Fix unquoted/broken file_uploaded_blob_url
    if "file_uploaded_blob_url" in text:
        text = re.sub(
            r'"file_uploaded_blob_url"\s*:\s*(?:\[\s*(?:\{\{blob_url\}\}|"[^"]*")\s*\]|\{\{blob_url\}\}|"[^"]*")',
            '"file_uploaded_blob_url": [\n      "{{blob_url}}"\n    ]',
            text
        )
        changes.append('Formatted "file_uploaded_blob_url" to ["{{blob_url}}"]')

    # 4. Fix unquoted/broken attachment_id inside dependencies
    if '"attachment_id"' in text:
        text = re.sub(
            r'("attachment_id"\s*:\s*)(?:\[\s*(?:\{\{attachment_id\}\}|"[^"]*")\s*\]|\{\{attachment_id\}\}|"[^"]*")',
            r'\1[\n      "{{attachment_id}}"\n    ]',
            text
        )

    # 5. Fix message string
    if '"message"' in text and ("message" in req.available_variables or "message" in text):
        text = re.sub(
            r'"message"\s*:\s*"[^"]*"',
            '"message": "{{message}}"',
            text
        )
        changes.append('Mapped "message" to "{{message}}"')

    # 6. Fix general unquoted {{var}} into "{{var}}"
    text = re.sub(r':\s*\{\{([a-zA-Z0-9_]+)\}\}', r': "{{\1}}"', text)

    # 7. Try parsing as JSON to beautify
    final_json = text
    try:
        parsed = json.loads(text)
        final_json = json.dumps(parsed, indent=2)
    except Exception:
        # try quote sanitization
        try:
            candidate = text.replace("'", '"')
            parsed = json.loads(candidate)
            final_json = json.dumps(parsed, indent=2)
        except Exception:
            final_json = text

    if groq_error:
        changes.insert(0, f"⚠️ Note: {groq_error} (Applied smart deterministic corrections)")

    return AIParameterizeResponse(
        parameterized_json=final_json,
        cleaned_json=final_json,
        changes_made=changes or ["Cleaned and formatted JSON payload"],
        success=True,
        error=groq_error
    )

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any
from app.core.database import get_db
from app.models.project import Project, Environment
from app.models.agent import Agent, AgentVersion
from app.models.test_case import TestSuite, TestCase
from app.models.workflow import Workflow
from app.schemas.execution import ExecutionRunResponse, ExecutionRunCreate
from app.api.v1.executions import trigger_execution, get_execution
from app.api.v1.regression import compare_versions
from app.api.v1.rca import get_or_generate_rca
from app.domain.types import ExecutionStatus

router = APIRouter(prefix="/demo", tags=["Interactive Demo Scenarios"])

@router.post("/run-full-travel-workflow", response_model=ExecutionRunResponse)
async def run_full_travel_workflow(db: AsyncSession = Depends(get_db)):
    """Executes full 11-step Travel AI Agent flow (Prompt->Agent->Search API->Extract->Followup->Booking API->HITL->Outlook Email->3-Layer Eval)"""
    # Fetch seeded project and environment
    p_stmt = select(Project).limit(1)
    p_res = await db.execute(p_stmt)
    proj = p_res.scalar_one_or_none()

    env_stmt = select(Environment).where(Environment.project_id == proj.id).limit(1)
    env_res = await db.execute(env_stmt)
    env = env_res.scalar_one_or_none()

    # Agent version v1.0.0
    v_stmt = select(AgentVersion).where(AgentVersion.version_tag == "v1.0.0").limit(1)
    v_res = await db.execute(v_stmt)
    v1 = v_res.scalar_one_or_none()

    # Workflow
    wf_stmt = select(Workflow).where(Workflow.project_id == proj.id).limit(1)
    wf_res = await db.execute(wf_stmt)
    wf = wf_res.scalar_one_or_none()

    req = ExecutionRunCreate(
        project_id=proj.id,
        environment_id=env.id,
        agent_version_id=v1.id if v1 else None,
        workflow_id=wf.id if wf else None,
        initial_variables={"origin": "Delhi (DEL)", "destination": "Dubai (DXB)", "travel_date": "Tomorrow"}
    )
    from fastapi import BackgroundTasks
    return await trigger_execution(req, BackgroundTasks(), db)

@router.post("/run-regressed-agent-v2", response_model=ExecutionRunResponse)
async def run_regressed_agent_v2(db: AsyncSession = Depends(get_db)):
    """Executes the regressed Agent v2.0.0 with tool ambiguity to demonstrate failure and RCA"""
    p_stmt = select(Project).limit(1)
    p_res = await db.execute(p_stmt)
    proj = p_res.scalar_one_or_none()

    env_stmt = select(Environment).where(Environment.project_id == proj.id).limit(1)
    env_res = await db.execute(env_stmt)
    env = env_res.scalar_one_or_none()

    v_stmt = select(AgentVersion).where(AgentVersion.version_tag == "v2.0.0").limit(1)
    v_res = await db.execute(v_stmt)
    v2 = v_res.scalar_one_or_none()

    wf_stmt = select(Workflow).where(Workflow.project_id == proj.id).limit(1)
    wf_res = await db.execute(wf_stmt)
    wf = wf_res.scalar_one_or_none()

    req = ExecutionRunCreate(
        project_id=proj.id,
        environment_id=env.id,
        agent_version_id=v2.id if v2 else None,
        workflow_id=wf.id if wf else None,
        initial_variables={"origin": "Delhi (DEL)", "destination": "Dubai (DXB)", "test_flags": ["fail_tool"]}
    )
    from fastapi import BackgroundTasks
    return await trigger_execution(req, BackgroundTasks(), db)

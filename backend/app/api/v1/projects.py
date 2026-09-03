from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict
from collections import defaultdict
from app.core.database import get_db
from app.core.security import encrypt_secret, mask_secret, decrypt_secret
from app.models.project import Project, Environment, SecretItem
from app.models.organization import Organization
from app.domain.types import EnvironmentType
from app.schemas.project import ProjectCreate, ProjectResponse, EnvironmentCreate, EnvironmentResponse, SecretCreate, SecretResponse, ReportTemplateUpdate

router = APIRouter(prefix="/projects", tags=["Projects & Environments"])

@router.get("", response_model=List[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    stmt = select(Project).order_by(Project.created_at.desc())
    res = await db.execute(stmt)
    projects = res.scalars().all()
    if not projects:
        return []

    project_ids = [p.id for p in projects]

    # Batch load environments in a single query
    env_stmt = select(Environment).where(Environment.project_id.in_(project_ids))
    env_res = await db.execute(env_stmt)
    all_envs = env_res.scalars().all()

    env_by_project: Dict[str, List[Environment]] = defaultdict(list)
    env_ids = []
    for e in all_envs:
        env_by_project[e.project_id].append(e)
        env_ids.append(e.id)

    # Batch load secrets in a single query
    sec_by_env: Dict[str, List[SecretResponse]] = defaultdict(list)
    if env_ids:
        sec_stmt = select(SecretItem).where(SecretItem.environment_id.in_(env_ids))
        sec_res = await db.execute(sec_stmt)
        all_secs = sec_res.scalars().all()
        for s in all_secs:
            sec_by_env[s.environment_id].append(SecretResponse(
                id=s.id,
                environment_id=s.environment_id,
                key=s.key,
                masked_value=mask_secret(decrypt_secret(s.encrypted_value)),
                description=s.description,
                created_at=s.created_at
            ))

    out = []
    for p in projects:
        env_list = [
            EnvironmentResponse(
                id=e.id,
                project_id=e.project_id,
                name=e.name,
                env_type=e.env_type,
                base_url=e.base_url,
                variables=e.variables or {},
                secrets=sec_by_env.get(e.id, []),
                created_at=e.created_at
            ) for e in env_by_project.get(p.id, [])
        ]
        out.append(ProjectResponse(
            id=p.id,
            organization_id=p.organization_id,
            name=p.name,
            slug=p.slug,
            description=p.description,
            report_template=p.report_template or {},
            settings={"dataset_execution_strategy": (p.report_template or {}).get("dataset_execution_strategy")},
            created_at=p.created_at,
            environments=env_list
        ))
    return out

@router.post("", response_model=ProjectResponse)
async def create_project(req: ProjectCreate, db: AsyncSession = Depends(get_db)):
    org_stmt = select(Organization).limit(1)
    org_res = await db.execute(org_stmt)
    org = org_res.scalar_one_or_none()
    if not org:
        org = Organization(name="Default Enterprise", slug="default")
        db.add(org)
        await db.flush()

    project = Project(
        organization_id=org.id,
        name=req.name,
        slug=req.slug,
        description=req.description,
        report_template=req.report_template or {}
    )
    db.add(project)
    await db.flush()

    # Create default environments (DEV, QA, PRODUCTION)
    for env_name in ["DEV", "QA", "PRODUCTION"]:
        env_type = getattr(EnvironmentType, env_name, EnvironmentType.QA)
        env = Environment(
            project_id=project.id,
            name=env_name,
            env_type=env_type,
            base_url=f"https://api.{project.slug}.{env_name.lower()}.internal"
        )
        db.add(env)
    
    await db.commit()
    await db.refresh(project)
    return await get_project_by_id(project.id, db)

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project_by_id(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    
    env_stmt = select(Environment).where(Environment.project_id == p.id)
    env_res = await db.execute(env_stmt)
    envs = env_res.scalars().all()
    env_list = []
    for e in envs:
        sec_stmt = select(SecretItem).where(SecretItem.environment_id == e.id)
        sec_res = await db.execute(sec_stmt)
        secs = sec_res.scalars().all()
        sec_list = [
            SecretResponse(
                id=s.id,
                environment_id=s.environment_id,
                key=s.key,
                masked_value=mask_secret(decrypt_secret(s.encrypted_value)),
                description=s.description,
                created_at=s.created_at
            ) for s in secs
        ]
        env_list.append(EnvironmentResponse(
            id=e.id,
            project_id=e.project_id,
            name=e.name,
            env_type=e.env_type,
            base_url=e.base_url,
            variables=e.variables or {},
            secrets=sec_list,
            created_at=e.created_at
        ))
    return ProjectResponse(
        id=p.id,
        organization_id=p.organization_id,
        name=p.name,
        slug=p.slug,
        description=p.description,
        report_template=p.report_template or {},
        settings={"dataset_execution_strategy": (p.report_template or {}).get("dataset_execution_strategy")},
        created_at=p.created_at,
        environments=env_list
    )

@router.get("/{project_id}/report-template")
async def get_project_report_template(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"template": p.report_template or {}}

@router.put("/{project_id}/report-template")
async def update_project_report_template(project_id: str, req: ReportTemplateUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    p.report_template = req.report_template
    await db.commit()
    await db.refresh(p)
    return {"status": "SUCCESS", "template": p.report_template}

class ExecutionStrategyUpdateRequest(BaseModel):
    strategy: dict = {}

@router.put("/{project_id}/execution-strategy")
async def update_project_execution_strategy(project_id: str, req: ExecutionStrategyUpdateRequest, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm.attributes import flag_modified
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    tmpl = dict(p.report_template or {})
    tmpl["dataset_execution_strategy"] = req.strategy
    p.report_template = tmpl
    flag_modified(p, "report_template")
    await db.commit()
    await db.refresh(p)
    return {"status": "SUCCESS", "strategy": req.strategy}

@router.get("/{project_id}/execution-strategy")
async def get_project_execution_strategy(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    tmpl = dict(p.report_template or {})
    strat = tmpl.get("dataset_execution_strategy")
    return {"strategy": strat}

@router.post("/{environment_id}/secrets", response_model=SecretResponse)
async def add_secret(environment_id: str, secret_in: SecretCreate, db: AsyncSession = Depends(get_db)):
    sec = SecretItem(
        environment_id=environment_id,
        key=secret_in.key,
        encrypted_value=encrypt_secret(secret_in.value),
        description=secret_in.description
    )
    db.add(sec)
    await db.commit()
    await db.refresh(sec)
    return SecretResponse(
        id=sec.id,
        environment_id=sec.environment_id,
        key=sec.key,
        masked_value=mask_secret(secret_in.value),
        description=sec.description,
        created_at=sec.created_at
    )

async def _cascade_delete_single_project(project_id: str, db: AsyncSession):
    from sqlalchemy import delete
    from app.models.execution import ExecutionRun, ExecutionStep, TraceEvent, HITLTask
    from app.models.evaluation import EvaluationResult, EvaluatorConfig, RCAAnalysis, RegressionReport
    from app.models.workflow import Workflow, WorkflowNode, WorkflowEdge
    from app.models.test_case import TestSuite, TestCase, TestDataset
    from app.models.agent import Agent, AgentVersion

    proj_stmt = select(Project).where(Project.id == project_id)
    proj_res = await db.execute(proj_stmt)
    proj = proj_res.scalar_one_or_none()
    if not proj:
        return False

    # 1. Bulk Delete Execution Runs & Children
    exec_stmt = select(ExecutionRun.id).where(ExecutionRun.project_id == project_id)
    exec_ids = (await db.execute(exec_stmt)).scalars().all()
    if exec_ids:
        await db.execute(delete(RCAAnalysis).where(RCAAnalysis.execution_id.in_(exec_ids)))
        await db.execute(delete(TraceEvent).where(TraceEvent.execution_id.in_(exec_ids)))
        await db.execute(delete(ExecutionStep).where(ExecutionStep.execution_id.in_(exec_ids)))
        await db.execute(delete(EvaluationResult).where(EvaluationResult.execution_id.in_(exec_ids)))
        await db.execute(delete(HITLTask).where(HITLTask.execution_id.in_(exec_ids)))
        await db.execute(delete(ExecutionRun).where(ExecutionRun.id.in_(exec_ids)))

    # 2. Bulk Delete Regression Reports
    try:
        await db.execute(delete(RegressionReport).where(RegressionReport.project_id == project_id))
    except Exception:
        pass

    # 3. Bulk Delete Test Cases, Suites, and Datasets
    ts_stmt = select(TestSuite.id).where(TestSuite.project_id == project_id)
    ts_ids = (await db.execute(ts_stmt)).scalars().all()
    if ts_ids:
        await db.execute(delete(TestCase).where(TestCase.test_suite_id.in_(ts_ids)))
        await db.execute(delete(TestSuite).where(TestSuite.id.in_(ts_ids)))

    await db.execute(delete(TestDataset).where(TestDataset.project_id == project_id))

    # 4. Bulk Delete Workflows, Nodes, and Edges
    wf_stmt = select(Workflow.id).where(Workflow.project_id == project_id)
    wf_ids = (await db.execute(wf_stmt)).scalars().all()
    if wf_ids:
        await db.execute(delete(WorkflowNode).where(WorkflowNode.workflow_id.in_(wf_ids)))
        await db.execute(delete(WorkflowEdge).where(WorkflowEdge.workflow_id.in_(wf_ids)))
        await db.execute(delete(Workflow).where(Workflow.id.in_(wf_ids)))

    # 5. Bulk Delete Evaluator Configs
    await db.execute(delete(EvaluatorConfig).where(EvaluatorConfig.project_id == project_id))

    # 6. Bulk Delete Agents and Versions
    ag_stmt = select(Agent.id).where(Agent.project_id == project_id)
    ag_ids = (await db.execute(ag_stmt)).scalars().all()
    if ag_ids:
        await db.execute(delete(AgentVersion).where(AgentVersion.agent_id.in_(ag_ids)))
        await db.execute(delete(Agent).where(Agent.id.in_(ag_ids)))

    # 7. Bulk Delete Environments and Secrets
    env_stmt = select(Environment.id).where(Environment.project_id == project_id)
    env_ids = (await db.execute(env_stmt)).scalars().all()
    if env_ids:
        await db.execute(delete(SecretItem).where(SecretItem.environment_id.in_(env_ids)))
        await db.execute(delete(Environment).where(Environment.id.in_(env_ids)))

    # 8. Delete Project itself
    await db.execute(delete(Project).where(Project.id == project_id))
    return True

@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    success = await _cascade_delete_single_project(project_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.commit()
    return {"status": "deleted", "id": project_id}

from pydantic import BaseModel as PyBaseModel

class BatchDeleteProjectsRequest(PyBaseModel):
    project_ids: List[str]

@router.post("/batch-delete")
async def batch_delete_projects(req: BatchDeleteProjectsRequest, db: AsyncSession = Depends(get_db)):
    deleted_count = 0
    for pid in req.project_ids:
        if await _cascade_delete_single_project(pid, db):
            deleted_count += 1
    await db.commit()
    return {"status": "batch_deleted", "deleted_count": deleted_count, "requested_count": len(req.project_ids)}

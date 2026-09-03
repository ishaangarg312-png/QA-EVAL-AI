from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.agent import Agent, AgentVersion
from app.schemas.agent import AgentCreate, AgentResponse, AgentVersionCreate, AgentVersionResponse

router = APIRouter(prefix="/agents", tags=["Agents & Versions"])

@router.get("", response_model=List[AgentResponse])
async def list_agents(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Agent).where(Agent.project_id == project_id)
    res = await db.execute(stmt)
    agents = res.scalars().all()
    out = []
    for a in agents:
        v_stmt = select(AgentVersion).where(AgentVersion.agent_id == a.id).order_by(AgentVersion.created_at.desc())
        v_res = await db.execute(v_stmt)
        versions = v_res.scalars().all()
        out.append(AgentResponse(
            id=a.id,
            project_id=a.project_id,
            name=a.name,
            agent_type=a.agent_type,
            description=a.description,
            created_at=a.created_at,
            versions=[AgentVersionResponse.model_validate(v) for v in versions]
        ))
    return out

@router.post("", response_model=AgentResponse)
async def create_agent(agent_in: AgentCreate, db: AsyncSession = Depends(get_db)):
    agent = Agent(
        project_id=agent_in.project_id,
        name=agent_in.name,
        agent_type=agent_in.agent_type,
        description=agent_in.description
    )
    db.add(agent)
    await db.flush()

    if agent_in.initial_version:
        v = AgentVersion(
            agent_id=agent.id,
            version_tag=agent_in.initial_version.version_tag,
            endpoint_url=agent_in.initial_version.endpoint_url,
            model_name=agent_in.initial_version.model_name,
            system_prompt=agent_in.initial_version.system_prompt,
            tools_schema=agent_in.initial_version.tools_schema,
            config=agent_in.initial_version.config
        )
        db.add(v)

    await db.commit()
    await db.refresh(agent)
    return await get_agent(agent.id, db)

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Agent).where(Agent.id == agent_id)
    res = await db.execute(stmt)
    agent = res.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    v_stmt = select(AgentVersion).where(AgentVersion.agent_id == agent.id).order_by(AgentVersion.created_at.desc())
    v_res = await db.execute(v_stmt)
    versions = v_res.scalars().all()

    return AgentResponse(
        id=agent.id,
        project_id=agent.project_id,
        name=agent.name,
        agent_type=agent.agent_type,
        description=agent.description,
        created_at=agent.created_at,
        versions=[AgentVersionResponse.model_validate(v) for v in versions]
    )

@router.post("/{agent_id}/versions", response_model=AgentVersionResponse)
async def add_agent_version(agent_id: str, version_in: AgentVersionCreate, db: AsyncSession = Depends(get_db)):
    version = AgentVersion(
        agent_id=agent_id,
        version_tag=version_in.version_tag,
        endpoint_url=version_in.endpoint_url,
        model_name=version_in.model_name,
        system_prompt=version_in.system_prompt,
        tools_schema=version_in.tools_schema,
        config=version_in.config
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version

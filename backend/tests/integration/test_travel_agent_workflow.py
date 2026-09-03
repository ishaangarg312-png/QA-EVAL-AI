import pytest
import uuid
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal, engine, Base
from app.models.organization import Organization
from app.models.project import Project, Environment
from app.models.agent import Agent, AgentVersion
from app.models.execution import ExecutionRun
from app.execution.engine import GraphExecutionEngine
from app.domain.types import ExecutionStatus, EnvironmentType, AgentType

@pytest.mark.asyncio
async def test_full_travel_agent_execution_workflow():
    # Setup test DB
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN report_template JSON DEFAULT '{}'"))
        except Exception:
            pass

    async with AsyncSessionLocal() as session:
        # Create test org, project & env
        org = Organization(name="Test Org", slug=f"org-{uuid.uuid4().hex[:6]}")
        session.add(org)
        await session.flush()

        project = Project(organization_id=org.id, name="Integration Travel Project", slug=f"proj-{uuid.uuid4().hex[:6]}")
        session.add(project)
        await session.flush()

        env = Environment(project_id=project.id, name="QA", env_type=EnvironmentType.QA)
        session.add(env)
        await session.flush()

        agent = Agent(project_id=project.id, name="Travel Agent", agent_type=AgentType.CUSTOM)
        session.add(agent)
        await session.flush()

        v1 = AgentVersion(agent_id=agent.id, version_tag="v1.0.0", model_name="gpt-4o")
        session.add(v1)
        await session.flush()

        run = ExecutionRun(
            correlation_id=f"test-corr-{uuid.uuid4().hex[:6]}",
            project_id=project.id,
            environment_id=env.id,
            agent_version_id=v1.id,
            status=ExecutionStatus.QUEUED
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)

        # Run Engine
        engine_inst = GraphExecutionEngine(session)
        res = await engine_inst.execute_run(run.id, agent_version_tag="v1.0.0")

        assert res.status == ExecutionStatus.PASSED
        assert res.quality_score is not None
        assert res.quality_score >= 90.0
        assert res.safety_score == 100.0
        assert res.total_tokens > 0

        # Query steps & evals
        from app.models.execution import ExecutionStep, TraceEvent
        from app.models.evaluation import EvaluationResult
        
        steps_stmt = select(ExecutionStep).where(ExecutionStep.execution_id == res.id)
        steps = (await session.execute(steps_stmt)).scalars().all()
        assert len(steps) >= 5

        traces_stmt = select(TraceEvent).where(TraceEvent.execution_id == res.id)
        traces = (await session.execute(traces_stmt)).scalars().all()
        assert len(traces) >= 5

        evals_stmt = select(EvaluationResult).where(EvaluationResult.execution_id == res.id)
        evals = (await session.execute(evals_stmt)).scalars().all()
        assert isinstance(evals, list)

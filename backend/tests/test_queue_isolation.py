import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.queue import TaskQueueEngine
from app.models.organization import Organization
from app.models.project import Project

@pytest.mark.asyncio
async def test_queue_project_isolation():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 1. Create two separate projects
    org_id = f"org_{uuid.uuid4().hex[:6]}"
    proj_a_id = f"proj_a_{uuid.uuid4().hex[:6]}"
    proj_b_id = f"proj_b_{uuid.uuid4().hex[:6]}"

    async with AsyncSessionLocal() as s:
        org = Organization(id=org_id, name="Queue Org", slug=f"qorg-{uuid.uuid4().hex[:4]}")
        s.add(org)
        p_a = Project(id=proj_a_id, organization_id=org_id, name="Project Alpha", slug=f"pa-{uuid.uuid4().hex[:4]}")
        p_b = Project(id=proj_b_id, organization_id=org_id, name="Project Beta", slug=f"pb-{uuid.uuid4().hex[:4]}")
        s.add_all([p_a, p_b])
        await s.commit()

    # 2. Enqueue task for Project Alpha
    task_a_id = await TaskQueueEngine.enqueue_task(
        job_id=f"job_{uuid.uuid4().hex[:8]}",
        scenario_index=1,
        payload={"scenario": {"title": "Alpha Scenario 1"}, "project_id": proj_a_id},
        project_id=proj_a_id
    )

    # 3. Enqueue task for Project Beta
    task_b_id = await TaskQueueEngine.enqueue_task(
        job_id=f"job_{uuid.uuid4().hex[:8]}",
        scenario_index=2,
        payload={"scenario": {"title": "Beta Scenario 1"}, "project_id": proj_b_id},
        project_id=proj_b_id
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 4. Fetch tasks scoped to Project Alpha
        res_a = await client.get("/api/v1/queue/tasks", params={"project_id": proj_a_id})
        assert res_a.status_code == 200
        tasks_a = res_a.json()
        assert any(t["id"] == task_a_id for t in tasks_a)
        assert not any(t["id"] == task_b_id for t in tasks_a)

        # 5. Fetch tasks scoped to Project Beta
        res_b = await client.get("/api/v1/queue/tasks", params={"project_id": proj_b_id})
        assert res_b.status_code == 200
        tasks_b = res_b.json()
        assert any(t["id"] == task_b_id for t in tasks_b)
        assert not any(t["id"] == task_a_id for t in tasks_b)

        # 6. Check Project-Scoped Stats
        stats_a = await client.get("/api/v1/queue/stats", params={"project_id": proj_a_id})
        assert stats_a.status_code == 200
        assert stats_a.json()["queued"] >= 1

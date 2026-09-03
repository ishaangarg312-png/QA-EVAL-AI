import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base, AsyncSessionLocal
from app.models.organization import Organization
from app.models.project import Project, Environment

@pytest.mark.asyncio
async def test_project_isolated_async_ops_and_swarm_crud():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 1. Create two distinct projects to test project isolation
    proj_a_id = f"proj_a_{uuid.uuid4().hex[:6]}"
    proj_b_id = f"proj_b_{uuid.uuid4().hex[:6]}"
    org_id = f"org_{uuid.uuid4().hex[:6]}"

    async with AsyncSessionLocal() as s:
        org = Organization(id=org_id, name="Isolation Org", slug=f"org-{uuid.uuid4().hex[:4]}")
        s.add(org)
        p_a = Project(id=proj_a_id, organization_id=org_id, name="Project A (Sage)", slug=f"proj-a-{uuid.uuid4().hex[:4]}")
        p_b = Project(id=proj_b_id, organization_id=org_id, name="Project B (BOD)", slug=f"proj-b-{uuid.uuid4().hex[:4]}")
        s.add_all([p_a, p_b])
        await s.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 2. Test Swarm Contract Creation on Project A
        create_res = await client.post(
            f"/api/v1/executions/projects/{proj_a_id}/swarm-contracts",
            json={
                "name": "Sage to Reviewer Contract",
                "sender_agent": "SageAgent",
                "recipient_agent": "ReviewerAgent",
                "contract_schema": {
                    "type": "object",
                    "required": ["answer"],
                    "properties": {"answer": {"type": "string"}}
                },
                "max_turns": 6,
                "is_active": True
            }
        )
        assert create_res.status_code == 200
        contract_data = create_res.json()
        contract_id = contract_data["id"]
        assert contract_data["project_id"] == proj_a_id
        assert contract_data["name"] == "Sage to Reviewer Contract"

        # 3. Verify Project Isolation: Contract exists in Project A, but NOT in Project B!
        list_a = await client.get(f"/api/v1/executions/projects/{proj_a_id}/swarm-contracts")
        assert list_a.status_code == 200
        assert any(c["id"] == contract_id for c in list_a.json()["contracts"])

        list_b = await client.get(f"/api/v1/executions/projects/{proj_b_id}/swarm-contracts")
        assert list_b.status_code == 200
        assert not any(c["id"] == contract_id for c in list_b.json()["contracts"])

        # 4. Test Swarm Contract Update
        upd_res = await client.put(
            f"/api/v1/executions/swarm-contracts/{contract_id}",
            json={"name": "Sage to Reviewer Contract v2", "max_turns": 10}
        )
        assert upd_res.status_code == 200
        assert upd_res.json()["name"] == "Sage to Reviewer Contract v2"
        assert upd_res.json()["max_turns"] == 10

        # 5. Test Swarm Contract Delete
        del_res = await client.delete(f"/api/v1/executions/swarm-contracts/{contract_id}")
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "DELETED"

        # 6. Test Async Ops retrieval for Project A
        ops_res = await client.get(f"/api/v1/executions/projects/{proj_a_id}/async-operations")
        assert ops_res.status_code == 200
        assert "operations" in ops_res.json()

        # 7. Test Matrix Job Dismissal
        dismiss_res = await client.delete("/api/v1/executions/matrix-job/dummy_matrix_job_99")
        assert dismiss_res.status_code == 200
        assert dismiss_res.json()["status"] == "DISMISSED"

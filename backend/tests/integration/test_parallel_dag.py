import pytest
from app.domain.types import NodeType, ExecutionStatus
from app.models.workflow import Workflow, WorkflowNode, WorkflowEdge
from app.models.execution import ExecutionRun
from app.execution.engine import ExecutionEngine
from app.core.database import AsyncSessionLocal

@pytest.mark.asyncio
async def test_parallel_dag_execution():
    async with AsyncSessionLocal() as db:
        # Create a test project and workflow with 3 parallel API nodes
        workflow = Workflow(
            project_id="11545342-7319-4d65-b285-426fc5a3cf54",
            name="Parallel Branching Test DAG",
            description="Testing 3 parallel API nodes branching and joining"
        )
        db.add(workflow)
        await db.flush()

        # Step 1: Initial Trigger
        n1 = WorkflowNode(workflow_id=workflow.id, node_key="n-trigger", node_type=NodeType.PROMPT, label="Trigger Request", position_x=50, position_y=200, config={"prompt_text": "Initiate data batch"})
        
        # Steps 2, 3, 4: 3 Parallel API nodes (placed vertically one above another)
        n2_top = WorkflowNode(workflow_id=workflow.id, node_key="n-opco", node_type=NodeType.API_REQUEST, label="OPCO API", position_x=300, position_y=80, config={"url": "https://api.travelservice.internal/v1/flights/search", "method": "GET"})
        n2_mid = WorkflowNode(workflow_id=workflow.id, node_key="n-comp", node_type=NodeType.API_REQUEST, label="Comp Agent API", position_x=300, position_y=200, config={"url": "https://api.travelservice.internal/v1/flights/search", "method": "GET"})
        n2_bot = WorkflowNode(workflow_id=workflow.id, node_key="n-news", node_type=NodeType.API_REQUEST, label="News Tech API", position_x=300, position_y=320, config={"url": "https://api.travelservice.internal/v1/flights/search", "method": "GET"})

        # Step 5: Join node
        n3 = WorkflowNode(workflow_id=workflow.id, node_key="n-join", node_type=NodeType.POLLING, label="Job Polling", position_x=550, position_y=200, config={"status_key": "status", "target_status": "COMPLETED"})

        db.add_all([n1, n2_top, n2_mid, n2_bot, n3])
        await db.flush()

        # Wire Edges: Trigger -> 3 Parallel Nodes -> Join Node
        e1 = WorkflowEdge(workflow_id=workflow.id, source_node_key="n-trigger", target_node_key="n-opco")
        e2 = WorkflowEdge(workflow_id=workflow.id, source_node_key="n-trigger", target_node_key="n-comp")
        e3 = WorkflowEdge(workflow_id=workflow.id, source_node_key="n-trigger", target_node_key="n-news")
        e4 = WorkflowEdge(workflow_id=workflow.id, source_node_key="n-opco", target_node_key="n-join")
        e5 = WorkflowEdge(workflow_id=workflow.id, source_node_key="n-comp", target_node_key="n-join")
        e6 = WorkflowEdge(workflow_id=workflow.id, source_node_key="n-news", target_node_key="n-join")

        db.add_all([e1, e2, e3, e4, e5, e6])
        await db.flush()

        # Execute DAG Run
        run = ExecutionRun(
            project_id="11545342-7319-4d65-b285-426fc5a3cf54",
            environment_id="env-qa-01",
            workflow_id=workflow.id,
            correlation_id="corr-parallel-test-01"
        )
        db.add(run)
        await db.flush()

        engine = ExecutionEngine(db)
        finished_run = await engine.execute_run(run.id)

        assert finished_run.total_duration_ms > 0
        from sqlalchemy import select
        from app.models.execution import ExecutionStep
        s_stmt = select(ExecutionStep).where(ExecutionStep.execution_id == finished_run.id)
        s_res = await db.execute(s_stmt)
        steps = list(s_res.scalars().all())
        assert len(steps) == 5
        assert all(s.status == ExecutionStatus.PASSED for s in steps)

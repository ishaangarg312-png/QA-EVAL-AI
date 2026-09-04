import pytest
import asyncio
from app.execution.matrix_runner import execute_single_scenario
from app.api.v1.executions import compute_dag_waves
from app.worker import get_matrix_runner_fn

@pytest.mark.asyncio
async def test_condition_node_skips_only_one_immediate_node():
    """
    Ensures that when a CONDITION node evaluates to FALSE,
    it ONLY skips its 1 direct target node and all downstream nodes proceed.
    """
    nodes = [
        {"node_key": "n1", "node_type": "API_REQUEST", "label": "Init", "config": {}},
        {"node_key": "n2", "node_type": "CONDITION", "label": "Condition", "config": {
            "condition_variable": "attachment_id",
            "operator": "is_not_empty"
        }},
        {"node_key": "n3", "node_type": "API_REQUEST", "label": "Upload", "config": {}},
        {"node_key": "n4", "node_type": "API_REQUEST", "label": "Process", "config": {}},
        {"node_key": "n5", "node_type": "CAPTURE_RESULT", "label": "Capture", "config": {}},
    ]
    edges = [
        {"source_node_key": "n1", "target_node_key": "n2"},
        {"source_node_key": "n2", "target_node_key": "n3"},
        {"source_node_key": "n3", "target_node_key": "n4"},
        {"source_node_key": "n4", "target_node_key": "n5"},
    ]
    waves = compute_dag_waves(nodes, edges)

    # Case 1: Attachment is empty -> condition is NOT met -> only n3 skipped
    scenario_no_att = {
        "scenarioIndex": 1,
        "scenarioTitle": "No Attachment Scenario",
        "rowData": {"attachment_id": ""},
        "turns": [{"attachment_id": ""}],
        "status": "PENDING"
    }

    res_no_att = await execute_single_scenario(
        job_id="test_cond_job_reg",
        scenario=scenario_no_att,
        waves=waves,
        project_id="test_proj",
        nodes=nodes,
        edges=edges
    )

    results_no_att = {nr["nodeKey"]: nr for nr in res_no_att["nodeResults"]}
    assert results_no_att["n1"]["status"] == "SUCCESS"
    assert results_no_att["n2"]["statusCode"] == "FALSE"
    assert results_no_att["n3"]["status"] == "SKIPPED"
    assert results_no_att["n4"]["status"] == "SUCCESS"
    assert results_no_att["n5"]["status"] == "SUCCESS"

    # Case 2: Attachment is present -> condition IS met -> NO nodes skipped
    scenario_with_att = {
        "scenarioIndex": 2,
        "scenarioTitle": "With Attachment Scenario",
        "rowData": {"attachment_id": "att_xyz_123"},
        "turns": [{"attachment_id": "att_xyz_123"}],
        "status": "PENDING"
    }

    res_with_att = await execute_single_scenario(
        job_id="test_cond_job_reg_2",
        scenario=scenario_with_att,
        waves=waves,
        project_id="test_proj",
        nodes=nodes,
        edges=edges
    )

    results_with_att = {nr["nodeKey"]: nr for nr in res_with_att["nodeResults"]}
    assert results_with_att["n1"]["status"] == "SUCCESS"
    assert results_with_att["n2"]["statusCode"] == "TRUE"
    assert results_with_att["n3"]["status"] == "SUCCESS"
    assert results_with_att["n4"]["status"] == "SUCCESS"
    assert results_with_att["n5"]["status"] == "SUCCESS"

@pytest.mark.asyncio
async def test_worker_dynamic_runner_concurrent_scenarios():
    """
    Verifies that worker daemon's dynamic runner executes concurrent scenarios
    consistently without stale code or cross-scenario pollution.
    """
    runner = await get_matrix_runner_fn()
    nodes = [
        {"node_key": "step1", "node_type": "API_REQUEST", "label": "Token", "config": {}},
        {"node_key": "step2", "node_type": "CONDITION", "label": "Check", "config": {
            "condition_variable": "doc_url",
            "operator": "is_not_empty"
        }},
        {"node_key": "step3", "node_type": "API_REQUEST", "label": "Upload", "config": {}},
        {"node_key": "step4", "node_type": "API_REQUEST", "label": "Finalize", "config": {}},
    ]
    edges = [
        {"source_node_key": "step1", "target_node_key": "step2"},
        {"source_node_key": "step2", "target_node_key": "step3"},
        {"source_node_key": "step3", "target_node_key": "step4"},
    ]
    waves = compute_dag_waves(nodes, edges)

    # 4 concurrent scenarios (2 with docs, 2 without)
    scenarios = [
        {"scenarioIndex": i, "rowData": {"doc_url": "https://file" if i % 2 == 1 else ""}, "turns": [{"doc_url": "https://file" if i % 2 == 1 else ""}], "status": "PENDING"}
        for i in range(1, 5)
    ]

    async def run_one(sc):
        return await runner(
            job_id=f"job_concurrent_{sc['scenarioIndex']}",
            scenario=sc,
            waves=waves,
            project_id="test_proj",
            nodes=nodes,
            edges=edges
        )

    results = await asyncio.gather(*(run_one(s) for s in scenarios))

    for idx, res in enumerate(results, start=1):
        nr_dict = {nr["nodeKey"]: nr for nr in res["nodeResults"]}
        assert nr_dict["step1"]["status"] == "SUCCESS"
        assert nr_dict["step4"]["status"] == "SUCCESS"  # Downstream MUST always execute!
        if idx % 2 == 1:
            # Has doc -> step3 executed
            assert nr_dict["step2"]["statusCode"] == "TRUE"
            assert nr_dict["step3"]["status"] == "SUCCESS"
        else:
            # No doc -> only step3 skipped
            assert nr_dict["step2"]["statusCode"] == "FALSE"
            assert nr_dict["step3"]["status"] == "SKIPPED"

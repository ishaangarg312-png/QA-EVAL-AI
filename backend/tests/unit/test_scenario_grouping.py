import pytest
from app.api.v1.executions import group_dataset_into_scenarios

def test_group_dataset_into_scenarios_multi_turn():
    headers = ["MESSAGE", "FOLLOWUP", "ATTACHMENT"]
    rows = [
        ["Explain about these documents", "What is main thing about these documents", "att_1,att_2"],
        ["Hello There", "Show me clauses of Microsoft", ""],
        ["", "Important points from meredian policy documents", ""],
        ["", "Show clauses of delphi", ""],
        ["What is reuirement as per document", "Changes we should do in policy document?", "att_3"],
        ["", "Why make these changes?", ""],
        ["", "Why should I listen to you", ""]
    ]

    scenarios = group_dataset_into_scenarios(headers, rows)

    assert len(scenarios) == 3, f"Expected 3 scenarios, got {len(scenarios)}"
    
    # Scenario 1: Row 1
    assert scenarios[0]["scenarioIndex"] == 1
    assert scenarios[0]["scenarioTitle"] == "Explain about these documents"
    assert len(scenarios[0]["rows"]) == 1
    assert len(scenarios[0]["turns"]) == 1

    # Scenario 2: Rows 2, 3, 4 (3 turns)
    assert scenarios[1]["scenarioIndex"] == 2
    assert scenarios[1]["scenarioTitle"] == "Hello There"
    assert len(scenarios[1]["rows"]) == 3
    assert len(scenarios[1]["turns"]) == 3
    assert scenarios[1]["turns"][0]["followup"] == "Show me clauses of Microsoft"
    assert scenarios[1]["turns"][1]["followup"] == "Important points from meredian policy documents"
    assert scenarios[1]["turns"][2]["followup"] == "Show clauses of delphi"

    # Scenario 3: Rows 5, 6, 7 (3 turns)
    assert scenarios[2]["scenarioIndex"] == 3
    assert scenarios[2]["scenarioTitle"] == "What is reuirement as per document"
    assert len(scenarios[2]["rows"]) == 3
    assert len(scenarios[2]["turns"]) == 3
    assert scenarios[2]["turns"][0]["followup"] == "Changes we should do in policy document?"
    assert scenarios[2]["turns"][1]["followup"] == "Why make these changes?"
    assert scenarios[2]["turns"][2]["followup"] == "Why should I listen to you"

def test_group_dataset_into_scenarios_standard_single_turn():
    headers = ["query", "user_id", "category"]
    rows = [
        ["How to reset password?", "usr_101", "Auth"],
        ["What are refund terms?", "usr_102", "Billing"],
        ["How to cancel subscription?", "usr_103", "Orders"]
    ]

    scenarios = group_dataset_into_scenarios(headers, rows)
    assert len(scenarios) == 3
    assert scenarios[0]["scenarioTitle"] == "How to reset password?"
    assert len(scenarios[0]["turns"]) == 1
    assert scenarios[1]["scenarioTitle"] == "What are refund terms?"
    assert len(scenarios[1]["turns"]) == 1
    assert scenarios[2]["scenarioTitle"] == "How to cancel subscription?"
    assert len(scenarios[2]["turns"]) == 1

def test_flat_row_by_row_strategy_with_blanks():
    headers = ["TEST ID", "TEST CASE NAME", "COMPANY", "FILE_ID"]
    rows = [
        ["TD-001", "DOCUEMENT Upload", "Presight", "att_555"],
        ["", "", "Bayanat", ""],
        ["TD-002", "Web Search", "Presight", ""],
        ["", "", "Bayanat", ""]
    ]

    # Mode FLAT_ROW_BY_ROW (default for standard evaluation flows)
    scenarios = group_dataset_into_scenarios(headers, rows, strategy={"mode": "FLAT_ROW_BY_ROW", "forward_fill_blanks": True})

    assert len(scenarios) == 4, f"Expected 4 scenarios, got {len(scenarios)}"
    
    # Scenario 1: Row 1
    assert scenarios[0]["scenarioIndex"] == 1
    assert scenarios[0]["rowData"]["COMPANY"] == "Presight"
    assert scenarios[0]["rowData"]["TEST ID"] == "TD-001"

    # Scenario 2: Row 2 (inherits TD-001, but executes Bayanat!)
    assert scenarios[1]["scenarioIndex"] == 2
    assert scenarios[1]["rowData"]["COMPANY"] == "Bayanat"
    assert scenarios[1]["rowData"]["TEST ID"] == "TD-001"
    assert scenarios[1]["rowData"]["TEST CASE NAME"] == "DOCUEMENT Upload"

    # Scenario 3: Row 3
    assert scenarios[2]["scenarioIndex"] == 3
    assert scenarios[2]["rowData"]["COMPANY"] == "Presight"
    assert scenarios[2]["rowData"]["TEST ID"] == "TD-002"

    # Scenario 4: Row 4 (inherits TD-002, but executes Bayanat!)
    assert scenarios[3]["scenarioIndex"] == 4
    assert scenarios[3]["rowData"]["COMPANY"] == "Bayanat"
    assert scenarios[3]["rowData"]["TEST ID"] == "TD-002"
    assert scenarios[3]["rowData"]["TEST CASE NAME"] == "Web Search"


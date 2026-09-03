import pytest
from app.domain.context import ExecutionContext, VariableInterpolator, JsonExtractor
from app.execution.handlers.api_handler import ApiHandler

@pytest.mark.asyncio
async def test_complex_nested_dictionary_and_list_interpolation():
    ctx = ExecutionContext(
        dataset_vars={
            "user_id": 9941,
            "profile": {
                "name": "Sarah Jenkins",
                "roles": ["admin", "tester"],
                "preferences": {"theme": "dark", "notifications": True}
            }
        },
        secrets={"JWT_TOKEN": "eyJhbGciOi..."}
    )

    ctx.set_variable("flight_items", [
        {"id": "FL-001", "price": 250.0},
        {"id": "FL-002", "price": 400.0}
    ])

    # 1. Test Dotted extraction on lists
    assert JsonExtractor.extract_value(ctx.get_all_variables(), "profile.roles.0") == "admin"
    assert JsonExtractor.extract_value(ctx.get_all_variables(), "profile.roles[1]") == "tester"
    assert JsonExtractor.extract_value(ctx.get_all_variables(), "flight_items[0].id") == "FL-001"
    assert JsonExtractor.extract_value(ctx.get_all_variables(), "flight_items[1].price") == 400.0

    # 2. Test Deep Object Interpolation in Dictionary Payload
    raw_payload = {
        "user": {
            "id": "{{user_id}}",
            "name": "{{profile.name}}",
            "primary_role": "{{profile.roles[0]}}",
            "is_active": True
        },
        "selected_flights": "{{flight_items}}",
        "nested_array": [
            {"flight": "{{flight_items[0].id}}", "price": "{{flight_items[0].price}}"}
        ]
    }

    interpolated = VariableInterpolator.interpolate_any(raw_payload, ctx)
    assert interpolated["user"]["id"] == 9941
    assert interpolated["user"]["name"] == "Sarah Jenkins"
    assert interpolated["user"]["primary_role"] == "admin"
    assert isinstance(interpolated["selected_flights"], list)
    assert interpolated["selected_flights"][0]["id"] == "FL-001"
    assert interpolated["nested_array"][0]["flight"] == "FL-001"
    assert float(interpolated["nested_array"][0]["price"]) == 250.0

@pytest.mark.asyncio
async def test_stringified_json_payload_handling():
    ctx = ExecutionContext(
        dataset_vars={"session_key": "sess_8892"}
    )
    raw_json_str = '{"query": "check status", "session": "{{session_key}}", "tags": ["a", "b"]}'
    res = VariableInterpolator.interpolate_any(raw_json_str, ctx)
    assert isinstance(res, dict)
    assert res["session"] == "sess_8892"
    assert res["tags"] == ["a", "b"]

@pytest.mark.asyncio
async def test_multipart_form_data_payload_execution():
    ctx = ExecutionContext(dataset_vars={"user_id": "f93e5ad8-61ae-4408-b722-6179be7edeb0"})
    node_config = {
        "url": "https://api.travelservice.internal/v1/auth/token",
        "method": "POST",
        "body_type": "MULTIPART_FORM_DATA",
        "body": {
            "message": "Confirm company name: Presight",
            "stream": True,
            "session_id": "",
            "user_id": "{{user_id}}",
            "monitor": True,
            "dependencies": {
                "user_timezone": "Asia/Calcutta",
                "company_name": "Presight",
                "attachment_ids": ["a338366e"]
            }
        }
    }
    result = await ApiHandler.execute(node_config, ctx)
    assert result["status_code"] == 200
    assert result["body"]["user_id"] == "f93e5ad8-61ae-4408-b722-6179be7edeb0"


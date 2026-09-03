import pytest
from app.domain.context import ExecutionContext, VariableInterpolator, JsonExtractor

def test_variable_interpolation_simple():
    ctx = ExecutionContext(
        env_vars={"BASE_URL": "https://api.travel.com"},
        dataset_vars={"origin": "Delhi", "destination": "Dubai"}
    )
    res = VariableInterpolator.interpolate_string("Book flight from {{origin}} to {{destination}}", ctx)
    assert res == "Book flight from Delhi to Dubai"

def test_variable_interpolation_nested():
    ctx = ExecutionContext()
    ctx.set_step_output("flight_search", {
        "flights": [
            {"id": "FL-101", "price": 350.0}
        ]
    })
    res = VariableInterpolator.interpolate_string("Selected: {{steps.flight_search.flights.0.id}}", ctx)
    assert res == "Selected: FL-101"

def test_json_extractor_dot_notation():
    data = {
        "booking": {
            "id": "BK-99481",
            "passenger": {
                "email": "sarah.jenkins@acmecorp.com"
            }
        },
        "items": ["flight", "hotel"]
    }
    assert JsonExtractor.extract_value(data, "booking.id") == "BK-99481"
    assert JsonExtractor.extract_value(data, "booking.passenger.email") == "sarah.jenkins@acmecorp.com"
    assert JsonExtractor.extract_value(data, "items.0") == "flight"

import time
from typing import Dict, Any, List
from app.domain.context import ExecutionContext, JsonExtractor

class ExtractHandler:
    @staticmethod
    async def execute(node_config: Dict[str, Any], context: ExecutionContext) -> Dict[str, Any]:
        start = time.perf_counter()
        extractions: List[Dict[str, str]] = node_config.get("extractions", [])
        extracted_results: Dict[str, Any] = {}

        for item in extractions:
            var_name = item.get("variable_name", "").strip()
            path = item.get("json_path", "").strip()
            source_step = item.get("source_step")  # Optional step key, or uses all variables

            if not var_name or not path:
                continue

            if source_step and source_step in context.step_outputs:
                source_data = context.step_outputs[source_step]
            else:
                source_data = context.get_all_variables()

            extracted_val = JsonExtractor.extract_value(source_data, path)
            if extracted_val is None:
                # Also search through latest step responses for convenience
                for step_out in reversed(list(context.step_outputs.values())):
                    if isinstance(step_out, dict):
                        resp_data = step_out.get("response", step_out)
                        extracted_val = JsonExtractor.extract_value(resp_data, path)
                        if extracted_val is not None:
                            break

            if extracted_val is not None:
                context.set_variable(var_name, extracted_val)
                extracted_results[var_name] = extracted_val

        duration_ms = (time.perf_counter() - start) * 1000.0
        return {
            "extractions": extracted_results,
            "duration_ms": duration_ms
        }

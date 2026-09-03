import time
from typing import Dict, Any
from app.domain.context import ExecutionContext, VariableInterpolator

class PromptHandler:
    @staticmethod
    async def execute(node_config: Dict[str, Any], context: ExecutionContext) -> Dict[str, Any]:
        start = time.perf_counter()
        raw_prompt = node_config.get("prompt_text", node_config.get("prompt", ""))
        interpolated = VariableInterpolator.interpolate_string(raw_prompt, context)
        duration_ms = (time.perf_counter() - start) * 1000.0

        return {
            "raw_prompt": raw_prompt,
            "interpolated_prompt": interpolated,
            "duration_ms": duration_ms
        }

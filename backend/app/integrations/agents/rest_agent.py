import time
import httpx
from typing import Dict, Any, Optional
from app.integrations.agents.base import AgentAdapter, AgentExecutionRequest, AgentExecutionResponse

class RESTAgentAdapter(AgentAdapter):
    def __init__(self, endpoint_url: str, headers: Optional[Dict[str, str]] = None, timeout: float = 30.0):
        self.endpoint_url = endpoint_url
        self.headers = headers or {"Content-Type": "application/json"}
        self.timeout = timeout

    async def execute(self, request: AgentExecutionRequest) -> AgentExecutionResponse:
        start_time = time.perf_counter()
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload = {
                "prompt": request.prompt,
                "context": request.context_variables,
                "history": request.history
            }
            resp = await client.post(self.endpoint_url, json=payload, headers=self.headers)
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            resp.raise_for_status()
            data = resp.json()

            return AgentExecutionResponse(
                response_text=data.get("response", data.get("text", str(data))),
                tool_calls=data.get("tool_calls", []),
                raw_response=data,
                input_tokens=data.get("usage", {}).get("prompt_tokens", len(request.prompt) // 4),
                output_tokens=data.get("usage", {}).get("completion_tokens", len(str(data)) // 4),
                total_tokens=data.get("usage", {}).get("total_tokens", (len(request.prompt) + len(str(data))) // 4),
                model=data.get("model", "rest-agent"),
                latency_ms=duration_ms
            )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(self.endpoint_url.replace("/execute", "/health"))
                return resp.status_code < 400
        except Exception:
            return False

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "adapter": "RESTAgentAdapter",
            "endpoint_url": self.endpoint_url,
            "timeout": self.timeout
        }

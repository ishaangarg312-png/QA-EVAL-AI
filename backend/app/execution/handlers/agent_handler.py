from typing import Dict, Any, Optional
from app.domain.context import ExecutionContext, VariableInterpolator
from app.integrations.agents.base import AgentAdapter, AgentExecutionRequest, AgentExecutionResponse
from app.integrations.agents.travel_demo_agent import TravelDemoAgentAdapter
from app.integrations.agents.rest_agent import RESTAgentAdapter

class AgentHandler:
    @staticmethod
    async def execute(
        node_config: Dict[str, Any],
        context: ExecutionContext,
        agent_version_tag: Optional[str] = "v1.0.0",
        endpoint_url: Optional[str] = None
    ) -> Dict[str, Any]:
        prompt_input = node_config.get("prompt_text") or context.resolve_path("last_prompt") or "Process request"
        interpolated_prompt = VariableInterpolator.interpolate_string(prompt_input, context)

        # Select adapter
        if endpoint_url and endpoint_url.startswith("http"):
            adapter: AgentAdapter = RESTAgentAdapter(endpoint_url=endpoint_url)
        else:
            # Default to Travel AI Agent simulator with designated version
            version_to_use = node_config.get("version", agent_version_tag or "v1.0.0")
            adapter = TravelDemoAgentAdapter(version=version_to_use)

        req = AgentExecutionRequest(
            prompt=interpolated_prompt,
            context_variables=context.get_all_variables(),
            history=context.agent_history,
            metadata=node_config
        )

        resp: AgentExecutionResponse = await adapter.execute(req)

        # Save to context
        context.agent_history.append({"role": "user", "content": interpolated_prompt})
        context.agent_history.append({"role": "assistant", "content": resp.response_text, "tools": resp.tool_calls})
        context.set_variable("last_agent_response", resp.response_text)
        context.set_variable("last_tool_calls", resp.tool_calls)

        return {
            "prompt": interpolated_prompt,
            "response_text": resp.response_text,
            "tool_calls": resp.tool_calls,
            "raw_response": resp.raw_response,
            "input_tokens": resp.input_tokens,
            "output_tokens": resp.output_tokens,
            "total_tokens": resp.total_tokens,
            "model": resp.model,
            "duration_ms": resp.latency_ms
        }

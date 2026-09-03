from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from pydantic import BaseModel

class AgentExecutionRequest(BaseModel):
    prompt: str
    context_variables: Dict[str, Any] = {}
    history: list = []
    metadata: Dict[str, Any] = {}

class AgentExecutionResponse(BaseModel):
    response_text: str
    tool_calls: list = []
    raw_response: Dict[str, Any] = {}
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model: str = "custom-agent"
    latency_ms: float = 0.0

class AgentAdapter(ABC):
    @abstractmethod
    async def execute(self, request: AgentExecutionRequest) -> AgentExecutionResponse:
        """Execute agent invocation with prompt and context"""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Verify agent endpoint availability"""
        pass

    @abstractmethod
    def get_metadata(self) -> Dict[str, Any]:
        """Return agent metadata (model, capabilities, tools)"""
        pass

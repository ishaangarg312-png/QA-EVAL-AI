import time
import asyncio
from typing import Dict, Any, Optional
from app.integrations.agents.base import AgentAdapter, AgentExecutionRequest, AgentExecutionResponse

class TravelDemoAgentAdapter(AgentAdapter):
    """
    Enterprise Travel AI Agent Simulator.
    Supports version 'v1.0.0' (flawless baseline) and 'v2.0.0' (regressed with tool confusion & policy failure).
    """
    def __init__(self, version: str = "v1.0.0"):
        self.version = version

    async def execute(self, request: AgentExecutionRequest) -> AgentExecutionResponse:
        start_time = time.perf_counter()
        await asyncio.sleep(0.08)  # Simulated model latency
        prompt_lower = request.prompt.lower()
        vars_ctx = request.context_variables

        # Case 1: Initial search prompt e.g. "Book a flight from Delhi to Dubai for tomorrow"
        if "delhi" in prompt_lower or "flight" in prompt_lower or "dubai" in prompt_lower or "search" in prompt_lower:
            if self.version == "v2.0.0":
                # Regression: Selects wrong tool due to ambiguous tool docstring
                tool_calls = [{
                    "tool_name": "refund_search",
                    "arguments": {"ticket_id": "UNKNOWN", "query": "flight for tomorrow"}
                }]
                response_text = "I attempted to search for refund policies instead of flight search due to tool description ambiguity."
            else:
                tool_calls = [{
                    "tool_name": "flight_search",
                    "arguments": {
                        "origin": vars_ctx.get("origin", "Delhi (DEL)"),
                        "destination": vars_ctx.get("destination", "Dubai (DXB)"),
                        "date": vars_ctx.get("travel_date", "Tomorrow")
                    }
                }]
                response_text = (
                    "I found 3 available flights from Delhi to Dubai for tomorrow:\n"
                    "1. Emirates EK-512 ($450, 04:15)\n"
                    "2. FlyDubai FZ-441 ($340, 09:30)\n"
                    "3. Air India AI-995 ($380, 14:00)\n\n"
                    "Which flight would you like me to book?"
                )

        # Case 2: Follow-up prompt e.g. "Select the cheapest option"
        elif "cheapest" in prompt_lower or "cheapest option" in prompt_lower or "flydubai" in prompt_lower:
            tool_calls = [{
                "tool_name": "booking_create",
                "arguments": {
                    "flight_id": vars_ctx.get("selected_flight_id", "FL-DXB-202"),
                    "flight_number": "FlyDubai FZ-441",
                    "price": 340.0,
                    "currency": "USD",
                    "traveller_name": vars_ctx.get("traveller_name", "Sarah Jenkins"),
                    "traveller_email": vars_ctx.get("traveller_email", "sarah.jenkins@acmecorp.com")
                }
            }]
            response_text = (
                "I have prepared the booking for FlyDubai FZ-441 ($340) for Sarah Jenkins. "
                "Since the ticket price exceeds $300, company policy requires QA/Manager Human Approval before finalizing payment. "
                "I have requested approval."
            )

        # Case 3: Post-approval confirmation
        elif "approved" in prompt_lower or "confirm" in prompt_lower or vars_ctx.get("human_approved") is True:
            booking_id = vars_ctx.get("booking_id", "BK-99481")
            tool_calls = [{
                "tool_name": "email_confirmation",
                "arguments": {
                    "recipient": vars_ctx.get("traveller_email", "sarah.jenkins@acmecorp.com"),
                    "booking_id": booking_id,
                    "subject": f"Booking Confirmation - {booking_id} (Delhi to Dubai)"
                }
            }]
            response_text = (
                f"Booking confirmed successfully! Booking ID: {booking_id}.\n"
                f"Flight: FlyDubai FZ-441 from Delhi (DEL) to Dubai (DXB).\n"
                f"Total Charged: $340.00 USD.\n"
                f"A confirmation email with ticket PDF attachment has been dispatched to {vars_ctx.get('traveller_email', 'sarah.jenkins@acmecorp.com')}."
            )
        else:
            tool_calls = []
            response_text = f"I am your AI Travel Assistant. How can I assist you with your flights or itineraries today?"

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        in_tokens = len(request.prompt) // 3 + 45
        out_tokens = len(response_text) // 3 + 30

        return AgentExecutionResponse(
            response_text=response_text,
            tool_calls=tool_calls,
            raw_response={"status": "success", "agent_version": self.version, "text": response_text, "tools": tool_calls},
            input_tokens=in_tokens,
            output_tokens=out_tokens,
            total_tokens=in_tokens + out_tokens,
            model="travel-agent-gpt4o",
            latency_ms=duration_ms
        )

    async def health_check(self) -> bool:
        return True

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "adapter": "TravelDemoAgentAdapter",
            "version": self.version,
            "domain": "Enterprise Flight Booking",
            "supported_tools": ["flight_search", "booking_create", "email_confirmation", "refund_search"]
        }

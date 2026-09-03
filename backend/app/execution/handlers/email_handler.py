import time
from typing import Dict, Any, Optional
from app.domain.context import ExecutionContext, VariableInterpolator
from app.integrations.email.mock_email import virtual_email_service

class EmailHandler:
    @staticmethod
    async def execute(node_config: Dict[str, Any], context: ExecutionContext) -> Dict[str, Any]:
        start = time.perf_counter()
        action = node_config.get("action", "SEND_AND_VERIFY").upper()
        raw_recipient = node_config.get("recipient", "{{traveller_email}}")
        raw_subject = node_config.get("subject", "Booking Confirmation - {{booking_id}}")
        raw_body = node_config.get("body", "Your flight booking {{booking_id}} is confirmed.")

        recipient = VariableInterpolator.interpolate_string(raw_recipient, context)
        subject = VariableInterpolator.interpolate_string(raw_subject, context)
        body = VariableInterpolator.interpolate_string(raw_body, context)

        if action in ("SEND", "SEND_AND_VERIFY"):
            send_res = await virtual_email_service.send_email(
                recipient=recipient,
                subject=subject,
                body=body
            )
            email_msg = await virtual_email_service.search_email(query=subject, recipient=recipient)
        else:
            query = VariableInterpolator.interpolate_string(node_config.get("search_query", subject), context)
            email_msg = await virtual_email_service.search_email(query=query, recipient=recipient)
            send_res = {"status": "SEARCHED"}

        context.set_variable("last_email_id", email_msg.id if email_msg else None)
        context.set_variable("last_email_subject", email_msg.subject if email_msg else None)

        duration_ms = (time.perf_counter() - start) * 1000.0
        return {
            "action": action,
            "recipient": recipient,
            "subject": subject,
            "message_id": email_msg.id if email_msg else None,
            "has_attachment": email_msg.has_attachments if email_msg else False,
            "email_received": email_msg is not None,
            "duration_ms": duration_ms
        }

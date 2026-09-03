import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from app.integrations.email.base import EmailProvider, EmailMessage

class MockEmailProvider(EmailProvider):
    """
    In-memory virtual mailbox for deterministic testing of Gmail & Outlook workflows.
    """
    def __init__(self):
        self._mailbox: List[EmailMessage] = []

    async def send_email(
        self,
        recipient: str,
        subject: str,
        body: str,
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        msg_id = f"msg-{uuid.uuid4().hex[:8]}"
        email_obj = EmailMessage(
            id=msg_id,
            sender="no-reply@flightbooking-system.com",
            recipient=recipient,
            subject=subject,
            body_text=body,
            body_html=f"<p>{body}</p>",
            has_attachments=bool(attachments),
            attachments=attachments or [
                {"filename": "FlyDubai_Ticket_BK-99481.pdf", "size_kb": 128, "content_type": "application/pdf"}
            ],
            received_at=datetime.now(timezone.utc).isoformat()
        )
        self._mailbox.append(email_obj)
        return {
            "status": "SENT",
            "message_id": msg_id,
            "recipient": recipient,
            "subject": subject
        }

    async def search_email(
        self,
        query: str,
        recipient: Optional[str] = None,
        timeout_seconds: int = 30
    ) -> Optional[EmailMessage]:
        query_lower = query.lower()
        for msg in reversed(self._mailbox):
            if recipient and msg.recipient.lower() != recipient.lower():
                continue
            if query_lower in msg.subject.lower() or query_lower in msg.body_text.lower():
                return msg
        return None

    async def get_latest_email(self, recipient: str) -> Optional[EmailMessage]:
        for msg in reversed(self._mailbox):
            if msg.recipient.lower() == recipient.lower():
                return msg
        return None

    def clear(self):
        self._mailbox.clear()

virtual_email_service = MockEmailProvider()

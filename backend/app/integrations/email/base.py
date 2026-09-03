from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

class EmailMessage(BaseModel):
    id: str
    sender: str
    recipient: str
    subject: str
    body_text: str
    body_html: Optional[str] = None
    has_attachments: bool = False
    attachments: List[Dict[str, Any]] = []
    received_at: str

class EmailProvider(ABC):
    @abstractmethod
    async def send_email(self, recipient: str, subject: str, body: str, attachments: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Send an email"""
        pass

    @abstractmethod
    async def search_email(self, query: str, recipient: Optional[str] = None, timeout_seconds: int = 30) -> Optional[EmailMessage]:
        """Search for an email matching query within timeout"""
        pass

    @abstractmethod
    async def get_latest_email(self, recipient: str) -> Optional[EmailMessage]:
        """Fetch latest email received for recipient"""
        pass

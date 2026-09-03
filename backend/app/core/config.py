import os
from typing import List, Optional
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load from root .env.local or backend .env
root_dir = Path(__file__).resolve().parent.parent.parent.parent
load_dotenv(root_dir / ".env.local")
load_dotenv(root_dir / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

def get_database_url() -> str:
    url = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./qa_platform.db"
    )
    # Normalize postgresql:// to postgresql+asyncpg://
    if url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Replace sslmode=require with ssl=require for asyncpg if needed
    if "sslmode=require" in url:
        url = url.replace("sslmode=require", "ssl=require")
    return url

from pydantic import field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "Universal AI Agent QA Platform"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "qa-super-secret-key-change-in-production-1234567890123456")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = get_database_url()
    
    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v:
            v = get_database_url()
        if v.startswith("postgresql://") and not v.startswith("postgresql+asyncpg://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if "sslmode=require" in v:
            v = v.replace("sslmode=require", "ssl=require")
        if "channel_binding=require&" in v:
            v = v.replace("channel_binding=require&", "")
        if "&channel_binding=require" in v:
            v = v.replace("&channel_binding=require", "")
        if "?channel_binding=require" in v:
            v = v.replace("?channel_binding=require", "?")
            if v.endswith("?"):
                v = v[:-1]
        return v
    
    # Secret Encryption (Fernet 32-byte base64)
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "u2y3tWv8u1P3E0Qv3Q9b_q4b5k9yV3m7l7v1k1_y2u8=")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "*"
    ]
    
    # External Providers
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    CUSTOM_BEARER_TOKEN: Optional[str] = os.getenv("CUSTOM_BEARER_TOKEN", None)
    
    # Default Quality Gate Thresholds
    DEFAULT_MIN_QUALITY_SCORE: float = 85.0
    DEFAULT_MIN_SAFETY_SCORE: float = 90.0
    DEFAULT_MAX_CRITICAL_FAILURES: int = 0
    
    model_config = {
        "env_file": [".env.local", ".env"],
        "extra": "allow"
    }

settings = Settings()


import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.core.ai_discovery import (
    fetch_provider_models,
    PROVIDER_METADATA,
    _format_token_count,
    _format_model_name
)
from app.core.security import encrypt_secret, decrypt_secret, mask_secret
from app.models.organization import AIProviderSetting
from app.core.database import AsyncSessionLocal, engine, Base
from sqlalchemy import select

def test_helpers():
    assert _format_token_count(1_000_000) == "1M tokens"
    assert _format_token_count(128_000) == "128k tokens"
    assert "LLAMA" in _format_model_name("llama-3.3-70b-versatile").upper()
    assert "GEMINI" in _format_model_name("gemini-2.0-flash").upper()


def test_encryption_helpers():
    secret = "gsk_abc123456789xyz"
    encrypted = encrypt_secret(secret)
    assert encrypted != secret
    decrypted = decrypt_secret(encrypted)
    assert decrypted == secret

    masked = mask_secret("sk-proj-1234567890abcdef")
    assert masked.startswith("sk-")
    assert "******" in masked or "*" in masked


@pytest.mark.asyncio
async def test_unsupported_provider():
    with pytest.raises(ValueError, match="Unsupported AI provider"):
        await fetch_provider_models("unknown_provider", "key_123")


@pytest.mark.asyncio
async def test_empty_api_key():
    with pytest.raises(ValueError, match="API key is required"):
        await fetch_provider_models("groq", "   ")


@pytest.mark.asyncio
async def test_groq_discovery_mock():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "data": [
            {"id": "llama-3.3-70b-versatile", "object": "model", "owned_by": "groq", "context_window": 131072, "active": True},
            {"id": "llama-3.1-8b-instant", "object": "model", "owned_by": "groq", "context_window": 131072, "active": True},
            {"id": "whisper-large-v3", "object": "model", "owned_by": "groq", "context_window": 448, "active": True},
        ]
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        models = await fetch_provider_models("groq", "gsk_test_key")

        assert len(models) == 3
        model_ids = [m["id"] for m in models]
        assert "llama-3.3-70b-versatile" in model_ids
        assert models[0]["is_recommended"] is True


@pytest.mark.asyncio
async def test_gemini_discovery_mock():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "models": [
            {
                "name": "models/gemini-2.0-flash",
                "displayName": "Gemini 2.0 Flash",
                "description": "Next generation fast multimodal model",
                "inputTokenLimit": 1048576,
                "supportedGenerationMethods": ["generateContent", "countTokens"]
            },
            {
                "name": "models/text-embedding-004",
                "displayName": "Text Embedding 004",
                "supportedGenerationMethods": ["embedContent"]
            }
        ]
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        models = await fetch_provider_models("gemini", "AIzaSy_fake_test_key")

        # Embedding model should be excluded because it does not support generateContent
        assert len(models) == 1
        assert models[0]["id"] == "gemini-2.0-flash"
        assert models[0]["is_recommended"] is True
        assert "DeepMind" in models[0]["tags"]


@pytest.mark.asyncio
async def test_openai_discovery_mock():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "data": [
            {"id": "gpt-4o", "object": "model", "owned_by": "system"},
            {"id": "gpt-4o-mini", "object": "model", "owned_by": "system"},
            {"id": "text-embedding-3-small", "object": "model", "owned_by": "system"},
            {"id": "whisper-1", "object": "model", "owned_by": "system"},
        ]
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        models = await fetch_provider_models("openai", "sk-proj-fake_key")

        # whisper and embedding models should be filtered out
        model_ids = [m["id"] for m in models]
        assert "gpt-4o" in model_ids
        assert "gpt-4o-mini" in model_ids
        assert "text-embedding-3-small" not in model_ids
        assert "whisper-1" not in model_ids


@pytest.mark.asyncio
async def test_ai_provider_db_setting():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Create or update setting
        setting = AIProviderSetting(
            provider="groq_test",
            api_key_encrypted=encrypt_secret("gsk_secret123"),
            is_enabled="true",
            available_models=[{"id": "llama-3.3-70b-versatile", "name": "Llama 3.3"}],
            selected_models=["llama-3.3-70b-versatile"],
            updated_by="admin@test.com"
        )
        session.add(setting)
        await session.commit()

        # Query back
        res = await session.execute(select(AIProviderSetting).where(AIProviderSetting.provider == "groq_test"))
        saved = res.scalar_one_or_none()
        assert saved is not None
        assert decrypt_secret(saved.api_key_encrypted) == "gsk_secret123"
        assert saved.selected_models == ["llama-3.3-70b-versatile"]

        # Cleanup
        await session.delete(saved)
        await session.commit()


@pytest.mark.asyncio
async def test_test_model_connection_groq_mock():
    from app.core.ai_discovery import test_model_connection

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [
            {"message": {"content": "Hello! I am Groq Llama 3.3.", "role": "assistant"}}
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 15,
            "total_tokens": 25,
        }
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await test_model_connection("groq", "llama-3.3-70b-versatile", "gsk_valid_key")

        assert res["success"] is True
        assert res["model"] == "llama-3.3-70b-versatile"
        assert res["tokens_used"]["total_tokens"] == 25
        assert "Groq" in res["response_preview"]
        assert res["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_test_model_connection_gemini_mock():
    from app.core.ai_discovery import test_model_connection

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": "Hello from Gemini 2.0 Flash!"}]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 8,
            "candidatesTokenCount": 12,
            "totalTokenCount": 20,
        }
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await test_model_connection("gemini", "gemini-2.0-flash", "AIzaSy_valid_key")

        assert res["success"] is True
        assert res["model"] == "gemini-2.0-flash"
        assert res["tokens_used"]["total_tokens"] == 20
        assert "Gemini" in res["response_preview"]


@pytest.mark.asyncio
async def test_multi_key_pool_and_usage_logging():
    import uuid
    from app.models.organization import LLMUsageLog
    from app.core.ai_discovery import record_llm_usage

    test_provider = f"openai_multi_{uuid.uuid4().hex[:6]}"

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # 1. Test Multi-key storage (up to 10 keys)
        keys = [
            {
                "id": f"key_{i}",
                "name": f"Key #{i+1}",
                "api_key_encrypted": encrypt_secret(f"secret_{i}"),
                "is_active": True,
                "is_primary": (i == 0),
                "created_at": "2026-09-05T12:00:00Z",
                "request_count": i * 10
            }
            for i in range(5)
        ]

        setting = AIProviderSetting(
            provider=test_provider,
            api_key_encrypted=keys[0]["api_key_encrypted"],
            api_keys=keys,
            is_enabled="true",
            available_models=[],
            selected_models=["gpt-4o"],
            updated_by="admin@test.com"
        )
        session.add(setting)
        await session.commit()

        # Query back and verify keys
        res = await session.execute(select(AIProviderSetting).where(AIProviderSetting.provider == test_provider))
        saved = res.scalar_one_or_none()
        assert saved is not None
        assert len(saved.api_keys) == 5
        assert saved.api_keys[0]["name"] == "Key #1"
        assert saved.api_keys[0]["is_primary"] is True
        assert decrypt_secret(saved.api_keys[0]["api_key_encrypted"]) == "secret_0"

        # 2. Test LLM Usage Logging
        log_entry = await record_llm_usage(
            db=session,
            user_id=None,
            provider="openai",
            model="gpt-4o",
            prompt_tokens=100,
            completion_tokens=50,
            latency_ms=250.0,
            request_type="EVALUATION",
            status="SUCCESS",
            error=None
        )
        assert log_entry.id is not None
        assert log_entry.total_tokens == 150

        # Query back LLMUsageLog
        log_res = await session.execute(select(LLMUsageLog).where(LLMUsageLog.id == log_entry.id))
        saved_log = log_res.scalar_one_or_none()
        assert saved_log is not None
        assert saved_log.provider == "openai"
        assert saved_log.model == "gpt-4o"
        assert saved_log.total_tokens == 150

        # Cleanup
        await session.delete(saved)
        await session.delete(saved_log)
        await session.commit()

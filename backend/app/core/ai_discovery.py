import re
import json
from typing import List, Dict, Any, Optional
import httpx
from app.core.logging import logger

PROVIDER_METADATA: Dict[str, Dict[str, Any]] = {
    "groq": {
        "provider": "groq",
        "name": "Groq Cloud",
        "description": "Ultra-fast LPU inference engine (Llama 3.3, Llama 3.1, Mixtral, DeepSeek Distill)",
        "docs_url": "https://console.groq.com/keys",
        "key_prefix_hint": "gsk_...",
        "default_base_url": "https://api.groq.com/openai/v1",
        "models_endpoint": "https://api.groq.com/openai/v1/models",
    },
    "gemini": {
        "provider": "gemini",
        "name": "Google Gemini",
        "description": "Google DeepMind frontier multimodal models (Gemini 2.0 Flash, Gemini 1.5 Pro, Flash Thinking)",
        "docs_url": "https://aistudio.google.com/app/apikey",
        "key_prefix_hint": "AIzaSy...",
        "default_base_url": "https://generativelanguage.googleapis.com/v1beta",
        "models_endpoint": "https://generativelanguage.googleapis.com/v1beta/models",
    },
    "openai": {
        "provider": "openai",
        "name": "OpenAI",
        "description": "OpenAI flagship intelligence & reasoning models (GPT-4o, GPT-4o-mini, o1, o3-mini)",
        "docs_url": "https://platform.openai.com/api-keys",
        "key_prefix_hint": "sk-proj-... / sk-...",
        "default_base_url": "https://api.openai.com/v1",
        "models_endpoint": "https://api.openai.com/v1/models",
    }
}


def _format_token_count(tokens: Optional[int]) -> str:
    if not tokens:
        return ""
    if tokens >= 1_000_000:
        val = tokens / 1_000_000
        return f"{val:.1f}M tokens" if val % 1 != 0 else f"{int(val)}M tokens"
    if tokens >= 1_000:
        val = tokens / 1_000
        return f"{val:.0f}k tokens"
    return f"{tokens} tokens"


def _format_model_name(raw_id: str) -> str:
    cleaned = raw_id.replace("models/", "").replace("-", " ").replace("_", " ")
    parts = cleaned.split(" ")
    formatted = []
    for p in parts:
        if p.lower() in ("gpt", "lpu", "ai", "llm", "qa", "hf", "it", "preview", "instruct"):
            formatted.append(p.upper())
        elif re.match(r"^\d+[a-z]?$", p.lower()):
            formatted.append(p.upper())
        else:
            formatted.append(p.capitalize())
    return " ".join(formatted)


async def fetch_provider_models(provider: str, api_key: str) -> List[Dict[str, Any]]:
    """
    Connects to the official provider models endpoint using the supplied API key,
    validates authentication, and returns discovered models formatted for admin selection.
    """
    prov = provider.lower().strip()
    key = api_key.strip()

    if prov not in PROVIDER_METADATA:
        raise ValueError(f"Unsupported AI provider '{provider}'. Supported: {list(PROVIDER_METADATA.keys())}")

    if not key:
        raise ValueError(f"API key is required to discover {prov.title()} models.")

    timeout = httpx.Timeout(15.0, connect=10.0)

    if prov == "groq":
        return await _discover_groq_models(key, timeout)
    elif prov == "gemini":
        return await _discover_gemini_models(key, timeout)
    elif prov == "openai":
        return await _discover_openai_models(key, timeout)

    return []


async def _discover_groq_models(api_key: str, timeout: httpx.Timeout) -> List[Dict[str, Any]]:
    endpoint = PROVIDER_METADATA["groq"]["models_endpoint"]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "Universal-AI-Agent-QA-Platform"
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(endpoint, headers=headers)
    except httpx.RequestError as exc:
        raise RuntimeError(f"Network error connecting to Groq API ({endpoint}): {str(exc)}")

    if resp.status_code == 401:
        raise ValueError("Invalid Groq API Key: 401 Unauthorized. Check your key at console.groq.com/keys.")
    if resp.status_code == 403:
        raise ValueError("Groq API access forbidden: 403. Check account permissions.")
    if resp.status_code != 200:
        raise RuntimeError(f"Groq API returned error HTTP {resp.status_code}: {resp.text}")

    payload = resp.json()
    raw_models = payload.get("data", [])
    discovered = []

    for item in raw_models:
        model_id = item.get("id", "")
        if not model_id:
            continue

        active = item.get("active", True)
        ctx = item.get("context_window")
        ctx_str = _format_token_count(ctx) if ctx else ""

        tags = ["Groq LPU", "Chat"]
        if ctx_str:
            tags.append(ctx_str)
        if "70b" in model_id.lower() or "llama-3.3" in model_id.lower():
            tags.append("High Accuracy")
        elif "8b" in model_id.lower() or "instant" in model_id.lower():
            tags.append("Ultra Fast")
        elif "deepseek" in model_id.lower() or "distill" in model_id.lower() or "r1" in model_id.lower():
            tags.append("Reasoning")

        is_recommended = any(k in model_id.lower() for k in ["llama-3.3-70b", "llama-3.1-8b", "deepseek-r1"])

        discovered.append({
            "id": model_id,
            "name": _format_model_name(model_id),
            "description": f"Groq hosted LPU model: {model_id}. Owned by {item.get('owned_by', 'Groq')}.",
            "context_window": ctx_str or "128k tokens",
            "tags": tags,
            "is_recommended": is_recommended,
            "provider": "groq",
            "active": active
        })

    # Sort recommended models first, then alphabetically
    discovered.sort(key=lambda x: (not x["is_recommended"], x["id"]))
    return discovered


async def _discover_gemini_models(api_key: str, timeout: httpx.Timeout) -> List[Dict[str, Any]]:
    endpoint = f"{PROVIDER_METADATA['gemini']['models_endpoint']}?key={api_key}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(endpoint)
    except httpx.RequestError as exc:
        raise RuntimeError(f"Network error connecting to Google Gemini API: {str(exc)}")

    if resp.status_code in (400, 401, 403):
        raise ValueError(f"Invalid Google Gemini API Key: {resp.status_code}. Verify your key at aistudio.google.com.")
    if resp.status_code != 200:
        raise RuntimeError(f"Google Gemini API error HTTP {resp.status_code}: {resp.text}")

    payload = resp.json()
    raw_models = payload.get("models", [])
    discovered = []

    for item in raw_models:
        full_name = item.get("name", "")
        # Strip models/ prefix
        model_id = full_name.replace("models/", "")
        if not model_id:
            continue

        methods = item.get("supportedGenerationMethods", [])
        # Only include text/content generation models
        if methods and "generateContent" not in methods:
            continue

        disp_name = item.get("displayName") or _format_model_name(model_id)
        desc = item.get("description", "")
        input_limit = item.get("inputTokenLimit")
        ctx_str = _format_token_count(input_limit) if input_limit else ""

        tags = ["DeepMind", "Multimodal"]
        if ctx_str:
            tags.append(ctx_str)
        if "flash" in model_id.lower():
            tags.append("Fast Inference")
        if "pro" in model_id.lower():
            tags.append("High Capability")
        if "thinking" in model_id.lower():
            tags.append("Reasoning")

        is_recommended = any(k in model_id.lower() for k in ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"])

        discovered.append({
            "id": model_id,
            "name": disp_name,
            "description": desc or f"Google Gemini model {disp_name}",
            "context_window": ctx_str or "1M tokens",
            "tags": tags,
            "is_recommended": is_recommended,
            "provider": "gemini",
            "active": True
        })

    discovered.sort(key=lambda x: (not x["is_recommended"], x["id"]))
    return discovered


async def _discover_openai_models(api_key: str, timeout: httpx.Timeout) -> List[Dict[str, Any]]:
    endpoint = PROVIDER_METADATA["openai"]["models_endpoint"]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "Universal-AI-Agent-QA-Platform"
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(endpoint, headers=headers)
    except httpx.RequestError as exc:
        raise RuntimeError(f"Network error connecting to OpenAI API ({endpoint}): {str(exc)}")

    if resp.status_code == 401:
        raise ValueError("Invalid OpenAI API Key: 401 Unauthorized. Verify your key at platform.openai.com/api-keys.")
    if resp.status_code == 403:
        raise ValueError("OpenAI API access forbidden: 403. Check account permissions or organization access.")
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI API error HTTP {resp.status_code}: {resp.text}")

    payload = resp.json()
    raw_models = payload.get("data", [])
    discovered = []

    # Whitelist prefixes for conversational and reasoning models
    allowed_prefixes = ("gpt-4o", "gpt-4", "gpt-3.5", "o1", "o3", "chatgpt")
    # Disallow embedding, whisper, tts, dall-e, audio, moderation, babbage, davinci from primary selection
    disallowed_keywords = ("whisper", "tts", "embedding", "dall-e", "moderation", "davinci", "babbage", "curie")

    for item in raw_models:
        model_id = item.get("id", "")
        if not model_id:
            continue

        lower_id = model_id.lower()
        if any(bad in lower_id for bad in disallowed_keywords):
            continue

        # Prioritize chat/reasoning models
        if not (any(lower_id.startswith(p) for p in allowed_prefixes) or "turbo" in lower_id or "instruct" in lower_id):
            continue

        tags = ["OpenAI", "Chat"]
        if "mini" in lower_id:
            tags.append("Cost Efficient")
        elif "o1" in lower_id or "o3" in lower_id:
            tags.append("Reasoning")
        elif "4o" in lower_id:
            tags.append("Flagship")

        is_recommended = model_id in ("gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo")

        ctx_str = "128k tokens"
        if "mini" in lower_id:
            ctx_str = "128k tokens"
        elif "o1" in lower_id:
            ctx_str = "200k tokens"

        discovered.append({
            "id": model_id,
            "name": _format_model_name(model_id),
            "description": f"OpenAI model: {model_id}",
            "context_window": ctx_str,
            "tags": tags,
            "is_recommended": is_recommended,
            "provider": "openai",
            "active": True
        })

    discovered.sort(key=lambda x: (not x["is_recommended"], x["id"]))
    return discovered


# Curated baseline models available immediately without discovery
CURATED_DEFAULT_MODELS: Dict[str, List[Dict[str, Any]]] = {
    "groq": [
        {
            "id": "llama-3.3-70b-versatile",
            "name": "Llama 3.3 70B Versatile",
            "description": "Flagship 70B instruction model with 128k context and ultra-fast LPU inference.",
            "context_window": "128k tokens",
            "tags": ["Groq LPU", "Chat", "High Accuracy", "128k tokens"],
            "is_recommended": True,
            "provider": "groq",
            "active": True
        },
        {
            "id": "llama-3.1-8b-instant",
            "name": "Llama 3.1 8B Instant",
            "description": "Lightning-fast 8B model delivering 500+ tokens/sec, optimal for high throughput and evaluation.",
            "context_window": "128k tokens",
            "tags": ["Groq LPU", "Chat", "Ultra Fast", "128k tokens"],
            "is_recommended": True,
            "provider": "groq",
            "active": True
        },
        {
            "id": "deepseek-r1-distill-llama-70b",
            "name": "DeepSeek R1 Distill Llama 70B",
            "description": "DeepSeek reasoning model distilled into Llama 70B architecture for complex step-by-step logic.",
            "context_window": "128k tokens",
            "tags": ["Groq LPU", "Reasoning", "High Accuracy"],
            "is_recommended": True,
            "provider": "groq",
            "active": True
        },
        {
            "id": "mixtral-8x7b-32768",
            "name": "Mixtral 8x7B 32k",
            "description": "High-performance mixture-of-experts model with 32k context.",
            "context_window": "32k tokens",
            "tags": ["Groq LPU", "MoE", "32k tokens"],
            "is_recommended": False,
            "provider": "groq",
            "active": True
        },
        {
            "id": "gemma2-9b-it",
            "name": "Gemma 2 9B Instruct",
            "description": "Google lightweight open model running on Groq LPUs.",
            "context_window": "8k tokens",
            "tags": ["Groq LPU", "Google", "Fast"],
            "is_recommended": False,
            "provider": "groq",
            "active": True
        }
    ],
    "gemini": [
        {
            "id": "gemini-2.0-flash",
            "name": "Gemini 2.0 Flash",
            "description": "Next-generation multimodal model with superior speed, tool use, and 1M token context limit.",
            "context_window": "1M tokens",
            "tags": ["DeepMind", "Multimodal", "Fast Inference", "1M tokens"],
            "is_recommended": True,
            "provider": "gemini",
            "active": True
        },
        {
            "id": "gemini-1.5-pro",
            "name": "Gemini 1.5 Pro",
            "description": "Google frontier reasoning and multimodal model capable of complex long-context analysis (up to 2M tokens).",
            "context_window": "2M tokens",
            "tags": ["DeepMind", "Multimodal", "High Capability", "2M tokens"],
            "is_recommended": True,
            "provider": "gemini",
            "active": True
        },
        {
            "id": "gemini-1.5-flash",
            "name": "Gemini 1.5 Flash",
            "description": "Lightweight, fast, cost-efficient multimodal model built for high-volume tasks.",
            "context_window": "1M tokens",
            "tags": ["DeepMind", "Fast Inference", "Cost Efficient"],
            "is_recommended": True,
            "provider": "gemini",
            "active": True
        },
        {
            "id": "gemini-2.0-flash-thinking-exp-01-21",
            "name": "Gemini 2.0 Flash Thinking",
            "description": "Experimental reasoning model showing intermediate thoughts for complex planning and debugging.",
            "context_window": "1M tokens",
            "tags": ["DeepMind", "Reasoning", "Experimental"],
            "is_recommended": False,
            "provider": "gemini",
            "active": True
        }
    ],
    "openai": [
        {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "description": "OpenAI flagship high-intelligence multimodal model for vision, text, and complex analysis.",
            "context_window": "128k tokens",
            "tags": ["OpenAI", "Flagship", "Multimodal", "128k tokens"],
            "is_recommended": True,
            "provider": "openai",
            "active": True
        },
        {
            "id": "gpt-4o-mini",
            "name": "GPT-4o Mini",
            "description": "Affordable, ultra-fast small model with GPT-4 class capabilities for high-volume workflows.",
            "context_window": "128k tokens",
            "tags": ["OpenAI", "Cost Efficient", "Fast", "128k tokens"],
            "is_recommended": True,
            "provider": "openai",
            "active": True
        },
        {
            "id": "o1",
            "name": "OpenAI o1",
            "description": "Advanced reasoning model designed for complex coding, math, and multi-step deduction.",
            "context_window": "200k tokens",
            "tags": ["OpenAI", "Reasoning", "200k tokens"],
            "is_recommended": True,
            "provider": "openai",
            "active": True
        },
        {
            "id": "o3-mini",
            "name": "OpenAI o3-mini",
            "description": "High-speed reasoning model with configurable thinking effort and low latency.",
            "context_window": "200k tokens",
            "tags": ["OpenAI", "Reasoning", "Fast"],
            "is_recommended": True,
            "provider": "openai",
            "active": True
        },
        {
            "id": "gpt-4-turbo",
            "name": "GPT-4 Turbo",
            "description": "Previous-generation flagship model with 128k context and vision capabilities.",
            "context_window": "128k tokens",
            "tags": ["OpenAI", "High Accuracy"],
            "is_recommended": False,
            "provider": "openai",
            "active": True
        }
    ]
}


# One default probe model per provider used for connection tests prior to model selection
DEFAULT_PROBE_MODELS = {
    "groq": "openai/gpt-oss-120b",
    "gemini": "gemini-1.5-flash",
    "openai": "gpt-4o-mini",
}


def _format_http_error(provider: str, status_code: int, raw_text: str) -> str:
    """Parses JSON error responses from AI providers into a clean, human-readable error message."""
    try:
        data = json.loads(raw_text)
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                msg = err.get("message") or err.get("code") or ""
                code = err.get("code") or err.get("type") or ""
                if msg and code and code not in msg:
                    return f"{provider} API error ({status_code} - {code}): {msg}"
                elif msg:
                    return f"{provider} API error ({status_code}): {msg}"
            elif isinstance(err, str):
                return f"{provider} API error ({status_code}): {err}"
            elif "message" in data:
                return f"{provider} API error ({status_code}): {data['message']}"
    except Exception:
        pass
    clean_text = raw_text.strip()
    if len(clean_text) > 300:
        clean_text = clean_text[:297] + "..."
    return f"{provider} API error ({status_code}): {clean_text}"


async def test_model_connection(provider: str, model_id: Optional[str], api_key: str) -> Dict[str, Any]:
    """
    Sends a live lightweight ping prompt to the provider model to verify connectivity,
    measure latency, and validate token generation.
    If model_id is not provided, uses the provider's default probe model.
    """
    import time
    prov = provider.lower().strip()
    key = api_key.strip()
    clean_model = (model_id or "").strip() or DEFAULT_PROBE_MODELS.get(prov, "gpt-4o-mini")

    if not key:
        raise ValueError(f"API key is required to test {prov.title()} model connection.")

    timeout = httpx.Timeout(12.0, connect=8.0)
    prompt_text = "Respond with 'OK'"

    if prov == "groq":
        endpoint = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {key}"}
        payload = {
            "model": clean_model,
            "messages": [{"role": "user", "content": prompt_text}],
            "max_tokens": 10,
            "temperature": 0.0
        }
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(endpoint, headers=headers, json=payload)
        except httpx.RequestError as ex:
            raise RuntimeError(f"Connection error to Groq: {str(ex)}")
        latency_ms = (time.perf_counter() - start) * 1000

        if resp.status_code != 200:
            raise RuntimeError(_format_http_error("Groq", resp.status_code, resp.text))

        data = resp.json()
        choices = data.get("choices", [])
        response_text = choices[0].get("message", {}).get("content", "") if choices else ""
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 8)
        completion_tokens = usage.get("completion_tokens", 2)
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

    elif prov == "openai":
        endpoint = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {key}"}
        lower_model = clean_model.lower()
        is_reasoning = lower_model.startswith("o1") or lower_model.startswith("o3")

        payload = {
            "model": clean_model,
            "messages": [{"role": "user", "content": prompt_text}],
        }
        if is_reasoning:
            payload["max_completion_tokens"] = 50
        else:
            payload["max_tokens"] = 10
            payload["temperature"] = 0.0

        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(endpoint, headers=headers, json=payload)
        except httpx.RequestError as ex:
            raise RuntimeError(f"Connection error to OpenAI: {str(ex)}")
        latency_ms = (time.perf_counter() - start) * 1000

        if resp.status_code != 200:
            raise RuntimeError(_format_http_error("OpenAI", resp.status_code, resp.text))

        data = resp.json()
        choices = data.get("choices", [])
        response_text = choices[0].get("message", {}).get("content", "") if choices else ""
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 8)
        completion_tokens = usage.get("completion_tokens", 2)
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

    elif prov == "gemini":
        gemini_model = clean_model.replace("models/", "")
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={key}"
        payload = {
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {"maxOutputTokens": 10, "temperature": 0.0}
        }
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(endpoint, json=payload)
        except httpx.RequestError as ex:
            raise RuntimeError(f"Connection error to Google Gemini: {str(ex)}")
        latency_ms = (time.perf_counter() - start) * 1000

        if resp.status_code != 200:
            raise RuntimeError(_format_http_error("Google Gemini", resp.status_code, resp.text))

        data = resp.json()
        candidates = data.get("candidates", [])
        response_text = ""
        if candidates and "content" in candidates[0]:
            parts = candidates[0]["content"].get("parts", [])
            if parts:
                response_text = parts[0].get("text", "")
        usage_meta = data.get("usageMetadata", {})
        prompt_tokens = usage_meta.get("promptTokenCount", 4)
        completion_tokens = usage_meta.get("candidatesTokenCount", 2)
        total_tokens = usage_meta.get("totalTokenCount", prompt_tokens + completion_tokens)
    else:
        raise ValueError(f"Unsupported provider '{provider}'.")

    return {
        "success": True,
        "status": "SUCCESS",
        "provider": prov,
        "model": clean_model,
        "latency_ms": round(latency_ms, 1),
        "response_text": response_text.strip(),
        "response_preview": response_text.strip(),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "tokens_used": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        },
        "message": f"Successfully connected to {clean_model} in {int(latency_ms)}ms."
    }


async def record_llm_usage(
    db,
    user_id: Optional[str],
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: float,
    request_type: str = "COMPLETION",
    status: str = "SUCCESS",
    error: Optional[str] = None
):
    """
    Records an entry in llm_usage_logs for user-wise token and request tracking.
    """
    from app.models.organization import LLMUsageLog
    try:
        log_entry = LLMUsageLog(
            user_id=user_id,
            provider=provider.lower().strip(),
            model=model.strip(),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            latency_ms=round(latency_ms, 1),
            request_type=request_type,
            status=status,
            error_message=str(error) if error else None
        )
        db.add(log_entry)
        await db.commit()
        return log_entry
    except Exception as ex:
        logger.warning(f"Failed to record LLM usage log: {ex}")
        return None



"""DeepSeek OpenAI-compatible provider for chatbot and extraction workflows."""

import asyncio
import json
from collections.abc import AsyncIterator

import httpx

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"}


def _content(result: dict) -> str:
    value = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


async def _request(client: httpx.AsyncClient, payload: dict) -> dict:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.post(f"{DEEPSEEK_BASE_URL}/chat/completions", headers=_headers(), json=payload)
            if response.status_code in {429, 500, 502, 503, 504}:
                last_error = RuntimeError(f"DeepSeek HTTP {response.status_code}: {response.text[:500]}")
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise last_error
            response.raise_for_status()
            return response.json()
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
                continue
            raise
    raise last_error or RuntimeError("DeepSeek request failed")


async def generate_json(prompt: str, schema: dict, temperature: float, timeout: float = 90) -> str:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    async with httpx.AsyncClient(timeout=timeout) as client:
        result = await _request(client, {"model": DEEPSEEK_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": temperature, "response_format": {"type": "json_object"}})
    text = _content(result).strip()
    if not text:
        raise RuntimeError("DeepSeek returned an empty response")
    return text


async def stream_text(prompt: str, temperature: float = 0.2, timeout: float = 25) -> AsyncIterator[str]:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    payload = {"model": DEEPSEEK_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": temperature, "stream": True}
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", f"{DEEPSEEK_BASE_URL}/chat/completions", headers=_headers(), json=payload) as response:
            if response.is_error:
                body = await response.aread()
                raise RuntimeError(f"DeepSeek stream HTTP {response.status_code}: {body.decode(errors='replace')[:500]}")
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if not raw or raw == "[DONE]":
                    continue
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                text = event.get("choices", [{}])[0].get("delta", {}).get("content", "")
                if text:
                    yield text

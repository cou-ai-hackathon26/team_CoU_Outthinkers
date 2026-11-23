import asyncio
import json
from collections.abc import AsyncIterator

import httpx

from app.config import GEMINI_API_KEY, GEMINI_BASE_URL, GEMINI_MODEL


async def gemini_request(client: httpx.AsyncClient, url: str, payload: dict) -> dict:
    """Retry temporary Gemini capacity, rate-limit, network, and timeout failures."""
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.post(url, headers={"x-goog-api-key": GEMINI_API_KEY or ""}, json=payload)
            if response.status_code in {429, 500, 502, 503, 504}:
                retry_after = response.headers.get("retry-after")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
                last_error = RuntimeError(f"Gemini HTTP {response.status_code}: {response.text[:500]}")
                if attempt < 2:
                    await asyncio.sleep(min(delay, 8))
                    continue
                raise last_error
            if response.is_error:
                raise RuntimeError(f"Gemini HTTP {response.status_code}: {response.text[:500]}")
            return response.json()
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
                continue
            raise
    raise last_error or RuntimeError("Gemini request failed")


def response_text(result: dict) -> str:
    parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "".join(part.get("text", "") for part in parts).strip()


async def generate_json(prompt: str, schema: dict, temperature: float, timeout: float = 120) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    async with httpx.AsyncClient(timeout=timeout) as client:
        result = await gemini_request(
            client,
            f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent",
            {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": temperature, "responseMimeType": "application/json", "responseSchema": schema}},
        )
    text = response_text(result)
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text


async def stream_text(prompt: str, temperature: float = 0.2, timeout: float = 25) -> AsyncIterator[str]:
    """Yield Gemini fragments, falling back to normal generation if SSE fails."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    url = f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:streamGenerateContent?alt=sse"
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": temperature}}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers={"x-goog-api-key": GEMINI_API_KEY}, json=payload) as response:
                if response.is_error:
                    body = await response.aread()
                    raise RuntimeError(f"Gemini stream HTTP {response.status_code}: {body.decode(errors='replace')[:500]}")
                yielded = False
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
                    text = response_text(event)
                    if text:
                        yielded = True
                        yield text
                if yielded:
                    return
                raise RuntimeError("Gemini stream returned no text")
    except Exception as stream_error:
        # Some Gemini models/accounts support generateContent more reliably than
        # streamGenerateContent. Preserve the chat workflow and let the client
        # animate the returned text instead of showing an unavailable error.
        print(f"Gemini stream unavailable; using generateContent fallback: {type(stream_error).__name__}: {stream_error}")
        async with httpx.AsyncClient(timeout=timeout) as client:
            result = await gemini_request(
                client,
                f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent",
                payload,
            )
        text = response_text(result)
        if not text:
            raise RuntimeError("Gemini fallback returned an empty response") from stream_error
        for start in range(0, len(text), 80):
            yield text[start:start + 80]

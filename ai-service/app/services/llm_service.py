"""Provider selector shared by chatbot and structured extraction."""

from collections.abc import AsyncIterator

from app.config import AI_CHAT_PROVIDER
from app.services import deepseek_service, gemini_service


async def generate_json(prompt: str, schema: dict, temperature: float, timeout: float = 120, provider: str | None = None) -> str:
    selected = (provider or AI_CHAT_PROVIDER).lower()
    if selected == "deepseek":
        return await deepseek_service.generate_json(prompt, schema, temperature, timeout)
    return await gemini_service.generate_json(prompt, schema, temperature, timeout)


async def stream_text(prompt: str, temperature: float = 0.2, timeout: float = 25, provider: str | None = None) -> AsyncIterator[str]:
    selected = (provider or AI_CHAT_PROVIDER).lower()
    if selected == "deepseek":
        async for text in deepseek_service.stream_text(prompt, temperature, timeout):
            yield text
        return
    async for text in gemini_service.stream_text(prompt, temperature, timeout):
        yield text

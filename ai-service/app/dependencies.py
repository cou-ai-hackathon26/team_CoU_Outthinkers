"""Application lifecycle, model state, and service authentication."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from app.config import (
    AI_EXTRACTION_PROVIDER,
    AI_CHATBOT_TEST_MODE,
    ASR_CPU_THREADS,
    ASR_MODEL,
    DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    OLLAMA_MODEL,
    OLLAMA_URL,
)

import torch
from fastapi import HTTPException, Request
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor


@asynccontextmanager
async def lifespan(app) -> AsyncIterator[None]:
    torch.set_num_threads(max(1, ASR_CPU_THREADS))
    if AI_EXTRACTION_PROVIDER == "gemini":
        state = "configured" if GEMINI_API_KEY else "missing API key"
        print(f"Gemini extraction configured: {GEMINI_MODEL} ({state})")
    elif AI_EXTRACTION_PROVIDER == "deepseek":
        state = "configured" if DEEPSEEK_API_KEY else "missing API key"
        print(f"DeepSeek extraction configured: {DEEPSEEK_MODEL} ({state})")
    else:
        print(f"Ollama extraction configured: {OLLAMA_URL} / {OLLAMA_MODEL}")
    print(f"Chatbot test mode: {'ENABLED' if AI_CHATBOT_TEST_MODE else 'disabled'}")

    app.state.processor = AutoProcessor.from_pretrained(ASR_MODEL)
    app.state.asr_model = AutoModelForSpeechSeq2Seq.from_pretrained(
        ASR_MODEL, dtype=torch.float32, low_cpu_mem_usage=True
    )
    app.state.asr_model.to("cpu")
    app.state.asr_model.eval()
    app.state.asr_model.generation_config.forced_decoder_ids = app.state.processor.get_decoder_prompt_ids(
        language="bn", task="transcribe"
    )
    print(f"Bengali ASR model initialized: {ASR_MODEL}")
    yield
    app.state.processor = None
    app.state.asr_model = None
    print("Whisper model shutdown complete.")


def require_service_token(request: Request) -> None:
    from app.config import AI_SERVICE_TOKEN

    if AI_SERVICE_TOKEN and request.headers.get("x-ai-service-token") != AI_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="AI service authentication required")

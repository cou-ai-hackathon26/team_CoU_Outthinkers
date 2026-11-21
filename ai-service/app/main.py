import os
import json
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from typing import AsyncIterator

# Keep model downloads out of the system drive. This is set before importing
# Transformers/Hugging Face so every model lookup uses the project cache.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_CACHE = Path(
    os.getenv(
        "BENGALI_HF_HOME",
        str(PROJECT_ROOT / ".cache" / "huggingface"),
    )
)
MODEL_CACHE.mkdir(parents=True, exist_ok=True)
os.environ["HF_HOME"] = str(MODEL_CACHE)
os.environ["TRANSFORMERS_CACHE"] = str(MODEL_CACHE)

import httpx
import av
import torch
from faster_whisper.audio import decode_audio
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from pydantic import BaseModel, Field


# PyAV 19 removed the metadata_errors argument that Faster-Whisper still
# passes to av.open. Strip it for compatibility with the current environment.
_original_av_open = av.open


def _compatible_av_open(*args, **kwargs):
    kwargs.pop("metadata_errors", None)
    return _original_av_open(*args, **kwargs)


av.open = _compatible_av_open


# ==========================================
# CONFIGURATION
# ==========================================

OLLAMA_URL = os.getenv(
    "OLLAMA_BASE_URL",
    "http://localhost:11434"
)

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "qwen2.5:1.5b"
)

ASR_MODEL = os.getenv(
    "BENGALI_ASR_MODEL",
    # Bengali regional Whisper fine-tune covering multiple Bangladesh dialects.
    # Override with BENGALI_ASR_MODEL for another compatible Bengali checkpoint.
    "bengaliAI/tugstugi_bengaliai-regional-asr_whisper-medium"
)


# ==========================================
# FASTAPI LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:

    app.state.processor = AutoProcessor.from_pretrained(ASR_MODEL)
    app.state.asr_model = AutoModelForSpeechSeq2Seq.from_pretrained(
        ASR_MODEL,
        dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    app.state.asr_model.to("cpu")
    app.state.asr_model.eval()

    print(f"Bengali ASR model initialized: {ASR_MODEL}")

    yield

    # Cleanup
    app.state.processor = None
    app.state.asr_model = None

    print("Whisper model shutdown complete.")


app = FastAPI(
    title="MaternaCare AI Service",
    lifespan=lifespan
)


# ==========================================
# PYDANTIC MODELS
# ==========================================

class ExtractionRequest(BaseModel):
    transcript: str


class ExtractedIntake(BaseModel):
    reported_symptoms: list[str] = Field(default_factory=list)
    observations: list[str] = Field(default_factory=list)
    dates: list[str] = Field(default_factory=list)
    access_barriers: list[str] = Field(default_factory=list)
    uncertain_fields: list[str] = Field(default_factory=list)


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "MaternaCare AI"
    }


# ==========================================
# AUDIO TRANSCRIPTION
# ==========================================

@app.post("/transcribe")
async def transcribe(
    request: Request,
    file: UploadFile = File(...)
):

    processor = getattr(request.app.state, "processor", None)
    asr_model = getattr(request.app.state, "asr_model", None)

    if processor is None or asr_model is None:
        raise HTTPException(
            status_code=503,
            detail="Whisper model is not initialized"
        )

    # Validate audio content type
    if not file.content_type or not (
        file.content_type.startswith("audio/")
        or file.content_type == "application/octet-stream"
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio file"
        )

    # Read uploaded audio
    audio = await file.read()

    # Validate file size (10 MB maximum)
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Audio file exceeds 10 MB"
        )

    # Validate empty audio
    if not audio:
        raise HTTPException(
            status_code=400,
            detail="Empty audio file"
        )

    try:
        # Save audio temporarily
        temp_path: str | None = None
        with tempfile.NamedTemporaryFile(
            suffix=".audio",
            delete=False
        ) as temp:
            temp.write(audio)
            temp.flush()
            temp_path = temp.name

        try:
            # Decode after closing the file. This is required on Windows
            # because PyAV cannot reopen an open temporary file.
            waveform = decode_audio(temp_path, sampling_rate=16000)
            inputs = processor(
                waveform,
                sampling_rate=16000,
                return_tensors="pt",
            )
            forced_decoder_ids = processor.get_decoder_prompt_ids(
                language="bn",
                task="transcribe",
            )
            with torch.inference_mode():
                predicted_ids = asr_model.generate(
                    inputs["input_features"],
                    forced_decoder_ids=forced_decoder_ids,
                    num_beams=5,
                    do_sample=False,
                )
            transcript = processor.batch_decode(
                predicted_ids,
                skip_special_tokens=True,
            )[0].strip()
        finally:
            if temp_path:
                Path(temp_path).unlink(missing_ok=True)

        return {
            "transcript": transcript,
            "language": "bn",
            "language_probability": 1.0
        }

    except Exception as exc:

        print(f"Transcription error: {exc}")

        raise HTTPException(
            status_code=500,
            detail="Transcription failed"
        ) from exc

    finally:
        await file.close()


# ==========================================
# INFORMATION EXTRACTION USING OLLAMA
# ==========================================

@app.post(
    "/extract",
    response_model=ExtractedIntake
)
async def extract(request: ExtractionRequest):

    prompt = f"""
You extract information from community health worker notes.

The note may be in Bangla, Romanized Bangla, or English.

Extract only information explicitly reported in the note.

Do not:
- Diagnose any disease.
- Prescribe medication.
- Infer that a mother or newborn is safe.
- Invent missing dates or symptoms.
- Convert uncertain statements into confirmed facts.

Return JSON with these fields:
- reported_symptoms: list of reported symptoms
- observations: list of reported observations
- dates: list of explicitly mentioned dates
- access_barriers: list of reported access barriers
- uncertain_fields: list of information requiring human verification

Original note:
{request.transcript}
"""

    try:

        async with httpx.AsyncClient(timeout=120) as client:

            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": ExtractedIntake.model_json_schema()
                }
            )

            response.raise_for_status()

        result = response.json()

        extracted = json.loads(
            result["response"]
        )

        validated = ExtractedIntake.model_validate(
            extracted
        )

        return validated

    except Exception as exc:

        print(f"Extraction error: {exc}")

        raise HTTPException(
            status_code=502,
            detail="Information extraction failed"
        ) from exc

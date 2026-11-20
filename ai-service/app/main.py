import os
import json
import tempfile
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from pydantic import BaseModel, Field
from faster_whisper import WhisperModel


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

WHISPER_MODEL = os.getenv(
    "WHISPER_MODEL",
    "base"
)


# ==========================================
# FASTAPI LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:

    # Initialize Whisper model
    app.state.whisper = WhisperModel(
        WHISPER_MODEL,
        device="cpu",
        compute_type="int8"
    )

    print("Whisper model initialized successfully.")

    yield

    # Cleanup
    app.state.whisper = None

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

    # Check Whisper model initialization
    whisper: WhisperModel | None = getattr(
        request.app.state,
        "whisper",
        None
    )

    if whisper is None:
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
        with tempfile.NamedTemporaryFile(
            suffix=".audio",
            delete=True
        ) as temp:

            temp.write(audio)
            temp.flush()

            # Run Whisper transcription
            segments, info = whisper.transcribe(
                temp.name,
                beam_size=1,
                vad_filter=True
            )

            # Convert segments into transcript
            transcript = " ".join(
                segment.text.strip()
                for segment in segments
            )

        return {
            "transcript": transcript,
            "language": info.language,
            "language_probability": info.language_probability
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

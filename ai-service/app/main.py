import os
import json
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from typing import AsyncIterator

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional for environments that inject env vars
    load_dotenv = None


# Load the AI service's local configuration when running it directly. Production
# deployments can inject the same variables through the process environment.
if load_dotenv:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    load_dotenv(Path(__file__).resolve().parents[2] / "server" / ".env")

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

AI_EXTRACTION_PROVIDER = os.getenv(
    "AI_EXTRACTION_PROVIDER",
    "gemini" if (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")) else "ollama",
).strip().lower()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta",
).rstrip("/")

OLLAMA_URL = os.getenv(
    "OLLAMA_BASE_URL",
    "http://127.0.0.1:11434"
)

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "llama3.2:1b"
)

ASR_MODEL = os.getenv(
    "BENGALI_ASR_MODEL",
    # Bengali regional Whisper fine-tune covering multiple Bangladesh dialects.
    # Override with BENGALI_ASR_MODEL for another compatible Bengali checkpoint.
    "bengaliAI/tugstugi_bengaliai-regional-asr_whisper-medium"
)

ASR_CPU_THREADS = int(
    os.getenv(
        "ASR_CPU_THREADS",
        str(min(8, os.cpu_count() or 1)),
    )
)


# ==========================================
# FASTAPI LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:

    torch.set_num_threads(max(1, ASR_CPU_THREADS))
    if AI_EXTRACTION_PROVIDER == "gemini":
        key_state = "configured" if GEMINI_API_KEY else "missing API key"
        print(f"Gemini extraction configured: {GEMINI_MODEL} ({key_state})")
    else:
        print(f"Ollama extraction configured: {OLLAMA_URL} / {OLLAMA_MODEL}")
    app.state.processor = AutoProcessor.from_pretrained(ASR_MODEL)
    app.state.asr_model = AutoModelForSpeechSeq2Seq.from_pretrained(
        ASR_MODEL,
        dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    app.state.asr_model.to("cpu")
    app.state.asr_model.eval()
    app.state.asr_model.generation_config.forced_decoder_ids = (
        app.state.processor.get_decoder_prompt_ids(
            language="bn",
            task="transcribe",
        )
    )

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


def fallback_extract(transcript: str) -> ExtractedIntake:
    """Keep the intake reviewable when the configured extraction provider is unavailable."""
    symptom_terms = [
        "রক্তপাত", "রক্ত যাচ্ছে", "পেট ব্যথা", "মাথাব্যথা", "জ্বর",
        "শ্বাসকষ্ট", "খিঁচুনি", "অজ্ঞান", "নড়াচড়া কম", "ব্যথা",
        "bleeding", "fever", "pain", "headache", "breathing",
    ]
    observation_terms = ["গর্ভবতী", "মাসের গর্ভবতী", "শিশুর", "বাচ্চা", "pregnant", "baby"]
    reported_symptoms = [term for term in symptom_terms if term.lower() in transcript.lower()]
    observations = [term for term in observation_terms if term.lower() in transcript.lower()]
    return ExtractedIntake(
        reported_symptoms=reported_symptoms,
        observations=observations,
        uncertain_fields=["AI summary তৈরি করা যায়নি; স্বাস্থ্যকর্মী transcript নিজে যাচাই করবেন"],
    )


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
            with torch.inference_mode():
                predicted_ids = asr_model.generate(
                    inputs["input_features"],
                    # Greedy decoding is substantially faster on CPU than beam search.
                    num_beams=1,
                    do_sample=False,
                    max_new_tokens=256,
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
# INFORMATION EXTRACTION
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
        schema = ExtractedIntake.model_json_schema()

        if AI_EXTRACTION_PROVIDER == "gemini":
            if not GEMINI_API_KEY:
                raise RuntimeError("GEMINI_API_KEY is not configured")

            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent",
                    headers={"x-goog-api-key": GEMINI_API_KEY},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.1,
                            "responseMimeType": "application/json",
                            "responseSchema": schema,
                        },
                    },
                )
                if response.is_error:
                    detail = response.text[:500].replace("\n", " ")
                    raise RuntimeError(
                        f"Gemini HTTP {response.status_code}: {detail}"
                    )
                result = response.json()
                parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                response_text = "".join(part.get("text", "") for part in parts).strip()
                if not response_text:
                    raise RuntimeError("Gemini returned an empty extraction response")
        elif AI_EXTRACTION_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": OLLAMA_MODEL,
                        "prompt": prompt,
                        "stream": False,
                        "format": schema,
                    },
                )
                response.raise_for_status()
                response_text = response.json()["response"]
        else:
            raise RuntimeError(f"Unsupported AI_EXTRACTION_PROVIDER: {AI_EXTRACTION_PROVIDER}")

        return ExtractedIntake.model_validate(json.loads(response_text))

    except Exception as exc:
        print(
            f"{AI_EXTRACTION_PROVIDER.title()} extraction error; using safe fallback: "
            f"{type(exc).__name__}: {exc}"
        )
        return fallback_extract(request.transcript)

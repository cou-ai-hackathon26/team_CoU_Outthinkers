"""Configuration shared by all AI workflows."""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if load_dotenv:
    load_dotenv(PROJECT_ROOT / "ai-service" / ".env")
    load_dotenv(PROJECT_ROOT / "server" / ".env")

MODEL_CACHE = Path(os.getenv("BENGALI_HF_HOME", str(PROJECT_ROOT / ".cache" / "huggingface")))
MODEL_CACHE.mkdir(parents=True, exist_ok=True)
os.environ["HF_HOME"] = str(MODEL_CACHE)
os.environ["TRANSFORMERS_CACHE"] = str(MODEL_CACHE)

AI_EXTRACTION_PROVIDER = os.getenv(
    "AI_EXTRACTION_PROVIDER",
    "gemini" if (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")) else "ollama",
).strip().lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
AI_SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN", "").strip()
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")
ASR_MODEL = os.getenv("BENGALI_ASR_MODEL", "bengaliAI/tugstugi_bengaliai-regional-asr_whisper-medium")
ASR_CPU_THREADS = int(os.getenv("ASR_CPU_THREADS", str(min(8, os.cpu_count() or 1))))
KNOWLEDGE_RETRIEVAL_MODE = os.getenv("KNOWLEDGE_RETRIEVAL_MODE", "auto").strip().lower()
KNOWLEDGE_EMBEDDING_MODEL = os.getenv("KNOWLEDGE_EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2").strip()

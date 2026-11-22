import json

import httpx

from app.config import AI_EXTRACTION_PROVIDER, OLLAMA_MODEL, OLLAMA_URL
from app.prompts.extraction_prompt import build_extraction_prompt
from app.schemas.extraction import ExtractedIntake
from app.services.gemini_service import generate_json


EXTRACTION_SCHEMA = {"type": "OBJECT", "properties": {field: {"type": "ARRAY", "items": {"type": "STRING"}} for field in ["reported_symptoms", "observations", "dates", "access_barriers", "uncertain_fields"]}, "required": ["reported_symptoms", "observations", "dates", "access_barriers", "uncertain_fields"]}


def fallback_extract(transcript: str) -> ExtractedIntake:
    terms = ["রক্তপাত", "রক্ত যাচ্ছে", "পেট ব্যথা", "মাথাব্যথা", "জ্বর", "শ্বাসকষ্ট", "খিঁচুনি", "অজ্ঞান", "নড়াচড়া কম", "ব্যথা", "bleeding", "fever", "pain", "headache", "breathing"]
    observations_terms = ["গর্ভবতী", "মাসের গর্ভবতী", "শিশুর", "বাচ্চা", "pregnant", "baby"]
    lower = transcript.lower()
    return ExtractedIntake(
        reported_symptoms=[term for term in terms if term.lower() in lower],
        observations=[term for term in observations_terms if term.lower() in lower],
        uncertain_fields=["AI summary তৈরি করা যায়নি; স্বাস্থ্যকর্মী transcript নিজে যাচাই করবেন"],
        extractionStatus="FAILED", extractionProvider=AI_EXTRACTION_PROVIDER,
    )


async def extract_transcript(transcript: str) -> ExtractedIntake:
    prompt = build_extraction_prompt(transcript)
    try:
        if AI_EXTRACTION_PROVIDER == "gemini":
            response_text = await generate_json(prompt, EXTRACTION_SCHEMA, 0.1)
        elif AI_EXTRACTION_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(f"{OLLAMA_URL}/api/generate", json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "format": EXTRACTION_SCHEMA})
                response.raise_for_status()
                response_text = response.json()["response"]
        else:
            raise RuntimeError(f"Unsupported AI_EXTRACTION_PROVIDER: {AI_EXTRACTION_PROVIDER}")
        result = ExtractedIntake.model_validate(json.loads(response_text))
        result.extractionStatus = "READY"
        result.extractionProvider = AI_EXTRACTION_PROVIDER
        return result
    except Exception as exc:
        print(f"{AI_EXTRACTION_PROVIDER.title()} extraction error; using safe fallback: {type(exc).__name__}: {exc}")
        return fallback_extract(transcript)

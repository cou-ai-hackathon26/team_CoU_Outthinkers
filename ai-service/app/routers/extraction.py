from fastapi import APIRouter, Request

from app.dependencies import require_service_token
from app.schemas.extraction import ExtractedIntake, ExtractionRequest
from app.services.extraction_service import extract_transcript

router = APIRouter()


@router.post("/extract", response_model=ExtractedIntake)
async def extract(request: Request, payload: ExtractionRequest):
    require_service_token(request)
    return await extract_transcript(payload.transcript)

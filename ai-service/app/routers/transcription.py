from fastapi import APIRouter, File, Request, UploadFile

from app.dependencies import require_service_token
from app.services.whisper_service import transcribe_upload

router = APIRouter()


@router.post("/transcribe")
async def transcribe(request: Request, file: UploadFile = File(...)):
    require_service_token(request)
    return await transcribe_upload(request, file)

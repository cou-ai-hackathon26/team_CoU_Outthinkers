from fastapi import APIRouter, HTTPException, Request

from app.dependencies import require_service_token
from app.schemas.chatbot import ChatRequest, ChatResponse
from app.services.chatbot_service import chat as run_chat
from app.services.safety_service import find_red_flags

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: Request, payload: ChatRequest):
    require_service_token(request)
    # Only the newest patient message can trigger the deterministic emergency
    # override. Older messages remain context for Gemini but must not replay the
    # same alert on every subsequent turn.
    latest_message = payload.messages[-1].content if payload.messages else ""
    flags = find_red_flags(latest_message)
    if flags:
        return ChatResponse(reply=f"আপনি {', '.join(flags)}-এর কথা বলেছেন। এটি জরুরি হতে পারে। এখনই নিকটস্থ হাসপাতাল বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন। আমি রোগ নির্ণয় করতে পারি না।", urgency="EMERGENCY", red_flags=flags, suggested_action="এখনই নিকটস্থ হাসপাতাল বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন।")
    try:
        return await run_chat(payload)
    except Exception as exc:
        print(f"Chat service failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Chat service is temporarily unavailable") from exc

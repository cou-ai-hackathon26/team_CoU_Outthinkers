import json
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.dependencies import require_service_token
from app.schemas.chatbot import ChatRequest, ChatResponse
from app.services.chatbot_service import chat as run_chat
from app.prompts.chatbot_prompt import build_stream_chatbot_prompt
from app.services.gemini_service import stream_text
from app.services.safety_service import find_red_flags
from app.services.intent_service import classify_intent

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


@router.post("/chat/stream")
async def chat_stream(request: Request, payload: ChatRequest):
    require_service_token(request)
    latest_message = payload.messages[-1].content if payload.messages else ""
    flags = find_red_flags(latest_message)
    if flags:
        answer = f"আপনি {', '.join(flags)}-এর কথা বলেছেন। এটি জরুরি হতে পারে। এখনই নিকটস্থ হাসপাতাল বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন এবং সম্ভব হলে আপনার স্বাস্থ্যকর্মীকে জানান। আমি রোগ নির্ণয় করতে পারি না।"

        async def emergency_events():
            yield f"data: {json.dumps({'type': 'delta', 'text': answer}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'urgency': 'EMERGENCY', 'red_flags': flags, 'suggested_action': 'এখনই নিকটস্থ হাসপাতাল বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন।'}, ensure_ascii=False)}\n\n"

        return StreamingResponse(emergency_events(), media_type="text/event-stream")

    if re.search(r"আপনি কে|আপনার পরিচয়|আপনার পরিচয়|who are you", latest_message, re.IGNORECASE):
        answer = "আমি MaternaCare AI—গর্ভকালীন স্বাস্থ্য সম্পর্কে সাধারণ তথ্য দেওয়ার সহায়ক। আমি ডাক্তার নই; জরুরি বা ব্যক্তিগত সমস্যার জন্য আপনার নার্স বা ডাক্তারের সঙ্গে যোগাযোগ করুন।"

        async def identity_events():
            for character in answer:
                yield f"data: {json.dumps({'type': 'delta', 'text': character}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'urgency': 'NORMAL', 'red_flags': [], 'suggested_action': 'আপনার নির্দিষ্ট প্রশ্নটি লিখুন বা স্বাস্থ্যকর্মীর সঙ্গে কথা বলুন।'}, ensure_ascii=False)}\n\n"

        return StreamingResponse(identity_events(), media_type="text/event-stream")

    conversation = "\n".join(f"{message.role.upper()}: {message.content[:4000]}" for message in payload.messages[-12:])
    latest_message = payload.messages[-1].content if payload.messages else ""
    intent = classify_intent(latest_message)

    async def events():
        try:
            async for text in stream_text(build_stream_chatbot_prompt(conversation, latest_message, intent.name)):
                yield f"data: {json.dumps({'type': 'delta', 'text': text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'urgency': 'NORMAL', 'red_flags': [], 'suggested_action': ''}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            print(f"Chat stream failed: {type(exc).__name__}: {exc}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Chat service is temporarily unavailable'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

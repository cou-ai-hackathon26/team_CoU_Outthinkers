import asyncio
import json
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import AI_CHAT_PROVIDER
from app.dependencies import require_service_token
from app.schemas.chatbot import ChatRequest, ChatResponse
from app.services.chatbot_service import chat as run_chat
from app.prompts.chatbot_prompt import build_stream_chatbot_prompt
from app.services.llm_service import stream_text
from app.services.safety_service import find_red_flags
from app.services.intent_service import classify_intent
from app.services.diet_service import clarification_response, extract_diet_profile, missing_diet_questions
from app.services.knowledge_service import format_guidance, retrieve_guidance

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

    if re.search(r"আপনি.*(?:কে|পরিচয়|পরিচয়)|আপনার পরিচয়|আপনার পরিচয়|who are you|what are you", latest_message, re.IGNORECASE):
        answer = "আমি MaternaCare AI—গর্ভকালীন স্বাস্থ্য সম্পর্কে সাধারণ তথ্য দেওয়ার সহায়ক। আমি ডাক্তার নই; জরুরি বা ব্যক্তিগত সমস্যার জন্য আপনার নার্স বা ডাক্তারের সঙ্গে যোগাযোগ করুন।"

        async def identity_events():
            for character in answer:
                yield f"data: {json.dumps({'type': 'delta', 'text': character}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'urgency': 'NORMAL', 'red_flags': [], 'suggested_action': 'আপনার নির্দিষ্ট প্রশ্নটি লিখুন বা স্বাস্থ্যকর্মীর সঙ্গে কথা বলুন।'}, ensure_ascii=False)}\n\n"

        return StreamingResponse(identity_events(), media_type="text/event-stream")

    conversation = "\n".join(f"{message.role.upper()}: {message.content[:4000]}" for message in payload.messages[-12:])
    latest_message = payload.messages[-1].content if payload.messages else ""
    intent = classify_intent(latest_message, conversation)
    profile = extract_diet_profile(conversation)
    missing = missing_diet_questions(profile)
    if intent.name == "DIET_PLAN" and missing:
        answer = clarification_response(profile)

        async def diet_events():
            for character in answer:
                yield f"data: {json.dumps({'type': 'delta', 'text': character}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'urgency': 'NORMAL', 'red_flags': [], 'suggested_action': 'উপরের তথ্যগুলো লিখে পাঠান।', 'intent': 'DIET_PLAN', 'needs_clarification': True}, ensure_ascii=False)}\n\n"

        return StreamingResponse(diet_events(), media_type="text/event-stream")
    try:
        guidance_chunks = await asyncio.wait_for(
            asyncio.to_thread(retrieve_guidance, latest_message + " " + intent.name),
            timeout=5,
        )
    except asyncio.TimeoutError:
        print("Knowledge retrieval timed out; continuing without retrieved guidance")
        guidance_chunks = []
    guidance = format_guidance(guidance_chunks)
    source_urls = [chunk.source for chunk in guidance_chunks]

    async def events():
        try:
            yield f"data: {json.dumps({'type': 'status', 'message': 'উত্তর তৈরি হচ্ছে…'}, ensure_ascii=False)}\n\n"
            async for text in stream_text(build_stream_chatbot_prompt(conversation, latest_message, intent.name, guidance)):
                yield f"data: {json.dumps({'type': 'delta', 'text': text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'urgency': 'NORMAL', 'red_flags': [], 'suggested_action': '', 'sources': source_urls, 'intent': intent.name, 'requires_nurse_review': not bool(source_urls)}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            print(f"Chat stream failed: {type(exc).__name__}: {exc}")
            raw_error = str(exc).lower()
            if "authentication failed" in raw_error or "http 401" in raw_error or "http 403" in raw_error:
                message = "DeepSeek API key গ্রহণ করা যায়নি। server/.env-এ সঠিক DeepSeek key এবং DEEPSEEK_BASE_URL যাচাই করুন।"
            elif "429" in raw_error or "quota" in raw_error or "rate limit" in raw_error:
                provider_name = "DeepSeek" if AI_CHAT_PROVIDER == "deepseek" else "AI service"
                message = f"{provider_name}-এর request সীমা বা quota সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন অথবা স্বাস্থ্যকর্মীর কাছে care request পাঠান।"
            else:
                message = "AI সহায়তা সাময়িকভাবে unavailable। অনুগ্রহ করে আবার চেষ্টা করুন বা স্বাস্থ্যকর্মীর কাছে care request পাঠান।"
            yield f"data: {json.dumps({'type': 'error', 'message': message}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

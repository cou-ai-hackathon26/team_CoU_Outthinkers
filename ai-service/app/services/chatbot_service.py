import json
import re

from app.schemas.chatbot import ChatRequest, ChatResponse
from app.prompts.chatbot_prompt import build_chatbot_prompt
from app.services.gemini_service import generate_json
from app.services.intent_service import classify_intent
from app.services.diet_service import clarification_response, extract_diet_profile, missing_diet_questions
from app.services.knowledge_service import format_guidance, retrieve_guidance
from app.services.response_validator import validate_response


CHAT_SCHEMA = {"type": "OBJECT", "properties": {"reply": {"type": "STRING"}, "urgency": {"type": "STRING", "enum": ["NORMAL", "HIGH", "EMERGENCY"]}, "red_flags": {"type": "ARRAY", "items": {"type": "STRING"}}, "suggested_action": {"type": "STRING"}, "sources": {"type": "ARRAY", "items": {"type": "STRING"}}}, "required": ["reply", "urgency", "red_flags", "suggested_action", "sources"]}


async def chat(request: ChatRequest) -> ChatResponse:
    conversation = "\n".join(f"{message.role.upper()}: {message.content[:4000]}" for message in request.messages[-12:])
    latest_message = request.messages[-1].content if request.messages else ""
    intent = classify_intent(latest_message, conversation)
    if re.search(r"আপনি কে|আপনার পরিচয়|আপনার পরিচয়|who are you", latest_message, re.IGNORECASE):
        return ChatResponse(reply="আমি MaternaCare AI—গর্ভকালীন স্বাস্থ্য সম্পর্কে সাধারণ তথ্য দেওয়ার সহায়ক। আমি ডাক্তার নই; জরুরি বা ব্যক্তিগত সমস্যার জন্য আপনার নার্স বা ডাক্তারের সঙ্গে যোগাযোগ করুন।", urgency="NORMAL", suggested_action="আপনার নির্দিষ্ট প্রশ্নটি লিখুন বা স্বাস্থ্যকর্মীর সঙ্গে কথা বলুন।", intent="IDENTITY")
    profile = extract_diet_profile(conversation)
    missing = missing_diet_questions(profile)
    if intent.name == "DIET_PLAN" and missing:
        return ChatResponse(reply=clarification_response(profile), urgency="NORMAL", suggested_action="উপরের তথ্যগুলো লিখে পাঠান।", intent="DIET_PLAN", needs_clarification=True, clarifying_questions=missing)
    guidance_chunks = retrieve_guidance(latest_message + " " + intent.name)
    prompt = build_chatbot_prompt(conversation, latest_message, intent.name, format_guidance(guidance_chunks))
    result = ChatResponse.model_validate(json.loads(await generate_json(prompt, CHAT_SCHEMA, 0.2, timeout=90)))
    return validate_response(result, guidance_chunks, intent.name)

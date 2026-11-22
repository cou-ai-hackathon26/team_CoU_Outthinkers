import json

from app.schemas.chatbot import ChatRequest, ChatResponse
from app.prompts.chatbot_prompt import build_chatbot_prompt
from app.services.gemini_service import generate_json


CHAT_SCHEMA = {"type": "OBJECT", "properties": {"reply": {"type": "STRING"}, "urgency": {"type": "STRING", "enum": ["NORMAL", "HIGH", "EMERGENCY"]}, "red_flags": {"type": "ARRAY", "items": {"type": "STRING"}}, "suggested_action": {"type": "STRING"}}, "required": ["reply", "urgency", "red_flags", "suggested_action"]}


async def chat(request: ChatRequest) -> ChatResponse:
    conversation = "\n".join(f"{message.role.upper()}: {message.content[:4000]}" for message in request.messages[-12:])
    prompt = build_chatbot_prompt(conversation)
    return ChatResponse.model_validate(json.loads(await generate_json(prompt, CHAT_SCHEMA, 0.2, timeout=90)))

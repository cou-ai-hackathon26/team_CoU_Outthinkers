"""Safety and relevance gate for generated medical-assistant responses."""

import re

from app.schemas.chatbot import ChatResponse
from app.services.knowledge_service import KnowledgeChunk

GENERIC_PATTERNS = [
    r"সুষম খাবার.*পর্যাপ্ত পানি.*বিশ্রাম",
    r"মায়ের নিজের স্বাস্থ্যের যত্ন.*শিশুর",
    r"ডাক্তারের পরামর্শ ছাড়া.*ওষুধ",
]
UNSAFE_PATTERNS = [
    r"আপনার (?:রোগ|ডায়াবেটিস|ডায়াবেটিস|প্রি.?এক্ল্যাম্পসিয়া) হয়েছে",
    r"আপনার নিশ্চিত",
    r"প্রতিদিন \d+\s*(?:mg|মি?গ্রা|ট্যাবলেট)",
]


def validate_response(response: ChatResponse, chunks: list[KnowledgeChunk], intent: str) -> ChatResponse:
    sources = list(dict.fromkeys([*response.sources, *(chunk.source for chunk in chunks)]))
    reply = response.reply.strip()
    generic = any(re.search(pattern, reply, re.IGNORECASE) for pattern in GENERIC_PATTERNS) or ("সুষম খাবার" in reply and ("পানি" in reply or "বিশ্রাম" in reply))
    unsafe = any(re.search(pattern, reply, re.IGNORECASE) for pattern in UNSAFE_PATTERNS)
    if generic or unsafe or not reply:
        return ChatResponse(reply="আপনার প্রশ্নটি গুরুত্বপূর্ণ। নির্ভরযোগ্য ও ব্যক্তিগত উত্তর দিতে একজন স্বাস্থ্যকর্মীর review প্রয়োজন; অনুগ্রহ করে আপনার care request পাঠান।", urgency="HIGH", suggested_action="স্বাস্থ্যকর্মীর কাছে care request পাঠান।", intent=intent, sources=sources, needs_clarification=True, requires_nurse_review=True, validation_status="REJECTED_QUALITY")
    response.sources = sources
    response.intent = intent
    response.requires_nurse_review = response.requires_nurse_review or response.urgency in {"HIGH", "EMERGENCY"} or not sources
    response.validation_status = "PASSED" if sources else "PASSED_NO_RETRIEVED_SOURCE"
    return response

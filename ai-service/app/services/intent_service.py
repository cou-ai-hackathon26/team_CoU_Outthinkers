"""Lightweight, deterministic intent routing before any generative call."""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class IntentResult:
    name: str
    confidence: str


RULES = [
    ("IDENTITY", r"আপনি কে|আপনার পরিচয়|আপনার পরিচয়|who are you"),
    ("DIET_PLAN", r"ডায়েট|ডায়েট|খাদ্য পরিকল্পনা|খাবার পরিকল্পনা|খাবারের তালিকা|কি খাব|কী খাব|diet|meal plan"),
    ("MEDICATION", r"ওষুধ|ঔষধ|মেডিসিন|ট্যাবলেট|medicine|medication"),
    ("FOLLOW_UP", r"ফলো.?আপ|আবার কখন|পরের দেখা|follow.?up|checkup"),
    ("SYMPTOM_QUESTION", r"ব্যথা|জ্বর|বমি|মাথা|শ্বাস|রক্ত|নড়াচড়া|লক্ষণ|pain|fever|vomit|symptom"),
]


def classify_intent(text: str) -> IntentResult:
    for name, pattern in RULES:
        if re.search(pattern, text, re.IGNORECASE):
            return IntentResult(name, "HIGH")
    return IntentResult("GENERAL_INFORMATION", "LOW")

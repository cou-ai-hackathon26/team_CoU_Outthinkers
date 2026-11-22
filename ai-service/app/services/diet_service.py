"""Collect the minimum context required before discussing a pregnancy diet."""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class DietProfile:
    gestation: str | None
    diabetes: str | None
    hypertension: str | None
    anemia: str | None
    allergy_or_restriction: str | None


def extract_diet_profile(conversation: str) -> DietProfile:
    # Never infer patient facts from the assistant's own clarification questions.
    patient_lines = [line.split(":", 1)[1] for line in conversation.splitlines() if line.upper().startswith("USER:") and ":" in line]
    text = "\n".join(patient_lines).lower() or conversation.lower()
    gestation_match = re.search(r"(?:গর্ভের বয়স|গর্ভাবস্থার বয়স|গর্ভবতী|pregnan\w*)[^\n।,]{0,35}(\d+\s*(?:সপ্তাহ|মাস|week|month))", text, re.IGNORECASE)
    if not gestation_match:
        gestation_match = re.search(r"(\d+\s*(?:সপ্তাহ|মাস|week|month))", text, re.IGNORECASE)
    gestation = gestation_match.group(1) if gestation_match else None

    def condition(pattern: str) -> str | None:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            return None
        context = text[max(0, match.start() - 18):match.end() + 28]
        if re.search(r"নেই|না|হয়নি|হয়নি|নয়|no|not|without", context, re.IGNORECASE):
            return "না"
        return "হ্যাঁ"

    allergy_match = re.search(r"অ্যালার্জি|allerg|খাই না|খেতে পারি না|নিরামিষ|vegetarian", text, re.IGNORECASE)
    allergy = None
    if allergy_match:
        allergy_context = text[max(0, allergy_match.start() - 18):allergy_match.end() + 28]
        allergy = "না" if re.search(r"নেই|না|নয়|no|not|without", allergy_context, re.IGNORECASE) else "হ্যাঁ"
    return DietProfile(gestation, condition(r"ডায়াবেটিস|ডায়াবেটিস|diabetes"), condition(r"উচ্চ রক্তচাপ|রক্তচাপ|hypertension|blood pressure"), condition(r"রক্তস্বল্পতা|অ্যানিমিয়া|অ্যানিমিয়া|anemia"), allergy)


def missing_diet_questions(profile: DietProfile) -> list[str]:
    questions: list[str] = []
    if not profile.gestation:
        questions.append("আপনি কত সপ্তাহ বা মাসের গর্ভবতী?")
    if profile.diabetes is None:
        questions.append("আপনার ডায়াবেটিস আছে কি?")
    if profile.hypertension is None:
        questions.append("আপনার উচ্চ রক্তচাপ আছে কি?")
    if profile.anemia is None:
        questions.append("আপনার রক্তস্বল্পতা বা অ্যানিমিয়া আছে কি?")
    if profile.allergy_or_restriction is None:
        questions.append("কোনো খাবারে অ্যালার্জি, খাবার না খাওয়ার কারণ বা নিরামিষ পছন্দ আছে কি?")
    return questions


def clarification_response(profile: DietProfile) -> str:
    questions = missing_diet_questions(profile)
    return "নিরাপদ সাধারণ খাদ্য পরিকল্পনা দিতে আপনার কয়েকটি তথ্য জানা দরকার।\n\n" + "\n".join(f"{index}. {question}" for index, question in enumerate(questions, 1)) + "\n\nতথ্যগুলো একসঙ্গে লিখতে পারেন। এটি ব্যক্তিগত চিকিৎসা পরামর্শ নয়; প্রয়োজন হলে আপনার ডাক্তার বা নার্সের সঙ্গে কথা বলুন।"

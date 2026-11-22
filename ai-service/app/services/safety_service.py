import re


RED_FLAG_RULES = [
    (r"রক্তপাত|রক্ত যাচ্ছে|অনেক রক্ত|bleeding|heavy bleeding", "রক্তপাত"),
    (r"তীব্র পেট ব্যথা|প্রচণ্ড পেট ব্যথা|severe abdominal pain", "তীব্র পেটব্যথা"),
    (r"খিঁচুনি|অজ্ঞান|seizure|unconscious", "খিঁচুনি বা অজ্ঞান"),
    (r"শ্বাসকষ্ট|শ্বাস নিতে কষ্ট|difficulty breathing", "শ্বাসকষ্ট"),
    (r"চোখে ঝাপসা|দৃষ্টি ঝাপসা|severe headache", "তীব্র মাথাব্যথা বা দৃষ্টির সমস্যা"),
    (r"জ্বর|fever|high temperature", "জ্বর"),
    (r"বাচ্চা নড়ছে না|শিশু নড়ছে না|নড়াচড়া কম|reduced fetal movement", "শিশুর নড়াচড়া কম"),
]


def find_red_flags(text: str) -> list[str]:
    source = text.lower()
    return [label for pattern, label in RED_FLAG_RULES if re.search(pattern, source, re.IGNORECASE)]

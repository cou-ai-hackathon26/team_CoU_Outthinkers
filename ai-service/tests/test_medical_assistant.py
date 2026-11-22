import unittest

from app.schemas.chatbot import ChatResponse
from app.services.diet_service import extract_diet_profile, missing_diet_questions
from app.services.intent_service import classify_intent
from app.services.knowledge_service import KnowledgeChunk
from app.services.response_validator import validate_response
from app.services.safety_service import find_red_flags


class MedicalAssistantRulesTest(unittest.TestCase):
    def setUp(self):
        self.source = KnowledgeChunk("Test guideline", "reviewed guidance", "https://example.org/guideline")

    def test_intents(self):
        self.assertEqual(classify_intent("আমাকে একটি ডায়েট প্ল্যান দিন").name, "DIET_PLAN")
        self.assertEqual(classify_intent("আপনি কে?").name, "IDENTITY")
        self.assertEqual(classify_intent("আমার জ্বর হচ্ছে").name, "SYMPTOM_QUESTION")

    def test_diet_questions_are_required(self):
        profile = extract_diet_profile("USER: আমাকে একটি ডায়েট প্ল্যান দিন")
        self.assertGreater(len(missing_diet_questions(profile)), 0)

    def test_active_bleeding_is_not_suppressed(self):
        self.assertIn("রক্তপাত", find_red_flags("রক্তপাত বন্ধ করতে কী করতে হবে?"))
        self.assertNotIn("রক্তপাত", find_red_flags("রক্তপাত বন্ধ হয়েছে"))

    def test_generic_answer_is_rejected(self):
        response = validate_response(ChatResponse(reply="সুষম খাবার খান, পানি পান করুন এবং বিশ্রাম নিন।"), [self.source], "DIET_PLAN")
        self.assertEqual(response.validation_status, "REJECTED_QUALITY")
        self.assertTrue(response.requires_nurse_review)

    def test_unsourced_answer_is_rejected(self):
        response = validate_response(ChatResponse(reply="আপনার জন্য একটি সাধারণ তথ্য।"), [], "SYMPTOM_QUESTION")
        self.assertEqual(response.validation_status, "REJECTED_NO_SOURCE")
        self.assertTrue(response.requires_nurse_review)


if __name__ == "__main__":
    unittest.main()

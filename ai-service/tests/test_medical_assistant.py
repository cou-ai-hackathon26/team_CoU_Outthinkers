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

    def test_medication_question_is_classified_and_unsafe_dosage_is_rejected(self):
        self.assertEqual(classify_intent("গর্ভাবস্থায় কোন ওষুধ খেতে পারি?").name, "MEDICATION")
        response = validate_response(
            ChatResponse(reply="প্রতিদিন 500 mg ওষুধটি নিন।"),
            [self.source],
            "MEDICATION",
        )
        self.assertEqual(response.validation_status, "REJECTED_QUALITY")
        self.assertTrue(response.requires_nurse_review)

    def test_emergency_question_requires_nurse_review(self):
        self.assertIn("রক্তপাত", find_red_flags("আমার অনেক রক্তপাত হচ্ছে"))
        response = validate_response(
            ChatResponse(
                reply="রক্তপাতের ক্ষেত্রে এখনই নিকটস্থ হাসপাতাল বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করুন।",
                urgency="EMERGENCY",
            ),
            [self.source],
            "SYMPTOM_QUESTION",
        )
        self.assertEqual(response.validation_status, "PASSED")
        self.assertTrue(response.requires_nurse_review)

    def test_identity_and_general_questions_do_not_need_medical_source(self):
        identity = validate_response(
            ChatResponse(reply="আমি MaternaCare AI, তথ্য বুঝতে ও স্বাস্থ্যকর্মীর কাছে পাঠাতে সাহায্য করি।"),
            [],
            "IDENTITY",
        )
        self.assertEqual(identity.validation_status, "PASSED")
        general = validate_response(
            ChatResponse(reply="আমি আপনার প্রশ্নটি বুঝতে আরও কিছু তথ্য চাই।"),
            [],
            "GENERAL_INFORMATION",
        )
        self.assertEqual(general.validation_status, "PASSED")

    def test_ambiguous_question_is_not_presented_as_medical_fact(self):
        response = validate_response(
            ChatResponse(reply="আপনার প্রশ্নটি পরিষ্কার নয়; আপনি কোন সমস্যার কথা বলছেন?", needs_clarification=True),
            [],
            "GENERAL_INFORMATION",
        )
        self.assertEqual(response.validation_status, "PASSED")
        self.assertTrue(response.needs_clarification)

    def test_fever_and_reduced_movement_are_red_flags(self):
        flags = find_red_flags("আমার জ্বর এবং বাচ্চার নড়াচড়া কম মনে হচ্ছে")
        self.assertIn("জ্বর", flags)
        self.assertIn("শিশুর নড়াচড়া কম", flags)


if __name__ == "__main__":
    unittest.main()

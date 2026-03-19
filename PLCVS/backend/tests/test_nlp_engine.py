"""
Unit tests for NLP Engine components
"""

import pytest
from nlp_engine.intent_classifier import IntentClassifier, ResponseIntent
from nlp_engine.semantic_matcher import SemanticMatcher


class TestIntentClassifier:
    """Tests for rule-based intent classification"""

    def setup_method(self):
        self.classifier = IntentClassifier()

    # ── Positive Intent Tests ──

    def test_affirmative_response(self):
        intent, conf = self.classifier.classify("Affirmative, fuel pressure nominal")
        assert intent == ResponseIntent.CONFIRMED
        assert conf > 0.5

    def test_confirmed_response(self):
        intent, conf = self.classifier.classify("Confirmed, guidance system aligned")
        assert intent == ResponseIntent.CONFIRMED

    def test_roger_response(self):
        intent, conf = self.classifier.classify("Roger that, telemetry link established")
        assert intent == ResponseIntent.CONFIRMED

    def test_nominal_response(self):
        intent, conf = self.classifier.classify("Reading nominal, within range")
        assert intent == ResponseIntent.CONFIRMED

    def test_go_response(self):
        intent, conf = self.classifier.classify("Go for launch")
        assert intent == ResponseIntent.CONFIRMED

    # ── Negative Intent Tests ──

    def test_negative_response(self):
        intent, conf = self.classifier.classify("Negative, pressure out of range")
        assert intent == ResponseIntent.FAILED

    def test_abort_response(self):
        intent, conf = self.classifier.classify("Abort abort abort")
        assert intent == ResponseIntent.FAILED

    def test_failed_response(self):
        intent, conf = self.classifier.classify("Check failed, system malfunction")
        assert intent == ResponseIntent.FAILED

    def test_no_go_response(self):
        intent, conf = self.classifier.classify("No go, not ready")
        assert intent == ResponseIntent.FAILED

    def test_hold_response(self):
        intent, conf = self.classifier.classify("Hold, hold, we have an error")
        assert intent == ResponseIntent.FAILED

    # ── Question Tests ──

    def test_question_detection(self):
        intent, conf = self.classifier.classify("What is the fuel pressure status?")
        assert intent == ResponseIntent.QUESTION

    def test_status_request(self):
        intent, conf = self.classifier.classify("Report INS alignment status")
        assert intent == ResponseIntent.QUESTION

    # ── Ambiguous Tests ──

    def test_ambiguous_response(self):
        intent, conf = self.classifier.classify("standby checking")
        assert intent == ResponseIntent.AMBIGUOUS

    def test_empty_response(self):
        intent, conf = self.classifier.classify("")
        assert intent == ResponseIntent.AMBIGUOUS
        assert conf == 0.0


class TestSemanticMatcher:
    """Tests for semantic matching (requires model)"""

    @pytest.fixture(autouse=True)
    def setup_matcher(self):
        self.matcher = SemanticMatcher(
            model_path="sentence-transformers/all-MiniLM-L6-v2",
            confidence_threshold=0.5,
        )
        self.matcher.load_model()

        # Register sample checklist
        self.sample_config = {
            "stages": [
                {
                    "id": "STG_01",
                    "name": "Propulsion Check",
                    "checklist_items": [
                        {
                            "id": "CI_001",
                            "name": "Fuel Pressure",
                            "keywords": ["fuel pressure", "fuel tank pressure",
                                         "propellant pressure check"],
                            "expected_responses": {
                                "positive": ["nominal", "confirmed", "within range"],
                                "negative": ["out of range", "failed", "low"],
                            },
                        },
                        {
                            "id": "CI_002",
                            "name": "Oxidizer Level",
                            "keywords": ["oxidizer level", "LOX level check"],
                            "expected_responses": {
                                "positive": ["full", "level okay"],
                                "negative": ["low", "insufficient"],
                            },
                        },
                    ],
                }
            ]
        }
        self.matcher.register_checklist_items(self.sample_config)

    def test_exact_keyword_match(self):
        results = self.matcher.match("checking fuel pressure now")
        assert len(results) > 0
        assert results[0].checklist_item_id == "CI_001"

    def test_semantic_match(self):
        results = self.matcher.match("verify the propellant tank pressure reading")
        assert len(results) > 0
        assert results[0].checklist_item_id == "CI_001"

    def test_oxidizer_match(self):
        results = self.matcher.match("what is the LOX level")
        assert len(results) > 0
        assert results[0].checklist_item_id == "CI_002"

    def test_no_match(self):
        results = self.matcher.match("the weather is nice today")
        # Should either return empty or very low scores
        if results:
            assert results[0].similarity_score < 0.7

    def test_response_intent_positive(self):
        intent, conf = self.matcher.match_response_intent(
            "confirmed fuel pressure nominal", "CI_001"
        )
        assert intent == "POSITIVE"
        assert conf > 0.5

    def test_response_intent_negative(self):
        intent, conf = self.matcher.match_response_intent(
            "fuel pressure is out of range", "CI_001"
        )
        assert intent == "NEGATIVE"
        assert conf > 0.4
# intent_classifier.py
"""
Intent Classifier for radio communication responses.
Classifies responses as CONFIRMED, FAILED, or AMBIGUOUS.
Uses rule-based + semantic matching hybrid approach.
"""

import re
import logging
from typing import Tuple
from enum import Enum

logger = logging.getLogger(__name__)


class ResponseIntent(Enum):
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    AMBIGUOUS = "AMBIGUOUS"
    QUESTION = "QUESTION"  # The question part of the conversation


class IntentClassifier:
    """
    Hybrid intent classifier combining:
    1. Rule-based pattern matching (fast, high precision)
    2. Semantic matching fallback (handles edge cases)
    """

    # High-confidence positive indicators (military radio)
    POSITIVE_PATTERNS = [
        r'\b(affirmative|affirm)\b',
        r'\b(confirmed|confirm)\b',
        r'\b(nominal)\b',
        r'(?<!\bno\s)\b(go)\b(?!\s*no)',  # "go" but not "no go" or "go no-go"
        r'\b(roger|roger that|copy)\b',
        r'\b(checked|check complete)\b',
        r'\b(within range|within limits)\b',
        r'(?<!\bnot\s)\b(operational|ready|green)\b',
        r'\b(okay|ok|o\.k\.)\b',
        r'\b(yes|yeah|yep)\b',
        r'\b(passed|pass)\b',
        r'\b(verified|verification complete)\b',
        r'\b(aligned|calibrated)\b',
        r'\b(established|connected)\b',
        r'\b(full|complete|completed)\b',
        r'\b(satisfactory|sat)\b',
        r'\b(wilco)\b',  # Will comply
    ]

    # High-confidence negative indicators
    NEGATIVE_PATTERNS = [
        r'\b(negative|neg)\b',
        r'\b(failed|fail)\b',
        r'\b(abort)\b',
        r'\b(no go|no-go|nogo)\b',
        r'\b(not ready|not operational)\b',
        r'\b(out of range|out of limits)\b',
        r'\b(error|fault|malfunction)\b',
        r'\b(hold|stop|halt)\b',
        r'\b(rejected|reject)\b',
        r'\b(not confirmed|unconfirmed)\b',
        r'\b(red)\b',
        r'\b(insufficient|low)\b',
        r'\b(disconnected|lost)\b',
        r'\b(misaligned|not aligned)\b',
        r'\b(not verified)\b',
        r'\b(unable)\b',
    ]

    # Question indicators
    QUESTION_PATTERNS = [
        r'\?$',
        r'\b(status|report|check|verify)\b.*\?',
        r'\b(what is|how is|is the|are the)\b',
        r'\b(requesting|request status)\b',
        r'\b(confirm|checking)\b.*\b(status|reading|level)\b',
        r'^report\b',  # "Report ..." as a command/query
        r'\b(report)\b.*\b(status|reading|alignment|level)\b',
    ]

    def __init__(self, semantic_matcher=None):
        """
        Args:
            semantic_matcher: Optional SemanticMatcher instance for fallback
        """
        self.semantic_matcher = semantic_matcher

        # Compile patterns for efficiency
        self._positive_compiled = [
            re.compile(p, re.IGNORECASE) for p in self.POSITIVE_PATTERNS
        ]
        self._negative_compiled = [
            re.compile(p, re.IGNORECASE) for p in self.NEGATIVE_PATTERNS
        ]
        self._question_compiled = [
            re.compile(p, re.IGNORECASE) for p in self.QUESTION_PATTERNS
        ]

    def classify(
        self,
        text: str,
        checklist_item_id: str = None,
    ) -> Tuple[ResponseIntent, float]:
        """
        Classify the intent of a transcribed text.
        
        Args:
            text: Transcribed text
            checklist_item_id: Optional item ID for semantic matching context
            
        Returns:
            Tuple of (ResponseIntent, confidence_score)
        """
        text_clean = text.strip().lower()

        if not text_clean:
            return ResponseIntent.AMBIGUOUS, 0.0

        # Step 1: Check if it's a question
        question_score = self._pattern_score(text_clean, self._question_compiled)
        if question_score > 0.5:
            return ResponseIntent.QUESTION, question_score

        # Step 2: Rule-based classification
        positive_score = self._pattern_score(text_clean, self._positive_compiled)
        negative_score = self._pattern_score(text_clean, self._negative_compiled)

        logger.debug(
            f"Pattern scores - Positive: {positive_score:.2f}, "
            f"Negative: {negative_score:.2f} for: '{text_clean[:50]}'"
        )

        # Clear positive
        if positive_score > 0.3 and positive_score > negative_score:
            confidence = min(positive_score + 0.3, 1.0)  # Boost for rule match
            return ResponseIntent.CONFIRMED, confidence

        # Clear negative
        if negative_score > 0.3 and negative_score > positive_score:
            confidence = min(negative_score + 0.3, 1.0)
            return ResponseIntent.FAILED, confidence

        # Step 3: Semantic matching fallback
        if self.semantic_matcher and checklist_item_id:
            intent_str, sem_confidence = self.semantic_matcher.match_response_intent(
                text, checklist_item_id
            )
            if sem_confidence >= 0.6:
                if intent_str == "POSITIVE":
                    return ResponseIntent.CONFIRMED, sem_confidence
                elif intent_str == "NEGATIVE":
                    return ResponseIntent.FAILED, sem_confidence

        return ResponseIntent.AMBIGUOUS, max(positive_score, negative_score, 0.1)

    def _pattern_score(self, text: str, patterns: list) -> float:
        """Calculate match score based on pattern hits"""
        matches = sum(1 for p in patterns if p.search(text))
        if matches == 0:
            return 0.0
        return min(matches / 3.0, 1.0)  # Normalize: 3+ matches = 1.0
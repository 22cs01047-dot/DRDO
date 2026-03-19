# matcher.py
"""
Checklist Matcher

Orchestrates the matching of transcribed audio segments to checklist items.

Pipeline:
1. Extract keywords from transcription
2. Semantic match against checklist items
3. Classify intent (CONFIRMED/FAILED/AMBIGUOUS/QUESTION/NO_MATCH)
4. Update conversation context
5. Return structured match result
"""

import logging
from typing import Optional, List
from dataclasses import dataclass

from nlp_engine.keyword_extractor import KeywordExtractor
from nlp_engine.semantic_matcher import SemanticMatcher, MatchResult
from nlp_engine.intent_classifier import IntentClassifier, ResponseIntent
from nlp_engine.context_manager import ConversationContextManager
from checklist.config_loader import ChecklistConfig
from stt_engine.transcriber import TranscriptionSegment

logger = logging.getLogger(__name__)


@dataclass
class ChecklistMatchResult:
    """Result of matching a transcription to a checklist item."""

    segment_id: str
    checklist_item_id: Optional[str]
    checklist_item_name: Optional[str]
    stage_id: Optional[str]
    intent: str  # CONFIRMED | FAILED | AMBIGUOUS | QUESTION | NO_MATCH
    confidence: float
    matched_keyword: Optional[str]
    transcribed_text: str
    speaker_turn: str
    needs_manual_review: bool



class ChecklistMatcher:
    """
    Matches transcribed audio segments to checklist items.

    Pipeline:
    1. Extract keywords from transcription
    2. Semantic match against checklist items
    3. Classify intent (CONFIRMED/FAILED/AMBIGUOUS)
    4. Update conversation context
    5. Return structured match result
    """

    def __init__(
        self,
        checklist_config: ChecklistConfig,
        semantic_matcher: SemanticMatcher,
        intent_classifier: IntentClassifier,
        keyword_extractor: KeywordExtractor,
        context_manager: ConversationContextManager,
        confidence_threshold: float = 0.65,
    ):
        self.config = checklist_config
        self.semantic = semantic_matcher
        self.intent_clf = intent_classifier
        self.keyword_ext = keyword_extractor
        self.context = context_manager
        self.confidence_threshold = confidence_threshold

    def match(self, transcription: TranscriptionSegment) -> ChecklistMatchResult:
        """
        Match a transcription segment to a checklist item.

        Args:
            transcription: Processed transcription segment.

        Returns:
            ChecklistMatchResult with match details.
        """
        text = transcription.processed_text
        speaker = transcription.speaker_turn

        logger.debug(
            f"Matching [{transcription.segment_id}] [{speaker}]: '{text[:60]}'"
        )

        # Step 1: Extract keywords
        keywords = self.keyword_ext.extract(text)
        keyword_texts = [kw.text for kw in keywords]

        # Step 2: Semantic matching
        semantic_matches = self._get_semantic_matches(text, keyword_texts)

        # Step 3: Determine best match
        best_match = semantic_matches[0] if semantic_matches else None

        # Step 4: Process match based on confidence
        if best_match and best_match.similarity_score >= self.confidence_threshold:
            return self._process_confident_match(
                transcription, text, speaker, best_match
            )
        else:
            return self._process_low_confidence_match(transcription, text, speaker)

    def _get_semantic_matches(
        self, text: str, keyword_texts: List[str]
    ) -> List[MatchResult]:
        """
        Get semantic matches for text and extracted keywords.

        Args:
            text: Full transcription text.
            keyword_texts: List of extracted keyword strings.

        Returns:
            Sorted list of MatchResult objects.
        """
        semantic_matches: List[MatchResult] = self.semantic.match(text)

        # Also try matching individual extracted keywords
        for kw_text in keyword_texts[:5]:
            kw_matches = self.semantic.match(kw_text)
            for m in kw_matches:
                if not any(
                    sm.checklist_item_id == m.checklist_item_id
                    for sm in semantic_matches
                ):
                    semantic_matches.append(m)

        # Sort all matches by score
        semantic_matches.sort(key=lambda x: x.similarity_score, reverse=True)
        return semantic_matches

    def _process_confident_match(
        self,
        transcription: TranscriptionSegment,
        text: str,
        speaker: str,
        best_match: MatchResult,
    ) -> ChecklistMatchResult:
        """
        Process a match that exceeds the confidence threshold.

        Args:
            transcription: Original transcription segment.
            text: Processed text.
            speaker: Speaker turn identifier.
            best_match: Best semantic match result.

        Returns:
            ChecklistMatchResult with match details.
        """
        item_id = best_match.checklist_item_id
        item_name = best_match.checklist_item_name
        stage = self.config.get_stage_for_item(item_id)
        stage_id = stage.id if stage else None

        # Determine intent based on speaker role
        intent, intent_confidence = self._classify_intent_for_speaker(
            text, speaker, item_id
        )

        # Handle ambiguous intent with context fallback
        if intent == "AMBIGUOUS" and self.context.has_pending_question:
            item_id, item_name, stage_id = self._resolve_from_context(
                item_id, item_name, stage_id
            )

        needs_review = self._should_flag_for_review(
            intent, best_match.similarity_score, intent_confidence
        )

        # Update context
        self._update_context(
            transcription, speaker, text, item_id, intent, best_match.similarity_score
        )

        return ChecklistMatchResult(
            segment_id=transcription.segment_id,
            checklist_item_id=item_id,
            checklist_item_name=item_name,
            stage_id=stage_id,
            intent=intent,
            confidence=best_match.similarity_score,
            matched_keyword=best_match.matched_keyword,
            transcribed_text=text,
            speaker_turn=speaker,
            needs_manual_review=needs_review,
        )

    def _process_low_confidence_match(
        self, transcription: TranscriptionSegment, text: str, speaker: str
    ) -> ChecklistMatchResult:
        """
        Process when no confident match is found.

        Args:
            transcription: Original transcription segment.
            text: Processed text.
            speaker: Speaker turn identifier.

        Returns:
            ChecklistMatchResult (may use context or return NO_MATCH).
        """
        # Check if this is a response to a pending question
        if speaker == "RESPONDER" and self.context.has_pending_question:
            return self._process_contextual_response(transcription, text, speaker)

        # Truly no match
        self._update_context(
            transcription, speaker, text, None, "NO_MATCH", 0.0
        )

        return ChecklistMatchResult(
            segment_id=transcription.segment_id,
            checklist_item_id=None,
            checklist_item_name=None,
            stage_id=None,
            intent="NO_MATCH",
            confidence=0.0,
            matched_keyword=None,
            transcribed_text=text,
            speaker_turn=speaker,
            needs_manual_review=False,
        )

    def _process_contextual_response(
        self, transcription: TranscriptionSegment, text: str, speaker: str
    ) -> ChecklistMatchResult:
        """
        Process a response using pending question context.

        Args:
            transcription: Original transcription segment.
            text: Processed text.
            speaker: Speaker turn identifier.

        Returns:
            ChecklistMatchResult based on context.
        """
        pending_item = self.context.current_item_context

        if not pending_item:
            return self._create_no_match_result(transcription, text, speaker)

        resp_intent, intent_confidence = self.intent_clf.classify(
            text, checklist_item_id=pending_item
        )

        item_config = self.config.get_item(pending_item)
        stage = self.config.get_stage_for_item(pending_item)

        self._update_context(
            transcription, speaker, text, pending_item,
            resp_intent.value, intent_confidence
        )

        return ChecklistMatchResult(
            segment_id=transcription.segment_id,
            checklist_item_id=pending_item,
            checklist_item_name=item_config.name if item_config else None,
            stage_id=stage.id if stage else None,
            intent=resp_intent.value,
            confidence=intent_confidence,
            matched_keyword=None,
            transcribed_text=text,
            speaker_turn=speaker,
            needs_manual_review=(resp_intent == ResponseIntent.AMBIGUOUS),
        )

    def _classify_intent_for_speaker(
        self, text: str, speaker: str, item_id: str
    ) -> tuple[str, float]:
        """
        Classify intent based on speaker role.

        Args:
            text: Transcribed text.
            speaker: Speaker turn identifier.
            item_id: Matched checklist item ID.

        Returns:
            Tuple of (intent string, confidence score).
        """
        if speaker == "QUESTIONER":
            return "QUESTION", 1.0

        # Classify the response
        resp_intent, intent_confidence = self.intent_clf.classify(
            text, checklist_item_id=item_id
        )
        return resp_intent.value, intent_confidence

    def _resolve_from_context(
        self,
        item_id: str,
        item_name: str,
        stage_id: Optional[str],
    ) -> tuple[str, str, Optional[str]]:
        """
        Resolve item details from pending question context.

        Args:
            item_id: Current item ID.
            item_name: Current item name.
            stage_id: Current stage ID.

        Returns:
            Tuple of (item_id, item_name, stage_id) from context.
        """
        pending_ctx = self.context.current_item_context
        if not pending_ctx:
            return item_id, item_name, stage_id

        item_config = self.config.get_item(pending_ctx)
        if item_config:
            stage = self.config.get_stage_for_item(pending_ctx)
            return pending_ctx, item_config.name, stage.id if stage else None

        return item_id, item_name, stage_id

    def _should_flag_for_review(
        self, intent: str, similarity_score: float, intent_confidence: float
    ) -> bool:
        """
        Determine if a match should be flagged for manual review.

        Args:
            intent: Classified intent.
            similarity_score: Semantic similarity score.
            intent_confidence: Intent classification confidence.

        Returns:
            True if manual review is needed.
        """
        return (
            intent == "AMBIGUOUS"
            or similarity_score < 0.75
            or intent_confidence < 0.6
        )

    def _update_context(
        self,
        transcription: TranscriptionSegment,
        speaker: str,
        text: str,
        item_id: Optional[str],
        intent: str,
        confidence: float,
    ) -> None:
        """
        Update conversation context with the current turn.

        Args:
            transcription: Original transcription segment.
            speaker: Speaker turn identifier.
            text: Processed text.
            item_id: Matched item ID (or None).
            intent: Classified intent.
            confidence: Match confidence score.
        """
        self.context.add_turn(
            segment_id=transcription.segment_id,
            speaker=speaker,
            text=text,
            timestamp=transcription.timestamp_start,
            matched_item_id=item_id,
            intent=intent,
            confidence=confidence,
        )

    def _create_no_match_result(
        self, transcription: TranscriptionSegment, text: str, speaker: str
    ) -> ChecklistMatchResult:
        """
        Create a NO_MATCH result.

        Args:
            transcription: Original transcription segment.
            text: Processed text.
            speaker: Speaker turn identifier.

        Returns:
            ChecklistMatchResult with NO_MATCH intent.
        """
        self._update_context(transcription, speaker, text, None, "NO_MATCH", 0.0)

        return ChecklistMatchResult(
            segment_id=transcription.segment_id,
            checklist_item_id=None,
            checklist_item_name=None,
            stage_id=None,
            intent="NO_MATCH",
            confidence=0.0,
            matched_keyword=None,
            transcribed_text=text,
            speaker_turn=speaker,
            needs_manual_review=False,
        )

    def reset(self) -> None:
        """Reset matcher state (context, etc.)."""
        self.context.reset()
        logger.info("ChecklistMatcher state reset")
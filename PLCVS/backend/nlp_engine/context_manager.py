# context_manager.py
"""
Conversation Context Manager

Maintains context across multiple audio segments in a session
to properly track question-response pairs and conversation flow
in half-duplex radio communication.
"""

import logging
from typing import Optional, List, Dict
from dataclasses import dataclass, field
from datetime import datetime
from collections import deque

logger = logging.getLogger(__name__)


@dataclass
class ConversationTurn:
    """A single turn in the conversation."""
    turn_id: int
    segment_id: str
    speaker: str  # QUESTIONER | RESPONDER
    text: str
    timestamp: datetime
    matched_item_id: Optional[str] = None
    intent: Optional[str] = None  # CONFIRMED | FAILED | AMBIGUOUS | QUESTION
    confidence: float = 0.0


@dataclass
class QuestionResponsePair:
    """A matched question-response pair."""
    pair_id: int
    question_turn: ConversationTurn
    response_turn: Optional[ConversationTurn] = None
    checklist_item_id: Optional[str] = None
    status: str = "AWAITING_RESPONSE"
    # AWAITING_RESPONSE | MATCHED | TIMEOUT | UNMATCHED


class ConversationContextManager:
    """
    Tracks the flow of half-duplex radio communication.

    In half-duplex:
    1. Controller asks a question (checklist item query)
    2. Authority responds with status
    3. System matches Q-R pair to checklist item

    This manager:
    - Tracks conversation turns
    - Pairs questions with responses
    - Maintains sliding window of recent context
    - Handles timeouts for unanswered questions
    """

    def __init__(
        self,
        context_window_size: int = 20,
        response_timeout: float = 60.0,
    ):
        """
        Args:
            context_window_size: Number of recent turns to keep in context.
            response_timeout: Seconds to wait for a response before timeout.
        """
        self.context_window_size = context_window_size
        self.response_timeout = response_timeout

        # Conversation state
        self._turns: deque[ConversationTurn] = deque(
            maxlen=context_window_size
        )
        self._turn_counter = 0
        self._pairs: List[QuestionResponsePair] = []
        self._pair_counter = 0
        self._pending_question: Optional[ConversationTurn] = None
        self._current_item_context: Optional[str] = None

    def add_turn(
        self,
        segment_id: str,
        speaker: str,
        text: str,
        timestamp: datetime,
        matched_item_id: Optional[str] = None,
        intent: Optional[str] = None,
        confidence: float = 0.0,
    ) -> ConversationTurn:
        """
        Add a new conversation turn.

        Args:
            segment_id: Audio segment ID
            speaker: QUESTIONER or RESPONDER
            text: Transcribed text
            timestamp: When this was spoken
            matched_item_id: Checklist item this relates to
            intent: Classified intent
            confidence: Match confidence

        Returns:
            The created ConversationTurn
        """
        self._turn_counter += 1

        turn = ConversationTurn(
            turn_id=self._turn_counter,
            segment_id=segment_id,
            speaker=speaker,
            text=text,
            timestamp=timestamp,
            matched_item_id=matched_item_id,
            intent=intent,
            confidence=confidence,
        )

        self._turns.append(turn)

        # Handle Q-R pairing
        if speaker == "QUESTIONER":
            self._handle_question(turn)
        elif speaker == "RESPONDER":
            self._handle_response(turn)

        logger.debug(
            f"Turn #{turn.turn_id} [{speaker}]: '{text[:50]}' "
            f"(item={matched_item_id}, intent={intent})"
        )

        return turn

    def _handle_question(self, turn: ConversationTurn) -> None:
        """Handle a new question turn."""
        # If there's a pending question without response, mark it
        if self._pending_question is not None:
            self._timeout_pending_question()

        self._pending_question = turn

        if turn.matched_item_id:
            self._current_item_context = turn.matched_item_id

    def _handle_response(self, turn: ConversationTurn) -> None:
        """Handle a response turn — pair it with pending question."""
        if self._pending_question is not None:
            self._pair_counter += 1

            # Use item context from question if response doesn't have one
            item_id = (
                turn.matched_item_id
                or self._pending_question.matched_item_id
                or self._current_item_context
            )

            pair = QuestionResponsePair(
                pair_id=self._pair_counter,
                question_turn=self._pending_question,
                response_turn=turn,
                checklist_item_id=item_id,
                status="MATCHED",
            )
            self._pairs.append(pair)
            self._pending_question = None

            logger.info(
                f"Q-R Pair #{pair.pair_id}: "
                f"Q='{pair.question_turn.text[:30]}' → "
                f"R='{turn.text[:30]}' → "
                f"Item={item_id}"
            )
        else:
            # Response without a question — still record it
            logger.info(
                f"Response without pending question: '{turn.text[:50]}'"
            )

    def _timeout_pending_question(self) -> None:
        """Mark a pending question as timed out."""
        if self._pending_question is None:
            return

        self._pair_counter += 1
        pair = QuestionResponsePair(
            pair_id=self._pair_counter,
            question_turn=self._pending_question,
            response_turn=None,
            checklist_item_id=self._pending_question.matched_item_id,
            status="TIMEOUT",
        )
        self._pairs.append(pair)

        logger.warning(
            f"Question timed out: '{self._pending_question.text[:50]}'"
        )
        self._pending_question = None

    def get_current_context(self) -> Dict:
        """Get the current conversation context."""
        return {
            "recent_turns": [
                {
                    "turn_id": t.turn_id,
                    "speaker": t.speaker,
                    "text": t.text,
                    "item_id": t.matched_item_id,
                    "intent": t.intent,
                }
                for t in self._turns
            ],
            "pending_question": (
                {
                    "text": self._pending_question.text,
                    "item_id": self._pending_question.matched_item_id,
                }
                if self._pending_question
                else None
            ),
            "current_item_context": self._current_item_context,
            "total_turns": self._turn_counter,
            "total_pairs": self._pair_counter,
        }

    def get_recent_text(self, n: int = 5) -> str:
        """Get last n turns as concatenated text for context."""
        recent = list(self._turns)[-n:]
        return " ".join(t.text for t in recent)

    def get_pairs(self) -> List[QuestionResponsePair]:
        """Get all Q-R pairs."""
        return list(self._pairs)

    def get_last_pair(self) -> Optional[QuestionResponsePair]:
        """Get the most recent Q-R pair."""
        return self._pairs[-1] if self._pairs else None

    @property
    def has_pending_question(self) -> bool:
        return self._pending_question is not None

    @property
    def current_item_context(self) -> Optional[str]:
        return self._current_item_context

    def reset(self) -> None:
        """Reset all context state."""
        self._turns.clear()
        self._turn_counter = 0
        self._pairs.clear()
        self._pair_counter = 0
        self._pending_question = None
        self._current_item_context = None
        logger.info("Conversation context reset.")

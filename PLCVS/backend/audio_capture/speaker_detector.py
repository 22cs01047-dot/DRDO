# speaker_detector.py
"""
Content-Based Speaker Turn Detector

Detects QUESTIONER vs RESPONDER using transcription text analysis
instead of time-gap heuristics.

Military half-duplex radio convention:
  - Questioner (controller) initiates with: "Programmer to <target>, ..."
  - Responder (station authority) replies without the "to" pattern.

Primary detection:  Text pattern matching (post-transcription)
Fallback detection: Silence gap duration (pre-transcription)
"""

import re
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)


class SpeakerTurnDetector:
    """
    Identifies speaker turns from transcribed radio communication.

    The questioner (typically "Programmer" or "Controller") always
    initiates with the pattern:

        "<Callsign> to <Target>, <question/command>"

    Any speech that does NOT match this pattern is classified as
    a RESPONDER turn.

    Usage:
        detector = SpeakerTurnDetector(
            questioner_callsigns=["programmer", "controller"],
        )
        # After each transcription:
        turn = detector.detect(
            text=transcription.processed_text,
            segment_start=segment.timestamp_start.timestamp(),
            segment_end=segment.timestamp_end.timestamp(),
        )
        transcription.speaker_turn = turn

    Configuration (system_config.yaml):
        half_duplex:
          questioner_callsigns: ["programmer", "controller"]
          turn_gap_threshold_s: 2.0
    """

    # Default callsigns that identify the questioner when followed by "to"
    DEFAULT_CALLSIGNS = [
        "programmer",
        "controller",
        "director",
        "launch director",
        "test director",
        "range safety",
        "mission director",
    ]

    def __init__(
        self,
        questioner_callsigns: Optional[List[str]] = None,
        turn_gap_threshold: float = 2.0,
        detect_generic_to_pattern: bool = False,
    ):
        """
        Args:
            questioner_callsigns: List of callsigns that identify the
                questioner when used as "<callsign> to <target>".
                Case-insensitive. Defaults to DEFAULT_CALLSIGNS.
            turn_gap_threshold: Silence gap (seconds) that indicates
                a speaker change. Used as fallback when text-based
                detection is inconclusive.
            detect_generic_to_pattern: If True, any "<word> to <word>"
                at the start of speech is treated as QUESTIONER.
                Disabled by default to avoid false positives.
        """
        self.questioner_callsigns = [
            cs.lower().strip()
            for cs in (questioner_callsigns or self.DEFAULT_CALLSIGNS)
        ]
        self.turn_gap_threshold = turn_gap_threshold
        self.detect_generic = detect_generic_to_pattern

        # Build compiled regex patterns (sorted longest-first for greedy match)
        self._patterns = self._build_patterns()

        # Conversation state
        self._last_turn: Optional[str] = None
        self._last_segment_end: Optional[float] = None
        self._turn_count: int = 0
        self._question_count: int = 0
        self._response_count: int = 0

    def _build_patterns(self) -> list:
        """Build regex patterns for questioner callsigns."""
        # Sort by length descending so "launch director" matches before "launch"
        sorted_callsigns = sorted(
            self.questioner_callsigns, key=len, reverse=True
        )

        patterns = []
        for callsign in sorted_callsigns:
            # Match: "<callsign> to <anything>" at start of text
            # Allows optional leading whitespace/punctuation
            pattern = re.compile(
                rf'^\s*(?:,\s*)?{re.escape(callsign)}\s+to\s+\w',
                re.IGNORECASE,
            )
            patterns.append(pattern)

        # Optional generic pattern: "<word> to <word>"
        if self.detect_generic:
            patterns.append(re.compile(
                r'^\s*\w+\s+to\s+\w+',
                re.IGNORECASE,
            ))

        return patterns

    def detect(
        self,
        text: str,
        segment_start: Optional[float] = None,
        segment_end: Optional[float] = None,
    ) -> str:
        """
        Detect speaker turn from transcribed text.

        Primary: Pattern matching against known questioner callsigns.
        Fallback: Gap-based detection when text is inconclusive.

        Args:
            text: Post-processed transcription text.
            segment_start: Segment start timestamp (epoch seconds).
                           Used for gap-based fallback.
            segment_end: Segment end timestamp (epoch seconds).
                         Stored for next gap calculation.

        Returns:
            "QUESTIONER" or "RESPONDER"
        """
        self._turn_count += 1
        result = self._detect_from_text(text)

        # Fallback to gap-based if text detection returns UNKNOWN
        if result == "UNKNOWN" and segment_start is not None:
            result = self._detect_from_gap(segment_start)

        # Final fallback: if we still don't know, infer from conversation state
        if result == "UNKNOWN":
            result = self._infer_from_state()

        # Update state
        self._last_turn = result
        if segment_end is not None:
            self._last_segment_end = segment_end

        if result == "QUESTIONER":
            self._question_count += 1
        else:
            self._response_count += 1

        logger.debug(
            f"Speaker turn #{self._turn_count}: {result} "
            f"(text: '{text[:60]}...')"
        )

        return result

    def _detect_from_text(self, text: str) -> str:
        """
        Content-based detection using regex patterns.

        Returns "QUESTIONER", "RESPONDER", or "UNKNOWN".
        """
        if not text or not text.strip():
            return "UNKNOWN"

        clean = text.strip()

        # Check if text starts with a questioner callsign pattern
        for pattern in self._patterns:
            if pattern.search(clean):
                logger.debug(
                    f"Questioner pattern matched: '{clean[:40]}...'"
                )
                return "QUESTIONER"

        # If the last turn was a QUESTIONER, this is likely a RESPONDER
        if self._last_turn == "QUESTIONER":
            return "RESPONDER"

        # Can't determine from text alone
        return "UNKNOWN"

    def _detect_from_gap(self, current_start: float) -> str:
        """
        Gap-based fallback detection.

        A silence gap >= turn_gap_threshold suggests a speaker change.
        """
        if self._last_segment_end is None:
            # First segment is typically the questioner starting
            return "QUESTIONER"

        gap = current_start - self._last_segment_end

        if gap >= self.turn_gap_threshold:
            # Speaker change detected via gap
            if self._last_turn == "QUESTIONER":
                return "RESPONDER"
            elif self._last_turn == "RESPONDER":
                return "QUESTIONER"
            else:
                return "QUESTIONER"  # Default first speaker

        # Short gap = same speaker continuation
        return self._last_turn or "UNKNOWN"

    def _infer_from_state(self) -> str:
        """
        Last-resort inference based on conversation state.

        If we have no text clues and no gap data, use the
        alternating Q-R pattern.
        """
        if self._last_turn is None:
            return "QUESTIONER"  # First turn defaults to questioner
        if self._last_turn == "QUESTIONER":
            return "RESPONDER"
        return "QUESTIONER"

    def reset(self) -> None:
        """Reset detector state for a new session."""
        self._last_turn = None
        self._last_segment_end = None
        self._turn_count = 0
        self._question_count = 0
        self._response_count = 0
        logger.debug("SpeakerTurnDetector state reset.")

    @property
    def stats(self) -> dict:
        """Get detection statistics."""
        return {
            "total_turns": self._turn_count,
            "questions": self._question_count,
            "responses": self._response_count,
            "last_turn": self._last_turn,
        }
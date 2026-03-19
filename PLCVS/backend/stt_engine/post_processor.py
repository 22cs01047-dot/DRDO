# post_processor.py
"""
Post-Processor for STT output.

Cleans, normalizes, and corrects transcribed text
with focus on military/launch terminology.
"""

import re
import logging
from typing import Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)


class PostProcessor:
    """
    Post-processes raw STT output to improve quality.

    Features:
    - Remove filler words and artifacts
    - Normalize numbers and units
    - Correct common STT mistakes for domain terms
    - Expand abbreviations
    - Normalize whitespace and punctuation
    """

    # Common STT artifacts to remove
    FILLER_WORDS = [
        r'\b(uh+|um+|hmm+|ah+|er+)\b',
        r'\b(you know|i mean|like)\b',
    ]

    # Common STT mistakes for military terms
    CORRECTIONS: Dict[str, str] = {
        "roger dodger": "roger",
        "over and out": "over",
        "copy pasta": "copy",
        "fuel presser": "fuel pressure",
        "tell a metric": "telemetric",
        "tell em a tree": "telemetry",
        "tell a metry": "telemetry",
        "giro": "gyro",
        "gyrascope": "gyroscope",
        "in ertial": "inertial",
        "eye and s": "INS",
        "i n s": "INS",
        "f t s": "FTS",
        "accelero meter": "accelerometer",
        "naught": "not",
        "knot": "not",
        "locks": "LOX",
        "nozzle bell": "nozzle",
        "umber lick": "umbilical",
        "umbilcal": "umbilical",
    }

    def __init__(
        self,
        vocabulary_path: Optional[str] = None,
        additional_corrections: Optional[Dict[str, str]] = None,
    ):
        self.corrections = dict(self.CORRECTIONS)
        self._abbreviations: Dict[str, str] = {}

        if additional_corrections:
            self.corrections.update(additional_corrections)

        if vocabulary_path:
            self._load_vocabulary(vocabulary_path)

        # Compile filler patterns
        self._filler_patterns = [
            re.compile(p, re.IGNORECASE) for p in self.FILLER_WORDS
        ]

        # Compile correction patterns (sorted by length desc for greedy match)
        sorted_corrections = sorted(
            self.corrections.items(), key=lambda x: len(x[0]), reverse=True
        )
        self._correction_patterns = [
            (re.compile(re.escape(wrong), re.IGNORECASE), correct)
            for wrong, correct in sorted_corrections
        ]

    def _load_vocabulary(self, path: str) -> None:
        """Load custom vocabulary from YAML."""
        try:
            with open(path, "r") as f:
                vocab = yaml.safe_load(f) or {}

            # Load abbreviations
            self._abbreviations = vocab.get("abbreviations", {})

            logger.info(
                f"Loaded vocabulary: "
                f"{len(self._abbreviations)} abbreviations"
            )
        except Exception as e:
            logger.warning(f"Failed to load vocabulary from {path}: {e}")

    def process(self, text: str) -> str:
        """
        Full post-processing pipeline.

        Args:
            text: Raw transcribed text.

        Returns:
            Cleaned and normalized text.
        """
        if not text or not text.strip():
            return ""

        result = text.strip()

        # Step 1: Lowercase for processing (preserve later if needed)
        result_lower = result.lower()

        # Step 2: Remove filler words
        for pattern in self._filler_patterns:
            result_lower = pattern.sub("", result_lower)

        # Step 3: Apply domain corrections
        for pattern, replacement in self._correction_patterns:
            result_lower = pattern.sub(replacement, result_lower)

        # Step 4: Normalize whitespace
        result_lower = re.sub(r'\s+', ' ', result_lower).strip()

        # Step 5: Remove leading/trailing punctuation artifacts
        result_lower = re.sub(r'^[.,;:!?\s]+', '', result_lower)
        result_lower = re.sub(r'[.,;:\s]+$', '', result_lower)

        # Step 6: Normalize numbers spoken as words
        result_lower = self._normalize_numbers(result_lower)

        # Step 7: Handle repeated words (STT artifact)
        result_lower = self._remove_repeated_words(result_lower)

        return result_lower.strip()

    @staticmethod
    def _normalize_numbers(text: str) -> str:
        """Convert common spoken numbers to digits."""
        word_to_num = {
            "zero": "0", "one": "1", "two": "2", "three": "3",
            "four": "4", "five": "5", "six": "6", "seven": "7",
            "eight": "8", "nine": "9", "ten": "10",
            "eleven": "11", "twelve": "12", "thirteen": "13",
            "fourteen": "14", "fifteen": "15", "sixteen": "16",
            "seventeen": "17", "eighteen": "18", "nineteen": "19",
            "twenty": "20", "thirty": "30", "forty": "40",
            "fifty": "50", "sixty": "60", "seventy": "70",
            "eighty": "80", "ninety": "90", "hundred": "100",
        }

        for word, num in word_to_num.items():
            text = re.sub(
                rf'\b{word}\b',
                num,
                text,
                flags=re.IGNORECASE,
            )

        return text

    @staticmethod
    def _remove_repeated_words(text: str) -> str:
        """Remove immediately repeated words (STT artifact)."""
        words = text.split()
        if len(words) <= 1:
            return text

        cleaned = [words[0]]
        for i in range(1, len(words)):
            if words[i].lower() != words[i - 1].lower():
                cleaned.append(words[i])

        return " ".join(cleaned)

    def expand_abbreviation(self, abbr: str) -> Optional[str]:
        """Look up abbreviation expansion."""
        return self._abbreviations.get(abbr.upper())

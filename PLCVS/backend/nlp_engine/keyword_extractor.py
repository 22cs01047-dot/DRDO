# keyword_extractor.py
"""
Keyword Extractor using spaCy and rule-based patterns.

Extracts domain-relevant keywords and phrases from
transcribed text for checklist matching.
"""

import re
import logging
from typing import List, Optional, Set
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ExtractedKeyword:
    """A keyword/phrase extracted from text."""
    text: str
    label: str  # NOUN_PHRASE | ENTITY | PATTERN | VERB_PHRASE
    start_char: int
    end_char: int
    importance: float  # 0-1


class KeywordExtractor:
    """
    Extracts relevant keywords from transcribed radio communication.

    Uses:
    1. spaCy NLP for noun phrases and named entities
    2. Domain-specific regex patterns
    3. Configurable keyword lists
    """

    # Domain patterns for launch terminology
    DOMAIN_PATTERNS = [
        # System status patterns
        r'(fuel\s+pressure)',
        r'(programmer\s+to)',
        r'(controller\s+to)',
        r'(director\s+to)',
        r'(launch director\s+to)',
        r'(test director\s+to)',
        r'(range safety\s+to)',
        r'(mission director\s+to)',
        r'(oxidizer\s+level)',
        r'(battery\s+voltage)',
        r'(telemetry\s+link)',
        r'(radar\s+tracking)',
        r'(INS\s+alignment)',
        r'(gyroscope?\s+calibration)',
        r'(accelerometer\s+(?:check|reading|status))',
        r'(flight\s+computer)',
        r'(command\s+destruct)',
        r'(flight\s+termination)',
        r'(range\s+(?:clear|safety|clearance))',
        r'(weather\s+(?:clearance|status|clear))',
        r'(umbilical\s+(?:connection|disconnect|status))',
        r'(power\s+(?:switchover|supply|status))',
        r'(ignit(?:er|ion)\s+(?:system|status|sequence)?)',
        r'(propellant\s+feed)',
        r'(feed\s+system)',
        r'(onboard\s+(?:computer|power))',
        r'(launch\s+(?:authorization|clearance|command|sequence))',
        r'(go\s+no[\s-]?go)',
        r'(final\s+poll)',
        r'(stage\s+\d+)',
        r'(T[\s-]minus\s+\d+)',

        # Status keywords
        r'((?:is\s+)?nominal)',
        r'(confirmed|affirmative)',
        r'(negative|abort|hold)',
        r'(within\s+(?:range|limits|tolerance))',
        r'(out\s+of\s+(?:range|limits|tolerance))',
    ]

    def __init__(
        self,
        spacy_model_name: str = "en_core_web_trf",
        use_spacy: bool = True,
        additional_patterns: Optional[List[str]] = None,
    ):
        self.spacy_model_name = spacy_model_name
        self.use_spacy = use_spacy
        self._nlp = None

        # Compile domain patterns
        all_patterns = list(self.DOMAIN_PATTERNS)
        if additional_patterns:
            all_patterns.extend(additional_patterns)

        self._domain_patterns = [
            re.compile(p, re.IGNORECASE) for p in all_patterns
        ]

    def load_model(self) -> None:
        """Load spaCy model."""
        if not self.use_spacy:
            logger.info("spaCy disabled. Using pattern-only extraction.")
            return

        try:
            import spacy
            logger.info(f"Loading spaCy model: {self.spacy_model_name}")
            self._nlp = spacy.load(self.spacy_model_name)
            logger.info("spaCy model loaded successfully.")
        except OSError:
            logger.warning(
                f"spaCy model '{self.spacy_model_name}' not found. "
                f"Trying 'en_core_web_sm'..."
            )
            try:
                import spacy
                self._nlp = spacy.load("en_core_web_sm")
                logger.info("Loaded fallback spaCy model: en_core_web_sm")
            except OSError:
                logger.warning(
                    "No spaCy model available. Using pattern-only extraction."
                )
                self._nlp = None

    def extract(self, text: str) -> List[ExtractedKeyword]:
        """
        Extract keywords from transcribed text.

        Args:
            text: Transcribed (post-processed) text.

        Returns:
            List of ExtractedKeyword sorted by importance.
        """
        if not text or not text.strip():
            return []

        keywords: List[ExtractedKeyword] = []
        seen_texts: Set[str] = set()

        # Method 1: Domain-specific regex patterns (highest priority)
        for pattern in self._domain_patterns:
            for match in pattern.finditer(text):
                kw_text = match.group(1).strip().lower()
                if kw_text and kw_text not in seen_texts:
                    seen_texts.add(kw_text)
                    keywords.append(ExtractedKeyword(
                        text=kw_text,
                        label="PATTERN",
                        start_char=match.start(1),
                        end_char=match.end(1),
                        importance=0.9,
                    ))

        # Method 2: spaCy noun phrases and entities
        if self._nlp is not None:
            doc = self._nlp(text)

            # Named entities
            for ent in doc.ents:
                ent_text = ent.text.strip().lower()
                if ent_text and ent_text not in seen_texts and len(ent_text) > 2:
                    seen_texts.add(ent_text)
                    keywords.append(ExtractedKeyword(
                        text=ent_text,
                        label=f"ENTITY:{ent.label_}",
                        start_char=ent.start_char,
                        end_char=ent.end_char,
                        importance=0.7,
                    ))

            # Noun phrases
            for chunk in doc.noun_chunks:
                chunk_text = chunk.text.strip().lower()
                if (
                    chunk_text
                    and chunk_text not in seen_texts
                    and len(chunk_text) > 2
                    and not all(t.is_stop for t in chunk)
                ):
                    seen_texts.add(chunk_text)
                    keywords.append(ExtractedKeyword(
                        text=chunk_text,
                        label="NOUN_PHRASE",
                        start_char=chunk.start_char,
                        end_char=chunk.end_char,
                        importance=0.5,
                    ))

        # Sort by importance descending
        keywords.sort(key=lambda k: k.importance, reverse=True)

        if keywords:
            logger.debug(
                f"Extracted {len(keywords)} keywords from: '{text[:60]}...' → "
                f"{[k.text for k in keywords[:5]]}"
            )

        return keywords

    def extract_simple(self, text: str) -> List[str]:
        """Extract keywords as plain strings."""
        return [kw.text for kw in self.extract(text)]

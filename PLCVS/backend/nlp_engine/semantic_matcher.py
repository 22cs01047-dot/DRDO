# semantic_matcher.py
"""
Semantic Matcher using Sentence-Transformers
Matches transcribed text to checklist items using cosine similarity
"""

import logging
from typing import List, Optional, Tuple, Dict
from dataclasses import dataclass

import numpy as np
from sentence_transformers import SentenceTransformer, util

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    """Result of semantic matching"""
    checklist_item_id: str
    checklist_item_name: str
    matched_keyword: str
    similarity_score: float
    is_confident: bool
    transcribed_text: str


class SemanticMatcher:
    """
    Matches transcribed text against predefined checklist item
    keywords using sentence embeddings and cosine similarity.
    
    Uses all-MiniLM-L6-v2 (80MB, fast, runs locally)
    """

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        model_path: Optional[str] = None,
        confidence_threshold: float = 0.65,
        high_confidence_threshold: float = 0.80,
        device: str = "cpu",
    ):
        self.model_name = model_name
        self.model_path = model_path or model_name
        self.confidence_threshold = confidence_threshold
        self.high_confidence_threshold = high_confidence_threshold
        self.device = device
        self.model = None

        # Pre-computed embeddings for checklist items
        self._keyword_embeddings: Dict[str, np.ndarray] = {}
        self._keyword_to_item: Dict[str, dict] = {}

    def load_model(self) -> None:
        """Load the sentence transformer model"""
        logger.info(f"Loading Sentence-Transformer: {self.model_path}")
        self.model = SentenceTransformer(self.model_path, device=self.device)
        logger.info("Sentence-Transformer loaded successfully")

    def register_checklist_items(self, checklist_config: dict) -> None:
        """
        Pre-compute embeddings for all checklist item keywords.
        Call this once when loading a mission configuration.
        
        Args:
            checklist_config: Parsed YAML checklist configuration
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        logger.info("Pre-computing checklist item embeddings...")

        all_keywords = []
        keyword_metadata = []

        for stage in checklist_config.get("stages", []):
            stage_id = stage["id"]
            stage_name = stage["name"]

            for item in stage.get("checklist_items", []):
                item_id = item["id"]
                item_name = item["name"]

                for keyword in item.get("keywords", []):
                    all_keywords.append(keyword)
                    keyword_metadata.append({
                        "keyword": keyword,
                        "item_id": item_id,
                        "item_name": item_name,
                        "stage_id": stage_id,
                        "stage_name": stage_name,
                        "expected_positive": item.get("expected_responses", {}).get("positive", []),
                        "expected_negative": item.get("expected_responses", {}).get("negative", []),
                    })

        # Batch encode all keywords
        embeddings = self.model.encode(
            all_keywords,
            convert_to_numpy=True,
            show_progress_bar=False,
            normalize_embeddings=True,
        )

        for i, keyword in enumerate(all_keywords):
            key = f"{keyword_metadata[i]['item_id']}::{keyword}"
            self._keyword_embeddings[key] = embeddings[i]
            self._keyword_to_item[key] = keyword_metadata[i]

        logger.info(
            f"Registered {len(all_keywords)} keywords from "
            f"{len(checklist_config.get('stages', []))} stages"
        )

    def match(self, transcribed_text: str) -> List[MatchResult]:
        """
        Match transcribed text against registered checklist items.
        
        Args:
            transcribed_text: Text from STT engine
            
        Returns:
            List of MatchResult sorted by similarity (highest first)
        """
        if self.model is None:
            raise RuntimeError("Model not loaded.")

        if not self._keyword_embeddings:
            logger.warning("No checklist items registered.")
            return []

        # Encode the transcribed text
        text_embedding = self.model.encode(
            transcribed_text,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )

        results = []

        for key, keyword_embedding in self._keyword_embeddings.items():
            similarity = float(util.cos_sim(text_embedding, keyword_embedding)[0][0])

            if similarity >= self.confidence_threshold:
                metadata = self._keyword_to_item[key]
                results.append(MatchResult(
                    checklist_item_id=metadata["item_id"],
                    checklist_item_name=metadata["item_name"],
                    matched_keyword=metadata["keyword"],
                    similarity_score=round(similarity, 4),
                    is_confident=similarity >= self.high_confidence_threshold,
                    transcribed_text=transcribed_text,
                ))

        # Sort by similarity descending
        results.sort(key=lambda x: x.similarity_score, reverse=True)

        # Deduplicate by item_id (keep highest score)
        seen_items = set()
        unique_results = []
        for r in results:
            if r.checklist_item_id not in seen_items:
                seen_items.add(r.checklist_item_id)
                unique_results.append(r)

        if unique_results:
            best = unique_results[0]
            logger.info(
                f"Best match: '{best.checklist_item_name}' "
                f"(score: {best.similarity_score:.2%}, "
                f"confident: {best.is_confident})"
            )
        else:
            logger.info(f"No match found for: '{transcribed_text[:80]}...'")

        return unique_results

    def match_response_intent(
        self,
        response_text: str,
        item_id: str,
    ) -> Tuple[str, float]:
        """
        Determine if a response is POSITIVE, NEGATIVE, or AMBIGUOUS
        for a specific checklist item.
        
        Args:
            response_text: The response text from the radio communication
            item_id: The checklist item being responded to
            
        Returns:
            Tuple of (intent: str, confidence: float)
        """
        # Find expected responses for this item
        positive_phrases = []
        negative_phrases = []

        for key, metadata in self._keyword_to_item.items():
            if metadata["item_id"] == item_id:
                positive_phrases = metadata.get("expected_positive", [])
                negative_phrases = metadata.get("expected_negative", [])
                break

        if not positive_phrases and not negative_phrases:
            return "AMBIGUOUS", 0.0

        response_lower = response_text.lower()

        # ── Fast path: literal keyword/substring match ──
        # If an expected phrase appears verbatim in the response text,
        # trust it directly (high confidence). This handles the common
        # case where short phrases like "nominal" or "confirmed" appear
        # inside a longer sentence.
        pos_keyword_hit = any(
            phrase.lower() in response_lower for phrase in positive_phrases
        )
        neg_keyword_hit = any(
            phrase.lower() in response_lower for phrase in negative_phrases
        )

        if pos_keyword_hit and not neg_keyword_hit:
            return "POSITIVE", 0.95
        elif neg_keyword_hit and not pos_keyword_hit:
            return "NEGATIVE", 0.95
        # If both or neither hit, fall through to semantic comparison

        # ── Semantic similarity fallback ──
        response_embedding = self.model.encode(
            response_text,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )

        # Check positive matches
        if positive_phrases:
            pos_embeddings = self.model.encode(
                positive_phrases,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )
            pos_scores = util.cos_sim(response_embedding, pos_embeddings)[0]
            max_pos_score = float(pos_scores.max())
        else:
            max_pos_score = 0.0

        # Check negative matches
        if negative_phrases:
            neg_embeddings = self.model.encode(
                negative_phrases,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )
            neg_scores = util.cos_sim(response_embedding, neg_embeddings)[0]
            max_neg_score = float(neg_scores.max())
        else:
            max_neg_score = 0.0

        # Use a lower threshold for semantic matching since expected
        # phrases are often short (single words) while responses are
        # full sentences, yielding modest cosine similarity scores.
        semantic_threshold = 0.25
        margin = 0.05  # require winner to lead by this margin

        if (max_pos_score > max_neg_score + margin
                and max_pos_score >= semantic_threshold):
            return "POSITIVE", max_pos_score
        elif (max_neg_score > max_pos_score + margin
              and max_neg_score >= semantic_threshold):
            return "NEGATIVE", max_neg_score
        else:
            return "AMBIGUOUS", max(max_pos_score, max_neg_score)
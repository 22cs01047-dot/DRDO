# __init__.py
"""
NLP Engine Module

Handles keyword extraction, semantic matching,
intent classification, and conversation context tracking.
"""

from nlp_engine.keyword_extractor import KeywordExtractor
from nlp_engine.semantic_matcher import SemanticMatcher
from nlp_engine.intent_classifier import IntentClassifier, ResponseIntent
from nlp_engine.context_manager import ConversationContextManager

__all__ = [
    "KeywordExtractor",
    "SemanticMatcher",
    "IntentClassifier",
    "ResponseIntent",
    "ConversationContextManager",
]

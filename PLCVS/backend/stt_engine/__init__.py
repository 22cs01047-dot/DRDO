# __init__.py
"""
Speech-to-Text Engine Module

Handles audio transcription using Faster-Whisper,
including post-processing and custom vocabulary support.
"""

from stt_engine.whisper_model import WhisperSTT, TranscriptionResult
from stt_engine.transcriber import Transcriber
from stt_engine.post_processor import PostProcessor

__all__ = ["WhisperSTT", "TranscriptionResult", "Transcriber", "PostProcessor"]

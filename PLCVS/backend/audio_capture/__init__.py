# __init__.py
"""
Audio Capture Module

Handles real-time audio input, Voice Activity Detection (VAD),
segmentation, and content-based speaker turn detection
for half-duplex radio communication.
"""

from audio_capture.audio_stream import AudioStream
from audio_capture.vad_processor import VADProcessor
from audio_capture.audio_segmenter import AudioSegmenter
from audio_capture.speaker_detector import SpeakerTurnDetector

__all__ = [
    "AudioStream",
    "VADProcessor",
    "AudioSegmenter",
    "SpeakerTurnDetector",
]
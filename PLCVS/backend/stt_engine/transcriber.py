# transcriber.py
"""
Transcriber — Orchestrates the full STT pipeline.

AudioSegment → Whisper → PostProcessor → TranscriptionSegment
"""

import logging
import tempfile
import os
from typing import Optional
from dataclasses import dataclass
from datetime import datetime

import numpy as np
import soundfile as sf

from stt_engine.whisper_model import WhisperSTT, TranscriptionResult
from stt_engine.post_processor import PostProcessor
from audio_capture.audio_stream import AudioSegment

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionSegment:
    """Final transcription result for a single audio segment."""
    segment_id: str
    raw_text: str
    processed_text: str
    confidence: float
    language: str
    duration: float
    timestamp_start: datetime
    timestamp_end: datetime
    speaker_turn: str
    audio_file_path: Optional[str]
    word_timestamps: list
    processing_time: float


class Transcriber:
    """
    Complete transcription pipeline.

    Takes AudioSegments, runs them through Whisper STT,
    applies post-processing, and returns structured results.
    """

    def __init__(
        self,
        stt_model: WhisperSTT,
        post_processor: Optional[PostProcessor] = None,
        language: str = "en",
        min_confidence: float = 0.3,
    ):
        self.stt = stt_model
        self.post_processor = post_processor or PostProcessor()
        self.language = language
        self.min_confidence = min_confidence
        self._total_processed = 0
        self._total_time = 0.0

    def transcribe_segment(
        self, segment: AudioSegment
    ) -> Optional[TranscriptionSegment]:
        """
        Transcribe a single AudioSegment.

        Args:
            segment: AudioSegment from the audio segmenter.

        Returns:
            TranscriptionSegment or None if transcription fails/is empty.
        """
        import time
        start_time = time.time()

        try:
            # Option 1: Transcribe from saved file
            if segment.audio_file_path and os.path.exists(
                segment.audio_file_path
            ):
                result = self.stt.transcribe(
                    segment.audio_file_path,
                    language=self.language,
                )
            else:
                # Option 2: Transcribe from numpy array
                result = self.stt.transcribe_stream(
                    segment.audio_data,
                    sample_rate=segment.sample_rate,
                    language=self.language,
                )

            processing_time = time.time() - start_time

            # Filter empty or low-confidence results
            if not result.text.strip():
                logger.debug(
                    f"Empty transcription for segment {segment.id}"
                )
                return None

            if result.confidence < self.min_confidence:
                logger.warning(
                    f"Low confidence ({result.confidence:.2%}) for "
                    f"segment {segment.id}: '{result.text[:50]}'"
                )

            # Post-process text
            processed_text = self.post_processor.process(result.text)

            # Extract word timestamps
            word_timestamps = []
            for seg in result.segments:
                for word in seg.get("words", []):
                    word_timestamps.append({
                        "word": word["word"],
                        "start": word["start"],
                        "end": word["end"],
                        "probability": word["probability"],
                    })

            self._total_processed += 1
            self._total_time += processing_time

            transcription = TranscriptionSegment(
                segment_id=segment.id,
                raw_text=result.text,
                processed_text=processed_text,
                confidence=result.confidence,
                language=result.language,
                duration=result.duration,
                timestamp_start=segment.timestamp_start,
                timestamp_end=segment.timestamp_end,
                speaker_turn=segment.speaker_turn,
                audio_file_path=segment.audio_file_path,
                word_timestamps=word_timestamps,
                processing_time=processing_time,
            )

            logger.info(
                f"Transcribed [{segment.id}] "
                f"({processing_time:.2f}s, conf={result.confidence:.2%}): "
                f"'{processed_text[:80]}'"
            )

            return transcription

        except Exception as e:
            logger.error(
                f"Transcription error for segment {segment.id}: {e}",
                exc_info=True,
            )
            return None

    def transcribe_audio_file(
        self, audio_path: str
    ) -> Optional[TranscriptionResult]:
        """
        Transcribe a standalone audio file.

        Args:
            audio_path: Path to audio file.

        Returns:
            Raw TranscriptionResult from Whisper.
        """
        return self.stt.transcribe(audio_path, language=self.language)

    @property
    def stats(self) -> dict:
        """Get transcription statistics."""
        return {
            "total_processed": self._total_processed,
            "total_processing_time": round(self._total_time, 2),
            "avg_processing_time": (
                round(self._total_time / self._total_processed, 2)
                if self._total_processed > 0
                else 0.0
            ),
        }

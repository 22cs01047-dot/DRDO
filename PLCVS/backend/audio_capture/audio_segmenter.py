# audio_segmenter.py
"""
Audio Segmenter — combines AudioStream and VAD to produce
speech segments for the STT pipeline.

CHANGE: Speaker turn detection is now PRELIMINARY only.
The definitive turn detection happens post-transcription via
SpeakerTurnDetector (content-based). The gap-based detection
here serves as a fallback/initial guess and sets speaker_turn
to "UNKNOWN" when uncertain.
"""

import asyncio
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Optional, Callable, List
from datetime import datetime
from queue import Queue

import numpy as np
import soundfile as sf

from audio_capture.audio_stream import AudioStream, AudioChunk, AudioSegment
from audio_capture.vad_processor import VADProcessor, SpeechRegion

logger = logging.getLogger(__name__)


class AudioSegmenter:
    """
    Orchestrates audio capture and VAD to produce AudioSegments.

    Features:
    - Combines AudioStream + VADProcessor
    - Preliminary speaker turn guess via silence gap
      (overridden post-transcription by SpeakerTurnDetector)
    - Saves individual segments as WAV files
    - Async-compatible segment emission
    """

    def __init__(
        self,
        audio_stream: AudioStream,
        vad_processor: VADProcessor,
        output_dir: Optional[str] = None,
        turn_gap_threshold: float = 2.0,
    ):
        """
        Args:
            audio_stream: Configured AudioStream instance.
            vad_processor: Configured VADProcessor instance.
            output_dir: Directory to save segment WAV files.
            turn_gap_threshold: Seconds of silence for preliminary
                turn change detection (fallback only).
        """
        self.audio_stream = audio_stream
        self.vad = vad_processor
        self.output_dir = output_dir
        self.turn_gap_threshold = turn_gap_threshold

        # State
        self._is_running = False
        self._processing_thread: Optional[threading.Thread] = None
        self._segment_queue: Queue[AudioSegment] = Queue(maxsize=100)
        self._segment_count = 0
        self._last_segment_end: Optional[float] = None

        # CHANGE: Preliminary turn is now "UNKNOWN" by default.
        # The definitive detection happens in SessionController
        # after transcription, using SpeakerTurnDetector.
        self._current_turn = "UNKNOWN"

        # Callbacks
        self._on_segment_callback: Optional[Callable] = None

        # Session
        self._session_id: str = "default"

    def set_on_segment_callback(
        self, callback: Callable[[AudioSegment], None]
    ):
        """Set callback invoked when a speech segment is ready."""
        self._on_segment_callback = callback

    def start(self, session_id: str = "default") -> None:
        """Start the segmenter (also starts audio stream)."""
        if self._is_running:
            logger.warning("Segmenter already running.")
            return

        self._session_id = session_id
        self._segment_count = 0
        self._last_segment_end = None
        self._current_turn = "UNKNOWN"

        # Reset VAD state
        self.vad.reset_state()

        # Start audio capture
        self.audio_stream.start(session_id=session_id)

        # Start processing thread
        self._is_running = True
        self._processing_thread = threading.Thread(
            target=self._processing_loop,
            name="audio_segmenter_thread",
            daemon=True,
        )
        self._processing_thread.start()
        logger.info("Audio segmenter started.")

    def stop(self) -> None:
        """Stop the segmenter and audio stream."""
        if not self._is_running:
            return

        self._is_running = False
        self.audio_stream.stop()

        if self._processing_thread and self._processing_thread.is_alive():
            self._processing_thread.join(timeout=5.0)

        logger.info(
            f"Audio segmenter stopped. "
            f"Total segments: {self._segment_count}"
        )

    def pause(self) -> None:
        """Pause audio capture (keeps stream and processing thread alive)."""
        self.audio_stream.pause()
        logger.info("Audio segmenter paused.")

    def resume(self) -> None:
        """Resume audio capture after a pause."""
        self.audio_stream.resume()
        logger.info("Audio segmenter resumed.")

    def get_segment(self, timeout: float = 1.0) -> Optional[AudioSegment]:
        """Get next processed segment from queue."""
        try:
            return self._segment_queue.get(timeout=timeout)
        except Exception:
            return None

    def get_segment_queue(self) -> Queue:
        """Direct access to segment queue."""
        return self._segment_queue

    def _processing_loop(self) -> None:
        """Main loop: read audio chunks → VAD → emit segments."""
        logger.debug("Segmenter processing loop started.")

        while self._is_running:
            chunk = self.audio_stream.get_chunk(timeout=0.5)
            if chunk is None:
                continue

            # Process through VAD
            speech_region = self.vad.process_chunk(
                chunk.data, chunk.timestamp
            )

            if speech_region is not None:
                segment = self._create_segment(speech_region)
                if segment is not None:
                    self._emit_segment(segment)

        logger.debug("Segmenter processing loop ended.")

    def _create_segment(self, region: SpeechRegion) -> Optional[AudioSegment]:
        """Convert a SpeechRegion into an AudioSegment."""
        if region.duration < 0.3:
            logger.debug(
                f"Skipping short segment: {region.duration:.2f}s"
            )
            return None

        self._segment_count += 1

        # CHANGE: Preliminary speaker turn — set to "UNKNOWN".
        # The definitive turn is determined post-transcription by
        # SpeakerTurnDetector using the actual text content.
        speaker_turn = self._detect_turn_preliminary(region.start_time)

        segment_id = f"SEG_{self._session_id}_{self._segment_count:04d}"

        # Save audio file
        audio_file_path = None
        if self.output_dir:
            audio_file_path = self._save_segment_audio(
                segment_id, region.audio_data, self.audio_stream.sample_rate
            )

        segment = AudioSegment(
            id=segment_id,
            audio_data=region.audio_data,
            sample_rate=self.audio_stream.sample_rate,
            timestamp_start=datetime.fromtimestamp(region.start_time),
            timestamp_end=datetime.fromtimestamp(region.end_time),
            duration=region.duration,
            audio_file_path=audio_file_path,
            speaker_turn=speaker_turn,
        )

        self._last_segment_end = region.end_time
        return segment

    def _detect_turn_preliminary(self, current_start: float) -> str:
        """
        Preliminary speaker turn detection based on silence gap.

        CHANGE: This is now a soft hint only. Returns "UNKNOWN" more
        aggressively, leaving the definitive detection to
        SpeakerTurnDetector (content-based, post-transcription).

        The gap-based logic is preserved as a fallback for edge cases
        where text-based detection is inconclusive.
        """
        if self._last_segment_end is None:
            # First segment — leave as UNKNOWN for text-based detection
            self._current_turn = "UNKNOWN"
            return self._current_turn

        gap = current_start - self._last_segment_end

        if gap >= self.turn_gap_threshold:
            # Large gap suggests speaker change, but we don't know
            # which direction without text. Mark as UNKNOWN.
            logger.debug(
                f"Silence gap {gap:.2f}s >= {self.turn_gap_threshold}s — "
                f"possible speaker change (will be resolved post-transcription)"
            )
            self._current_turn = "UNKNOWN"
        # else: short gap, same speaker likely — keep current turn

        return self._current_turn

    def _save_segment_audio(
        self, segment_id: str, audio_data: np.ndarray, sample_rate: int
    ) -> str:
        """Save segment audio to WAV file."""
        out_dir = Path(self.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        filepath = str(out_dir / f"{segment_id}.wav")
        sf.write(filepath, audio_data, sample_rate)
        logger.debug(f"Segment audio saved: {filepath}")
        return filepath

    def _emit_segment(self, segment: AudioSegment) -> None:
        """Push segment to queue and invoke callback."""
        try:
            self._segment_queue.put_nowait(segment)
        except Exception:
            logger.warning("Segment queue full — dropping oldest.")
            try:
                self._segment_queue.get_nowait()
            except Exception:
                pass
            self._segment_queue.put_nowait(segment)

        logger.info(
            f"Segment emitted: {segment.id} | "
            f"dur={segment.duration:.2f}s | "
            f"turn={segment.speaker_turn} (preliminary)"
        )

        if self._on_segment_callback:
            try:
                self._on_segment_callback(segment)
            except Exception as e:
                logger.error(f"Segment callback error: {e}")

    @property
    def is_running(self) -> bool:
        return self._is_running

    @property
    def segment_count(self) -> int:
        return self._segment_count
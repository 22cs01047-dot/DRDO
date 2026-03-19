# vad_processor.py
"""
Voice Activity Detection (VAD) Processor using Silero VAD.

Detects speech segments in audio stream, filters silence,
and identifies speaker turns for half-duplex communication.
"""

import logging
import time
from typing import Optional, List, Tuple
from dataclasses import dataclass
from collections import deque

import numpy as np
import torch

logger = logging.getLogger(__name__)


@dataclass
class VADEvent:
    """An event from VAD processing."""
    event_type: str  # "SPEECH_START" | "SPEECH_END" | "SILENCE"
    timestamp: float
    confidence: float


@dataclass
class SpeechRegion:
    """A detected speech region."""
    start_time: float
    end_time: float
    duration: float
    audio_data: np.ndarray
    confidence: float


class VADProcessor:
    """
    Voice Activity Detection using Silero VAD.

    Features:
    - Frame-level speech/silence detection
    - Configurable thresholds for sensitivity tuning
    - Speech padding to avoid clipping
    - Half-duplex turn detection via silence gaps
    """

    def __init__(
        self,
        threshold: float = 0.5,
        min_speech_duration_ms: int = 250,
        max_speech_duration_s: float = 30.0,
        min_silence_duration_ms: int = 600,
        speech_pad_ms: int = 200,
        sample_rate: int = 16000,
        model_path: Optional[str] = None,
    ):
        self.threshold = threshold
        self.min_speech_duration_ms = min_speech_duration_ms
        self.max_speech_duration_s = max_speech_duration_s
        self.min_silence_duration_ms = min_silence_duration_ms
        self.speech_pad_ms = speech_pad_ms
        self.sample_rate = sample_rate
        self.model_path = model_path

        # Model
        self._model = None
        self._model_loaded = False

        # State for streaming VAD
        self._is_speaking = False
        self._speech_start_time: Optional[float] = None
        self._speech_buffer: List[np.ndarray] = []
        self._silence_counter: float = 0.0
        self._speech_counter: float = 0.0

        # Pre-speech padding buffer (ring buffer)
        pad_samples = int(self.speech_pad_ms * self.sample_rate / 1000)
        self._pad_buffer: deque = deque(maxlen=max(pad_samples // 512, 5))

        # Completed speech segments
        self._completed_segments: List[SpeechRegion] = []

    def load_model(self) -> None:
        """Load Silero VAD model."""
        logger.info("Loading Silero VAD model...")

        try:
            if self.model_path:
                self._model = torch.jit.load(self.model_path)
                self._model.eval()
            else:
                self._model, _ = torch.hub.load(
                    repo_or_dir="snakers4/silero-vad",
                    model="silero_vad",
                    force_reload=False,
                    trust_repo=True,
                )

            self._model_loaded = True
            logger.info("Silero VAD model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load VAD model: {e}")
            logger.warning("Falling back to energy-based VAD.")
            self._model_loaded = False

    def reset_state(self) -> None:
        """Reset streaming state for new session."""
        self._is_speaking = False
        self._speech_start_time = None
        self._speech_buffer.clear()
        self._silence_counter = 0.0
        self._speech_counter = 0.0
        self._pad_buffer.clear()
        self._completed_segments.clear()

        if self._model is not None and hasattr(self._model, "reset_states"):
            self._model.reset_states()

        logger.debug("VAD state reset.")

    def process_chunk(
        self,
        audio_chunk: np.ndarray,
        timestamp: float,
    ) -> Optional[SpeechRegion]:
        """
        Process a single audio chunk through VAD.

        Args:
            audio_chunk: Float32 numpy array, normalized to [-1, 1].
            timestamp: Timestamp of this chunk.

        Returns:
            SpeechRegion if a complete speech segment was detected, else None.
        """
        if self._model_loaded and self._model is not None:
            speech_prob = self._get_speech_probability(audio_chunk)
        else:
            speech_prob = self._energy_vad(audio_chunk)

        chunk_duration = len(audio_chunk) / self.sample_rate

        if speech_prob >= self.threshold:
            # Speech detected
            self._silence_counter = 0.0
            self._speech_counter += chunk_duration

            if not self._is_speaking:
                # Speech just started
                min_speech_s = self.min_speech_duration_ms / 1000.0
                if self._speech_counter >= min_speech_s:
                    self._is_speaking = True
                    self._speech_start_time = timestamp - self._speech_counter
                    # Add padding buffer
                    for pad_chunk in self._pad_buffer:
                        self._speech_buffer.append(pad_chunk)
                    logger.debug(
                        f"Speech started at {self._speech_start_time:.2f}"
                    )

            if self._is_speaking:
                self._speech_buffer.append(audio_chunk)

                # Check max duration
                total_duration = sum(
                    len(c) / self.sample_rate for c in self._speech_buffer
                )
                if total_duration >= self.max_speech_duration_s:
                    logger.warning(
                        f"Max speech duration reached ({total_duration:.1f}s). "
                        f"Forcing segment end."
                    )
                    return self._finalize_segment(timestamp)

        else:
            # Silence detected
            self._silence_counter += chunk_duration

            if not self._is_speaking:
                self._speech_counter = 0.0

            if self._is_speaking:
                self._speech_buffer.append(audio_chunk)

                min_silence_s = self.min_silence_duration_ms / 1000.0
                if self._silence_counter >= min_silence_s:
                    # Speech ended — finalize segment
                    return self._finalize_segment(timestamp)

        # Store in padding buffer
        self._pad_buffer.append(audio_chunk.copy())

        return None

    def _get_speech_probability(self, audio_chunk: np.ndarray) -> float:
        """Get speech probability from Silero VAD model."""
        try:
            # Silero VAD expects specific chunk sizes (512 for 16kHz)
            tensor = torch.from_numpy(audio_chunk).float()

            if len(tensor) < 512:
                tensor = torch.nn.functional.pad(
                    tensor, (0, 512 - len(tensor))
                )

            # Process in 512-sample windows
            probs = []
            for i in range(0, len(tensor) - 511, 512):
                window = tensor[i : i + 512]
                prob = self._model(window, self.sample_rate).item()
                probs.append(prob)

            return max(probs) if probs else 0.0

        except Exception as e:
            logger.warning(f"Silero VAD error: {e}. Using energy fallback.")
            return self._energy_vad(audio_chunk)

    @staticmethod
    def _energy_vad(audio_chunk: np.ndarray, threshold: float = 0.01) -> float:
        """Simple energy-based VAD fallback."""
        energy = np.sqrt(np.mean(audio_chunk ** 2))
        if energy > threshold:
            return min(energy / (threshold * 5), 1.0)
        return 0.0

    def _finalize_segment(self, end_timestamp: float) -> SpeechRegion:
        """Finalize a speech segment and return it."""
        if not self._speech_buffer:
            self.reset_state()
            return None

        # Concatenate all buffered audio
        full_audio = np.concatenate(self._speech_buffer)
        duration = len(full_audio) / self.sample_rate

        start_time = self._speech_start_time or (end_timestamp - duration)

        segment = SpeechRegion(
            start_time=start_time,
            end_time=end_timestamp,
            duration=duration,
            audio_data=full_audio,
            confidence=1.0,
        )

        logger.info(
            f"Speech segment finalized: {duration:.2f}s "
            f"({start_time:.2f} → {end_timestamp:.2f})"
        )

        self._completed_segments.append(segment)

        # Reset for next segment
        self._is_speaking = False
        self._speech_start_time = None
        self._speech_buffer.clear()
        self._silence_counter = 0.0
        self._speech_counter = 0.0

        if self._model is not None and hasattr(self._model, "reset_states"):
            self._model.reset_states()

        return segment

    def get_completed_segments(self) -> List[SpeechRegion]:
        """Get all completed speech segments."""
        return list(self._completed_segments)

    @property
    def is_speaking(self) -> bool:
        return self._is_speaking

    @property
    def model_loaded(self) -> bool:
        return self._model_loaded

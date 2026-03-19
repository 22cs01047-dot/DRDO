# whisper_model.py
"""
Whisper STT Model Wrapper
Uses Faster-Whisper for efficient local inference
"""

import os
import logging
from pathlib import Path
from typing import Optional, List, Tuple
from dataclasses import dataclass

from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionResult:
    """Result of a single transcription"""
    text: str
    confidence: float
    language: str
    segments: List[dict]
    duration: float


class WhisperSTT:
    """
    Wrapper around Faster-Whisper for offline speech-to-text.
    
    Supports:
    - Multiple model sizes (tiny, base, small, medium, large-v3, large-v3-turbo)
    - GPU and CPU inference
    - Custom vocabulary via initial_prompt
    - VAD-filtered transcription
    """

    def __init__(
        self,
        model_size: str = "large-v3-turbo",
        device: str = "auto",  # "auto", "cuda", "cpu"
        compute_type: str = "float16",  # "float16", "int8", "int8_float16"
        model_path: Optional[str] = None,
        cpu_threads: int = 4,
        num_workers: int = 1,
    ):
        """
        Initialize Whisper model.
        
        Args:
            model_size: Whisper model variant
            device: Inference device
            compute_type: Quantization type
            model_path: Custom model directory path
            cpu_threads: Number of CPU threads
            num_workers: Number of transcription workers
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None
        self.model_path = model_path
        self.cpu_threads = cpu_threads
        self.num_workers = num_workers

        # Custom vocabulary for military/launch terminology
        self.domain_prompt = self._build_domain_prompt()

    def _build_domain_prompt(self) -> str:
        """Build initial prompt with domain-specific vocabulary"""
        return (
            "Pre-launch checklist verification. "
            "Military radio communication. "
            "Terms: fuel pressure, oxidizer, propellant, INS alignment, "
            "telemetry, guidance system, gyroscope, accelerometer, "
            "range safety, trajectory, countdown, nominal, affirmative, "
            "negative, confirmed, abort, hold, resume, go no-go, "
            "ignition sequence, umbilical disconnect, "
            "launch pad, radar tracking, flight termination system."
        )

    def load_model(self) -> None:
        """Load the Whisper model into memory"""
        logger.info(f"Loading Whisper model: {self.model_size}")
        logger.info(f"Device: {self.device}, Compute: {self.compute_type}")

        try:
            model_source = self.model_path if self.model_path else self.model_size

            self.model = WhisperModel(
                model_source,
                device=self.device if self.device != "auto" else "cuda",
                compute_type=self.compute_type,
                cpu_threads=self.cpu_threads,
                num_workers=self.num_workers,
            )
            logger.info("Whisper model loaded successfully")

        except Exception as e:
            logger.warning(f"GPU loading failed: {e}. Falling back to CPU.")
            self.model = WhisperModel(
                model_source,
                device="cpu",
                compute_type="int8",
                cpu_threads=self.cpu_threads,
            )
            logger.info("Whisper model loaded on CPU")

    def transcribe(
        self,
        audio_path: str,
        language: str = "en",
        beam_size: int = 5,
        best_of: int = 5,
        temperature: float = 0.0,
        vad_filter: bool = True,
        vad_parameters: Optional[dict] = None,
        initial_prompt: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe an audio file.
        
        Args:
            audio_path: Path to audio file (WAV, MP3, etc.)
            language: Language code
            beam_size: Beam search size
            best_of: Number of candidates
            temperature: Sampling temperature (0 = greedy)
            vad_filter: Enable VAD filtering
            vad_parameters: Custom VAD parameters
            initial_prompt: Custom prompt (overrides domain prompt)
            
        Returns:
            TranscriptionResult with text, confidence, and segments
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        prompt = initial_prompt or self.domain_prompt

        default_vad_params = {
            "threshold": 0.5,
            "min_speech_duration_ms": 250,
            "max_speech_duration_s": 30,
            "min_silence_duration_ms": 500,
            "speech_pad_ms": 200,
        }

        if vad_parameters:
            default_vad_params.update(vad_parameters)

        logger.info(f"Transcribing: {audio_path}")

        segments_gen, info = self.model.transcribe(
            audio_path,
            language=language,
            beam_size=beam_size,
            best_of=best_of,
            temperature=temperature,
            vad_filter=vad_filter,
            vad_parameters=default_vad_params if vad_filter else None,
            initial_prompt=prompt,
            condition_on_previous_text=True,
            word_timestamps=True,
        )

        segments_list = []
        full_text_parts = []
        total_confidence = 0.0
        segment_count = 0

        for segment in segments_gen:
            seg_data = {
                "id": segment.id,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "avg_logprob": segment.avg_logprob,
                "no_speech_prob": segment.no_speech_prob,
                "confidence": self._logprob_to_confidence(segment.avg_logprob),
                "words": [],
            }

            if segment.words:
                for word in segment.words:
                    seg_data["words"].append({
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability,
                    })

            segments_list.append(seg_data)
            full_text_parts.append(segment.text.strip())
            total_confidence += seg_data["confidence"]
            segment_count += 1

        avg_confidence = total_confidence / max(segment_count, 1)

        result = TranscriptionResult(
            text=" ".join(full_text_parts),
            confidence=round(avg_confidence, 4),
            language=info.language,
            segments=segments_list,
            duration=info.duration,
        )

        logger.info(
            f"Transcription complete. "
            f"Text: '{result.text[:100]}...' "
            f"Confidence: {result.confidence:.2%} "
            f"Duration: {result.duration:.1f}s"
        )

        return result

    def transcribe_stream(
        self,
        audio_array,
        sample_rate: int = 16000,
        **kwargs,
    ) -> TranscriptionResult:
        """
        Transcribe from numpy audio array (for real-time processing).
        
        Args:
            audio_array: numpy array of audio samples
            sample_rate: Audio sample rate
            
        Returns:
            TranscriptionResult
        """
        import tempfile
        import soundfile as sf

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            sf.write(tmp.name, audio_array, sample_rate)
            result = self.transcribe(tmp.name, **kwargs)
            os.unlink(tmp.name)

        return result

    @staticmethod
    def _logprob_to_confidence(avg_logprob: float) -> float:
        """Convert average log probability to confidence score (0-1)"""
        import math
        confidence = math.exp(avg_logprob)
        return min(max(confidence, 0.0), 1.0)

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None

    def get_model_info(self) -> dict:
        """Get model metadata"""
        return {
            "model_size": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "loaded": self.is_loaded(),
            "domain_prompt": self.domain_prompt,
        }
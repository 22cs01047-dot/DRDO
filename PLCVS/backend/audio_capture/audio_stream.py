# audio_stream.py
"""
Real-time audio capture from system audio input device.

Captures audio in chunks, feeds to VAD, and emits speech segments
to a processing queue.
"""

import os
import wave
import time
import logging
import threading
import queue
from pathlib import Path
from typing import Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class AudioChunk:
    """A chunk of captured audio data."""
    data: np.ndarray
    timestamp: float
    sample_rate: int
    channels: int


@dataclass
class AudioSegment:
    """A complete speech segment (after VAD processing)."""
    id: str
    audio_data: np.ndarray
    sample_rate: int
    timestamp_start: datetime
    timestamp_end: datetime
    duration: float
    audio_file_path: Optional[str] = None
    speaker_turn: str = "UNKNOWN"  # QUESTIONER | RESPONDER | UNKNOWN


class AudioStream:
    """
    Manages real-time audio capture from a system audio device.

    Features:
    - Captures audio in configurable chunks
    - Thread-safe audio queue for downstream processing
    - Records raw audio to files for audit trail
    - Start/stop/pause controls
    - Device enumeration and selection
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        channels: int = 1,
        chunk_size: int = 1024,
        device_index: Optional[int] = None,
        recording_dir: Optional[str] = None,
        recording_enabled: bool = True,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.chunk_size = chunk_size
        self.device_index = device_index
        self.recording_dir = recording_dir
        self.recording_enabled = recording_enabled

        # State
        self._is_running = False
        self._is_paused = False
        self._capture_thread: Optional[threading.Thread] = None
        self._audio_queue: queue.Queue[AudioChunk] = queue.Queue(maxsize=500)
        self._lock = threading.Lock()

        # PyAudio instance (lazy init)
        self._pa = None
        self._stream = None

        # FIX: Initialize recording attributes in __init__ so they
        # always exist. Previously these were only set inside
        # _start_recording(), causing AttributeError when
        # recording_enabled=False but _capture_loop referenced them.
        self._wave_file = None
        self._current_recording_path: Optional[str] = None

        # Callbacks
        self._on_chunk_callback: Optional[Callable] = None

    def _init_pyaudio(self):
        """Lazy-initialize PyAudio."""
        if self._pa is None:
            import pyaudio
            self._pa = pyaudio.PyAudio()

    def list_devices(self) -> list:
        """List available audio input devices."""
        self._init_pyaudio()
        devices = []
        for i in range(self._pa.get_device_count()):
            info = self._pa.get_device_info_by_index(i)
            if info["maxInputChannels"] > 0:
                devices.append({
                    "index": i,
                    "name": info["name"],
                    "channels": info["maxInputChannels"],
                    "sample_rate": int(info["defaultSampleRate"]),
                    "is_default": (
                        i == self._pa.get_default_input_device_info()["index"]
                    ),
                })
        return devices

    def start(self, session_id: str = "default") -> None:
        """Start audio capture."""
        if self._is_running:
            logger.warning("Audio stream already running.")
            return

        self._init_pyaudio()

        logger.info(
            f"Starting audio capture: "
            f"rate={self.sample_rate}, channels={self.channels}, "
            f"chunk={self.chunk_size}, device={self.device_index}"
        )

        # Setup recording file
        if self.recording_enabled and self.recording_dir:
            self._start_recording(session_id)

        # Open audio stream
        import pyaudio
        try:
            self._stream = self._pa.open(
                format=pyaudio.paInt16,
                channels=self.channels,
                rate=self.sample_rate,
                input=True,
                input_device_index=self.device_index,
                frames_per_buffer=self.chunk_size,
            )
        except Exception as e:
            logger.error(f"Failed to open audio device: {e}")
            raise RuntimeError(
                f"Cannot open audio device (index={self.device_index}). "
                f"Available devices: {self.list_devices()}"
            ) from e

        self._is_running = True
        self._is_paused = False

        # Start capture thread
        self._capture_thread = threading.Thread(
            target=self._capture_loop,
            name="audio_capture_thread",
            daemon=True,
        )
        self._capture_thread.start()
        logger.info("Audio capture started.")

    def stop(self) -> Optional[str]:
        """
        Stop audio capture.

        Returns:
            Path to the recorded audio file, or None.
        """
        if not self._is_running:
            return None

        logger.info("Stopping audio capture...")
        self._is_running = False

        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=5.0)

        if self._stream:
            try:
                self._stream.stop_stream()
                self._stream.close()
            except Exception as e:
                logger.warning(f"Error closing audio stream: {e}")
            self._stream = None

        recording_path = self._stop_recording()
        logger.info("Audio capture stopped.")
        return recording_path

    def pause(self) -> None:
        """Pause audio capture (keeps stream open)."""
        with self._lock:
            self._is_paused = True
        logger.info("Audio capture paused.")

    def resume(self) -> None:
        """Resume audio capture."""
        with self._lock:
            self._is_paused = False
        logger.info("Audio capture resumed.")

    def get_chunk(self, timeout: float = 1.0) -> Optional[AudioChunk]:
        """
        Get the next audio chunk from the queue.

        Args:
            timeout: Max seconds to wait.

        Returns:
            AudioChunk or None if queue is empty/timeout.
        """
        try:
            return self._audio_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def get_queue(self) -> queue.Queue:
        """Get the raw audio chunk queue for direct access."""
        return self._audio_queue

    def set_on_chunk_callback(self, callback: Callable[[AudioChunk], None]):
        """Set a callback invoked for every captured audio chunk."""
        self._on_chunk_callback = callback

    @property
    def is_running(self) -> bool:
        return self._is_running

    @property
    def is_paused(self) -> bool:
        return self._is_paused

    @property
    def queue_size(self) -> int:
        return self._audio_queue.qsize()

    def _capture_loop(self) -> None:
        """Main capture loop running in a separate thread."""
        logger.debug("Audio capture loop started.")

        while self._is_running:
            with self._lock:
                if self._is_paused:
                    time.sleep(0.05)
                    continue

            try:
                raw_data = self._stream.read(
                    self.chunk_size, exception_on_overflow=False
                )
                audio_array = np.frombuffer(raw_data, dtype=np.int16).astype(
                    np.float32
                ) / 32768.0

                chunk = AudioChunk(
                    data=audio_array,
                    timestamp=time.time(),
                    sample_rate=self.sample_rate,
                    channels=self.channels,
                )

                # Write to recording file (FIX: _wave_file is always
                # defined now, so this check is safe even when
                # recording is disabled)
                if self._wave_file:
                    self._wave_file.writeframes(raw_data)

                # Add to queue (non-blocking)
                try:
                    self._audio_queue.put_nowait(chunk)
                except queue.Full:
                    # Drop oldest chunk
                    try:
                        self._audio_queue.get_nowait()
                    except queue.Empty:
                        pass
                    self._audio_queue.put_nowait(chunk)
                    logger.warning("Audio queue full — dropping oldest chunk.")

                # Invoke callback
                if self._on_chunk_callback:
                    try:
                        self._on_chunk_callback(chunk)
                    except Exception as e:
                        logger.error(f"Chunk callback error: {e}")

            except IOError as e:
                logger.warning(f"Audio read overflow: {e}")
                time.sleep(0.01)
            except Exception as e:
                logger.error(f"Audio capture error: {e}")
                time.sleep(0.1)

        logger.debug("Audio capture loop ended.")

    def _start_recording(self, session_id: str) -> None:
        """Start recording raw audio to a WAV file."""
        rec_dir = Path(self.recording_dir)
        rec_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"raw_audio_{session_id}_{timestamp}.wav"
        self._current_recording_path = str(rec_dir / filename)

        self._wave_file = wave.open(self._current_recording_path, "wb")
        self._wave_file.setnchannels(self.channels)
        self._wave_file.setsampwidth(2)  # 16-bit = 2 bytes
        self._wave_file.setframerate(self.sample_rate)

        logger.info(f"Recording to: {self._current_recording_path}")

    def _stop_recording(self) -> Optional[str]:
        """Stop recording and close the WAV file."""
        if self._wave_file:
            try:
                self._wave_file.close()
            except Exception as e:
                logger.warning(f"Error closing recording file: {e}")
            self._wave_file = None

        path = self._current_recording_path
        self._current_recording_path = None

        if path:
            logger.info(f"Recording saved: {path}")
        return path

    def cleanup(self) -> None:
        """Release all resources."""
        self.stop()
        if self._pa:
            self._pa.terminate()
            self._pa = None
        logger.info("Audio stream resources released.")
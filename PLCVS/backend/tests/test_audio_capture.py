"""Unit tests for audio capture module."""

import numpy as np
import pytest
from audio_capture.vad_processor import VADProcessor
from audio_capture.audio_stream import AudioStream, AudioChunk

class TestVADProcessor:
    """Tests for VAD processor."""
    def setup_method(self):
        self.vad = VADProcessor(
            threshold=0.5,
            min_speech_duration_ms=200,
            min_silence_duration_ms=500,
            sample_rate=16000,
        )
        # Use energy-based VAD (no model required for testing)
        self.vad._model_loaded = False
    
    def test_silence_detection(self):
        """Silent audio should not trigger speech."""
        silence = np.zeros(1024, dtype=np.float32)
        result = self.vad.process_chunk(silence, 0.0)
        assert result is None
        assert not self.vad.is_speaking

    def test_speech_detection(self):
        """Loud audio should trigger speech detection."""
        # Generate a tone (speech-like)
        t = np.linspace(0, 0.064, 1024)
        speech = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

        # Feed several chunks to exceed min duration
        for i in range(10):
            self.vad.process_chunk(speech, i * 0.064)

        assert self.vad.is_speaking
    
    def test_speech_segment_completion(self):
        """Speech followed by silence should produce a segment."""
        t = np.linspace(0, 0.064, 1024)
        speech = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        silence = np.zeros(1024, dtype=np.float32)

        # Feed speech
        for i in range(15):
            self.vad.process_chunk(speech, i * 0.064)

        # Feed silence
        result = None
        for i in range(20):
            r = self.vad.process_chunk(silence, (15 + i) * 0.064)
            if r is not None:
                result = r
                break

        assert result is not None
        assert result.duration > 0

    def test_reset_state(self):
        """Reset should clear all state."""
        self.vad._is_speaking = True
        self.vad._speech_buffer = [np.zeros(100)]
        self.vad.reset_state()
        assert not self.vad.is_speaking
        assert len(self.vad._speech_buffer) == 0

    def test_energy_vad_fallback(self):
        """Energy-based VAD should work as fallback."""
        speech = np.random.randn(1024).astype(np.float32) * 0.1
        prob = VADProcessor._energy_vad(speech, threshold=0.01)
        assert prob > 0
    
    
class TestAudioStream:
    """Tests for audio stream (no actual device needed)."""

    def test_initialization(self):
        stream = AudioStream(
            sample_rate=16000,
            channels=1,
            chunk_size=1024,
        )
        assert stream.sample_rate == 16000
        assert not stream.is_running

    def test_queue_management(self):
        stream = AudioStream()
        chunk = AudioChunk(
            data=np.zeros(1024, dtype=np.float32),
            timestamp=0.0,
            sample_rate=16000,
            channels=1,
        )
        stream._audio_queue.put(chunk)
        assert stream.queue_size == 1
        result = stream.get_chunk(timeout=0.1)
        assert result is not None



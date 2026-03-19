"""Unit tests for STT engine."""

import pytest
from stt_engine.post_processor import PostProcessor


class TestPostProcessor:
    """Tests for text post-processing."""

    def setup_method(self):
        self.processor = PostProcessor()

    def test_filler_removal(self):
        text = "uh fuel pressure um is nominal"
        result = self.processor.process(text)
        assert "uh" not in result
        assert "um" not in result
        assert "fuel pressure" in result
        assert "nominal" in result

    def test_domain_corrections(self):
        text = "the gyrascope calibration is complete"
        result = self.processor.process(text)
        assert "gyroscope" in result

    def test_repeated_words(self):
        text = "fuel fuel pressure is is nominal"
        result = self.processor.process(text)
        # Should remove consecutive duplicates
        assert result.count("fuel") == 1

    def test_whitespace_normalization(self):
        text = "  fuel   pressure    nominal  "
        result = self.processor.process(text)
        assert "  " not in result
        assert result == "fuel pressure nominal"

    def test_empty_input(self):
        assert self.processor.process("") == ""
        assert self.processor.process("   ") == ""

    def test_number_normalization(self):
        text = "reading is twenty five"
        result = self.processor.process(text)
        assert "20" in result or "25" in result

    def test_punctuation_cleanup(self):
        text = "...fuel pressure, confirmed..."
        result = self.processor.process(text)
        assert not result.startswith(".")
        assert not result.endswith(".")

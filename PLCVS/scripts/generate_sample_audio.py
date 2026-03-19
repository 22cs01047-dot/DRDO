#!/usr/bin/env python3
"""
Generate realistic sample audio for PLCVS testing — Indian English accent, MP3 output.

Creates synthetic half-duplex radio conversations using TTS (espeak-ng or gTTS)
that match the checklist_config.yaml items.

Usage:
    pip install pydub numpy pyyaml
    sudo apt install ffmpeg espeak-ng

    python scripts/generate_sample_audio.py
    python scripts/generate_sample_audio.py --engine gtts
    python scripts/generate_sample_audio.py --engine espeak
    python scripts/generate_sample_audio.py --accent american   # override accent

Output:
    data/sample_audio/
    ├── full_conversation.mp3
    ├── full_conversation_noisy.mp3
    ├── stage_01_propulsion.mp3
    ├── stage_02_guidance.mp3
    ├── individual/
    │   ├── CI_001_fuel_pressure.mp3
    │   └── ...
    └── conversation_script.txt
"""

import os
import sys
import json
import logging
import argparse
import tempfile
import wave
from pathlib import Path
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass, field

import numpy as np
import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── Paths ──────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
SAMPLE_DIR = PROJECT_ROOT / "data" / "sample_audio3"
INDIVIDUAL_DIR = SAMPLE_DIR / "individual"
CONFIG_PATH = PROJECT_ROOT / "config" / "checklist_config.yaml"
SAMPLE_RATE = 16000

# ─── Accent Configuration ──────────────────────────────────────

ACCENT_PROFILES: Dict[str, dict] = {
    "indian": {
        "espeak_voice_questioner": "en-in",       # Indian English male
        "espeak_voice_responder": "en-in+f3",     # Indian English female variant
        "espeak_speed_questioner": "140",          # Slightly slower for clarity
        "espeak_speed_responder": "150",
        "espeak_pitch_questioner": "35",
        "espeak_pitch_responder": "50",
        "gtts_tld": "co.in",                      # Google India domain
        "gtts_lang": "en",
        "description": "Indian English accent",
    },
    "american": {
        "espeak_voice_questioner": "en-us",
        "espeak_voice_responder": "en-us+f3",
        "espeak_speed_questioner": "155",
        "espeak_speed_responder": "165",
        "espeak_pitch_questioner": "40",
        "espeak_pitch_responder": "55",
        "gtts_tld": "com",
        "gtts_lang": "en",
        "description": "American English accent",
    },
    "british": {
        "espeak_voice_questioner": "en-gb",
        "espeak_voice_responder": "en-gb+f3",
        "espeak_speed_questioner": "150",
        "espeak_speed_responder": "160",
        "espeak_pitch_questioner": "38",
        "espeak_pitch_responder": "52",
        "gtts_tld": "co.uk",
        "gtts_lang": "en",
        "description": "British English accent",
    },
}

# ─── Data Structures ───────────────────────────────────────────


@dataclass
class ConversationTurn:
    """A single turn in the half-duplex conversation."""
    speaker: str
    text: str
    item_id: str = ""
    item_name: str = ""
    stage_id: str = ""
    pause_after: float = 1.5


@dataclass
class ConversationScript:
    """Complete conversation script for a mission checklist."""
    mission_name: str
    turns: List[ConversationTurn] = field(default_factory=list)
    total_items: int = 0


# ─── Script Generator ──────────────────────────────────────────


def load_checklist_config(config_path: Path) -> dict:
    """Load and parse the checklist YAML config."""
    if not config_path.exists():
        logger.error(f"Config not found: {config_path}")
        sys.exit(1)

    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    logger.info(
        f"Loaded config: {config['mission']['name']} "
        f"({len(config['stages'])} stages)"
    )
    return config


def generate_conversation_script(config: dict) -> ConversationScript:
    """
    Generate a realistic half-duplex radio conversation script
    from the checklist config.
    """
    mission = config["mission"]
    script = ConversationScript(
        mission_name=mission["name"],
        total_items=0,
    )

    # Opening call
    script.turns.append(ConversationTurn(
        speaker="QUESTIONER",
        text=(
            f"All stations, this is Launch Control. "
            f"Commencing pre-launch verification for {mission['name']}. "
            f"All stations report status on my call."
        ),
        pause_after=3.0,
    ))

    script.turns.append(ConversationTurn(
        speaker="RESPONDER",
        text="Launch Control, all stations standing by. Ready for verification.",
        pause_after=2.5,
    ))

    for stage in config["stages"]:
        stage_id = stage["id"]
        stage_name = stage["name"]

        # Stage announcement
        script.turns.append(ConversationTurn(
            speaker="QUESTIONER",
            text=(
                f"Beginning Stage {stage['order']}: {stage_name}. "
                f"All stations report."
            ),
            stage_id=stage_id,
            pause_after=2.0,
        ))

        for item in stage["checklist_items"]:
            item_id = item["id"]
            item_name = item["name"]
            script.total_items += 1

            question_variants = [
                f"{item_name}. Report status.",
                f"Report {item_name} status.",
                f"{item_name}. What is your status?",
                f"Station, report {item_name}.",
            ]
            q_idx = script.total_items % len(question_variants)

            script.turns.append(ConversationTurn(
                speaker="QUESTIONER",
                text=question_variants[q_idx],
                item_id=item_id,
                item_name=item_name,
                stage_id=stage_id,
                pause_after=1.5,
            ))

            positive_responses = item.get("expected_responses", {}).get(
                "positive", ["confirmed"]
            )
            primary_response = positive_responses[0]
            confirmation = (
                positive_responses[1]
                if len(positive_responses) > 1
                else "confirmed"
            )

            response_variants = [
                f"{item_name} is {primary_response}. {confirmation.capitalize()}.",
                f"{item_name}, {primary_response}. I confirm, {item_name} is good.",
                f"Roger, {item_name} {primary_response}. Confirmed.",
                f"{item_name} verified. Status is {primary_response}. Confirmed.",
            ]
            r_idx = script.total_items % len(response_variants)

            script.turns.append(ConversationTurn(
                speaker="RESPONDER",
                text=response_variants[r_idx],
                item_id=item_id,
                item_name=item_name,
                stage_id=stage_id,
                pause_after=2.0,
            ))

        script.turns.append(ConversationTurn(
            speaker="QUESTIONER",
            text=(
                f"Stage {stage['order']}: {stage_name} verification complete. "
                f"Moving to next stage."
            ),
            stage_id=stage_id,
            pause_after=2.5,
        ))

    script.turns.append(ConversationTurn(
        speaker="QUESTIONER",
        text=(
            "All stages verified. Pre-launch checklist is complete. "
            "All stations confirm go for launch."
        ),
        pause_after=2.0,
    ))

    script.turns.append(ConversationTurn(
        speaker="RESPONDER",
        text="All stations confirm. Go for launch. Launch authorization confirmed.",
        pause_after=1.0,
    ))

    logger.info(
        f"Generated script: {len(script.turns)} turns, "
        f"{script.total_items} checklist items"
    )
    return script


# ─── TTS Engines (with accent support) ─────────────────────────


def tts_espeak(
    text: str,
    speaker: str,
    output_path: Path,
    accent_profile: dict,
) -> bool:
    """Generate speech using espeak-ng with accent control."""
    import subprocess

    if speaker == "QUESTIONER":
        voice = accent_profile["espeak_voice_questioner"]
        speed = accent_profile["espeak_speed_questioner"]
        pitch = accent_profile["espeak_pitch_questioner"]
    else:
        voice = accent_profile["espeak_voice_responder"]
        speed = accent_profile["espeak_speed_responder"]
        pitch = accent_profile["espeak_pitch_responder"]

    try:
        # espeak-ng outputs WAV directly
        cmd = [
            "espeak-ng",
            "-v", voice,
            "-s", speed,
            "-p", pitch,
            "-w", str(output_path),
            text,
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            logger.error(f"espeak-ng error: {result.stderr}")
            return False
        return output_path.exists()
    except FileNotFoundError:
        logger.error(
            "espeak-ng not found. Install: sudo apt install espeak-ng"
        )
        return False
    except Exception as e:
        logger.error(f"espeak-ng error: {e}")
        return False


def tts_gtts(
    text: str,
    speaker: str,
    output_path: Path,
    accent_profile: dict,
) -> bool:
    """
    Generate speech using gTTS with Indian accent.

    The key trick: gTTS uses Google Translate's TTS.
    Setting tld='co.in' forces the Indian English accent.
    """
    try:
        from gtts import gTTS
    except ImportError:
        logger.error("gTTS not installed. Run: pip install gTTS")
        return False

    try:
        tts = gTTS(
            text=text,
            lang=accent_profile["gtts_lang"],
            tld=accent_profile["gtts_tld"],   # <── THIS controls accent
            slow=False,
        )

        # gTTS outputs MP3 natively
        mp3_path = output_path.with_suffix(".mp3")
        tts.save(str(mp3_path))

        # Convert MP3 → WAV for internal processing
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_mp3(str(mp3_path))
            audio = audio.set_frame_rate(SAMPLE_RATE).set_channels(1)
            audio.export(str(output_path), format="wav")
            mp3_path.unlink()
            return True
        except ImportError:
            logger.error("pydub not installed. Run: pip install pydub")
            return False

    except Exception as e:
        logger.error(f"gTTS error: {e}")
        return False


def tts_pyttsx3(
    text: str,
    speaker: str,
    output_path: Path,
    accent_profile: dict,
) -> bool:
    """Generate speech using pyttsx3 (accent depends on installed system voices)."""
    try:
        import pyttsx3
    except ImportError:
        logger.error("pyttsx3 not installed. Run: pip install pyttsx3")
        return False

    engine = pyttsx3.init()
    voices = engine.getProperty("voices")

    # Try to find an Indian English voice
    indian_voice = None
    for v in voices:
        voice_name = (v.name + " " + str(getattr(v, "languages", ""))).lower()
        if any(kw in voice_name for kw in ["india", "hindi", "en_in", "en-in"]):
            indian_voice = v
            logger.debug(f"Found Indian voice: {v.name}")
            break

    if indian_voice:
        engine.setProperty("voice", indian_voice.id)
    else:
        logger.warning(
            "No Indian English voice found in pyttsx3. "
            "Install additional voices or use espeak/gTTS instead.\n"
            "  Ubuntu: sudo apt install speech-dispatcher-espeak-ng\n"
            "  List voices: python -c \"import pyttsx3; "
            "e=pyttsx3.init(); [print(v.id, v.name) for v in e.getProperty('voices')]\""
        )
        if len(voices) > 0:
            engine.setProperty("voice", voices[0].id)

    if speaker == "QUESTIONER":
        engine.setProperty("rate", 140)
    else:
        engine.setProperty("rate", 150)

    engine.setProperty("volume", 0.9)
    engine.save_to_file(text, str(output_path))
    engine.runAndWait()
    engine.stop()

    return output_path.exists()


# ─── Audio Processing ──────────────────────────────────────────


def read_wav_to_numpy(wav_path: Path) -> Tuple[np.ndarray, int]:
    """Read a WAV file and return (samples, sample_rate) as float32."""
    try:
        import soundfile as sf
        data, sr = sf.read(str(wav_path), dtype="float32")
        if len(data.shape) > 1:
            data = data[:, 0]
        return data, sr
    except ImportError:
        with wave.open(str(wav_path), "rb") as wf:
            sr = wf.getframerate()
            n_frames = wf.getnframes()
            n_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            raw = wf.readframes(n_frames)

        if sample_width == 2:
            samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        elif sample_width == 4:
            samples = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
        else:
            samples = np.frombuffer(raw, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0

        if n_channels > 1:
            samples = samples[::n_channels]

        return samples, sr


def write_wav_internal(path: Path, audio: np.ndarray, sample_rate: int = SAMPLE_RATE):
    """Write float32 numpy array to WAV (internal intermediate format)."""
    audio_int16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_int16.tobytes())


def write_mp3(
    path: Path,
    audio: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
    bitrate: str = "128k",
):
    """
    Write float32 numpy array to MP3 using pydub + ffmpeg.

    Args:
        path: Output .mp3 file path
        audio: Float32 numpy array [-1.0, 1.0]
        sample_rate: Sample rate
        bitrate: MP3 bitrate (64k, 128k, 192k, 256k, 320k)
    """
    from pydub import AudioSegment

    # Convert float32 → int16 bytes
    audio_int16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)

    # Create pydub AudioSegment from raw bytes
    segment = AudioSegment(
        data=audio_int16.tobytes(),
        sample_width=2,           # 16-bit = 2 bytes
        frame_rate=sample_rate,
        channels=1,
    )

    # Export as MP3
    segment.export(
        str(path),
        format="mp3",
        bitrate=bitrate,
        parameters=["-q:a", "2"],  # High quality VBR
    )


def save_audio(
    path: Path,
    audio: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
    output_format: str = "mp3",
    bitrate: str = "128k",
):
    """
    Save audio in the requested format.

    Args:
        path: Output path (extension will be corrected automatically)
        audio: Float32 numpy array
        sample_rate: Sample rate
        output_format: 'mp3' or 'wav'
        bitrate: MP3 bitrate
    """
    # Ensure correct extension
    path = path.with_suffix(f".{output_format}")

    if output_format == "mp3":
        write_mp3(path, audio, sample_rate, bitrate)
    else:
        write_wav_internal(path, audio, sample_rate)

    return path


def resample_audio(
    audio: np.ndarray, orig_sr: int, target_sr: int
) -> np.ndarray:
    """Simple resample by linear interpolation."""
    if orig_sr == target_sr:
        return audio
    ratio = target_sr / orig_sr
    n_samples = int(len(audio) * ratio)
    indices = np.linspace(0, len(audio) - 1, n_samples)
    return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)


def generate_silence(
    duration: float, sample_rate: int = SAMPLE_RATE
) -> np.ndarray:
    return np.zeros(int(sample_rate * duration), dtype=np.float32)


def generate_radio_noise(
    duration: float,
    sample_rate: int = SAMPLE_RATE,
    amplitude: float = 0.015,
) -> np.ndarray:
    """Generate realistic radio static/hiss."""
    n = int(sample_rate * duration)
    noise = np.random.randn(n).astype(np.float32) * amplitude

    t = np.linspace(0, duration, n, endpoint=False)
    rumble = np.sin(2 * np.pi * 50 * t) * amplitude * 0.3
    crackle_mask = np.random.random(n) > 0.998
    crackle = crackle_mask.astype(np.float32) * np.random.randn(n) * amplitude * 5

    return (noise + rumble + crackle).astype(np.float32)


def generate_ptt_click(sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Generate a push-to-talk click sound."""
    duration = 0.06
    n = int(sample_rate * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    click = (0.4 * np.sin(2 * np.pi * 800 * t) * np.exp(-t * 60)).astype(
        np.float32
    )
    return click


def add_radio_effect(
    audio: np.ndarray, sample_rate: int = SAMPLE_RATE
) -> np.ndarray:
    """
    Apply radio-like audio effects:
    - Band-pass filter (300–3400 Hz)
    - Soft clipping (compression)
    - Background static
    """
    n = len(audio)
    if n == 0:
        return audio

    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)

    low_mask = freqs < 300
    high_mask = freqs > 3400
    fft[low_mask] *= 0.1
    fft[high_mask] *= 0.1

    transition_low = (freqs >= 200) & (freqs < 300)
    transition_high = (freqs > 3400) & (freqs <= 4000)
    if transition_low.sum() > 0:
        fft[transition_low] *= np.linspace(0.1, 1.0, transition_low.sum())
    if transition_high.sum() > 0:
        fft[transition_high] *= np.linspace(1.0, 0.1, transition_high.sum())

    filtered = np.fft.irfft(fft, n=n).astype(np.float32)
    filtered = np.tanh(filtered * 1.5) * 0.8

    static = generate_radio_noise(
        len(filtered) / sample_rate, sample_rate, 0.008
    )
    if len(static) > len(filtered):
        static = static[: len(filtered)]
    elif len(static) < len(filtered):
        static = np.pad(static, (0, len(filtered) - len(static)))

    return filtered + static


# ─── Main Audio Generation ──────────────────────────────────────


def generate_turn_audio(
    turn: ConversationTurn,
    tts_engine: str,
    accent_profile: dict,
    temp_dir: Path,
    turn_index: int,
) -> Optional[np.ndarray]:
    """Generate audio for a single conversation turn."""
    temp_wav = temp_dir / f"turn_{turn_index:04d}.wav"

    # Select TTS engine — all now receive accent_profile
    if tts_engine == "espeak":
        success = tts_espeak(turn.text, turn.speaker, temp_wav, accent_profile)
    elif tts_engine == "gtts":
        success = tts_gtts(turn.text, turn.speaker, temp_wav, accent_profile)
    else:
        success = tts_pyttsx3(turn.text, turn.speaker, temp_wav, accent_profile)

    if not success or not temp_wav.exists():
        logger.warning(
            f"TTS failed for turn {turn_index}: '{turn.text[:50]}...'"
        )
        return None

    audio, sr = read_wav_to_numpy(temp_wav)

    if sr != SAMPLE_RATE:
        audio = resample_audio(audio, sr, SAMPLE_RATE)

    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.7

    audio = add_radio_effect(audio, SAMPLE_RATE)

    if temp_wav.exists():
        temp_wav.unlink()

    return audio


def assemble_conversation(
    script: ConversationScript,
    tts_engine: str = "espeak",
    accent_profile: dict = None,
) -> Tuple[np.ndarray, List[dict]]:
    """Assemble the full conversation audio from the script."""
    if accent_profile is None:
        accent_profile = ACCENT_PROFILES["indian"]

    all_segments: List[np.ndarray] = []
    metadata: List[dict] = []
    current_time = 0.0

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        for i, turn in enumerate(script.turns):
            logger.info(
                f"  [{i + 1}/{len(script.turns)}] "
                f"{turn.speaker}: {turn.text[:60]}..."
            )

            # PTT click
            ptt = generate_ptt_click()
            all_segments.append(ptt)
            current_time += len(ptt) / SAMPLE_RATE

            # Generate speech
            speech = generate_turn_audio(
                turn, tts_engine, accent_profile, temp_path, i
            )

            if speech is None:
                logger.warning(f"  Using tone placeholder for turn {i}")
                freq = 440 if turn.speaker == "QUESTIONER" else 660
                duration = max(1.0, len(turn.text) * 0.05)
                t = np.linspace(
                    0, duration, int(SAMPLE_RATE * duration), endpoint=False
                )
                speech = (0.3 * np.sin(2 * np.pi * freq * t)).astype(
                    np.float32
                )

            speech_start = current_time
            all_segments.append(speech)
            current_time += len(speech) / SAMPLE_RATE

            # PTT release
            ptt_release = generate_ptt_click()
            all_segments.append(ptt_release)
            current_time += len(ptt_release) / SAMPLE_RATE

            metadata.append(
                {
                    "turn_index": i,
                    "speaker": turn.speaker,
                    "text": turn.text,
                    "item_id": turn.item_id,
                    "item_name": turn.item_name,
                    "stage_id": turn.stage_id,
                    "start_time": round(speech_start, 3),
                    "end_time": round(current_time, 3),
                    "duration": round(current_time - speech_start, 3),
                }
            )

            silence_duration = turn.pause_after
            silence = generate_radio_noise(
                silence_duration, SAMPLE_RATE, 0.005
            )
            all_segments.append(silence)
            current_time += silence_duration

    audio = np.concatenate(all_segments)
    logger.info(
        f"Assembled conversation: {len(audio) / SAMPLE_RATE:.1f}s, "
        f"{len(metadata)} turns"
    )
    return audio, metadata


def generate_stage_files(
    script: ConversationScript,
    full_audio: np.ndarray,
    metadata: List[dict],
    config: dict,
    output_format: str = "mp3",
):
    """Generate per-stage audio files."""
    for stage in config["stages"]:
        stage_id = stage["id"]
        stage_name = (
            stage["name"].lower().replace(" ", "_").replace("&", "and")
        )

        stage_meta = [m for m in metadata if m["stage_id"] == stage_id]
        if not stage_meta:
            continue

        first_idx = stage_meta[0]["turn_index"]
        if first_idx > 0:
            announcement = metadata[first_idx - 1]
            if announcement["stage_id"] == stage_id:
                stage_meta.insert(0, announcement)

        start_sample = int(stage_meta[0]["start_time"] * SAMPLE_RATE)
        end_sample = int(stage_meta[-1]["end_time"] * SAMPLE_RATE)

        start_sample = max(0, start_sample - int(0.5 * SAMPLE_RATE))
        end_sample = min(
            len(full_audio), end_sample + int(1.0 * SAMPLE_RATE)
        )

        stage_audio = full_audio[start_sample:end_sample]
        filename = f"stage_{stage['order']:02d}_{stage_name}"
        out_path = save_audio(
            SAMPLE_DIR / filename, stage_audio, output_format=output_format
        )
        logger.info(
            f"  Saved: {out_path.name} ({len(stage_audio) / SAMPLE_RATE:.1f}s)"
        )


def generate_individual_items(
    script: ConversationScript,
    full_audio: np.ndarray,
    metadata: List[dict],
    output_format: str = "mp3",
):
    """Generate per-checklist-item audio files."""
    INDIVIDUAL_DIR.mkdir(parents=True, exist_ok=True)

    for meta in metadata:
        if not meta["item_id"]:
            continue

        start_sample = int(meta["start_time"] * SAMPLE_RATE)
        end_sample = int(meta["end_time"] * SAMPLE_RATE)

        start_sample = max(0, start_sample - int(0.3 * SAMPLE_RATE))
        end_sample = min(
            len(full_audio), end_sample + int(0.5 * SAMPLE_RATE)
        )

        item_audio = full_audio[start_sample:end_sample]
        safe_name = (
            meta["item_name"].lower().replace(" ", "_").replace("/", "_")
        )
        filename = (
            f"{meta['item_id']}_{safe_name}_{meta['speaker'].lower()}"
        )
        save_audio(
            INDIVIDUAL_DIR / filename,
            item_audio,
            output_format=output_format,
        )


def save_transcript(script: ConversationScript, metadata: List[dict]):
    """Save conversation transcript and JSON metadata."""
    lines = [
        f"PLCVS Test Conversation — {script.mission_name}",
        f"Total items: {script.total_items}",
        f"Total turns: {len(script.turns)}",
        "=" * 70,
        "",
    ]

    for meta in metadata:
        timestamp = (
            f"[{meta['start_time']:07.3f}s - {meta['end_time']:07.3f}s]"
        )
        speaker = meta["speaker"]
        item_tag = f" ({meta['item_id']})" if meta["item_id"] else ""
        lines.append(f"{timestamp} {speaker:>12}{item_tag}: {meta['text']}")

    transcript_path = SAMPLE_DIR / "conversation_script.txt"
    transcript_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info(f"Saved transcript: {transcript_path}")

    meta_path = SAMPLE_DIR / "conversation_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Saved metadata: {meta_path}")


# ─── Engine Detection ──────────────────────────────────────────


def detect_best_engine() -> str:
    """Detect the best available TTS engine."""
    import subprocess

    try:
        result = subprocess.run(
            ["espeak-ng", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            logger.info(f"Found espeak-ng: {result.stdout.strip()}")
            return "espeak"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    try:
        import pyttsx3

        engine = pyttsx3.init()
        engine.stop()
        logger.info("Found pyttsx3")
        return "pyttsx3"
    except Exception:
        pass

    try:
        import gtts  # noqa: F401

        logger.info("Found gTTS (requires internet)")
        return "gtts"
    except ImportError:
        pass

    logger.error(
        "No TTS engine found! Install one of:\n"
        "  sudo apt install espeak-ng      (recommended)\n"
        "  pip install pyttsx3\n"
        "  pip install gTTS pydub\n"
    )
    sys.exit(1)


def list_available_voices():
    """List available espeak-ng voices for debugging."""
    import subprocess

    try:
        result = subprocess.run(
            ["espeak-ng", "--voices=en"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            logger.info("Available English voices in espeak-ng:")
            for line in result.stdout.strip().split("\n")[:15]:
                logger.info(f"  {line}")
    except Exception:
        pass


# ─── Main ───────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Generate sample audio for PLCVS testing"
    )
    parser.add_argument(
        "--engine",
        choices=["espeak", "pyttsx3", "gtts", "auto"],
        default="auto",
        help="TTS engine to use (default: auto-detect)",
    )
    parser.add_argument(
        "--accent",
        choices=list(ACCENT_PROFILES.keys()),
        default="indian",
        help="Voice accent (default: indian)",
    )
    parser.add_argument(
        "--format",
        choices=["mp3", "wav"],
        default="mp3",
        help="Output audio format (default: mp3)",
    )
    parser.add_argument(
        "--bitrate",
        default="128k",
        help="MP3 bitrate (default: 128k)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=CONFIG_PATH,
        help="Path to checklist_config.yaml",
    )
    parser.add_argument(
        "--no-noise",
        action="store_true",
        help="Skip generating noisy version",
    )
    parser.add_argument(
        "--no-individual",
        action="store_true",
        help="Skip generating per-item audio files",
    )
    parser.add_argument(
        "--list-voices",
        action="store_true",
        help="List available espeak-ng voices and exit",
    )
    args = parser.parse_args()

    if args.list_voices:
        list_available_voices()
        return

    # Validate MP3 dependencies
    if args.format == "mp3":
        try:
            from pydub import AudioSegment  # noqa: F401
        except ImportError:
            logger.error(
                "MP3 output requires pydub + ffmpeg.\n"
                "  pip install pydub\n"
                "  sudo apt install ffmpeg"
            )
            sys.exit(1)

    # Create output directories
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)

    # Detect TTS engine
    engine = args.engine if args.engine != "auto" else detect_best_engine()
    accent_profile = ACCENT_PROFILES[args.accent]

    logger.info(f"Using TTS engine: {engine}")
    logger.info(f"Accent: {accent_profile['description']}")
    logger.info(f"Output format: {args.format.upper()}")

    # Load config
    config = load_checklist_config(args.config)

    # Generate conversation script
    logger.info("Generating conversation script...")
    script = generate_conversation_script(config)

    # Assemble audio
    logger.info("Generating audio (this may take a minute)...")
    full_audio, metadata = assemble_conversation(
        script, engine, accent_profile
    )

    # Save full conversation
    logger.info("Saving audio files...")
    out_path = save_audio(
        SAMPLE_DIR / "full_conversation",
        full_audio,
        output_format=args.format,
        bitrate=args.bitrate,
    )
    logger.info(
        f"  Saved: {out_path.name} ({len(full_audio) / SAMPLE_RATE:.1f}s)"
    )

    # Save noisy version
    if not args.no_noise:
        noise = generate_radio_noise(
            len(full_audio) / SAMPLE_RATE, SAMPLE_RATE, 0.02
        )
        noisy_audio = full_audio + noise[: len(full_audio)]
        noisy_audio = np.clip(noisy_audio, -1.0, 1.0)
        out_path = save_audio(
            SAMPLE_DIR / "full_conversation_noisy",
            noisy_audio,
            output_format=args.format,
            bitrate=args.bitrate,
        )
        logger.info(
            f"  Saved: {out_path.name} ({len(noisy_audio) / SAMPLE_RATE:.1f}s)"
        )

    # Save per-stage files
    generate_stage_files(
        script, full_audio, metadata, config, output_format=args.format
    )

    # Save per-item files
    if not args.no_individual:
        generate_individual_items(
            script, full_audio, metadata, output_format=args.format
        )
        ext = args.format
        logger.info(
            f"  Saved {len(list(INDIVIDUAL_DIR.glob(f'*.{ext}')))} "
            f"individual item files"
        )

    # Save transcript and metadata
    save_transcript(script, metadata)

    # Summary
    ext = args.format
    total_files = len(list(SAMPLE_DIR.rglob(f"*.{ext}")))
    total_duration = len(full_audio) / SAMPLE_RATE

    logger.info("")
    logger.info("=" * 60)
    logger.info("  PLCVS Sample Audio Generation Complete")
    logger.info(f"  Output directory: {SAMPLE_DIR}")
    logger.info(f"  Total {ext.upper()} files:  {total_files}")
    logger.info(f"  Conversation:     {total_duration:.1f} seconds")
    logger.info(f"  Checklist items:  {script.total_items}")
    logger.info(f"  TTS engine:       {engine}")
    logger.info(f"  Accent:           {accent_profile['description']}")
    logger.info(f"  Format:           {ext.upper()}")
    logger.info("=" * 60)
    logger.info("")
    logger.info("Usage:")
    logger.info("  # Test via REST API:")
    logger.info(
        f"  curl -X POST http://localhost:8765/api/v1/transcribe/file "
        f"-F 'file=@{SAMPLE_DIR}/full_conversation.{ext}'"
    )
    logger.info("  # Play through speakers:")
    if ext == "mp3":
        logger.info(f"  mpv {SAMPLE_DIR}/full_conversation.{ext}")
    else:
        logger.info(f"  aplay {SAMPLE_DIR}/full_conversation.{ext}")


if __name__ == "__main__":
    main()
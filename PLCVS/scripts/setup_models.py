"""
One-time setup script to download all required AI models.
Run this WITH internet connectivity. After this, system runs fully offline.

Usage:
    python scripts/setup_models.py --all
    python scripts/setup_models.py --whisper-only
    python scripts/setup_models.py --nlp-only
"""

import os
import sys
import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MODELS_DIR = Path("models")


def download_whisper_model(model_size: str = "large-v3-turbo"):
    """Download Faster-Whisper model"""
    logger.info(f"📥 Downloading Whisper model: {model_size}")

    from faster_whisper import WhisperModel

    model_path = MODELS_DIR / f"whisper-{model_size}"
    model_path.mkdir(parents=True, exist_ok=True)

    # This downloads and caches the model
    model = WhisperModel(
        model_size,
        device="cpu",
        compute_type="int8",
        download_root=str(model_path),
    )

    logger.info(f"✅ Whisper model '{model_size}' downloaded to {model_path}")
    return str(model_path)


def download_sentence_transformer(model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
    """Download Sentence-Transformer model"""
    logger.info(f"📥 Downloading Sentence-Transformer: {model_name}")

    from sentence_transformers import SentenceTransformer

    model_path = MODELS_DIR / "sentence-transformers"
    model_path.mkdir(parents=True, exist_ok=True)

    model = SentenceTransformer(model_name)
    save_path = str(model_path / "all-MiniLM-L6-v2")
    model.save(save_path)

    logger.info(f"✅ Sentence-Transformer downloaded to {save_path}")
    return save_path


def download_spacy_model(model_name: str = "en_core_web_trf"):
    """Download spaCy model"""
    logger.info(f"📥 Downloading spaCy model: {model_name}")

    import subprocess
    subprocess.run(
        [sys.executable, "-m", "spacy", "download", model_name],
        check=True,
    )

    logger.info(f"✅ spaCy model '{model_name}' installed")


def download_silero_vad():
    """Download Silero VAD model"""
    logger.info("📥 Downloading Silero VAD model")

    import torch
    model_path = MODELS_DIR / "silero-vad"
    model_path.mkdir(parents=True, exist_ok=True)

    model, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-vad',
        model='silero_vad',
        force_reload=True,
    )

    torch.save(model.state_dict(), str(model_path / "silero_vad.pt"))

    logger.info(f"✅ Silero VAD downloaded to {model_path}")


def download_llama_model():
    """Download Llama 3.1 8B quantized model"""
    logger.info("📥 Downloading Llama 3.1 8B (Q4 quantized)")

    model_path = MODELS_DIR / "llama-3.1-8b-q4"
    model_path.mkdir(parents=True, exist_ok=True)

    # Using huggingface_hub to download GGUF file
    from huggingface_hub import hf_hub_download

    hf_hub_download(
        repo_id="bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
        filename="Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        local_dir=str(model_path),
    )

    logger.info(f"✅ Llama 3.1 8B downloaded to {model_path}")


def verify_models():
    """Verify all models are present"""
    logger.info("🔍 Verifying downloaded models...")

    checks = [
        ("Whisper", MODELS_DIR / "whisper-large-v3-turbo"),
        ("Sentence-Transformer", MODELS_DIR / "sentence-transformers" / "all-MiniLM-L6-v2"),
        ("Silero VAD", MODELS_DIR / "silero-vad"),
    ]

    all_ok = True
    for name, path in checks:
        if path.exists():
            logger.info(f"  ✅ {name}: {path}")
        else:
            logger.error(f"  ❌ {name}: NOT FOUND at {path}")
            all_ok = False

    if all_ok:
        logger.info("✅ All models verified successfully!")
    else:
        logger.error("❌ Some models are missing. Re-run setup.")

    return all_ok


def main():
    parser = argparse.ArgumentParser(description="PLCVS Model Setup")
    parser.add_argument("--all", action="store_true", help="Download all models")
    parser.add_argument("--whisper-only", action="store_true")
    parser.add_argument("--nlp-only", action="store_true")
    parser.add_argument("--llm", action="store_true", help="Include Llama LLM")
    parser.add_argument("--verify", action="store_true", help="Verify existing models")
    args = parser.parse_args()

    MODELS_DIR.mkdir(exist_ok=True)

    if args.verify:
        verify_models()
        return

    if args.all or args.whisper_only:
        download_whisper_model()
        download_silero_vad()

    if args.all or args.nlp_only:
        download_sentence_transformer()
        download_spacy_model()

    if args.all or args.llm:
        download_llama_model()

    if args.all:
        verify_models()

    logger.info("\n" + "=" * 60)
    logger.info("🎉 SETUP COMPLETE! System can now run OFFLINE.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
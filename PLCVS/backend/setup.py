"""
PLCVS Backend Package Setup
"""

from setuptools import setup, find_packages

setup(
    name="plcvs-backend",
    version="1.0.0",
    description="Pre-Launch Checklist Verification System - Backend",
    author="DRDO PLCVS Team",
    python_requires=">=3.10",
    packages=find_packages(),
    install_requires=[
        "fastapi>=0.109.0",
        "uvicorn>=0.27.0",
        "websockets>=12.0",
        "pydantic>=2.5.0",
        "PyAudio>=0.2.14",
        "soundfile>=0.12.1",
        "librosa>=0.10.1",
        "numpy>=1.26.0",
        "faster-whisper>=1.0.0",
        "sentence-transformers>=2.3.0",
        "spacy>=3.7.0",
        "torch>=2.1.0",
        "pyyaml>=6.0",
        "aiosqlite>=0.19.0",
        "structlog>=24.1.0",
        "python-dotenv>=1.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.23.0",
            "ruff",
            "black",
            "mypy",
        ],
        "llm": [
            "llama-cpp-python>=0.2.44",
        ],
        "report": [
            "reportlab>=4.0.0",
            "jinja2>=3.1.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "plcvs=main:main",
        ],
    },
)

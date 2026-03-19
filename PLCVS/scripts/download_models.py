import os
import urllib.request
from huggingface_hub import snapshot_download

def download_offline_models():
    base_dir = "backend/data/models"
    os.makedirs(f"{base_dir}/whisper", exist_ok=True)
    os.makedirs(f"{base_dir}/semantic_matcher", exist_ok=True)
    os.makedirs(f"{base_dir}/vad", exist_ok=True)

    print("Downloading Faster-Whisper...")
    snapshot_download(
        repo_id="dropbox-dash/faster-whisper-large-v3-turbo", 
        local_dir=f"{base_dir}/whisper"
    )

    print("Downloading Sentence Transformer...")
    snapshot_download(
        repo_id="sentence-transformers/all-MiniLM-L6-v2", 
        local_dir=f"{base_dir}/semantic_matcher"
    )

    print("Downloading Silero VAD...")
    vad_url = "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.jit"
    urllib.request.urlretrieve(vad_url, f"{base_dir}/vad/silero_vad.jit")

    print("All models downloaded successfully for offline use.")

if __name__ == "__main__":
    download_offline_models()
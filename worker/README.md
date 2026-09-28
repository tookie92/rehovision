# Worker Rehovision — GPU local (Ollama + Flux + OmniVoice + ffmpeg)

Pipeline traité par polling Convex :

1. `script` → Ollama
2. `image` → Flux Schnell (diffusers)
3. `voiceover` → OmniVoice (clone / voice-design) — fallback Piper
4. `video_assembly` → ffmpeg (1080×1920 + sous-titres)

## Prérequis système

- Python 3.11 ou 3.12 (pas 3.14 — wheels CUDA)
- NVIDIA driver + CUDA (RTX 3060 12GB OK)
- `ffmpeg` / `ffprobe` (`sudo apt install ffmpeg`)
- Ollama (`ollama pull llama3.2`)

## Setup

```bash
cd worker

python3.11 -m venv .venv
source .venv/bin/activate

pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt

# Piper optionnel (TTS_ENGINE=piper)
chmod +x scripts/download_piper_fr.sh
./scripts/download_piper_fr.sh

cp .env.example .env
# Renseigner CONVEX_SITE_URL + WORKER_SECRET_KEY
```

Variables utiles :

| Variable | Défaut | Rôle |
|---|---|---|
| `TTS_ENGINE` | `omnivoice` | `omnivoice` ou `piper` |
| `OMNIVOICE_INSTRUCT` | `male, low pitch` | Voice design si pas de clone |
| `OMNIVOICE_REF_AUDIO` | — | Sample 3–10s pour clone |
| `OMNIVOICE_REF_TEXT` | — | Transcription de la ref (sinon Whisper) |
| `OMNIVOICE_NUM_STEP` | `32` | Steps diffusion (16 = plus rapide) |
| `SD_MODEL_ID` | `black-forest-labs/FLUX.1-schnell` | Images |
| `SD_CPU_OFFLOAD` | `1` | Offload CPU (12GB VRAM) |

Tags non-verbaux supportés dans le texte de narration : `[laughter]`, `[sigh]`, etc.

## Lancer

```bash
./run.sh
# ou systemd : sudo systemctl restart rehovision-worker
```

Premier job image : download Flux (~23 Go).  
Premier job voix : download OmniVoice (HF `k2-fsa/OmniVoice`).

## Smoke test

1. Worker up
2. Projet → script → **Générer images + voix**
3. Montage auto quand toutes les scènes sont prêtes

## Télécharger les modèles HF (connexion lente)

Arrête le worker pour éviter les locks HF concurrents :

```bash
sudo systemctl stop rehovision-worker
cd worker
chmod +x scripts/download_models.sh

./scripts/download_models.sh status
./scripts/download_models.sh omnivoice    # ~1–2 Go
./scripts/download_models.sh flux         # ~23 Go (long)
./scripts/download_models.sh all --background   # nuit / connexion lente
```

Le script reprend les fichiers `.incomplete`, timeout par tentative (`HF_ATTEMPT_TIMEOUT=30m`), retries illimités.

Quand OmniVoice est prêt : `TTS_ENGINE=omnivoice` dans `.env` + restart worker.  
Quand Flux est prêt : `SD_MODEL_ID=black-forest-labs/FLUX.1-schnell` + `SD_CPU_OFFLOAD=1`.

## Dépannage

- OmniVoice OOM → `OMNIVOICE_NUM_STEP=16` ou `TTS_ENGINE=piper` temporairement
- Flux OOM → baisser `SD_WIDTH`/`SD_HEIGHT` (512×896)
- Download bloqué → `./scripts/download_models.sh status` puis relancer le modèle concerné

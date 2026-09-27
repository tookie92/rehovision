# Worker Rehovision — GPU local (Ollama + Diffusers + Piper + ffmpeg)

Pipeline traité par polling Convex :

1. `script` → Ollama
2. `image` → SDXL Turbo (diffusers)
3. `voiceover` → Piper FR
4. `video_assembly` → ffmpeg (1080×1920 + sous-titres)

## Prérequis système

- Python 3.10+
- NVIDIA driver + CUDA (RTX 3060 OK)
- `ffmpeg` / `ffprobe` (`sudo apt install ffmpeg`)
- Ollama (`ollama pull llama3.2`)

## Setup

```bash
cd worker

# Python 3.11 ou 3.12 (pas 3.14 — pas de wheel CUDA torch)
python3.11 -m venv .venv
source .venv/bin/activate

# PyTorch CUDA 12.4 (adaptez sur https://pytorch.org si besoin)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

pip install -r requirements.txt

# Piper + voix FR
chmod +x scripts/download_piper_fr.sh
./scripts/download_piper_fr.sh

cp .env.example .env
# Renseigner CONVEX_SITE_URL + WORKER_SECRET_KEY
```
Variables utiles dans `.env` :

| Variable | Défaut | Rôle |
|---|---|---|
| `PIPER_BIN` | `./bin/piper` | Binaire Piper |
| `PIPER_MODEL_PATH` | `./models/piper/fr_FR-siwis-medium.onnx` | Voix FR |
| `SD_MODEL_ID` | `stabilityai/sdxl-turbo` | Modèle HF |
| `SD_WIDTH` / `SD_HEIGHT` | `576` / `1024` | Format 9:16 |
| `SD_STEPS` | `4` | Steps Turbo |

## Lancer

```bash
./run.sh
# ou
source .venv/bin/activate && python main.py
```

Premier job image : téléchargement du modèle HF (~6 Go) dans `~/.cache/huggingface`.

## Smoke test

1. Worker + `npm run dev` + `npm run dev:convex`
2. Créer un projet → **Générer le script** → attendre les scènes
3. **Générer images + voix** → jobs `image` / `voiceover`
4. Quand toutes les scènes sont complètes, un job `video_assembly` est créé auto
5. Projet passe en `ready` avec `finalVideoUrl`

## Dépannage

- `PIPER_MODEL_PATH manquant` → relancer `scripts/download_piper_fr.sh`
- OOM CUDA → baisser `SD_WIDTH`/`SD_HEIGHT` (ex. 512×896) ou fermer d'autres apps GPU
- `ffmpeg subtitles échoué` → vérifier que `libass` est disponible (`ffmpeg -filters | grep subtitles`)

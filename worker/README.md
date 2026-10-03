# Worker GPU

Un seul job GPU à la fois. Voir le README racine pour le démarrage.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

- `MUSIC_ENGINE=fake` — WAV de test (CI / validation pipeline)
- `MUSIC_ENGINE=acestep` — ACE-Step 1.5 via `engines/acestep_backend.py`

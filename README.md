# Rehovision — MVP musique GPU local

> **AVERTISSEMENT : Aucune authentification.**
> Ne pas exposer publiquement avant d’avoir ajouté Convex Auth ou équivalent.
> Les jobs sont filtrés par un `sessionId` navigateur (localStorage).

Preuve d’architecture : interface web → Convex self-hosted → worker GPU (un job à la fois) → audio en temps réel.

Stack : **Convex self-hosted (Docker)** · **Next.js (web/)** · **Python 3.11 (worker/)** · **ACE-Step** (derrière `engines/music.py`).

---

## Prérequis

- Ubuntu, Docker + Docker Compose
- Node.js 20+
- Python 3.11
- GPU NVIDIA (RTX 3060 12 Go OK pour ACE-Step 2B turbo + LM 0.6B — voir doc ACE-Step)

---

## (a) Démarrer Convex self-hosted

Compose officiel adapté depuis
[get-convex/convex-backend/self-hosted/docker](https://github.com/get-convex/convex-backend/blob/main/self-hosted/docker/docker-compose.yml).

```bash
cd /chemin/vers/rehovision
docker compose up -d
curl -sf http://127.0.0.1:3210/version   # backend OK
# Dashboard : http://localhost:6791
./scripts/generate_admin_key.sh          # affiche la clé admin
```

Copier `.env.example` → `.env.local` et renseigner :

```bash
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY='…'   # quotes obligatoires (la clé contient |)
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
CONVEX_URL=http://127.0.0.1:3210
WORKER_TOKEN=…                     # secret partagé
```

Puis :

```bash
cp .env.local web/.env.local
npm install
npx convex deploy
npx convex env set WORKER_TOKEN "$WORKER_TOKEN"
```

**Test (a)** : `docker compose ps` healthy, dashboard accessible, `curl` version répond.

---

## (b) Schema & fonctions

Déjà dans `convex/` : tables `jobs`, `library` ; API web `jobs.*` / `library.list` ; API worker protégée par `WORKER_TOKEN`.

**Test (b)** : après deploy, le dashboard liste les fonctions `jobs`, `library`, `worker`.

---

## (c) Worker — moteur fake (sans GPU)

```bash
cd worker
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # ou réutiliser les valeurs de ../.env.local
# MUSIC_ENGINE=fake
python main.py
```

**Test (c)** : depuis un autre terminal, créer un job (UI ou script), le worker logue génération + upload, statut `done` dans Convex.

---

## (d) Interface web

```bash
cd web
npm install
npm run dev
# http://localhost:3000
```

Page unique : prompt, durée 15/30/60 s, liste jobs temps réel, onglet Bibliothèque.

**Test (d)** : Générer → statut « En attente » puis « En cours » puis lecteur audio.

---

## (e) ACE-Step (génération réelle)

Doc : [ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) · [INFERENCE.md](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/INFERENCE.md)

Sur RTX 3060 12 Go, la doc recommande DiT **2B turbo** + LM **0.6B** (backend `pt`).

```bash
cd worker
git clone https://github.com/ace-step/ACE-Step-1.5.git vendor/ACE-Step-1.5
cd vendor/ACE-Step-1.5
# Suivre le README : uv sync  (ou pip selon INSTALL.md)
cd ../..
# Dans worker/.env :
# MUSIC_ENGINE=acestep
# ACESTEP_PROJECT_ROOT=/chemin/absolu/worker/vendor/ACE-Step-1.5
# ACESTEP_CONFIG_PATH=acestep-v15-turbo
# ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-0.6B
# ACESTEP_LM_BACKEND=pt
# ACESTEP_DEVICE=cuda
python main.py
```

L’interface stable reste :

```python
from engines.music import generate_music
path = generate_music(prompt="…", duration_s=30, seed=42)
```

### Benchmark + bibliothèque

```bash
MUSIC_ENGINE=acestep python bench_music.py --duration 30
MUSIC_ENGINE=acestep python bench_music.py --duration 30 --upload
```

---

## Structure

```
rehovision/
  docker-compose.yml      # Convex backend + dashboard
  convex/                 # schema + fonctions
  web/                    # Next.js App Router
  worker/
    main.py               # boucle claim → generate → upload
    engines/music.py      # wrapper (fake | acestep)
    bench_music.py
  docs/LICENSES.md
  web/future/ffmpeg/      # réservé montage NVENC (non implémenté)
  worker/future/ffmpeg/
```

---

## Déploiement après chaque modif

```bash
./deploy.sh                         # Convex + build web + restart systemd
./deploy.sh "message de commit"     # + git commit/push avant deploy
./deploy.sh --units                 # première fois : installe les .service
```

Services : `rehovision-web` (Next :3000), `rehovision-worker` (GPU).

Suivi ACE-Step : `tail -f worker/logs/acestep-download.log` (marque `ALL DOWNLOADS DONE`).

---

## Hors périmètre (volontaire)

Auth, paiement, déploiement public large, multi-GPU, faceless/scheduling.

# Étape 0 — Ops checklist (Ubuntu)

Valide **avant** de juger les étapes produit. Coche dans `ROADMAP.md` quand c’est OK.

## 1. Code à jour

```bash
cd ~/rehovision   # ton chemin
git pull
```

## 2. Secrets alignés

Même `WORKER_SECRET_KEY` dans :

- Convex Dashboard (env self-hosted) **ou** variables déployées
- `worker/.env`
- `.env.local` (Windows / Next)

```bash
# Sur Ubuntu — ne pas coller la clé dans le chat
grep -E '^WORKER_SECRET_KEY=' worker/.env | cut -c1-30
```

## 3. Worker + upload HTTP

Dans `worker/.env` :

```
UPLOAD_HTTP_PORT=8787
UPLOAD_HTTP_HOST=0.0.0.0
LOCAL_MEDIA_DIR=./data/media
WORKER_PUBLIC_URL=http://IP_LAN:8787
CONVEX_SITE_URL=https://convex-clips-site.rehovision.com
```

```bash
sudo ufw allow 8787/tcp   # si besoin
# redémarrer worker (systemd ou python main.py)
# Log attendu : Upload HTTP on 0.0.0.0:8787
```

Dans `.env.local` (Next) :

```
NEXT_PUBLIC_WORKER_UPLOAD=1
WORKER_UPLOAD_URL=http://IP_LAN:8787
WORKER_SECRET_KEY=…même valeur…
```

Redémarrer Next après changement d’env.

## 4. Convex self-hosted (si schema / functions changés)

Sur la machine qui a `CONVEX_SELF_HOSTED_ADMIN_KEY` :

```bash
npm run convex:deploy:self-hosted
```

## 5. YouTube (optionnel)

Soit cookies :

```
# worker/.env
YT_COOKIES=./cookies/youtube.txt
```

Soit **Import → Fichier** (recommandé pour valider le parcours).

## 6. Parcours golden (critère de done)

1. Dashboard → Fichier → vlog MP4 → upload OK  
2. Pipeline : Source → Analyse → Moments → Export  
3. Clips ~30s, badge « Prêt à poster »  
4. Changer captions / look → **Re-rendre N clips** → jobs en file  
5. Trim manuel ou Ajuster → re-télécharger  
6. Export TikTok/Reels/Shorts → fichier nommé `01-reels-….mp4`

Si tout ça passe : coche **Étape 0** dans `ROADMAP.md`.

## Dépannage

### `média local trop petit (341 o)`

Souvent **pas** une vidéo tronquée : le worker prenait le sidecar `{fileId}.json`
(métadonnées upload) au lieu du `.mp4`. Corrigé dans `resolve_local_file`.

```bash
git pull && # restart worker
# Relancer le même projet (retry) — le .mp4 est déjà sur disque
```

### `500 submitJobResult` / OOM 64 Mo

Les clips MP4 ne passent **plus** dans le body httpAction Convex.
Le worker les stocke sous `/media/{id}` (`WORKER_PUBLIC_URL` obligatoire)
et poste seulement `{ "resultUrl": "…" }`.

Vérifie dans `worker/.env` :
```
WORKER_PUBLIC_URL=http://IP_LAN:8787
UPLOAD_HTTP_PORT=8787
```
Puis restart worker + `npm run convex:deploy:self-hosted` après pull.

# Convex self-hosted — Rehovision

Instance **dédiée** (ports 3220 / 3221 / 6792). Ne partage pas le backend Sienna (`:3210`).

> Project Docker Compose : `rehovision-convex` (`name:` dans docker-compose.yml).
> Ne pas réutiliser le dossier nommé comme Sienna sans `name:` — collision de projet.

```bash
cd docker/convex-self-hosted
cp .env.example .env
docker compose up -d
docker compose exec backend ./generate_admin_key.sh
```

Dans le repo root `.env.local` :

```bash
CONVEX_SELF_HOSTED_URL=https://convex-clips.rehovision.com
CONVEX_SELF_HOSTED_ADMIN_KEY=...
# CONVEX_DEPLOYMENT=   # commenté — sinon convex cloud
NEXT_PUBLIC_CONVEX_URL=https://convex-clips.rehovision.com
NEXT_PUBLIC_CONVEX_SITE_URL=https://convex-clips-site.rehovision.com
```

Déployer les fonctions :

```bash
npm run convex:deploy:self-hosted
```

Worker (même machine) : `CONVEX_SITE_URL=http://127.0.0.1:3221`

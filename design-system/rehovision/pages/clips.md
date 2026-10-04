# Clips — Vague C lite

Override de `MASTER.md` pour l’onglet Clips.

## Flux
1. Upload source (chunké si >80 Mo via `/api/upload-video` → Convex local).
2. Job `clips` : analyse timeline complète → **2–3 hooks** (ouverture, énergie, milieu) de 8–90 s.
3. Preview = premier hook ; suggestions listées pour créer d’autres versions.
4. Enfant `clip_suggest` / `clip_edit` utilise `params.sourceStorageId` **original** (pas le preview).

## UX projet
- **1 carte = 1 projet** : source en haut, versions enfants en dessous
- Libellés : « Créer cette version », « Inclure / Exclure »
- Onglets : Suggestions | Découpe manuelle

## Technique
- Parent `clips` + enfants `clip_edit` / `clip_suggest` via `params.parentJobId`
- Upload gros fichiers : bypass Cloudflare (~100 Mo) par chunks 40 Mo

## Suite
- Captions / 9:16
- HyperFrames polish

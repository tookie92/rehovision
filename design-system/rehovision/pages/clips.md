# Clips — Vague C lite

Override de `MASTER.md` pour l’onglet Clips.

## Flux
1. Upload source (chunké si >80 Mo via `/api/upload-video` → Convex local).
2. Job `clips` : analyse timeline complète → **2–3 hooks** (ouverture, énergie, milieu) de 8–90 s.
3. Preview = premier hook ; suggestions listées pour créer d’autres versions.
4. Enfant `clip_suggest` / `clip_edit` utilise `params.sourceStorageId` **original** (pas le preview).
5. **Export Reel** : bouton « Exporter Reel 9:16 + captions » → job `clip_export` (crop centre 1080×1920 + Whisper brûlé).

## UX projet
- **1 carte = 1 projet** : preview hook en haut, versions enfants en dessous
- Libellés : « Créer cette version », « Inclure / Exclure », « Exporter Reel 9:16 + captions »
- Onglets : Suggestions | Découpe manuelle

## Technique
- Parent `clips` + enfants `clip_edit` / `clip_suggest` / `clip_export` via `params.parentJobId`
- Upload gros fichiers : bypass Cloudflare (~100 Mo) par chunks 40 Mo
- Export : `worker/engines/export_reel.py` (ffmpeg scale/crop + `subtitles=` SRT)

## Suite
- HyperFrames polish

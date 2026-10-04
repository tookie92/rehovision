# Clips — Vague C

Override de `MASTER.md` pour l’onglet Clips.

## Flux
1. Upload source (chunké si >80 Mo via `/api/upload-video` → Convex local).
2. Job `clips` : analyse timeline → **2–3 hooks** (ouverture, énergie, milieu) de 8–90 s.
3. Preview = premier hook ; suggestions pour créer d’autres versions.
4. Enfant `clip_suggest` / `clip_edit` utilise `params.sourceStorageId` **original**.
5. Export :
   - **Exporter 9:16 + captions** → `clip_export` / `export-916` (ffmpeg crop + captions compactes)
   - **Polish HyperFrames** → `clip_export` / `hyperframes` (crop ffmpeg puis HTML captions/titre → MP4)

## UX projet
- **1 carte = 1 projet** : preview hook en haut, versions enfants en dessous
- Deux boutons d’export sous chaque vidéo prête

## Technique
- Parent `clips` + enfants `clip_edit` / `clip_suggest` / `clip_export`
- HyperFrames CLI : `worker/tools/hyperframes-runner` (Node ≥22, Chrome headless)
- Captions compactes : ≤5 mots / cue (`export_reel._compact_cues`)

## Suite
- Motion / overlays plus riches (catalog HyperFrames)
- Auth / musique / biblio (ROADMAP)

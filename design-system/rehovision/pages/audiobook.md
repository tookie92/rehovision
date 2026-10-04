# Livre audio — Vague B

Override de `MASTER.md` pour l’onglet Livre audio.

## Flux (B1 + B2)
1. Titre + manuscrit (`# Chapitre`, `Nom: réplique`, tags OmniVoice).
2. **Segments** : aperçu auto ou édition manuelle (texte / speaker / titre) avant envoi.
3. **Cast** : voix publique **ou clone** (preset / upload) par personnage.
4. **Lit musical** optionnel (ACE-Step instrumental + mix sous narration).
5. Langues + rythme + consentement → job `audiobook`.
6. **Reprise mid-job** : checkpoint Convex (`chunkStorageIds` + `nextIndex`) si le worker crash.

## Worker
- `engines/audiobook.py` : segments UI ou split → trad (tags hors NLLB) → TTS multi-voix / multi-clone → concat → mix lit → WAV.
- Params : `segments[]`, `speakers{ instruct | refStorageId }`, `musicPrompt`, `musicVolume`, `musicStorageId`.
- Checkpoint via `worker:saveCheckpoint` ; `reclaimStaleJobs` conserve le checkpoint.
- Max 80 segments ; `resultMeta` (+ `music`, `resumedFrom`, `speaker`).

## B2 livré
- Lit musique ACE-Step sous narration.
- Reprise mid-job après crash.
- Édition manuelle des segments avant envoi.
- Clone distinct par personnage.

# Livre audio — Vague B

Override de `MASTER.md` pour l’onglet Livre audio.

## Flux
1. Titre + manuscrit long (markdown `# Chapitre` ou paragraphes).
2. Aperçu découpe (segments ≤600 chars).
3. Langues + voix (publiques / create / modèle / clone).
4. Consentement → job `audiobook`.

## Worker
- `engines/audiobook.py` : split → trad NLLB si besoin → OmniVoice par chunk → concat ffmpeg (+ pause 350ms).
- Progress par segment ; max 80 segments.
- Résultat : WAV unique + `resultMeta.chapters`.

## Hors MVP B1
- Reprise mid-job après crash.
- Lit de musique ACE-Step sous narration (B2).
- Édition manuelle des segments avant envoi.

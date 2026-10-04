# Livre audio — Vague B

Override de `MASTER.md` pour l’onglet Livre audio.

## Flux
1. Titre + manuscrit long (markdown `# Chapitre` ou paragraphes).
2. Dialogues : lignes `Nom: réplique` (ou `Nom — …`) → une voix par personnage.
3. Tags OmniVoice (`[laughter]`, `[sigh]`, …) insertables dans le manuscrit.
4. Aperçu découpe (segments ≤600 chars) + mapping voix publiques par personnage.
5. Langues + voix narrateur (publiques / create / modèle / clone).
6. Consentement → job `audiobook`.

## Worker
- `engines/audiobook.py` : split chapitres + tours de parole → trad NLLB (tags protégés) → OmniVoice par segment (instruct par speaker) → concat ffmpeg (+ pause 350ms).
- Params `speakers`: `{ "Alice": { "instruct": "female, …" }, "Narrateur": { … } }`.
- Mode clone : une seule voix pour tout le livre (multi-voix désactivé).
- Progress par segment ; max 80 segments.
- Résultat : WAV unique + `resultMeta.chapters` (+ `speaker`).

## Hors MVP B1 (reste Vague B / B2)
- Reprise mid-job après crash.
- Lit de musique ACE-Step sous narration.
- Édition manuelle des segments avant envoi.
- Clone distinct par personnage (plusieurs refs).

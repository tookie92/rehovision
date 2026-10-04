# Livre audio — Vague B

Override de `MASTER.md` pour l’onglet Livre audio.

## Flux
1. Titre + manuscrit (`# Chapitre`, `Nom: réplique`, tags OmniVoice).
2. Cast type ElevenLabs : une ligne par rôle (Narrateur + personnages), chips voix.
3. Langues + rythme + consentement → job `audiobook`.
4. Option « Cloner ma voix » = une seule voix (désactive le cast multi).

## Worker
- Split chapitres / tours de parole → **tags retirés avant NLLB** (évite hallucinations UE) → trad → tags remis → OmniVoice par speaker → concat.
- Params `speakers`: `{ "Alice": { "instruct": "…" }, "Narrateur": { … } }`.
- Max 80 segments ; `resultMeta.chapters` (+ `speaker`).

## Hors MVP B1 (reste Vague B / B2)
- Reprise mid-job après crash.
- Lit de musique ACE-Step sous narration.
- Édition manuelle des segments avant envoi.
- Clone distinct par personnage (plusieurs refs).

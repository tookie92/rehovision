# Doublage — flux 3 étapes

Override de `MASTER.md` pour l’onglet Doublage / narration.

## Flux
1. **Contenu** — Narration | Doublage ; script et/ou audio source.
2. **Langues & voix** — 2 LangPicker (≤4 chips + search) ; Garder ma voix | Voix modèle ; échantillon ref seulement si narration + clone.
3. **Aperçu** — « Préparer la traduction » → texte lu éditable ; consentement ; CTA « Générer ».

## Règles produit
- Pas de champ « texte cible obligatoire ». L’utilisateur valide / corrige l’aperçu auto.
- Job final : `targetText` = texte aperçu, `autoTranslate: false`.
- Historique : afficher `resultMeta.spokenText` (« Texte lu »).
- Tokens : atelier clair (`MASTER.md`) — pas de purple.

## Traduction (NLLB)
- MT = **NLLB-200** (`facebook/nllb-200-distilled-600M`), pas Ollama/llama.
- Codes FLORES forcés + trad **clause par clause** + garde anti-fuite FR/EN (`welcome`/`bonjour`…).
- Shona : pivot EN. Wolof : FR→WO direct (pas de pivot EN). Noms propres protégés (Joseph).
- Ndebele (`nd`/`nr`) : proxy Zulu NLLB (pas de `nde_Latn` dans le modèle).
- TTS = OmniVoice (inchangé) après unload VRAM.
- Aperçu : `POST /api/preview-dub` → worker `http://127.0.0.1:8788/translate`.

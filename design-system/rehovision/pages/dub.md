# Doublage — flux 3 étapes + Voice Lab

Override de `MASTER.md` pour l’onglet Doublage / narration.

## Flux
1. **Contenu** — Narration | Doublage ; script et/ou audio source.
2. **Langues & voix** — LangPicker ; 3 chemins voix ; rythme ; Voice Lab si création.
3. **Aperçu** — texte lu éditable + tags expressifs ; consentement ; Générer.

## Voix (étape 2)
Trois cartes égales — une question claire : *Comment obtenir la voix ?*
- **Ma voix** — clone OmniVoice (échantillon narration / audio source doublage).
- **Voix modèle** — auto OmniVoice, sans instruct.
- **Créer une voix** — Voice Lab : genre, âge, timbre, chuchotement, accents EN → `instruct` comma-separated (`female, young adult, moderate pitch`).

### Voice Lab (UI)
- Composition chips (pas un panneau de sliders ElevenLabs).
- Recette live en mono teal (`instruct`).
- Accents visibles seulement si langue cible = `en` (limitation OmniVoice).
- Voice Lab + tags disponibles pour toutes les langues cibles (dont Wolof).
- Fond gradient atelier clair + signal soft — pas de purple.

### Voix publiques
- Recettes OmniVoice curatées (`web/src/lib/publicVoices.ts`) — pas d’IDs ElevenLabs.
- Cartes Amina / Omar / Auto… → chargent Voice Lab ou mode modèle.
- Accents EN seulement utiles si langue cible = `en`.

### Mes voix (presets)
- Table Convex `voices` filtrée par `sessionId`.
- Cartes type ElevenLabs : nom + kind (`design` | `clone`) + speed.
- Sauver depuis Voice Lab (instruct) ou depuis clone (refStorageId).
- Clic charge le preset ; supprimer possible.

### Aperçu audio
- Panneau dédié étape 2 : **Écouter l’aperçu** (auto / design / clone).
- `POST /api/preview-voice` → worker `:8788/preview-voice`.
- Lecteur sticky (ne pas clear l’URL sur re-render des chips).

### Rythme
- Presets Lente 0.8× / Naturelle 1.0× / Vive 1.2× + slider 0.7–1.3.
- Job param `speed` → OmniVoice `generate(speed=…)`.

## Aperçu (étape 3)
- Tags natifs OmniVoice insérés au curseur : `[laughter]`, `[sigh]`, `[surprise-oh]`, etc.
- Pas de tags émotion ElevenLabs (`[excited]`…).
- Job : `targetText` = aperçu, `autoTranslate: false`, `voiceMode`, `instruct?`, `speed`.

## Règles produit
- Pas de champ « texte cible obligatoire » avant aperçu.
- Historique : `resultMeta.spokenText`, `voiceMode`, `instruct`, `speed`.
- Tokens : atelier clair (`MASTER.md`).

## Traduction (NLLB)
- MT = **NLLB-200** (`facebook/nllb-200-distilled-600M`).
- Codes FLORES + clause par clause + garde anti-fuite FR/EN.
- Shona : pivot EN. Wolof : FR→WO direct. Ndebele → proxy Zulu.
- Aperçu : `POST /api/preview-dub` → worker `:8788/translate`.

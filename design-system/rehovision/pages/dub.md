# Doublage — projets atelier

Override de `MASTER.md`.

## IA produit
- **Page liste** : tous les projets doublage / narration (table historique).
- **Atelier projet** : clic → script éditable + réglages + player.
- Chaque génération = job lié au `projectId` (versions sous l’atelier).

## Layout atelier (type ElevenLabs)
- Shell **plein largeur** (pas de `mx-auto` / `max-w` sur la page outil).
- Contenu ~68% | Réglages ~32% (même carte, split).
- **Player full width** sous le split (`StudioAudioPlayer`).
- Pas de `StudioStage` 9:14 sur cet onglet.

## Données
- Table Convex `projects` (`kind`: dub | narration | …).
- `draft` = brouillon durable (texte, langues, voix, speed…).
- `jobs.projectId` optionnel ; `completeJob` met à jour `latestResultStorageId`.

## Flux
1. Liste → Nouveau projet (narration / doublage).
2. Éditer titre, script, voix (autosave ~700 ms).
3. Préparer traduction → consentement → Générer.
4. Player joue aperçu voix ou dernier rendu ; versions listées en bas.

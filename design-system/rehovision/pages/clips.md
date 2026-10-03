# Clips — page override

Conserve le MASTER atelier clair ElevenLabs.

## UX projet (corrigé)
- **1 carte = 1 projet** : source en haut, versions enfants en dessous
- Libellés : « Créer cette version », « Inclure / Exclure » (pas Appliquer / Garder flous)
- Onglets : Suggestions | Découpe manuelle (progressive disclosure)
- Lien explicite : `← depuis « titre source »`
- Toast de confirmation après création + scroll vers la zone versions
- La source n’est jamais remplacée

## Technique
- Parent `clips` + enfants `clip_edit` / `clip_suggest` via `params.parentJobId`
- `ClipProjectsList` + `ClipProjectCard` + `ClipEditor`

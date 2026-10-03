# Licences — modèles et outils

Vérification manuelle des sources officielles. Dates au format ISO.

| Composant | Licence | Source officielle consultée | Date de vérification | Notes |
|-----------|---------|----------------------------|----------------------|-------|
| **ACE-Step 1.5** | MIT | https://github.com/ace-step/ACE-Step-1.5/blob/main/LICENSE et README « License & Disclaimer » | 2026-10-03 | Code MIT. Les poids modèles sont publiés sur Hugging Face (liens Model Zoo du README). Vérifier les cartes modèle avant usage commercial des sorties audio. |
| **Convex backend (self-hosted)** | FSL Apache 2.0 (puis Apache-2.0 après 2 ans) | https://docs.convex.dev/self-hosting — section « FSL Apache 2.0 License » ; dépôt https://github.com/get-convex/convex-backend | 2026-10-03 | Interdiction de créer un produit concurrent de Convex Cloud. Clients JS/Python open-source. |
| **Convex Python client** (`convex` PyPI) | Voir dépôt get-convex/convex-py | https://github.com/get-convex/convex-py | 2026-10-03 | Client officiel. |
| **Next.js** | MIT | https://github.com/vercel/next.js/blob/canary/license.md | 2026-10-03 | Framework web (non embarqué comme modèle). |
| **ffmpeg** (prévu, non intégré) | LGPL 2.1+ (GPL si options GPL activées) | https://www.ffmpeg.org/legal.html | 2026-10-03 | Structure de dossiers uniquement à ce stade. NVENC = encodeur matériel NVIDIA, hors licence ffmpeg. |
| **PyTorch** (requis pour ACE-Step) | BSD-style (voir LICENSE PyTorch) | https://github.com/pytorch/pytorch/blob/main/LICENSE | 2026-10-03 | À installer avec CUDA selon la machine. |

## Contenu généré

- Aucune musique, LUT, police ou sample tiers n’est embarqué dans ce dépôt.
- Les fichiers produits par ACE-Step / le moteur fake sont générés localement ; l’utilisateur reste responsable de l’usage (voir disclaimer ACE-Step).

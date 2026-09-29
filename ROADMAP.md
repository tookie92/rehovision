# Rehovision — Roadmap (1 by 1)

Direction produit : **atelier Opus-like**  
Vlog / fichier / YouTube → coupes IA → trim → polish viral → export 9:16 prêt à poster.

**Pas** un NLE type CapCut / [Muse](https://apps.apple.com/us/app/muse-reels-video-editor/id1638320348) / [OpenChatCut](https://openchatcut.com/).  
On peut emprunter des **presets légers** (musique, filtre, logo) — pas la timeline complète.

Règle : **une priorité à la fois**. Cocher avant de passer à la suivante.

---

## North star

| Job | Oui | Non |
|-----|-----|-----|
| Entrée | Vlog long, fichier, lien YouTube | Galerie de stickers / collage film |
| Cœur | Hooks IA + reframe + captions | Éditeur multitrack + chat agent |
| Sortie | Shorts viraux prêts à poster | Projet CapCut à peaufiner 2 h |
| Inspi | OpusClip (moteur) + Viblo (friction UX) | Muse / OpenChatCut (bribes polish seulement) |

---

## Emprunts [Viblo](https://viblo.ai/) (friction, pas le produit)

Voler la **forme**, garder le **job** Opus. Pas de timeline NLE, pas de ranking/story faceless comme cœur.

- [x] Parcours mental **3 temps** : Import → Clips → Export (labels UI, pas un wizard forcé)
- [x] Écran projet = **grille de clips + 1 bandeau Export** (polish replié)
- [x] Stage master–detail + **aperçu soft** source In/Out avant rendu ffmpeg
- [x] Multi-select + re-rendu / export ciblé
- [x] Promesse **prêt à poster** (badge + CTA téléchargement clair)
- [x] Vitesse perçue : message « mis en file » / progression simple
- [x] Durée reel standard ~30s (déjà étape 4 partielle)
- [x] **Workspace 1 viewport** (clips | stage 9:16 | outils | barre In/Out) — plus de scroll page
- [x] Hooks plus denses (5–8 sur longs vlogs)
- [x] Captions CapCut-like (font display + word pop karaoke)
- [x] Split soft preview + swap haut/bas

Hors emprunt : templates ranking/commentary, VO ElevenLabs comme funnel principal, brand kits Business.

---

## Déjà livré

- [x] Pipeline clips : YouTube / fichier → Whisper → hooks Ollama → rendu 9:16
- [x] UX pipeline (stepper, retry, états)
- [x] Captions sync ASS + styles (Viral, Bold green, Yellow pop, Minimal)
- [x] Reframe Smart / Fill / Fit / Split
- [x] B-roll Flux optionnel
- [x] Voiceover clip optionnel (off / mix / replace)
- [x] Trim manuel In/Out → créer un clip
- [x] Panneau Rendu (options après source disponible)
- [x] Audio enhance Light (denoise + loudnorm)
- [x] Upload local worker (gros vlogs, hors Convex)
- [x] Trim drag In/Out + ajuster clip existant
- [x] Pack viral : logo + musique ducking + punch
- [x] Doc cookies YouTube (`worker/cookies/README.md`)
- [x] UI atelier Opus-ish (dropzone, grille projets, polish collapsible)

---

## Étapes restantes (ordre strict)

### Étape 0 — Ops (bloquant)

Sans ça, le reste est inutile. Checklist détaillée : [`OPS.md`](./OPS.md).

- [ ] Ubuntu : `git pull` + restart Next + worker
- [ ] Cookies YouTube (`YT_COOKIES=./cookies/youtube.txt`) **ou** rester sur import **Fichier**
- [ ] Valider 1 parcours complet : source → clips prêts → changer captions → trim manuel → re-rendu
- [ ] Vérifier `WORKER_SECRET_KEY` aligné (Convex / worker / `.env.local`)
- [x] Doc ops + checklist (`OPS.md`)

**Critère de done :** un vlog fichier (et idéalement YouTube) sort des clips téléchargeables à chaque essai.

---

### Étape 1 — Audio enhance

- [x] Loudnorm / denoise léger sur le rendu clip (ffmpeg)
- [x] Toggle dans le panneau Rendu (`audioEnhance: off | light`)

**Critère de done :** un clip « avant / après » clairement plus audible sur téléphone.

---

### Étape 2 — Trim d’un clip existant

- [x] Reprendre In/Out sur un clip déjà proposé (pas seulement « créer »)
- [x] Re-rendre ce clip seul (pas tout le projet)
- [x] Poignées drag In/Out + fenêtre déplaçable

**Critère de done :** modifier 2 s de début/fin sur un hook IA et re-télécharger.

---

### Étape 3 — Pack viral léger (polish Muse-inspiré)

Pas d’éditeur Muse. Des **presets** au re-rendu :

- [x] **Logo / watermark** (upload PNG + coin + opacité)
- [x] **Musique** : upload bed + volume + ducking sous la parole
- [x] **1–2 effets punch** (zoom, flash, grain) — presets, pas timeline

**Critère de done :** un clip avec logo + bed + 1 effet, sans ouvrir CapCut.

---

### Étape 4 — Export & partage (Viblo friction)

Objectif : un clic = fichier prêt TikTok/Reels/Shorts.

- [x] Durée cible hooks **~30s** (min 20s, max 45s)
- [x] Presets plateforme (TikTok / Reels / Shorts) — label + nom de fichier
- [x] Noms de fichier clairs (`01-reels-titre.mp4`)
- [x] Bandeau **Export** : badge « Prêt à poster » + Télécharger / Télécharger tout
- [ ] (Plus tard) deep-link share — optionnel

**Critère de done :** « Télécharger » = MP4 9:16 nommé pour la plateforme, sans retouche CapCut.

---

### Étape 5 — Qualité des coupes IA

- [x] Meilleurs prompts + `viralScore` 0–100
- [x] Afficher « pourquoi ce cut » + score dans la grille
- [x] Filtrer clips trop courts / trop longs / doublons (IoU) + ranking par score

**Critère de done :** sur un vlog type, ≥50 % des propositions sont postables sans trim.

---

### Étape 6 — Style captions + looks

- [x] Styles captions : Viral, Bold green, Yellow pop, Minimal, **Neon pink**, **Impact**
- [x] 4 looks ffmpeg : Warm / Cool / Contrast / Soft grain (+ Off)
- [x] LUT `.cube` : upload + apply (`lut3d`) + export preset / custom
- [ ] (Optionnel) packs LUT pro préchargés

**Critère de done :** looks distincts au clic, pas une UI filtre CapCut.

---

## Hors scope (pour l’instant)

Ne pas démarrer tant que les étapes 0–4 ne sont pas done :

- Timeline multitrack (Media / Music / VO / Text / Graphics / Filters / Overlays)
- Packs stickers / collage film
- Sync beat avancé type Muse « Auto-Synced To The Beat »
- Chat agent qui édite une timeline (OpenChatCut)
- Grade / LUT pro avec scrubber d’intensité plein écran
- Gen musique IA lourde (après musique upload + ducking)
- Templates Viblo ranking / commentary / story comme cœur produit

---

## Studio faceless (piste parallèle)

Pipeline séparé (script → images → voix → assemble).  
Ne pas mélanger avec le funnel vlog/clips.  
Y revenir seulement si le clipping Opus est stable en prod.

---

## Comment avancer

1. Cocher **Étape 0** en prod Ubuntu.  
2. Dire en Agent mode : `go étape N`.  
3. Une PR / un push par étape.  
4. Pas de batch « tout Muse + tout Opus + tout Viblo ».

---

## Références

- Inspi moteur : [OpusClip](https://www.opus.pro/)
- Inspi friction UX : [Viblo](https://viblo.ai/)
- Emprunts polish seulement : [Muse Reels](https://apps.apple.com/us/app/muse-reels-video-editor/id1638320348)
- Pas le modèle d’archi : [OpenChatCut](https://openchatcut.com/)
- Worker local : `worker/README.md`
- Cookies YT : `worker/cookies/README.md`
- Mémoire agent : `AGENTS.md`

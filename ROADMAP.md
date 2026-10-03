# Rehovision — Roadmap (1 by 1)

Direction produit : **atelier Opus-like** (but perso = cash réseaux)  
Vlog / fichier / YouTube → coupes IA → trim → polish viral → export 9:16 + caption post → poster.

**Pas** un NLE type CapCut / Muse / OpenChatCut.  
**Priorité cash :** clips → post. Faceless / podcast / Suno / scheduling = hors-scope volontaire.

Règle : **une priorité à la fois**. Cocher avant de passer à la suivante.

---

## North star (cash)

| Job | Oui | Non |
|-----|-----|-----|
| Entrée | Vlog long, fichier, lien YouTube | Galerie stickers / collage |
| Cœur | Hooks IA + reframe + captions + titre post | Éditeur multitrack + gen images locale |
| Sortie | Shorts prêts à poster (+ caption/hashtags) | Projet CapCut 2 h |
| Inspi | OpusClip (moteur) + Viblo (friction UX) | Faceless ranking / ElevenLabs funnel |

---

## Étape 0 — Ops + parcours golden (bloquant)

Checklist détaillée : [`OPS.md`](./OPS.md).

- [x] Ubuntu : worker + Next + Convex self-hosted + upload `:8787`
- [x] Cookies YouTube **ou** import **Fichier** (recommandé)
- [x] Pipeline clips restauré (atelier Opus, propose_clips scoré, re-render)
- [x] Faceless images gelées (`FACELESS_DISABLED=1`) pour ne pas bloquer le worker
- [x] **Toi :** 1 parcours fichier → clips → captions/look → re-rendre → trim → export MP4 → poster 1 Short/Reel manuellement

**Critère de done :** un vlog fichier sort des clips téléchargeables **à chaque essai**.

---

## Déjà livré (clips)

- [x] Pipeline : YouTube / fichier → Whisper → hooks Ollama → rendu 9:16
- [x] Captions ASS karaoke CapCut-like (Montserrat + outline fort + fontsdir ffmpeg, 2 mots/ligne, Soft aligné)
- [x] Reframe Smart / Fill / Fit / Split + cadrage
- [x] Trim manuel In/Out + ajuster clip
- [x] Pack viral : logo + musique ducking + punch + looks
- [x] Export plateforme + bandeau « Prêt à poster »
- [x] Stitch 2–3 clips
- [x] **Titres / hashtags post** (`postTitle`, `postKeywords`) à la proposition + bouton Générer/Copier
- [x] **Keywords plateforme** : prompts TikTok / Reels / Shorts distincts + fallbacks niche (pas seulement `#shorts #reels #viral`)

---

## Prochaines étapes cash (ordre)

### Après keywords

1. Scheduling / deep-link share
2. OmniVoice podcast **si** tu produis des pods
3. Faceless **léger** (stock + VO) ou API cloud — **pas** SDXL/Flux local tant que clips = machine à poster

---

## Hors scope (geler)

- Studio faceless gen images locale (SDXL / IP-Adapter / Flux) — `FACELESS_DISABLED=1`
- Mini-ElevenLabs podcast comme cœur produit
- Musique type Suno
- Keyword research UI / scheduling auto (avant que clips→post soit quotidien)
- Timeline multitrack, chat agent NLE, templates Viblo ranking

---

## Studio faceless (piste parallèle gelée)

Ne pas investir tant que le clipping Opus n’est pas une routine de post.  
Réactiver images : `FACELESS_DISABLED=0` + poids HF SDXL/IP-Adapter complets.

---

## Comment avancer

1. Dire en Agent : `go scheduling` / `go podcast` / etc.  
2. Une PR / un push par étape.

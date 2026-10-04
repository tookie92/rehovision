# ROADMAP — Rehovision

Atelier local (Next.js + Convex + worker GPU), UX type ElevenLabs :  
**Doublage · Livre audio · Clips · Musique · Bibliothèque**.

---

## Fait

### Infra
- [x] Convex self-hosted + Next.js + tunnel `app` / `convex`
- [x] Jobs + library + worker 1 job GPU à la fois
- [x] UI atelier (sidebar, consentement voix, historique)

### Vague A — Doublage / Voice Lab
- [x] Narration + doublage (Whisper → NLLB → OmniVoice)
- [x] Voice Lab : instruct, tags OmniVoice, rythme, accents EN
- [x] Mes voix (presets design / clone) + voix publiques
- [x] Aperçu voix en anglais (timbre)

### Vague B — Livre audio (B1 + B2)
- [x] Chapitres + dialogues `Nom:` + tags
- [x] Cast multi-voix (publique ou clone **par personnage**)
- [x] Trad NLLB FR→EN (anti-fuite / tags hors modèle)
- [x] Édition manuelle des segments avant envoi
- [x] Lit musical ACE-Step sous narration
- [x] Reprise mid-job (checkpoint Convex)

### Musique / Clips (socle)
- [x] ACE-Step Create (prompt, lyrics, durée…)
- [x] Clips stub : upload → coupe début (8 / 15 / 30 s) + segments + suggestions lite
- [x] Couche 3/4 : `clip_edit` / `clip_suggest` (heuristiques)

---

## État actuel des onglets

| Onglet | Maturité | Rôle |
|--------|----------|------|
| Doublage | Prod atelier | Voix / narrer / doubler |
| Livre audio | Prod atelier (B2) | Manuscrit → cast → WAV long |
| Clips | Stub utile | Hooks depuis une longue vidéo (pas CapCut) |
| Musique | Prod légère | ACE-Step instrumental / paroles |
| Bibliothèque | Basique | Outputs musique (+ à enrichir) |

**Clips en clair** : ce n’est pas encore un générateur de Reels magiques.  
C’est un **coupeur** : source longue → extrait de tête + versions (inclure/exclure, suggestions hook/cut/zoom).

---

## Prochaines étapes (ordre recommandé)

### 0. Qualité / infra (court)
- [ ] Anti-hallucinations NLLB encore plus strict si besoin
- [x] Upload Clips gros fichiers : chunks 40 Mo via `/api/upload-video` → Convex **local** (bypass limite ~100 Mo Cloudflare Tunnel)
- [ ] Auth minimale avant expo publique

### Vague C — Clips « vrais Reels »
- [x] Extraire **plusieurs** hooks (ouverture + énergie + milieu)
- [x] Durées 60 s / 90 s (UI + worker, max 90)
- [x] Captions / export 9:16 (`clip_export` : Whisper → SRT brûlé + crop 1080×1920)
- [ ] Option **HyperFrames** en polish (titres, overlays, motion) — **en plus** de ffmpeg, pas à la place

### Ensuite
- [ ] Musique : presets / variantes / lien biblio plus fort
- [ ] Bibliothèque unifiée (voix, livres audio, clips, tracks)
- [ ] Suggestions Clips vision / ML (quand GPU libre)

---

## Hors périmètre (pour l’instant)
Paiement, multi-GPU, NLE multitrack complet, scheduling réseaux, faceless auto, déploiement public large.

---

## Notes
- Docs UI : `design-system/rehovision/` (`MASTER.md`, `pages/dub.md`, `audiobook.md`, `clips.md`, `music.md`)
- HyperFrames : bon pour **finition** Reel (HTML → MP4) ; le cœur découpe reste ffmpeg + jobs `clips` / `clip_edit` / `clip_suggest`

# ROADMAP — Rehovision (post-MVP musique)

## Fait (preuve d’archi)
- [x] Convex self-hosted (Docker) + dashboard
- [x] Schema `jobs` / `library` + API web/worker
- [x] Next.js simple (prompt, durée, jobs temps réel, bibliothèque)
- [x] Worker 1 job GPU à la fois (fake → upload local → complete)
- [x] Tunnel `app.rehovision.com` + `convex.rehovision.com`
- [ ] ACE-Step réel (download en cours → `MUSIC_ENGINE=acestep`)

## En cours
- [x] UI atelier type ElevenLabs (Doublage / Musique / Bibliothèque) + consentement voix
- [x] Couche 1 lite : narration (texte→TTS) + doublage (audio→Whisper→Ollama→TTS)
- [x] Piper FR réel (`VOICE_ENGINE=auto`) ; Whisper CPU + Ollama llama3.2
- [ ] OmniVoice venv dédié (setup en bg après ACE-Step) → multilingue / instruct
- [ ] ACE-Step réel (download HF en background, ~7G+)

## Prochaine étape immédiate
1. Fin download ACE-Step → bascule `MUSIC_ENGINE=acestep` + smoke test musique
2. Fin `setup_omnivoice.sh` → `OMNIVOICE_PYTHON` + smoke dub non-FR
3. Tests langues avec locuteurs natifs
4. Auth minimale avant expo publique

## Couche 2 (en cours — stub)
- [x] Onglet Clips UI (ElevenLabs atelier + shadcn-lite)
- [x] Job `clips` + upload vidéo → worker ffmpeg (coupe N s)
- [ ] Hooks IA / polish / export (après ACE + GPU libre)

## Suite produit (ordre recommandé)
1. Auth minimale avant expo publique
2. Clips IA (hooks → polish → export) — cash
3. Export / titres-hashtags
4. Hors-scope tant que clips pas fiables : faceless, scheduling

## Hors périmètre volontaire (pour l’instant)
Paiement, multi-GPU, déploiement public large, NLE multitrack, OmniVoice/Suno.

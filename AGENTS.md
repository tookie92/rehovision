## Learned User Preferences

- Prefers frank product and strategy advice when choosing inspiration or scope (asked for direct Opus vs OpenChatCut vs Motion comparisons).
- Product direction: inspire from OpusClip-style (YouTube/file → vertical clips ready to post), not a full OpenChatCut-style chat + multitrack timeline editor; may borrow narrow UX ideas (e.g. caption/layout/VO controls, chat refine), not the whole NLE.
- Communicates in French; prefer matching the user’s language in replies.
- Prefers implementing roadmap priorities one-by-one rather than shipping a large batch at once.
- Wants manual clip in/out (choose sequences) in addition to AI auto-hooks; render options must be usable once the pipeline is ready.

## Learned Workspace Facts

- Rehovision has two pipelines: clips (YouTube/file → Whisper → Ollama hooks → ffmpeg vertical cuts with ASS captions, smart/Fill/Fit/Split reframe, optional Flux B-roll) and studio/faceless (Ollama script → image gen → OmniVoice/Piper voiceover → ffmpeg 9:16 assembly).
- Local GPU worker stack (see `worker/README.md`): Ollama, Flux Schnell via Diffusers, OmniVoice with Piper fallback, Whisper, OpenCV reframe, ffmpeg; sized for RTX 3060 12GB VRAM (CPU offload for Flux).
- Clips keep source audio by default; optional TTS mix/replace on clip re-render; full generative voiceover remains core to the studio pipeline.
- Worker runs on Linux/NVIDIA (apt, systemd, CUDA); Cursor/dev is on Windows — typical flow is push from Windows, then `git pull` + restart web/worker on Ubuntu.
- `WORKER_SECRET_KEY` must match across Convex env, `worker/.env`, and root `.env.local` (never commit the value).

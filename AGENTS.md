## Learned User Preferences

- Prefers frank product and strategy advice when choosing inspiration or scope (asked for direct Opus vs OpenChatCut vs Motion comparisons).
- Product direction: Opus-style atelier (vlog/file/YouTube → AI-assisted cuts → trim → viral polish with captions/effects/music/logo → vertical export ready to post); Opus = clipping engine, Viblo.ai = UX-friction inspiration (clear steps, export-first) — not a Viblo/OpenChatCut/Muse clone or full multitrack NLE; may borrow light presets only.
- Communicates in French; prefer matching the user’s language in replies.
- Implements priorities one-by-one using `ROADMAP.md` as the source of truth for ordered steps; avoid shipping a large batch at once.
- Wants manual clip in/out with drag handles for start/end (not only AI auto-hooks); render options must be usable once the pipeline is ready.
- Saving polish/render options alone does not enqueue jobs — always expose a visible re-render CTA that calls `rerenderAll` (or equivalent).
- After each shipped feature or étape, always say what to do on Ubuntu (`git pull` + restart Next/web and worker; plus `npm run convex:deploy:self-hosted` when Convex schema/functions change).

## Learned Workspace Facts

- Rehovision has two pipelines: clips (YouTube/file → Whisper → Ollama hooks → ffmpeg vertical cuts with ASS captions, smart/Fill/Fit/Split reframe, optional Flux B-roll) and studio/faceless (Ollama script → image gen → OmniVoice/Piper voiceover → ffmpeg 9:16 assembly).
- Local GPU worker stack (see `worker/README.md`): Ollama, Flux Schnell via Diffusers, OmniVoice with Piper fallback, Whisper, OpenCV reframe, ffmpeg; sized for RTX 3060 12GB VRAM (CPU offload for Flux).
- Clips keep source audio by default; optional TTS mix/replace on clip re-render; full generative voiceover remains core to the studio pipeline.
- Worker runs on Linux/NVIDIA (apt, systemd, CUDA); Cursor/dev is on Windows — typical flow is push from Windows, then `git pull` + restart web/worker on Ubuntu.
- `WORKER_SECRET_KEY` must match across Convex env, `worker/.env`, and root `.env.local` (never commit the value).
- YouTube downloads on the Ubuntu worker often need cookies (`YT_COOKIES` / cookies file) due to anti-bot; file upload is the reliable fallback — without a usable source, clip render options stay locked/non-clickable.
- Large vlog uploads prefer direct HTTP to the local worker (`UPLOAD_HTTP_PORT` / `WORKER_PUBLIC_URL` / `NEXT_PUBLIC_WORKER_UPLOAD`) over Convex storage; the Next `/api/worker-upload` proxy must send `Content-Length` (chunked bodies caused worker 400 empty-body errors).
- Self-hosted Convex: after changes under `convex/`, deploy with `npm run convex:deploy:self-hosted` (not `npx convex dev`, which targets Convex Cloud).
- Clip render options include a light viral pack (`punchEffect`, logo watermark, bed music with ducking); those fields must be live on self-hosted Convex or validators reject extras like `punchEffect`.
- Clip hook proposals default to ~30s reel duration in `propose_clips` (standard short-form target).
- Clip export uses platform presets (TikTok / Reels / Shorts), numbered ready-to-post filenames, and an export banner with bulk download.

## Learned User Preferences

- Prefers frank product and strategy advice when choosing inspiration or scope (asked for direct Opus vs OpenChatCut vs Motion comparisons).
- After each shipped fix or feature: always `git push` to origin, then say what to do on Ubuntu (`git pull` + restart Next/web and worker; plus `npm run convex:deploy:self-hosted` when Convex schema/functions change).
- **Priorité cash :** clips → polish → export → post manuel. Faceless / podcast OmniVoice / Suno / scheduling = hors-scope volontaire tant que le parcours clips n’est pas fiable chaque jour (`FACELESS_DISABLED=1` sur le worker).
- Product direction: Opus-style atelier (vlog/file/YouTube → AI-assisted cuts → trim → viral polish with captions/effects/music/logo → vertical export ready to post); Opus = clipping engine, Viblo.ai = UX-friction inspiration (clear steps, export-first) — not a Viblo/OpenChatCut/Muse clone or full multitrack NLE; may borrow light presets only.
- Communicates in French; prefer matching the user’s language in replies.
- Implements priorities one-by-one using `ROADMAP.md` as the source of truth for ordered steps; avoid shipping a large batch at once.
- Wants manual clip in/out with drag handles for start/end (not only AI auto-hooks); saving polish/render options alone does not enqueue jobs — always expose a visible re-render CTA that calls `rerenderAll` (or equivalent).
- Clip and faceless UIs should be Opus-like no-scroll single-viewport ateliers (clips/scenes list | 9:16 Soft/Final stage | tools) — not OpenChatCut NLE/timeline/agent-chat or a long-scrolling settings page.
- Clip stage polish before re-render: soft-preview look/LUT, CapCut-like karaoke/word-pop ASS captions with strong outline and a real Off option, punch, Split dual-pane with landscape face-framing dialog (not only haut↔bas swap).
- Clip export: platform presets + **postTitle / postKeywords** (caption sociale + hashtags) générés à la proposition ou via CTA Générer / Copier.
- Faceless: choose illustration style and voice before generation (not only mid-pipeline); look/voice regen must apply to all scenes, not a single image; style/voice tweaks need an explicit confirm CTA before enqueueing regen (no auto-wait between each change).
- Faceless: character/cast coherence across scenes is required; illustration style chips must be visually distinct viral-ready families (replace weaker lookalikes with stronger user-approved references), not Anime clones with different labels.
- Dashboard must list faceless projects when the Faceless tab is active (not clips-only); faceless hub/create UX must stay simple and Opus-like, not a pipeline-heavy long-scroll settings page.
- Once core ROADMAP étapes are done, leave voluntary hors-scope and optional items alone unless explicitly requested.

## Learned Workspace Facts

- Rehovision has two pipelines: clips (YouTube/file → Whisper → Ollama hooks → ffmpeg vertical cuts with CapCut-like karaoke ASS captions, smart/Fill/Fit/Split reframe, optional Flux B-roll) and studio/faceless (Ollama script → image gen → OmniVoice/Piper voiceover → ffmpeg 9:16 assembly).
- Faceless illustration: rebuild image prompts from current `studio.visualStyle` on regen (stale `scene.imagePrompt` ignores style changes); put style tokens first for SDXL CLIP truncation; keep character/cast identity consistent across scenes.
- Local GPU worker stack (see `worker/README.md`): Ollama, Flux Schnell via Diffusers (preferred over SDXL Turbo for strong illustration styles), OmniVoice with Piper fallback, Whisper, OpenCV reframe, ffmpeg; RTX 3060 12GB needs `SD_CPU_OFFLOAD=1` and unloading Whisper↔image between jobs to avoid CUDA OOM; `WORKER_SECRET_KEY` must match across Convex env, `worker/.env`, and root `.env.local` (never commit the value).
- Clips keep source audio by default; optional TTS mix/replace on clip re-render; full generative voiceover remains core to the studio pipeline.
- Windows = Cursor/code/`git push`; Ubuntu = Convex Docker + worker + Next web + `npm run convex:deploy:self-hosted` after `git pull`; keep `package-lock.json` committed/in sync so Ubuntu `npm ci` works.
- YouTube downloads on the Ubuntu worker often need cookies (`YT_COOKIES` / cookies file) due to anti-bot; file upload is the reliable fallback — without a usable source, clip render options stay locked/non-clickable.
- Large vlog uploads prefer direct HTTP to the local worker (`UPLOAD_HTTP_PORT` / `WORKER_PUBLIC_URL` / `NEXT_PUBLIC_WORKER_UPLOAD`) over Convex storage; Next `/api/worker-upload` must send `Content-Length` (chunked bodies caused worker 400); rendered MP4s live on worker `/media/{id}` and submit to Convex as JSON `{ resultUrl }` — never as httpAction body (Convex OOM at 64 MB).
- Self-hosted Convex: after changes under `convex/`, deploy with `npm run convex:deploy:self-hosted` (not `npx convex dev`, which targets Convex Cloud).
- Clerk ↔ Convex (self-hosted): JWT template Clerk nommé `convex` avec `aud: "convex"` (`npm run clerk:ensure-convex`); issuer dans `convex/auth.config.ts` (`CLERK_FRONTEND_API_URL` / Frontend API). `npx convex env set` → souvent 404 — ne pas compter dessus. Après fix: `npm run convex:deploy:self-hosted` + restart web + **reconnexion** Clerk.
- OmniVoice: voice presets need distinct instruct+speed; global `REF_AUDIO` / `VOICE_PROMPT` overrides flatten variety so every preset sounds the same.
- Clip render options include a light viral pack (`punchEffect`, logo watermark, bed music with ducking, `splitSwap`); those fields must be live on self-hosted Convex or validators reject extras like `punchEffect`.
- Clip hook proposals target ~30s reels and denser sets (~5–8 hooks) on long sources in `propose_clips`; export uses platform presets (TikTok / Reels / Shorts), numbered ready-to-post filenames, and an export banner with bulk download.

## Learned User Preferences

- Prefers frank product and strategy advice when choosing inspiration or scope (asked for direct Opus vs OpenChatCut vs Motion comparisons).
- Product direction: inspire from OpusClip-style (YouTube/file → vertical clips ready to post), not a full OpenChatCut-style chat + multitrack timeline editor; may borrow narrow UX ideas (e.g. chat refine) later, not the whole editor.
- Communicates in French; prefer matching the user’s language in replies.

## Learned Workspace Facts

- Rehovision has two pipelines: clips (YouTube/file → Whisper → Ollama hooks → ffmpeg vertical cuts) and studio/faceless (Ollama script → image gen → OmniVoice/Piper voiceover → ffmpeg 9:16 assembly).
- Local GPU worker stack (see `worker/README.md`): Ollama, Flux Schnell via Diffusers, OmniVoice with Piper fallback, ffmpeg; sized for RTX 3060 12GB VRAM (CPU offload for Flux).
- Clips path keeps source audio; generative voiceover belongs to the studio pipeline, not YouTube clipping.
- Worker setup assumes Linux/NVIDIA (apt, systemd, CUDA); Cursor/dev client may run on Windows against that remote worker.

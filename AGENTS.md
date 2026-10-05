## Learned User Preferences

- Use shadcn/ui components for web UI work; the app is set up with shadcn (`web/components.json`, new-york style)—do not reinvent primitives that shadcn already covers.
- Prefer clear user-facing French; avoid unintelligible placeholder hostnames in UI copy (e.g. literal `http://IP:3000`).
- When explaining setup or ops steps to the user, prefer short plain French (“en français facile”) with concrete commands.
- Prefer an atelier/outil studio look over marketing/landing chrome; treat cream+terracotta+Fraunces (and similar “AI craft” tells) as sloppy for this product UI—favor cool forest neutrals, Outfit/sans, flat borders, short copy.

## Learned Workspace Facts

- After the creator-studio rewrite, the Next.js app lives under `web/` (deps, `npm run dev`, and env via `web/.env.local`); root-level `node_modules` / `.env.local` are not what the app loads.
- The database is Convex self-hosted (not Postgres/phpMyAdmin); inspect tables in the Convex dashboard. Local Docker dashboard and the remote deployment the app points at are separate data stores—empty local dashboard does not mean the remote DB is missing.
- Keep Docker Desktop running when using local Convex via `docker compose`. From Windows, if `https://convex-clips.rehovision.com` 502s while cloudflared looks “up”, Convex may still be healthy on the Ubuntu LAN (`http://192.168.100.11:3210`, dashboard `:6791`)—point `web/.env.local` there; fix cloudflared ingress to `:3210` on Ubuntu to restore the tunnel hostname.
- Dual-machine setup: Windows/Cursor is for coding; the Ubuntu LAN box (`192.168.100.11`, Desktop Proline / ASUS H610M-K, i5-12400, 32 GB RAM, RTX 3060 12 GB, NVMe ~1 TB) runs Convex, the worker, and GPU inference—align Windows `NEXT_PUBLIC_CONVEX_URL` with that same instance (no need to copy the DB).
- Product direction: self-hosted creator “couteau suisse” aimed at underserved local languages; planned stack includes Whisper, a local LLM (e.g. Qwen), OmniVoice, ACE-Step, and ffmpeg/NVENC, with async GPU job queues because a single 12 GB card limits concurrency (avoid VRAM-heavy non-commercial models like YuE2 for SaaS).
- OmniVoice “public voices” in-app are instruct presets / consented user clones (`web/src/lib/publicVoices.ts`, Public / Mes voix UI)—not celebrity demo catalogs from omnivoice.app or Fish Speech marketing pages.

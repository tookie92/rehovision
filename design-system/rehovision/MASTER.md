# Rehovision UI — Master

Inspired by ElevenLabs speech studio + ui-ux-pro-max (atelier clair).
**Deviation from skill default palette:** no purple/pink-dark Glassmorphism (anti-pattern projet). Black CTA + teal signal + Syne/DM Sans.

## Tokens
- Background `#f6f6f4`, elevated white, ink `#0a0a0a`
- Signal/teal `#0d9488` for focus rings
- CTA: black, min-height 44–48px
- Fonts: Syne (display) + DM Sans (body)
- Motion: 150–300ms, respect `prefers-reduced-motion`

## Patterns
- ElevenLabs-like left sidebar (shadcn `SidebarProvider` / `Sidebar` / `SidebarInset`) — brand + groupe Création + footer warn
- Product nav: Doublage / Livre audio / Clips / Musique / Bibliothèque
- Doublage: wizard 3 étapes (voir pages/dub.md) — Voice Lab, Mes voix (presets), rythme, tags ; aperçu texte lu, pas de cible obligatoire
- Livre audio: Vague B (voir pages/audiobook.md) — découpe chapitres, jobs longs chunkés, concat
- Musique: MusicPanel ACE-Step Create léger (voir pages/music.md) — caption + lyrics, résultat hero
- Explicit voice-consent checkbox before dub generate
- Job history with status chips + progress
- Clips: carte Projet (source + versions enfants), pas liste plate (voir pages/clips.md)
- shadcn-lite: `components/ui/{button,label,badge,progress,skeleton,toast,sidebar}`

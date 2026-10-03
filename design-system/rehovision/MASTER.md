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
- Product tabs (Doublage / Clips / Musique / Bibliothèque)
- Large script textarea
- Explicit voice-consent checkbox before dub submit
- Job history with status chips + progress
- Clips: carte Projet (source + versions enfants), pas liste plate (voir pages/clips.md)
- shadcn-lite: `components/ui/{button,label,badge,progress,skeleton,toast}`

# Rehovision UI — Master

**Surface:** atelier produit (pas landing). Taste-skill anti-slop appliqué au shell.
**Dials:** variance 5 / motion 3 / density 5.

## Tokens
- Neutres cool bone/slate-green: bg `#f2f4f1`, elevated white, ink `#121613`
- Signal unique forest `#1a6b4a` (focus, progress, status ok)
- Scène aperçu: `#121613` / crème froide `#eef2ee`
- Radius 12px partout (boutons, cartes, inputs)
- Fonts: **Outfit** (display + body) — pas Fraunces, pas Inter
- Pas de grain, pas de mesh gradient décoratif

## Anti-patterns (explicit)
- Crème + terracotta / brass / espresso
- Serif display type Fraunces
- Purple SaaS, glassmorphism
- Eyebrows uppercase tracking partout
- Em-dashes, jargon Clerk/GPU dans l’UI

## Patterns
- Accueil: colonnes centrées OK (`max-w-3xl mx-auto`)
- **Outils** (clips, dub, music, audiobook, library): **plein largeur** — pas de `mx-auto` / `max-w-*` sur le shell
- Sidebar: Accueil / Clips / Doublage / Musique / Livre audio / Bibliothèque
- Outils + **StudioStage** sticky (sauf Doublage = player full width)
- Copy FR courte, fonctionnelle
- Toast pour erreurs; empty states sobres (`mx-auto` OK sur le texte seul)
- shadcn-lite customisé aux tokens ci-dessus

## Anti-layout
- Ne pas recentrer les ateliers dans une colonne marketing (`max-w-6xl mx-auto`)
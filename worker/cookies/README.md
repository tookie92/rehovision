# Cookies YouTube (yt-dlp)

YouTube bloque souvent les téléchargements serveur avec :
`Sign in to confirm you’re not a bot`.

## Méthode recommandée (fichier)

1. Sur **Windows** (Chrome) : installe l’extension **Get cookies.txt LOCALLY**.
2. Va sur [youtube.com](https://www.youtube.com) **connecté** à ton compte.
3. Exporte les cookies → enregistre le fichier.
4. Copie-le sur le worker Ubuntu :

```bash
mkdir -p ~/rehovision/worker/cookies
# depuis Windows (scp / WinSCP) → youtube.txt dans ce dossier
```

5. Dans `worker/.env` sur Ubuntu :

```env
YT_COOKIES=./cookies/youtube.txt
```

6. Redémarre le worker, puis **Relancer le pipeline** dans l’UI.

## Alternative (navigateur sur la même machine)

Si Chrome est installé **sur le même Linux** que le worker :

```env
YT_COOKIES_FROM_BROWSER=chrome
```

Souvent inutilisable en SSH / headless — préfère le fichier.

## Contournement immédiat

Dans le dashboard → onglet **Fichier** → upload MP4. Pas besoin de cookies.

## Sécurité

Ne commit **jamais** `youtube.txt` (déjà dans `.gitignore`).
Les cookies expirent : ré-exporte si l’erreur revient.

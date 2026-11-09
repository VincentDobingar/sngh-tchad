# Mise en ligne : interface sur Vercel, serveur sur Railway

Même principe que SENTINELLE Dengue.

## Serveur (Railway)

1. New Project → GitHub repository → `sngh-tchad`.
2. Settings : **Root Directory** `/server`, **Healthcheck Path** `/api/sante`, **Generate Domain**.
3. Volume monté sur `/data`.
4. Variables :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `SNGH_DB` | `/data/sngh.db` |
| `SNGH_ADMIN_PASSWORD` | `${{ secret(16) }}` (généré par Railway) |
| `SNGH_DONNEES_DEMO` | `1` (activité fictive générée au premier démarrage) |
| `SNGH_DEMO_PASSWORD` | `${{ secret(12) }}` (mot de passe des comptes de démonstration) |
| `SNGH_JWT_SECRET` | `${{ secret() }}` |
| `SNGH_ORIGINES` | adresse Vercel de l’interface |

## Interface (Vercel)

Import du dépôt, **Root Directory** `web` (le fichier `web/vercel.json` fixe Vite et `dist`), variable `VITE_API_URL` = adresse Railway sans `/api`.

Chaque `git push` sur `main` redéploie les deux. Les données de démonstration ne sont générées que sur une base sans aucune visite.

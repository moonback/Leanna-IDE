# Audit — Vue d'ensemble

_Session d'audit du 2026-10-13, branche `claude/happy-wozniak-alh0er`._

## Application

Leanna (v1.8.0) est un IDE / assistant IA local-first (Gemini, OpenRouter) :
chat et voix temps réel, agents autonomes, missions, notebooks, base de
connaissances, terminal, sandbox, intégrations GitHub, Telegram et MCP.
Distribué en application web locale et en application Electron (Windows).

## Architecture

| Couche | Emplacement | Rôle |
|---|---|---|
| Bootstrap | `server-bootstrap.ts` | dotenv, déchiffrement des secrets du `.env`, validation de l'environnement, puis `server.ts` |
| Serveur HTTP | `server.ts` (Express 4) | rate limits, CSP, auth `/api/*`, ~60 routeurs `server/routes/*`, 5 WebSockets (`/live`, `/terminal`, `/sandbox-watch`, `/autonomy`, `/notebook-live`) |
| Runtime agents | `server/runtime`, `server/agents`, `server/mission`, `server/core`, `server/autonomy` | outils, permissions, superviseur, missions, exécution autonome |
| Skills | `server/skills/*` | outils exposés aux modèles (fichiers, git, navigateur, automatisation…) |
| Connaissance | `server/knowledge`, `server/notebooks` | indexation projet et documents, RAG |
| Frontend | `src/` (React 19, Vite 6, Tailwind 4) | vues paresseuses, intercepteur `fetch` global (token, déduplication, coupe-circuit) |
| Desktop | `electron/main.cjs` | `contextIsolation: true`, `nodeIntegration: false` |

Environ 248 000 lignes de TypeScript.

## Sécurité : ce qui est en place (vérifié par lecture)

- Écoute sur `127.0.0.1` par défaut. Un jeton API est généré automatiquement et exigé sur `/api/*` et sur les WebSockets (le terminal s'authentifie à la connexion).
- Résolution des chemins bornée au workspace, avec exclusion de `.env*`, `.git` et `.gemini-keys.json`.
- Les secrets du `.env` sont chiffrés en AES-256-GCM, avec une clé maître hors dépôt.
- L'entrée `pm2` est validée par regex. Le clonage git n'accepte que HTTPS ou SSH, avec `spawn` sans shell.

## Modules critiques

- `server/utils/crypto.ts`, `server/routes/env.ts` et `server-bootstrap.ts` : chiffrement des secrets au repos. Une erreur peut rendre les clés irrécupérables.
- `server/security.ts` et `server/routes/ide.ts` : authentification et accès aux fichiers.
- `server/routes/terminal.ts` : shell interactif.
- `src/main.tsx` : intercepteur `fetch` global, par lequel passent tous les appels API.

## Commandes de vérification

| Commande | Portée |
|---|---|
| `npm test` | tests serveur (`node:test`, environ 1 300 tests) |
| `npm run test:ui` | tests front (Vitest + jsdom) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | lint maison et ESLint (avertissements uniquement) |
| `npm run audit:deps` | `npm audit --production` |

## Risques majeurs observés

Voir `ISSUES.md`. En résumé :
1. Corruption de secrets à l'écriture du `.env` depuis l'UI (corrigé).
2. Tests qui écrasent l'état local réel du développeur (Telegram corrigé ; `.Leanna/` restant).
3. Dépendances vulnérables, toutes corrigeables sans montée de version majeure.

## Limites de l'audit

L'audit est ciblé et n'est pas exhaustif. Les zones lues en détail sont l'authentification, les routes fichiers et `env`, le chiffrement, l'intercepteur `fetch` et l'exécution de commandes. Les zones suivantes n'ont été que survolées : le runtime agents, les missions, les notebooks, le live/voix et l'essentiel de l'UI. Aucun test end-to-end avec navigateur n'a été lancé, et l'application n'a pas été démarrée.

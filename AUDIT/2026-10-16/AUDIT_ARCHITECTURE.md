# Architecture — cartographie et points de défaillance (16 octobre 2026)

## 1. Volumétrie mesurée

| Zone | Fichiers suivis | Lignes (`.ts/.tsx/.cjs/.mjs/.js`) |
|---|---|---|
| `server/` | 559 (dont 185 tests) | ≈ 159 000 |
| `src/` | 385 (dont 19 tests) | ≈ 103 000 |
| `electron/` | 4 | 973 |
| `scripts/` | 22 | ≈ 2 700 |
| `server.ts` + `server-bootstrap.ts` | 2 | 1 340 |
| `supabase/` | 22 SQL | — |

1 177 commits. 238 outils enregistrés à l'exécution (`GET /api/tools/registry`, mesuré), 0 serveur MCP
configuré. Plus gros fichiers : `server/mission/Executor.ts` (2 920 lignes),
`server/live/LiveSocketHandler.ts` (2 203), `server/skills/browser.ts` (2 121).

## 2. Processus et couches

```
Electron main (electron/main.cjs)
 ├─ mode packagé : require(dist/server.cjs) DANS le même processus (AUDIT-025)
 ├─ BrowserWindow principale → http://127.0.0.1:4000 (contextIsolation, sandbox:false, webviewTag)
 ├─ fenêtre orb (/orb-live), splash, tray
 └─ IPC : electronAPI (preload.cjs) — 17 méthodes dont 6 jamais utilisées (AUDIT-007)

Serveur Node (server-bootstrap.ts → server.ts, Express 4 + ws)
 ├─ dev : Vite en middleware (même port 4000) ; prod : fichiers statiques dist/
 ├─ /api/* (58 montages `app.use("/api…")`, requireAuth sauf /api/health)
 ├─ WebSockets : /live, /terminal, /autonomy, /sandbox-watch, /notebook-live
 ├─ Runtime V2 : ToolRegistry (238 outils) ← SkillAdapter ← 42 fichiers de skills legacy
 ├─ Moteurs d'exécution (deux, non unifiés) :
 │    • Executor (missions) — Planner, Reflection, AutonomyPolicy, EvidenceEngine (opt-in),
 │      LeannaSupervisor (opt-in)
 │    • AgenticRuntime (agents, délégation, swarm) via AgentRuntimeExecutor
 ├─ Chemin interactif : LiveSocketHandler (Gemini Live voix/texte) → SkillManagerV2 → handler direct (AUDIT-004)
 ├─ Connaissance : KnowledgeGraph, ProjectIndexer (tree-sitter), CodeMap, SemanticSearch, ProjectDoctor…
 └─ Persistance : fichiers locaux (.Leanna/, .project-knowledge.json 19,5 Mo, .env), Supabase optionnel, Redis optionnel

Frontend React 19 (src/) : main.tsx (intercepteur fetch global + circuit breaker), 12 vues lazy,
IDE (Monaco), panneaux, contexte Live.
```

## 3. Flux critique : une demande utilisateur jusqu'à l'action

| Point d'entrée | Exécuteur | Passage par `ToolRegistry.call` ? | Curseur d'autonomie | Vérification |
|---|---|---|---|---|
| Voix / chat (`LiveSocketHandler`) | handler du skill **direct** (`SkillManagerV2.ts:117-137`) | **Non** (sauf dry-run) | Non | Auto-verify `verify_file` (`LiveSocketHandler.ts:2013`) |
| `POST /api/missions`, boutons Pilotage | `Executor.startMission` | Oui (sans `context`) | **Oui** (`Executor.ts:1650`) | `verifyGoalCriteria` (AUDIT-013) |
| Agents / délégation / swarm | `AgenticRuntime` | Oui | Non | hash `verify_file` + `assessOutcome` |
| `POST /api/skills/execute` (testeur d'outils) | `SkillManagerV2` sans contexte | Oui | Non | Aucune |
| Telegram (bot) | `TelegramService` | selon commande | Non | — |

Conséquence : les gardes (permissions, gate Jev, idempotence, curseur d'autonomie, garde anti-injection)
ne sont pas appliquées uniformément. Le seul point de passage commun qui pourrait les porter est
`ToolRegistry.call`, contourné par le chemin le plus utilisé.

## 4. Chaîne de garde-fous déclarée vs exécutée

| Garde-fou | Déclaré | Branché en production | Couvre |
|---|---|---|---|
| `PermissionPolicy` (enforce, deny undeclared) | `ToolRegistry.ts:389` | Oui | Missions, agents, `/api/skills/execute` — **pas le Live** |
| Gate Jev (`LEANNA_SAFETY_GATE`) | `ToolRegistry.ts:409-424` | Oui (défaut `off`) | idem |
| Dry-run | `ToolRegistry.ts:426-441`, `SkillManagerV2.ts:128` | Oui | Tous les chemins pour les outils à effet de bord |
| Idempotence (`LedgerGuard`) | `ToolRegistry.ts:443-467` | Oui (défaut `false`) | Appels avec `missionId` + `stepId` |
| `AutonomyPolicy` + `.leannaignore` | `Executor.ts:1650` | Missions seulement, racine figée (AUDIT-011) | Missions |
| `AuthorizationGate` | `AuthorizationGate.ts` | **Non** (jamais instancié) | — |
| Confirmation interactive | `confirmationBridge.ts` | Oui | fichiers critiques, `npm`, suppression de dossiers — **pas `node`/`npx`, ni Telegram** |
| Garde anti-injection | `promptInjectionGuard.ts` | Live, upload, navigateur, GitHub, OpenRouter, Telegram | **Pas** `AgenticRuntime` ni `Executor` (AUDIT-006) |
| `EvidenceEngine` | `Executor.ts:1965` | Oui (défaut `false`) | Missions |
| `LeannaSupervisor` | `server.ts:400-409` | Oui (défaut `false`) | Missions |
| Kernel supervisé (`runSupervisedAgenticMission`) | `core/kernel.ts:142` | **Non** (orphelin) | — |
| Sandbox plugins (`AgentLoader`/`SkillWorker`) | `.env.example` `LEANNA_PLUGIN_SANDBOX=true` | **Non** (orphelin) | — |

Les valeurs par défaut de `.env.example` (`EVIDENCE=false`, `SAFETY_GATE=off`, `IDEMPOTENCY=false`,
`SUPERVISED=false`, `AUTONOMY_MODE=auto`) diffèrent de la configuration locale du développeur
(`true`, `audit`, `true`, `true`, `auto`) : un nouvel utilisateur obtient moins de garanties que celles
observées par le développeur.

## 5. Points de défaillance uniques et dépendances fragiles

1. **Jeton API distribué au build** (AUDIT-001/002) : un seul mécanisme d'authentification, mal amorcé
   sur une installation neuve.
2. **Processus Electron unique en mode packagé** (AUDIT-025) : un blocage du serveur bloque aussi les
   fenêtres.
3. **`SELF_ROOT` global mutable** (`server/utils/selfRoot.ts:442`) : capturé par valeur dans
   `AutonomyPolicy` (AUDIT-011) ; tout module qui fait de même diverge après un changement de projet.
4. **`LiveSocketHandler` (2 203 lignes)** concentre session vocale, routage d'outils, retries,
   vérification automatique et paliers d'outils.
5. **`Executor` (2 920 lignes)** concentre planification, exécution, vérification, apprentissage et
   persistance.
6. **Deux moteurs d'exécution** aux contrats de vérification différents (constat 2 de l'audit du 15/10,
   toujours vrai).

## 6. Responsabilités dupliquées relevées

- Contrôle de chemin : `resolveWorkspacePath` (`server/security.ts`), `resolveInsideRoot`
  (`TelegramService.ts:940`), `normalizeProjectPath` + `resolveRealPathWithinProject` (skills),
  `assertSafeSandboxPath` (sandbox). Les exclusions de secrets ne sont appliquées que par le premier.
- Authentification du jeton : `authenticateRequest` (HTTP), parsing de cookie dupliqué dans
  `server.ts:1160-1170`, `terminal.ts:123-132` et `sandbox-watch.ts:58`.
- Inférence de permissions : `SkillAdapter.inferPermissions` (mots-clés) et `toolPermissions` explicites ;
  10 fichiers de skills sur 42 ne déclarent aucune permission explicite (`automationBrowser`,
  `workflow`, `codebaseWriter`…).
- Détection d'échec d'outil : `detectResultError` (`AgenticRuntime`), `detectSkillFailure` (`Executor`),
  test inline `response.error && !response.status` (`LiveSocketHandler.ts:1986`).

## 7. Dépendances

- Production : `npm audit --omit=dev` → 2 vulnérabilités faibles. Outillage : 3 critiques, 2 élevées
  (AUDIT-024).
- Dépendances lourdes en production : `puppeteer` (Chromium), `typescript`, `mermaid`, `monaco-editor`,
  `@opentelemetry/*`, `redis`, `grammy`.
- Electron 43, React 19, Express 4, Vite 6, Zod 3.

## 8. Ce qui n'a pas été cartographié

- Les 89 routeurs ont été recensés mais pas tous lus ; les 76 fichiers `server/skills` n'ont été lus
  que pour les outils à effet de bord sensibles.
- Dépendances circulaires : l'application en signale 11 (écran Pilotage) ; non recalculées pendant
  l'audit.
- Notebooks, génération de documents, TTS, Telegram (hors envoi de fichiers), workflows, automatisation
  navigateur : non audités en profondeur.

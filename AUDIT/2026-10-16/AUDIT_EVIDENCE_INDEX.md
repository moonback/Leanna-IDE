# Index des preuves (16 octobre 2026)

Type de preuve : **C** = lecture de code ; **M** = mesure ou commande exécutée ; **O** = observation dans
l'interface ; **D** = documentation du dépôt. Les secrets n'ont jamais été affichés : les comparaisons
de jetons ont été faites par égalité de chaînes dans le shell.

| Constat | Type | Fichiers / symboles / lignes | Commande ou observation |
|---|---|---|---|
| AUDIT-001 | M, C | `src/main.tsx:52-55` ; `.env.example:38-41` | `grep -rlF "$TOKEN" dist/ release/` → `dist/assets/index-CN0E2uh7.js`, `release/win-unpacked/resources/app.asar` ; build isolé : même fichier |
| AUDIT-002 | C, M | `electron/main.cjs:55-60` ; `server/security.ts` `ensureApiToken` ; `src/components/EnvSetupModal.tsx:54-58` ; `src/main.tsx:303-316` | Comparaison : jeton de `%APPDATA%/Leanna/.env` = jeton embarqué (masque le bug localement) ; `curl /api/tools/count` sans jeton → 401 |
| AUDIT-003 | C | `server/skills/system.ts:61`, `:198-201`, `:384-466`, `:279`, `:440` | — |
| AUDIT-004 | C | `server/runtime/compat/SkillManagerV2.ts:117-137` ; `server/live/LiveSocketHandler.ts:1970`, `:2013` ; `server/runtime/ToolRegistry.ts:386-467` | `grep handleToolCall(` sur `server/` |
| AUDIT-005 | C | `server/skills/telegram.ts:17`, `:251-266` ; `server/telegram/TelegramService.ts:940-950`, `:1441-1469` ; `LiveSocketHandler.ts:547-550` | — |
| AUDIT-006 | C, D | `server/utils/textGeneration.ts:601-614` ; `AgenticRuntime.ts:1225-1231` ; `docs/prompt_injection_guardrails.md` | `grep "untrustedPrompt: true"` → 1 fichier (`TelegramService.ts`) |
| AUDIT-007 | C | `electron/main.cjs:160`, `:414-445`, `:506` ; `electron/preload.cjs` ; `src/types/electron.d.ts:28-32` | `grep electronAPI.<méthode>` dans `src/` → 0 appel pour 6 méthodes |
| AUDIT-008 | M, C | `.env` (local) ; `server/utils/crypto.ts:22-89` ; `server-bootstrap.ts:12-16` | Classement clair/chiffré par préfixe `gcm:` sans afficher les valeurs ; `.gemini-keys.json` : 4 entrées `gcm:` |
| AUDIT-009 | C, M | `server/security.ts:28-58` ; `server.ts:1153-1176` ; `server/routes/terminal.ts:117-160` | — |
| AUDIT-010 | C | `LiveSocketHandler.ts:541` ; `server/skills/customSkills.ts:58-70`, `:428-431` | — |
| AUDIT-011 | C | `server.ts:419-427` ; `server/mission/AutonomyPolicy.ts:56-66`, `:85-87`, `:259-262` ; `server/utils/selfRoot.ts:442` | `grep reloadIgnore` → aucun appelant |
| AUDIT-012 | C | `server/mission/Executor.ts:1650` ; `server/runtime/AuthorizationGate.ts:333-354` ; `server/runtime/index.ts:23` | `grep "new AuthorizationGate\|createAuthorizationGate"` hors tests → 0 |
| AUDIT-013 | C, M | `server/mission/Executor.ts:1948-2045` ; `server.ts:384-394` | Valeurs : `.env.example` `LEANNA_MISSION_EVIDENCE="false"`, local `"true"` |
| AUDIT-014 | C | `Executor.ts:2575-2631` ; `Planner.ts:263-281` ; `PlaybookStore.ts:345` | `grep findMatching(` → `PredictionEngine.ts:195` seulement |
| AUDIT-015 | C, M | `server/core/kernel.ts:142-167` ; `server/runtime/AgentLoader.ts` ; `server/runtime/index.ts:38` | `grep -c "SkillWorker\|AgentLoader" dist/server.cjs` → 0 |
| AUDIT-016 | C | `LiveSocketHandler.ts:93`, `:139-154`, `:1961-1984` | — |
| AUDIT-017 | C | `Executor.ts:118`, `:497` ; `src/views/MissionControlView.tsx:86-101` | `grep DistributedLock` → aucun usage en production |
| AUDIT-018 | C, O | `MissionControlView.tsx:86-101`, `:343-353` ; `server/skills/mission.ts:323-341` ; `server.ts:416-420` | Écran `/pilotage` : boutons « Lancer », « Automatiser », « Diagnostiquer & créer » |
| AUDIT-019 | C, O, M | `server/knowledge/KnowledgeGraph.ts:685`, `:708` ; `server/knowledge/ProjectDoctor.ts:308-314` | Écran : « Taille moyenne de fichier élevée (12324 lignes) » ; `wc -l` ≈ 265 000 lignes / ≈ 950 fichiers |
| AUDIT-020 | O | — | `/pilotage` « Missions : 1 ✓ / 0 ✗ » vs `/pilotage?tab=missions` « Aucune mission » |
| AUDIT-021 | C | `server/marketplace/MarketplaceRegistry.ts:7-10`, `:104-108` ; `src/components/panels/MarketplacePanel.tsx` | `grep "démo\|demo\|fictif"` dans le panneau → 0 |
| AUDIT-022 | M | `.github/` ; `.husky/` ; `scripts/lint.cjs` | `git ls-files .github` → vide ; `npx eslint .` → 181 erreurs, sortie 1 ; `node scripts/lint.cjs` → 0 erreur |
| AUDIT-023 | M, C | `server/knowledge.test.ts:44-45` | `find .tmp-docstore-a .tmp-docstore-b` |
| AUDIT-024 | M | `package.json`, `package-lock.json` | `npm audit --json` (18) ; `npm audit --omit=dev` (2 faibles) |
| AUDIT-025 | M, C | `electron/main.cjs:91-93` ; `package.json` | `du -sh release/win-unpacked` = 1003M ; installateur 250 758 208 octets ; build : `vendor-monaco` 3 710 kB, `IdeView` 1 350 kB |
| AUDIT-026 | D | `README.md:80-90`, `:232-243` | — |
| AUDIT-027 | O, M | `src/main.tsx` (navigation) | `read_page` : 20 boutons d'activité ; `getComputedStyle` : 8/15 éléments texte à 10,8 px (onglet Missions) |
| AUDIT-028 | O | `AgenticRuntime.ts:943-992` | `/pilotage` : « verify_file … succès récent 0% » |
| AUDIT-029 | M | — | `/api/health` = 200 avant tests ; pendant : `netstat` sans `LISTENING` sur 4000 |
| AUDIT-030 | C | `server/runtime/ToolRegistry.ts:372-379`, `:389` | — |
| AUDIT-031 | C | `src/services/memory-manager/index.ts` ; `electron/preload.cjs` | `grep services/memory-manager` hors du dossier → 0 import |
| AUDIT-032 | O | barre d'état | Arbre d'accessibilité : « Statut Gemini Live : Hors ligne » |
| AUDIT-033 | C | `EnvSetupModal.tsx:54-58` ; `MissionControlView.tsx:91-101` ; `src/main.tsx` (circuit breaker) | — |
| AUDIT-034 | M | — | ESLint `jsx-a11y` : 205 avertissements |
| AUDIT-035 | M, C | `server/core/paths.ts` ; `server/knowledge/StrategyMemory.ts:64` ; `server/core/AgenticMissionRunner.test.ts:80-81`, `:161` ; `scripts/test-isolation.mjs` | `find -newer <marqueur>` : `.Leanna/core/evidence/fixed-id.json` 17:29:20, checkpoints, `strategy.json`, `mission-evolution.json` |

## Vérifications positives (constats de l'audit du 15/10 corrigés)

| Point | Preuve |
|---|---|
| Idempotence restreinte (C1) | `server/core/LedgerGuard.ts:53-80` : `permissionsHaveSideEffect` + exige `missionId` et `stepId` |
| `partial` ≠ succès (C2) | `server/runtime/agentic/AgenticRuntime.ts:472-478`, `:1367-1394` |
| Échecs « soft » détectés | `AgenticRuntime.ts:150-175` (`detectResultError`) |
| Auth sur `/api/*` | `server.ts:686-696` ; mesure : 401 sans jeton |
| Écoute locale | `server.ts:877` (`127.0.0.1` par défaut) |
| CSP production | `server/config/csp.ts:100-126` |
| RLS Supabase | `supabase/migrations/*` : politiques `to service_role` |
| Fichiers critiques fail-closed | `server/skills/codebaseWriter.ts:55-80` |

## Commandes exécutées (journal)

1. `npx tsc --noEmit -p tsconfig.json --incremental false` → sortie 0, 0 erreur, 3 min 22 s.
2. `node scripts/lint.cjs` → 0 erreur, 5 577 avertissements.
3. `npx eslint . --format compact` → échec de l'outil (formatteur retiré d'ESLint 9).
4. `npx eslint . --format json` → 181 erreurs, 2 220 avertissements, sortie 1.
5. `npm test` → 1 467/1 467, 4 min 21 s.
6. `npx vitest run --config vitest.config.ts` → 92/92, 1 min 13 s.
7. `npx vite build --outDir <absolu>` → échec dû au plugin Monaco avec un chemin absolu (erreur de l'auditeur).
8. `npx vite build --outDir <relatif erroné>` → EPERM (erreur de l'auditeur, rien écrit).
9. `npx vite build --outDir <relatif>` → réussi, 1 min 30 s, 30 Mo.
10. `npx esbuild server-bootstrap.ts … --outfile=<temporaire>` → réussi, 4,09 Mo.
11. `npm audit --json` et `npm audit --omit=dev --json`.
12. `curl` en lecture seule : `/api/health`, `/api/tools/count` (sans jeton), `/api/tools/registry` (avec jeton).
13. Navigateur intégré, lecture seule : `/ide`, `/settings`, `/pilotage`, `/pilotage?tab=missions` ;
    un seul clic (onglet « Missions », sans effet de bord).

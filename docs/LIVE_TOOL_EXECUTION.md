# LIVE TOOL EXECUTION — Outils non bloquants pour `/live`

Référence du modèle d'exécution des tool calls dans la session Gemini Live
(`server/live/LiveSocketHandler.ts` + `server/live/toolExecution.ts`).

**Objectif :** un outil lent ne doit plus geler la voix de Leanna. Un audit de
2 minutes, une ré-indexation ou une recherche web peuvent tourner en arrière-plan
pendant que le modèle continue de parler.

---

## 1. Modes de livraison

Contrôlés par la variable d'environnement `LEANNA_LIVE_TOOL_MODE`.

| Mode | Comportement | Quand l'utiliser |
|------|--------------|------------------|
| `ack` *(défaut)* | Un outil long qui dépasse le délai bascule en arrière-plan : le modèle reçoit `status:"running"`, reprend la parole, et le vrai résultat arrive plus tard en texte (`[BACKGROUND TASK UPDATE]`). | Usage normal — meilleure latence vocale. |
| `blocking` | Exécution parallèle mais la voix attend tous les résultats (comportement « ancien », avec en plus parallélisme + annulation). | Retour arrière immédiat en cas de problème. |
| `nonblocking` | Les outils longs sont déclarés `behavior: NON_BLOCKING` côté Gemini (le modèle gère nativement l'asynchronisme). | Expérimental — dépend du support de `gemini-3.8-live`. |

Une valeur invalide retombe sur `ack`.

### Variables d'environnement

| Variable | Défaut | Effet |
|----------|--------|-------|
| `LEANNA_LIVE_TOOL_MODE` | `ack` | Mode de livraison (voir ci-dessus). |
| `LEANNA_LIVE_TOOL_ACK_MS` | `1500` | Délai (ms) avant bascule en arrière-plan en mode `ack`. |

**Retour arrière immédiat :** `LEANNA_LIVE_TOOL_MODE=blocking`.

---

## 2. Ordonnancement d'un lot d'appels

Pour un même lot (`toolCall.functionCalls`) :

- Les outils **workspace** (`PROJECT_SCOPED_TOOLS` : lecture/écriture/exploration)
  s'exécutent **en série et dans l'ordre** — pour préserver la cohérence des
  écritures.
- Tout le reste part **en parallèle**.

Seuls les outils de `LONG_RUNNING_TOOLS` peuvent basculer en arrière-plan (mode
`ack`) ou être déclarés `NON_BLOCKING` (mode `nonblocking`). Les outils rapides
sont toujours attendus : la bascule n'apporterait que de la latence de coordination.

---

## 3. Annulation (`AbortSignal` / kill-switch)

Chaque appel reçoit un `AbortController` géré par le `ToolCallTracker` (un par
connexion). Le `signal` est injecté dans le `context` de l'outil
(`SkillContext.signal`). Le tracker est abort :

- quand Gemini envoie `toolCallCancellation` (abandon réel d'un appel) ;
- à la fermeture de la connexion client (`client_disconnected`) ;
- à la fermeture de la session Gemini (`gemini_session_closed`).

> ⚠️ On n'annule **pas** sur `serverContent.interrupted` seul : couper la parole
> du modèle ne doit pas tuer une tâche de fond légitime.

`raceWithAbort` rend la main immédiatement à l'annulation et empêche toute
réponse obsolète d'être injectée. L'arrêt **réel** du travail dépend ensuite du
handler : il doit lire `context.signal`.

### Matrice de prise en charge de `context.signal`

| Outil | Prise en charge | Mécanisme |
|-------|-----------------|-----------|
| `run_project_command` | ✅ kill réel | `signal` passé à `execFile` (npm/npx/node) ; `status:"cancelled"`. Exception : scripts longue durée lancés en `spawnDetached` (non reliés au signal). |
| `graphify_update` | ✅ kill réel | `executeGraphify(..., signal)` → `execFile` ; `status:"cancelled"`. |
| `security_audit` | ✅ kill réel + coopératif | `signal` passé à `npm audit` (`execFile`) ; check `signal.aborted` dans la boucle de scan statique. |
| `project_scaffold` | ✅ kill réel | `signal` passé à `execFile` du scaffolding ; `status:"cancelled"`. |
| `generate_image` | ✅ abort réseau | `signal` passé au `fetch` OpenRouter ; renvoie `null` à l'abort. |
| `generate_codebase_markdown` | ✅ coopératif | Check à chaque fichier de la boucle de détail + skip de l'analyse réseau ; `status:"cancelled"`. |
| `browser_research` | ✅ coopératif | Arrêt entre deux sources ; renvoie `partial`/`cancelled` avec les sources déjà lues. |
| `knowledge_reindex` | ✅ coopératif | `scanAll({ signal })` ; check par fichier → `ScanCancelledError` → `status:"cancelled"`. |
| `mission_create`, `agent_delegate`, `agent_orchestrate`, `agent_negotiate` | ⚠️ non branché | Mécanisme applicatif propre (`agent_cancel`), non relié à `signal`. Les tâches attribuées par enchère (`agent_negotiate`, rôle omis dans `agent_orchestrate`, étapes du Brain) sont suivies par l'orchestrateur et donc annulables par `agent_cancel` / `agent_cancel_orchestration`. |
| `knowledge_build_context`, `knowledge_impact_analyze` | ⚠️ non branché | Appels quasi instantanés ; `raceWithAbort` suffit. |
| `browser_summarize_page`, `create_rich_document` | ⚠️ non branché | Étape unique / généralement rapide. |

Dans les cas « non branché », la voix n'est **jamais** regelée : la réponse
obsolète est ignorée et le travail finit naturellement en arrière-plan.

---

## 4. Retry

- Les outils de `SLOW_TOOLS_NO_RETRY` sont **exclus** du retry automatique (un
  échec après une longue exécution ne doit pas être ré-exécuté).
- Les outils rapides conservent le retry transitoire (`TOOL_MAX_RETRIES=2`,
  backoff exponentiel via `abortableSleep`, interrompu à l'annulation).

---

## 5. Auto-verify

Après une écriture de fichier (`write/modify/patch/rename_project_file` sur une
extension vérifiable), un `verify_file` est lancé. **Changement :** on ne renvoie
plus de `functionResponse` avec l'id `<id>_verify` à Gemini (cet id n'existe pas
côté modèle). Seule la **correction du Supervisor** est injectée, si nécessaire.

---

## 6. Messages WebSocket (côté front)

Nouveaux messages, ignorables par un ancien front :

| Message | Sens |
|---------|------|
| `tool_background_start` | Un outil a basculé en arrière-plan. |
| `tool_background_done` | Un outil de fond a terminé (ou `error: true`). |
| `tool_cancelled` | Gemini a annulé un/des appel(s). |

`busy` signifie désormais « le modèle attend un outil » : il repasse à `false`
dès qu'un outil est basculé en arrière-plan.

---

## 7. Instruction système (mode `ack`)

Injectée dans `buildSystemInstruction` (`server/prompts/systemInstruction.ts`) :

> Quand un outil répond `status:"running"`, il continue en arrière-plan : dis en
> une phrase que tu t'en occupes, puis poursuis la conversation normalement.
> N'invente jamais son résultat. Quand un message `[BACKGROUND TASK UPDATE]`
> arrive, annonce brièvement le résultat à voix haute.

Inoffensive en mode `blocking` (aucun `status:"running"` n'est jamais émis).

---

## 8. Tests

| Fichier | Couvre |
|---------|--------|
| `server/live/toolExecution.test.ts` | Modes, `raceWithAbort`/`raceWithDeadline`, `abortableSleep`, `ToolCallTracker`, `summarizeForNotify`, `buildAckResponse`+`withScheduling`, `applyToolBehavior`. |
| `server/skills/graphifyCancel.test.ts` | `executeGraphify` : signal pré-abort → `cancelled` sans spawn. |
| `server/utils/imageGenerationCancel.test.ts` | `generateImage` : signal pré-abort → `null` sans `fetch`. |

Lancement : `node --import tsx --test server/live/toolExecution.test.ts` (ou le
dossier complet via `npm test`).

---

## 9. Fichiers clés

| Fichier | Rôle |
|---------|------|
| `server/live/toolExecution.ts` | Primitives : tracker, course abort/deadline, modes, ack, scheduling, catalogues `LONG_RUNNING_TOOLS` / `SLOW_TOOLS_NO_RETRY`. |
| `server/live/LiveSocketHandler.ts` | `handleToolCall` non bloquant (gardes, exécution, livraison, annulation). |
| `server/prompts/systemInstruction.ts` | Instruction mode `ack`. |
| `server/skills/*` | Prise en charge de `context.signal` par outil. |
| `server/knowledge/ProjectIndexer.ts` | `ScanAllOptions.signal` + `ScanCancelledError`. |

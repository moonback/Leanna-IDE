# Audit — agents IA, consommation de tokens et télémétrie (2026-10-15)

> Périmètre : `TelemetryService`, `textGeneration.ts`, `TokenOptimizer`, ContextMonitor (Live), `AgentExecutor`, `mission/Executor`, tous les points d'entrée fournisseurs.
> Méthode : lecture du code actuel, script de reproduction exécuté **avant** correction, tests unitaires à fournisseurs simulés (aucun appel réseau, aucune mission réelle), benchmark déterministe.
> Les anciens audits n'ont pas servi de preuve.

## A. Résumé exécutif

**État général.**
- La télémétrie centrale existait, mais elle ne pouvait pas servir de base fiable pour la facturation ni pour les budgets.
- **9 défauts ont été reproduits** sur le code d'origine (§F, `baseline-repro`) :
  - attribution croisée entre tâches concurrentes ;
  - streams non comptés ;
  - budgets purement détectifs ;
  - tokens de réflexion Gemini ignorés (150 tokens comptés pour 550 facturés dans l'échantillon) ;
  - appels sans métadonnées d'usage perdus ;
  - agrégats remis à zéro après chaque flush ;
  - buffer non borné sans Supabase ;
  - fallback indiscernable de l'appel initial ;
  - variantes de modèle tarifées au défaut.
- Un 10ᵉ défaut a été trouvé par lecture : `agent_execute` rejouait jusqu'à 4 appels facturables pour un seul rappel.

**Corrections.**
- Passe 1 : les 10 défauts sont corrigés et couverts par 38 nouveaux tests (tous verts).
- Passe 2 :
  - les chemins de génération de texte qui contournaient le wrapper (`documentLinker`, `upload-document`, proxy `/chat`) sont maintenant comptés et soumis au budget ;
  - les résumés de contexte ne perdent plus les décisions et contraintes anciennes (benchmark §F.2) ;
  - 6 tests supplémentaires.

**Principaux risques restants (§I).**
- Restent hors télémétrie centrale : embeddings, TTS, images, sessions Live, `/test-image`. Leur unité de facturation n'est pas modélisée ; la sémantique de l'usage Live n'est pas vérifiée.
- La préservation des faits critiques dans les résumés repose sur des marqueurs lexicaux (FR/EN).
- Les tarifs configurés (`MODEL_PRICING`) ne sont pas certifiés par rapport aux grilles publiques.
- Les budgets ne couvrent que les appels passant par `generateText` / `generateTextStream`.

**Tests.**
- Référence avant correction : `tsc` OK, `npm test` 1336/1345. Les 9 échecs sont préexistants et sans lien (SkillWorker ×6, `automationHelpers.assertSafeUrl`, graphify ×2).
- Après correction : voir §H.

**Limites de l'audit.**
- Aucune donnée de production ni table Supabase n'était accessible, et aucun appel fournisseur réel n'a été fait. Il n'y a donc **aucun chiffre de consommation réelle** par agent ou mission (§D).
- Les comparaisons avec les factures fournisseurs ne sont pas faites.

---

## B. Matrice de checklist

Statuts : PASS / FAIL (défaut constaté, non corrigé) / PARTIAL / NOT VERIFIED / NOT APPLICABLE. « Corrigé » signifie que le défaut a été reproduit, corrigé, puis couvert par un test vert.

### Tests cités dans la matrice

| Abréviation | Fichier |
|---|---|
| `TS.test` | `server/observability/TelemetryService.test.ts` |
| `TG.test` | `server/utils/textGeneration.telemetry.test.ts` |

### A — Cartographie des appels IA

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| A1 | Cartographie des points d'entrée | PASS (couverture documentée) | Voir §C. Obtenue par recherche exhaustive : `generateContent`, `generateContentStream`, `embedContent`, `live.connect`, `openrouter.ai`, `withGeminiRetry`, appelants de `generateText` et `generateTextStream`. |
| A2 | Chemins qui échappent à la télémétrie | PARTIAL (passe 2) | **Corrigés en passe 2 :** les chemins de **génération de texte** (`documentLinker`, `upload-document`, proxy `/chat`, `/test`). **Restent hors suivi (§C.3) :** embeddings, TTS, images, sessions Live, `/test-image`. Leur unité de facturation (image, caractère audio, embedding) n'est pas modélisée et la sémantique de l'usage Live n'est pas vérifiée. |

### B — Télémétrie

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| B1 | Chaque génération réussie est comptée | PARTIAL (corrigé pour le wrapper) | **Avant :** streams et réponses sans `usage` non comptés (D2, D5). **Correction :** les streams sont enregistrés, et un usage manquant est **estimé** et marqué `usageSource:'estimated'`. **Tests :** `OpenRouter stream: usage from the final SSE chunk…`, `response without usage metadata is recorded as ESTIMATED…`. **Reste :** les chemins de §C.3 ne sont toujours pas comptés. |
| B2 | Entrée et sortie distinguées | PASS | Champs `inputTokens` / `outputTokens`. **Test :** `success on primary provider records input/output tokens…` |
| B3 | Usage fournisseur exploité | PASS (corrigé) | **Avant :** Gemini ignorait `thoughtsTokenCount` et `toolUsePromptTokenCount` (D9 : 150 comptés pour 550). **Correction :** `normalizeGeminiUsage`. **Tests :** `normalizeGeminiUsage counts thoughts…`, `Gemini call: thoughts tokens are billed…` |
| B4 | Réponses sans usage traitées explicitement | PASS (corrigé) | Estimation à ~4 caractères par token, drapeau `estimated`, avertissement unique par modèle. Test de B1. |
| B5 | Tokens en cache représentés | PASS (corrigé) | Champ `cachedInputTokens` (Gemini `cachedContentTokenCount`, OpenRouter `prompt_tokens_details.cached_tokens`). **Tests :** `normalizeOpenRouterUsage keeps cached…`, `recordTokenUsage: cached and reasoning…` |
| B6 | Raisonnement et multimodal | PARTIAL | Le raisonnement est maintenant pris en compte. Pour le multimodal (`geminiParts` image) : les tokens fournisseur incluent l'image, mais l'**estimation** de repli ne compte que le texte. Les tarifs audio/image (TTS, images) ne sont pas modélisés. |
| B7 | Échecs et retries enregistrés sans double comptage | PASS (corrigé) | `recordFailedCall` incrémente un compteur sans ajouter de tokens. **Tests :** `failed calls are counted without adding tokens`, `all providers failing…`. Les retries internes à `withGeminiRetry` (429/503) ne sont pas journalisés individuellement. |
| B8 | Fallback distingué de l'appel initial | PASS (corrigé) | Champs `isFallback` et `fallbackFrom`, attribut de span `model.fallback_from`. **Test :** `primary failure then fallback success…` |
| B9 | Fournisseur et modèle réels conservés après fallback | PASS | Même test : `provider:'openrouter'`, `model:'google/gemini-3.6-flash'`. |
| B10 | Identifiants tâche / mission / agent / outil associés | PASS (corrigé) | Contexte `AsyncLocalStorage` (`runWithTelemetryContext`). `jevDecisions` hérite maintenant du rôle et de l'outil. **Test :** `nested context inherits the parent missionId` |
| B11 | Appels concurrents isolés | PASS (corrigé) | **Avant :** les variables globales `_currentTaskId` etc. faisaient attribuer à B les tokens de A (D1 : `["B","B"]`). **Test :** `concurrent tasks keep their own telemetry context` |
| B12 | Persistance durable si activée | PASS (logique) / NOT VERIFIED (base réelle) | **Test :** `persistence: a successful flush…` avec un client simulé. Aucune base réelle testée. |
| B13 | Erreurs DB visibles | PASS (corrigé) | `getPersistenceStatus()` (`lastError`, `disabledReason`), exposé dans `/api/observability/health` et `/dashboard`. **Tests :** `transient DB error…`, `missing table…` |
| B14 | Buffers bornés sans perte silencieuse | PASS (corrigé) | **Avant :** croissance non bornée sans Supabase (D7) et perte silencieuse au `requeue`. **Correction :** file de persistance bornée à 5000 avec compteur `droppedUnpersisted` et avertissement, fenêtre dashboard bornée avec compteur `droppedFromWindow`. **Tests :** `bounded queue counts dropped…`, `without Supabase nothing accumulates…` |
| B15 | Agrégations cohérentes | PASS (corrigé) | **Avant :** les agrégats étaient calculés sur la file vidée par le flush (D6 : 15 → 0). Ajout de `byProvider`. **Test :** `aggregates: per model / provider…` |
| B16 | Comparaison avec l'usage fournisseur | PARTIAL | `providerCostUsd` (OpenRouter `usage.cost`, Jev) est stocké à côté du coût calculé. Aucun rapprochement avec une facture n'a été effectué. |

### C — Coûts

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| C1 | Formule par million | PASS | **Test :** `cost: known model…` |
| C2 | Sortie nulle | PASS | **Test :** `cost: call without output tokens…` |
| C3 | Modèle inconnu | PASS (corrigé) | Bascule sur `DEFAULT_PRICING`, désormais **marqué** `pricingSource:'default'`, compté dans `defaultPricedCalls`, avec un avertissement unique. **Test :** `pricing: unknown model…` |
| C4 | Variantes et suffixes | PASS (corrigé) | **Avant :** `gemini-2.5-pro-preview-05-06` était tarifé au défaut (D4). La normalisation ne retire que les suffixes de version (`-preview-…`, `-001`, `models/`) ; une variante comme `-lite` n'hérite jamais du tarif de base. **Tests :** `pricing: version/preview…`, `pricing: a distinct variant (-lite)…` |
| C5 | `:free` OpenRouter | PASS (corrigé) | Tarif nul. **Test :** `pricing: OpenRouter :free…` |
| C6 | Tokens en cache | PARTIAL | Aucun tarif « cache » n'est configuré : le cache est facturé au tarif d'entrée plein (estimation majorante, documentée). |
| C7 | Changement de fournisseur / fallback | PASS | Le tarif suit le modèle réellement utilisé (test B8). |
| C8 | Tarifs configurés comparés aux tarifs publics | NOT VERIFIED | `MODEL_PRICING` contient des modèles (`gemini-3.8-flash`…) et des prix qui n'ont pas pu être vérifiés sur une source officielle. Ils n'ont **pas** été modifiés. **Les coûts dépendent de la configuration et ne sont pas certifiés.** |

### D — TokenOptimizer

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| D1 | Ce qu'il réduit et où | PASS (documenté) | Il agit uniquement sur l'historique conversationnel : `optimizeMessages*` (route `/api/openrouter/chat`), `summarizeWithLLM` (Live, `/summarize-context`), mémoires (`optimizeMemories`). Il **n'agit pas** sur les descriptions d'outils, les prompts d'`AgentExecutor` ni les observations d'outils. |
| D2 | Les éléments supprimés sont absents de la requête envoyée | PASS | `routes/openrouter.ts` envoie `optimizedMessages`. Le benchmark mesure 81 → 10 messages. |
| D3 | Économies estimées et économies réelles | PARTIAL | Les économies annoncées (`tokensSaved`) sont **estimées** avec l'heuristique (tiktoken ne se charge pas en ESM, `require` est indéfini). `summarizeWithLLM` renvoie maintenant les tokens fournisseur réels quand ils sont disponibles. Il n'y a aucune mesure des tokens facturés ni du coût par mission réussie. |
| D4 | Qualité préservée | PASS (corrigé en passe 2, sur le benchmark) | **Avant :** la décision critique d'un ancien message était **perdue** à 40 et 120 tours, et `summarizeWithLLM` ignorait tout au-delà des 30 premiers messages. **Correction :** `extractCriticalStatements` extrait, sur **tous** les messages, les énoncés de décision, contrainte, interdiction ou sécurité, avec un extrait centré sur le marqueur et dédoublonné. Ces énoncés sont ajoutés de façon déterministe au résumé local comme au résumé LLM. L'entrée du LLM couvre les messages les plus récents dans un budget de 12 000 caractères, et indique combien de messages ne sont pas détaillés. **Tests :** `tokenOptimizer.test.ts` (4). **Limite :** la détection reste lexicale (FR/EN). Un fait critique formulé sans marqueur peut encore être perdu. |
| D5 | Modèle de résumé | FAIL (documenté) | L'option `model:'openai/gpt-4o-mini'` est ignorée : le modèle par défaut est utilisé. Ce n'est pas corrigé, car le modèle « prévu » est **plus cher** selon les tarifs configurés (0,15/0,60 contre 0,075/0,30). |

### E — Contexte

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| E1 | Limites d'`AgentExecutor` (code actuel) | PASS (valeurs confirmées) | `MAX_TOOL_TURNS = 10`, `MAX_OBSERVATION_CHARS = 80 000`, `MAX_FILE_CONTEXT_CHARS = 50 000`, `MAX_FILES_IN_CONTEXT = 10`. `EXECUTION_BUDGET` : `maxToolCalls = 60`, `maxFilesRead = 20`, `maxContextChars = 240 000` (`AgentExecutor.ts:584-600`). |
| E2 | Fenêtre de contexte et budget financier distincts | PASS | `TokenBudget` (`tokenOptimizer`) et `BudgetConfig` (`TelemetryService`) sont des types séparés. |
| E3 | ContextMonitor (Live) | NOT VERIFIED (défaut suspecté) | `LiveSocketHandler.ts:325` additionne `promptTokenCount` à chaque tour. Si ce compteur couvre déjà tout le contexte (sémantique Gemini usuelle), l'occupation est surestimée et les résumés se déclenchent trop tôt (appels LLM supplémentaires). Cela n'a pas pu être vérifié sans session Live réelle. |
| E4 | Compression sans perte de règles de sécurité | PASS (mesuré) | Les messages `system` sont toujours conservés (benchmark : `systemRulePreserved: true`). |
| E5 | Résumés préservent décisions et preuves | PARTIAL | Les décisions et contraintes sont maintenant préservées (D4). Les preuves sans marqueur lexical ne sont pas garanties. |

### F — Retries, fallbacks, fournisseurs

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| F1 | Succès du fournisseur principal | PASS | Test B2. |
| F2 | Échec récupérable puis succès | PARTIAL | La rotation de clés 429/503 de `withGeminiRetry` n'est pas re-testée ici (`geminiKeyPool.test.ts` ne couvre que la gestion des clés). |
| F3 | Échec principal puis fallback | PASS | Test B8. |
| F4 | Échec de tous les fournisseurs, tentatives bornées | PASS | **Test :** `all providers failing…` (1 appel HTTP, 2 échecs enregistrés, 0 token). |
| F5 | Pas de double appel redondant | PASS (corrigé) | **Avant :** le « fallback » de `agent_execute` (`reasoning.ts`) relançait `generateText` sans `forceProvider`, donc sur le même fournisseur, soit jusqu'à 4 appels facturables. **Après :** il bascule réellement vers l'autre fournisseur, ne rejoue pas après « Tous les providers ont échoué » et s'arrête sur un budget épuisé. **Tests :** `agent_execute fallback really switches provider…`, `agent_execute stops immediately when the mission budget is exhausted` |
| F6 | Erreurs non récupérables non relancées | PARTIAL | `withGeminiRetry` ne relance que 429/503. En revanche, `generateText` bascule vers l'autre fournisseur sur **toute** erreur, y compris 400/401 : c'est un choix de conception, inchangé. |
| F7 | Timeouts et annulation | PARTIAL (corrigé en partie) | Correction d'une fuite de timer de 120 s par appel Gemini et d'une fuite d'écouteur `abort` dans le stream OpenRouter. `generateText` n'accepte pas de `AbortSignal` : une annulation de tâche n'interrompt pas un appel en cours. |
| F8 | Coût des tentatives échouées | PARTIAL | Il est inconnu : il est compté comme *inconnu* (`failedCallsSinceStart`) et non comme nul. Un stream interrompu après acceptation est comptabilisé. |
| F9 | Budgets vérifiés avant retry et fallback | PASS (corrigé) | `acquireBudget` est appelé avant **chaque** tentative, hors du `try`, donc un refus ne déclenche pas de fallback. **Tests :** `budget refusal does not trigger the cross-provider fallback`, `budget is checked on every attempt…` |

### G — Budgets

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| G1 | Prévention avant génération | PASS (corrigé) | **Avant :** contrôle seulement entre les actions de mission ; la 2ᵉ génération partait malgré un budget dépassé (D3). **Après :** `BudgetExceededError` est levée avant tout envoi. **Test :** `budget exceeded: the next call is refused BEFORE reaching any provider` |
| G2 | Appels parallèles (réservation) | PASS (corrigé) | `reserveBudget` compte les réservations en vol. **Tests :** `parallel calls in one mission…` (1 appel sur 3), `budget: in-flight reservations…` |
| G3 | Budget de coût | PASS | **Test :** `budget: cost budget is enforced before the call` |
| G4 | Appels hors wrapper | PARTIAL (passe 2) | **Désormais soumis au budget :** `documentLinker` (via `generateText`), `upload-document` et le proxy `/chat`, via `reserveModelCallBudget`. Le proxy répond 429 sans appel amont quand le budget est épuisé (test `/chat proxy is refused before the upstream call…`). **Restent hors budget :** embeddings, TTS, images, Live, Jev. |
| G5 | Missions sans budget | PASS | **Test :** `budget: missions … are never blocked` |
| G6 | Télémétrie indisponible | PASS | Les budgets reposent sur les compteurs en mémoire, indépendants de Supabase. Le mode reste fail-open pour la génération (choix documenté en §E). |

### H — Consommation par agent

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| H1 | Chiffres par agent | NOT VERIFIED | Aucune télémétrie de production disponible. Voir §D. |
| H2 | Attribution fiable | PASS (corrigé) | Voir B10 et B11. **Limite :** une tâche agent lancée par une file hors de la chaîne asynchrone de sa mission n'hérite du `missionId` que via `task.context.missionId`. |

### I — Fiabilité des missions

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| I1 | Taux de réussite, coût par mission réussie | NOT VERIFIED | Aucune mission réelle n'a été exécutée (règle 2.3). |
| I2 | Non-régression sécurité | PASS | Suite complète (§H). `JevSafetyGate`, `PromptInjectionGuard`, sandbox et ledger n'ont pas été modifiés. `guardOptionsPrompt` est toujours appliqué avant le budget et l'envoi. |

### J — Persistance

| ID | Contrôle | Statut | Preuve / défaut / correction / test |
|---|---|---|---|
| J1 | Schéma et migrations | PASS (complété) | Nouvelle migration `20261015000000_token_usage_v2_columns.sql`, idempotente. Repli automatique sur le schéma v1 (PGRST204). **Test :** `missing v2 columns falls back…` |
| J2 | Politiques d'accès | PASS (inspection) | RLS activée, accès réservé au `service_role` (migration `20260101000007`). |
| J3 | Rétention | FAIL (documenté) | Aucune politique de rétention ni de purge sur `token_usage`. |
| J4 | Visibilité du caractère non durable | PASS (corrigé) | `/health` → `telemetry.durable`, `persistence`. `/dashboard` → `dataQuality`. |

---

## C. Cartographie des appels IA

### C.1 Wrapper central — `server/utils/textGeneration.ts`

**`generateText`.**
- Fournisseur : `forceProvider`, sinon `profile.textProvider`, sinon `gemini`.
- Fallback inter-fournisseur : une seule tentative, désactivée si `forceProvider` est fourni.
- Circuit breaker : 3 échecs, puis 60 s de pause.
- Gemini : `withGeminiRetry` (rotation de clés sur 429/503), modèle par défaut `gemini-3.8-flash`.
- OpenRouter : timeout 120 s, modèle par défaut `google/gemini-3.6-flash`.
- **Après correction :** budget vérifié avant chaque tentative, usage normalisé ou estimé, échecs et fallbacks tracés, contexte `AsyncLocalStorage`.

**`generateTextStream`.**
- Pas de retry ni de fallback, sauf l'absence de clé OpenRouter qui bascule vers Gemini.
- **Après correction :** budget vérifié avant l'envoi, usage enregistré (`streamed:true`).

### C.2 Appelants du wrapper (couverts par la télémétrie)

**Missions.**
- `server.ts:337` : `llmText`, utilisé par `mission/Executor` pour décomposer, réfléchir, générer les arguments et vérifier.
- Exécution sous `runWithTelemetryContext({missionId})`, appliqué à `preparePlan` et à `launchMission`.

**Agents.**
- `skills/reasoning.ts` : `agent_execute`, appelé par `AgentExecutor` via `callToolWithTimeout`. Contexte `{taskId, missionId, agentRole, toolName:'agent_execute'}`.
- Le même fichier contient aussi `reasoning_think` (ToT, auto-critique, CoT), `reasoning_delegate_task` et des streams.
- `agents/brain/GoalUnderstandingEngine`, `agents/brain/DynamicPlanner`, `knowledge/ReasoningPipeline`.

**Skills.**
- `skills/chainOfThought`, `history`, `automationBrowser`, `browser` (multimodal Gemini), `codebaseReader`.

**Notebooks.**
- `ContentGenerator` (7 sites, dont 1 stream), `GroundedChat` (9 sites, dont 3 streams), `SourceIngester` (3 sites), `RAGEngine` (2 sites, OpenRouter forcé).

**Divers.**
- `telegram/TelegramService` (prompt non fiable).
- `utils/tokenOptimizer.summarizeWithLLM`.
- Routes `prompts` (×2) et `generate-agent`.

**Attribution.** Les appels hors mission ou tâche (Telegram, notebooks, routes) sont enregistrés **sans** identifiant. Ils sont comptés dans `unattributedCalls`.

### C.3 Chemins facturables qui **contournent** la télémétrie et les budgets

**Instrumentés en passe 2 :**

| Site | Changement |
|---|---|
| `skills/documentLinker.ts` (`callLLMForAnalysis`) | Passe par `generateText` avec `forceProvider` = fournisseur du profil (pas de fallback, comme avant). |
| `routes/upload-document.ts` | Branche Gemini : `generateText` avec `geminiParts`. Branche OpenRouter (multimodal `image_url`) : `reserveModelCallBudget`, puis `recordModelCallUsage` ou `recordModelCallFailure`. |
| `routes/openrouter.ts` `/chat` | Budget vérifié avant l'appel amont (429 sinon), usage et échecs enregistrés (`toolName:'openrouter_chat_proxy'`). |
| `routes/openrouter.ts` `/test` | Usage enregistré (`openrouter_key_test`). |

**Toujours hors télémétrie et hors budget :**

| Site | Fournisseur | Usage |
|---|---|---|
| `utils/geminiTTS.ts:424, 472` | OpenRouter `/audio/speech`, Gemini TTS | TTS |
| `utils/imageGeneration.ts:79` | OpenRouter `/images/generations` | Génération d'images |
| `utils/openrouterEmbeddings.ts:81` | OpenRouter `/embeddings` | Notebooks, sélection de skills |
| `skills/memory.ts:199, 309`, `runtime/HierarchicalMemoryService.ts:202, 441` | Gemini `embedContent` | Mémoire |
| `live/LiveSocketHandler.ts:908`, `live/NotebookLiveSocketHandler.ts:233`, `live/VoicePresence.ts:112` | Gemini Live | Voix (l'usage est seulement transmis au client) |
| `routes/openrouter.ts` `/test-image` | OpenRouter | Test d'image (facturé à l'image) |
| `utils/jevDecisions.ts:134` | OpenRouter decisions | Télémétrie propre, mais **pas de budget** |

**Interface (`src/`).** Aucun appel modèle depuis le navigateur. `useLiveAPI` passe par le WebSocket du serveur.

---

## D. Analyse de la consommation

- **Tokens mesurés (production) :** aucune donnée disponible. Aucun accès Supabase et aucune session réelle dans cet environnement. Aucun chiffre n'est inventé.
- **Tokens mesurés (tests) :** uniquement des valeurs simulées, qui servent à prouver la mécanique et non des volumes réels.
- **Sources de surconsommation identifiées dans le code :**
  1. `agent_execute` : rappel redondant du même fournisseur, jusqu'à 4 appels (**corrigé**).
  2. Tokens de réflexion Gemini non comptés : les coûts affichés sous-estimaient la réalité, de 73 % dans l'échantillon D9 (**corrigé**).
  3. Comptage suspect du ContextMonitor Live, qui pourrait provoquer des résumés prématurés (NOT VERIFIED).
  4. `reasoning_think` en mode Tree-of-Thought : 3 branches parallèles, plus l'évaluation, plus l'auto-critique, soit ≥5 appels par requête. C'est voulu, mais à mesurer.
- **Attribution :**
  - Certaine (contexte `AsyncLocalStorage`) pour `AgentExecutor`, les missions et Jev.
  - Absente pour Telegram, les notebooks et les routes.
  - Aucune attribution heuristique n'est faite.

## E. Analyse des budgets

**Ce qui est empêché avant génération.**
- Tout appel `generateText` ou `generateTextStream` exécuté dans le contexte d'une mission dotée d'un budget.
- Cela couvre le premier appel, chaque tentative et chaque fallback.
- La vérification se fait dès que `consommé + en vol + entrée estimée > limite`, ou que le budget est déjà marqué dépassé (`>=`).

**Ce qui est seulement détecté.**
- La sortie d'un appel autorisé peut faire franchir la limite. La sortie est inconnue à l'avance : seule l'entrée est réservée, estimée à ~4 caractères par token.
- L'appel suivant est alors refusé.
- `Executor.executeAction` contrôle aussi le budget entre les actions.

**Ce qui ne peut pas être garanti.**
- Une génération déjà envoyée ne peut être ni interrompue ni remboursée.
- Les chemins de §C.3 ne sont pas soumis au budget.
- Une tâche agent qui ne s'exécute pas dans la chaîne asynchrone de sa mission, et sans `task.context.missionId`, n'est pas rattachée au budget.

**Télémétrie indisponible.**
- Les budgets restent appliqués : ils reposent sur des compteurs en mémoire.
- La génération n'est pas bloquée par une panne de Supabase. C'est un fail-open délibéré : la persistance sert à l'historique, pas au contrôle.

## F. Benchmark avant/après

### F.1 Défauts reproduits avant correction (`baseline-repro`, fournisseurs simulés)

| Cas | Avant | Après |
|---|---|---|
| D1 attribution de 2 tâches concurrentes A/B | `["B","B"]` | A et B corrects (test) |
| D2 enregistrements de stream | 0 | 1 (test) |
| D3 2ᵉ appel après dépassement | envoyé (1 appel fournisseur) | refusé, 0 appel (test) |
| D4 coût de `gemini-2.5-pro-preview-05-06` pour 1M tokens d'entrée | 0,50 $ (défaut) | 0,90 $ (normalisé) |
| D5 réponse sans `usage` | 0 enregistrement | 1 enregistrement estimé |
| D6 agrégat après flush réussi | 15 → 0 | 15 → 15 |
| D7 file sans Supabase après 1500 appels | 1500 (non bornée) | 0 en attente |
| D8 champs de fallback | absents | `isFallback`, `fallbackFrom` |
| D9 Gemini (100 entrée / 50 candidats / 400 réflexion) | total 150 | total 550 |

### F.2 TokenOptimizer

Commande : `node --import tsx scripts/token-optimizer-bench.mts`. Le benchmark est déterministe, utilise le résumé local, avec un budget d'historique de 20k tokens.

| Tours | Messages | Tokens estimés | Réduction | Règle système | Décision critique ancienne |
|---|---|---|---|---|---|
| 10 | 21 → 21 | 8009 → 8009 | 0 % | conservée | conservée |
| 40 | 81 → 10 | 31949 → 3685 | 88 % | conservée | **perdue** |
| 120 | 241 → 10 | 72269 → 2901 | 96 % | conservée | **perdue** |

Après la correction de la passe 2, avec la même commande et les mêmes entrées :

| Tours | Messages | Tokens estimés | Réduction | Règle système | Décision critique ancienne |
|---|---|---|---|---|---|
| 10 | 21 → 21 | 8009 → 8009 | 0 % | conservée | conservée |
| 40 | 81 → 10 | 31949 → 3720 | 88 % | conservée | **conservée** |
| 120 | 241 → 10 | 72269 → 2936 | 96 % | conservée | **conservée** |

La qualité est rétablie pour un surcoût de ~35 tokens estimés par résumé.

**Limites de comparabilité.**
- Les réductions portent sur des tokens **estimés** et **envoyés**, pas sur des tokens facturés.
- Le coût d'une mission réussie n'est pas mesuré.
- Le résumé LLM n'est pas mesuré (il nécessite un appel réel).

## G. Modifications réalisées

| Fichier | Problème confirmé | Changement | Test |
|---|---|---|---|
| `server/utils/textGeneration.ts` | D1, D2, D3, D5, D8, D9, fuite de timer, fuite d'écouteur `abort` | Ajouts : `AsyncLocalStorage` (`runWithTelemetryContext`, `getTelemetryContext`), `acquireBudget` avant chaque tentative et chaque stream, `BudgetExceededError`, `normalizeGeminiUsage` / `normalizeOpenRouterUsage`, usage estimé, `recordFailure`, `isFallback`, télémétrie des streams. Suppression des globales `set/clearTelemetryContext`. | `TG.test` (17 tests) |
| `server/observability/TelemetryService.ts` | D4, D6, D7, perte silencieuse, budget seulement détectif | Ajouts : `resolvePricing` (`exact` / `normalized` / `free` / `default`), champs `cached`, `reasoning`, `usageSource`, `pricingSource`, `fallback`, `providerCost`. Fenêtre dashboard séparée de la file de persistance, toutes deux bornées et comptées. `reserveBudget` avec réservations en vol, dépassement à `>=`. `recordFailedCall`, `getPersistenceStatus`, repli sur le schéma v1. | `TS.test` (21 tests) |
| `server/agents/AgentExecutor.ts` | Contexte global écrasé entre tâches concurrentes | `execute` enveloppe `executeTask` dans `runWithTelemetryContext`. | Suite complète |
| `server/mission/Executor.ts` | idem pour les missions | `preparePlan` et le corps de `launchMission` sont exécutés sous `runWithTelemetryContext({missionId})`. | Suite complète (`Executor.test.ts`) |
| `server/skills/reasoning.ts` | Fallback d'`agent_execute` sur le même fournisseur (jusqu'à 4 appels) | `forceProvider` vers l'autre fournisseur, pas de rejeu après un échec total, arrêt sur budget épuisé. | 2 tests `agent_execute` |
| `server/utils/jevDecisions.ts` | Pas de rôle ni d'outil ; coût fournisseur ignoré | Contexte hérité, `toolName:'jev_decisions'`, `providerCostUsd`. | tsc |
| `server/utils/tokenOptimizer.ts` | `tokensUsed` toujours estimé | Utilise les tokens fournisseur quand ils sont disponibles. | tsc |
| `server/routes/observability.ts` | Caractère non durable invisible | Ajout de `dataQuality` dans `/dashboard` et de `persistence`, `durable` et `recentFailures` dans `/health`. | tsc |
| `supabase/migrations/20261015000000_token_usage_v2_columns.sql`, `supabase/token_usage_schema.sql` | Colonnes manquantes | 8 colonnes v2, migration idempotente. | Test de repli v1 |
| `scripts/token-optimizer-bench.mts` | Pas de benchmark | Benchmark déterministe. | Exécuté (§F.2) |
| **Passe 2 :** `server/utils/textGeneration.ts` | Pas de mécanisme commun pour les appels directs | Helpers exportés `reserveModelCallBudget`, `recordModelCallUsage`, `recordModelCallFailure`. `recordUsage` prend désormais un nombre de caractères. | `openrouter.telemetry.test.ts` |
| **Passe 2 :** `server/skills/documentLinker.ts` | Appels OpenRouter et Gemini hors télémétrie et hors budget | Passe par `generateText` (fournisseur du profil forcé). Changement de comportement mineur : Gemini utilise désormais température 0.3, auparavant valeur par défaut du modèle. | tsc, suite complète |
| **Passe 2 :** `server/routes/upload-document.ts` | idem | Gemini via `generateText`. OpenRouter multimodal via les helpers. Gemini utilise désormais la température du profil (défaut 0.7) au lieu de celle du modèle. | tsc, suite complète |
| **Passe 2 :** `server/routes/openrouter.ts` | Proxy `/chat` et `/test` hors télémétrie et budget | Budget avant l'appel amont (429), usage et échecs enregistrés. | `openrouter.telemetry.test.ts` (2) |
| **Passe 2 :** `server/utils/tokenOptimizer.ts` | Perte des décisions critiques ; `summarizeWithLLM` limité aux 30 premiers messages | `extractCriticalStatements`, section « Points critiques préservés », entrée LLM bornée par caractères en partant des messages les plus récents. | `tokenOptimizer.test.ts` (4), benchmark |

## H. Tests et validations

| Commande | Avant (ec70926) | Après |
|---|---|---|
| `npm run typecheck` | exit 0 | exit 0 |
| `npm run typecheck:test` | 1 erreur préexistante (`src/lib/fetchDedup.test.ts` TS2835) | même erreur unique, aucune nouvelle |
| `npm run lint` | — | exit 0 (0 erreur ; avertissements de style préexistants) |
| `npm test` | 1345 tests, 1336 pass, 9 fail | Passe 1 : 1383 tests, 1374 pass. Passe 2 : 1389 tests, 1380 pass. **Mêmes 9 fail** dans les deux cas. |
| Tests ciblés (`TelemetryService.test.ts`, `textGeneration.telemetry.test.ts`, `tokenOptimizer.test.ts`, `openrouter.telemetry.test.ts`) | n/a | 44/44 pass |
| `scripts/token-optimizer-bench.mts` | n/a | exécuté (§F.2) |
| `docs/audit-evidence/baseline-repro-2026-10-15.mts` | 9/9 défauts reproduits | n/a (API supprimée) |

**Échecs préexistants, inchangés et sans lien avec cet audit :**
- `SkillWorker` ×6 ;
- `automationHelpers: assertSafeUrl` ;
- `graphifySkill: graphify_god_nodes` ;
- `graphifySkill: graphify_query`.

**Non exécutés :**
- appels fournisseurs réels ;
- mission autonome réelle ou dry-run complète (aucune clé dans l'environnement ; règle 2.3) ;
- Supabase réel ;
- `npm run build`, `test:ui` et `test:missions`.

## I. Problèmes restants

| Priorité | Problème | Preuve | Action suivante |
|---|---|---|---|
| Haute | Embeddings, TTS, images et sessions Live restent hors télémétrie et hors budget (§C.3) | Recherche de code | Modéliser leurs unités de facturation (par image, par caractère, par token d'embedding, audio Live) dans `MODEL_PRICING`. Ensuite, appliquer `reserveModelCallBudget` et `recordModelCallUsage` à chacun. Pour Live, vérifier d'abord la sémantique de `usageMetadata` (cumulatif ou par tour). |
| Moyenne | La préservation des faits critiques est lexicale (FR/EN) | `CRITICAL_STATEMENT_PATTERN` | Élargir les marqueurs ou laisser l'utilisateur épingler des messages. |
| Haute | Tarifs `MODEL_PRICING` non vérifiés | Aucune source officielle consultée pour ces identifiants | Synchroniser avec les grilles fournisseurs (ou avec `usage.cost` d'OpenRouter) et dater les tarifs. |
| Moyenne | ContextMonitor Live : cumul de `promptTokenCount` probablement surestimé | `LiveSocketHandler.ts:325` | Vérifier la sémantique sur une session réelle. Si elle est confirmée, utiliser le dernier `promptTokenCount` plutôt que la somme. |
| Moyenne | `generateText` n'accepte pas d'`AbortSignal` | Lecture du code | Propager le signal de la tâche jusqu'à `fetch` et au SDK. |
| Moyenne | Le fallback se déclenche aussi sur des erreurs permanentes (400/401) | `generateText` | Restreindre le fallback aux erreurs réseau, 429, 5xx et timeouts (décision produit). |
| Moyenne | Pas de rétention sur `token_usage` | Migrations | Ajouter une purge planifiée ou un partitionnement. |
| Basse | L'option `model` de `summarizeWithLLM` est ignorée | `tokenOptimizer.ts:416` | Supprimer l'option ou la brancher après décision de coût. |
| Basse | Les retries 429/503 internes ne sont pas tracés par tentative | `geminiKeyPool.ts` | Ajouter un compteur. |

## J. Plan de suite

L'audit sera terminé quand :
1. Les chemins restants de §C.3 (embeddings, TTS, images, Live) seront instrumentés avec `reserveModelCallBudget` et `recordModelCallUsage`, après modélisation de leurs unités de facturation. Chaque chemin aura un test qui vérifie l'enregistrement et le refus sur budget épuisé. Les chemins de génération de texte sont faits (passe 2).
2. Une mission dry-run représentative aura été mesurée de bout en bout par agent, avec des données exportées depuis `/api/observability/usage`. Cela demande un environnement avec clés et Supabase, ainsi que l'autorisation de l'utilisateur.
3. `MODEL_PRICING` aura été rapproché d'une facture fournisseur sur une période donnée (écart documenté).
4. ~~Le test de qualité du résumé (fait critique préservé) passera.~~ Fait en passe 2 (`tokenOptimizer.test.ts`, benchmark §F.2).
5. La sémantique du ContextMonitor Live aura été vérifiée sur une session réelle.

Dépendances : les points 2, 3 et 5 nécessitent des accès réels (clés, Supabase, facture), indisponibles dans cet environnement.

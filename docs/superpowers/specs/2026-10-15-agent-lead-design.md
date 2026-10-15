# Agent Lead — chef d'orchestre intelligent (design)

Date : 2026-10-15 · Statut : validé en conception, en attente de revue de la spec.

## 1. Objectif

Un agent principal qui **décompose** les objectifs, **choisit** les agents spécialisés,
**arbitre** leurs résultats et **décide quand arrêter** — en réutilisant l'orchestration
existante (`AgentBrain`, `BrainScheduler`, `AgentOrchestrator.delegateTask`,
`BrainVerifier`, `BrainCorrectionLoop`, `SwarmComposer`, `ContractNetNegotiator`), sans
créer de moteur d'exécution parallèle.

### Ce que l'utilisateur a demandé
- Décomposition, choix des agents, arbitrage, décision d'arrêt.
- Réutiliser l'orchestration existante.
- Arbitrage = **jugement par étape** (pas de mise en concurrence de plusieurs agents).
- Agent Lead **actif par défaut** sur `brainExecute`.

### Hypothèses retenues
- La décomposition reste celle du `DynamicPlanner` (déjà en place) ; le Lead agit sur le
  plan produit et pendant son exécution.
- Le Lead est une **couche de décision** injectée dans `AgentBrain`, pas une boucle.
- Aucun nouveau point d'entrée : `agent_brain`, `/api/agents/brain/execute` et Telegram
  passent tous par `brainExecute` et bénéficient du Lead automatiquement.
- Décisions **déterministes** (aucun appel LLM), testables sans réseau.

### Hors périmètre
- Budget en tokens / coût (le `missionId` n'est pas propagé aux tâches déléguées).
- Mise en concurrence de plusieurs agents sur une même étape.
- Interface utilisateur dédiée (les décisions passent par `agentEventStream`, déjà affiché).
- `brainPlan` (mode `plan_first`) : seule la réaffectation des rôles s'y applique.

## 2. État existant (référence)

`AgentBrain.executeGoal` : `GoalUnderstandingEngine.understand` → `DynamicPlanner.plan` →
`BrainPlanValidator.validate` → `BrainScheduler.execute(stages)` → par étape
`executeStage` (`delegateTask` → `awaitTaskCompletion` → `verifyStage` → boucle
`BrainCorrectionLoop` jusqu'à `maxCorrectionAttempts`) → `replanSubgraph` jusqu'à
`maxReplans`. Manques : le rôle de chaque étape est figé par le planner (et
`delegateTask` lève une erreur si le rôle est à `maxConcurrency`), le verdict d'étape est
binaire, l'arrêt ne dépend que de compteurs fixes.

## 3. Architecture

Nouveau dossier `server/agents/lead/` :

| Fichier | Responsabilité |
|---|---|
| `types.ts` | `LeadPolicy`, `LeadDecision`, `ArbitrationVerdict`, `StopDecision`, `LeadBudget`, `LeadRunState`, `DEFAULT_LEAD_BUDGET` |
| `AgentSelector.ts` | Choix / réaffectation du rôle d'une étape, classement des candidats |
| `StageArbiter.ts` | Verdict `accept / correct / reassign / abandon` après vérification |
| `StopController.ts` | Décision `continue / stop(reason)` (budget, non-progrès, échecs) |
| `AgentLead.ts` | Implémente `LeadPolicy` en composant les trois modules, tient le `LeadRunState`, journalise et publie chaque décision |
| `index.ts` | Barrel |

### Contrat `LeadPolicy`

```ts
interface LeadPolicy {
  /** Démarre un run : initialise l'état (budget, horloge). */
  begin(plan: BrainPlan, budget?: Partial<LeadBudget>): LeadRunState;
  /** Réaffecte les rôles des étapes `pending` du plan (mutation + decisions). */
  selectAgents(plan: BrainPlan, state: LeadRunState): void;
  /** Verdict sur une étape vérifiée. */
  arbitrate(input: ArbitrationInput, state: LeadRunState): ArbitrationVerdict;
  /** Faut-il lancer une nouvelle délégation / réplanification ? */
  shouldContinue(state: LeadRunState, point: "delegation" | "replan"): StopDecision;
  /** Enregistre une délégation effectuée (budget). */
  recordDelegation(state: LeadRunState, kind: "stage" | "correction" | "reassign"): void;
  /** Enregistre l'issue d'une étape (progrès / échecs consécutifs). */
  recordStageOutcome(state: LeadRunState, stageId: string, passed: boolean, filesVerified: number): void;
}

type ArbitrationVerdict =
  | { action: "accept"; rationale: string }
  | { action: "correct"; rationale: string; targetRole?: AgentRole }
  | { action: "reassign"; rationale: string; toRole: AgentRole }
  | { action: "abandon"; rationale: string };

type StopDecision = { continue: true } | { continue: false; reason: StopReason; detail: string };
type StopReason = "wall_time" | "delegation_budget" | "consecutive_failures" | "no_progress";

interface LeadBudget {
  maxWallTimeMs: number;          // défaut 20 * 60_000
  maxDelegations: number;         // défaut 25 (étapes + corrections + réaffectations)
  maxConsecutiveFailures: number; // défaut 3
}

interface LeadDecision {
  kind: "select" | "arbitrate" | "stop";
  stageId?: string;
  summary: string;   // ex. "coder → debugger", "reassign", "stop: delegation_budget"
  rationale: string;
  timestamp: string;
}
```

`LeadRunState` contient : `startedAt`, `budget`, `delegations`, `consecutiveFailures`,
`progressMarker` (nb d'étapes complétées + nb de fichiers vérifiés au dernier replan),
`reassigned: Set<stageId>`, `issueHistory: Map<stageId, string[]>` (signatures des issues
critiques), `decisions: LeadDecision[]`, `stopped?: StopDecision`.

L'horloge est injectable (`now: () => number`) pour les tests.

## 4. Intégration dans `AgentBrain`

- `AgentBrainDeps.lead?: LeadPolicy` ; par défaut `new AgentLead()`.
- `BrainGoalInput` gagne `lead?: boolean` (défaut `true`) et
  `leadBudget?: Partial<LeadBudget>` ; `brainExecuteSchema` est étendu en conséquence
  (champs optionnels).
- Si `input.lead === false`, aucun hook n'est appelé : comportement strictement identique
  à l'actuel.

Points d'accroche :

1. **Après `planGoal`** (dans `executeGoal`) : `lead.begin(plan, input.leadBudget)` puis
   `lead.selectAgents(plan, state)`. Le Mermaid est régénéré si un rôle a changé.
2. **Début de `executeStage`** : `shouldContinue(state, "delegation")`. Si stop → l'étape
   est marquée échouée avec `verification.summary = "Arrêt Agent Lead : <detail>"`, sans
   délégation ; le scheduler propage le blocage aux dépendants (`skipped`).
   Chaque `delegateTask` (étape, correction, réaffectation) appelle `recordDelegation`.
3. **Après chaque `verifyStage`** : `arbitrate(...)` remplace la condition
   `while (!verification.passed && attempt <= max)` :
   - `accept` → sortie de boucle, étape validée (seulement possible si `passed`).
   - `correct` → itération de `BrainCorrectionLoop` existante ; si `targetRole` est fourni,
     il remplace `correction.targetRole`.
   - `reassign` → nouvelle `delegateTask` de la même étape vers `toRole`
     (`stage.agentRole` mis à jour, `agentReason` complété), puis re-vérification.
     Au plus une réaffectation par étape. Compte comme une tentative.
   - `abandon` → sortie de boucle, étape échouée, tentatives restantes non consommées.
   Avant chaque correction/réaffectation, `shouldContinue(state, "delegation")` est
   consulté ; un stop termine la boucle (étape échouée).
   En fin d'étape : `recordStageOutcome`.
4. **Avant chaque `replanSubgraph`** : `shouldContinue(state, "replan")`. Si stop → arrêt
   propre de la boucle de réplanification. Après un replan réussi, `selectAgents` est
   rappelé sur les nouvelles étapes.
5. **Délégation rejetée pour capacité** (`delegateTask` lève « capacité maximale ») : le
   Brain demande à l'`AgentSelector` le meilleur candidat alternatif disponible et retente
   une fois ; sinon comportement actuel (échec de l'étape).

`maxCorrectionAttempts` et `maxReplans` restent des **plafonds absolus** : le Lead peut
arrêter plus tôt, jamais prolonger.

### Résultat

`BrainExecutionResult` gagne des champs optionnels :
- `stopReason?: StopReason`
- `leadDecisions?: LeadDecision[]`
- `budgetUsage?: { delegations: number; wallTimeMs: number }`

Le `summary` mentionne la raison d'arrêt quand le Lead a stoppé. Chaque décision est
publiée sur `agentEventStream` (`event: "task_progress"`, `agentName: "Agent Lead"`,
`role: "planner"`, `taskId` = id d'étape ou de plan).

## 5. `AgentSelector` — choix des agents

Pour une étape : capacités requises = `inferRequiredCapabilities(title + description,
instructions)` (fonction existante de `server/agents/capabilityInference.ts`, déjà
utilisée par `negotiateTask`).

Candidats (dédupliqués, filtrés par `hasAgent`) :
1. le rôle proposé par le planner ;
2. les rôles du **même stade** pipeline dans `swarmComposer.plan({ objective })` ;
3. les rôles dont les capacités couvrent les capacités requises (`skillMatch > 0`).

Score : `contractNetNegotiator.buildAutoBid(role, task)` puis la même pondération que
`scoreBids` (exposée via une méthode publique `scoreBid(bid)` ajoutée au négociateur pour
ne pas dupliquer les poids). **Aucune enchère sur le bus.**

Règles :
- Le rôle du planner est conservé sauf si un candidat le dépasse de
  `SELECTION_MARGIN = 0.15`, ou si le rôle du planner est à `maxConcurrency`
  (`executor.getRunningCount`, exposé via `AgentOrchestrator.getRunningCount(role)`).
- Une étape dont le rôle est `planner` ou `architect` (ou de stade `design`/`research`)
  n'est jamais réaffectée vers un rôle de stade `build`, et inversement.
- `nextBest(stage, exclude[])` renvoie le meilleur candidat hors liste d'exclusion
  (utilisé par `reassign` et par le repli de capacité).

Toute réaffectation complète `stage.agentReason` (`"Agent Lead : <raison>"`).

## 6. `StageArbiter` — jugement par étape

Entrées : `StageVerification`, `TaskResult`, `stage`, numéro de tentative, plafond de
tentatives, `LeadRunState` (réaffectation déjà faite, historique des issues critiques),
signaux `AgentEvidenceEvaluator` (`isPlanningOnly(result.summary)`,
`isAnalysisOnlyTask(task)`).

Règles évaluées dans l'ordre :
1. `passed` mais l'étape est d'un rôle qui écrit (stade `build`), n'est pas une tâche
   d'analyse, `filesModified` est vide et le résultat est « planning only » →
   **correct** (« contradiction : vérification passée sans écriture »).
2. `passed` → **accept**.
3. Une issue `critical` dont la signature (`severity|file|message`) est déjà apparue
   pour cette étape → **abandon** (« pas de progrès »).
4. `result.outcome` ∈ {`blocked`, `failed`} sans `filesModified` ni outil exécuté, pas
   encore de réaffectation, et `AgentSelector.nextBest` renvoie un rôle → **reassign**.
5. Tentatives restantes → **correct**.
6. Sinon → **abandon** (« tentatives épuisées »).

Chaque verdict porte une `rationale` courte en français.

## 7. `StopController` — décision d'arrêt

`shouldContinue(state, point)` renvoie stop, dans cet ordre, si :
- `now - startedAt >= maxWallTimeMs` → `wall_time` ;
- `delegations >= maxDelegations` → `delegation_budget` ;
- `consecutiveFailures >= maxConsecutiveFailures` → `consecutive_failures` ;
- `point === "replan"` et le marqueur de progrès n'a pas augmenté depuis le replan
  précédent → `no_progress` (le premier replan est toujours autorisé).

Une fois stoppé, l'état reste stoppé (`state.stopped`) : tous les appels suivants
renvoient la même décision. `recordStageOutcome` remet `consecutiveFailures` à 0 sur un
succès.

## 8. Gestion des erreurs

Chaque appel de hook dans `AgentBrain` passe par un garde `safeLead(fn, fallback)` :
exception → `log.warn` + valeur de repli équivalente au comportement actuel
(rôle inchangé ; `correct` si tentatives restantes sinon `abandon` ; `continue`).
Le Lead ne peut jamais faire échouer une mission par lui-même.

## 9. Tests (TDD, `node --test`, sans réseau)

Unitaires :
- `AgentSelector.test.ts` : rôle conservé sous la marge ; réaffecté au-delà ; réaffecté
  si rôle à capacité ; garde stade design↔build ; `nextBest` avec exclusions.
- `StageArbiter.test.ts` : une règle par test (1 à 6).
- `StopController.test.ts` : chaque raison d'arrêt (horloge injectée) ; premier replan
  toujours autorisé ; état stoppé collant ; reset des échecs consécutifs.

Intégration (harnais existant `supervisor-harness.test.ts`, deps scriptées) :
- étape bloquée → réaffectée et validée ;
- issue critique répétée → abandon sans épuiser les corrections ;
- budget de délégations atteint → arrêt propre, `stopReason = "delegation_budget"` ;
- Lead qui lève une exception → mission identique au comportement sans Lead ;
- `lead: false` → aucun champ `leadDecisions`, comportement actuel.

Non-régression : `AgentBrain.test.ts`, `BrainScheduler.test.ts`,
`ContractNetNegotiator.test.ts` restent verts ; `npm run typecheck` passe.

## 10. Documentation

Ajouter une section « Agent Lead » à `docs/AGENTIC_RUNTIME.md` (points d'accroche,
budget, raisons d'arrêt, désactivation via `lead: false`).

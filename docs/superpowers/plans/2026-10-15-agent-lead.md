> **Statut au 2026-11-06 : IMPLÉMENTÉ dans le code.** Les modules `server/agents/lead/`
> sont présents (`AgentLead`, `AgentSelector`, `StageArbiter`, `StopController`) et
> les tests d'intégration/unitaires correspondants existent. Ce fichier est conservé comme
> trace du plan d'implémentation ; ne pas relancer les tâches cochées sans comparer le code.
> Référence : `server/agents/lead/AgentLead.ts`, `AgentLead.test.ts`,
> `AgentLead.integration.test.ts`.
>
> ---
>
# Agent Lead — plan d'implémentation

> **Pour les agents d'exécution :** SOUS-SKILL REQUIS : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe de case à cocher (`- [ ]`) pour le suivi.

**Objectif :** ajouter un Agent Lead qui choisit les agents, arbitre chaque étape et décide de l'arrêt, branché sur la boucle existante de l'`AgentBrain`.

**Architecture :** un nouveau dossier `server/agents/lead/` regroupe trois modules déterministes (`AgentSelector`, `StageArbiter`, `StopController`), composés par `AgentLead`, qui implémente l'interface `LeadPolicy`. `AgentBrain` appelle ces hooks à quatre moments : après la planification, avant chaque délégation, après chaque vérification et avant chaque réplanification. Chaque appel passe par un garde `safeLead` qui, en cas d'erreur, revient au comportement actuel. Aucune nouvelle boucle d'exécution n'est créée.

**Stack :** TypeScript (ESM, imports en `.js`), zod, `node:test` + `node:assert/strict` lancés via `tsx`.

**Spec :** `docs/superpowers/specs/2026-10-15-agent-lead-design.md`

## Contraintes globales

- L'Agent Lead est actif par défaut. `BrainGoalInput.lead === false` restaure strictement le comportement actuel.
- Budget par défaut : `maxWallTimeMs = 20 * 60_000`, `maxDelegations = 25`, `maxConsecutiveFailures = 3`.
- `SELECTION_MARGIN = 0.15`.
- Les décisions sont déterministes : aucun appel LLM, aucune enchère sur le bus.
- `maxCorrectionAttempts` et `maxReplans` restent des plafonds absolus : le Lead peut arrêter plus tôt, jamais prolonger.
- Une exception dans un hook du Lead ne fait jamais échouer une mission.
- Les décisions sont publiées sur `agentEventStream` avec `agentName: "Agent Lead"`.
- Tous les textes destinés à l'utilisateur sont en français.
- Lancer un fichier de test : `node --import tsx --import ./scripts/test-isolation.mjs --test <fichier>`.

## Points de vigilance de la revue

1. **Orchestrateur sans `getRunningCount`** (mocks, anciens moteurs) : le sélecteur ne doit jamais considérer un rôle comme saturé. Testé en tâche 2.
2. **Hook du Lead qui lève une exception** : la mission doit se dérouler comme sans Lead. Testé en tâche 5.
3. **Budget partiel ou à valeurs `undefined`** (`leadBudget: { maxDelegations: undefined }`) : on garde les valeurs par défaut au lieu de propager `undefined`/`NaN`. Testé en tâche 1.
4. **Rôle dynamique inconnu du pipeline** (ex. `data_analyst`) : il n'est jamais réaffecté, et `nextBest` renvoie `null`. Testé en tâche 2.
5. **Résultat d'étape absent** (`result` indéfini, ex. étape stoppée ou exception) : l'arbitre ne plante pas. Testé en tâche 3.

---

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `server/agents/lead/types.ts` | Créer | Contrats, budget par défaut, schémas zod, `createLeadRunState`, `progressMarker` |
| `server/agents/lead/StopController.ts` | Créer | Décision continuer/arrêter, comptabilité |
| `server/agents/lead/AgentSelector.ts` | Créer | Classement des candidats, choix et réaffectation de rôle |
| `server/agents/lead/StageArbiter.ts` | Créer | Verdict par étape |
| `server/agents/lead/AgentLead.ts` | Créer | `LeadPolicy` : composition, journal des décisions, publication |
| `server/agents/lead/index.ts` | Créer | Barrel |
| `server/agents/lead/*.test.ts` | Créer | Tests unitaires et d'intégration |
| `server/agents/ContractNetNegotiator.ts` | Modifier | `scoreBid(bid)` public (même pondération que `scoreBids`) |
| `server/agents/SwarmComposer.ts` | Modifier | `stageOfRole(role)` exporté |
| `server/agents/AgentOrchestrator.ts` | Modifier | `getRunningCount(role)` public |
| `server/agents/brain/types.ts` | Modifier | `lead`, `leadBudget` en entrée ; `stopReason`, `leadDecisions`, `budgetUsage` en sortie ; schéma |
| `server/agents/brain/AgentBrain.ts` | Modifier | Hooks du Lead dans `executeGoal` / `executeStage` |
| `server/routes/agents.ts`, `server/skills/agents.ts` | Modifier | Exposer `lead` / `leadBudget` et `stopReason` |
| `docs/AGENTIC_RUNTIME.md` | Modifier | Section « Agent Lead » |

---

### Tâche 1 : contrats et `StopController`

**Fichiers :**
- Créer : `server/agents/lead/types.ts`
- Créer : `server/agents/lead/StopController.ts`
- Test : `server/agents/lead/StopController.test.ts`

**Interfaces :**
- Produit : tous les types de `types.ts` (ci-dessous), `createLeadRunState(planId, goal, budget, startedAt)`, `progressMarker(state)`, `leadOptionsShape`, et `class StopController { constructor(now?: () => number); shouldContinue(state, point): StopDecision; recordDelegation(state): void; recordStageOutcome(state, stageId, passed, filesVerified): void }`.

- [ ] **Étape 1 : créer `server/agents/lead/types.ts`**

```ts
import { z } from "zod";
import type { AgentRole, TaskResult } from "../types.js";
import type { BrainPlan, BrainStage, StageVerification } from "../brain/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Lead — contrats de la couche de décision branchée sur l'AgentBrain
// ═══════════════════════════════════════════════════════════════════════════════

export type StopReason = "wall_time" | "delegation_budget" | "consecutive_failures" | "no_progress";

export type StopDecision =
  | { continue: true }
  | { continue: false; reason: StopReason; detail: string };

export type LeadStop = Extract<StopDecision, { continue: false }>;

export type ArbitrationVerdict =
  | { action: "accept"; rationale: string }
  | { action: "correct"; rationale: string; targetRole?: AgentRole }
  | { action: "reassign"; rationale: string; toRole: AgentRole }
  | { action: "abandon"; rationale: string };

export type DelegationKind = "stage" | "correction" | "reassign";

export interface LeadBudget {
  maxWallTimeMs: number;
  maxDelegations: number;
  maxConsecutiveFailures: number;
}

export const DEFAULT_LEAD_BUDGET: Readonly<LeadBudget> = Object.freeze({
  maxWallTimeMs: 20 * 60_000,
  maxDelegations: 25,
  maxConsecutiveFailures: 3,
});

export interface LeadDecision {
  kind: "select" | "arbitrate" | "stop";
  stageId?: string;
  summary: string;
  rationale: string;
  timestamp: string;
}

export interface LeadRunState {
  planId: string;
  goal: string;
  startedAt: number;
  budget: LeadBudget;
  delegations: number;
  consecutiveFailures: number;
  completedStages: Set<string>;
  filesVerified: number;
  /** Marqueur de progrès relevé au dernier replan autorisé (null = aucun replan encore). */
  lastReplanMarker: number | null;
  reassigned: Set<string>;
  /** stageId → signatures des issues critiques déjà vues. */
  issueHistory: Map<string, Set<string>>;
  decisions: LeadDecision[];
  stopped?: LeadStop;
}

export interface ArbitrationInput {
  stage: BrainStage;
  verification: StageVerification;
  result?: TaskResult;
  /** Numéro (1-based) de la prochaine tentative de correction. */
  attempt: number;
  maxAttempts: number;
}

export interface LeadPolicy {
  begin(plan: BrainPlan, budget?: Partial<LeadBudget>): LeadRunState;
  selectAgents(plan: BrainPlan, state: LeadRunState): void;
  arbitrate(input: ArbitrationInput, state: LeadRunState): ArbitrationVerdict;
  shouldContinue(state: LeadRunState, point: "delegation" | "replan"): StopDecision;
  nextBestRole(stage: BrainStage, state: LeadRunState, exclude: AgentRole[]): AgentRole | null;
  recordDelegation(state: LeadRunState, kind: DelegationKind): void;
  recordStageOutcome(state: LeadRunState, stageId: string, passed: boolean, filesVerified: number): void;
}

/** Fusionne un budget partiel avec les défauts ; ignore les valeurs absentes, non finies ou ≤ 0. */
export function resolveLeadBudget(budget?: Partial<LeadBudget>): LeadBudget {
  const merged: LeadBudget = { ...DEFAULT_LEAD_BUDGET };
  for (const key of Object.keys(merged) as Array<keyof LeadBudget>) {
    const value = budget?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) merged[key] = value;
  }
  return merged;
}

export function createLeadRunState(
  planId: string,
  goal: string,
  budget: Partial<LeadBudget> | undefined,
  startedAt: number
): LeadRunState {
  return {
    planId,
    goal,
    startedAt,
    budget: resolveLeadBudget(budget),
    delegations: 0,
    consecutiveFailures: 0,
    completedStages: new Set<string>(),
    filesVerified: 0,
    lastReplanMarker: null,
    reassigned: new Set<string>(),
    issueHistory: new Map<string, Set<string>>(),
    decisions: [],
  };
}

/** Progrès mesurable : étapes validées + fichiers vérifiés. */
export function progressMarker(state: LeadRunState): number {
  return state.completedStages.size + state.filesVerified;
}

// ─── Schémas d'entrée (API, outil, route) ─────────────────────────────────────

export const leadBudgetSchema = z.object({
  maxWallTimeMs: z.number().int().min(10_000).max(2 * 60 * 60_000).optional(),
  maxDelegations: z.number().int().min(1).max(200).optional(),
  maxConsecutiveFailures: z.number().int().min(1).max(20).optional(),
});

/** Champs à ajouter aux schémas d'exécution du Brain. */
export const leadOptionsShape = {
  lead: z.boolean().optional(),
  leadBudget: leadBudgetSchema.optional(),
};
```

- [ ] **Étape 2 : écrire le test qui échoue, `server/agents/lead/StopController.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { StopController } from "./StopController.js";
import { createLeadRunState, DEFAULT_LEAD_BUDGET, resolveLeadBudget } from "./types.js";

function stateAt(startedAt: number, budget = {}) {
  return createLeadRunState("plan-1", "objectif", budget, startedAt);
}

describe("resolveLeadBudget", () => {
  it("garde les défauts pour un budget vide, undefined ou invalide", () => {
    assert.deepEqual(resolveLeadBudget(), { ...DEFAULT_LEAD_BUDGET });
    assert.deepEqual(resolveLeadBudget({}), { ...DEFAULT_LEAD_BUDGET });
    const r = resolveLeadBudget({ maxDelegations: undefined, maxWallTimeMs: Number.NaN, maxConsecutiveFailures: 0 });
    assert.deepEqual(r, { ...DEFAULT_LEAD_BUDGET });
  });

  it("applique les valeurs fournies", () => {
    assert.equal(resolveLeadBudget({ maxDelegations: 4 }).maxDelegations, 4);
  });
});

describe("StopController", () => {
  it("continue tant que le budget tient", () => {
    const stop = new StopController(() => 1_000);
    assert.deepEqual(stop.shouldContinue(stateAt(0), "delegation"), { continue: true });
  });

  it("stoppe sur la durée maximale", () => {
    const stop = new StopController(() => 5_000);
    const d = stop.shouldContinue(stateAt(0, { maxWallTimeMs: 5_000 }), "delegation");
    assert.equal(d.continue, false);
    assert.equal(!d.continue && d.reason, "wall_time");
  });

  it("stoppe sur le budget de délégations", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0, { maxDelegations: 2 });
    stop.recordDelegation(state);
    assert.equal(stop.shouldContinue(state, "delegation").continue, true);
    stop.recordDelegation(state);
    const d = stop.shouldContinue(state, "delegation");
    assert.equal(!d.continue && d.reason, "delegation_budget");
  });

  it("stoppe après N échecs consécutifs et remet le compteur à zéro sur un succès", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0, { maxConsecutiveFailures: 2 });
    stop.recordStageOutcome(state, "s1", false, 0);
    stop.recordStageOutcome(state, "s2", true, 1);
    assert.equal(state.consecutiveFailures, 0);
    stop.recordStageOutcome(state, "s3", false, 1);
    stop.recordStageOutcome(state, "s4", false, 1);
    const d = stop.shouldContinue(state, "delegation");
    assert.equal(!d.continue && d.reason, "consecutive_failures");
  });

  it("autorise toujours le premier replan puis stoppe sans progrès", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0);
    assert.equal(stop.shouldContinue(state, "replan").continue, true);
    const d = stop.shouldContinue(state, "replan");
    assert.equal(!d.continue && d.reason, "no_progress");
  });

  it("autorise un nouveau replan s'il y a eu du progrès", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0);
    assert.equal(stop.shouldContinue(state, "replan").continue, true);
    stop.recordStageOutcome(state, "s1", true, 1);
    assert.equal(stop.shouldContinue(state, "replan").continue, true);
  });

  it("un état stoppé le reste (décision collante)", () => {
    let now = 10_000;
    const stop = new StopController(() => now);
    const state = stateAt(0, { maxWallTimeMs: 10_000 });
    const first = stop.shouldContinue(state, "delegation");
    now = 0;
    assert.deepEqual(stop.shouldContinue(state, "delegation"), first);
    assert.deepEqual(state.stopped, first);
  });
});
```

- [ ] **Étape 3 : vérifier que le test échoue**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/StopController.test.ts`
Attendu : ÉCHEC, `Cannot find module './StopController.js'`.

- [ ] **Étape 4 : implémenter `server/agents/lead/StopController.ts`**

```ts
import { progressMarker, type LeadRunState, type LeadStop, type StopDecision } from "./types.js";

/**
 * Décide si l'Agent Lead autorise une nouvelle délégation ou réplanification.
 * Arrêt collant : une fois stoppé, toutes les décisions suivantes sont identiques.
 */
export class StopController {
  constructor(private readonly now: () => number = Date.now) {}

  shouldContinue(state: LeadRunState, point: "delegation" | "replan"): StopDecision {
    if (state.stopped) return state.stopped;
    const stop = this.evaluate(state, point);
    if (stop) {
      state.stopped = stop;
      return stop;
    }
    if (point === "replan") state.lastReplanMarker = progressMarker(state);
    return { continue: true };
  }

  recordDelegation(state: LeadRunState): void {
    state.delegations++;
  }

  recordStageOutcome(state: LeadRunState, stageId: string, passed: boolean, filesVerified: number): void {
    if (passed) {
      state.completedStages.add(stageId);
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures++;
    }
    state.filesVerified = Math.max(state.filesVerified, filesVerified);
  }

  private evaluate(state: LeadRunState, point: "delegation" | "replan"): LeadStop | null {
    const { budget } = state;
    const elapsed = this.now() - state.startedAt;
    if (elapsed >= budget.maxWallTimeMs) {
      return { continue: false, reason: "wall_time", detail: `durée ${Math.round(elapsed / 1000)}s ≥ ${Math.round(budget.maxWallTimeMs / 1000)}s` };
    }
    if (state.delegations >= budget.maxDelegations) {
      return { continue: false, reason: "delegation_budget", detail: `${state.delegations} délégation(s) ≥ budget de ${budget.maxDelegations}` };
    }
    if (state.consecutiveFailures >= budget.maxConsecutiveFailures) {
      return { continue: false, reason: "consecutive_failures", detail: `${state.consecutiveFailures} échec(s) consécutif(s)` };
    }
    if (point === "replan" && state.lastReplanMarker !== null && progressMarker(state) <= state.lastReplanMarker) {
      return { continue: false, reason: "no_progress", detail: "aucun progrès depuis la dernière réplanification" };
    }
    return null;
  }
}
```

- [ ] **Étape 5 : vérifier que le test passe**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/StopController.test.ts`
Attendu : RÉUSSITE (9 tests).

- [ ] **Étape 6 : commit**

```bash
git add server/agents/lead/types.ts server/agents/lead/StopController.ts server/agents/lead/StopController.test.ts
git commit -m "feat(lead): contrats Agent Lead et StopController"
```

---

### Tâche 2 : `AgentSelector` et ses points d'appui

**Fichiers :**
- Modifier : `server/agents/ContractNetNegotiator.ts` (méthode `scoreBids`, ~ligne 409)
- Modifier : `server/agents/SwarmComposer.ts` (après la constante `ROLE_STAGE`)
- Modifier : `server/agents/AgentOrchestrator.ts` (section « Requêtes », après `getTask`)
- Créer : `server/agents/lead/AgentSelector.ts`
- Test : `server/agents/lead/AgentSelector.test.ts`

**Interfaces :**
- Consomme : `BrainStage` (brain/types), `contractNetNegotiator.buildAutoBid(role, task): Bid | null`.
- Produit : `ContractNetNegotiator.scoreBid(bid: Bid): number` ; `stageOfRole(role: AgentRole): SwarmStage | undefined` ; `AgentOrchestrator.getRunningCount(role: AgentRole): number` ; `SELECTION_MARGIN` ; `interface RoleScore { score: number; skillMatch: number }` ; `interface AgentSelectorDeps` ; `interface RoleChoice { role; changed; rationale }` ; `class AgentSelector { constructor(deps?); isSaturated(role): boolean; choose(stage, goal): RoleChoice; nextBest(stage, goal, exclude: AgentRole[]): AgentRole | null }`.

- [ ] **Étape 1 : écrire le test qui échoue, `server/agents/lead/AgentSelector.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AgentSelector, type AgentSelectorDeps } from "./AgentSelector.js";
import { stageOfRole } from "../SwarmComposer.js";
import type { BrainStage } from "../brain/types.js";

const STAGES: Record<string, "build" | "design" | "verify"> = {
  debugger: "build", coder: "build", refactor: "build", architect: "design", tester: "verify",
};

function stage(role: string): BrainStage {
  return {
    id: "s1", title: "Corriger le bug", description: "Corrige src/a.ts", agentRole: role, agentReason: "planner",
    skills: [], tools: [], files: [], instructions: "", dependsOn: [], status: "pending", priority: "high",
  };
}

function selector(scores: Record<string, number>, extra: Partial<AgentSelectorDeps> = {}) {
  return new AgentSelector({
    scoreRole: (role) => (role in scores ? { score: scores[role], skillMatch: scores[role] > 0 ? 1 : 0 } : null),
    teamRoles: () => [],
    candidateRoles: () => Object.keys(scores),
    roleExists: () => true,
    inferCapabilities: () => ["code"],
    stageOf: (role) => STAGES[role],
    ...extra,
  });
}

describe("AgentSelector.choose", () => {
  it("conserve le rôle du planner sous la marge", () => {
    const c = selector({ debugger: 0.8, coder: 0.9 }).choose(stage("debugger"), "objectif");
    assert.deepEqual([c.role, c.changed], ["debugger", false]);
  });

  it("réaffecte au-delà de la marge", () => {
    const c = selector({ debugger: 0.6, coder: 0.9 }).choose(stage("debugger"), "objectif");
    assert.deepEqual([c.role, c.changed], ["coder", true]);
    assert.match(c.rationale, /coder/);
  });

  it("réaffecte si le rôle du planner est à capacité maximale", () => {
    const s = selector({ debugger: 0.9, coder: 0.5 }, {
      runningCount: (role) => (role === "debugger" ? 1 : 0),
      maxConcurrency: () => 1,
    });
    const c = s.choose(stage("debugger"), "objectif");
    assert.deepEqual([c.role, c.changed], ["coder", true]);
    assert.match(c.rationale, /capacité/);
  });

  it("ne considère jamais un rôle saturé sans compteur de tâches en cours", () => {
    const s = selector({ debugger: 0.9 }, { maxConcurrency: () => 1 });
    assert.equal(s.isSaturated("debugger"), false);
  });

  it("ne réaffecte jamais design ↔ build", () => {
    const c = selector({ architect: 0.1, coder: 1 }).choose(stage("architect"), "objectif");
    assert.deepEqual([c.role, c.changed], ["architect", false]);
  });

  it("ignore un candidat sans compétence requise", () => {
    const s = new AgentSelector({
      scoreRole: (role) => (role === "coder" ? { score: 0.99, skillMatch: 0 } : { score: 0.2, skillMatch: 1 }),
      teamRoles: () => [], candidateRoles: () => ["debugger", "coder"], roleExists: () => true,
      inferCapabilities: () => ["code"], stageOf: (role) => STAGES[role],
    });
    assert.equal(s.choose(stage("debugger"), "objectif").changed, false);
  });

  it("ne touche pas un rôle hors pipeline connu", () => {
    const s = selector({ data_analyst: 0.1, coder: 1 });
    const c = s.choose(stage("data_analyst"), "objectif");
    assert.deepEqual([c.role, c.changed], ["data_analyst", false]);
    assert.equal(s.nextBest(stage("data_analyst"), "objectif", ["data_analyst"]), null);
  });
});

describe("AgentSelector.nextBest", () => {
  it("renvoie le meilleur candidat hors exclusions et non saturé", () => {
    const s = selector({ debugger: 0.9, coder: 0.7, refactor: 0.5 }, {
      runningCount: (role) => (role === "coder" ? 1 : 0),
      maxConcurrency: () => 1,
    });
    assert.equal(s.nextBest(stage("debugger"), "objectif", ["debugger"]), "refactor");
  });

  it("renvoie null quand aucun candidat ne reste", () => {
    assert.equal(selector({ debugger: 0.9 }).nextBest(stage("debugger"), "objectif", ["debugger"]), null);
  });
});

describe("stageOfRole", () => {
  it("cartographie les rôles connus et ignore les clés du prototype", () => {
    assert.equal(stageOfRole("coder"), "build");
    assert.equal(stageOfRole("toString"), undefined);
    assert.equal(stageOfRole("data_analyst"), undefined);
  });
});
```

- [ ] **Étape 2 : vérifier que le test échoue**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/AgentSelector.test.ts`
Attendu : ÉCHEC, `Cannot find module './AgentSelector.js'`.

- [ ] **Étape 3 : exporter `stageOfRole` dans `server/agents/SwarmComposer.ts`**

Insérer juste après la fermeture de `const ROLE_STAGE: Record<string, SwarmStage> = { ... };` :

```ts
/** Stade pipeline d'un rôle connu ; undefined pour un rôle non cartographié. */
export function stageOfRole(role: AgentRole): SwarmStage | undefined {
  return Object.prototype.hasOwnProperty.call(ROLE_STAGE, role) ? ROLE_STAGE[role] : undefined;
}
```

- [ ] **Étape 4 : exposer `scoreBid` dans `server/agents/ContractNetNegotiator.ts`**

Remplacer le corps de calcul de `scoreBids` (le bloc `const clampedSkill … const score = …;`) par un appel à la nouvelle méthode, et ajouter la méthode publique juste au-dessus de `skillMatchFor` :

```ts
  /**
   * Score pondéré d'un bid (mêmes poids que l'enchère). Exposé pour que
   * l'Agent Lead classe des candidats sans ouvrir d'enchère sur le bus.
   */
  scoreBid(bid: Bid): number {
    return (
      this.weights.skill * clamp01(bid.skillMatch) +
      this.weights.confidence * clamp01(bid.confidence) -
      this.weights.load * clamp01(bid.loadPenalty)
    );
  }
```

```ts
  private scoreBids(bids: Bid[], requiredCapabilities: readonly string[]): ScoredBid[] {
    return bids.map((bid) => ({
      ...bid,
      skillMatch: clamp01(bid.skillMatch),
      confidence: clamp01(bid.confidence),
      loadPenalty: clamp01(bid.loadPenalty),
      score: this.scoreBid(bid),
      eligible: clamp01(bid.skillMatch) > 0,
      specificity: this.computeSpecificity(bid.role, requiredCapabilities),
    }));
  }
```

- [ ] **Étape 5 : exposer `getRunningCount` dans `server/agents/AgentOrchestrator.ts`**

Insérer juste après la méthode `getTask(taskId: string)` :

```ts
  /** Nombre de tâches en cours pour un rôle (lu par l'Agent Lead pour la capacité). */
  getRunningCount(role: AgentRole): number {
    return this.executor.getRunningCount(role);
  }
```

- [ ] **Étape 6 : implémenter `server/agents/lead/AgentSelector.ts`**

```ts
import { contractNetNegotiator } from "../ContractNetNegotiator.js";
import { swarmComposer, stageOfRole, type SwarmStage } from "../SwarmComposer.js";
import { getAgentDefinition, hasAgent, listAgentRoles } from "../roles.js";
import { inferRequiredCapabilities } from "../capabilityInference.js";
import type { AgentRole } from "../types.js";
import type { BrainStage } from "../brain/types.js";

/** Écart de score minimal pour qu'un autre rôle remplace celui du planner. */
export const SELECTION_MARGIN = 0.15;

export interface RoleScore {
  score: number;
  skillMatch: number;
}

/** Dépendances injectables (toutes optionnelles ; défauts = modules réels). */
export interface AgentSelectorDeps {
  scoreRole?: (role: AgentRole, requiredCapabilities: string[]) => RoleScore | null;
  runningCount?: (role: AgentRole) => number;
  maxConcurrency?: (role: AgentRole) => number | undefined;
  teamRoles?: (objective: string) => AgentRole[];
  candidateRoles?: () => AgentRole[];
  roleExists?: (role: AgentRole) => boolean;
  inferCapabilities?: (text: string, instructions?: string) => string[];
  stageOf?: (role: AgentRole) => SwarmStage | undefined;
}

export interface RoleChoice {
  role: AgentRole;
  changed: boolean;
  rationale: string;
}

interface RankedRole {
  role: AgentRole;
  score: number;
}

/** Familles étanches : on ne réaffecte jamais une étape de réflexion vers de l'écriture (et inversement). */
function familyOf(stage: SwarmStage): string {
  return stage === "research" || stage === "design" ? "think" : stage;
}

function defaultScoreRole(role: AgentRole, requiredCapabilities: string[]): RoleScore | null {
  const bid = contractNetNegotiator.buildAutoBid(role, {
    taskId: "agent-lead-selection",
    title: "",
    description: "",
    requiredCapabilities,
  });
  if (!bid) return null;
  return { score: contractNetNegotiator.scoreBid(bid), skillMatch: bid.skillMatch };
}

/**
 * Choix déterministe de l'agent d'une étape : réutilise la composition
 * d'équipe (SwarmComposer) et le scoring contract-net, sans enchère sur le bus.
 */
export class AgentSelector {
  private readonly deps: Required<AgentSelectorDeps>;

  constructor(deps: AgentSelectorDeps = {}) {
    this.deps = {
      scoreRole: deps.scoreRole ?? defaultScoreRole,
      runningCount: deps.runningCount ?? (() => 0),
      maxConcurrency: deps.maxConcurrency ?? ((role) => getAgentDefinition(role)?.maxConcurrency),
      teamRoles: deps.teamRoles ?? ((objective) => swarmComposer.plan({ objective: { title: objective } }).pipeline),
      candidateRoles: deps.candidateRoles ?? (() => listAgentRoles()),
      roleExists: deps.roleExists ?? hasAgent,
      inferCapabilities: deps.inferCapabilities ?? inferRequiredCapabilities,
      stageOf: deps.stageOf ?? stageOfRole,
    };
  }

  isSaturated(role: AgentRole): boolean {
    const max = this.deps.maxConcurrency(role);
    return typeof max === "number" && this.deps.runningCount(role) >= max;
  }

  choose(stage: BrainStage, goal: string): RoleChoice {
    const current = stage.agentRole;
    if (!this.deps.stageOf(current)) {
      return { role: current, changed: false, rationale: "rôle hors pipeline connu : conservé" };
    }
    const ranked = this.rank(stage, goal, []);
    const currentScore = ranked.find((r) => r.role === current)?.score ?? 0;

    if (this.isSaturated(current)) {
      const alt = ranked.find((r) => r.role !== current && !this.isSaturated(r.role));
      if (alt) {
        return { role: alt.role, changed: true, rationale: `${current} à capacité maximale → ${alt.role} (score ${alt.score.toFixed(2)})` };
      }
    }

    const best = ranked[0];
    if (best && best.role !== current && best.score - currentScore >= SELECTION_MARGIN) {
      return {
        role: best.role,
        changed: true,
        rationale: `${best.role} plus adapté que ${current} (score ${best.score.toFixed(2)} vs ${currentScore.toFixed(2)})`,
      };
    }
    return { role: current, changed: false, rationale: "rôle du planner conservé" };
  }

  nextBest(stage: BrainStage, goal: string, exclude: AgentRole[]): AgentRole | null {
    if (!this.deps.stageOf(stage.agentRole)) return null;
    const alt = this.rank(stage, goal, exclude).find((r) => !this.isSaturated(r.role));
    return alt?.role ?? null;
  }

  private rank(stage: BrainStage, goal: string, exclude: AgentRole[]): RankedRole[] {
    const currentStage = this.deps.stageOf(stage.agentRole);
    if (!currentStage) return [];
    const family = familyOf(currentStage);
    const required = this.deps.inferCapabilities(`${stage.title} ${stage.description}`, stage.instructions);
    const pool = new Set<AgentRole>([
      stage.agentRole,
      ...this.deps.teamRoles(`${goal} ${stage.title}`),
      ...this.deps.candidateRoles(),
    ]);

    const ranked: RankedRole[] = [];
    for (const role of pool) {
      if (exclude.includes(role) || !this.deps.roleExists(role)) continue;
      const candidateStage = this.deps.stageOf(role);
      if (!candidateStage || familyOf(candidateStage) !== family) continue;
      const scored = this.deps.scoreRole(role, required);
      if (!scored) continue;
      if (role !== stage.agentRole && scored.skillMatch <= 0) continue;
      ranked.push({ role, score: scored.score });
    }
    return ranked.sort((a, b) => b.score - a.score || a.role.localeCompare(b.role));
  }
}
```

- [ ] **Étape 7 : vérifier que les tests passent, y compris la non-régression du négociateur**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/AgentSelector.test.ts server/agents/ContractNetNegotiator.test.ts server/agents/SwarmComposer.test.ts`
Attendu : RÉUSSITE pour les trois fichiers.

- [ ] **Étape 8 : commit**

```bash
git add server/agents/lead/AgentSelector.ts server/agents/lead/AgentSelector.test.ts server/agents/ContractNetNegotiator.ts server/agents/SwarmComposer.ts server/agents/AgentOrchestrator.ts
git commit -m "feat(lead): AgentSelector sur SwarmComposer et scoring contract-net"
```

---

### Tâche 3 : `StageArbiter`

**Fichiers :**
- Créer : `server/agents/lead/StageArbiter.ts`
- Test : `server/agents/lead/StageArbiter.test.ts`

**Interfaces :**
- Consomme : `ArbitrationInput`, `ArbitrationVerdict`, `LeadRunState`, `createLeadRunState` (tâche 1) ; `stageOfRole` (tâche 2) ; `AgentEvidenceEvaluator.isPlanningOnly(text): boolean`.
- Produit : `interface StageArbiterDeps { isPlanningOnly?; stageOf? }` ; `class StageArbiter { constructor(deps?); arbitrate(input: ArbitrationInput, state: LeadRunState, nextBest: () => AgentRole | null): ArbitrationVerdict }`. Effets de bord sur l'état : `state.issueHistory` (signatures critiques) et `state.reassigned` (quand le verdict est `reassign`).

- [ ] **Étape 1 : écrire le test qui échoue, `server/agents/lead/StageArbiter.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { StageArbiter } from "./StageArbiter.js";
import { createLeadRunState, type ArbitrationInput } from "./types.js";
import type { BrainStage, StageVerification, VerificationIssue } from "../brain/types.js";
import type { TaskResult } from "../types.js";

const stage = (role = "coder"): BrainStage => ({
  id: "s1", title: "Étape", description: "", agentRole: role, agentReason: "", skills: [], tools: [],
  files: [], instructions: "", dependsOn: [], status: "running", priority: "high",
});

const verification = (passed: boolean, issues: VerificationIssue[] = []): StageVerification => ({
  stageId: "s1", role: "coder", passed, syntaxCheckOk: passed, testsOk: passed, semanticCheckOk: passed,
  issues, summary: passed ? "ok" : "ko", timestamp: new Date().toISOString(),
});

const result = (over: Partial<TaskResult> = {}): TaskResult => ({
  success: true, outcome: "success", summary: "Fichier corrigé et vérifié.", durationMs: 1, filesModified: ["a.ts"], ...over,
});

function input(over: Partial<ArbitrationInput> = {}): ArbitrationInput {
  return { stage: stage(), verification: verification(true), result: result(), attempt: 1, maxAttempts: 3, ...over };
}

const arbiter = new StageArbiter();
const none = () => null;
const state = () => createLeadRunState("p", "objectif", undefined, 0);

describe("StageArbiter", () => {
  it("règle 1 : vérification passée sans écriture et plan seulement → correct", () => {
    const v = arbiter.arbitrate(
      input({ result: result({ filesModified: [], summary: "Je vais modifier le fichier ensuite." }) }),
      state(), none
    );
    assert.equal(v.action, "correct");
    assert.match(v.rationale, /contradiction/);
  });

  it("règle 1 sans tentative restante → abandon", () => {
    const v = arbiter.arbitrate(
      input({ attempt: 4, result: result({ filesModified: [], summary: "Je vais modifier le fichier ensuite." }) }),
      state(), none
    );
    assert.equal(v.action, "abandon");
  });

  it("règle 1 ne s'applique pas à un rôle de revue", () => {
    const v = arbiter.arbitrate(
      input({ stage: stage("reviewer"), result: result({ filesModified: [], summary: "Je vais relire." }) }),
      state(), none
    );
    assert.equal(v.action, "accept");
  });

  it("règle 2 : vérification passée → accept", () => {
    assert.equal(arbiter.arbitrate(input(), state(), none).action, "accept");
  });

  it("accepte une étape passée sans résultat", () => {
    assert.equal(arbiter.arbitrate(input({ result: undefined }), state(), none).action, "accept");
  });

  it("règle 3 : issue critique répétée → abandon", () => {
    const s = state();
    const crit: VerificationIssue[] = [{ severity: "critical", message: "build cassé", file: "a.ts" }];
    const first = arbiter.arbitrate(input({ verification: verification(false, crit) }), s, none);
    assert.equal(first.action, "correct");
    const second = arbiter.arbitrate(input({ verification: verification(false, crit), attempt: 2 }), s, none);
    assert.equal(second.action, "abandon");
    assert.match(second.rationale, /build cassé/);
  });

  it("règle 4 : bloqué sans trace → reassign, une seule fois par étape", () => {
    const s = state();
    const blocked = input({ verification: verification(false), result: result({ success: false, outcome: "blocked", filesModified: [] }) });
    const first = arbiter.arbitrate(blocked, s, () => "debugger");
    assert.deepEqual([first.action, first.action === "reassign" && first.toRole], ["reassign", "debugger"]);
    assert.ok(s.reassigned.has("s1"));
    assert.equal(arbiter.arbitrate(blocked, s, () => "debugger").action, "correct");
  });

  it("règle 4 : échec avec outils exécutés → pas de réaffectation", () => {
    const v = arbiter.arbitrate(
      input({
        verification: verification(false),
        result: result({
          success: false, outcome: "failed", filesModified: [],
          evidence: { filesRead: [], filesModified: [], toolsExecuted: ["read_project_file"], commandsExecuted: [] },
        }),
      }),
      state(), () => "debugger"
    );
    assert.equal(v.action, "correct");
  });

  it("règles 5/6 : correct tant qu'il reste des tentatives, puis abandon", () => {
    assert.equal(arbiter.arbitrate(input({ verification: verification(false), attempt: 3 }), state(), none).action, "correct");
    assert.equal(arbiter.arbitrate(input({ verification: verification(false), attempt: 4 }), state(), none).action, "abandon");
  });
});
```

- [ ] **Étape 2 : vérifier que le test échoue**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/StageArbiter.test.ts`
Attendu : ÉCHEC, `Cannot find module './StageArbiter.js'`.

- [ ] **Étape 3 : implémenter `server/agents/lead/StageArbiter.ts`**

```ts
import { AgentEvidenceEvaluator } from "../AgentEvidenceEvaluator.js";
import { stageOfRole, type SwarmStage } from "../SwarmComposer.js";
import type { AgentRole } from "../types.js";
import type { ArbitrationInput, ArbitrationVerdict, LeadRunState } from "./types.js";

export interface StageArbiterDeps {
  isPlanningOnly?: (text: string) => boolean;
  stageOf?: (role: AgentRole) => SwarmStage | undefined;
}

/**
 * Jugement par étape de l'Agent Lead : combine le verdict du vérificateur,
 * les preuves d'exécution et l'historique de l'étape. Règles appliquées dans
 * l'ordre (spec §6).
 */
export class StageArbiter {
  private readonly isPlanningOnly: (text: string) => boolean;
  private readonly stageOf: (role: AgentRole) => SwarmStage | undefined;

  constructor(deps: StageArbiterDeps = {}) {
    const evaluator = new AgentEvidenceEvaluator();
    this.isPlanningOnly = deps.isPlanningOnly ?? ((text) => evaluator.isPlanningOnly(text));
    this.stageOf = deps.stageOf ?? stageOfRole;
  }

  arbitrate(input: ArbitrationInput, state: LeadRunState, nextBest: () => AgentRole | null): ArbitrationVerdict {
    const { stage, verification, result, attempt, maxAttempts } = input;
    const attemptsLeft = attempt <= maxAttempts;
    const filesModified = result?.filesModified ?? [];

    if (verification.passed) {
      const writes = this.stageOf(stage.agentRole) === "build";
      if (writes && filesModified.length === 0 && this.isPlanningOnly(result?.summary ?? "")) {
        return attemptsLeft
          ? { action: "correct", rationale: "contradiction : vérification passée sans aucune écriture (plan seulement)" }
          : { action: "abandon", rationale: "aucune écriture produite malgré les corrections" };
      }
      return { action: "accept", rationale: "vérification réussie" };
    }

    const signatures = verification.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => `${issue.file ?? ""}|${issue.message}`);
    const seen = state.issueHistory.get(stage.id) ?? new Set<string>();
    const repeated = signatures.find((sig) => seen.has(sig));
    for (const sig of signatures) seen.add(sig);
    state.issueHistory.set(stage.id, seen);
    if (repeated) {
      return { action: "abandon", rationale: `issue critique répétée sans progrès : ${repeated.split("|").slice(1).join("|")}` };
    }

    const noTrace = filesModified.length === 0 && (result?.evidence?.toolsExecuted?.length ?? 0) === 0;
    const unproductive = result?.outcome === "blocked" || result?.outcome === "failed";
    if (unproductive && noTrace && attemptsLeft && !state.reassigned.has(stage.id)) {
      const toRole = nextBest();
      if (toRole) {
        state.reassigned.add(stage.id);
        return { action: "reassign", toRole, rationale: `${stage.agentRole} n'a rien produit (${result?.outcome}) → ${toRole}` };
      }
    }

    if (attemptsLeft) return { action: "correct", rationale: "vérification échouée : correction" };
    return { action: "abandon", rationale: "tentatives de correction épuisées" };
  }
}
```

- [ ] **Étape 4 : vérifier que le test passe**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/StageArbiter.test.ts`
Attendu : RÉUSSITE (9 tests).

- [ ] **Étape 5 : commit**

```bash
git add server/agents/lead/StageArbiter.ts server/agents/lead/StageArbiter.test.ts
git commit -m "feat(lead): StageArbiter, jugement par étape"
```

---

### Tâche 4 : `AgentLead` (implémentation de `LeadPolicy`)

**Fichiers :**
- Créer : `server/agents/lead/AgentLead.ts`
- Créer : `server/agents/lead/index.ts`
- Test : `server/agents/lead/AgentLead.test.ts`

**Interfaces :**
- Consomme : tâches 1 à 3, et `agentEventStream.publish(event)`.
- Produit : `interface AgentLeadOptions { now?; runningCount?; selector?; arbiter?; stopController?; publish? }` ; `class AgentLead implements LeadPolicy`. Le barrel `index.ts` réexporte tout le dossier.

- [ ] **Étape 1 : écrire le test qui échoue, `server/agents/lead/AgentLead.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AgentLead } from "./AgentLead.js";
import { AgentSelector } from "./AgentSelector.js";
import { DEFAULT_LEAD_BUDGET, type LeadDecision } from "./types.js";
import type { BrainPlan, BrainStage, StageVerification } from "../brain/types.js";

const STAGES: Record<string, "build"> = { debugger: "build", coder: "build" };

function makeSelector(scores: Record<string, number>) {
  return new AgentSelector({
    scoreRole: (role) => (role in scores ? { score: scores[role], skillMatch: 1 } : null),
    teamRoles: () => [], candidateRoles: () => Object.keys(scores), roleExists: () => true,
    inferCapabilities: () => ["code"], stageOf: (role) => STAGES[role],
  });
}

function stage(id: string, role: string, status: BrainStage["status"] = "pending"): BrainStage {
  return {
    id, title: `Étape ${id}`, description: "", agentRole: role, agentReason: "planner", skills: [], tools: [],
    files: [], instructions: "", dependsOn: [], status, priority: "high",
  };
}

function plan(stages: BrainStage[]): BrainPlan {
  return {
    id: "plan-lead", goal: "objectif", stages, estimatedDurationMs: 0, architectureRationale: "",
    createdAt: new Date().toISOString(), status: "executing",
    understanding: {
      intent: "", domain: "general", complexity: "simple", keyTechnologies: [], relevantFiles: [],
      requirements: [], successCriteria: [], potentialRisks: [], rationale: "",
    },
  };
}

function makeLead(scores: Record<string, number>, published: LeadDecision[] = [], now = () => 0) {
  return new AgentLead({ selector: makeSelector(scores), now, publish: (d) => published.push(d) });
}

describe("AgentLead", () => {
  it("begin fusionne un budget partiel avec les défauts", () => {
    const state = makeLead({}).begin(plan([]), { maxDelegations: 5, maxWallTimeMs: undefined });
    assert.equal(state.budget.maxDelegations, 5);
    assert.equal(state.budget.maxWallTimeMs, DEFAULT_LEAD_BUDGET.maxWallTimeMs);
    assert.equal(state.goal, "objectif");
  });

  it("selectAgents réaffecte seulement les étapes pending et journalise", () => {
    const published: LeadDecision[] = [];
    const lead = makeLead({ debugger: 0.2, coder: 0.9 }, published);
    const p = plan([stage("s1", "debugger"), stage("s2", "debugger", "completed")]);
    const state = lead.begin(p);
    lead.selectAgents(p, state);
    assert.equal(p.stages[0].agentRole, "coder");
    assert.match(p.stages[0].agentReason, /Agent Lead/);
    assert.equal(p.stages[1].agentRole, "debugger");
    assert.equal(state.decisions.length, 1);
    assert.equal(state.decisions[0].kind, "select");
    assert.deepEqual(published, state.decisions);
  });

  it("arbitrate journalise le verdict et propose une réaffectation via le sélecteur", () => {
    const lead = makeLead({ debugger: 0.9, coder: 0.7 });
    const p = plan([stage("s1", "debugger", "running")]);
    const state = lead.begin(p);
    const verification: StageVerification = {
      stageId: "s1", role: "debugger", passed: false, syntaxCheckOk: false, testsOk: false, semanticCheckOk: false,
      issues: [], summary: "ko", timestamp: new Date().toISOString(),
    };
    const v = lead.arbitrate({
      stage: p.stages[0], verification, attempt: 1, maxAttempts: 3,
      result: { success: false, outcome: "blocked", summary: "bloqué", durationMs: 1, filesModified: [] },
    }, state);
    assert.deepEqual([v.action, v.action === "reassign" && v.toRole], ["reassign", "coder"]);
    assert.equal(state.decisions.at(-1)?.kind, "arbitrate");
  });

  it("shouldContinue journalise l'arrêt une seule fois", () => {
    const lead = makeLead({}, [], () => 0);
    const state = lead.begin(plan([]), { maxDelegations: 1 });
    lead.recordDelegation(state, "stage");
    assert.equal(lead.shouldContinue(state, "delegation").continue, false);
    assert.equal(lead.shouldContinue(state, "delegation").continue, false);
    assert.equal(state.decisions.filter((d) => d.kind === "stop").length, 1);
  });

  it("nextBestRole exclut les rôles fournis", () => {
    const lead = makeLead({ debugger: 0.9, coder: 0.7 });
    const p = plan([stage("s1", "debugger")]);
    assert.equal(lead.nextBestRole(p.stages[0], lead.begin(p), ["debugger"]), "coder");
  });
});
```

- [ ] **Étape 2 : vérifier que le test échoue**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/AgentLead.test.ts`
Attendu : ÉCHEC, `Cannot find module './AgentLead.js'`.

- [ ] **Étape 3 : implémenter `server/agents/lead/AgentLead.ts`**

```ts
import { agentEventStream } from "../AgentEventStream.js";
import { createLogger } from "../../utils/logger.js";
import type { AgentRole } from "../types.js";
import type { BrainPlan, BrainStage } from "../brain/types.js";
import { AgentSelector } from "./AgentSelector.js";
import { StageArbiter } from "./StageArbiter.js";
import { StopController } from "./StopController.js";
import {
  createLeadRunState,
  type ArbitrationInput,
  type ArbitrationVerdict,
  type DelegationKind,
  type LeadBudget,
  type LeadDecision,
  type LeadPolicy,
  type LeadRunState,
  type StopDecision,
} from "./types.js";

const log = createLogger("AgentLead");

export interface AgentLeadOptions {
  now?: () => number;
  /** Compteur de tâches en cours par rôle (orchestrateur) ; absent = jamais saturé. */
  runningCount?: (role: AgentRole) => number;
  selector?: AgentSelector;
  arbiter?: StageArbiter;
  stopController?: StopController;
  publish?: (decision: LeadDecision, state: LeadRunState) => void;
}

function publishToEventStream(decision: LeadDecision, state: LeadRunState): void {
  agentEventStream.publish({
    type: "agent_event",
    event: "task_progress",
    taskId: decision.stageId ?? state.planId,
    role: "planner",
    title: `[Agent Lead] ${decision.summary}`,
    status: "running",
    agentName: "Agent Lead",
    detail: decision.rationale,
    timestamp: decision.timestamp,
  });
}

/**
 * Agent Lead — chef d'orchestre de l'AgentBrain : choisit les agents, arbitre
 * chaque étape et décide de l'arrêt. Couche de décision pure : l'exécution
 * reste celle du Brain (scheduler, délégation, vérification, correction).
 */
export class AgentLead implements LeadPolicy {
  private readonly now: () => number;
  private readonly selector: AgentSelector;
  private readonly arbiter: StageArbiter;
  private readonly stopController: StopController;
  private readonly publish: (decision: LeadDecision, state: LeadRunState) => void;

  constructor(options: AgentLeadOptions = {}) {
    this.now = options.now ?? Date.now;
    this.selector = options.selector ?? new AgentSelector({ runningCount: options.runningCount });
    this.arbiter = options.arbiter ?? new StageArbiter();
    this.stopController = options.stopController ?? new StopController(this.now);
    this.publish = options.publish ?? publishToEventStream;
  }

  begin(plan: BrainPlan, budget?: Partial<LeadBudget>): LeadRunState {
    return createLeadRunState(plan.id, plan.goal, budget, this.now());
  }

  selectAgents(plan: BrainPlan, state: LeadRunState): void {
    for (const stage of plan.stages) {
      if (stage.status !== "pending") continue;
      const choice = this.selector.choose(stage, state.goal);
      if (!choice.changed) continue;
      const from = stage.agentRole;
      stage.agentRole = choice.role;
      stage.agentReason = `${stage.agentReason} | Agent Lead : ${choice.rationale}`;
      this.decide(state, { kind: "select", stageId: stage.id, summary: `${stage.title} : ${from} → ${choice.role}`, rationale: choice.rationale });
    }
  }

  arbitrate(input: ArbitrationInput, state: LeadRunState): ArbitrationVerdict {
    const verdict = this.arbiter.arbitrate(input, state, () =>
      this.selector.nextBest(input.stage, state.goal, [input.stage.agentRole])
    );
    const target = verdict.action === "reassign" ? ` → ${verdict.toRole}` : "";
    this.decide(state, {
      kind: "arbitrate",
      stageId: input.stage.id,
      summary: `${input.stage.title} : ${verdict.action}${target}`,
      rationale: verdict.rationale,
    });
    return verdict;
  }

  shouldContinue(state: LeadRunState, point: "delegation" | "replan"): StopDecision {
    const alreadyStopped = Boolean(state.stopped);
    const decision = this.stopController.shouldContinue(state, point);
    if (!decision.continue && !alreadyStopped) {
      log.warn(`🛑 Agent Lead : arrêt (${decision.reason}) — ${decision.detail}`);
      this.decide(state, { kind: "stop", summary: `arrêt : ${decision.reason}`, rationale: decision.detail });
    }
    return decision;
  }

  nextBestRole(stage: BrainStage, state: LeadRunState, exclude: AgentRole[]): AgentRole | null {
    return this.selector.nextBest(stage, state.goal, exclude);
  }

  recordDelegation(state: LeadRunState, _kind: DelegationKind): void {
    this.stopController.recordDelegation(state);
  }

  recordStageOutcome(state: LeadRunState, stageId: string, passed: boolean, filesVerified: number): void {
    this.stopController.recordStageOutcome(state, stageId, passed, filesVerified);
  }

  private decide(state: LeadRunState, decision: Omit<LeadDecision, "timestamp">): void {
    const full: LeadDecision = { ...decision, timestamp: new Date(this.now()).toISOString() };
    state.decisions.push(full);
    try {
      this.publish(full, state);
    } catch {
      // La publication d'événements ne doit jamais bloquer une décision.
    }
  }
}
```

- [ ] **Étape 4 : créer `server/agents/lead/index.ts`**

```ts
export { AgentLead } from "./AgentLead.js";
export type { AgentLeadOptions } from "./AgentLead.js";
export { AgentSelector, SELECTION_MARGIN } from "./AgentSelector.js";
export type { AgentSelectorDeps, RoleChoice, RoleScore } from "./AgentSelector.js";
export { StageArbiter } from "./StageArbiter.js";
export type { StageArbiterDeps } from "./StageArbiter.js";
export { StopController } from "./StopController.js";
export * from "./types.js";
```

- [ ] **Étape 5 : vérifier que tous les tests du dossier passent**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test "server/agents/lead/*.test.ts"`
Attendu : RÉUSSITE (4 fichiers).

- [ ] **Étape 6 : commit**

```bash
git add server/agents/lead/AgentLead.ts server/agents/lead/AgentLead.test.ts server/agents/lead/index.ts
git commit -m "feat(lead): AgentLead, politique de décision et journal"
```

---

### Tâche 5 : intégration dans `AgentBrain` et exposition

**Fichiers :**
- Modifier : `server/agents/brain/types.ts` (`BrainGoalInput`, `BrainExecutionResult`, `brainExecuteSchema`)
- Modifier : `server/agents/brain/AgentBrain.ts` (en entier pour `executeGoal` / `executeStage`, plus de nouvelles méthodes privées)
- Modifier : `server/routes/agents.ts:385` (`BrainExecuteSchema`) et la réponse JSON de `/brain/execute`
- Modifier : `server/skills/agents.ts:454` (schéma `agent_brain`) et le handler `case "agent_brain"` en mode auto
- Test : `server/agents/lead/AgentLead.integration.test.ts`

**Interfaces :**
- Consomme : `LeadPolicy`, `LeadRunState`, `ArbitrationVerdict`, `StopDecision`, `LeadStop`, `DelegationKind`, `LeadBudget`, `StopReason`, `LeadDecision`, `leadOptionsShape`, `createLeadRunState` (tâche 1) ; `AgentLead`, `AgentSelector` (tâches 2 et 4) ; `AgentOrchestrator.getRunningCount` (tâche 2).
- Produit : `AgentBrainDeps.lead?: LeadPolicy` ; `BrainGoalInput.lead?: boolean`, `BrainGoalInput.leadBudget?: Partial<LeadBudget>` ; `BrainExecutionResult.stopReason?: StopReason`, `.leadDecisions?: LeadDecision[]`, `.budgetUsage?: { delegations: number; wallTimeMs: number }`.

- [ ] **Étape 1 : écrire le test d'intégration qui échoue, `server/agents/lead/AgentLead.integration.test.ts`**

```ts
/**
 * Intégration Agent Lead ↔ AgentBrain : plan, understanding et vérification
 * scriptés (sans LLM), orchestrateur simulé qui écrit sur disque.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AgentBrain } from "../brain/AgentBrain.js";
import { AgentLead } from "./AgentLead.js";
import { AgentSelector } from "./AgentSelector.js";
import { createLeadRunState, type LeadPolicy } from "./types.js";
import type { BrainGoalInput, BrainPlan, BrainStage, GoalUnderstanding, StageVerification } from "../brain/types.js";
import type { TaskOutcome } from "../types.js";

let tmpRoot: string;
let targetFile: string;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-lead-"));
  targetFile = path.join(tmpRoot, "example.ts");
});
after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});
beforeEach(() => fs.writeFileSync(targetFile, "const value: string = 123;\n", "utf-8"));

const understanding = (): GoalUnderstanding => ({
  intent: "Corriger", domain: "bugfix", complexity: "moderate", keyTechnologies: ["TypeScript"],
  relevantFiles: [targetFile], requirements: [], successCriteria: [], potentialRisks: [], rationale: "test",
});

const makeStage = (id: string, role: string, dependsOn: string[] = []): BrainStage => ({
  id, title: `Étape ${id} (${role})`, description: `Corrige ${targetFile}`, agentRole: role, agentReason: "test",
  skills: [], tools: ["modify_project_file"], files: [targetFile], instructions: "Corrige", dependsOn,
  status: "pending", priority: "high",
});

const makePlan = (stages: BrainStage[]): BrainPlan => ({
  id: "plan-lead-int", goal: "Corrige example.ts", understanding: understanding(), stages,
  estimatedDurationMs: 0, architectureRationale: "test", createdAt: new Date().toISOString(), status: "planned",
});

const input = (extra: Partial<BrainGoalInput> = {}): BrainGoalInput => ({
  goal: "Corrige example.ts", contextFiles: [targetFile], mode: "auto", maxCorrectionAttempts: 3, maxReplans: 0, ...extra,
});

/** Vérification scriptée : passe si le fichier contient GOOD ; `critical` force une issue critique. */
function scriptedVerifier(critical = false) {
  return {
    async verifyStage(stage: BrainStage): Promise<StageVerification> {
      const passed = !critical && fs.readFileSync(targetFile, "utf-8").includes("GOOD");
      return {
        stageId: stage.id, role: stage.agentRole, passed, syntaxCheckOk: passed, testsOk: passed, semanticCheckOk: passed,
        issues: passed ? [] : [{ severity: critical ? "critical" : "error", message: "type error", file: targetFile }],
        summary: passed ? "ok" : "échec", timestamp: new Date().toISOString(),
      };
    },
  };
}

type Reply = { content: string | null; outcome?: TaskOutcome } | Error;

function makeOrchestrator(reply: (params: { role: string; title: string }) => Reply) {
  let counter = 0;
  const tasks = new Map<string, unknown>();
  const delegated: Array<{ role: string; title: string }> = [];
  return {
    delegated,
    canRunTool: false,
    async runTool() { return null; },
    async delegateTask(params: { role: string; title: string }) {
      const r = reply(params);
      if (r instanceof Error) throw r;
      delegated.push({ role: params.role, title: params.title });
      const id = `task-${counter++}`;
      const filesModified: string[] = [];
      if (r.content !== null) {
        fs.writeFileSync(targetFile, r.content, "utf-8");
        filesModified.push(targetFile);
      }
      const outcome = r.outcome ?? "success";
      const task = {
        id, role: params.role, title: params.title, status: "completed",
        result: { success: outcome === "success", outcome, summary: "Fichier modifié.", filesModified, durationMs: 1 },
      };
      tasks.set(id, task);
      return task;
    },
    getTask(id: string) { return tasks.get(id); },
  };
}

const STAGES: Record<string, "build"> = { debugger: "build", coder: "build" };
function stubLead(): AgentLead {
  return new AgentLead({
    publish: () => {},
    selector: new AgentSelector({
      scoreRole: (role) => (role in STAGES ? { score: role === "debugger" ? 0.8 : 0.7, skillMatch: 1 } : null),
      teamRoles: () => [], candidateRoles: () => ["debugger", "coder"], roleExists: () => true,
      inferCapabilities: () => ["code"], stageOf: (role) => STAGES[role],
    }),
  });
}

function makeBrain(orch: unknown, plan: BrainPlan, lead: LeadPolicy, critical = false): AgentBrain {
  return new AgentBrain(orch as never, {
    understandingEngine: { understand: async () => understanding() },
    planner: { plan: async () => JSON.parse(JSON.stringify(plan)) as BrainPlan },
    verifier: scriptedVerifier(critical) as never,
    lead,
  });
}

const GOOD = "const value = 123; // GOOD\n";
const BAD = "const value = 123; // BAD\n";

describe("Agent Lead intégré à l'AgentBrain", () => {
  it("réaffecte une étape bloquée vers un autre agent qui la réussit", async () => {
    const orch = makeOrchestrator(({ role }) => (role === "debugger" ? { content: null, outcome: "blocked" } : { content: GOOD }));
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), stubLead()).executeGoal(input());
    assert.equal(result.success, true, result.summary);
    assert.deepEqual(orch.delegated.map((d) => d.role), ["debugger", "coder"]);
    assert.equal(result.stages[0].stage.agentRole, "coder");
    assert.ok(result.leadDecisions?.some((d) => d.kind === "arbitrate" && /reassign/.test(d.summary)));
  });

  it("abandonne une issue critique répétée sans épuiser les corrections", async () => {
    const orch = makeOrchestrator(() => ({ content: BAD }));
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), stubLead(), true).executeGoal(input());
    assert.equal(result.success, false);
    assert.equal(result.corrections.length, 1, "une seule correction avant l'abandon");
    assert.equal(orch.delegated.length, 2);
  });

  it("s'arrête proprement quand le budget de délégations est atteint", async () => {
    const orch = makeOrchestrator(() => ({ content: GOOD }));
    const plan = makePlan([makeStage("s1", "debugger"), makeStage("s2", "debugger", ["s1"])]);
    const result = await makeBrain(orch, plan, stubLead()).executeGoal(input({ leadBudget: { maxDelegations: 1 } }));
    assert.equal(result.success, false);
    assert.equal(result.stopReason, "delegation_budget");
    assert.equal(orch.delegated.length, 1);
    assert.match(result.summary, /Agent Lead/);
    assert.equal(result.budgetUsage?.delegations, 1);
  });

  it("se rabat sur un autre agent quand le rôle est à capacité maximale", async () => {
    const orch = makeOrchestrator(({ role }) =>
      role === "debugger"
        ? new Error(`L'agent "Debugger" est à capacité maximale (1 tâche(s) simultanée(s)). Réessaie plus tard.`)
        : { content: GOOD }
    );
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), stubLead()).executeGoal(input());
    assert.equal(result.success, true, result.summary);
    assert.equal(result.stages[0].stage.agentRole, "coder");
  });

  it("un Lead qui lève des exceptions ne change pas l'issue de la mission", async () => {
    const boom = () => { throw new Error("lead en panne"); };
    const brokenLead: LeadPolicy = {
      begin: (plan) => createLeadRunState(plan.id, plan.goal, undefined, Date.now()),
      selectAgents: boom, arbitrate: boom, shouldContinue: boom, nextBestRole: boom,
      recordDelegation: boom, recordStageOutcome: boom,
    };
    const orch = makeOrchestrator(({ title }) => ({ content: title.includes("Auto-Correction") ? GOOD : BAD }));
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), brokenLead).executeGoal(input());
    assert.equal(result.success, true, result.summary);
    assert.equal(result.corrections.length, 1);
  });

  it("lead: false restaure le comportement sans Agent Lead", async () => {
    const orch = makeOrchestrator(() => ({ content: GOOD }));
    const plan = makePlan([makeStage("s1", "debugger"), makeStage("s2", "debugger", ["s1"])]);
    const result = await makeBrain(orch, plan, stubLead()).executeGoal(input({ lead: false, leadBudget: { maxDelegations: 1 } }));
    assert.equal(result.success, true);
    assert.equal(orch.delegated.length, 2);
    assert.equal(result.leadDecisions, undefined);
    assert.equal(result.stopReason, undefined);
  });
});
```

- [ ] **Étape 2 : vérifier que le test échoue**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/AgentLead.integration.test.ts`
Attendu : ÉCHEC. La compilation échoue sur `lead` (absent de `AgentBrainDeps`) ou les assertions échouent (pas de réaffectation, `stopReason` indéfini).

- [ ] **Étape 3 : étendre `server/agents/brain/types.ts`**

Ajouter l'import en tête de fichier :

```ts
import { leadOptionsShape, type LeadBudget, type LeadDecision, type StopReason } from "../lead/types.js";
```

Dans `BrainGoalInput`, après `maxReplans?: number;` :

```ts
  /** Agent Lead (choix d'agents, arbitrage, arrêt). Actif par défaut ; false = comportement historique. */
  lead?: boolean;
  /** Budget de mission de l'Agent Lead (valeurs absentes = défauts). */
  leadBudget?: Partial<LeadBudget>;
```

Dans `BrainExecutionResult`, après `deliverables: string[];` :

```ts
  /** Raison de l'arrêt décidé par l'Agent Lead, s'il a stoppé la mission. */
  stopReason?: StopReason;
  /** Journal des décisions de l'Agent Lead (absent si `lead: false`). */
  leadDecisions?: LeadDecision[];
  /** Consommation du budget de l'Agent Lead. */
  budgetUsage?: { delegations: number; wallTimeMs: number };
```

Dans `brainExecuteSchema`, après la ligne `maxReplans: …`, ajouter :

```ts
  ...leadOptionsShape,
```

- [ ] **Étape 4 : modifier `server/agents/brain/AgentBrain.ts`. Imports, dépendances, contexte, constructeur.**

Ajouter aux imports :

```ts
import { AgentLead } from "../lead/AgentLead.js";
import type { ArbitrationVerdict, DelegationKind, LeadPolicy, LeadRunState, LeadStop, StopDecision } from "../lead/types.js";
```

Ajouter dans `BrainRunContext` :

```ts
  /** Agent Lead actif pour ce run (null = désactivé ou indisponible). */
  lead: LeadPolicy | null;
  leadState: LeadRunState | null;
```

Ajouter dans `AgentBrainDeps` :

```ts
  /** Politique de décision Agent Lead (défaut : AgentLead réel). */
  lead?: LeadPolicy;
```

Ajouter le champ `private lead: LeadPolicy;` dans la classe. À la fin du constructeur, ajouter :

```ts
    this.lead = deps.lead ?? new AgentLead({
      runningCount: typeof this.orchestrator.getRunningCount === "function"
        ? (role) => this.orchestrator.getRunningCount(role)
        : undefined,
    });
```

- [ ] **Étape 5 : modifier `executeGoal`**

Remplacer le bloc qui va de `const ctx: BrainRunContext = {` jusqu'à la fin de la boucle `while (report.failed.length > 0 && replans < maxReplans) { … }` par :

```ts
    // Agent Lead : actif par défaut, désactivable par `lead: false`.
    const lead = input.lead === false ? null : this.lead;
    const leadState = lead
      ? this.safeLead("begin", () => lead.begin(plan, input.leadBudget), null as LeadRunState | null)
      : null;

    // Contexte partagé accumulé au fil de l'exécution (et des réplanifications)
    const ctx: BrainRunContext = {
      verifications: [],
      corrections: [],
      filesModified: new Set<string>(),
      stageResults: new Map<string, { stage: BrainStage; result?: any; durationMs: number }>(),
      correctionLoop: new BrainCorrectionLoop(input.maxCorrectionAttempts ?? 3),
      maxCorrectionAttempts: input.maxCorrectionAttempts ?? 3,
      understanding: plan.understanding,
      lead: leadState ? lead : null,
      leadState,
    };

    this.applyAgentSelection(plan, ctx);

    const scheduler = new BrainScheduler((stage, deps) => this.executeStage(stage, plan, ctx, deps));

    // Exécution initiale du DAG complet
    let report = await scheduler.execute(plan.stages);

    // ── Réplanification à chaud du sous-graphe restant (garde-fou anti-boucle) ──
    const maxReplans = input.maxReplans ?? 2;
    let replans = 0;
    while (report.failed.length > 0 && replans < maxReplans) {
      const gate = this.leadGate(ctx, "replan");
      if (!gate.continue) {
        log.warn(`🛑 Agent Lead : pas de réplanification (${gate.reason}) — ${gate.detail}`);
        break;
      }
      replans++;
      const replanned = await this.replanSubgraph(plan, report, ctx, replans, maxReplans);
      if (!replanned) {
        log.warn(`🛑 Réplanification impossible — arrêt propre après ${replans} tentative(s)`);
        break;
      }
      this.applyAgentSelection(plan, ctx);
      report = await scheduler.execute(plan.stages);
    }
```

Puis, dans la synthèse, remplacer la déclaration `const summary = globalSuccess ? … : …;` par :

```ts
    const leadStop = ctx.leadState?.stopped;
    const baseSummary = globalSuccess
      ? `Objectif accompli avec succès en ${plan.stages.length} étapes (${plan.stages.map((s) => s.agentRole).join(" → ")}). ${ctx.filesModified.size} fichier(s) mis à jour, validés et sans régression.`
      : `Exécution ${plan.status === "incomplete" ? "partielle" : "en échec"} — difficulté sur l'étape : ${failedStage?.title ?? "inconnue"}${replans > 0 ? ` (après ${replans} réplanification(s))` : ""}.`;
    const summary = !globalSuccess && leadStop
      ? `${baseSummary} Arrêt décidé par l'Agent Lead : ${leadStop.detail}.`
      : baseSummary;
```

Dans l'objet `result: BrainExecutionResult`, après `deliverables,`, ajouter :

```ts
      ...(ctx.leadState
        ? {
            stopReason: ctx.leadState.stopped?.reason,
            leadDecisions: [...ctx.leadState.decisions],
            budgetUsage: { delegations: ctx.leadState.delegations, wallTimeMs: totalDurationMs },
          }
        : {}),
```

- [ ] **Étape 6 : remplacer entièrement `executeStage` et ajouter les méthodes privées du Lead**

Remplacer toute la méthode `private async executeStage(…) { … }` par le code ci-dessous, puis ajouter les méthodes qui suivent juste après, avant `replanSubgraph` :

```ts
  private async executeStage(
    stage: BrainStage,
    plan: BrainPlan,
    ctx: BrainRunContext,
    _depResults: StageVerification[]
  ): Promise<StageVerification> {
    const stageStartTime = Date.now();
    stage.startedAt = new Date().toISOString();

    log.info(`▶️ Exécution étape "${stage.title}" (${stage.agentRole})`);

    agentEventStream.publish({
      type: "agent_event",
      event: "task_started",
      taskId: stage.id,
      role: stage.agentRole,
      title: `[Brain Stage] ${stage.title}`,
      status: "running",
      agentName: stage.agentRole,
      detail: stage.description,
      timestamp: new Date().toISOString(),
    });

    // Garde Agent Lead : aucune délégation une fois le budget épuisé.
    const gate = this.leadGate(ctx, "delegation");
    if (!gate.continue) {
      const stopped = this.leadStopVerification(stage, gate);
      stage.result = { success: false, outcome: "failed" as const, summary: stopped.summary, durationMs: 0, error: stopped.summary, filesModified: [] };
      ctx.verifications.push(stopped);
      return this.finishStage(stage, ctx, stopped, stageStartTime);
    }

    try {
      const delegatedTask: AgentTask = await this.delegateWithFallback(stage, ctx, {
        role: stage.agentRole,
        title: stage.title,
        description: `${stage.description}\n\nOutils autorisés : ${stage.tools.join(", ")}`,
        files: stage.files,
        instructions: stage.instructions,
        priority: stage.priority,
      }, "stage");

      const stageTaskResult = await this.awaitTaskCompletion(delegatedTask.id);
      stage.result = stageTaskResult;
      if (stageTaskResult?.filesModified) {
        for (const f of stageTaskResult.filesModified) ctx.filesModified.add(f);
      }
    } catch (err: any) {
      log.error(`❌ Erreur d'exécution de l'étape ${stage.id}: ${err.message}`);
      stage.result = {
        success: false,
        outcome: "failed" as const,
        summary: err.message ?? "Erreur d'exécution",
        durationMs: Date.now() - stageStartTime,
        error: err.message,
        filesModified: [],
      };
    }

    // Vérification
    let verification = await this.verifier.verifyStage(stage, ctx.understanding, Array.from(ctx.filesModified));
    ctx.verifications.push(verification);

    // Boucle de correction bornée, pilotée par l'arbitrage de l'Agent Lead
    let attempt = 1;
    let verdict = this.arbitrateStage(stage, verification, ctx, attempt);
    while ((verdict.action === "correct" || verdict.action === "reassign") && attempt <= ctx.maxCorrectionAttempts) {
      if (!this.leadGate(ctx, "delegation").continue) break;
      plan.status = "correcting";

      if (verdict.action === "reassign") {
        verification = await this.reassignStage(stage, ctx, verdict.toRole, verdict.rationale);
      } else {
        const corrected = await this.runCorrection(stage, ctx, verification, attempt, verdict.targetRole);
        if (!corrected) break;
        verification = corrected;
      }

      attempt++;
      verdict = this.arbitrateStage(stage, verification, ctx, attempt);
    }

    // Le Lead peut rejeter une étape que le vérificateur a laissée passer.
    if (verdict.action !== "accept" && verification.passed) {
      verification = {
        ...verification,
        passed: false,
        semanticCheckOk: false,
        summary: `Rejeté par l'Agent Lead : ${verdict.rationale}`,
        timestamp: new Date().toISOString(),
      };
      ctx.verifications.push(verification);
    }

    return this.finishStage(stage, ctx, verification, stageStartTime);
  }

  /** Une tentative de correction autonome (comportement historique), re-vérifiée. */
  private async runCorrection(
    stage: BrainStage,
    ctx: BrainRunContext,
    verification: StageVerification,
    attempt: number,
    targetRole?: string
  ): Promise<StageVerification | null> {
    log.warn(`⚠️ Correction autonome pour ${stage.id} (tentative ${attempt})`);
    const correction = ctx.correctionLoop.createCorrection(stage, verification, attempt, ctx.understanding);
    if (!correction) return null;
    if (targetRole) correction.targetRole = targetRole;
    ctx.corrections.push(correction);

    agentEventStream.publish({
      type: "agent_event",
      event: "task_progress",
      taskId: stage.id,
      role: correction.targetRole,
      title: `[Auto-Correction ${attempt}] Réparation pour ${stage.title}`,
      status: "running",
      agentName: correction.targetRole,
      detail: correction.diagnostic,
      timestamp: new Date().toISOString(),
    });

    try {
      const fixTask = await this.delegateWithFallback(stage, ctx, {
        role: correction.targetRole,
        title: `[Auto-Correction] Fix pour ${stage.title}`,
        description: correction.correctiveInstructions,
        files: correction.filesToFix,
        priority: "critical",
      }, "correction");

      const fixResult = await this.awaitTaskCompletion(fixTask.id);
      if (fixResult?.filesModified) {
        for (const f of fixResult.filesModified) ctx.filesModified.add(f);
      }
      // La re-vérification doit refléter l'état corrigé, pas l'échec initial.
      if (fixResult) stage.result = fixResult;
    } catch (corrErr: any) {
      log.error(`❌ Erreur pendant la correction: ${corrErr.message}`);
      return verification;
    }

    const next = await this.verifier.verifyStage(stage, ctx.understanding, Array.from(ctx.filesModified));
    ctx.verifications.push(next);
    if (next.passed) {
      correction.resolved = true;
      log.info(`✅ Auto-correction réussie pour ${stage.id} à la tentative ${attempt}`);
    }
    return next;
  }

  /** Réattribue l'étape à un autre agent (décision Agent Lead), puis re-vérifie. */
  private async reassignStage(
    stage: BrainStage,
    ctx: BrainRunContext,
    toRole: string,
    rationale: string
  ): Promise<StageVerification> {
    const fromRole = stage.agentRole;
    stage.agentRole = toRole;
    stage.agentReason = `${stage.agentReason} | Agent Lead : réattribution ${fromRole} → ${toRole} (${rationale})`;
    log.warn(`🔀 Agent Lead : réattribution de "${stage.title}" ${fromRole} → ${toRole}`);

    try {
      const task = await this.delegateWithFallback(stage, ctx, {
        role: toRole,
        title: `[Agent Lead] Réattribution : ${stage.title}`,
        description: `${stage.description}\n\nOutils autorisés : ${stage.tools.join(", ")}`,
        files: stage.files,
        instructions: stage.instructions,
        priority: stage.priority,
      }, "reassign");
      const result = await this.awaitTaskCompletion(task.id);
      if (result?.filesModified) {
        for (const f of result.filesModified) ctx.filesModified.add(f);
      }
      if (result) stage.result = result;
    } catch (err: any) {
      log.error(`❌ Réattribution échouée pour ${stage.id}: ${err.message}`);
    }

    const next = await this.verifier.verifyStage(stage, ctx.understanding, Array.from(ctx.filesModified));
    ctx.verifications.push(next);
    return next;
  }

  /** Clôture commune d'une étape : durées, résultat, comptabilité Lead, événement. */
  private finishStage(
    stage: BrainStage,
    ctx: BrainRunContext,
    verification: StageVerification,
    stageStartTime: number
  ): StageVerification {
    stage.durationMs = Date.now() - stageStartTime;
    stage.completedAt = new Date().toISOString();
    ctx.stageResults.set(stage.id, { stage, result: stage.result, durationMs: stage.durationMs });

    if (ctx.lead && ctx.leadState) {
      const lead = ctx.lead;
      const state = ctx.leadState;
      this.safeLead("recordStageOutcome", () => lead.recordStageOutcome(state, stage.id, verification.passed, ctx.filesModified.size), undefined);
    }

    agentEventStream.publish({
      type: "agent_event",
      event: verification.passed ? "task_completed" : "task_failed",
      taskId: stage.id,
      role: stage.agentRole,
      title: `[Brain Stage] ${stage.title}`,
      status: verification.passed ? "completed" : "failed",
      agentName: stage.agentRole,
      detail: verification.summary,
      timestamp: new Date().toISOString(),
    });

    return verification;
  }

  /**
   * Délègue via l'orchestrateur en comptant la délégation dans le budget du
   * Lead. Si le rôle est à capacité maximale, le Lead propose un autre agent
   * (une seule nouvelle tentative).
   */
  private async delegateWithFallback(
    stage: BrainStage,
    ctx: BrainRunContext,
    params: Parameters<AgentOrchestrator["delegateTask"]>[0],
    kind: DelegationKind
  ): Promise<AgentTask> {
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (lead && state) this.safeLead("recordDelegation", () => lead.recordDelegation(state, kind), undefined);

    try {
      return await this.orchestrator.delegateTask(params);
    } catch (err: any) {
      const message = String(err?.message ?? err);
      if (!lead || !state || !message.includes("capacité maximale")) throw err;
      const alt = this.safeLead("nextBestRole", () => lead.nextBestRole(stage, state, [params.role]), null as string | null);
      if (!alt) throw err;
      log.info(`🔁 Agent Lead : ${params.role} à capacité maximale → ${alt}`);
      if (kind !== "correction") {
        stage.agentReason = `${stage.agentReason} | Agent Lead : ${params.role} à capacité maximale → ${alt}`;
        stage.agentRole = alt;
      }
      return await this.orchestrator.delegateTask({ ...params, role: alt });
    }
  }

  /** Verdict d'étape : Agent Lead si actif, sinon règles historiques. */
  private arbitrateStage(
    stage: BrainStage,
    verification: StageVerification,
    ctx: BrainRunContext,
    attempt: number
  ): ArbitrationVerdict {
    const legacy: ArbitrationVerdict = verification.passed
      ? { action: "accept", rationale: "vérification réussie" }
      : attempt <= ctx.maxCorrectionAttempts
        ? { action: "correct", rationale: "vérification échouée" }
        : { action: "abandon", rationale: "tentatives épuisées" };
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (!lead || !state) return legacy;
    const verdict = this.safeLead(
      "arbitrate",
      () => lead.arbitrate({ stage, verification, result: stage.result, attempt, maxAttempts: ctx.maxCorrectionAttempts }, state),
      legacy
    );
    // Garde-fou : le Lead ne peut pas accepter une étape non vérifiée.
    return verdict.action === "accept" && !verification.passed ? legacy : verdict;
  }

  /** Point de décision continuer/arrêter (toujours « continuer » sans Lead). */
  private leadGate(ctx: BrainRunContext, point: "delegation" | "replan"): StopDecision {
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (!lead || !state) return { continue: true };
    return this.safeLead("shouldContinue", () => lead.shouldContinue(state, point), { continue: true } as StopDecision);
  }

  /** Réaffectation des rôles des étapes en attente ; régénère le Mermaid si besoin. */
  private applyAgentSelection(plan: BrainPlan, ctx: BrainRunContext): void {
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (!lead || !state) return;
    const before = plan.stages.map((s) => s.agentRole).join("|");
    this.safeLead("selectAgents", () => lead.selectAgents(plan, state), undefined);
    if (plan.stages.map((s) => s.agentRole).join("|") !== before) {
      plan.mermaid = this.validator.toMermaid(plan);
    }
  }

  private leadStopVerification(stage: BrainStage, stop: LeadStop): StageVerification {
    const summary = `Arrêt Agent Lead : ${stop.detail}`;
    return {
      stageId: stage.id,
      role: stage.agentRole,
      passed: false,
      syntaxCheckOk: false,
      testsOk: false,
      semanticCheckOk: false,
      issues: [{ severity: "error", message: summary, rule: "agent_lead_stop" }],
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  /** Exécute un hook du Lead ; en cas d'exception, journalise et renvoie le repli historique. */
  private safeLead<T>(label: string, fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err: any) {
      log.warn(`Agent Lead (${label}) en erreur — repli sur le comportement standard : ${err?.message ?? err}`);
      return fallback;
    }
  }
```

- [ ] **Étape 7 : vérifier les tests d'intégration et la non-régression du Brain**

Lancer : `node --import tsx --import ./scripts/test-isolation.mjs --test server/agents/lead/AgentLead.integration.test.ts server/agents/brain/AgentBrain.test.ts server/agents/brain/supervisor-harness.test.ts server/agents/brain/BrainScheduler.test.ts`
Attendu : RÉUSSITE pour les quatre fichiers. Si `supervisor-harness` échoue parce que le sélecteur réel réaffecte `debugger`, ne touchez pas aux seuils : relevez le rôle choisi et la raison dans `result.leadDecisions`. Les assertions de ce harnais ne dépendent pas du rôle, donc un tel échec révèle un vrai bug.

- [ ] **Étape 8 : exposer `lead` / `leadBudget` dans la route et le skill**

Dans `server/routes/agents.ts`, ajouter `import { leadOptionsShape } from '../agents/lead/types.js';` aux imports. Dans `BrainExecuteSchema = BrainPlanSchema.extend({ … })`, ajouter `...leadOptionsShape,` après `maxCorrectionAttempts`. Dans la réponse JSON de `/brain/execute`, après `deliverables: result.deliverables,`, ajouter :

```ts
        stopReason: result.stopReason,
        leadDecisions: result.leadDecisions,
```

Dans `server/skills/agents.ts`, ajouter `import { leadOptionsShape } from "../agents/lead/types.js";` aux imports. Dans le schéma `agent_brain: z.object({ … })`, ajouter `...leadOptionsShape,` après `maxReplans`. Dans l'appel `agentOrchestrator.brainExecute({ … })` du mode auto, ajouter `lead: v.lead, leadBudget: v.leadBudget,`. Dans l'objet retourné, après `totalDurationMs: result.totalDurationMs,`, ajouter :

```ts
            stopReason: result.stopReason,
            leadDecisions: result.leadDecisions?.map((d) => `${d.kind}: ${d.summary} — ${d.rationale}`),
```

- [ ] **Étape 9 : typecheck et suite serveur complète**

Lancer : `npm run typecheck`
Attendu : aucune erreur.
Lancer : `npm test`
Attendu : tous les tests passent. Comparez le nombre de tests en échec avec `git stash; npm test; git stash pop` si un échec semble préexistant.

- [ ] **Étape 10 : commit**

```bash
git add server/agents/brain/types.ts server/agents/brain/AgentBrain.ts server/agents/lead/AgentLead.integration.test.ts server/routes/agents.ts server/skills/agents.ts
git commit -m "feat(brain): Agent Lead actif par défaut dans brainExecute"
```

---

### Tâche 6 : documentation

**Fichiers :**
- Modifier : `docs/AGENTIC_RUNTIME.md` (nouvelle section avant « 7. Migration », et une ligne dans le tableau des phases)

- [ ] **Étape 1 : ajouter la section avant `## 7. Migration (phases)`**

```markdown
## 6 bis. Agent Lead — chef d'orchestre de l'AgentBrain

L'Agent Lead (`server/agents/lead/`) est une **couche de décision** branchée sur
`AgentBrain.executeGoal`. Il ne crée aucune boucle : l'exécution reste
`BrainScheduler → delegateTask → BrainVerifier → BrainCorrectionLoop → replanSubgraph`.

| Point de décision | Module | Effet |
|---|---|---|
| Après la planification / un replan | `AgentSelector` | Réaffecte le rôle d'une étape si un candidat (SwarmComposer + score contract-net) dépasse le rôle du planner de 0,15, ou si ce rôle est saturé |
| Après chaque vérification | `StageArbiter` | `accept` / `correct` / `reassign` (1×/étape) / `abandon` |
| Avant chaque délégation et replan | `StopController` | Arrêt sur `wall_time`, `delegation_budget`, `consecutive_failures`, `no_progress` |

- Actif par défaut. `lead: false` restaure le comportement historique.
- Budget par défaut : 20 min, 25 délégations, 3 échecs consécutifs (`leadBudget` pour surcharger).
- Le résultat expose `stopReason`, `leadDecisions` et `budgetUsage`. Chaque décision est publiée sur
  `agentEventStream` (`agentName: "Agent Lead"`).
- Un hook du Lead qui lève une exception est neutralisé (`safeLead`) : la mission poursuit avec les règles historiques.
- `maxCorrectionAttempts` / `maxReplans` restent des plafonds absolus.
```

Dans le tableau « Migration (phases) », ajouter une ligne :

```markdown
| 7 | Agent Lead : choix d'agents, arbitrage par étape, décision d'arrêt (`server/agents/lead/`) | ✅ |
```

- [ ] **Étape 2 : commit**

```bash
git add docs/AGENTIC_RUNTIME.md
git commit -m "docs(agents): documenter l'Agent Lead dans le runtime agentique"
```

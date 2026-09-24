/**
 * agentic/types.ts — Types du runtime agentique (boucle OBSERVE→PLAN→ACT→VERIFY)
 *
 * Ce module définit les contrats de la vraie boucle agentique de Leanna. Il
 * complète (sans les remplacer) les familles de types existantes :
 *   - `server/agents/types.ts`   → AgentTask / TaskResult / AgentRole (legacy)
 *   - `server/agents/brain/types.ts` → BrainPlan / BrainStage (planification DAG)
 *   - `server/runtime/types.ts`  → Task / ToolDeclaration / ToolPermission (DI runtime)
 *
 * La différence clé avec l'ancien `AgentExecutor` : ici, un agent reçoit
 * RÉELLEMENT les outils qu'il déclare (via le `ToolRegistry`), au lieu de voir
 * ses `capabilities` ignorées. La boucle exécute chaque appel d'outil, observe
 * le résultat, raisonne, décide de l'action suivante puis vérifie — dans les
 * limites d'un budget configurable.
 */

import type { AgentRole } from "../../agents/types.js";

// ═══════════════════════════════════════════════════════════════════════════
// Tâche agentique
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Entrée de la boucle agentique. Volontairement minimale : l'objectif en langage
 * naturel, l'agent à incarner, et un contexte optionnel.
 */
export interface AgentTask {
  /** Identifiant unique (généré si absent). */
  id?: string;
  /** Rôle de l'agent à incarner (détermine le systemPrompt et les capabilities). */
  role: AgentRole;
  /** Objectif en langage naturel : « Analyse mon projet et corrige les problèmes. » */
  goal: string;
  /** Fichiers pertinents pour amorcer le contexte. */
  files?: string[];
  /** Instructions additionnelles libres. */
  instructions?: string;
  /** Métadonnées libres (missionId, orchestrationId, etc.). */
  metadata?: Record<string, unknown>;
  /** Surcharge du budget par défaut pour cette tâche précise. */
  budget?: Partial<AgentBudget>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Budget — les gardes-fous de la boucle
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phases de la boucle agentique. Le budget d'appels d'outils est alloué par
 * phase pour empêcher un agent de tout dépenser en exploration.
 */
export type AgentPhase = "discovery" | "plan" | "write" | "verify" | "recovery";

/**
 * Répartition du budget d'appels d'outils par phase, en fraction du total.
 * Les bornes `max` plafonnent une phase (ex: discovery ≤ 30 %) ; les bornes
 * `min` réservent un quota garanti pour les phases critiques (write/verify).
 * La somme des `min` doit rester ≤ 1.
 */
export interface PhaseAllocation {
  /** Part MAX du budget d'outils consommable en exploration (défaut 0.30). */
  discoveryMax: number;
  /** Part MAX consommable en (re)planification (défaut 0.10). */
  planMax: number;
  /** Part MIN réservée aux écritures (défaut 0.30). */
  writeMin: number;
  /** Part MIN réservée aux vérifications (défaut 0.20). */
  verifyMin: number;
  /** Part MIN réservée à la récupération (défaut 0.10). */
  recoveryMin: number;
}

export const DEFAULT_PHASE_ALLOCATION: PhaseAllocation = {
  discoveryMax: 0.3,
  planMax: 0.1,
  writeMin: 0.3,
  verifyMin: 0.2,
  recoveryMin: 0.1,
};

/**
 * Contraintes dures de la boucle. Sans elles, un agent pourrait boucler
 * indéfiniment ou consommer un budget LLM illimité.
 */
export interface AgentBudget {
  /** Nombre maximum d'itérations de la boucle (défaut 20). */
  maxIterations: number;
  /** Nombre maximum d'appels d'outils cumulés. */
  maxToolCalls: number;
  /** Nombre maximum d'appels de LECTURE (search/read/analyze). */
  maxReadCalls: number;
  /** Nombre maximum de fichiers lus distincts. */
  maxFilesRead: number;
  /** Temps d'exécution maximum en ms (mur temporel). */
  maxExecutionTimeMs: number;
  /** Nombre maximum de tentatives de récupération après échec, par étape. */
  maxRetries: number;
  /**
   * Coût maximum estimé (unité abstraite alignée sur les tokens/1000).
   * `Infinity` désactive la limite de coût.
   */
  maxCost: number;
  /** Répartition du budget d'outils par phase (règle d'arrêt intelligente). */
  phases: PhaseAllocation;
}

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxIterations: 20,
  maxToolCalls: 30,
  maxReadCalls: 18, // borne dure ; la phase discovery la plafonne aussi à 30 %
  maxFilesRead: 20,
  maxExecutionTimeMs: 5 * 60_000, // 5 minutes
  maxRetries: 3,
  maxCost: Infinity,
  phases: DEFAULT_PHASE_ALLOCATION,
};

/** Classe un appel d'outil par nature, pour la comptabilité séparée. */
export type ToolKind = "read" | "write" | "verify" | "other";

/**
 * Consommation courante du budget, mise à jour à chaque appel d'outil.
 * Les compteurs sont SÉPARÉS (lecture / écriture / vérification) afin que la
 * règle d'arrêt et le budget réservé aux actions critiques soient exploitables.
 */
export interface BudgetUsage {
  iterations: number;
  /** Total d'appels d'outils (= readCalls + writeCalls + verifyCalls + otherCalls). */
  toolCalls: number;
  readCalls: number;
  writeCalls: number;
  verifyCalls: number;
  otherCalls: number;
  /** Fichiers distincts lus. */
  filesRead: number;
  /** Fichiers distincts modifiés (écritures CONFIRMÉES). */
  filesModified: number;
  elapsedMs: number;
  retries: number;
  cost: number;
}

/** Fabrique un `BudgetUsage` vierge. */
export function emptyBudgetUsage(): BudgetUsage {
  return {
    iterations: 0,
    toolCalls: 0,
    readCalls: 0,
    writeCalls: 0,
    verifyCalls: 0,
    otherCalls: 0,
    filesRead: 0,
    filesModified: 0,
    elapsedMs: 0,
    retries: 0,
    cost: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Plan / PlanStep
// ═══════════════════════════════════════════════════════════════════════════

/** Plan produit par la phase UNDERSTAND/PLAN, avant toute action. */
export interface Plan {
  /** Reformulation de l'intention comprise par l'agent. */
  intent: string;
  /** Étapes ordonnées à exécuter. */
  steps: PlanStep[];
  /** Critères observables permettant de déclarer la tâche réussie. */
  successCriteria: string[];
  /** Raisonnement ayant conduit à ce plan (traçabilité). */
  rationale: string;
}

export type PlanStepStatus =
  | "pending"
  | "running"
  | "verifying"
  | "done"
  | "failed"
  | "skipped";

/** Étape unitaire du plan. */
export interface PlanStep {
  id: string;
  /** Ce que l'étape doit accomplir, en langage naturel. */
  description: string;
  /** Outils suggérés pour cette étape (sous-ensemble des capabilities). */
  suggestedTools?: string[];
  /** Comment vérifier que l'étape est réussie. */
  verification?: string;
  status: PlanStepStatus;
}

// ═══════════════════════════════════════════════════════════════════════════
// Observation — le résultat structuré d'une action
// ═══════════════════════════════════════════════════════════════════════════

/** Un appel d'outil décidé par le modèle. */
export interface ToolInvocation {
  name: string;
  parameters: Record<string, unknown>;
}

/** Résultat d'un appel d'outil unique. */
export interface ToolCallOutcome {
  invocation: ToolInvocation;
  success: boolean;
  /** Résultat brut de l'outil (tronqué pour l'observation). */
  result?: unknown;
  error?: string;
  durationMs: number;
  /** Vrai si le résultat provient du cache de contexte (aucun appel réel). */
  cached?: boolean;
}

/**
 * Ce que l'agent « observe » après avoir agi. Contrairement à l'ancien système
 * où les observations étaient de simples chaînes, celle-ci est structurée : elle
 * distingue le texte de raisonnement du modèle, les appels d'outils réellement
 * exécutés, et un flag indiquant si l'agent estime la tâche terminée.
 */
export interface Observation {
  /** Numéro de l'itération ayant produit cette observation. */
  iteration: number;
  /** Texte de raisonnement / réponse produit par le modèle à ce tour. */
  reasoning: string;
  /** Appels d'outils exécutés durant ce tour (dans l'ordre). */
  toolOutcomes: ToolCallOutcome[];
  /** Vrai si aucun appel d'outil n'a été demandé (réponse finale probable). */
  isFinal: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Verification — la phase de contrôle après action
// ═══════════════════════════════════════════════════════════════════════════

export interface Verification {
  passed: boolean;
  /** Contrôles exécutés (ex: "verify_typecheck", "critère: fichier créé"). */
  checks: string[];
  /** Problèmes détectés empêchant la validation. */
  issues: string[];
  /** Résumé lisible du verdict. */
  summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Recovery — la branche FAILURE de la boucle
// ═══════════════════════════════════════════════════════════════════════════

/** Erreur enrichie propagée dans la boucle agentique. */
export interface AgentError {
  /** Étape ou phase où l'erreur est survenue. */
  phase: "plan" | "act" | "verify" | "finalize";
  message: string;
  /** Nom de l'outil en cause, le cas échéant. */
  tool?: string;
  /** Erreur d'origine (non sérialisée). */
  cause?: unknown;
}

/** Décision de récupération après un échec. */
export interface Recovery {
  /**
   * Stratégie choisie :
   *  - "retry"    : refaire l'étape (avec le budget de retries restant)
   *  - "replan"   : abandonner le plan courant et en produire un nouveau
   *  - "skip"     : sauter l'étape et continuer
   *  - "abort"    : arrêter la boucle (échec définitif)
   */
  strategy: "retry" | "replan" | "skip" | "abort";
  /** Instruction corrective injectée au tour suivant. */
  instruction: string;
  /** Raison du choix de stratégie. */
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Résultats
// ═══════════════════════════════════════════════════════════════════════════

export type AgentOutcome =
  | "success"
  | "partial"
  | "blocked"
  | "no_change"
  | "failed";

/** Résultat final produit par `finalize()`. */
export interface FinalResult {
  summary: string;
  details: string;
  deliverables: string[];
  suggestions: string[];
}

/** Résultat complet retourné par `run()`. */
export interface AgentResult {
  taskId: string;
  role: AgentRole;
  goal: string;
  success: boolean;
  outcome: AgentOutcome;
  /** Le plan final (potentiellement replanifié). */
  plan: Plan;
  /** Toutes les observations, dans l'ordre. */
  observations: Observation[];
  /** Vérifications réalisées. */
  verifications: Verification[];
  /** Récupérations tentées. */
  recoveries: Recovery[];
  /** Fichiers créés / modifiés / supprimés (preuve observable). */
  filesModified: string[];
  /** Tous les outils réellement exécutés. */
  toolsExecuted: string[];
  /** Synthèse finale. */
  final: FinalResult;
  /** Consommation du budget. */
  budgetUsage: BudgetUsage;
  durationMs: number;
  /** Erreur globale si échec. */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Contrat du runtime agentique
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interface publique du runtime agentique.
 *
 * `run()` orchestre le cycle complet. Les autres méthodes sont exposées pour
 * permettre un contrôle fin (tests, orchestration externe, dry-run) et
 * correspondent aux phases de la boucle décrite dans la roadmap :
 *
 *   OBSERVE → UNDERSTAND → PLAN → ACT → OBSERVE RESULT → VERIFY
 *              ┌───────────────┐
 *              │               │
 *           SUCCESS         FAILURE
 *              │               │
 *          NEXT STEP        RECOVER
 *              └──────→────────┘ → COMPLETE
 */
export interface IAgentRuntime {
  /** Exécute la boucle complète pour une tâche. */
  run(task: AgentTask): Promise<AgentResult>;
  /** Phase PLAN : comprend l'objectif et produit un plan. */
  plan(task: AgentTask): Promise<Plan>;
  /** Phase ACT + OBSERVE : exécute une étape et retourne l'observation. */
  execute(task: AgentTask, step: PlanStep): Promise<Observation>;
  /** Phase VERIFY : contrôle qu'une étape a atteint son objectif. */
  verify(step: PlanStep, observation: Observation): Promise<Verification>;
  /** Branche FAILURE : décide comment récupérer d'une erreur. */
  recover(error: AgentError): Promise<Recovery>;
  /** Phase COMPLETE : produit la synthèse finale. */
  finalize(task: AgentTask): Promise<FinalResult>;
}

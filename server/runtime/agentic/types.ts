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
 * phase, en valeurs ABSOLUES, pour empêcher un agent de tout dépenser en
 * exploration et pour réserver des appels aux étapes critiques.
 */
export type AgentPhase = "discovery" | "plan" | "write" | "verify" | "recovery";

/**
 * Budget de mission en VALEURS ABSOLUES — source de vérité.
 *
 * Contrairement à un simple plafond global, chaque phase a son propre quota
 * d'appels d'outils. Les réserves d'écriture et de vérification NE PEUVENT PAS
 * être consommées par l'exploration : c'est ce qui garantit qu'après la
 * découverte, l'agent a toujours de quoi écrire ET vérifier.
 *
 * Répartition par défaut (total 30) :
 *   discovery 8 · plan 3 · write 9 · verify 6 · recovery 4
 *
 * Les éventuelles fractions (affichage, heuristiques) sont DÉRIVÉES de ces
 * absolus, jamais l'inverse.
 */
export interface AgentBudget {
  /** Nombre maximum d'itérations de la boucle. */
  maxIterations: number;
  /** Budget total d'appels d'outils (= somme des quotas de phase). */
  maxToolCalls: number;
  /** Quota d'appels de LECTURE / exploration (discovery). */
  maxRead: number;
  /** Quota d'appels de (re)planification. */
  maxPlan: number;
  /** Quota d'appels d'ÉCRITURE (réservé, non consommable par l'exploration). */
  maxWrite: number;
  /** Quota d'appels de VÉRIFICATION (réservé). */
  maxVerify: number;
  /** Quota d'appels de RÉCUPÉRATION / correction (réservé). */
  maxRecovery: number;
  /** Nombre maximum de fichiers lus distincts. */
  maxFilesRead: number;
  /** Temps d'exécution maximum en ms (mur temporel). */
  maxExecutionTimeMs: number;
  /**
   * Coût maximum estimé (unité abstraite alignée sur les tokens/1000).
   * `Infinity` désactive la limite de coût.
   */
  maxCost: number;
}

/**
 * Budget par défaut. Les cinq quotas de phase sont la SOURCE DE VÉRITÉ ;
 * `maxToolCalls` en est la somme (30).
 */
export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxIterations: 20,
  maxRead: 8,
  maxPlan: 3,
  maxWrite: 9,
  maxVerify: 6,
  maxRecovery: 4,
  maxToolCalls: 8 + 3 + 9 + 6 + 4, // = 30 (dérivé de la somme des phases)
  maxFilesRead: 20,
  maxExecutionTimeMs: 5 * 60_000, // 5 minutes
  maxCost: Infinity,
};

/** Recalcule `maxToolCalls` comme somme des quotas de phase (invariant). */
export function normalizeBudget(budget: AgentBudget): AgentBudget {
  const total = budget.maxRead + budget.maxPlan + budget.maxWrite + budget.maxVerify + budget.maxRecovery;
  return { ...budget, maxToolCalls: total };
}

/**
 * Lit un entier positif depuis l'environnement, avec repli silencieux si absent
 * ou invalide (0, négatif, NaN). Permet de régler les quotas sans recompiler.
 */
function envPositiveInt(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/**
 * Construit un budget surchargé par les variables d'environnement
 * `LEANNA_AGENT_*`. Chaque quota absent du `.env` conserve sa valeur par défaut
 * (`DEFAULT_AGENT_BUDGET`). `maxToolCalls` est toujours recalculé comme la somme
 * des phases (invariant), donc jamais à régler à la main.
 *
 * Variables reconnues :
 *   LEANNA_AGENT_MAX_READ         quota d'exploration (lecture)
 *   LEANNA_AGENT_MAX_PLAN         quota de (re)planification
 *   LEANNA_AGENT_MAX_WRITE        quota d'écriture (réservé)
 *   LEANNA_AGENT_MAX_VERIFY       quota de vérification (réservé)
 *   LEANNA_AGENT_MAX_RECOVERY     quota de récupération (réservé)
 *   LEANNA_AGENT_MAX_ITERATIONS   nombre maximum d'itérations de la boucle
 *   LEANNA_AGENT_MAX_FILES_READ   nombre maximum de fichiers lus distincts
 *   LEANNA_AGENT_MAX_EXEC_MS      mur temporel en millisecondes
 */
export function agentBudgetFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<AgentBudget> {
  const overrides: Partial<AgentBudget> = {};
  const map: Array<[keyof AgentBudget, string]> = [
    ["maxRead", "LEANNA_AGENT_MAX_READ"],
    ["maxPlan", "LEANNA_AGENT_MAX_PLAN"],
    ["maxWrite", "LEANNA_AGENT_MAX_WRITE"],
    ["maxVerify", "LEANNA_AGENT_MAX_VERIFY"],
    ["maxRecovery", "LEANNA_AGENT_MAX_RECOVERY"],
    ["maxIterations", "LEANNA_AGENT_MAX_ITERATIONS"],
    ["maxFilesRead", "LEANNA_AGENT_MAX_FILES_READ"],
    ["maxExecutionTimeMs", "LEANNA_AGENT_MAX_EXEC_MS"],
  ];
  for (const [field, key] of map) {
    const value = envPositiveInt(env, key);
    if (value !== undefined) overrides[field] = value;
  }
  return overrides;
}

/** Réserve d'appels garantie aux actions critiques (write + verify + recovery). */
export function criticalReserve(budget: AgentBudget): number {
  return budget.maxWrite + budget.maxVerify + budget.maxRecovery;
}

/**
 * Fractions DÉRIVÉES des absolus (pour affichage / diagnostics uniquement).
 * Ne jamais utiliser comme source de vérité.
 */
export function derivedPhaseFractions(budget: AgentBudget): {
  discovery: number; plan: number; write: number; verify: number; recovery: number;
} {
  const total = budget.maxToolCalls || 1;
  return {
    discovery: budget.maxRead / total,
    plan: budget.maxPlan / total,
    write: budget.maxWrite / total,
    verify: budget.maxVerify / total,
    recovery: budget.maxRecovery / total,
  };
}

/** Classe un appel d'outil par nature, pour la comptabilité séparée. */
export type ToolKind = "read" | "write" | "verify" | "other";

/**
 * Consommation courante du budget, mise à jour à chaque appel d'outil.
 * Les compteurs sont SÉPARÉS (lecture / écriture / vérification) afin que la
 * règle d'arrêt et le budget réservé aux actions critiques soient exploitables.
 */
export interface BudgetUsage {
  iterations: number;
  /** Total d'appels d'outils (somme des compteurs par nature). */
  toolCalls: number;
  readCalls: number;
  writeCalls: number;
  verifyCalls: number;
  /** Appels de correction consommés dans la phase recovery. */
  recoveryCalls: number;
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
    recoveryCalls: 0,
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
  /** Fichier concerné (pilote la politique de réparation par fichier). */
  file?: string;
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
  /** Fichiers distincts réellement LUS pendant la mission (preuve observable). */
  filesRead: string[];
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

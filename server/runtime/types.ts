/**
 * Runtime Types — Types fondamentaux du nouveau runtime
 * 
 * Principes : types simples, pas de classes, composition, discriminated unions.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Task State Machine
// ═══════════════════════════════════════════════════════════════════════════════

export type TaskState =
  | "pending"
  | "planning"
  | "running"
  | "reviewing"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskTransition =
  | { from: "pending"; to: "planning" | "running" | "cancelled" }
  | { from: "planning"; to: "running" | "failed" | "cancelled" }
  | { from: "running"; to: "reviewing" | "validating" | "completed" | "failed" | "cancelled" }
  | { from: "reviewing"; to: "running" | "completed" | "failed" }
  | { from: "validating"; to: "completed" | "failed" | "running" };

export const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  pending: ["planning", "running", "cancelled"],
  planning: ["running", "failed", "cancelled"],
  running: ["reviewing", "validating", "completed", "failed", "cancelled"],
  reviewing: ["running", "completed", "failed"],
  validating: ["completed", "failed", "running"],
  completed: [],
  failed: [],
  cancelled: [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Plugin Interface
// ═══════════════════════════════════════════════════════════════════════════════

export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  maxConcurrency: number;
  timeoutMs: number;
}

export interface AgentContext {
  taskId: string;
  title: string;
  description: string;
  files: string[];
  instructions?: string;
  previousResults?: TaskResult[];
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  details?: string;
  filesModified?: string[];
  suggestions?: string[];
  error?: string;
  durationMs: number;
  delegatedTo?: string[];
}

export type AgentPriority = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  agentId: string;
  title: string;
  description: string;
  priority: AgentPriority;
  state: TaskState;
  context: AgentContext;
  result?: TaskResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  timeoutMs: number;
  parentTaskId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Registry
// ═══════════════════════════════════════════════════════════════════════════════

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Provenance d'un outil au moment de son enregistrement dans le ToolRegistry.
 *
 * C'est la clé qui rend l'inventaire TRAÇABLE : chaque outil sait d'où il vient,
 * ce qui explique mécaniquement les écarts de compteurs au démarrage (p. ex.
 * « 225 outils builtin au premier log » vs « 229 outils exécutables au total »
 * = + les outils `mcp` et `custom` enregistrés après le snapshot builtin).
 *
 *   - `builtin` : skills statiques livrées avec l'application (server/skills/*).
 *   - `mcp`     : outils exposés par un serveur MCP via le bridge.
 *   - `custom`  : skills définies par l'utilisateur et chargées depuis la BDD.
 *   - `unknown` : provenance non renseignée (défaut rétrocompatible).
 */
export type ToolSource = "builtin" | "mcp" | "custom" | "unknown";

export interface ToolDefinition {
  declaration: ToolDeclaration;
  handler: ToolHandler;
  /** Permissions requises pour utiliser cet outil */
  permissions?: ToolPermission[];
  /** Timeout max en ms (défaut: 30s) */
  timeoutMs?: number;
  /** Catégorie pour le filtrage */
  category?: string;
  /**
   * Provenance de l'outil (builtin / mcp / custom). Posée au moment de
   * l'enregistrement. Absente = `unknown` (comportement historique inchangé).
   */
  source?: ToolSource;
  /**
   * Propriétaire logique : nom de la skill (ou id du serveur MCP) qui a
   * enregistré l'outil. Donne la granularité fine au-delà de `source`.
   */
  owner?: string;
  /**
   * Horodatage (epoch ms) de l'enregistrement effectif dans le ToolRegistry.
   * Posé par le registre, pas par l'adaptateur, pour refléter l'ordre réel.
   */
  registeredAt?: number;
  /**
   * Attribution d'agent (source de vérité côté ToolRegistry).
   *
   * Quand présente, cette métadonnée PRIME sur le mapping dérivé des
   * `capabilities` des rôles (server/agents/roles.ts). Elle permet au
   * ToolRegistry d'être la source unique de vérité pour « quel agent est
   * responsable de cet outil », au lieu de laisser le renderer deviner
   * (et retomber à tort sur un rôle plausible).
   *
   * Toutes les clés sont facultatives : un outil sans attribution conserve
   * exactement le comportement historique (mapping par capability, puis
   * rôle neutre `system` en dernier recours).
   */
  attribution?: ToolAttribution;
}

/**
 * Métadonnées d'attribution d'un outil à un ou plusieurs agents.
 * Alignée sur le modèle cible décrit dans l'architecture (allowedAgents /
 * preferredAgent / risk / executionMode).
 */
export interface ToolAttribution {
  /**
   * Rôles autorisés à invoquer cet outil. Vide/absent = aucune restriction
   * explicite (l'éligibilité reste dérivée des capabilities de rôle).
   */
  allowedAgents?: string[];
  /**
   * Agent affiché par défaut pour cet outil dans l'UI (télémétrie / audit).
   * S'il est absent, on retombe sur le premier de `allowedAgents`.
   */
  preferredAgent?: string;
  /** Niveau de risque de l'opération (pour l'UI et les politiques d'approbation). */
  risk?: ToolPermission;
  /** Contexte d'exécution : boucle runtime, délégation, ou les deux. */
  executionMode?: "runtime" | "delegation" | "both";
  /** L'activité de cet outil doit-elle remonter dans la télémétrie UI ? */
  observable?: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Permissions d'un outil/skill.
 *
 * Vocabulaire canonique de la roadmap V1.1 :
 *   - `read`    : lecture de fichiers / ressources
 *   - `write`   : modification / création / suppression de fichiers
 *   - `network` : accès réseau sortant (HTTP, git remote, API tierces…)
 *   - `exec`    : exécution de commandes shell / processus
 *
 * `execute` est un alias historique de `exec` et `dangerous` un marqueur
 * additionnel pour les opérations destructrices. `normalizePermission()`
 * ramène toujours `execute` → `exec`.
 */
export type ToolPermission = "read" | "write" | "network" | "exec" | "execute" | "dangerous";

/** Les quatre permissions déclarables par skill (vocabulaire roadmap). */
export type SkillPermission = "read" | "write" | "network" | "exec";

/** Ordre canonique utilisé pour l'affichage et la comparaison. */
export const CANONICAL_PERMISSIONS: readonly ToolPermission[] = [
  "read",
  "write",
  "network",
  "exec",
  "dangerous",
] as const;

/**
 * Normalise une permission vers sa forme canonique.
 * `execute` (legacy) → `exec`.
 */
export function normalizePermission(permission: ToolPermission): ToolPermission {
  return permission === "execute" ? "exec" : permission;
}

/** Normalise et dédoublonne une liste de permissions. */
export function normalizePermissions(
  permissions: readonly ToolPermission[] | undefined
): ToolPermission[] {
  if (!permissions?.length) return [];
  const seen = new Set<ToolPermission>();
  for (const p of permissions) seen.add(normalizePermission(p));
  return CANONICAL_PERMISSIONS.filter((p) => seen.has(p));
}

export interface ToolCallMetrics {
  toolName: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
  agentId?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Bus
// ═══════════════════════════════════════════════════════════════════════════════

export type RuntimeEvent =
  | { type: "task:created"; task: Task }
  | { type: "task:stateChanged"; taskId: string; from: TaskState; to: TaskState }
  | { type: "task:completed"; taskId: string; result: TaskResult }
  | { type: "task:failed"; taskId: string; error: string }
  | { type: "tool:called"; toolName: string; agentId?: string }
  | { type: "tool:completed"; toolName: string; durationMs: number; success: boolean }
  | {
      type: "tool:permissionDenied";
      toolName: string;
      required: ToolPermission[];
      /**
       * Motifs de refus : permissions manquantes, le pseudo-motif "undeclared"
       * (absence de déclaration, voir PermissionPolicy.denyUndeclared), ou un
       * motif d'agent "agent-not-allowed:<role>" (autorisation par agent).
       */
      missing: Array<ToolPermission | "undeclared" | `agent-not-allowed:${string}`>;
      mode: "enforce" | "audit" | "off";
      enforced: boolean;
      agentId?: string;
    }
  | {
      type: "tool:simulated";
      toolName: string;
      effects: ToolPermission[];
      agentId?: string;
    }
  | { type: "agent:registered"; agentId: string }
  | { type: "agent:busy"; agentId: string; taskId: string }
  | { type: "agent:idle"; agentId: string }
  | { type: "workflow:started"; workflowId: string; name: string }
  | { type: "workflow:stepCompleted"; workflowId: string; stepId: string; success: boolean }
  | { type: "workflow:completed"; workflowId: string; success: boolean }
  | { type: "memory:updated"; level: MemoryLevel; key: string }
  | { type: "memory:hierarchical:stored"; tier: string; id: string }
  | { type: "memory:hierarchical:promoted"; fromTier: string; toTier: string; sourceId: string; newId: string }
  | { type: "autonomy:heartbeat"; attentionRequired: boolean; state: "active" | "idle" | "sleep"; reason: string }
  | { type: "autonomy:stateChanged"; from: string; to: string; reason: string }
  | { type: "autonomy:health"; status: "healthy" | "degraded"; reason: string }
  | { type: "autonomy:taskCreated"; taskId: string; taskType: string; sourceEventId: string }
  | { type: "autonomy:taskStateChanged"; taskId: string; taskType: string; from: string; to: string; error?: string }
  | {
      /**
       * Changement de fichier observé dans le workspace (création / modification /
       * suppression). Émis par un producteur branché sur le FileWatcher. Permet à
       * la perception de réagir à l'édition du code sans sonder le disque.
       */
      type: "fs:changed";
      /** Chemin du fichier concerné (relatif au workspace quand connu). */
      path: string;
      /** Nature du changement. */
      change: "created" | "modified" | "deleted";
      /** Nombre de fichiers touchés dans la même salve (débounce), si groupé. */
      batchSize?: number;
    }
  | {
      /**
       * Changement d'état Git (branche, commit, divergence avec le remote,
       * arbre de travail sale). Émis par un producteur branché sur Git.
       */
      type: "git:stateChanged";
      /** Branche courante, si connue. */
      branch?: string;
      /** Nombre de fichiers non commités (staged + unstaged). */
      dirtyFiles: number;
      /** Commits en avance / en retard par rapport au remote suivi. */
      ahead?: number;
      behind?: number;
    }
  | {
      /**
       * Résultat d'une exécution de tests. `failed > 0` est un signal rouge que la
       * perception traite comme un problème nécessitant une attention.
       */
      type: "tests:completed";
      passed: number;
      failed: number;
      /** Durée totale de la suite, en ms, si connue. */
      durationMs?: number;
      /** Suite/commande concernée (ex. "vitest", "npm test"), si connue. */
      suite?: string;
    }
  | {
      /**
       * Échéance/temporisation arrivée à terme (ex. briefing quotidien, deadline
       * d'un objectif, relance planifiée). Produit par un ordonnanceur (bucket
       * temporel de l'AnticipationEngine ou automationScheduler).
       */
      type: "schedule:due";
      /** Identifiant stable de l'échéance (ex. "daily-briefing"). */
      scheduleId: string;
      /** Libellé lisible de ce qui est dû. */
      label: string;
      /** Importance normalisée 0..1 suggérée par le producteur. */
      importance?: number;
    }
  | {
      /**
       * Proposition proactive émise par l'AnticipationEngine : Leanna a observé
       * l'environnement, détecté un problème/opportunité et propose une action.
       * C'est une *suggestion* — l'exécution reste derrière le pipeline existant
       * (TaskManager → AutonomousExecutive → executeMission → permissions/dry-run).
       */
      type: "autonomy:anticipation";
      /** Identifiant stable de la proposition (dédupliqué par fingerprint). */
      proposalId: string;
      /** Classe de signal détecté. */
      kind: "problem" | "opportunity" | "optimization" | "risk" | "automation";
      /** Importance normalisée 0..1 (sert au tri/priorisation côté UI). */
      importance: number;
      /** Priorité suggérée pour la mission dérivée. */
      priority: "low" | "medium" | "high" | "critical";
      /** Message lisible destiné à l'utilisateur. */
      message: string;
      /** Ressources concernées (ids de skills, fichiers, workflows…). */
      affectedResources: string[];
      /** Action concrète proposée (titre de mission potentielle). */
      suggestedAction: string;
      /** La proposition a-t-elle été transformée en tâche de mission ? */
      queuedAsTask: boolean;
    };

export type RuntimeEventType = RuntimeEvent["type"];
export type RuntimeEventHandler<T extends RuntimeEventType = RuntimeEventType> =
  (event: Extract<RuntimeEvent, { type: T }>) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// Memory
// ═══════════════════════════════════════════════════════════════════════════════

export type MemoryLevel = "working" | "session" | "project" | "longterm";

export interface MemoryEntry {
  key: string;
  value: unknown;
  level: MemoryLevel;
  createdAt: number;
  updatedAt: number;
  ttl?: number; // ms, après lequel l'entrée expire
  tags?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Workflow Engine
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
}

export interface WorkflowStep {
  id: string;
  action: string;
  args?: Record<string, unknown>;
  label?: string;
  condition?: string;
  dependsOn?: string[];
  onError?: "stop" | "skip" | "retry";
  maxRetries?: number;
  timeoutMs?: number;
}

export interface WorkflowTrigger {
  type: "schedule" | "event" | "manual";
  config: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  state: TaskState;
  startedAt: number;
  completedAt?: number;
  currentStepIndex: number;
  stepResults: Map<string, { success: boolean; result?: unknown; error?: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Prompt Registry
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  variables?: string[];
  version: number;
  /** ID du prompt parent pour l'héritage */
  extends?: string;
  /** Catégorie pour le regroupement */
  category?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Configuration
// ═══════════════════════════════════════════════════════════════════════════════

export interface RuntimeConfig {
  maxConcurrentTasks: number;
  defaultTimeoutMs: number;
  enableMetrics: boolean;
  enablePersistence: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxConcurrentTasks: 10,
  defaultTimeoutMs: 60_000,
  enableMetrics: true,
  enablePersistence: true,
  logLevel: "info",
};

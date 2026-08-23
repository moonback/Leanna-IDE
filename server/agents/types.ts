import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// Types du système d'agents multi-rôles
// ═══════════════════════════════════════════════════════════════════════════════

/** Rôles d'agents spécialisés disponibles — ingénierie de code & rédaction de documents */
export const AGENT_ROLES = [
  // Agents de Code & Ingénierie logicielle
  "coder",
  "refactor",
  "debugger",
  "reviewer",
  "tester",
  "security",
  "architect",
  // Agents de Rédaction & Documentation
  "writer",
  "formatter",
  "researcher",
  "proofreader",
  "translator",
  "summarizer",
  "planner",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Alias contrôlés acceptés aux frontières LLM. Aucun rôle n'est inventé. */
const AGENT_ROLE_ALIASES: Readonly<Record<string, AgentRole>> = {
  // Aliases Code & Dév
  coder: "coder",
  developpeur: "coder",
  développeur: "coder",
  dev: "coder",
  developer: "coder",
  code: "coder",
  programmer: "coder",
  programmeur: "coder",
  refactor: "refactor",
  refactoring: "refactor",
  clean_code: "refactor",
  restructuration: "refactor",
  debugger: "debugger",
  debug: "debugger",
  correctif: "debugger",
  fix: "debugger",
  bugfix: "debugger",
  depannage: "debugger",
  dépannage: "debugger",
  reviewer: "reviewer",
  review: "reviewer",
  revue: "reviewer",
  code_review: "reviewer",
  audit_code: "reviewer",
  tester: "tester",
  test: "tester",
  tests: "tester",
  qa: "tester",
  quality: "tester",
  security: "security",
  securite: "security",
  sécurité: "security",
  sec: "security",
  audit_secu: "security",
  audit_sécu: "security",
  architect: "architect",
  architecte: "architect",
  architecture: "architect",
  conception: "architect",
  // Aliases Rédaction & Documents
  writer: "writer",
  docs: "writer",
  doc: "writer",
  documentation: "writer",
  redacteur: "writer",
  rédacteur: "writer",
  write: "writer",
  redaction: "writer",
  rédaction: "writer",
  formatter: "formatter",
  format: "formatter",
  mise_en_forme: "formatter",
  structure: "formatter",
  researcher: "researcher",
  recherche: "researcher",
  research: "researcher",
  proofreader: "proofreader",
  correcteur: "proofreader",
  correction: "proofreader",
  relecture: "proofreader",
  translator: "translator",
  traduction: "translator",
  translate: "translator",
  summarizer: "summarizer",
  synthese: "summarizer",
  synthèse: "summarizer",
  resume: "summarizer",
  résumé: "summarizer",
  planner: "planner",
  plan: "planner",
  outline: "planner",
  planification: "planner",
};

/** Normalise seulement les alias approuvés, puis laisse le schéma strict rejeter le reste. */
export function normalizeAgentRole(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  return AGENT_ROLE_ALIASES[normalized] ?? normalized;
}

/** Statuts possibles d'une tâche déléguée */
export type TaskStatus = "pending" | "running" | "completed" | "incomplete" | "failed" | "cancelled";

/** Priorité d'une tâche */
export type TaskPriority = "low" | "medium" | "high" | "critical";

/** Définition d'un agent spécialisé */
export interface AgentDefinition {
  role: AgentRole;
  name: string;
  description: string;
  /** Capacités de l'agent (skills/outils auxquels il a accès) */
  capabilities: string[];
  /** Instructions système spécifiques à l'agent */
  systemPrompt: string;
  /** Nombre max de tâches simultanées */
  maxConcurrency: number;
  /** Timeout par défaut en ms */
  defaultTimeoutMs: number;
}

/** Tâche déléguée à un agent */
export interface AgentTask {
  id: string;
  /** ID du workflow parent (si orchestration multi-agents) */
  orchestrationId?: string;
  role: AgentRole;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Fichiers/contexte pertinents pour la tâche */
  context: TaskContext;
  /** Résultat de l'exécution */
  result?: TaskResult;
  /** Timestamps */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Timeout en ms (override du défaut) */
  timeoutMs?: number;
}

/** Contexte fourni à un agent pour exécuter sa tâche */
export interface TaskContext {
  /** Fichiers concernés */
  files: string[];
  /** Instructions additionnelles */
  instructions?: string;
  /** Résultats d'agents précédents (pour le chaînage) */
  previousResults?: TaskResult[];
  /** Métadonnées libres */
  metadata?: Record<string, unknown>;
}

/** Résultat de l'exécution d'une tâche */
export interface TaskResult {
  success: boolean;
  /** Résumé court de ce qui a été fait */
  summary: string;
  /** Détails complets */
  details?: string;
  /** Fichiers créés ou modifiés */
  filesModified?: string[];
  /** Fichiers rejetés par la validation pré-écriture (contenu invalide) */
  fileValidationErrors?: { path: string; error: string }[];
  /** Suggestions pour l'utilisateur */
  suggestions?: string[];
  /** Erreur si échec */
  error?: string;
  /** Durée d'exécution en ms */
  durationMs: number;
  /** IDs des sous-tâches déléguées de manière autonome (fire-and-forget) */
  delegatedSubTasks?: string[];
  /** Preuves collectées par l'exécuteur, distinctes de la narration du modèle. */
  evidence?: TaskEvidence;
}

/** Éléments vérifiables nécessaires pour déclarer une tâche terminée. */
export interface TaskEvidence {
  filesRead: string[];
  filesModified: string[];
  toolsExecuted: string[];
  commandsExecuted: string[];
  /** Pre/post global checks and delta-based regression evidence. */
  globalValidation?: {
    baseline: unknown;
    current: unknown;
    regressions: string[];
    passed: boolean;
  };
  verification: {
    passed: boolean;
    checks: string[];
    errors: string[];
  };
}

/** Plan d'orchestration multi-agents */
export interface OrchestrationPlan {
  id: string;
  title: string;
  description: string;
  /** Tâches ordonnées (certaines peuvent être parallèles) */
  tasks: AgentTask[];
  /** Dépendances entre tâches: taskId → [taskIds dont elle dépend] */
  dependencies: Record<string, string[]>;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
}

// ─── Zod Schemas pour validation ──────────────────────────────────────────────

const strictAgentRoleSchema = z.enum(
  AGENT_ROLES,
  {
    errorMap: (_issue, ctx) => ({
      message:
        `Rôle invalide : "${ctx.data}". ` +
        `Un seul rôle autorisé par tâche, parmi : ${AGENT_ROLES.join(", ")}.`,
    }),
  }
);

/** Accepte uniquement les rôles officiels et les alias explicitement approuvés. */
export const agentRoleSchema = z
  .union([
    strictAgentRoleSchema,
    z.enum([
      // Code & Dev aliases
      "coder", "developpeur", "développeur", "dev", "developer", "code", "programmer", "programmeur",
      "refactor", "refactoring", "clean_code", "restructuration",
      "debugger", "debug", "correctif", "fix", "bugfix", "depannage", "dépannage",
      "reviewer", "review", "revue", "code_review", "audit_code",
      "tester", "test", "tests", "qa", "quality",
      "security", "securite", "sécurité", "sec", "audit_secu", "audit_sécu",
      "architect", "architecte", "architecture", "conception",
      // Docs aliases
      "docs", "doc", "documentation",
      "redacteur", "rédacteur", "write", "redaction", "rédaction",
      "format", "mise_en_forme", "structure",
      "recherche", "research",
      "correcteur", "correction", "relecture",
      "traduction", "translate",
      "synthese", "synthèse", "resume", "résumé",
      "plan", "outline", "planification",
    ]),
  ])
  .transform((value): AgentRole => normalizeAgentRole(value) as AgentRole);

export const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const delegateTaskSchema = z.object({
  role: agentRoleSchema,
  title: z.string().min(1, "Le titre de la tâche est requis").trim(),
  description: z.string().min(1, "La description de la tâche est requise").trim(),
  files: z.array(z.string()).optional().default([]),
  instructions: z.string().optional(),
  priority: taskPrioritySchema.optional().default("medium"),
  timeoutMs: z.number().int().positive().optional(),
});

export const orchestrateSchema = z.object({
  title: z.string().min(1).trim(),
  description: z.string().min(1).trim(),
  tasks: z.array(z.object({
    role: agentRoleSchema,
    title: z.string().min(1).trim(),
    description: z.string().min(1).trim(),
    files: z.array(z.string()).optional().default([]),
    instructions: z.string().optional(),
    priority: taskPrioritySchema.optional().default("medium"),
    dependsOn: z.array(z.string()).optional().default([]),
  })).min(1, "Au moins une tâche requise"),
});

export const listAgentTasksSchema = z.object({
  role: agentRoleSchema.optional(),
  status: z.enum(["pending", "running", "completed", "incomplete", "failed", "cancelled"]).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

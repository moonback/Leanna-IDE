// ═══════════════════════════════════════════════════════════════════════════════
// Types partagés du tableau de bord d'observabilité.
// Les formes correspondent aux réponses de /api/observability/* côté serveur.
// ═══════════════════════════════════════════════════════════════════════════════

export interface DashboardOverview {
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  avgCostPerCall?: number;
  avgTokensPerCall?: number;
}

export interface ModelStat {
  model: string;
  tokens: number;
  cost: number;
  calls: number;
  avgTokensPerCall: number;
  avgCostPerCall: number;
}

export interface AgentStat {
  role: string;
  tokens: number;
  cost: number;
  calls: number;
}

export interface MissionStat {
  missionId: string;
  tokens: number;
  cost: number;
}

export interface Dashboard {
  period?: 'day' | 'hour';
  overview: DashboardOverview;
  byModel: ModelStat[];
  byAgent: AgentStat[];
  byMission: MissionStat[];
}

export interface UsageRecord {
  id: string;
  missionId?: string;
  taskId?: string;
  agentRole?: string;
  provider: 'gemini' | 'openrouter';
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp: string;
}

export interface BudgetConfig {
  maxTokens?: number;
  maxCostUsd?: number;
}

export interface BudgetStatus {
  tokensUsed: number;
  costUsd: number;
  exceeded: boolean;
  reason?: string;
}

// Snapshot runtime réel (voir server/runtime/Observability.ts). Toutes les
// valeurs proviennent du runtime ; aucune n'est simulée côté front.
export interface RuntimeSnapshot {
  timestamp: number;
  uptime: number;
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
  tasks: { total: number; completed: number; failed: number; avgDurationMs: number };
  tools: {
    totalCalls: number;
    avgLatencyMs: number;
    failureRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    latencySampleSize: number;
  };
  agents: { active: number; busiest: string | null };
}

export interface HealthInfo {
  status: string;
  telemetry: { totalRecordsInMemory: string; supabaseConnected: boolean };
}

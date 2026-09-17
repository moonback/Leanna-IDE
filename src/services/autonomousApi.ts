/**
 * autonomousApi.ts — Client API typé pour l'Autonomous Core V2
 *
 * Toutes les requêtes passent par /api/agents/autonomous/*
 * et incluent le header d'authentification automatiquement.
 */

const BASE = '/api/agents/autonomous';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-Leanna-token': token } : {};
}

// ─── Types partagés (miroir léger des types serveur) ─────────────────────────

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type AutonomousState =
  | 'idle' | 'observing' | 'understanding' | 'planning'
  | 'executing' | 'verifying' | 'reflecting' | 'learning' | 'waiting';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'failed' | 'archived';
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';
export type GoalCadence = 'once' | 'continuous' | 'on_change' | 'scheduled';
export type MissionStatus = 'pending' | 'running' | 'verifying' | 'completed' | 'failed' | 'cancelled';
export type OpportunityType =
  | 'tech_debt' | 'missing_test' | 'missing_doc' | 'stale_dependency'
  | 'security_issue' | 'code_duplication' | 'architecture_inconsistency'
  | 'abandoned_todo' | 'performance_issue' | 'type_error';

export interface GoalCheck {
  type: string;
  label?: string;
  params?: Record<string, unknown>;
}

export interface GoalConstraints {
  noBreakingChanges?: boolean;
  requireTests?: boolean;
  requireTypeCheck?: boolean;
  maxAutonomyLevel?: AutonomyLevel;
  excludePaths?: string[];
  maxConcurrentMissions?: number;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  priority: GoalPriority;
  status: GoalStatus;
  cadence: GoalCadence;
  schedule?: string;
  constraints: GoalConstraints;
  checks: GoalCheck[];
  successCriteria: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt?: string;
  lastMissionAt?: string;
  completedAt?: string;
}

export interface GoalCreateInput {
  title: string;
  description: string;
  priority?: GoalPriority;
  cadence?: GoalCadence;
  schedule?: string;
  constraints?: Partial<GoalConstraints>;
  checks?: GoalCheck[];
  successCriteria?: string[];
  tags?: string[];
}

export interface Mission {
  id: string;
  goalId: string;
  title: string;
  description: string;
  status: MissionStatus;
  priority: string;
  agentTaskId?: string;
  agents: string[];
  files: string[];
  result?: { success: boolean; summary: string; error?: string; filesModified?: string[] };
  lessonsLearned?: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface RuntimeStatus {
  state: AutonomousState;
  autonomyLevel: AutonomyLevel;
  activeGoals: number;
  activeMissions: number;
  totalMissionsRun: number;
  totalMissionsSucceeded: number;
  totalMissionsFailed: number;
  lastEventAt?: number;
  lastMissionAt?: string;
  uptime: number;
  startedAt: string;
}

export interface Diagnostics {
  runtime: RuntimeStatus;
  autonomy: {
    currentLevel: AutonomyLevel;
    currentLevelLabel: string;
    allowedTools: number;
    blockedTools: number;
    auditEntries: number;
    recentDenials: number;
  };
  perception: { running: boolean; totalEventsProduced: number; handlers: number };
  missions: { total: number; active: number; completed: number; failed: number; cancelled: number };
  opportunities: { running: boolean; lastScanAt: number; scanIntervalMs: number };
  goals: { total: number; active: number; due: number };
}

export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  files: string[];
  score: number;
  estimatedEffort: 'low' | 'medium' | 'high';
  detectedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
const del = <T>(path: string) => request<T>('DELETE', path);

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME
// ═══════════════════════════════════════════════════════════════════════════════

export const autonomousApi = {
  // ── Runtime ────────────────────────────────────────────────────────────────

  getStatus: () => get<RuntimeStatus>('/status'),

  getDiagnostics: () => get<Diagnostics>('/diagnostics'),

  setLevel: (level: AutonomyLevel) =>
    patch<{ level: AutonomyLevel; label: string }>('/level', { level }),

  start: () => post<{ started: boolean; status: RuntimeStatus }>('/start'),

  stop: () => post<{ stopped: boolean }>('/stop'),

  trigger: (type: string, payload?: Record<string, unknown>, files?: string[]) =>
    post<{ triggered: boolean; type: string }>('/trigger', { type, payload, files }),

  scan: () => post<{ count: number; opportunities: Opportunity[] }>('/scan'),

  // ── Goals ──────────────────────────────────────────────────────────────────

  listGoals: (status?: GoalStatus) =>
    get<Goal[]>(`/goals${status ? `?status=${status}` : ''}`),

  createGoal: (input: GoalCreateInput) =>
    request<Goal>('POST', '/goals', input),

  getGoal: (id: string) => get<Goal>(`/goals/${id}`),

  updateGoal: (id: string, updates: Partial<GoalCreateInput>) =>
    patch<Goal>(`/goals/${id}`, updates),

  pauseGoal: (id: string) =>
    patch<{ paused: boolean; id: string }>(`/goals/${id}/pause`, {}),

  resumeGoal: (id: string) =>
    patch<{ resumed: boolean; id: string }>(`/goals/${id}/resume`, {}),

  deleteGoal: (id: string) => del<{ deleted: boolean; id: string }>(`/goals/${id}`),

  // ── Missions ───────────────────────────────────────────────────────────────

  listMissions: (limit = 20) => get<Mission[]>(`/missions?limit=${limit}`),

  getMission: (id: string) => get<Mission>(`/missions/${id}`),

  cancelMission: (id: string) =>
    post<{ cancelled: boolean; id: string }>(`/missions/${id}/cancel`),
};

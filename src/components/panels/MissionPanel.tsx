import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Target, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Brain, Zap, RotateCcw, Pause, Play,
  TrendingUp, TrendingDown, Minus, Clock, Plus, Trash2, X,
  DollarSign, Timer, Shield, Activity, Ban, RefreshCw, Sparkles,
} from 'lucide-react';
import { Panel } from '../ui/Panel.js';
import { usePendingApprovals, clearPendingApproval } from '../../hooks/usePendingApprovals.js';
import {
  useResumeConfirmations,
  clearResumeConfirmation,
  seedResumeConfirmations,
  type ResumeConfirmationInfo,
} from '../../hooks/useResumeConfirmations.js';
import { skillLabel } from '../../utils/skillLabels.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface MissionEvent {
  type: 'mission_event';
  event: string;
  missionId: string;
  title?: string;
  status?: string;
  goalId?: string;
  goalTitle?: string;
  actionId?: string;
  skill?: string;
  success?: boolean;
  confidence?: number;
  decision?: string;
  reason?: string;
  durationMs?: number;
  error?: string;
  timestamp: string;
  plan?: MissionPlan;
  /** Arguments de l'action (pour les demandes d'approbation). */
  args?: Record<string, unknown>;
  /** Délai avant refus automatique d'une approbation (ms). */
  timeoutMs?: number;
}

import type { PendingApprovalInfo } from '../../hooks/usePendingApprovals.js';

/** Demande d'approbation en attente pour une action à effet de bord. */
type PendingApproval = PendingApprovalInfo;

interface MissionPlan {
  objectives: string[];
  targetedFiles: string[];
  tools: string[];
  risks: string[];
  estimatedTokens: number;
  stopConditions: string[];
  estimatedCostUsd?: number;
  estimatedDurationMs?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  estimationConfidence?: number;
}

type MissionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'paused' | 'cancelled';

/** Auto-évaluation post-mission (plan vs exécution vs résultat), calculée côté serveur. */
interface MissionSelfEvaluation {
  overall: number;
  scores: Record<string, number>;
  summary?: string;
  notes: string[];
  nextTimeStartWith?: string;
}

interface MissionEntry {
  id: string;
  title: string;
  description?: string;
  status: MissionStatus;
  priority: string;
  goals: GoalEntry[];
  activeGoalId: string | null;
  confidence: number;
  metrics: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
  };
  createdAt: Date;
  completedAt?: Date;
  durationMs?: number;
  lastError?: { action: string; error?: string };
  errorCount?: number;
  selfEvaluation?: MissionSelfEvaluation;
  plan?: MissionPlan;
}

interface GoalEntry {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  actions: ActionEntry[];
}

interface ActionEntry {
  id: string;
  skill: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  confidence?: number;
  decision?: string;
  durationMs?: number;
  /** Cause lisible d'un échec (réflexion post-action). */
  failure?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function confidenceColor(conf: number): string {
  if (conf >= 0.7) return 'var(--color-success)';
  if (conf >= 0.4) return 'var(--color-warning)';
  return 'var(--color-error)';
}

function confidenceIcon(conf: number) {
  if (conf >= 0.7) return <TrendingUp size={10} />;
  if (conf >= 0.4) return <Minus size={10} />;
  return <TrendingDown size={10} />;
}

function statusIcon(status: string, size = 10) {
  switch (status) {
    // Seul l'état réellement en cours anime le spinner. Toute autre valeur
    // affiche une icône statique — plus aucun tournoiement après la fin.
    case 'in_progress': return <Loader2 size={size} className="animate-spin" style={{ color: 'var(--color-info)' }} />;
    case 'completed': return <CheckCircle2 size={size} style={{ color: 'var(--color-success)' }} />;
    case 'failed': return <XCircle size={size} style={{ color: 'var(--color-error)' }} />;
    case 'blocked': return <AlertTriangle size={size} style={{ color: 'var(--color-warning)' }} />;
    case 'paused': return <Pause size={size} style={{ color: 'var(--color-warning)' }} />;
    case 'cancelled': return <Ban size={size} style={{ color: 'var(--text-dimmed)' }} />;
    default: return <Clock size={size} style={{ color: 'var(--text-dimmed)' }} />;
  }
}

/** Libellé lisible du statut de mission, affiché à côté du titre. */
function statusLabel(status: string): { text: string; color: string } {
  switch (status) {
    case 'in_progress': return { text: 'En cours', color: 'var(--color-info)' };
    case 'completed': return { text: 'Terminée', color: 'var(--color-success)' };
    case 'failed': return { text: 'Échouée', color: 'var(--color-error)' };
    case 'blocked': return { text: 'Bloquée', color: 'var(--color-warning)' };
    case 'paused': return { text: 'En pause', color: 'var(--color-warning)' };
    case 'cancelled': return { text: 'Annulée', color: 'var(--text-dimmed)' };
    default: return { text: 'En attente', color: 'var(--text-dimmed)' };
  }
}

function decisionBadge(decision: string) {
  // `label` reste court pour la place disponible ; `hint` explicite la portée
  // concrète de la décision du superviseur (affiché en info-bulle).
  const config: Record<string, { color: string; label: string; hint: string; icon: React.ReactNode }> = {
    continue: {
      color: 'var(--color-success)',
      label: 'Continue',
      hint: 'Continuer : l’action a réussi, la mission passe à l’étape suivante.',
      icon: <Play size={8} />,
    },
    retry: {
      color: 'var(--color-warning)',
      label: 'Réessai',
      hint: 'Réessai : rejoue la même action à l’identique (échec jugé passager).',
      icon: <RotateCcw size={8} />,
    },
    replan: {
      color: 'var(--color-warning)',
      label: 'Replanif.',
      hint: 'Replanification : l’approche a échoué, l’agent recalcule un nouveau plan.',
      icon: <Brain size={8} />,
    },
    escalate: {
      color: 'var(--color-error)',
      label: 'Escalade',
      hint: 'Escalade : l’agent ne peut pas résoudre seul et remonte à l’utilisateur.',
      icon: <AlertTriangle size={8} />,
    },
    abort: {
      color: 'var(--color-error)',
      label: 'Abandon',
      hint: 'Abandon : arrêt de la mission. Les actions déjà effectuées ne sont pas annulées automatiquement.',
      icon: <XCircle size={8} />,
    },
  };
  const c = config[decision] ?? config.continue;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-xs font-bold uppercase"
      style={{ color: c.color, backgroundColor: `color-mix(in srgb, ${c.color} 6%, transparent)` }}
      title={c.hint}
    >
      {c.icon} {c.label}
    </span>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min ${sec}s`;
}

/** Missions vivantes (en cours, en pause, bloquées ou pas encore démarrées). */
const LIVE_STATUSES: ReadonlySet<MissionStatus> = new Set(['pending', 'in_progress', 'paused', 'blocked']);
/** Missions terminées (historique). */
const DONE_STATUSES: ReadonlySet<MissionStatus> = new Set(['completed', 'failed', 'cancelled']);

type MissionFilter = 'all' | 'live' | 'done';

/** Ordre d'affichage : missions vivantes d'abord, puis les plus récentes. */
function sortMissions(list: MissionEntry[]): MissionEntry[] {
  return [...list].sort((a, b) => {
    const live = Number(LIVE_STATUSES.has(b.status)) - Number(LIVE_STATUSES.has(a.status));
    return live !== 0 ? live : b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/** Normalise une mission renvoyée par GET /api/missions. */
function fromServer(m: any): MissionEntry {
  return {
    id: m.id,
    title: m.title ?? 'Mission',
    description: typeof m.description === 'string' ? m.description : undefined,
    status: m.paused && m.status === 'in_progress' ? 'paused' : (m.status ?? 'pending'),
    priority: m.priority ?? 'medium',
    goals: Array.isArray(m.goals) ? m.goals : [],
    activeGoalId: m.activeGoalId ?? null,
    confidence: typeof m.confidence === 'number' ? m.confidence : 0.5,
    metrics: {
      totalActions: m.metrics?.totalActions ?? 0,
      successfulActions: m.metrics?.successfulActions ?? 0,
      failedActions: m.metrics?.failedActions ?? 0,
    },
    createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
    completedAt: m.completedAt ? new Date(m.completedAt) : undefined,
    durationMs: typeof m.durationMs === 'number' ? m.durationMs : undefined,
    lastError: m.lastError ?? undefined,
    errorCount: typeof m.errorCount === 'number' ? m.errorCount : undefined,
    selfEvaluation: m.selfEvaluation ?? undefined,
    plan: m.plan ?? undefined,
  };
}

/**
 * Fige les objectifs et actions restés « in_progress » lorsqu'une mission se
 * termine. Sans ça, un événement `action_completed`/`goal_completed` manquant
 * laisse tourner les spinners indéfiniment alors que rien ne s'exécute plus.
 * `missionSucceeded` détermine l'état de repli des étapes non résolues.
 */
function finalizeGoals(goals: GoalEntry[], missionSucceeded: boolean): GoalEntry[] {
  const fallbackGoal = missionSucceeded ? ('completed' as const) : ('blocked' as const);
  const fallbackAction = missionSucceeded ? ('completed' as const) : ('failed' as const);
  return goals.map(g => ({
    ...g,
    status: g.status === 'in_progress' || g.status === 'pending' ? fallbackGoal : g.status,
    actions: g.actions.map(a =>
      a.status === 'in_progress' || a.status === 'pending'
        ? { ...a, status: fallbackAction }
        : a
    ),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

interface MissionPanelProps {
  inline?: boolean;
  /** Callback de fermeture. Affiche un bouton « fermer » dans l'en-tête. */
  onClose?: () => void;
}

export function MissionPanel({ inline = false, onClose }: MissionPanelProps) {
  const [missions, setMissions] = useState<MissionEntry[]>([]);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  // Source partagée : les approbations en attente sont aussi lues par la barre
  // de statut (pastille globale), pour rester visibles panneau fermé.
  const approvals = usePendingApprovals();
  // Missions interrompues (crash/redémarrage) en attente d'une décision :
  // réactiver ou effacer. Jamais relancées d'office par le serveur.
  const resumeConfirmations = useResumeConfirmations();
  const [resolving, setResolving] = useState<string | null>(null);
  const [decidingResume, setDecidingResume] = useState<string | null>(null);
  const [busyMission, setBusyMission] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [filter, setFilter] = useState<MissionFilter>('all');
  const [controlError, setControlError] = useState<string | null>(null);

  // Crée une mission via la route déterministe (indépendante du LLM).
  const createMission = useCallback(async () => {
    if (!newTitle.trim() || !newDescription.trim()) {
      setCreateError('Titre et description requis.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDescription.trim(), priority: newPriority }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data?.error ?? `Erreur ${res.status}`);
        return;
      }
      // Réinitialiser le formulaire ; la carte apparaîtra via l'événement mission_plan/started.
      setNewTitle('');
      setNewDescription('');
      setNewPriority('medium');
      setShowCreate(false);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }, [newTitle, newDescription, newPriority]);

  // Résout une approbation (approuve ou refuse) via l'API.
  const resolveApproval = useCallback(async (missionId: string, actionId: string, approved: boolean) => {
    setResolving(actionId);
    try {
      const res = await fetch(`/api/missions/${missionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, approved }),
      });
      // Qu'elle réussisse ou expire côté serveur, on retire la demande localement.
      if (res.ok || res.status === 404) {
        clearPendingApproval(actionId);
      }
    } catch (err) {
      console.error('[MissionPanel] Échec de résolution d\'approbation:', err);
    } finally {
      setResolving(null);
    }
  }, []);

  // Décide du sort d'une mission interrompue : la réactiver ou l'effacer.
  const decideResume = useCallback(async (missionId: string, decision: 'reactivate' | 'delete') => {
    setDecidingResume(missionId);
    try {
      const res = await fetch(`/api/missions/${missionId}/resume-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      // Succès OU déjà décidée côté serveur (404) → retirer la carte localement.
      if (res.ok || res.status === 404) {
        clearResumeConfirmation(missionId);
      }
    } catch (err) {
      console.error('[MissionPanel] Échec de décision de reprise:', err);
    } finally {
      setDecidingResume(null);
    }
  }, []);

  // Met en pause / reprend / annule / supprime / relance une mission via l'API.
  // La liste locale est ensuite mise à jour par les événements WebSocket et le
  // polling, mais on applique aussi une mise à jour optimiste pour la réactivité.
  const controlMission = useCallback(async (
    missionId: string,
    action: 'pause' | 'resume' | 'cancel' | 'delete' | 'retry',
  ) => {
    setBusyMission(missionId);
    setControlError(null);
    try {
      const isDelete = action === 'delete';
      const res = await fetch(
        isDelete ? `/api/missions/${missionId}` : `/api/missions/${missionId}/${action}`,
        { method: isDelete ? 'DELETE' : 'POST' },
      );
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        setControlError(data?.error ?? `Action impossible (${res.status}).`);
        return;
      }
      if (action === 'retry') {
        // La nouvelle mission arrive via mission_plan/started ; on resynchronise
        // aussi pour les sessions sans WebSocket live.
        syncMissionsFromServer();
        return;
      }

      // Mise à jour optimiste locale.
      setMissions(prev => {
        if (action === 'delete') return prev.filter(m => m.id !== missionId);
        return prev.map(m => {
          if (m.id !== missionId) return m;
          if (action === 'pause') return { ...m, status: 'paused' as const };
          if (action === 'resume') return { ...m, status: 'in_progress' as const };
          if (action === 'cancel') {
            return { ...m, status: 'cancelled' as const, activeGoalId: null, goals: finalizeGoals(m.goals, false) };
          }
          return m;
        });
      });
    } catch (err) {
      setControlError((err as Error).message);
    } finally {
      setBusyMission(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- syncMissionsFromServer est stable (useCallback sans dépendances)
  }, []);

  // Récupère l'état complet des missions depuis le serveur et fusionne dans le
  // state local. Fusion (et non remplacement) : on préserve les détails déjà
  // reçus en temps réel via WebSocket pour les missions déjà connues, et on
  // ajoute/rafraîchit celles renvoyées par le serveur.
  const syncMissionsFromServer = useCallback(() => {
    let cancelled = false;
    fetch('/api/missions')
      .then(res => (res.ok ? res.json() : { missions: [] }))
      .then((data: { missions?: any[] }) => {
        if (cancelled || !Array.isArray(data.missions)) return;
        const serverEntries = data.missions.map(fromServer);
        setMissions(prev => {
          const byId = new Map(prev.map(m => [m.id, m]));
          for (const s of serverEntries) {
            const existing = byId.get(s.id);
            // Le serveur fait autorité sur status/goals/metrics. Pour une
            // mission déjà connue, on ne conserve que les goals détaillés reçus
            // en live si le serveur n'en renvoie pas encore.
            // Le plan n'est connu du serveur que pour les missions lancées dans
            // cette session : on garde celui reçu en live plutôt que de l'effacer.
            byId.set(s.id, existing
              ? {
                  ...existing,
                  ...s,
                  goals: s.goals.length > 0 ? s.goals : existing.goals,
                  plan: s.plan ?? existing.plan,
                  selfEvaluation: s.selfEvaluation ?? existing.selfEvaluation,
                }
              : s);
          }
          return sortMissions(Array.from(byId.values()));
        });
      })
      .catch(() => { /* pas de mission system dispo — panneau vide, normal */ });
    return () => { cancelled = true; };
  }, []);

  // Charger l'état initial des missions depuis le serveur (au montage).
  // Le panneau est ensuite mis à jour en temps réel par les événements WebSocket.
  useEffect(() => {
    return syncMissionsFromServer();
  }, [syncMissionsFromServer]);

  // Amorcer les missions interrompues en attente de décision (réactiver/effacer).
  // L'événement `mission_resume_pending` peut être arrivé avant le montage du
  // panneau (ou sans session WebSocket active) : ce fetch garantit que les
  // cartes de décision apparaissent quand même.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/missions/pending-resumes')
      .then(res => (res.ok ? res.json() : { pending: [] }))
      .then((data: { pending?: Array<Omit<ResumeConfirmationInfo, 'receivedAt'>> }) => {
        if (cancelled || !Array.isArray(data.pending) || data.pending.length === 0) return;
        seedResumeConfirmations(data.pending);
      })
      .catch(() => { /* mission system indisponible — normal */ });
    return () => { cancelled = true; };
  }, []);

  // Indique si une mission est « vivante » (tourne, en pause ou bloquée). Lu par
  // le polling via une ref, pour éviter de recréer l'intervalle à chaque
  // changement d'état des missions.
  const hasActiveRef = useRef(false);
  hasActiveRef.current = missions.some(m => LIVE_STATUSES.has(m.status));

  // Filet de rafraîchissement : les événements `mission_event` transitent
  // uniquement par le WebSocket `/live` (session de chat). Sans session Live
  // active — cas des missions créées via l'API REST ou le harness — le panneau
  // ne recevrait aucune mise à jour en direct et resterait figé jusqu'à sa
  // réouverture. On complète donc le flux WebSocket par un polling léger de
  // `/api/missions` tant que le panneau est monté. La fusion côté
  // `syncMissionsFromServer` fait autorité sur status/goals/metrics, donc ce
  // polling ne « bat » jamais les événements live plus fins reçus entre-temps.
  //
  // L'intervalle est stable (dépend uniquement de `syncMissionsFromServer`) et
  // se re-planifie lui-même avec un rythme adaptatif : réactif (3 s) quand une
  // mission tourne, économe (10 s) au repos.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cleanup: (() => void) | undefined;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(() => {
        cleanup?.();
        cleanup = syncMissionsFromServer();
        schedule();
      }, hasActiveRef.current ? 3000 : 10000);
    };
    schedule();

    return () => {
      stopped = true;
      clearTimeout(timer);
      cleanup?.();
    };
  }, [syncMissionsFromServer]);

  // Listen for mission events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MissionEvent>).detail;
      if (!detail || detail.type !== 'mission_event') return;

      // Les demandes d'approbation sont désormais gérées par le store partagé
      // `usePendingApprovals` (écoute le même flux d'événements), afin de rester
      // visibles hors du panneau. On ne les traite donc plus localement ici.

      // Reprise au démarrage : la mission revient d'abord via `mission_resumed`
      // (émis par Executor.resumePending) avec un payload minimal. On resynchronise
      // depuis le serveur pour récupérer l'état complet (goals, métriques, etc.),
      // même si le fetch initial du montage était arrivé trop tôt ou vide.
      if (detail.event === 'mission_resumed') {
        syncMissionsFromServer();
      }

      setMissions(prev => {
        const existing = prev.find(m => m.id === detail.missionId);

        switch (detail.event) {
          case 'mission_plan':
            if (existing) {
              return prev.map(m => m.id === detail.missionId ? { ...m, plan: detail.plan } : m);
            }
            return [{
              id: detail.missionId,
              title: detail.title ?? 'Mission',
              status: 'pending',
              priority: 'medium',
              goals: [],
              activeGoalId: null,
              confidence: 0.5,
              metrics: { totalActions: 0, successfulActions: 0, failedActions: 0 },
              createdAt: new Date(detail.timestamp),
              plan: detail.plan,
            }, ...prev];

          case 'mission_started':
            if (existing) return prev.map(m => m.id === detail.missionId ? { ...m, status: 'in_progress' as const } : m);
            return [{
              id: detail.missionId,
              title: detail.title ?? 'Mission',
              status: 'in_progress',
              priority: 'medium',
              goals: [],
              activeGoalId: null,
              confidence: 0.5,
              metrics: { totalActions: 0, successfulActions: 0, failedActions: 0 },
              createdAt: new Date(detail.timestamp),
            }, ...prev];

          case 'goal_started':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              const goalExists = m.goals.find(g => g.id === detail.goalId);
              if (goalExists) {
                return {
                  ...m,
                  activeGoalId: detail.goalId!,
                  goals: m.goals.map(g => g.id === detail.goalId ? { ...g, status: 'in_progress' as const } : g),
                };
              }
              return {
                ...m,
                activeGoalId: detail.goalId!,
                goals: [...m.goals, {
                  id: detail.goalId!,
                  title: detail.goalTitle ?? 'Objectif',
                  status: 'in_progress' as const,
                  actions: [],
                }],
              };
            });

          case 'action_started':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              return {
                ...m,
                goals: m.goals.map(g => {
                  if (g.id !== detail.goalId) return g;
                  // Idempotent: an action_started event can fire more than once
                  // for the same actionId (skill re-run / duplicated event). Avoid
                  // pushing a duplicate id, which would collide as a React key.
                  const existing = g.actions.find(a => a.id === detail.actionId);
                  if (existing) {
                    return {
                      ...g,
                      actions: g.actions.map(a =>
                        a.id === detail.actionId
                          ? { ...a, skill: detail.skill ?? a.skill, status: 'in_progress' as const }
                          : a
                      ),
                    };
                  }
                  return {
                    ...g,
                    actions: [...g.actions, {
                      id: detail.actionId!,
                      skill: detail.skill ?? '?',
                      status: 'in_progress' as const,
                    }],
                  };
                }),
              };
            });

          case 'action_completed':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              return {
                ...m,
                confidence: detail.confidence ?? m.confidence,
                metrics: {
                  totalActions: m.metrics.totalActions + 1,
                  successfulActions: m.metrics.successfulActions + (detail.success ? 1 : 0),
                  failedActions: m.metrics.failedActions + (detail.success ? 0 : 1),
                },
                goals: m.goals.map(g => {
                  if (g.id !== detail.goalId) return g;
                  return {
                    ...g,
                    actions: g.actions.map(a => {
                      if (a.id !== detail.actionId) return a;
                      return {
                        ...a,
                        status: detail.success ? 'completed' as const : 'failed' as const,
                        confidence: detail.confidence,
                        decision: detail.decision,
                        durationMs: detail.durationMs,
                      };
                    }),
                  };
                }),
              };
            });

          case 'action_denied':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              return {
                ...m,
                goals: m.goals.map(g => {
                  if (g.id !== detail.goalId) return g;
                  return {
                    ...g,
                    actions: g.actions.map(a =>
                      a.id === detail.actionId ? { ...a, status: 'failed' as const } : a
                    ),
                  };
                }),
              };
            });

          case 'goal_escalated':
          case 'goal_blocked':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              return {
                ...m,
                goals: m.goals.map(g => g.id === detail.goalId ? { ...g, status: 'blocked' as const } : g),
              };
            });

          case 'mission_completed':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              // Quand la mission se termine, on fige les objectifs/actions restés
              // « in_progress » pour éviter des spinners qui tournent à l'infini
              // alors que plus rien ne s'exécute.
              return {
                ...m,
                status: detail.success ? 'completed' as const : 'failed' as const,
                activeGoalId: null,
                completedAt: new Date(detail.timestamp),
                goals: finalizeGoals(m.goals, detail.success ?? true),
              };
            });

          case 'mission_cancelled':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              // Idem à l'annulation : on stoppe toutes les animations en cours.
              return {
                ...m,
                status: 'cancelled' as const,
                activeGoalId: null,
                goals: finalizeGoals(m.goals, false),
              };
            });

          case 'mission_paused':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              return { ...m, status: 'paused' as const };
            });

          case 'mission_resumed':
            // Au redémarrage de l'app, le serveur relance les missions
            // interrompues (Executor.resumePending) et émet `mission_resumed`.
            // Cet événement peut arriver AVANT que le fetch initial de
            // `/api/missions` n'ait peuplé la liste (ou alors que ce fetch avait
            // répondu vide car la reprise côté serveur n'était pas terminée).
            // Il faut donc créer l'entrée si elle est absente — sinon la mission
            // reprise n'apparaît jamais et le panneau affiche « 0 active » alors
            // que la StatusBar la compte bien. On reflète le comportement de
            // `mission_started`.
            if (existing) {
              return prev.map(m => m.id === detail.missionId ? { ...m, status: 'in_progress' as const } : m);
            }
            return [{
              id: detail.missionId,
              title: detail.title ?? 'Mission',
              status: 'in_progress',
              priority: 'medium',
              goals: [],
              activeGoalId: null,
              confidence: 0.5,
              metrics: { totalActions: 0, successfulActions: 0, failedActions: 0 },
              createdAt: new Date(detail.timestamp),
            }, ...prev];

          case 'mission_deleted':
            return prev.filter(m => m.id !== detail.missionId);

          case 'mission_self_critique': {
            // Auto-évaluation calculée à la finalisation : le résumé/notes
            // complets arrivent au prochain sync ; on affiche le score tout de suite.
            const ev = detail as unknown as { overall?: number; scores?: Record<string, number>; nextTimeStartWith?: string };
            if (typeof ev.overall !== 'number') return prev;
            return prev.map(m => m.id === detail.missionId
              ? {
                  ...m,
                  selfEvaluation: {
                    ...(m.selfEvaluation ?? { notes: [] }),
                    overall: ev.overall!,
                    scores: ev.scores ?? m.selfEvaluation?.scores ?? {},
                    nextTimeStartWith: ev.nextTimeStartWith ?? m.selfEvaluation?.nextTimeStartWith,
                  },
                }
              : m);
          }

          default:
            return prev;
        }
      });
    };

    window.addEventListener('Leanna-mission-event', handler);
    return () => window.removeEventListener('Leanna-mission-event', handler);
  }, [syncMissionsFromServer]);

  // Auto-expand first active mission
  useEffect(() => {
    const active = missions.find(m => m.status === 'in_progress');
    if (active && !expandedMission) {
      setExpandedMission(active.id);
    }
  }, [missions, expandedMission]);

  const activeMissions = missions.filter(m => LIVE_STATUSES.has(m.status));
  const completedMissions = missions.filter(m => DONE_STATUSES.has(m.status));
  const visibleMissions = filter === 'live' ? activeMissions : filter === 'done' ? completedMissions : missions;

  const content = (
    <div className="flex flex-col h-full">
      {/* Header stats */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
        <div className="flex items-center gap-1 flex-1 min-w-0" role="tablist" aria-label="Filtrer les missions">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={missions.length} label="toutes" color="var(--text-muted)" />
          <FilterChip active={filter === 'live'} onClick={() => setFilter('live')} count={activeMissions.length} label="actives" color="var(--color-info)" />
          <FilterChip
            active={filter === 'done'}
            onClick={() => setFilter('done')}
            count={completedMissions.length}
            label="terminées"
            color={completedMissions.some(m => m.status === 'failed') ? 'var(--color-warning)' : 'var(--color-success)'}
            title={`${completedMissions.filter(m => m.status === 'completed').length} réussie(s) · `
              + `${completedMissions.filter(m => m.status === 'failed').length} échouée(s) · `
              + `${completedMissions.filter(m => m.status === 'cancelled').length} annulée(s)`}
          />
        </div>
        <button
          onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap flex-shrink-0 transition cursor-pointer hover:opacity-80"
          style={{ color: 'var(--color-info)', backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)' }}
          title="Créer une mission"
        >
          <Plus size={12} /> Nouvelle
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors cursor-pointer hover:bg-[var(--bg-active)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fermer"
            title="Fermer le panneau"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Formulaire de création */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            className="overflow-hidden flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-base)' }}
          >
            <div className="px-3 py-2.5 space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Titre de la mission"
                disabled={creating}
                className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
              />
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Décris la tâche complexe à accomplir… (Ctrl+Entrée pour lancer)"
                disabled={creating}
                rows={3}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void createMission(); } }}
                className="w-full px-2 py-1.5 rounded-md text-xs outline-none resize-none"
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
              />
              {createError && (
                <p className="text-xs" style={{ color: 'var(--color-error)' }}>{createError}</p>
              )}
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Priorité">
                <span className="text-xs mr-1" style={{ color: 'var(--text-dimmed)' }}>Priorité</span>
                {(['low', 'medium', 'high', 'critical'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={newPriority === p}
                    onClick={() => setNewPriority(p)}
                    disabled={creating}
                    className="px-1.5 py-0.5 rounded text-xs font-medium transition cursor-pointer"
                    style={{
                      color: newPriority === p ? PRIORITY_META[p].color : 'var(--text-dimmed)',
                      backgroundColor: newPriority === p ? `color-mix(in srgb, ${PRIORITY_META[p].color} 12%, transparent)` : 'transparent',
                      border: `1px solid ${newPriority === p ? `color-mix(in srgb, ${PRIORITY_META[p].color} 30%, transparent)` : 'var(--border-base)'}`,
                    }}
                  >
                    {PRIORITY_META[p].label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={createMission}
                  disabled={creating || !newTitle.trim() || !newDescription.trim()}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                  style={{ color: 'var(--color-info)', backgroundColor: 'color-mix(in srgb, var(--color-info) 12%, transparent)' }}
                >
                  {creating ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                  Lancer
                </button>
                <button
                  onClick={() => { setShowCreate(false); setCreateError(null); }}
                  disabled={creating}
                  className="px-2 py-1.5 rounded-md text-xs font-medium transition disabled:opacity-50 cursor-pointer"
                  style={{ color: 'var(--text-dimmed)', backgroundColor: 'var(--bg-input)' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Missions interrompues en attente de décision (réactiver / effacer) */}
      {resumeConfirmations.length > 0 && (
        <div className="px-2 pt-2 space-y-1.5 flex-shrink-0">
          <AnimatePresence initial={false}>
            {resumeConfirmations.map(confirmation => (
              <ResumeConfirmationCard
                key={confirmation.missionId}
                confirmation={confirmation}
                deciding={decidingResume === confirmation.missionId}
                onReactivate={() => decideResume(confirmation.missionId, 'reactivate')}
                onDelete={() => decideResume(confirmation.missionId, 'delete')}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Approbations en attente */}
      {approvals.length > 0 && (
        <div className="px-2 pt-2 space-y-1.5 flex-shrink-0">
          <AnimatePresence initial={false}>
            {approvals.map(approval => (
              <ApprovalCard
                key={approval.actionId}
                approval={approval}
                resolving={resolving === approval.actionId}
                onApprove={() => resolveApproval(approval.missionId, approval.actionId, true)}
                onReject={() => resolveApproval(approval.missionId, approval.actionId, false)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Mission list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 custom-scrollbar">
        {controlError && (
          <div
            className="flex items-start gap-1.5 px-2 py-1.5 rounded-md text-xs"
            role="alert"
            style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}
          >
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">{controlError}</span>
            <button type="button" onClick={() => setControlError(null)} aria-label="Masquer l'erreur" className="cursor-pointer">
              <X size={11} />
            </button>
          </div>
        )}
        {visibleMissions.length === 0 ? (
          missions.length === 0 ? <EmptyMissionState /> : (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-dimmed)' }}>
              {filter === 'live' ? 'Aucune mission en cours.' : 'Aucune mission terminée.'}
            </p>
          )
        ) : (
          <AnimatePresence initial={false}>
            {visibleMissions.map(mission => (
              <MissionCard
                key={mission.id}
                mission={mission}
                expanded={expandedMission === mission.id}
                expandedGoal={expandedGoal}
                busy={busyMission === mission.id}
                onToggle={() => setExpandedMission(prev => prev === mission.id ? null : mission.id)}
                onToggleGoal={(goalId) => setExpandedGoal(prev => prev === goalId ? null : goalId)}
                onPause={() => controlMission(mission.id, 'pause')}
                onResume={() => controlMission(mission.id, 'resume')}
                onCancel={() => controlMission(mission.id, 'cancel')}
                onDelete={() => controlMission(mission.id, 'delete')}
                onRetry={() => controlMission(mission.id, 'retry')}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );

  if (inline) return content;

  return (
    <Panel
      title="Missions"
      icon={<Target className="w-4 h-4" />}
      actions={
        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>
          {activeMissions.length} actives
        </span>
      }
    >
      {content}
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

const PRIORITY_META: Record<'low' | 'medium' | 'high' | 'critical', { label: string; color: string }> = {
  low: { label: 'Basse', color: 'var(--text-muted)' },
  medium: { label: 'Normale', color: 'var(--color-info)' },
  high: { label: 'Haute', color: 'var(--color-warning)' },
  critical: { label: 'Critique', color: 'var(--color-error)' },
};

/** Compteur cliquable servant de filtre de liste. */
function FilterChip({ count, label, color, active, onClick, title }: {
  count: number; label: string; color: string; active: boolean; onClick: () => void; title?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      title={title}
      aria-selected={active}
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono whitespace-nowrap flex-shrink-0 transition cursor-pointer"
      style={{
        color,
        backgroundColor: active ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
        border: `1px solid ${active ? `color-mix(in srgb, ${color} 30%, transparent)` : 'transparent'}`,
      }}
    >
      <span className="font-bold">{count}</span>
      <span className="opacity-70">{label}</span>
    </button>
  );
}

function ResumeConfirmationCard({
  confirmation,
  deciding,
  onReactivate,
  onDelete,
}: {
  confirmation: ResumeConfirmationInfo;
  deciding: boolean;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const statusText = confirmation.status === 'in_progress' ? 'en cours' : 'en attente';

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-info) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-info) 30%, transparent)',
      }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <RotateCcw size={13} style={{ color: 'var(--color-info)' }} className="flex-shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: 'var(--color-info)' }}>
            Mission interrompue
          </span>
        </div>

        <p className="text-xs leading-relaxed mb-1" style={{ color: 'var(--text-primary)' }}>
          <span className="font-semibold">{confirmation.title}</span>
        </p>
        <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-muted)' }}>
          Cette mission a été interrompue (statut : {statusText}). Souhaitez-vous la réactiver ou l'effacer ?
        </p>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={onReactivate}
            disabled={deciding}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
            style={{ color: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)' }}
          >
            {deciding ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            Réactiver
          </button>
          <button
            onClick={onDelete}
            disabled={deciding}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
            style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)' }}
          >
            <Trash2 size={11} />
            Effacer
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ApprovalCard({
  approval,
  resolving,
  onApprove,
  onReject,
}: {
  approval: PendingApproval;
  resolving: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const argsPreview = approval.args && Object.keys(approval.args).length > 0
    ? JSON.stringify(approval.args)
    : null;

  // Compte à rebours aligné sur CriticalEditConfirm : sans réponse, la demande
  // expire (le serveur applique le refus « fail-closed »). La couleur s'intensifie
  // sous 10 s pour signaler l'urgence.
  const totalMs = Math.max(1, approval.expiresAt - approval.requestedAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const remainingMs = Math.max(0, approval.expiresAt - now);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progressPct = Math.min(100, Math.max(0, Math.round((remainingMs / totalMs) * 100)));
  const urgent = secondsLeft <= 10;
  const timerColor = urgent ? 'var(--color-error)' : 'var(--color-warning)';
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
      }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Pause size={13} style={{ color: 'var(--color-warning)' }} className="flex-shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: 'var(--color-warning)' }}>
            Approbation requise
          </span>
          <span className="text-xs px-1 py-0.5 rounded flex items-center gap-1"
            style={{ color: 'var(--accent-primary)', backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' }}
            title={approval.skill}>
            <Zap size={9} /> {skillLabel(approval.skill)}
          </span>
        </div>

        <p className="text-xs leading-relaxed mb-1" style={{ color: 'var(--text-muted)' }}>
          {approval.reason}
        </p>

        {argsPreview && (
          <p className="text-xs font-mono truncate mb-2 opacity-70" style={{ color: 'var(--text-dimmed)' }} title={argsPreview}>
            {argsPreview}
          </p>
        )}

        {/* Compte à rebours avant refus automatique */}
        <div className="flex items-center gap-2 mb-1" aria-hidden={false}>
          <Clock size={11} style={{ color: timerColor, flexShrink: 0 }} />
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: timerColor }}
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: 'linear' }}
            />
          </div>
          <span className="text-xs font-mono tabular-nums" style={{ color: timerColor }}>
            {secondsLeft}s
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={onApprove}
            disabled={resolving}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
            style={{ color: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)' }}
          >
            {resolving ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            Approuver
          </button>
          <button
            onClick={onReject}
            disabled={resolving}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
            style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)' }}
          >
            <XCircle size={11} />
            Refuser
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MissionControlButton({
  title,
  onClick,
  disabled,
  color,
  icon,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center w-6 h-6 rounded-md transition disabled:opacity-40 cursor-pointer hover:bg-[var(--bg-active)]"
      style={{ color }}
    >
      {icon}
    </button>
  );
}

function MissionCard({
  mission,
  expanded,
  expandedGoal,
  busy,
  onToggle,
  onToggleGoal,
  onPause,
  onResume,
  onCancel,
  onDelete,
  onRetry,
}: {
  mission: MissionEntry;
  expanded: boolean;
  expandedGoal: string | null;
  busy: boolean;
  onToggle: () => void;
  onToggleGoal: (goalId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const isActive = mission.status === 'in_progress';
  const isPaused = mission.status === 'paused';
  const isRunning = isActive || isPaused || mission.status === 'blocked';
  const isTerminal = DONE_STATUSES.has(mission.status);
  const isCompleted = mission.status === 'completed';
  const isFailed = mission.status === 'failed';
  const canRetry = isFailed || mission.status === 'cancelled';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confColor = confidenceColor(mission.confidence);
  const prefersReducedMotion = useReducedMotion();
  // Progression = objectifs résolus / objectifs planifiés (l'ancien calcul,
  // succès / actions, mesurait un taux de réussite, pas l'avancement).
  const resolvedGoals = mission.goals.filter(g => g.status === 'completed').length;
  const progress = isCompleted
    ? 100
    : mission.goals.length > 0
      ? Math.round((resolvedGoals / mission.goals.length) * 100)
      : 0;
  const progressColor = isFailed ? 'var(--color-error)' : isCompleted ? 'var(--color-success)' : 'var(--color-info)';
  const priority = PRIORITY_META[mission.priority as keyof typeof PRIORITY_META];

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: isPaused
          ? 'color-mix(in srgb, var(--color-warning) 5%, transparent)'
          : isActive
          ? 'color-mix(in srgb, var(--color-info) 4%, transparent)'
          : isCompleted
          ? 'color-mix(in srgb, var(--color-success) 4%, transparent)'
          : isFailed
          ? 'color-mix(in srgb, var(--color-error) 4%, transparent)'
          : 'var(--bg-input)',
        border: `1px solid ${
          isPaused
            ? 'color-mix(in srgb, var(--color-warning) 25%, transparent)'
            : isActive
            ? 'color-mix(in srgb, var(--color-info) 20%, transparent)'
            : isCompleted
            ? 'color-mix(in srgb, var(--color-success) 18%, transparent)'
            : isFailed
            ? 'color-mix(in srgb, var(--color-error) 18%, transparent)'
            : 'var(--border-base)'
        }`,
      }}
    >
      {/* Mission header */}
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer hover:bg-[var(--bg-hover)] transition"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        {/* Status icon */}
        <div className="flex-shrink-0">
          {statusIcon(mission.status, 14)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {mission.title}
            </span>
            {(() => {
              const sl = statusLabel(mission.status);
              return (
                <span
                  className="flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{ color: sl.color, backgroundColor: `color-mix(in srgb, ${sl.color} 10%, transparent)` }}
                >
                  {sl.text}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Barre d'avancement (objectifs résolus) */}
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              role="progressbar"
              aria-label="Avancement des objectifs"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              title={mission.goals.length > 0 ? `${resolvedGoals}/${mission.goals.length} objectifs atteints` : 'Planification…'}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: progressColor }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
              />
            </div>
            {mission.goals.length > 0 && (
              <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
                {resolvedGoals}/{mission.goals.length}
              </span>
            )}
            {/* Confiance */}
            <div className="flex items-center gap-0.5" style={{ color: confColor }} title="Confiance moyenne de l'agent">
              {confidenceIcon(mission.confidence)}
              <span className="text-xs font-mono font-bold">
                {Math.round(mission.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Contrôles : pause/reprise · annuler · supprimer */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {isRunning && (
            isPaused ? (
              <MissionControlButton
                title="Reprendre la mission"
                onClick={onResume}
                disabled={busy}
                color="var(--color-success)"
                icon={<Play size={12} />}
              />
            ) : (
              <MissionControlButton
                title="Mettre en pause"
                onClick={onPause}
                disabled={busy}
                color="var(--color-warning)"
                icon={<Pause size={12} />}
              />
            )
          )}

          {isRunning && (
            <MissionControlButton
              title="Annuler la mission"
              onClick={onCancel}
              disabled={busy}
              color="var(--color-error)"
              icon={<XCircle size={12} />}
            />
          )}

          {canRetry && (
            <MissionControlButton
              title="Relancer la mission (même brief)"
              onClick={onRetry}
              disabled={busy}
              color="var(--color-info)"
              icon={busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            />
          )}

          {(isTerminal || isRunning) && (
            confirmDelete ? (
              <>
                <MissionControlButton
                  title="Confirmer la suppression"
                  onClick={() => { setConfirmDelete(false); onDelete(); }}
                  disabled={busy}
                  color="var(--color-error)"
                  icon={busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                />
                <MissionControlButton
                  title="Annuler la suppression"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                  color="var(--text-dimmed)"
                  icon={<X size={12} />}
                />
              </>
            ) : (
              <MissionControlButton
                title="Supprimer la mission"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                color="var(--text-dimmed)"
                icon={<Trash2 size={12} />}
              />
            )
          )}
        </div>

        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="flex-shrink-0">
          <ChevronRight size={12} style={{ color: 'var(--text-dimmed)' }} />
        </motion.div>
      </div>

      {/* Expanded: Goal Stack */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5" style={{ borderTop: '1px solid var(--border-base)' }}>
              {mission.description && mission.description !== mission.title && (
                <p className="pt-2 text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-muted)' }}>
                  {mission.description}
                </p>
              )}

              {mission.lastError && !isCompleted && (
                <div
                  className="flex items-start gap-1.5 mt-2 px-2 py-1.5 rounded-md text-xs"
                  role="status"
                  style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 7%, transparent)' }}
                >
                  <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">
                    <span className="font-semibold">{skillLabel(mission.lastError.action)} : </span>
                    {mission.lastError.error ?? 'échec'}
                    {mission.errorCount && mission.errorCount > 1 ? ` (+${mission.errorCount - 1} autre${mission.errorCount > 2 ? 's' : ''})` : ''}
                  </span>
                </div>
              )}

              {mission.selfEvaluation && <SelfEvaluationSummary evaluation={mission.selfEvaluation} />}

              {mission.plan && <MissionPlanSummary plan={mission.plan} />}

              {/* Metrics row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 pb-1">
                <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
                  Actions: <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--color-success)' }}>{mission.metrics.successfulActions}<CheckCircle2 size={11} /></span>
                  {' '}<span className="inline-flex items-center gap-0.5" style={{ color: 'var(--color-error)' }}>{mission.metrics.failedActions}<XCircle size={11} /></span>
                  {' '}/ {mission.metrics.totalActions}
                </span>
                {priority && (
                  <span className="text-xs" style={{ color: priority.color }}>Priorité {priority.label.toLowerCase()}</span>
                )}
                {(mission.durationMs ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono" style={{ color: 'var(--text-dimmed)' }} title={isTerminal ? 'Durée totale' : 'Temps écoulé'}>
                    <Timer size={10} /> {formatDuration(mission.durationMs)}
                  </span>
                )}
                <span className="text-xs font-mono ml-auto" style={{ color: 'var(--text-dimmed)' }} title={mission.createdAt.toLocaleString('fr-FR')}>
                  {mission.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Goals */}
              {mission.goals.length === 0 ? (
                <div className="text-xs italic py-2" style={{ color: 'var(--text-dimmed)' }}>
                  {isTerminal ? 'Aucun objectif enregistré.' : 'Planification en cours…'}
                </div>
              ) : (
                mission.goals.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isActive={goal.id === mission.activeGoalId}
                    expanded={expandedGoal === goal.id}
                    onToggle={() => onToggleGoal(goal.id)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const SCORE_LABELS: Record<string, string> = {
  planAccuracy: 'Plan',
  toolEfficiency: 'Outils',
  recoveryQuality: 'Récupération',
  verification: 'Vérification',
  costEfficiency: 'Coût',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'var(--color-success)';
  if (score >= 40) return 'var(--color-warning)';
  return 'var(--color-error)';
}

/** Auto-évaluation post-mission : score global, sous-scores et leçon retenue. */
function SelfEvaluationSummary({ evaluation }: { evaluation: MissionSelfEvaluation }) {
  const color = scoreColor(evaluation.overall);
  const scores = Object.entries(evaluation.scores ?? {});
  return (
    <div
      className="mt-2 rounded-lg p-2 space-y-1.5"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles size={11} style={{ color: 'var(--color-accent-alt)' }} />
        <span className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: 'var(--color-accent-alt)' }}>
          Auto-évaluation
        </span>
        <span className="text-xs font-mono font-bold" style={{ color }}>{Math.round(evaluation.overall)}/100</span>
      </div>
      {scores.length > 0 && (
        <div className="grid grid-cols-5 gap-1">
          {scores.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5" title={`${SCORE_LABELS[key] ?? key} : ${Math.round(value)}/100`}>
              <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-base)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: scoreColor(value) }} />
              </div>
              <span className="text-xs truncate" style={{ color: 'var(--text-dimmed)' }}>{SCORE_LABELS[key] ?? key}</span>
            </div>
          ))}
        </div>
      )}
      {evaluation.summary && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{evaluation.summary}</p>
      )}
      {evaluation.nextTimeStartWith && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-semibold">La prochaine fois : </span>{evaluation.nextTimeStartWith}
        </p>
      )}
    </div>
  );
}

function MissionPlanSummary({ plan }: { plan: MissionPlan }) {
  const sections: Array<{ label: string; items: string[] }> = [
    { label: 'Objectifs', items: plan.objectives },
    { label: 'Fichiers ciblés', items: plan.targetedFiles },
    { label: 'Outils', items: plan.tools },
    { label: 'Risques', items: plan.risks },
    { label: "Conditions d'arrêt", items: plan.stopConditions },
  ];

  // ── Helpers d'affichage ─────────────────────────────────────────────────
  function fmtDuration(ms: number): string {
    if (ms < 60_000) return `~${Math.round(ms / 1_000)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1_000);
    return s > 0 ? `~${m}min ${s}s` : `~${m}min`;
  }

  function fmtCost(usd: number): string {
    if (usd < 0.001) return '< $0.001';
    if (usd < 1)     return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  }

  const riskConfig: Record<NonNullable<MissionPlan['riskLevel']>, { color: string; label: string }> = {
    low:      { color: 'var(--color-success)',  label: 'Faible'    },
    medium:   { color: 'var(--color-warning)',  label: 'Modéré'    },
    high:     { color: 'var(--color-error)',    label: 'Élevé'     },
    critical: { color: 'var(--color-error)',    label: 'Critique'  },
  };

  const hasEstimate =
    plan.estimatedCostUsd !== undefined ||
    plan.estimatedDurationMs !== undefined ||
    plan.riskLevel !== undefined;

  return (
    <div className="pt-2 pb-1 space-y-2" style={{ borderBottom: '1px solid var(--border-base)' }}>
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-info)' }}>
          Plan d'action
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
          ~{plan.estimatedTokens.toLocaleString('fr-FR')} tokens
        </span>
      </div>

      {/* ── Bandeaux coût / durée / risque ─────────────────────────────── */}
      {hasEstimate && (
        <div
          className="grid grid-cols-3 gap-1.5 rounded-lg p-2"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
        >
          {/* Coût estimé */}
          {plan.estimatedCostUsd !== undefined && (
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1" style={{ color: 'var(--accent-secondary)' }}>
                <DollarSign size={10} />
                <span className="text-xs font-bold">{fmtCost(plan.estimatedCostUsd)}</span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Coût estimé</span>
            </div>
          )}

          {/* Durée estimée */}
          {plan.estimatedDurationMs !== undefined && (
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1" style={{ color: 'var(--color-info)' }}>
                <Timer size={10} />
                <span className="text-xs font-bold">{fmtDuration(plan.estimatedDurationMs)}</span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Durée estimée</span>
            </div>
          )}

          {/* Niveau de risque */}
          {plan.riskLevel && (
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1" style={{ color: riskConfig[plan.riskLevel].color }}>
                <Shield size={10} />
                <span className="text-xs font-bold">{riskConfig[plan.riskLevel].label}</span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Risque</span>
            </div>
          )}
        </div>
      )}

      {/* ── Barre de confiance dans l'estimation ────────────────────────── */}
      {plan.estimationConfidence !== undefined && (
        <div className="flex items-center gap-2">
          <Activity size={9} style={{ color: 'var(--text-dimmed)', flexShrink: 0 }} />
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-base)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(plan.estimationConfidence * 100)}%`,
                backgroundColor: plan.estimationConfidence >= 0.7
                  ? 'var(--color-success)'
                  : plan.estimationConfidence >= 0.4
                    ? 'var(--color-warning)'
                    : 'var(--color-error)',
              }}
            />
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)', flexShrink: 0 }}>
            {Math.round(plan.estimationConfidence * 100)}% confiance
          </span>
        </div>
      )}

      {/* ── Sections textuelles ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-1.5">
        {sections.map(section => (
          <div key={section.label} className="text-xs">
            <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{section.label}: </span>
            <span style={{ color: 'var(--text-dimmed)' }}>{section.items.join(' · ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  isActive,
  expanded,
  onToggle,
}: {
  goal: GoalEntry;
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: isActive ? 'color-mix(in srgb, var(--color-info) 6%, transparent)' : 'transparent',
        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--color-info) 18%, transparent)' : 'var(--border-base)'}`,
      }}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer hover:bg-[var(--bg-hover)] transition"
        onClick={onToggle}
        aria-expanded={expanded}
        disabled={goal.actions.length === 0}
      >
        <div className="flex-shrink-0">{statusIcon(goal.status, 10)}</div>
        <span className="text-xs flex-1 truncate font-medium" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {goal.title}
        </span>
        {goal.actions.length > 0 && (
          <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
            {goal.actions.length}
          </span>
        )}
        {isActive && (
          <span className="text-xs px-1 py-0.5 rounded font-bold uppercase"
            style={{ color: 'var(--color-info)', backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)' }}>
            actif
          </span>
        )}
        <motion.div animate={{ rotate: expanded ? 90 : 0 }}>
          <ChevronRight size={9} style={{ color: 'var(--text-dimmed)' }} />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && goal.actions.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-0.5" style={{ borderTop: '1px solid var(--border-base)' }}>
              {goal.actions.map(action => (
                <ActionRow key={action.id} action={action} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionRow({ action }: { action: ActionEntry }) {
  return (
    <div className="px-1.5 py-1 rounded hover:bg-[var(--bg-hover)]">
      <div className="flex items-center gap-1.5">
        <div className="flex-shrink-0">{statusIcon(action.status, 9)}</div>
        <Zap size={9} style={{ color: 'var(--accent-primary)' }} className="flex-shrink-0" />
        <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-muted)' }} title={action.skill}>
          {skillLabel(action.skill)}
        </span>
        {/* `durationMs` peut valoir 0 : un `&&` nu afficherait « 0 ». */}
        {(action.durationMs ?? 0) > 0 && (
          <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
            {formatDuration(action.durationMs)}
          </span>
        )}
        {action.decision && decisionBadge(action.decision)}
        {action.confidence !== undefined && action.confidence !== null && (
          <span className="text-xs font-mono" style={{ color: confidenceColor(action.confidence) }}>
            {Math.round(action.confidence * 100)}%
          </span>
        )}
      </div>
      {action.failure && action.status === 'failed' && (
        <p className="mt-0.5 pl-6 text-xs leading-snug break-words" style={{ color: 'var(--color-error)' }}>
          {action.failure}
        </p>
      )}
    </div>
  );
}

function EmptyMissionState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-input)' }}
      >
        <Target size={20} style={{ color: 'var(--text-dimmed)' }} />
      </div>
      <div className="text-center px-4">
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          Aucune mission active
        </p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>
          Les missions se déclenchent pour les tâches complexes multi-étapes.
          L'IA décompose, planifie, exécute et vérifie automatiquement.
        </p>
      </div>
    </div>
  );
}

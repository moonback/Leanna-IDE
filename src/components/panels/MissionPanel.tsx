import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Brain, Zap, RotateCcw, Pause, Play,
  TrendingUp, TrendingDown, Minus, Clock, Layers,
} from 'lucide-react';
import { Panel } from '../ui/Panel.js';
import { IconButton } from '../ui/IconButton.js';

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
}

interface MissionPlan {
  objectives: string[];
  targetedFiles: string[];
  tools: string[];
  risks: string[];
  estimatedTokens: number;
  stopConditions: string[];
}

interface MissionEntry {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
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
  plan?: MissionPlan;
}

interface GoalEntry {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  actions: ActionEntry[];
}

interface ActionEntry {
  id: string;
  skill: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  confidence?: number;
  decision?: string;
  durationMs?: number;
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
    case 'in_progress': return <Loader2 size={size} className="animate-spin" style={{ color: 'var(--color-info)' }} />;
    case 'completed': return <CheckCircle2 size={size} style={{ color: 'var(--color-success)' }} />;
    case 'failed': return <XCircle size={size} style={{ color: 'var(--color-error)' }} />;
    case 'blocked': return <AlertTriangle size={size} style={{ color: 'var(--color-warning)' }} />;
    default: return <Clock size={size} style={{ color: 'var(--text-dimmed)' }} />;
  }
}

function decisionBadge(decision: string) {
  const config: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    continue: { color: 'var(--color-success)', label: 'Continue', icon: <Play size={8} /> },
    retry: { color: 'var(--color-warning)', label: 'Retry', icon: <RotateCcw size={8} /> },
    replan: { color: 'var(--color-warning)', label: 'Replan', icon: <Brain size={8} /> },
    escalate: { color: 'var(--color-error)', label: 'Escalade', icon: <AlertTriangle size={8} /> },
    abort: { color: 'var(--color-error)', label: 'Abort', icon: <XCircle size={8} /> },
  };
  const c = config[decision] ?? config.continue;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-xs font-bold uppercase"
      style={{ color: c.color, backgroundColor: `color-mix(in srgb, ${c.color} 6%, transparent)` }}
    >
      {c.icon} {c.label}
    </span>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

interface MissionPanelProps {
  inline?: boolean;
}

export function MissionPanel({ inline = false }: MissionPanelProps) {
  const [missions, setMissions] = useState<MissionEntry[]>([]);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);

  // Listen for mission events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MissionEvent>).detail;
      if (!detail || detail.type !== 'mission_event') return;

      setMissions(prev => {
        const existing = prev.find(m => m.id === detail.missionId);

        switch (detail.event) {
          case 'mission_plan':
            if (existing) {
              return prev.map(m => m.id === detail.missionId ? { ...m, plan: detail.plan } : m);
            }
            return [...prev, {
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
            }];

          case 'mission_started':
            if (existing) return prev.map(m => m.id === detail.missionId ? { ...m, status: 'in_progress' as const } : m);
            return [...prev, {
              id: detail.missionId,
              title: detail.title ?? 'Mission',
              status: 'in_progress',
              priority: 'medium',
              goals: [],
              activeGoalId: null,
              confidence: 0.5,
              metrics: { totalActions: 0, successfulActions: 0, failedActions: 0 },
              createdAt: new Date(detail.timestamp),
            }];

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

          case 'goal_escalated':
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
              return { ...m, status: detail.success ? 'completed' as const : 'failed' as const };
            });

          case 'mission_cancelled':
            return prev.map(m => {
              if (m.id !== detail.missionId) return m;
              return { ...m, status: 'failed' as const };
            });

          default:
            return prev;
        }
      });
    };

    window.addEventListener('Leanna-mission-event', handler);
    return () => window.removeEventListener('Leanna-mission-event', handler);
  }, []);

  // Auto-expand first active mission
  useEffect(() => {
    const active = missions.find(m => m.status === 'in_progress');
    if (active && !expandedMission) {
      setExpandedMission(active.id);
    }
  }, [missions, expandedMission]);

  const activeMissions = missions.filter(m => m.status === 'in_progress' || m.status === 'blocked');
  const completedMissions = missions.filter(m => m.status === 'completed' || m.status === 'failed');

  const content = (
    <div className="flex flex-col h-full">
      {/* Header stats */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
        <div className="flex items-center gap-1.5 flex-1">
          <StatChip count={activeMissions.length} label="actives" color="var(--color-info)" />
          <StatChip count={completedMissions.filter(m => m.status === 'completed').length} label="ok" color="var(--color-success)" />
          <StatChip count={completedMissions.filter(m => m.status === 'failed').length} label="err" color="var(--color-error)" />
        </div>
      </div>

      {/* Mission list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 custom-scrollbar">
        {missions.length === 0 ? (
          <EmptyMissionState />
        ) : (
          <AnimatePresence initial={false}>
            {missions.map(mission => (
              <MissionCard
                key={mission.id}
                mission={mission}
                expanded={expandedMission === mission.id}
                expandedGoal={expandedGoal}
                onToggle={() => setExpandedMission(prev => prev === mission.id ? null : mission.id)}
                onToggleGoal={(goalId) => setExpandedGoal(prev => prev === goalId ? null : goalId)}
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

function StatChip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 4.7%, transparent)` }}
    >
      <span className="font-bold">{count}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

function MissionCard({
  mission,
  expanded,
  expandedGoal,
  onToggle,
  onToggleGoal,
}: {
  mission: MissionEntry;
  expanded: boolean;
  expandedGoal: string | null;
  onToggle: () => void;
  onToggleGoal: (goalId: string) => void;
}) {
  const isActive = mission.status === 'in_progress';
  const confColor = confidenceColor(mission.confidence);
  const progress = mission.metrics.totalActions > 0
    ? Math.round((mission.metrics.successfulActions / mission.metrics.totalActions) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: isActive ? 'color-mix(in srgb, var(--color-info) 4%, transparent)' : 'var(--bg-input)',
        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--color-info) 20%, transparent)' : 'var(--border-base)'}`,
      }}
    >
      {/* Mission header */}
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer hover:bg-white/5 transition"
        onClick={onToggle}
      >
        {/* Status icon */}
        <div className="flex-shrink-0">
          {statusIcon(mission.status, 14)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {mission.title}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Progress bar */}
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: confColor }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            {/* Confidence */}
            <div className="flex items-center gap-0.5" style={{ color: confColor }}>
              {confidenceIcon(mission.confidence)}
              <span className="text-xs font-mono font-bold">
                {Math.round(mission.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="flex-shrink-0">
          <ChevronRight size={12} style={{ color: 'var(--text-dimmed)' }} />
        </motion.div>
      </button>

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
              {mission.plan && <MissionPlanSummary plan={mission.plan} />}

              {/* Metrics row */}
              <div className="flex items-center gap-3 pt-2 pb-1">
                <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
                  Actions: <span style={{ color: 'var(--color-success)' }}>{mission.metrics.successfulActions}✓</span>
                  {' '}<span style={{ color: 'var(--color-error)' }}>{mission.metrics.failedActions}✗</span>
                  {' '}/ {mission.metrics.totalActions}
                </span>
              </div>

              {/* Goals */}
              {mission.goals.length === 0 ? (
                <div className="text-xs italic py-2" style={{ color: 'var(--text-dimmed)' }}>
                  Planification en cours...
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

function MissionPlanSummary({ plan }: { plan: MissionPlan }) {
  const sections: Array<{ label: string; items: string[] }> = [
    { label: 'Objectifs', items: plan.objectives },
    { label: 'Fichiers ciblés', items: plan.targetedFiles },
    { label: 'Outils', items: plan.tools },
    { label: 'Risques', items: plan.risks },
    { label: "Conditions d'arrêt", items: plan.stopConditions },
  ];

  return (
    <div className="pt-2 pb-1 space-y-2" style={{ borderBottom: '1px solid var(--border-base)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-info)' }}>
          Plan d'action
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
          ~{plan.estimatedTokens.toLocaleString('fr-FR')} tokens
        </span>
      </div>
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
        backgroundColor: isActive ? 'rgba(56,189,248,0.06)' : 'transparent',
        border: `1px solid ${isActive ? 'rgba(56,189,248,0.15)' : 'var(--border-base)'}`,
      }}
    >
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer hover:bg-white/5 transition"
        onClick={onToggle}
      >
        <div className="flex-shrink-0">{statusIcon(goal.status, 10)}</div>
        <span className="text-xs flex-1 truncate font-medium" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {goal.title}
        </span>
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
    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white/5">
      <div className="flex-shrink-0">{statusIcon(action.status, 9)}</div>
      <Zap size={9} style={{ color: 'var(--accent-primary)' }} className="flex-shrink-0" />
      <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
        {action.skill}
      </span>
      {action.durationMs && (
        <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
          {formatDuration(action.durationMs)}
        </span>
      )}
      {action.decision && decisionBadge(action.decision)}
      {action.confidence !== undefined && (
        <span className="text-xs font-mono" style={{ color: confidenceColor(action.confidence) }}>
          {Math.round(action.confidence * 100)}%
        </span>
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

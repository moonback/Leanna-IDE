import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot, Target, Loader2, CheckCircle2, XCircle,
  Brain, ChevronUp, ChevronDown, Zap, AlertTriangle,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Activity Overlay — Indicateur flottant toujours visible
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Overlay compact affiché en bas à droite de l'IDE quand des agents
 * ou des missions travaillent en arrière-plan.
 * 
 * Permet de voir en un coup d'œil:
 * - Nombre d'agents actifs
 * - Mission en cours avec progression
 * - Dernière action et son résultat
 * - Confiance de l'agent
 *
 * Cliquable pour ouvrir/fermer les détails.
 */

interface AgentActivity {
  taskId: string;
  role: string;
  agentName: string;
  title: string;
  status: string;
  timestamp: Date;
}

interface MissionActivity {
  missionId: string;
  title: string;
  status: string;
  confidence: number;
  currentGoal?: string;
  lastAction?: string;
  lastDecision?: string;
}

interface AgentActivityOverlayProps {
  /** Callback to open the full Agents panel */
  onOpenAgents?: () => void;
  /** Callback to open the full Missions panel */
  onOpenMissions?: () => void;
}

export function AgentActivityOverlay({ onOpenAgents, onOpenMissions }: AgentActivityOverlayProps) {
  const [agents, setAgents] = useState<AgentActivity[]>([]);
  const [missions, setMissions] = useState<MissionActivity[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [lastEvent, setLastEvent] = useState<string>('');
  const [tick, setTick] = useState(0);

  // ── Ticker: force cleanup of stale entries every 2s ──
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);
  // Listen for agent events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      if (detail.type === 'agent_event') {
        setAgents(prev => {
          const filtered = prev.filter(a => a.taskId !== detail.taskId);
          const isDone = detail.event === 'task_completed' || detail.event === 'task_failed';
          return [...filtered, {
            taskId: detail.taskId,
            role: detail.role,
            agentName: detail.agentName,
            title: detail.title,
            status: isDone ? detail.event.replace('task_', '') : detail.status,
            timestamp: new Date(detail.timestamp),
          }];
        });
        setLastEvent(`${detail.agentName}: ${detail.detail || detail.title}`);
      }
    };

    const missionHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.type !== 'mission_event') return;

      setMissions(prev => {
        const existing = prev.find(m => m.missionId === detail.missionId);

        switch (detail.event) {
          case 'mission_started':
            if (existing) return prev;
            return [...prev, {
              missionId: detail.missionId,
              title: detail.title ?? 'Mission',
              status: 'in_progress',
              confidence: 0.5,
            }];

          case 'goal_started':
            return prev.map(m => m.missionId === detail.missionId
              ? { ...m, currentGoal: detail.goalTitle ?? detail.goalId }
              : m
            );

          case 'action_completed':
            return prev.map(m => m.missionId === detail.missionId
              ? {
                  ...m,
                  confidence: detail.confidence ?? m.confidence,
                  lastAction: detail.skill,
                  lastDecision: detail.decision,
                }
              : m
            );

          case 'mission_completed':
          case 'mission_cancelled':
          case 'mission_failed':
            return prev.map(m => m.missionId === detail.missionId
              ? { ...m, status: detail.success ? 'completed' : 'failed' }
              : m
            );

          default:
            return prev;
        }
      });
    };

    window.addEventListener('jarvis-agent-event', handler);
    window.addEventListener('jarvis-mission-event', missionHandler);
    return () => {
      window.removeEventListener('jarvis-agent-event', handler);
      window.removeEventListener('jarvis-mission-event', missionHandler);
    };
  }, []);

  const activeAgents = useMemo(
    () => agents.filter(a => a.status === 'running' || a.status === 'pending'),
    [agents, tick]
  );
  const activeMissions = useMemo(
    () => missions.filter(m => m.status === 'in_progress'),
    [missions, tick]
  );

  // ── Cleanup stale entries (completed/failed for > 5s) via ticker ──
  useEffect(() => {
    const now = Date.now();
    const staleThreshold = 5000;

    setAgents(prev => {
      const cleaned = prev.filter(a => {
        if (a.status === 'running' || a.status === 'pending') return true;
        return (now - a.timestamp.getTime()) < staleThreshold;
      });
      return cleaned.length !== prev.length ? cleaned : prev;
    });

    setMissions(prev => {
      const cleaned = prev.filter(m => m.status === 'in_progress');
      return cleaned.length !== prev.length ? cleaned : prev;
    });
  }, [tick]);

  // Ne rien afficher si rien d'actif
  if (activeAgents.length === 0 && activeMissions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
      style={{ maxWidth: '320px' }}
    >
      {/* Expanded detail panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="w-72 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-base)',
            }}
          >
            {/* Active missions */}
            {activeMissions.map(mission => (
              <div
                key={mission.missionId}
                className="px-3 py-2.5 cursor-pointer hover:bg-white/5 transition"
                onClick={onOpenMissions}
                style={{ borderBottom: '1px solid var(--border-base)' }}
              >
                <div className="flex items-center gap-2">
                  <Target size={11} style={{ color: '#38bdf8' }} />
                  <span className="text-[10px] font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                    {mission.title}
                  </span>
                  <span className="text-[9px] font-mono font-bold"
                    style={{ color: mission.confidence >= 0.7 ? '#4ade80' : mission.confidence >= 0.4 ? '#fbbf24' : '#f87171' }}>
                    {Math.round(mission.confidence * 100)}%
                  </span>
                </div>
                {mission.currentGoal && (
                  <div className="flex items-center gap-1.5 mt-1 ml-5">
                    <Loader2 size={8} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {mission.currentGoal}
                    </span>
                  </div>
                )}
                {mission.lastAction && (
                  <div className="flex items-center gap-1.5 mt-0.5 ml-5">
                    <Zap size={8} style={{ color: 'var(--text-dimmed)' }} />
                    <span className="text-[8px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                      {mission.lastAction}
                    </span>
                    {mission.lastDecision && mission.lastDecision !== 'continue' && (
                      <span className="text-[8px] font-bold px-1 rounded"
                        style={{
                          color: mission.lastDecision === 'retry' ? '#fbbf24' : '#f87171',
                          backgroundColor: mission.lastDecision === 'retry' ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)',
                        }}>
                        {mission.lastDecision}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Active agents */}
            {activeAgents.map(agent => (
              <div
                key={agent.taskId}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition"
                onClick={onOpenAgents}
              >
                <Loader2 size={10} className="animate-spin" style={{ color: '#a855f7' }} />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium truncate block" style={{ color: 'var(--text-primary)' }}>
                    {agent.agentName}
                  </span>
                  <span className="text-[9px] truncate block" style={{ color: 'var(--text-dimmed)' }}>
                    {agent.title}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact indicator pill */}
      <motion.button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-full shadow-lg cursor-pointer select-none hover:scale-105 transition-transform"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-base)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
      >
        {/* Pulsing indicator */}
        <div className="relative">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-blue-400 animate-ping opacity-50" />
        </div>

        {/* Content */}
        <div className="flex items-center gap-1.5">
          {activeMissions.length > 0 && (
            <div className="flex items-center gap-1">
              <Target size={10} style={{ color: '#38bdf8' }} />
              <span className="text-[9px] font-bold" style={{ color: '#38bdf8' }}>
                {activeMissions.length}
              </span>
            </div>
          )}
          {activeAgents.length > 0 && (
            <div className="flex items-center gap-1">
              <Bot size={10} style={{ color: '#a855f7' }} />
              <span className="text-[9px] font-bold" style={{ color: '#a855f7' }}>
                {activeAgents.length}
              </span>
            </div>
          )}
        </div>

        {/* Last event text */}
        {lastEvent && (
          <span className="text-[9px] max-w-[140px] truncate" style={{ color: 'var(--text-muted)' }}>
            {lastEvent}
          </span>
        )}

        {/* Expand/collapse icon */}
        {expanded ? (
          <ChevronDown size={10} style={{ color: 'var(--text-dimmed)' }} />
        ) : (
          <ChevronUp size={10} style={{ color: 'var(--text-dimmed)' }} />
        )}
      </motion.button>
    </motion.div>
  );
}

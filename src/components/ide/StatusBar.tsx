import { useState, useCallback, useEffect, useRef, memo, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import {
  LoaderCircle,
  Hash,
  AlertTriangle,
  BrainCircuit,
  FileText,
  RefreshCcw,
  X,
  Users,
  Radio,
  ScrollText,
  DatabaseZap,
  Github,
  Send,
  Play,
  Square,
  Target,
} from 'lucide-react';
import { useLiveAPIContext } from '../../context/LiveAPIContext.js';
import { useProfile } from '../../context/UserProfileContext.js';


import { type TelegramStatus } from './TelegramStatusModal.js';
import { formatExactTokenCount, formatTokenCount } from '../../utils/tokenFormatting.js';
import { getAgentTasks, getToolActivities, subscribe as subscribeActivity } from '../../stores/agentActivityStore.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface StatusBarProps {
  filePath?: string | null;
  language?: string;
  line?: number;
  column?: number;
  dirty?: boolean;
  encoding?: string;
  assistantBusy?: boolean;
  onToggleMcp?: () => void;
  onToggleSandbox?: () => void;
  onToggleAgents?: () => void;
  onToggleFleet?: () => void;
  onToggleLogs?: () => void;
  onToggleGitHub?: () => void;
  onToggleMissions?: () => void;
  onToggleTelegram?: () => void;
  onToggleModelPicker?: () => void;
  onToggleTokenDetail?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getModifierKey(): string {
  return navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
}

// Style partagé pour tous les boutons de la barre — cohérence visuelle,
// coins doux, transition sur toutes les propriétés et halo au survol.
const PILL =
  'group/pill relative flex items-center gap-1.5 px-2.5 h-[22px] rounded-md ' +
  'text-[12px] font-medium leading-none transition-all duration-200 ' +
  'hover:bg-[var(--accent-subtle)] active:scale-[0.97]';

// Petit point d'état avec halo doux.
function StatusDot({
  color,
  pulse,
  glow = true,
}: {
  color: string;
  pulse?: boolean;
  glow?: boolean;
}) {
  return (
    <motion.span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{
        backgroundColor: color,
        boxShadow: glow ? `0 0 6px ${color}` : undefined,
      }}
      animate={pulse ? { scale: [1, 1.35, 1], opacity: [1, 0.6, 1] } : { scale: 1 }}
      transition={pulse ? { repeat: Infinity, duration: 2, ease: 'easeInOut' } : { type: 'spring', bounce: 0.5, duration: 0.4 }}
    />
  );
}

// Badge compteur réutilisable (agents, missions, sandbox).
function CountBadge({ value, color }: { value: number; color: string }) {
  return (
    <motion.span
      key={value}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      className="min-w-[15px] h-[15px] flex items-center justify-center rounded-full text-[9px] font-bold tabular-nums leading-none px-1"
      style={{ backgroundColor: color, color: 'var(--bg-primary)', boxShadow: `0 0 8px ${color}` }}
    >
      {value > 99 ? '99+' : value}
    </motion.span>
  );
}

// Séparateur vertical léger.
function Divider() {
  return (
    <div
      className="w-px h-3.5 rounded-full flex-shrink-0"
      style={{ background: 'linear-gradient(var(--border-base), transparent)', opacity: 0.5 }}
    />
  );
}

// ── StatusBar Component ────────────────────────────────────────────────────

export const StatusBar = memo(function StatusBar({
  filePath,
  line: _line,
  column: _column,
  dirty,
  encoding: _encoding = 'UTF-8',
  assistantBusy,
  onToggleMcp,
  onToggleSandbox,
  onToggleAgents,
  onToggleFleet,
  onToggleLogs,
  onToggleGitHub,
  onToggleMissions,
  onToggleTelegram,
  onToggleModelPicker,
  onToggleTokenDetail,
}: StatusBarProps) {
  const { tokenUsage, promptContext } = useLiveAPIContext();
  const { profile } = useProfile();


  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const resetInputRef = useRef<HTMLInputElement | null>(null);
  
  const [mcpStatus, setMcpStatus] = useState<'ok' | 'error' | 'loading'>('loading');
  const [sandboxActive, setSandboxActive] = useState(false);
  const [sandboxModifiedCount, setSandboxModifiedCount] = useState(0);

  // ── Missions ─────────────────────────────────────────────────────────────
  // Nombre de missions actives (in_progress). Alimenté par le fetch initial
  // puis mis à jour en temps réel via les événements 'Leanna-mission-event',
  // exactement comme le MissionPanel.
  const [activeMissionCount, setActiveMissionCount] = useState(0);

  // ── Telegram ───────────────────────────────────────────────────────────────
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [telegramActionLoading, setTelegramActionLoading] = useState(false);

  // ── Agent activity ─────────────────────────────────────────────────────────

  const delegatedTasks  = useSyncExternalStore(subscribeActivity, getAgentTasks);
  const liveActivities  = useSyncExternalStore(subscribeActivity, getToolActivities);

  const activeAgentCount =
    delegatedTasks.filter(t => t.status === 'running' || t.status === 'pending').length +
    liveActivities.filter(a => a.status === 'running').length;

  const modifierKey = getModifierKey();
  const sandboxLabel = 'Sandbox';

  // ── MCP ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchMcp = async () => {
      try {
        const token = localStorage.getItem('Leanna_api_token');
        const headers: Record<string, string> = token ? { 'x-Leanna-token': token } : {};
        const res = await fetch('/api/mcp/status', { headers });
        const data = await res.json();
        if (!cancelled) {
          setMcpStatus(data.status === 'success' ? 'ok' : 'error');
        }
      } catch {
        if (!cancelled) setMcpStatus('error');
      }
    };
    fetchMcp();
    const interval = setInterval(fetchMcp, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ── Missions : suivi du nombre de missions actives ─────────────────────────

  useEffect(() => {
    // statuts par mission, pour recalculer le nombre d'actives à chaque event
    const statuses = new Map<string, string>();
    const recompute = () => {
      let count = 0;
      for (const s of statuses.values()) {
        // Ne compter que les missions réellement en cours d'exécution.
        // 'blocked' (escaladé), 'pending', 'completed' et 'failed' ne sont
        // PAS des missions actives — les inclure faisait apparaître un badge
        // fantôme alors qu'aucune mission ne tournait.
        if (s === 'in_progress' || s === 'paused') count += 1;
      }
      setActiveMissionCount(count);
    };

    let cancelled = false;
    fetch('/api/missions')
      .then(res => (res.ok ? res.json() : { missions: [] }))
      .then((data: { missions?: Array<{ id: string; status?: string }> }) => {
        if (cancelled || !Array.isArray(data.missions)) return;
        for (const m of data.missions) statuses.set(m.id, m.status ?? 'pending');
        recompute();
      })
      .catch(() => { /* système de missions indisponible — badge à 0, normal */ });

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: string; event?: string; missionId?: string; success?: boolean }>).detail;
      if (!detail || detail.type !== 'mission_event' || !detail.missionId) return;
      switch (detail.event) {
        case 'mission_plan':
          if (!statuses.has(detail.missionId)) statuses.set(detail.missionId, 'pending');
          break;
        case 'mission_started':
        case 'goal_started':
        case 'action_started':
        case 'goal_escalated':
        case 'goal_blocked':
          // Un objectif bloqué/escaladé n'arrête pas la mission (d'autres
          // objectifs peuvent tourner en parallèle) → toujours "en cours".
          statuses.set(detail.missionId, 'in_progress');
          break;
        case 'mission_paused':
        case 'mission_resumed':
          // Reste comptée comme active dans les deux cas.
          statuses.set(detail.missionId, 'in_progress');
          break;
        case 'mission_deleted':
          statuses.delete(detail.missionId);
          break;
        case 'mission_completed':
          statuses.set(detail.missionId, detail.success ? 'completed' : 'failed');
          break;
        case 'mission_cancelled':
          statuses.set(detail.missionId, 'failed');
          break;
        default:
          return;
      }
      recompute();
    };

    window.addEventListener('Leanna-mission-event', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('Leanna-mission-event', handler);
    };
  }, []);

  // ── Telegram ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchTelegram = async () => {
      try {
        const res = await fetch('/api/telegram/status');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.status === 'success') {
            setTelegramStatus(data.data);
          }
        }
      } catch {
        /* silent */
      }
    };

    const handleTelegramChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setTelegramStatus(detail);
      } else {
        fetchTelegram();
      }
    };

    fetchTelegram();
    const interval = setInterval(fetchTelegram, 10000);
    window.addEventListener('Leanna-telegram-status-changed', handleTelegramChanged);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('Leanna-telegram-status-changed', handleTelegramChanged);
    };
  }, []);

  const handleQuickToggleTelegram = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (telegramActionLoading || !telegramStatus?.isConfigured) return;
    setTelegramActionLoading(true);
    try {
      const endpoint = telegramStatus.isRunning ? '/api/telegram/stop' : '/api/telegram/start';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.data) {
        setTelegramStatus(data.data);
        window.dispatchEvent(new CustomEvent('Leanna-telegram-status-changed', { detail: data.data }));
      }
    } catch {
      /* silent */
    } finally {
      setTelegramActionLoading(false);
    }
  }, [telegramActionLoading, telegramStatus]);

  // ── Build ──────────────────────────────────────────────────────────────────


  // ── Sandbox ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchSandbox = async () => {
      try {
        const token = localStorage.getItem('Leanna_api_token');
        const headers: Record<string, string> = token ? { 'x-Leanna-token': token } : {};
        const res = await fetch('/api/sandbox/status', { headers });
        const data = await res.json();
        if (!cancelled && data.status === 'success') {
          setSandboxActive(data.sandbox?.active ?? false);
          setSandboxModifiedCount(data.sandbox?.modifiedCount ?? 0);
        }
      } catch {
        /* silent */
      }
    };
    const handleSandboxChanged = () => { fetchSandbox(); };
    fetchSandbox();
    const interval = setInterval(fetchSandbox, 5000);
    window.addEventListener('Leanna-sandbox-changed', handleSandboxChanged);
    window.addEventListener('Leanna-sandbox-file-changed', handleSandboxChanged);
    window.addEventListener('Leanna-sandbox-file-deleted', handleSandboxChanged);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('Leanna-sandbox-changed', handleSandboxChanged);
      window.removeEventListener('Leanna-sandbox-file-changed', handleSandboxChanged);
      window.removeEventListener('Leanna-sandbox-file-deleted', handleSandboxChanged);
    };
  }, []);

  const handleConfirmReset = useCallback(async () => {
    setResetError(null);
    try {
      const token = localStorage.getItem('Leanna_api_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { 'x-Leanna-token': token } : {}),
      };
      const res = await fetch('/api/sandbox/reset', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: resetCode }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setShowResetConfirm(false);
        setResetCode('');
        window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
      } else {
        // Show error to user
        setResetError(data.error || 'Erreur lors de la réinitialisation');
      }
    } catch {
      setResetError('Erreur réseau');
    }
  }, [resetCode]);

  useEffect(() => {
    if (!showResetConfirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowResetConfirm(false);
        setResetCode('');
        setResetError(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showResetConfirm]);

  useEffect(() => {
    if (showResetConfirm) {
      resetInputRef.current?.focus();
    }
  }, [showResetConfirm]);

  // ── Indexing progress ─────────────────────────────────────────────────────

  const [indexing, setIndexing] = useState<{
    active: boolean;
    phase: string;
    current: number;
    total: number;
    file?: string;
  }>({ active: false, phase: '', current: 0, total: 0 });

  // Auto-dismiss 2s after phase=done
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        phase: string;
        current: number;
        total: number;
        file?: string;
      };
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

      if (d.phase === 'done') {
        setIndexing(prev => ({ ...prev, active: true, phase: 'done', current: d.current ?? prev.current, total: d.total ?? prev.total }));
        dismissTimerRef.current = setTimeout(() => {
          setIndexing(prev => ({ ...prev, active: false }));
          dismissTimerRef.current = null;
        }, 2000);
      } else {
        setIndexing({ active: true, phase: d.phase, current: d.current, total: d.total, file: d.file });
      }
    };
    window.addEventListener('Leanna-knowledge-progress', handler);
    return () => {
      window.removeEventListener('Leanna-knowledge-progress', handler);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  // ── Manual reindex ────────────────────────────────────────────────────────

  const [reindexing, setReindexing] = useState(false);

  const handleReindex = useCallback(async () => {
    if (reindexing || indexing.active) return;
    setReindexing(true);
    try {
      const token = localStorage.getItem('Leanna_api_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { 'x-Leanna-token': token } : {}),
      };
      await fetch('/api/knowledge/reindex', { method: 'POST', headers });
    } catch { /* silent — progress bar will not appear, that's fine */ }
    finally {
      setReindexing(false);
    }
  }, [reindexing, indexing.active]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const { suggestion } = promptContext;

  return (
    <>
      {/* ─── Knowledge Indexing Progress Bar ──────────────────────────────── */}
      <AnimatePresence>
        {indexing.active && (
          <motion.div
            key="indexing-bar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-base)' }}
          >
            {/* Progress track */}
            <div className="h-0.5 w-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <motion.div
                className="h-full"
                style={{ backgroundColor: 'var(--accent-primary)', originX: 0 }}
                animate={{
                  width: indexing.phase === 'done' || indexing.total === 0
                    ? '100%'
                    : `${Math.max(2, Math.round((indexing.current / indexing.total) * 100))}%`,
                }}
                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              />
            </div>
            {/* Label row */}
            <div className="flex items-center gap-2 px-4 py-0.5 text-xs select-none" style={{ color: 'var(--text-muted)' }}>
              {indexing.phase !== 'done' && (
                <LoaderCircle size={10} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
              )}
              <span className="font-medium" style={{ color: 'var(--accent-primary)' }}>
                {indexing.phase === 'done'
                  ? `✓ Indexation terminée (${indexing.total} fichiers)`
                  : indexing.phase === 'relations'
                  ? 'Extraction des relations…'
                  : indexing.phase === 'incremental'
                  ? `Mise à jour incrémentale — ${indexing.current} / ${indexing.total}`
                  : `Indexation — ${indexing.current} / ${indexing.total}`}
              </span>
              {indexing.phase === 'parse' && indexing.file && (
                <span className="truncate opacity-60 max-w-[300px]">{indexing.file}</span>
              )}
              {indexing.phase !== 'done' && indexing.total > 0 && (
                <span className="ml-auto tabular-nums opacity-70">
                  {Math.round((indexing.current / indexing.total) * 100)}%
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="group/bar flex items-center gap-2 px-3 h-9 border-t select-none text-sm backdrop-blur"
        style={{
          borderColor: 'var(--border-base)',
          background: 'linear-gradient(to top, var(--bg-secondary), color-mix(in srgb, var(--bg-secondary) 92%, transparent))',
          boxShadow: '0 -1px 8px rgba(0,0,0,0.12)',
        }}
      >
        {/* ─── Zone gauche : Sandbox · IA · MCP · services ─────────────── */}
        <div className="flex items-center gap-1">
          {/* Sandbox — dot + label */}
          <button
            type="button"
            onClick={() => onToggleSandbox?.()}
            className={PILL}
            title={sandboxActive ? 'Sandbox actif' : 'Sandbox inactif'}
          >
            <StatusDot color={sandboxActive ? 'var(--color-success)' : 'var(--text-muted)'} pulse={sandboxActive} />
            <span style={{ color: sandboxActive ? 'var(--color-success)' : 'var(--text-muted)' }}>
              {sandboxLabel}
            </span>
            {sandboxModifiedCount > 0 && (
              <CountBadge value={sandboxModifiedCount} color="var(--accent-primary)" />
            )}
          </button>

          <Divider />

          {/* AI Model — compact, clickable */}
          <button
            type="button"
            onClick={() => onToggleModelPicker?.()}
            className={PILL}
            style={{ color: 'var(--text-secondary)' }}
            title="Changer de modèle IA"
          >
            <BrainCircuit size={13} style={{ color: 'var(--accent-primary)' }} />
            <span className="truncate max-w-[110px]">
              {profile.textProvider === 'openrouter'
                ? profile.openrouterModel.split('/').pop()
                : 'Gemini Live'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleMcp}
            className={PILL}
            style={{ color: 'var(--text-muted)' }}
            title={`MCP: ${mcpStatus}`}
          >
            <StatusDot
              color={
                mcpStatus === 'ok' ? 'var(--color-success)' :
                mcpStatus === 'error' ? 'var(--color-error)' : 'var(--text-muted)'
              }
              glow={mcpStatus !== 'loading'}
            />
            <span>MCP</span>
          </button>

          <Divider />

          {/* Telegram Bot */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onToggleTelegram?.()}
              className={PILL}
              title={
                !telegramStatus?.isConfigured
                  ? 'Telegram : Non configuré (cliquer pour configurer)'
                  : telegramStatus.isRunning
                  ? `Telegram : En ligne (@${telegramStatus.botInfo?.username || 'bot'}) — Cliquer pour gérer`
                  : telegramStatus.lastError
                  ? `Telegram : Erreur (${telegramStatus.lastError}) — Cliquer pour voir`
                  : 'Telegram : Arrêté — Cliquer pour démarrer ou gérer'
              }
            >
              <Send
                size={12}
                style={{
                  color: telegramStatus?.isRunning ? 'var(--color-success)' : 'var(--text-muted)',
                }}
              />
              <StatusDot
                color={
                  telegramStatus?.isRunning
                    ? 'var(--color-success)'
                    : telegramStatus?.lastError
                    ? 'var(--color-error)'
                    : !telegramStatus?.isConfigured
                    ? 'var(--color-warning)'
                    : 'var(--text-muted)'
                }
                pulse={telegramStatus?.isRunning}
              />
              <span
                style={{
                  color: telegramStatus?.isRunning ? 'var(--color-success)' : 'var(--text-muted)',
                }}
              >
                Telegram
              </span>
            </button>

            {/* Quick toggle start/stop button */}
            {telegramStatus?.isConfigured && (
              <button
                type="button"
                onClick={handleQuickToggleTelegram}
                disabled={telegramActionLoading}
                className="p-1 rounded-md hover:bg-[var(--accent-subtle)] transition-all duration-200 opacity-70 hover:opacity-100 active:scale-90 disabled:opacity-40"
                title={telegramStatus.isRunning ? 'Arrêter le bot Telegram' : 'Démarrer le bot Telegram'}
                aria-label={telegramStatus.isRunning ? 'Arrêter le bot Telegram' : 'Démarrer le bot Telegram'}
              >
                {telegramActionLoading ? (
                  <LoaderCircle size={11} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                ) : telegramStatus.isRunning ? (
                  <Square size={11} style={{ color: 'var(--color-error)' }} fill="currentColor" />
                ) : (
                  <Play size={11} style={{ color: 'var(--color-success)' }} fill="currentColor" />
                )}
              </button>
            )}
          </div>

          <Divider />

          {/* Agents — visible uniquement si activé dans les paramètres */}
          {profile.agents.enabled && (
            <button
              type="button"
              onClick={onToggleAgents}
              className={PILL}
              style={{ color: 'var(--text-muted)' }}
              title="Ouvrir le panneau Agents"
            >
              <Users size={13} style={{ color: 'var(--accent-primary)' }} />
              <span>Agents</span>
              {activeAgentCount > 0 && (
                <span className="absolute -top-1 -right-1">
                  <CountBadge value={activeAgentCount} color="var(--accent-primary)" />
                </span>
              )}
            </button>
          )}

          {/* Fleet — visible uniquement si agents activés */}
          {profile.agents.enabled && (
            <button
              type="button"
              onClick={onToggleFleet}
              className={PILL}
              style={{ color: 'var(--text-muted)' }}
              title="Ouvrir la flotte d'agents"
            >
              <Radio size={13} style={{ color: 'var(--color-accent-alt)' }} />
              <span>Flotte</span>
            </button>
          )}

          {/* Logs */}
          <button
            type="button"
            onClick={onToggleLogs}
            className={PILL}
            style={{ color: 'var(--text-muted)' }}
            title="Ouvrir les logs de l'assistant et des agents"
          >
            <ScrollText size={13} style={{ color: 'var(--accent-secondary)' }} />
            <span>Logs</span>
          </button>

          {/* GitHub — publication du workspace réel */}
          <button
            type="button"
            onClick={onToggleGitHub}
            className={PILL}
            style={{ color: 'var(--text-muted)' }}
            title="Ouvrir GitHub et publier les modifications"
          >
            <Github size={13} style={{ color: 'var(--accent-primary)' }} />
            <span>GitHub</span>
          </button>

          {/* Missions — ouvre le panneau des missions */}
          <button
            type="button"
            onClick={onToggleMissions}
            className={PILL}
            style={{ color: 'var(--text-muted)' }}
            title="Ouvrir le panneau Missions"
          >
            <Target size={13} style={{ color: 'var(--color-info)' }} />
            <span>Missions</span>
            {activeMissionCount > 0 && (
              <span
                className="absolute -top-1 -right-1"
                aria-label={`${activeMissionCount} mission${activeMissionCount > 1 ? 's' : ''} active${activeMissionCount > 1 ? 's' : ''}`}
              >
                <CountBadge value={activeMissionCount} color="var(--color-info)" />
              </span>
            )}
          </button>

          <Divider />

          {/* Reindex — déclenche un scan complet du KnowledgeGraph */}
          <button
            type="button"
            onClick={handleReindex}
            disabled={reindexing || indexing.active}
            className={`${PILL} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
            style={{ color: 'var(--text-muted)' }}
            title="Réindexer le projet, les documents et les documents extraits"
            aria-label="Réindexer le projet, les documents et les documents extraits"
          >
            {reindexing || (indexing.active && indexing.phase !== 'done')
              ? <LoaderCircle size={13} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              : <DatabaseZap size={13} style={{ color: 'var(--accent-primary)' }} />
            }
            <span>Réindexer</span>
          </button>
        </div>

        {/* ─── Spacer ───────────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ─── Zone droite : Tokens · Status · Édition · Shortcut ───────── */}
        <div className="flex items-center gap-1.5">
          {/* Busy indicator */}
          <AnimatePresence>
            {assistantBusy && (
              <motion.span
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-1.5 px-2.5 h-[22px] rounded-md text-[12px] font-medium leading-none"
                style={{ color: 'var(--color-warning)', backgroundColor: 'var(--color-warning-subtle)' }}
              >
                <LoaderCircle size={12} className="animate-spin" />
                <span>Traitement…</span>
              </motion.span>
            )}
          </AnimatePresence>

          {/* File state */}
          {filePath && (
            <span className="flex items-center gap-1.5 text-[12px] font-medium leading-none px-1">
              <StatusDot
                color={dirty ? 'var(--color-warning)' : 'var(--color-success)'}
                pulse={dirty}
              />
              <span style={{ color: dirty ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {dirty ? 'Modifié' : 'Sauvé'}
              </span>
            </span>
          )}

          <Divider />

          {/* Tokens — clickable */}
          <button
            type="button"
            onClick={() => onToggleTokenDetail?.()}
            className="group/pill relative flex items-center gap-2.5 px-2.5 h-[22px] rounded-md transition-all duration-200 hover:bg-[var(--accent-subtle)] active:scale-[0.97]"
            style={{ color: 'var(--text-muted)' }}
            title={`Tokens : ${formatExactTokenCount(tokenUsage.totalTokens)} · Contexte : ${formatExactTokenCount(promptContext.currentSize)} / ${formatExactTokenCount(promptContext.maxSize)}`}
          >
            <span className="flex items-center gap-1 tabular-nums font-semibold text-[12px] leading-none">
              <Hash size={11} className="opacity-50" />
              {tokenUsage.totalTokens > 0 ? formatTokenCount(tokenUsage.totalTokens) : '—'}
            </span>
            <span className="flex items-center gap-1 tabular-nums font-semibold text-[12px] leading-none">
              <FileText size={11} className="opacity-50" />
              {formatTokenCount(promptContext.currentSize)}/{formatTokenCount(promptContext.maxSize)}
            </span>
            {suggestion && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: 'var(--color-warning)', boxShadow: '0 0 6px var(--color-warning)' }}
              />
            )}
          </button>

          <Divider />

          {/* Édition */}
          {/* <div className="flex items-center gap-2 font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
            <span>{encoding}</span>
            <span>LF</span>
            {typeof line === 'number' && typeof column === 'number' && (
              <button
                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ...(navigator.platform.includes('Mac') ? { metaKey: true } : { ctrlKey: true }) }))}
                className="hover:text-primary transition-colors duration-150"
                title="Aller à la ligne..."
              >
                Ln {line}, Col {column}
              </button>
            )}
          </div> */}

          {/* Reset — discret, visible on hover */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1 px-2 h-[22px] rounded-md text-[12px] font-medium leading-none opacity-0 group-hover/bar:opacity-100 transition-all duration-300 hover:bg-[var(--color-warning-subtle)] active:scale-95"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-warning)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            title="Réinitialiser le sandbox"
          >
            <RefreshCcw size={11} strokeWidth={1.8} />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Command palette shortcut */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }))}
            className="flex items-center gap-1 px-2 h-[22px] rounded-md font-mono text-[11px] leading-none transition-all duration-200 hover:bg-[var(--accent-subtle)] active:scale-95"
            style={{ color: 'var(--text-dimmed)' }}
            title="Palette de commandes"
          >
            <kbd
              className="px-1 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              {modifierKey}
            </kbd>
            <kbd
              className="px-1 py-0.5 rounded font-semibold"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              P
            </kbd>
          </button>
        </div>
      </div>

      <AnimatePresence>
      {showResetConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm bg-black/50"
          style={{ zIndex: 'var(--z-modal)' as any }}
          onClick={() => {
            setShowResetConfirm(false);
            setResetCode('');
            setResetError(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--color-warning-subtle)' }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
                </div>
                <div className="text-left">
                  <h3 id="reset-confirm-title" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Confirmer la réinitialisation
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Supprimez toutes les modifications en cours et restaurez l'état d'origine.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowResetConfirm(false); setResetCode(''); }}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Fermer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Entrez le code de confirmation pour valider la réinitialisation du sandbox.
              </p>
              {resetError && (
                <p className="text-xs" style={{ color: 'var(--color-error)' }}>
                  {resetError}
                </p>
              )}
              <input
                ref={resetInputRef}
                type="text"
                maxLength={6}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' && resetCode.length === 6) handleConfirmReset();
                  if (e.key === 'Escape') {
                    setShowResetConfirm(false);
                    setResetCode('');
                  }
                }}
                value={resetCode}
                className="w-full rounded-xl border px-4 py-3 text-center text-sm font-mono tracking-[0.45em] outline-none transition-colors"
                style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                placeholder="000000"
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border-base)' }}>
              <button
                type="button"
                onClick={() => { setShowResetConfirm(false); setResetCode(''); setResetError(null); }}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={resetCode.length !== 6}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
                style={{ backgroundColor: 'var(--color-warning)', color: 'var(--bg-primary)' }}
              >
                Réinitialiser
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

    </>
  );
});
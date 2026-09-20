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
import { TokenDetailModal } from './TokenDetailModal.js';
import { ModelPickerModal } from './ModelPickerModal.js';
import { TelegramStatusModal, type TelegramStatus } from './TelegramStatusModal.js';
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
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getModifierKey(): string {
  return navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
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
}: StatusBarProps) {
  const { tokenUsage, promptContext } = useLiveAPIContext();
  const { profile } = useProfile();


  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
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
  const [showTelegramModal, setShowTelegramModal] = useState(false);
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
        className="group/bar flex items-center gap-3 px-4 h-8 border-t select-none text-sm"
        style={{
          borderColor: 'var(--border-base)',
          backgroundColor: 'var(--bg-secondary)',
          boxShadow: '0 -1px 4px rgba(0,0,0,0.04)',
        }}
      >
        {/* ─── Zone gauche : Sandbox · Build · AI ─────────────────── */}
        <div className="flex items-center gap-3">
          {/* Sandbox — dot + label */}
          <button
            type="button"
            onClick={() => onToggleSandbox?.()}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            title={sandboxActive ? 'Sandbox actif' : 'Sandbox inactif'}
          >
              <motion.div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: sandboxActive ? 'var(--color-success)' : 'var(--text-muted)' }}
                animate={{ scale: sandboxActive ? [1, 1.2, 1] : 1 }}
                transition={{ type: 'spring', bounce: 0.5, duration: 0.4 }}
              />
            <span style={{ color: sandboxActive ? 'var(--color-success)' : 'var(--text-muted)' }} className="font-medium">
              {sandboxLabel}
            </span>
            {sandboxModifiedCount > 0 && (
              <motion.span
                key={sandboxModifiedCount}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="min-w-[16px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
                aria-label={`${sandboxModifiedCount} fichier${sandboxModifiedCount > 1 ? 's' : ''} modifié${sandboxModifiedCount > 1 ? 's' : ''} dans la sandbox`}
              >
                {sandboxModifiedCount > 99 ? '99+' : sandboxModifiedCount}
              </motion.span>
            )}
          </button>


          {/* Séparateur */}
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-base)', opacity: 0.4 }} />

          {/* AI Model — compact, clickable */}
          <button
            type="button"
            onClick={() => setShowModelPicker(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            title="Changer de modèle IA"
          >
            <BrainCircuit size={12} />
            <span className="font-medium truncate max-w-[100px]">
              {profile.textProvider === 'openrouter'
                ? profile.openrouterModel.split('/').pop()
                : 'Gemini Live'}
            </span>
          </button>

              
          <button
            type="button"
            onClick={onToggleMcp}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            title={`MCP: ${mcpStatus}`}
          >
            <div className="w-2 h-2 rounded-full" style={{
              backgroundColor: mcpStatus === 'ok' ? 'var(--color-success)' :
              mcpStatus === 'error' ? 'var(--color-error)' : 'var(--text-muted)'
            }} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">MCP</span>
          </button>

          {/* Telegram Bot */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowTelegramModal(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
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
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: telegramStatus?.isRunning
                    ? 'var(--color-success)'
                    : telegramStatus?.lastError
                    ? 'var(--color-error)'
                    : !telegramStatus?.isConfigured
                    ? 'var(--color-warning)'
                    : 'var(--text-muted)',
                }}
                animate={telegramStatus?.isRunning ? { scale: [1, 1.25, 1] } : undefined}
                transition={telegramStatus?.isRunning ? { repeat: Infinity, duration: 2 } : undefined}
              />
              <span
                style={{
                  color: telegramStatus?.isRunning ? 'var(--color-success)' : 'var(--text-muted)',
                }}
                className="font-medium"
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
                className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors opacity-70 hover:opacity-100 disabled:opacity-40"
                title={telegramStatus.isRunning ? 'Arrêter le bot Telegram' : 'Démarrer le bot Telegram'}
                aria-label={telegramStatus.isRunning ? 'Arrêter le bot Telegram' : 'Démarrer le bot Telegram'}
              >
                {telegramActionLoading ? (
                  <LoaderCircle size={10} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                ) : telegramStatus.isRunning ? (
                  <Square size={10} className="text-rose-400 hover:text-rose-300" fill="currentColor" />
                ) : (
                  <Play size={10} className="text-emerald-400 hover:text-emerald-300" fill="currentColor" />
                )}
              </button>
            )}
          </div>

          {/* Agents — visible uniquement si activé dans les paramètres */}
          {profile.agents.enabled && (
            <button
              type="button"
              onClick={onToggleAgents}
              className="relative flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              title="Ouvrir le panneau Agents"
            >
              <Users size={12} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ color: 'var(--text-muted)' }} className="font-medium">Agents</span>
              {activeAgentCount > 0 && (
                <motion.span
                  key={activeAgentCount}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[9px] font-bold tabular-nums leading-none px-0.5"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
                >
                  {activeAgentCount > 99 ? '99+' : activeAgentCount}
                </motion.span>
              )}
            </button>
          )}

          {/* Fleet — visible uniquement si agents activés */}
          {profile.agents.enabled && (
            <button
              type="button"
              onClick={onToggleFleet}
              className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              title="Ouvrir la flotte d'agents"
            >
              <Radio size={12} style={{ color: 'var(--color-accent-alt)' }} />
              <span style={{ color: 'var(--text-muted)' }} className="font-medium">Flotte</span>
            </button>
          )}

          {/* Logs */}
          <button
            type="button"
            onClick={onToggleLogs}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            title="Ouvrir les logs de l'assistant et des agents"
          >
            <ScrollText size={12} style={{ color: 'var(--accent-secondary)' }} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">Logs</span>
          </button>

          {/* GitHub — publication du workspace réel */}
          <button
            type="button"
            onClick={onToggleGitHub}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            title="Ouvrir GitHub et publier les modifications"
          >
            <Github size={12} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">GitHub</span>
          </button>

          {/* Missions — ouvre le panneau des missions */}
          <button
            type="button"
            onClick={onToggleMissions}
            className="relative flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            title="Ouvrir le panneau Missions"
          >
            <Target size={12} style={{ color: 'var(--color-info)' }} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">Missions</span>
            {activeMissionCount > 0 && (
              <motion.span
                key={activeMissionCount}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[9px] font-bold tabular-nums leading-none px-0.5"
                style={{ backgroundColor: 'var(--color-info)', color: 'var(--bg-primary)' }}
                aria-label={`${activeMissionCount} mission${activeMissionCount > 1 ? 's' : ''} active${activeMissionCount > 1 ? 's' : ''}`}
              >
                {activeMissionCount > 99 ? '99+' : activeMissionCount}
              </motion.span>
            )}
          </button>

          {/* Séparateur */}
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-base)', opacity: 0.4 }} />

          {/* Reindex — déclenche un scan complet du KnowledgeGraph */}
          <button
            type="button"
            onClick={handleReindex}
            disabled={reindexing || indexing.active}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            title="Réindexer le projet, les documents et les documents extraits"
            aria-label="Réindexer le projet, les documents et les documents extraits"
          >
            {reindexing || (indexing.active && indexing.phase !== 'done')
              ? <LoaderCircle size={12} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              : <DatabaseZap size={12} style={{ color: 'var(--accent-primary)' }} />
            }
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">Réindexer</span>
          </button>
        </div>

        {/* ─── Spacer ───────────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ─── Zone droite : Tokens · Status · Édition · Shortcut ───────── */}
        <div className="flex items-center gap-3">
          {/* Busy indicator */}
          {assistantBusy && (
            <span className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--color-warning)' }}>
              <LoaderCircle size={11} className="animate-spin" />
              <span>Traitement…</span>
            </span>
          )}

          {/* File state */}
          {filePath && (
            <span className="flex items-center gap-1.5 font-medium">
              {dirty ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span style={{ color: 'var(--color-warning)' }}>Modifié</span>
                </>
              ) : (
                <>
              <motion.div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: dirty ? 'var(--color-warning)' : 'var(--color-success)' }}
                animate={{ opacity: dirty ? [1, 0.5, 1] : 1 }}
                transition={dirty ? { repeat: Infinity, duration: 1.5 } : { duration: 0.3 }}
              />
                  <span style={{ color: 'var(--color-success)' }}>Sauvé</span>
                </>
              )}
            </span>
          )}
              
          {/* Séparateur */}
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-base)', opacity: 0.4 }} />

          {/* Tokens — clickable */}
          <button
            type="button"
            onClick={() => setShowDetailModal(true)}
            className="relative flex items-center gap-2.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            title={`Tokens : ${formatExactTokenCount(tokenUsage.totalTokens)} · Contexte : ${formatExactTokenCount(promptContext.currentSize)} / ${formatExactTokenCount(promptContext.maxSize)}`}
          >
            <span className="flex items-center gap-1 tabular-nums font-semibold">
              <Hash size={10} className="opacity-50" />
              {tokenUsage.totalTokens > 0 ? formatTokenCount(tokenUsage.totalTokens) : '—'}
            </span>
            <span className="flex items-center gap-1 tabular-nums font-semibold">
              <FileText size={10} className="opacity-50" />
              {formatTokenCount(promptContext.currentSize)}/{formatTokenCount(promptContext.maxSize)}
            </span>
            {suggestion && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-warning)' }} />
            )}
          </button>

          {/* Séparateur */}
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-base)', opacity: 0.4 }} />

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

          {/* Séparateur */}
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-base)', opacity: 0.4 }} />

          {/* Reset — discret, visible on hover */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-all duration-300 hover:bg-[var(--color-warning-subtle)]"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-warning)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            title="Réinitialiser le sandbox"
          >
            <RefreshCcw size={10} strokeWidth={1.8} />
            <span className="hidden sm:inline font-medium">Reset</span>
          </button>

          {/* Command palette shortcut */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }))}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono transition-colors duration-150 hover:text-primary"
            style={{ color: 'var(--text-dimmed)' }}
          >
            <kbd className="opacity-60">{modifierKey}</kbd>
            <kbd className="font-semibold">P</kbd>
          </button>
        </div>
      </div>

      {showResetConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40"
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
          <div
            className="w-full max-w-sm rounded-2xl border shadow-2xl transition-all duration-300"
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
                className="p-2 rounded-lg hover:bg-white/10 transition"
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
                <p className="text-xs text-red-500" style={{ color: 'var(--color-error)' }}>
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
                className="rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-white/10"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={resetCode.length !== 6}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--color-warning)', color: 'var(--text-primary)' }}
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && <TokenDetailModal onClose={() => setShowDetailModal(false)} />}
      {showModelPicker && <ModelPickerModal onClose={() => setShowModelPicker(false)} />}
      {showTelegramModal && (
        <TelegramStatusModal
          status={telegramStatus}
          onClose={() => setShowTelegramModal(false)}
          onStatusChange={(newStatus) => setTelegramStatus(newStatus)}
        />
      )}
    </>
  );
});
import {
  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Mic, MicOff, Power, PhoneOff, Send, Sparkles, Loader2, Radio,
  MonitorUp, MonitorX, Target, Bot, Wrench, Activity, X,
  Keyboard, Command, Zap, ListChecks,
} from 'lucide-react';
import { useLiveAPIContext } from '../context/LiveAPIContext.js';
import { useOrbState } from '../hooks/useOrbState.js';
import { useScreenShare } from '../context/ScreenShareContext.js';
import { useProfile } from '../context/UserProfileContext.js';
import {
  initActivityStore, destroyActivityStore, subscribe,
  getAgentTasks, getToolActivities,
} from '../stores/agentActivityStore.js';
import { useMissionActivity } from './orb/useMissionActivity.js';
import { MissionCard } from './orb/MissionCard.js';
import { AgentCard } from './orb/AgentCard.js';
import { ToolRow } from './orb/ToolRow.js';

/**
 * OrbLiveView — Fenêtre plein écran « présence vocale » (/orb-live).
 * Session live INDÉPENDANTE de la fenêtre principale.
 *
 * Refonte :
 *   - MASCOTTE animée (remplace l'orbe) : expressions, clignements, oreilles,
 *     antenne lumineuse, noyau pulsant, particules orbitales.
 *   - Layout en 3 zones : en-tête compact, scène centrale (mascotte + ondes +
 *     suggestions + contrôles), barre de saisie.
 *   - Drawer « Activité » à droite, masqué par défaut.
 *   - Nouvelles fonctionnalités : suggestions rapides, raccourcis clavier
 *     (Espace = micro, ⌘/Ctrl+K = focus saisie), compteur live, ondes audio.
 */

type MascotStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'muted';
type Mode = 'full' | 'ask';

const ACTIVITY_PANEL_KEY = 'Leanna_orb_activity_open';
const MODE_KEY = 'Leanna_mode';

const SUGGESTIONS: { icon: ReactNode; label: string }[] = [
  { icon: <Sparkles className="h-3.5 w-3.5" />, label: 'Résume ma journée' },
  { icon: <ListChecks className="h-3.5 w-3.5" />, label: 'Quelles sont mes tâches ?' },
  { icon: <Zap className="h-3.5 w-3.5" />, label: 'Que fais-tu en ce moment ?' },
];

/* ─────────────────────────── Sous-composants ─────────────────────────── */

function StatPill({
  icon, value, label, color,
}: { icon: ReactNode; value: number; label: string; color: string }) {
  return (
    <span
      title={label}
      aria-label={`${value} ${label}`}
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {icon}
      {value}
    </span>
  );
}

function IconButton({
  onClick, active, disabled, title, label, reduceMotion, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  label: string;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={active}
      whileHover={reduceMotion || disabled ? undefined : { scale: 1.05 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.95 }}
      className="relative flex h-12 w-12 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-ctrl)',
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
        border: `1px solid ${
          active
            ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)'
            : 'var(--border-base)'
        }`,
      }}
    >
      {children}
      {active && !reduceMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: '1px solid var(--accent-primary)' }}
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
    </motion.button>
  );
}

function AudioWave({
  level, active, color, reduceMotion, bars = 40,
}: {
  level: number;
  active: boolean;
  color: string;
  reduceMotion: boolean;
  bars?: number;
}) {
  const mults = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < bars; i++) {
      const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      arr.push(0.35 + (x - Math.floor(x)) * 0.65);
    }
    return arr;
  }, [bars]);

  return (
    <div className="flex h-12 items-center justify-center gap-[3px]" aria-hidden>
      {mults.map((m, i) => {
        const h = active ? 4 + level * 36 * m : 3;
        return (
          <motion.span
            key={i}
            className="w-[2px] rounded-full"
            style={{ backgroundColor: color, transformOrigin: 'center' }}
            animate={{ height: h, opacity: active ? 0.35 + 0.65 * m : 0.22 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.08, ease: 'linear' }
            }
          />
        );
      })}
    </div>
  );
}

function Mascot({
  amp, status, connected, accentColor, reduceMotion, onClick,
}: {
  amp: number;
  status: MascotStatus;
  connected: boolean;
  accentColor: string;
  reduceMotion: boolean;
  onClick: () => void;
}) {
  const speaking = status === 'speaking';
  const listening = status === 'listening';
  const connecting = status === 'connecting';
  const active = speaking || listening;

  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reduceMotion) return;
    let timeout: ReturnType<typeof setTimeout>;
    const loop = () => {
      timeout = setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        loop();
      }, 2000 + Math.random() * 3000);
    };
    loop();
    return () => clearTimeout(timeout);
  }, [reduceMotion]);

  const energy = Math.min(1, Math.max(0, amp));
  const glow = speaking
    ? 0.55 + energy * 0.45
    : listening
      ? 0.45
      : connecting
        ? 0.35
        : connected
          ? 0.28
          : 0.18;

  const eyeRy = blink ? 1.5 : listening ? 19 : speaking ? 15 : 17;
  const mouthRy = speaking
    ? 4 + energy * 10
    : listening
      ? 2.6
      : 3.6;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={connected ? 'Déconnecter la session' : 'Démarrer la session'}
      title={connected ? 'Déconnecter' : 'Connecter'}
      className="relative flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{ width: 280, height: 300 }}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
    >
      <motion.div
        style={{ width: 280, height: 300 }}
        animate={reduceMotion ? {} : { scale: 1 + energy * 0.045 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <svg
          viewBox="0 0 260 300"
          width={280}
          height={300}
          style={{ overflow: 'visible' }}
          role="img"
          aria-hidden
        >
          <defs>
            <radialGradient id="mascotAura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.38" />
              <stop offset="60%" stopColor={accentColor} stopOpacity="0.08" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="mascotBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bg-panel)" />
              <stop offset="100%" stopColor="var(--bg-secondary)" />
            </linearGradient>
          </defs>

          {/* Aura pulsante */}
          <motion.circle
            cx="130"
            cy="150"
            r="130"
            fill="url(#mascotAura)"
            animate={
              reduceMotion
                ? { opacity: glow }
                : { opacity: [glow * 0.7, glow, glow * 0.7], scale: [1, 1.04, 1] }
            }
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />

          {/* Particules orbitales */}
          {active && !reduceMotion &&
            Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const x = 130 + Math.cos(angle) * 100;
              const y = 150 + Math.sin(angle) * 100;
              return (
                <motion.circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={accentColor}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1, 0.4] }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    delay: i * 0.3,
                    ease: 'easeInOut',
                  }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              );
            })}

          {/* Corps flottant */}
          <motion.g
            animate={reduceMotion ? {} : { y: [0, -7, 0] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* Antenne */}
            <line
              x1="130"
              y1="80"
              x2="130"
              y2="46"
              stroke="var(--border-strong)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="130" cy="38" r="16" fill={accentColor} opacity={glow * 0.35} />
            <motion.circle
              cx="130"
              cy="38"
              r="8"
              fill={accentColor}
              animate={
                reduceMotion
                  ? {}
                  : { r: [7, 9, 7], opacity: [0.85, 1, 0.85] }
              }
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Oreilles */}
            <path
              d="M 78 96 L 60 44 Q 58 38 64 42 L 114 82 Z"
              fill="var(--bg-panel)"
              stroke="var(--border-base)"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M 182 96 L 200 44 Q 202 38 196 42 L 146 82 Z"
              fill="var(--bg-panel)"
              stroke="var(--border-base)"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path d="M 82 90 L 70 56 L 106 82 Z" fill={accentColor} opacity="0.25" />
            <path d="M 178 90 L 190 56 L 154 82 Z" fill={accentColor} opacity="0.25" />

            {/* Bras */}
            <motion.ellipse
              cx="72"
              cy="228"
              rx="13"
              ry="22"
              fill="url(#mascotBody)"
              stroke="var(--border-base)"
              strokeWidth="3"
              animate={
                reduceMotion
                  ? {}
                  : speaking
                    ? { rotate: [-10, 10, -10] }
                    : { rotate: [-3, 3, -3] }
              }
              transition={{
                duration: speaking ? 0.9 : 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            <motion.ellipse
              cx="188"
              cy="228"
              rx="13"
              ry="22"
              fill="url(#mascotBody)"
              stroke="var(--border-base)"
              strokeWidth="3"
              animate={
                reduceMotion
                  ? {}
                  : speaking
                    ? { rotate: [10, -10, 10] }
                    : { rotate: [3, -3, 3] }
              }
              transition={{
                duration: speaking ? 0.9 : 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />

            {/* Corps */}
            <rect
              x="84"
              y="196"
              width="92"
              height="88"
              rx="40"
              fill="url(#mascotBody)"
              stroke="var(--border-base)"
              strokeWidth="3"
            />

            {/* Noyau */}
            <motion.circle
              cx="130"
              cy="242"
              r="18"
              fill={accentColor}
              animate={
                reduceMotion
                  ? { opacity: 0.4 + energy * 0.4 }
                  : {
                      opacity: [0.35 + energy * 0.4, 0.7 + energy * 0.3, 0.35 + energy * 0.4],
                      r: [16, 20, 16],
                    }
              }
              transition={{
                duration: speaking ? 0.9 : 2.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            <circle cx="130" cy="242" r="9" fill="var(--bg-base)" opacity="0.55" />

            {/* Tête */}
            <rect
              x="62"
              y="78"
              width="136"
              height="126"
              rx="58"
              fill="url(#mascotBody)"
              stroke="var(--border-base)"
              strokeWidth="3"
            />

            {/* Yeux */}
            <motion.ellipse
              cx="102"
              cy="130"
              rx="15"
              fill="var(--text-primary)"
              animate={{ ry: eyeRy }}
              transition={{ duration: 0.1 }}
            />
            <motion.ellipse
              cx="158"
              cy="130"
              rx="15"
              fill="var(--text-primary)"
              animate={{ ry: eyeRy }}
              transition={{ duration: 0.1 }}
            />
            {!blink && (
              <>
                <circle cx="106" cy="124" r="4" fill="#fff" opacity="0.9" />
                <circle cx="162" cy="124" r="4" fill="#fff" opacity="0.9" />
              </>
            )}

            {/* Joues */}
            <ellipse cx="76" cy="158" rx="10" ry="6" fill={accentColor} opacity="0.32" />
            <ellipse cx="184" cy="158" rx="10" ry="6" fill={accentColor} opacity="0.32" />

            {/* Bouche */}
            <motion.ellipse
              cx="130"
              cy="172"
              rx="9"
              fill="var(--text-primary)"
              animate={{ ry: mouthRy, opacity: speaking ? 0.9 : 0.7 }}
              transition={{ duration: 0.12 }}
            />
          </motion.g>
        </svg>
      </motion.div>
    </motion.button>
  );
}

/* ─────────────────────────── Composant principal ─────────────────────────── */

export default function OrbLiveView() {
  const reduceMotion = useReducedMotion() ?? false;
  const { profile } = useProfile();
  const orb = useOrbState();
  const { status, connect, disconnect, muted, toggleMute, sendTextMessage } = useLiveAPIContext();
  const { isSharing, toggleScreenShare } = useScreenShare();
  const inputRef = useRef<HTMLInputElement>(null);

  // Store d'activité
  useEffect(() => {
    initActivityStore();
    return () => destroyActivityStore();
  }, []);

  const agentTasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  const toolActivities = useSyncExternalStore(subscribe, getToolActivities, getToolActivities);
  const missions = useMissionActivity();

  const [mode, setMode] = useState<Mode>(() => {
    try { return (localStorage.getItem(MODE_KEY) as Mode) || 'full'; }
    catch { return 'full'; }
  });
  const [draft, setDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(ACTIVITY_PANEL_KEY) === '1'; }
    catch { return false; }
  });
  const toggleActivity = useCallback(() => {
    setActivityOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(ACTIVITY_PANEL_KEY, next ? '1' : '0'); }
      catch { /* ignore */ }
      return next;
    });
  }, []);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAllTools, setShowAllTools] = useState(false);
  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  useEffect(() => {
    if (!connected) { setElapsed(0); return; }
    const started = Date.now();
    const id = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [connected]);

  const elapsedLabel = useMemo(() => {
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [elapsed]);

  const handleToggleConnection = useCallback(() => {
    if (connected) disconnect();
    else if (!connecting) connect([], mode);
  }, [connected, connecting, disconnect, connect, mode]);

  const handleSelectMode = useCallback((next: Mode) => {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !connected) return;
    sendTextMessage(text);
    setDraft('');
  }, [draft, connected, sendTextMessage]);

  const handleSendSuggestion = useCallback((text: string) => {
    if (!connected) return;
    sendTextMessage(text);
    inputRef.current?.focus();
  }, [connected, sendTextMessage]);

  // Raccourcis clavier : Espace = mute, ⌘/Ctrl+K = focus input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.key === ' ' && !typing && connected) {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connected, toggleMute]);

  const vizLevel = orb.isSpeaking ? orb.outputLevel : orb.inputLevel;

  const mascotStatus: MascotStatus = useMemo(() => {
    if (connecting) return 'connecting';
    if (!connected) return 'idle';
    if (orb.isSpeaking) return 'speaking';
    if (muted) return 'muted';
    if (orb.isListening) return 'listening';
    return 'idle';
  }, [connecting, connected, orb.isSpeaking, orb.isListening, muted]);

  // Données dérivées
  const sortedAgents = useMemo(() => {
    const rank: Record<string, number> = { running: 0, pending: 1, failed: 2, completed: 3, cancelled: 4 };
    return [...agentTasks].sort(
      (a, b) => (rank[a.status] - rank[b.status]) || (b.timestamp - a.timestamp),
    );
  }, [agentTasks]);

  const allToolsReversed = useMemo(() => [...toolActivities].reverse(), [toolActivities]);
  const recentTools = useMemo(
    () => (showAllTools ? allToolsReversed.slice(0, 30) : allToolsReversed.slice(0, 8)),
    [allToolsReversed, showAllTools],
  );
  const activeMissions = useMemo(
    () => missions.filter(m => m.status === 'in_progress'),
    [missions],
  );
  const runningAgentsCount = useMemo(
    () => sortedAgents.filter(a => a.status === 'running' || a.status === 'pending').length,
    [sortedAgents],
  );
  const runningToolsCount = useMemo(
    () => toolActivities.filter(t => t.status === 'running').length,
    [toolActivities],
  );

  const hasActivity =
    sortedAgents.length > 0 || recentTools.length > 0 || activeMissions.length > 0;
  const liveCount = activeMissions.length + runningAgentsCount + runningToolsCount;

  const subtitle = !connected
    ? 'Clique sur la mascotte ou « Connecter » pour démarrer'
    : orb.isSpeaking
      ? `${profile.aiName || 'Leanna'} répond…`
      : muted
        ? 'Micro coupé'
        : orb.isListening
          ? 'À l\'écoute…'
          : 'En ligne';

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* ───────────── Colonne principale ───────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête (draggable Electron) */}
        <header
          className="flex flex-shrink-0 items-center justify-between px-4 py-3"
          style={{
            borderBottom: '1px solid var(--border-base)',
            backgroundColor: 'var(--bg-sidebar)',
            WebkitAppRegion: 'drag',
          } as never}
        >
          <div className="flex items-center gap-2.5">
            <motion.span
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)]"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
              animate={reduceMotion ? {} : { rotate: [0, 6, -6, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Radio className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
            </motion.span>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {profile.aiName || 'Leanna'}
              </span>
              <span
                className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.22em]"
                style={{ color: 'var(--text-dimmed)' }}
              >
                Présence vocale
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as never}
          >
            {connected && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-md px-2 py-1 font-mono text-xs tabular-nums"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-ctrl)' }}
              >
                {elapsedLabel}
              </motion.span>
            )}

            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: connected
                  ? 'var(--color-success-subtle)'
                  : connecting
                    ? 'var(--color-warning-subtle)'
                    : 'var(--bg-secondary)',
                color: connected
                  ? 'var(--color-success)'
                  : connecting
                    ? 'var(--color-warning)'
                    : 'var(--text-dimmed)',
              }}
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: 'currentColor' }}
                animate={
                  reduceMotion || !(connected || connecting)
                    ? {}
                    : { opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }
                }
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              {orb.statusLabel}
            </span>

            <button
              type="button"
              onClick={toggleActivity}
              title="Afficher / masquer l'activité"
              aria-label="Basculer le panneau d'activité"
              aria-pressed={activityOpen}
              className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: activityOpen ? 'var(--accent-subtle)' : 'transparent',
                color: activityOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: `1px solid ${
                  activityOpen
                    ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)'
                    : 'var(--border-base)'
                }`,
              }}
            >
              <Activity className="h-4 w-4" />
              {!activityOpen && liveCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    boxShadow: '0 0 0 2px var(--bg-sidebar)',
                  }}
                >
                  {liveCount}
                </motion.span>
              )}
            </button>
          </div>
        </header>

        {/* Scène centrale */}
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-4">
          <Mascot
            amp={orb.amp}
            status={mascotStatus}
            connected={connected}
            accentColor={orb.accentColor}
            reduceMotion={reduceMotion}
            onClick={handleToggleConnection}
          />

          <div className="flex flex-col items-center gap-2">
            <AudioWave
              level={vizLevel}
              color={orb.accentColor}
              active={connected}
              reduceMotion={reduceMotion}
            />
            <AnimatePresence mode="wait">
              <motion.span
                key={subtitle}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                {subtitle}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Suggestions rapides */}
          <AnimatePresence>
            {connected && !draft && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex flex-wrap items-center justify-center gap-2"
              >
                {SUGGESTIONS.map(s => (
                  <motion.button
                    key={s.label}
                    type="button"
                    onClick={() => handleSendSuggestion(s.label)}
                    whileHover={reduceMotion ? undefined : { y: -1 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-ctrl)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-base)',
                    }}
                  >
                    <span style={{ color: 'var(--accent-primary)' }}>{s.icon}</span>
                    {s.label}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Contrôles */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <motion.button
              type="button"
              onClick={handleToggleConnection}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              disabled={connecting}
              className="flex items-center gap-2 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-semibold transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: connected
                  ? 'color-mix(in srgb, var(--color-error) 14%, transparent)'
                  : 'var(--accent-primary)',
                color: connected ? 'var(--color-error)' : '#fff',
                border: connected
                  ? '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)'
                  : '1px solid transparent',
                boxShadow: connected ? 'none' : 'var(--shadow-sm)',
              }}
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : connected ? (
                <PhoneOff className="h-4 w-4" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              {connecting ? 'Connexion…' : connected ? 'Déconnecter' : 'Connecter'}
            </motion.button>

            <IconButton
              onClick={toggleMute}
              disabled={!connected}
              active={!muted && connected}
              title={muted ? 'Réactiver le micro  (Espace)' : 'Couper le micro  (Espace)'}
              label={muted ? 'Réactiver le micro' : 'Couper le micro'}
              reduceMotion={reduceMotion}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </IconButton>

            <IconButton
              onClick={toggleScreenShare}
              active={isSharing}
              title={isSharing ? "Arrêter le partage d'écran" : "Partager l'écran"}
              label={isSharing ? "Arrêter le partage d'écran" : "Partager l'écran"}
              reduceMotion={reduceMotion}
            >
              {isSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            </IconButton>

            <div
              className="relative flex items-center rounded-[var(--radius-lg)] p-1"
              style={{ backgroundColor: 'var(--bg-ctrl)', border: '1px solid var(--border-base)' }}
            >
              {(['full', 'ask'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectMode(m)}
                  title={
                    m === 'full'
                      ? 'Mode Full — agit directement'
                      : "Mode Ask — demande avant d'agir"
                  }
                  className="relative rounded-[var(--radius-md)] px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{
                    color: mode === m ? '#fff' : 'var(--text-muted)',
                    zIndex: 1,
                  }}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-[var(--radius-md)]"
                      style={{ backgroundColor: 'var(--accent-primary)', zIndex: -1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  {m === 'full' ? 'Full' : 'Ask'}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Barre de saisie */}
        <footer
          className="flex flex-shrink-0 flex-col gap-2 px-5 py-4"
          style={{
            borderTop: '1px solid var(--border-base)',
            backgroundColor: 'var(--bg-sidebar)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
                  else if (e.key === 'Escape') { setDraft(''); }
                }}
                placeholder={
                  connected
                    ? 'Demande une action…  (Entrée pour envoyer)'
                    : 'Connecte-toi pour écrire…'
                }
                disabled={!connected}
                className="w-full rounded-[var(--radius-lg)] px-4 py-3 pr-20 text-sm outline-none transition-all disabled:opacity-50 focus:ring-2 focus:ring-[var(--accent-primary)]"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
              />
              <span
                className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[10px] font-medium"
                style={{ color: 'var(--text-dimmed)' }}
              >
                <Command className="h-3 w-3" />
                <span>K</span>
              </span>
            </div>

            <motion.button
              type="button"
              onClick={handleSend}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              disabled={!connected || !draft.trim()}
              title="Envoyer"
              aria-label="Envoyer le message"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-lg)] transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Send className="h-4 w-4" />
            </motion.button>
          </div>

          {connected && (
            <div
              className="flex items-center justify-center gap-3 text-[10px] font-medium"
              style={{ color: 'var(--text-dimmed)' }}
            >
              <span className="flex items-center gap-1">
                <Keyboard className="h-3 w-3" />
                <kbd className="rounded border px-1" style={{ borderColor: 'var(--border-base)' }}>
                  Espace
                </kbd>
                micro
              </span>
              <span className="opacity-50">·</span>
              <span>
                <kbd className="rounded border px-1" style={{ borderColor: 'var(--border-base)' }}>
                  Échap
                </kbd>{' '}
                effacer
              </span>
            </div>
          )}
        </footer>
      </div>

      {/* ───────────── Drawer d'activité (masqué par défaut) ───────────── */}
      <AnimatePresence>
        {activityOpen && (
          <motion.aside
            key="activity-drawer"
            initial={reduceMotion ? { opacity: 0 } : { x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: 340, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="flex h-full w-[340px] flex-shrink-0 flex-col"
            style={{
              borderLeft: '1px solid var(--border-base)',
              backgroundColor: 'var(--bg-secondary)',
            }}
            aria-label="Activité des agents et missions"
          >
            {/* En-tête du drawer */}
            <div
              className="flex flex-shrink-0 items-center gap-2 px-4 py-3"
              style={{
                borderBottom: '1px solid var(--border-base)',
                backgroundColor: 'var(--bg-sidebar)',
              }}
            >
              <Activity className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Activité
              </span>
              <div className="ml-auto flex items-center gap-2.5">
                {activeMissions.length > 0 && (
                  <StatPill
                    icon={<Target className="h-3 w-3" />}
                    value={activeMissions.length}
                    label="Missions en cours"
                    color="var(--accent-primary)"
                  />
                )}
                {runningAgentsCount > 0 && (
                  <StatPill
                    icon={<Bot className="h-3 w-3" />}
                    value={runningAgentsCount}
                    label="Agents actifs"
                    color="var(--color-accent-alt)"
                  />
                )}
                {runningToolsCount > 0 && (
                  <StatPill
                    icon={<Wrench className="h-3 w-3" />}
                    value={runningToolsCount}
                    label="Outils en exécution"
                    color="var(--color-success)"
                  />
                )}
                <button
                  type="button"
                  onClick={toggleActivity}
                  title="Fermer"
                  aria-label="Fermer le panneau d'activité"
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              {!hasActivity ? (
                <div
                  className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  <motion.span
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      border: '1px solid var(--border-base)',
                    }}
                    animate={reduceMotion ? {} : { rotate: [0, 8, -8, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </motion.span>
                  <p className="max-w-[220px] text-xs leading-relaxed">
                    {connected
                      ? "Aucune action en cours. Demande une tâche à l'assistant."
                      : 'Connecte-toi pour suivre les actions des agents et missions.'}
                  </p>
                </div>
              ) : (
                <>
                  {activeMissions.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3
                        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-dimmed)' }}
                      >
                        <Target className="h-3 w-3" />
                        Missions
                      </h3>
                      {activeMissions.map(m => (
                        <MissionCard
                          key={m.missionId}
                          m={m}
                          isOpen={!!expanded[`mission:${m.missionId}`]}
                          onToggle={() => toggleExpanded(`mission:${m.missionId}`)}
                        />
                      ))}
                    </section>
                  )}

                  {sortedAgents.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3
                        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-dimmed)' }}
                      >
                        <Bot className="h-3 w-3" />
                        Agents
                      </h3>
                      <AnimatePresence initial={false}>
                        {sortedAgents.map(task => (
                          <AgentCard
                            key={task.id}
                            task={task}
                            isOpen={!!expanded[`agent:${task.id}`]}
                            onToggle={() => toggleExpanded(`agent:${task.id}`)}
                            reduceMotion={reduceMotion}
                          />
                        ))}
                      </AnimatePresence>
                    </section>
                  )}

                  {recentTools.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <h3
                          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--text-dimmed)' }}
                        >
                          <Wrench className="h-3 w-3" />
                          Actions récentes
                        </h3>
                        <span
                          className="font-mono text-xs"
                          style={{ color: 'var(--text-dimmed)' }}
                        >
                          {allToolsReversed.length}
                        </span>
                      </div>
                      <AnimatePresence initial={false}>
                        {recentTools.map(tool => (
                          <ToolRow
                            key={tool.id}
                            tool={tool}
                            isOpen={!!expanded[`tool:${tool.id}`]}
                            onToggle={() => toggleExpanded(`tool:${tool.id}`)}
                            reduceMotion={reduceMotion}
                          />
                        ))}
                      </AnimatePresence>
                      {allToolsReversed.length > 8 && (
                        <button
                          type="button"
                          onClick={() => setShowAllTools(v => !v)}
                          className="self-start rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          {showAllTools
                            ? 'Réduire'
                            : `Voir plus (${allToolsReversed.length - recentTools.length})`}
                        </button>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
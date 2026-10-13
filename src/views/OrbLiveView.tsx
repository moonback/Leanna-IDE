import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Mic, MicOff, Power, PhoneOff, Send, Loader2, Radio,
  MonitorUp, MonitorX, Activity, MessageSquare, Captions, CaptionsOff, Keyboard, Smile, Circle, Gauge,
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
import { AudioBars } from './orb/AudioBars.js';
import { Orb } from './orb/Orb.js';
import { Mascot } from './orb/Mascot.js';
import { AmbientBackground } from './orb/AmbientBackground.js';
import { LiveCaption } from './orb/LiveCaption.js';
import { QuickPrompts } from './orb/QuickPrompts.js';
import { LiveDrawer, type LivePanel } from './orb/LiveDrawer.js';
import { HeaderButton, isTypingTarget, readStorage, useMediaQuery, writeStorage } from './orb/liveUi.js';
import { ShortcutsOverlay } from './orb/ShortcutsOverlay.js';
import { CircleButton } from './orb/CircleButton.js';

/**
 * OrbLiveView — Fenêtre « présence vocale » (/orb-live).
 * Session live INDÉPENDANTE de la fenêtre principale.
 *
 * Mise en page :
 *   - Fond d'ambiance animé teinté selon l'état de l'assistant.
 *   - Barre de titre draggable (identité, minuteur, statut, latence, panneaux).
 *   - Scène centrale : mascotte expressive (ou orbe classique), sous-titres en
 *     direct, dock de contrôles flottant.
 *   - Zone de saisie avec suggestions rapides.
 *   - Drawer à onglets (Activité / Conversation) — MASQUÉ PAR DÉFAUT. Panneau
 *     latéral sur grand écran, superposé sur fenêtre étroite.
 *   - Raccourcis clavier (« ? » pour l'aide).
 *
 * Les composants de présentation sont extraits dans ./orb/*.
 */

const PANEL_KEY = 'Leanna_orb_activity_open';
const AVATAR_KEY = 'Leanna_orb_avatar';
const CAPTIONS_KEY = 'Leanna_orb_captions';

type Panel = LivePanel;
type Avatar = 'mascot' | 'orb';

export default function OrbLiveView() {
  const reduceMotion = useReducedMotion() ?? false;
  const { profile } = useProfile();
  const aiName = profile.aiName || 'Leanna';
  const orb = useOrbState();
  const {
    status, connect, disconnect, muted, toggleMute, sendTextMessage,
    transcript, clearTranscript, lastLatencyMs,
  } = useLiveAPIContext();
  const { isSharing, toggleScreenShare } = useScreenShare();
  const wide = useMediaQuery('(min-width: 900px)');
  const inputRef = useRef<HTMLInputElement>(null);

  // Store d'activité : écoute les événements agents/outils de CETTE fenêtre.
  useEffect(() => {
    initActivityStore();
    return () => destroyActivityStore();
  }, []);

  const agentTasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  const toolActivities = useSyncExternalStore(subscribe, getToolActivities, getToolActivities);
  const missions = useMissionActivity();

  const [mode, setMode] = useState<'full' | 'ask'>(() => (readStorage('Leanna_mode') as 'full' | 'ask') || 'full');
  const [draft, setDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [avatar, setAvatar] = useState<Avatar>(() => (readStorage(AVATAR_KEY) === 'orb' ? 'orb' : 'mascot'));
  const [captions, setCaptions] = useState<boolean>(() => readStorage(CAPTIONS_KEY) !== '0');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  // Drawer — MASQUÉ PAR DÉFAUT (l'ancienne valeur « 1 » rouvre l'onglet Activité).
  const [panel, setPanel] = useState<Panel | null>(() => {
    const v = readStorage(PANEL_KEY);
    return v === '1' || v === 'activity' ? 'activity' : v === 'conversation' ? 'conversation' : null;
  });
  const openPanel = useCallback((next: Panel | null) => {
    setPanel(prev => {
      const value = prev === next ? null : next;
      writeStorage(PANEL_KEY, value ?? '0');
      return value;
    });
  }, []);

  const toggleAvatar = useCallback(() => {
    setAvatar(prev => {
      const next = prev === 'mascot' ? 'orb' : 'mascot';
      writeStorage(AVATAR_KEY, next);
      return next;
    });
  }, []);
  const toggleCaptions = useCallback(() => {
    setCaptions(prev => { writeStorage(CAPTIONS_KEY, prev ? '0' : '1'); return !prev; });
  }, []);

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  useEffect(() => {
    if (!connected) { setElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [connected]);

  const elapsedLabel = useMemo(() => {
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [elapsed]);

  // Fête : à la connexion (salut) et à chaque agent qui termine sa tâche.
  const triggerCelebrate = useCallback((ms: number) => {
    setCelebrate(true);
    const id = setTimeout(() => setCelebrate(false), ms);
    return () => { clearTimeout(id); setCelebrate(false); };
  }, []);
  useEffect(() => (connected ? triggerCelebrate(1400) : undefined), [connected, triggerCelebrate]);
  const completedAgents = useMemo(() => agentTasks.filter(a => a.status === 'completed').length, [agentTasks]);
  const prevCompleted = useRef(completedAgents);
  useEffect(() => {
    const prev = prevCompleted.current;
    prevCompleted.current = completedAgents;
    return completedAgents > prev && connected ? triggerCelebrate(1800) : undefined;
  }, [completedAgents, connected, triggerCelebrate]);

  const handleToggleConnection = useCallback(() => {
    if (connected) disconnect();
    else if (!connecting) connect([], mode);
  }, [connected, connecting, disconnect, connect, mode]);

  const handleSelectMode = useCallback((next: 'full' | 'ask') => {
    setMode(next);
    writeStorage('Leanna_mode', next);
  }, []);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || !connected) return;
    sendTextMessage(text);
    setDraft('');
  }, [connected, sendTextMessage]);

  // Raccourcis clavier (ignorés pendant la saisie).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        else if (panel) openPanel(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const actions: Record<string, () => void> = {
        c: handleToggleConnection,
        m: () => { if (connected) toggleMute(); },
        s: toggleScreenShare,
        a: () => openPanel('activity'),
        h: () => openPanel('conversation'),
        t: toggleCaptions,
        v: toggleAvatar,
        '/': () => inputRef.current?.focus(),
        '?': () => setShowShortcuts(v => !v),
      };
      const action = actions[k];
      if (action) { e.preventDefault(); action(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showShortcuts, panel, openPanel, handleToggleConnection, connected, toggleMute, toggleScreenShare, toggleCaptions, toggleAvatar]);

  const vizLevel = orb.isSpeaking ? orb.outputLevel : orb.inputLevel;

  // Données dérivées.
  const sortedAgents = useMemo(() => {
    const rank: Record<string, number> = { running: 0, pending: 1, failed: 2, completed: 3, cancelled: 4 };
    return [...agentTasks].sort((a, b) => (rank[a.status] - rank[b.status]) || (b.timestamp - a.timestamp));
  }, [agentTasks]);
  const activeMissions = useMemo(() => missions.filter(m => m.status === 'in_progress'), [missions]);

  const runningAgentsCount = useMemo(
    () => sortedAgents.filter(a => a.status === 'running' || a.status === 'pending').length,
    [sortedAgents],
  );
  const runningToolsCount = useMemo(() => toolActivities.filter(t => t.status === 'running').length, [toolActivities]);

  const liveCount = activeMissions.length + runningAgentsCount + runningToolsCount;
  const lastEntry = transcript.length > 0 ? transcript[transcript.length - 1] : undefined;

  const greeting = profile.userName ? `Salut ${profile.userName} !` : 'Salut !';
  const subtitle = !connected
    ? connecting ? `${aiName} se réveille…` : 'Clique sur moi ou appuie sur « C » pour démarrer'
    : celebrate && completedAgents > 0 && elapsed > 2 ? 'Tâche terminée ✨'
    : orb.isSpeaking ? `${aiName} répond…`
    : orb.isBusy ? 'Je réfléchis…'
    : muted ? 'Micro coupé'
    : orb.isListening ? 'À l\'écoute…' : 'Je t\'écoute, parle-moi !';

  const latencyColor = lastLatencyMs == null ? 'var(--text-dimmed)'
    : lastLatencyMs < 800 ? 'var(--color-success)' : lastLatencyMs < 1600 ? 'var(--color-warning)' : 'var(--color-error)';

  return (
    <div className="relative flex h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Colonne principale */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <AmbientBackground accentColor={orb.accentColor} amp={orb.amp} active={connected} reduceMotion={reduceMotion} />

        {/* Barre de titre (draggable Electron) */}
        <header className="relative z-10 flex flex-shrink-0 items-center justify-between gap-2 px-3 py-2.5 backdrop-blur-md"
          style={{
            borderBottom: '1px solid var(--border-base)',
            backgroundColor: 'color-mix(in srgb, var(--bg-sidebar) 75%, transparent)',
            ['WebkitAppRegion' as never]: 'drag',
          }}>
          <div className="flex min-w-0 items-center gap-2.5">
            <motion.span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${orb.accentColor} 60%, white), ${orb.accentColor})` }}
              animate={reduceMotion || !connected ? undefined : { scale: 1 + Math.min(0.25, orb.amp * 0.8) }}>
              <Radio className="h-3.5 w-3.5 text-white" />
            </motion.span>
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-sm font-semibold tracking-tight">{aiName}</span>
              <span className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--text-dimmed)' }}>
                Présence vocale{connected && <span className="ml-1.5 font-mono normal-case tracking-normal tabular-nums" style={{ color: 'var(--text-muted)' }}>· {elapsedLabel}</span>}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5" style={{ ['WebkitAppRegion' as never]: 'no-drag' }}>
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: connected ? 'var(--color-success-subtle)' : connecting ? 'var(--color-warning-subtle)' : 'var(--bg-secondary)',
                color: connected ? 'var(--color-success)' : connecting ? 'var(--color-warning)' : 'var(--text-dimmed)',
              }}>
              <motion.span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }}
                animate={reduceMotion || !(connected || connecting) ? {} : { opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
              {orb.statusLabel}
            </span>
            <HeaderButton onClick={() => openPanel('conversation')} active={panel === 'conversation'} title="Conversation (H)">
              <MessageSquare className="h-4 w-4" />
            </HeaderButton>
            <HeaderButton onClick={() => openPanel('activity')} active={panel === 'activity'} title="Activité (A)" badge={panel === 'activity' ? 0 : liveCount}>
              <Activity className="h-4 w-4" />
            </HeaderButton>
            <HeaderButton onClick={() => setShowShortcuts(true)} title="Raccourcis clavier (?)">
              <Keyboard className="h-4 w-4" />
            </HeaderButton>
          </div>
        </header>

        {/* Scène centrale */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-4">
          <AnimatePresence mode="wait">
            {!connected && !connecting && (
              <motion.h1 key="greet" className="text-center text-xl font-semibold tracking-tight"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {greeting} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Je suis {aiName}.</span>
              </motion.h1>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={avatar}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, rotate: 8 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              {avatar === 'mascot' ? (
                <Mascot amp={orb.amp} accentColor={orb.accentColor} status={orb.status} muted={muted} celebrate={celebrate}
                  onClick={handleToggleConnection} reduceMotion={reduceMotion} />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Orb amp={orb.amp} accentColor={orb.accentColor} status={orb.status} muted={muted} onClick={handleToggleConnection} reduceMotion={reduceMotion} />
                  <AudioBars level={vizLevel} color={orb.accentColor} active={connected} reduceMotion={reduceMotion} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col items-center gap-1">
            <AnimatePresence mode="wait">
              <motion.span key={subtitle} className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                {subtitle}
              </motion.span>
            </AnimatePresence>
            {connected && lastLatencyMs != null && (
              <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums" style={{ color: latencyColor }} title="Latence de la dernière réponse vocale">
                <Gauge className="h-3 w-3" />{Math.round(lastLatencyMs)} ms
              </span>
            )}
          </div>

          {captions && connected && <LiveCaption entry={lastEntry} aiName={aiName} reduceMotion={reduceMotion} />}

          {/* Dock de contrôles */}
          <motion.div layout
            className="flex flex-wrap items-center justify-center gap-2 rounded-[22px] p-2 backdrop-blur-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--bg-panel) 72%, transparent)',
              border: '1px solid var(--border-base)',
              boxShadow: 'var(--shadow-lg)',
            }}>
            <motion.button
              type="button" onClick={handleToggleConnection} whileTap={reduceMotion ? undefined : { scale: 0.96 }} disabled={connecting}
              title={connected ? 'Déconnecter (C)' : 'Connecter (C)'}
              className="relative flex h-12 items-center gap-2 overflow-hidden rounded-[var(--radius-lg)] px-5 text-sm font-semibold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: connected ? 'color-mix(in srgb, var(--color-error) 14%, transparent)' : 'var(--accent-primary)',
                color: connected ? 'var(--color-error)' : '#fff',
                border: connected ? '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)' : '1px solid transparent',
                boxShadow: connected ? 'none' : 'var(--shadow-glow)',
              }}>
              {!connected && !reduceMotion && (
                <motion.span className="pointer-events-none absolute inset-y-0 w-1/3"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }}
                  animate={{ x: ['-120%', '320%'] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2 }} />
              )}
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <PhoneOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              {connecting ? 'Connexion…' : connected ? 'Raccrocher' : 'Connecter'}
            </motion.button>

            <CircleButton onClick={toggleMute} disabled={!connected} active={!muted && connected}
              title={muted ? 'Réactiver le micro (M)' : 'Couper le micro (M)'} label={muted ? 'Réactiver le micro' : 'Couper le micro'} reduceMotion={reduceMotion}>
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </CircleButton>

            <CircleButton onClick={toggleScreenShare} active={isSharing}
              title={isSharing ? 'Arrêter le partage d\'écran (S)' : 'Partager l\'écran (S)'} label={isSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'} reduceMotion={reduceMotion}>
              {isSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            </CircleButton>

            <CircleButton onClick={toggleCaptions} active={captions}
              title={captions ? 'Masquer les sous-titres (T)' : 'Afficher les sous-titres (T)'} label="Sous-titres en direct" reduceMotion={reduceMotion}>
              {captions ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
            </CircleButton>

            <CircleButton onClick={toggleAvatar} active={false}
              title={avatar === 'mascot' ? 'Passer à l\'orbe (V)' : 'Passer à la mascotte (V)'} label="Changer d'avatar" reduceMotion={reduceMotion}>
              {avatar === 'mascot' ? <Circle className="h-4 w-4" /> : <Smile className="h-4 w-4" />}
            </CircleButton>

            <div className="relative flex h-12 items-center rounded-[var(--radius-lg)] p-1" style={{ backgroundColor: 'var(--bg-ctrl)', border: '1px solid var(--border-base)' }}>
              {(['full', 'ask'] as const).map(m => (
                <button key={m} type="button" onClick={() => handleSelectMode(m)} aria-pressed={mode === m}
                  title={m === 'full' ? 'Mode Full — agit directement' : 'Mode Ask — demande avant d\'agir'}
                  className="relative h-full rounded-[var(--radius-md)] px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ color: mode === m ? '#fff' : 'var(--text-muted)' }}>
                  {mode === m && (
                    <motion.span layoutId="orb-mode" className="absolute inset-0 rounded-[var(--radius-md)]" style={{ backgroundColor: 'var(--accent-primary)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                  )}
                  <span className="relative">{m === 'full' ? 'Full' : 'Ask'}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Saisie texte */}
        <div className="relative z-10 flex flex-shrink-0 flex-col gap-2.5 px-4 pb-4 pt-3 backdrop-blur-md"
          style={{ borderTop: '1px solid var(--border-base)', backgroundColor: 'color-mix(in srgb, var(--bg-sidebar) 75%, transparent)' }}>
          <AnimatePresence>
            {connected && !draft && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <QuickPrompts onPick={send} disabled={!connected} reduceMotion={reduceMotion} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text" value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); send(draft); }
                  else if (e.key === 'Escape') { setDraft(''); e.currentTarget.blur(); }
                }}
                placeholder={connected ? 'Demande une action…  (Entrée pour envoyer)' : 'Connecte-toi pour écrire…'}
                disabled={!connected}
                aria-label="Message à l'assistant"
                className="w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none transition-all disabled:opacity-50 focus:ring-2 focus:ring-[var(--accent-primary)]"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              {connected && !draft && (
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded px-1.5 font-mono text-[10px]"
                  style={{ border: '1px solid var(--border-base)', color: 'var(--text-dimmed)' }}>/</kbd>
              )}
            </div>
            <motion.button
              type="button" onClick={() => send(draft)} whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              whileHover={reduceMotion || !draft.trim() ? undefined : { rotate: -12 }}
              disabled={!connected || !draft.trim()} title="Envoyer" aria-label="Envoyer le message"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-lg)] transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', boxShadow: draft.trim() ? 'var(--shadow-glow)' : 'var(--shadow-sm)' }}>
              <Send className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* ───────────── Drawer à onglets (masqué par défaut) ───────────── */}
      <AnimatePresence>
        {panel && !wide && (
          <motion.div key="drawer-backdrop" className="absolute inset-0 z-20" onClick={() => openPanel(null)}
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 55%, transparent)', backdropFilter: 'blur(3px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        )}
        {panel && (
          <motion.aside
            key="drawer"
            initial={reduceMotion ? { opacity: 0 } : { x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={`flex h-full flex-col ${wide ? 'relative w-[360px] flex-shrink-0' : 'absolute right-0 top-0 z-30 w-[min(360px,92vw)] shadow-2xl'}`}
            style={{ borderLeft: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
            aria-label={panel === 'activity' ? 'Activité des agents et missions' : 'Historique de conversation'}
          >
            <LiveDrawer panel={panel} onSelect={openPanel} connected={connected} aiName={aiName}
              transcript={transcript} onClearTranscript={clearTranscript}
              missions={activeMissions} agents={sortedAgents} tools={toolActivities}
              runningAgentsCount={runningAgentsCount} runningToolsCount={runningToolsCount} reduceMotion={reduceMotion} />
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} reduceMotion={reduceMotion} />}
      </AnimatePresence>
    </div>
  );
}

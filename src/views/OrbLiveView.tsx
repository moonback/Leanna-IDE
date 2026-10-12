import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Mic, MicOff, Power, PhoneOff, Send, Sparkles, Loader2, Radio,
  MonitorUp, MonitorX, Target, Bot, Wrench, Activity, X,
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
import { CircleButton } from './orb/CircleButton.js';
import { StatPill } from './orb/StatPill.js';
import { MissionCard } from './orb/MissionCard.js';
import { AgentCard } from './orb/AgentCard.js';
import { ToolRow } from './orb/ToolRow.js';

/**
 * OrbLiveView — Fenêtre plein écran « présence vocale » (/orb-live).
 * Session live INDÉPENDANTE de la fenêtre principale.
 *
 * Mise en page :
 *   - Barre de titre draggable (identité, minuteur, statut, bascule Activité).
 *   - Scène centrale : orbe réactif, visualiseur, contrôles, saisie.
 *   - Drawer « Activité » coulissant à droite — MASQUÉ PAR DÉFAUT. Missions,
 *     agents et outils, présentés de façon minimaliste.
 *
 * Les composants de présentation sont extraits dans ./orb/* pour garder cette
 * vue courte et lisible. Design aligné sur le design system (tokens CSS).
 */

const ACTIVITY_PANEL_KEY = 'Leanna_orb_activity_open';

export default function OrbLiveView() {
  const reduceMotion = useReducedMotion() ?? false;
  const { profile } = useProfile();
  const orb = useOrbState();
  const { status, connect, disconnect, muted, toggleMute, sendTextMessage } = useLiveAPIContext();
  const { isSharing, toggleScreenShare } = useScreenShare();

  // Store d'activité : écoute les événements agents/outils de CETTE fenêtre.
  useEffect(() => {
    initActivityStore();
    return () => destroyActivityStore();
  }, []);

  const agentTasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  const toolActivities = useSyncExternalStore(subscribe, getToolActivities, getToolActivities);
  const missions = useMissionActivity();

  const [mode, setMode] = useState<'full' | 'ask'>(() => {
    try { return (localStorage.getItem('Leanna_mode') as 'full' | 'ask') || 'full'; } catch { return 'full'; }
  });
  const [draft, setDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);

  // Drawer d'activité — MASQUÉ PAR DÉFAUT (restauré depuis localStorage si ouvert avant).
  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(ACTIVITY_PANEL_KEY) === '1'; } catch { return false; }
  });
  const toggleActivity = useCallback(() => {
    setActivityOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(ACTIVITY_PANEL_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Expansion des cartes + nombre d'outils affichés.
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
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
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

  const handleSelectMode = useCallback((next: 'full' | 'ask') => {
    setMode(next);
    try { localStorage.setItem('Leanna_mode', next); } catch { /* ignore */ }
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !connected) return;
    sendTextMessage(text);
    setDraft('');
  }, [draft, connected, sendTextMessage]);

  const vizLevel = orb.isSpeaking ? orb.outputLevel : orb.inputLevel;

  // Données dérivées.
  const sortedAgents = useMemo(() => {
    const rank: Record<string, number> = { running: 0, pending: 1, failed: 2, completed: 3, cancelled: 4 };
    return [...agentTasks].sort((a, b) => (rank[a.status] - rank[b.status]) || (b.timestamp - a.timestamp));
  }, [agentTasks]);
  const allToolsReversed = useMemo(() => [...toolActivities].reverse(), [toolActivities]);
  const recentTools = useMemo(
    () => (showAllTools ? allToolsReversed.slice(0, 30) : allToolsReversed.slice(0, 8)),
    [allToolsReversed, showAllTools],
  );
  const activeMissions = useMemo(() => missions.filter(m => m.status === 'in_progress'), [missions]);

  const runningAgentsCount = useMemo(
    () => sortedAgents.filter(a => a.status === 'running' || a.status === 'pending').length,
    [sortedAgents],
  );
  const runningToolsCount = useMemo(() => toolActivities.filter(t => t.status === 'running').length, [toolActivities]);

  const hasActivity = sortedAgents.length > 0 || recentTools.length > 0 || activeMissions.length > 0;
  const liveCount = activeMissions.length + runningAgentsCount + runningToolsCount;

  const subtitle = !connected
    ? 'Clique sur l\'orbe ou « Connecter » pour démarrer'
    : orb.isSpeaking ? `${profile.aiName || 'Leanna'} répond…`
    : muted ? 'Micro coupé'
    : orb.isListening ? 'À l\'écoute…' : 'En ligne';

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Colonne principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre de titre (draggable Electron) */}
        <header className="flex flex-shrink-0 items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-sidebar)', ['WebkitAppRegion' as never]: 'drag' }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)]" style={{ backgroundColor: 'var(--accent-subtle)' }}>
              <Radio className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{profile.aiName || 'Leanna'}</span>
              <span className="mt-0.5 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--text-dimmed)' }}>Présence vocale</span>
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ ['WebkitAppRegion' as never]: 'no-drag' }}>
            {connected && <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{elapsedLabel}</span>}
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: connected ? 'var(--color-success-subtle)' : connecting ? 'var(--color-warning-subtle)' : 'var(--bg-secondary)',
                color: connected ? 'var(--color-success)' : connecting ? 'var(--color-warning)' : 'var(--text-dimmed)',
              }}>
              <motion.span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }}
                animate={reduceMotion || !(connected || connecting) ? {} : { opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
              {orb.statusLabel}
            </span>

            {/* Bascule du drawer d'activité */}
            <button type="button" onClick={toggleActivity} title="Afficher / masquer l'activité" aria-label="Basculer le panneau d'activité" aria-pressed={activityOpen}
              className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: activityOpen ? 'var(--accent-subtle)' : 'transparent',
                color: activityOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: `1px solid ${activityOpen ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)' : 'var(--border-base)'}`,
              }}>
              <Activity className="h-4 w-4" />
              {!activityOpen && liveCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', boxShadow: '0 0 0 2px var(--bg-sidebar)' }}>
                  {liveCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Scène centrale */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-6 py-6">
          <Orb amp={orb.amp} accentColor={orb.accentColor} status={orb.status} muted={muted} onClick={handleToggleConnection} reduceMotion={reduceMotion} />

          <div className="flex flex-col items-center gap-2.5">
            <AudioBars level={vizLevel} color={orb.accentColor} active={connected} reduceMotion={reduceMotion} />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
          </div>

          {/* Contrôles */}
          <div className="flex items-center gap-3">
            <motion.button
              type="button" onClick={handleToggleConnection} whileTap={reduceMotion ? undefined : { scale: 0.97 }} disabled={connecting}
              className="flex items-center gap-2 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-semibold transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: connected ? 'color-mix(in srgb, var(--color-error) 14%, transparent)' : 'var(--accent-primary)',
                color: connected ? 'var(--color-error)' : '#fff',
                border: connected ? '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)' : '1px solid transparent',
                boxShadow: connected ? 'none' : 'var(--shadow-sm)',
              }}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <PhoneOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              {connecting ? 'Connexion…' : connected ? 'Déconnecter' : 'Connecter'}
            </motion.button>

            <CircleButton onClick={toggleMute} disabled={!connected} active={!muted && connected}
              title={muted ? 'Réactiver le micro' : 'Couper le micro'} label={muted ? 'Réactiver le micro' : 'Couper le micro'} reduceMotion={reduceMotion}>
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </CircleButton>

            <CircleButton onClick={toggleScreenShare} active={isSharing}
              title={isSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'} label={isSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'} reduceMotion={reduceMotion}>
              {isSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            </CircleButton>

            <div className="flex items-center rounded-[var(--radius-lg)] p-1" style={{ backgroundColor: 'var(--bg-ctrl)', border: '1px solid var(--border-base)' }}>
              {(['full', 'ask'] as const).map(m => (
                <button key={m} type="button" onClick={() => handleSelectMode(m)}
                  title={m === 'full' ? 'Mode Full — agit directement' : 'Mode Ask — demande avant d\'agir'}
                  className="rounded-[var(--radius-md)] px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ backgroundColor: mode === m ? 'var(--accent-primary)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)' }}>
                  {m === 'full' ? 'Full' : 'Ask'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Saisie texte */}
        <div className="flex flex-shrink-0 items-center gap-2.5 px-5 py-4" style={{ borderTop: '1px solid var(--border-base)', backgroundColor: 'var(--bg-sidebar)' }}>
          <input
            type="text" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } else if (e.key === 'Escape') { setDraft(''); } }}
            placeholder={connected ? 'Demande une action…  (Entrée pour envoyer)' : 'Connecte-toi pour écrire…'}
            disabled={!connected}
            className="flex-1 rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none transition-all disabled:opacity-50 focus:ring-2 focus:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
          />
          <motion.button
            type="button" onClick={handleSend} whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            disabled={!connected || !draft.trim()} title="Envoyer" aria-label="Envoyer le message"
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-lg)] transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', boxShadow: 'var(--shadow-sm)' }}>
            <Send className="h-4 w-4" />
          </motion.button>
        </div>
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
            style={{ borderLeft: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
            aria-label="Activité des agents et missions"
          >
            {/* En-tête du drawer */}
            <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-sidebar)' }}>
              <Activity className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Activité</span>
              <div className="ml-auto flex items-center gap-2.5">
                {activeMissions.length > 0 && <StatPill icon={<Target className="h-3 w-3" />} value={activeMissions.length} label="Missions en cours" color="var(--accent-primary)" />}
                {runningAgentsCount > 0 && <StatPill icon={<Bot className="h-3 w-3" />} value={runningAgentsCount} label="Agents actifs" color="var(--color-accent-alt)" />}
                {runningToolsCount > 0 && <StatPill icon={<Wrench className="h-3 w-3" />} value={runningToolsCount} label="Outils en exécution" color="var(--color-success)" />}
                <button type="button" onClick={toggleActivity} title="Fermer" aria-label="Fermer le panneau d'activité"
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ color: 'var(--text-muted)' }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar px-4 py-4">
              {!hasActivity ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <p className="max-w-[220px] text-xs leading-relaxed">
                    {connected ? 'Aucune action en cours. Demande une tâche à l\'assistant.' : 'Connecte-toi pour suivre les actions des agents et missions.'}
                  </p>
                </div>
              ) : (
                <>
                  {activeMissions.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                        <Target className="h-3 w-3" />Missions
                      </h3>
                      {activeMissions.map(m => (
                        <MissionCard key={m.missionId} m={m} isOpen={!!expanded[`mission:${m.missionId}`]} onToggle={() => toggleExpanded(`mission:${m.missionId}`)} />
                      ))}
                    </section>
                  )}

                  {sortedAgents.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                        <Bot className="h-3 w-3" />Agents
                      </h3>
                      <AnimatePresence initial={false}>
                        {sortedAgents.map(task => (
                          <AgentCard key={task.id} task={task} isOpen={!!expanded[`agent:${task.id}`]} onToggle={() => toggleExpanded(`agent:${task.id}`)} reduceMotion={reduceMotion} />
                        ))}
                      </AnimatePresence>
                    </section>
                  )}

                  {recentTools.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                          <Wrench className="h-3 w-3" />Actions récentes
                        </h3>
                        <span className="font-mono text-xs" style={{ color: 'var(--text-dimmed)' }}>{allToolsReversed.length}</span>
                      </div>
                      <AnimatePresence initial={false}>
                        {recentTools.map(tool => (
                          <ToolRow key={tool.id} tool={tool} isOpen={!!expanded[`tool:${tool.id}`]} onToggle={() => toggleExpanded(`tool:${tool.id}`)} reduceMotion={reduceMotion} />
                        ))}
                      </AnimatePresence>
                      {allToolsReversed.length > 8 && (
                        <button type="button" onClick={() => setShowAllTools(v => !v)}
                          className="self-start rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                          style={{ color: 'var(--accent-primary)' }}>
                          {showAllTools ? 'Réduire' : `Voir plus (${allToolsReversed.length - recentTools.length})`}
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

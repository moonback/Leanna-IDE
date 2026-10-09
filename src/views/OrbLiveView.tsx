import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Mic, MicOff, Power, PhoneOff, Send, Sparkles, Loader2, Radio,
} from 'lucide-react';
import { useLiveAPIContext } from '../context/LiveAPIContext.js';
import { useOrbState } from '../hooks/useOrbState.js';
import { useProfile } from '../context/UserProfileContext.js';

/**
 * OrbLiveView — Composant plein écran « présence vocale » destiné à une fenêtre
 * Electron dédiée (route /orb-live).
 *
 * Il affiche un orb animé réagissant à l'audio (entrée/sortie), les contrôles
 * de session (connexion, micro, mode Full/Ask), une saisie texte et le
 * transcript en direct. Il consomme le LiveAPIContext fourni par le wrapper
 * autonome monté dans main.tsx pour cette route — c'est donc une SESSION LIVE
 * INDÉPENDANTE de la fenêtre principale (process renderer distinct).
 */

// ─── Orb visuel (auto-contenu, aucune dépendance externe) ──────────────────────

function Orb({
  amp, accentColor, status, onClick, reduceMotion,
}: {
  amp: number;
  accentColor: string;
  status: string;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  // Échelle réactive à l'amplitude audio (bornée pour rester élégante).
  const scale = 1 + Math.min(0.18, amp * 0.6);
  const glow = 0.35 + Math.min(0.5, amp * 1.2);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex items-center justify-center rounded-full outline-none"
      style={{ width: 220, height: 220, cursor: 'pointer' }}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      aria-label="Basculer la connexion vocale"
    >
      {/* Halos pulsés */}
      {!reduceMotion && (status === 'online' || status === 'listening' || status === 'speaking' || status === 'busy') && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: accentColor, opacity: 0.18 }}
            animate={{ scale: [1, 1.35, 1], opacity: [0.18, 0, 0.18] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: accentColor, opacity: 0.12 }}
            animate={{ scale: [1, 1.6, 1], opacity: [0.12, 0, 0.12] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
          />
        </>
      )}

      {/* Noyau */}
      <motion.span
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 180,
          height: 180,
          background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${accentColor} 85%, white), ${accentColor} 60%, color-mix(in srgb, ${accentColor} 50%, black))`,
          boxShadow: `0 0 ${40 + amp * 120}px color-mix(in srgb, ${accentColor} ${Math.round(glow * 100)}%, transparent), inset 0 2px 20px rgba(255,255,255,0.25)`,
        }}
        animate={reduceMotion ? undefined : { scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <span
          className="absolute rounded-full"
          style={{ width: 70, height: 70, top: 28, left: 40, background: 'radial-gradient(circle, rgba(255,255,255,0.55), transparent 70%)' }}
          aria-hidden
        />
      </motion.span>
    </motion.button>
  );
}

// ─── Vue principale ────────────────────────────────────────────────────────────

export default function OrbLiveView() {
  const reduceMotion = useReducedMotion() ?? false;
  const { profile } = useProfile();
  const orb = useOrbState();
  const {
    status, connect, disconnect, muted, toggleMute, sendTextMessage, transcript,
  } = useLiveAPIContext();

  const [mode, setMode] = useState<'full' | 'ask'>(() => {
    try { return (localStorage.getItem('Leanna_mode') as 'full' | 'ask') || 'full'; } catch { return 'full'; }
  });
  const [draft, setDraft] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  // Défilement auto vers le dernier message.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript.length]);

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

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* Barre de titre (zone draggable Electron) */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid var(--border-base)', ['WebkitAppRegion' as any]: 'drag' }}
      >
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
            {profile.aiName || 'Leanna'} · Présence vocale
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-mono font-semibold"
          style={{
            backgroundColor: connected ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'var(--bg-secondary)',
            color: connected ? 'var(--color-success)' : 'var(--text-dimmed)',
          }}
        >
          {orb.statusLabel}
        </span>
      </div>

      {/* Zone orb */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-6">
        <Orb
          amp={orb.amp}
          accentColor={orb.accentColor}
          status={orb.status}
          onClick={handleToggleConnection}
          reduceMotion={reduceMotion}
        />

        {/* Contrôles principaux */}
        <div className="flex items-center gap-3">
          <motion.button
            type="button"
            onClick={handleToggleConnection}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            disabled={connecting}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              backgroundColor: connected ? 'color-mix(in srgb, var(--color-error) 14%, transparent)' : 'var(--accent-primary)',
              color: connected ? 'var(--color-error)' : '#fff',
              border: connected ? '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)' : 'none',
            }}
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <PhoneOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {connecting ? 'Connexion…' : connected ? 'Déconnecter' : 'Connecter'}
          </motion.button>

          <motion.button
            type="button"
            onClick={toggleMute}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            disabled={!connected}
            title={muted ? 'Réactiver le micro' : 'Couper le micro'}
            className="flex h-10 w-10 items-center justify-center rounded-xl transition-all disabled:opacity-40"
            style={{
              backgroundColor: muted ? 'color-mix(in srgb, var(--color-warning) 16%, transparent)' : 'var(--bg-secondary)',
              color: muted ? 'var(--color-warning)' : 'var(--text-secondary)',
              border: '1px solid var(--border-base)',
            }}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </motion.button>

          {/* Bascule Full / Ask */}
          <div
            className="flex items-center rounded-xl p-0.5"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
          >
            {(['full', 'ask'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => handleSelectMode(m)}
                title={m === 'full' ? 'Mode Full — agit' : 'Mode Ask — demande avant d\'agir'}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  backgroundColor: mode === m ? 'var(--accent-primary)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text-muted)',
                }}
              >
                {m === 'full' ? 'Full' : 'Ask'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transcript */}
      <div
        className="flex max-h-[38vh] min-h-[120px] flex-col overflow-y-auto custom-scrollbar px-6 py-3"
        style={{ borderTop: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {transcript.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-dimmed)' }}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {connected ? 'Parle ou écris pour démarrer la conversation…' : 'Connecte-toi pour démarrer la présence vocale.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {transcript.map(entry => (
                <motion.div
                  key={entry.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[80%] rounded-xl px-3 py-1.5 text-xs leading-relaxed whitespace-pre-wrap"
                    style={{
                      backgroundColor: entry.role === 'user' ? 'var(--accent-subtle)' : 'var(--bg-panel)',
                      color: entry.role === 'user' ? 'var(--accent-primary)' : 'var(--text-primary)',
                      border: '1px solid var(--border-base)',
                    }}
                  >
                    {entry.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Saisie texte */}
      <div className="flex flex-shrink-0 items-center gap-2 px-6 py-3" style={{ borderTop: '1px solid var(--border-base)' }}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
          placeholder={connected ? 'Écris un message…' : 'Connecte-toi pour écrire…'}
          disabled={!connected}
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none transition-all disabled:opacity-50"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-base)',
            color: 'var(--text-primary)',
          }}
        />
        <motion.button
          type="button"
          onClick={handleSend}
          whileTap={reduceMotion ? undefined : { scale: 0.95 }}
          disabled={!connected || !draft.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-xl transition-all disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
        >
          <Send className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  );
}

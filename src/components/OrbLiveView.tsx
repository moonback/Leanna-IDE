import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  X, Mic, MicOff, Power, Send, Radio, Eraser, Loader2,
} from 'lucide-react';
import { useLiveAPIContext } from '../context/LiveAPIContext.js';
import { useOrbState } from '../hooks/useOrbState.js';
import { useProfile } from '../context/UserProfileContext.js';
import { renderChatMarkdown } from '../utils/chatMarkdown.js';
import { sanitizeMarkdownHtml } from '../utils/sanitizeMarkdownHtml.js';

/**
 * OrbLiveView — Présence vocale plein écran (overlay).
 *
 * Vue immersive « orb + live vocal » ouverte depuis la GlobalSidebar. Elle
 * RÉUTILISE la session live existante (même LiveAPIProvider racine) : aucun
 * second flux micro ni seconde connexion WebSocket. On consomme les mêmes
 * hooks que l'orb flottant et le ChatPanel :
 *   - useOrbState     → statut, niveaux audio, couleur, toggle connexion ;
 *   - useLiveAPIContext → muet, transcript, envoi de texte, mode.
 *
 * Montée au niveau racine (dans Layout) et pilotée par un CustomEvent
 * « leanna-open-orb-live » émis par la sidebar — même mécanisme que les autres
 * overlays globaux de l'app (workspace switcher, etc.).
 */

const OPEN_EVENT = 'leanna-open-orb-live';
const CLOSE_EVENT = 'leanna-close-orb-live';

/** Déclencheur public : ouvre la vue depuis n'importe où (ex. GlobalSidebar). */
export function openOrbLive(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function OrbLiveView() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener(CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener(CLOSE_EVENT, onClose);
    };
  }, []);

  // Échap ferme la vue.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && <OrbLivePanel onClose={() => setOpen(false)} />}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Panneau ─────────────────────────────────────────────────────────────────

function OrbLivePanel({ onClose }: { onClose: () => void }) {
  const reduceMotion = useReducedMotion() ?? false;
  const orb = useOrbState();
  const { profile } = useProfile();
  const {
    muted, toggleMute, transcript, clearTranscript, sendTextMessage, connected,
  } = useLiveAPIContext();

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mode de session courant (persisté comme dans useOrbState).
  const [mode, setMode] = useState<'full' | 'ask'>(() => {
    try { return (localStorage.getItem('Leanna_mode') as 'full' | 'ask') || 'full'; } catch { return 'full'; }
  });
  const setModePref = useCallback((m: 'full' | 'ask') => {
    setMode(m);
    try { localStorage.setItem('Leanna_mode', m); } catch { /* ignore */ }
  }, []);

  // Auto-scroll du transcript sur nouveau message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    if (!connected) return;
    sendTextMessage(text);
    setDraft('');
  }, [draft, connected, sendTextMessage]);

  const providerLabel = profile.textProvider === 'openrouter'
    ? (profile.openrouterModel?.split('/').pop() || 'OpenRouter')
    : 'Gemini';

  return (
    <motion.div
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 'var(--z-modal, 1000)' as any, backgroundColor: 'var(--bg-base)' }}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Présence vocale Leanna"
    >
      {/* En-tête */}
      <header
        className="flex flex-shrink-0 items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid var(--border-base)' }}
      >
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4" style={{ color: orb.accentColor }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Présence vocale
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-mono font-semibold"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
          >
            {providerLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Fermer (Échap)"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--ctrl-hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Corps : orb + transcript */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Zone orb */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
          <Orb orb={orb} reduceMotion={reduceMotion} onClick={orb.toggleConnection} />

          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold tracking-wide" style={{ color: orb.accentColor }}>
              {orb.statusLabel}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
              {orb.isConnected
                ? muted ? 'Micro coupé — clique sur le micro pour reprendre' : 'Parle, Leanna t\'écoute'
                : 'Clique sur l\'orbe pour démarrer la session vocale'}
            </span>
          </div>

          {/* Contrôles */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* Connecter / déconnecter */}
            <button
              type="button"
              onClick={orb.toggleConnection}
              disabled={orb.isConnecting}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                backgroundColor: orb.isConnected ? 'color-mix(in srgb, var(--color-error) 14%, transparent)' : 'var(--accent-primary)',
                color: orb.isConnected ? 'var(--color-error)' : '#fff',
                border: `1px solid ${orb.isConnected ? 'color-mix(in srgb, var(--color-error) 40%, transparent)' : 'var(--accent-primary)'}`,
              }}
            >
              {orb.isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              {orb.isConnected ? 'Déconnecter' : orb.isConnecting ? 'Connexion…' : 'Connecter'}
            </button>

            {/* Muet (seulement si connecté) */}
            {orb.isConnected && (
              <button
                type="button"
                onClick={toggleMute}
                title={muted ? 'Réactiver le micro' : 'Couper le micro'}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all"
                style={{
                  backgroundColor: muted ? 'color-mix(in srgb, var(--color-warning) 14%, transparent)' : 'var(--bg-secondary)',
                  color: muted ? 'var(--color-warning)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-base)',
                }}
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {muted ? 'Muet' : 'Micro'}
              </button>
            )}

            {/* Bascule mode Full / Ask */}
            <div
              className="flex items-center rounded-xl p-0.5"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
            >
              {(['full', 'ask'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModePref(m)}
                  title={m === 'full' ? 'Mode Full : Leanna peut agir' : 'Mode Ask : Leanna propose sans agir'}
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
          {orb.isConnected && (
            <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
              Le changement de mode s'applique à la prochaine connexion.
            </p>
          )}
        </div>

        {/* Transcript */}
        <div
          className="flex min-h-0 w-full flex-col lg:w-[420px]"
          style={{ borderLeft: '1px solid var(--border-base)' }}
        >
          <div
            className="flex flex-shrink-0 items-center justify-between px-4 py-2"
            style={{ borderBottom: '1px solid var(--border-base)' }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              Transcription
            </span>
            {transcript.length > 0 && (
              <button
                type="button"
                onClick={clearTranscript}
                title="Effacer la transcription"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--ctrl-hover)]"
                style={{ color: 'var(--text-muted)' }}
              >
                <Eraser className="h-3 w-3" /> Effacer
              </button>
            )}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4">
            {transcript.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-xs" style={{ color: 'var(--text-dimmed)' }}>
                La conversation vocale apparaîtra ici.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {transcript.map(entry => (
                  <TranscriptBubble key={entry.id} role={entry.role} text={entry.text} />
                ))}
              </div>
            )}
          </div>

          {/* Saisie texte */}
          <div className="flex flex-shrink-0 items-end gap-2 p-3" style={{ borderTop: '1px solid var(--border-base)' }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={connected ? 'Écris un message…' : 'Connecte-toi pour discuter'}
              disabled={!connected}
              rows={1}
              className="min-h-[38px] max-h-28 flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!connected || !draft.trim()}
              title="Envoyer (Entrée)"
              className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Orbe animé ───────────────────────────────────────────────────────────────

function Orb({
  orb, reduceMotion, onClick,
}: { orb: ReturnType<typeof useOrbState>; reduceMotion: boolean; onClick: () => void }) {
  // L'amplitude pilote l'échelle et l'intensité du halo.
  const amp = orb.amp;
  const scale = 1 + (reduceMotion ? 0 : amp * 0.18);
  const glow = 0.3 + amp * 0.7;

  // Anneaux concentriques qui pulsent quand la session est active.
  const pulsing = orb.isConnected && !reduceMotion;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex items-center justify-center rounded-full outline-none"
      style={{ width: 220, height: 220, cursor: orb.isConnecting ? 'wait' : 'pointer' }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      aria-label={`Leanna ${orb.statusLabel}. Cliquer pour ${orb.isConnected ? 'déconnecter' : 'connecter'}.`}
    >
      {/* Halo externe */}
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: 220, height: 220,
          background: `radial-gradient(circle, ${orb.accentColor} 0%, transparent 70%)`,
          filter: 'blur(24px)',
          opacity: glow,
        }}
        animate={pulsing ? { opacity: [glow * 0.7, glow, glow * 0.7] } : { opacity: glow }}
        transition={{ duration: 2.2, repeat: pulsing ? Infinity : 0, ease: 'easeInOut' }}
      />

      {/* Anneaux pulsés */}
      {pulsing && [0, 1, 2].map(i => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full"
          style={{ border: `1.5px solid ${orb.accentColor}` }}
          initial={{ width: 150, height: 150, opacity: 0.5 }}
          animate={{ width: 220, height: 220, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
        />
      ))}

      {/* Noyau */}
      <motion.span
        aria-hidden
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 150, height: 150,
          background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${orb.accentColor} 90%, white), ${orb.accentColor})`,
          boxShadow: `0 0 ${20 + amp * 50}px ${orb.accentColor}, inset 0 0 30px rgba(255,255,255,0.25)`,
        }}
        animate={{ scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        {/* Reflet */}
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            top: 24, left: 32, width: 44, height: 30,
            background: 'radial-gradient(circle, rgba(255,255,255,0.65), transparent 70%)',
            filter: 'blur(3px)',
          }}
        />
      </motion.span>
    </motion.button>
  );
}

// ─── Bulle de transcription ───────────────────────────────────────────────────

function TranscriptBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const isUser = role === 'user';
  const html = useMemo(() => {
    try { return sanitizeMarkdownHtml(renderChatMarkdown(text)); }
    catch { return text; }
  }, [text]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="markdown-body max-w-[85%] rounded-2xl px-3 py-2 text-sm"
        style={{
          backgroundColor: isUser ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-base)',
          borderBottomRightRadius: isUser ? 4 : undefined,
          borderBottomLeftRadius: isUser ? undefined : 4,
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML assaini via sanitizeMarkdownHtml
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

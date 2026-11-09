/**
 * NotebookVoicePanel — contrôle de l'assistant vocal « live » dédié au
 * notebook (« Interroger à la voix »), rendu dans l'en-tête de NotebookDetail.
 *
 * - Au repos : une pilule « Interroger à la voix ».
 * - En session : la pilule devient une barre de contrôle (état, visualiseur,
 *   couper le micro, terminer) et une carte live s'ancre dessous : transcription
 *   en direct, sources citées par la dernière réponse et saisie clavier de
 *   secours. La carte peut être repliée sans couper la session.
 *
 * La session elle-même vit dans NotebookLiveProvider (elle survit aux
 * changements de vue centrale). Pendant qu'elle est active, l'assistant vocal
 * GLOBAL (Leanna) est mis en sourdine pour éviter que les deux micros se
 * chevauchent.
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, Loader2, PhoneOff, ChevronDown, ChevronUp, BookOpen, SendHorizontal, Search,
} from 'lucide-react';
import { clsx } from 'clsx';
import { NbIconButton } from '../ui/primitives.js';
import { LiveAPIContext } from '../../../context/LiveAPIContext.js';
import { useNotebookLiveContext } from './NotebookLiveContext.js';

interface Props {
  prefersReducedMotion: boolean | null;
}

type VoiceState = 'connecting' | 'muted' | 'busy' | 'speaking' | 'listening' | 'idle-live';

const STATE_LABEL: Record<VoiceState, string> = {
  connecting: 'Connexion…',
  muted: 'Micro coupé',
  busy: 'Recherche dans les sources…',
  speaking: 'Répond…',
  listening: 'Vous écoute…',
  'idle-live': 'À l’écoute',
};

const STATE_COLOR: Record<VoiceState, string> = {
  connecting: 'var(--text-muted)',
  muted: 'var(--color-warning)',
  busy: 'var(--color-warning)',
  speaking: 'var(--color-accent-alt, var(--notebook-accent))',
  listening: 'var(--notebook-accent)',
  'idle-live': 'var(--notebook-accent)',
};

const BAR_JITTER = [0.7, 1, 1.25, 0.9, 0.6];

export function NotebookVoicePanel({ prefersReducedMotion }: Props) {
  const shared = useNotebookLiveContext();
  const live = shared?.live;

  const [cardOpen, setCardOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);

  const connected = live?.connected ?? false;
  const connecting = live?.connecting ?? false;

  // ── Sourdine de l'assistant global pendant la session notebook ──────────
  // Accès défensif au contexte Live global (peut être absent en test isolé).
  const globalLive = useContext(LiveAPIContext);
  // On ne touche à la sourdine globale que si on l'a nous-mêmes activée.
  const didMuteGlobalRef = useRef(false);
  useEffect(() => {
    if (!globalLive) return;
    if (connected && globalLive.connected && !globalLive.muted) {
      globalLive.toggleMute();
      didMuteGlobalRef.current = true;
    } else if (!connected && didMuteGlobalRef.current) {
      if (globalLive.connected && globalLive.muted) globalLive.toggleMute();
      didMuteGlobalRef.current = false;
    }
  }, [connected, globalLive]);

  // Chaque nouvelle session rouvre la carte live.
  useEffect(() => {
    if (connected) setCardOpen(true);
    else setDraft('');
  }, [connected]);

  // Suivre la fin de la transcription (sans scroller la page entière).
  const transcriptLength = live?.transcript.reduce((n, e) => n + e.text.length, 0) ?? 0;
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcriptLength, cardOpen]);

  // Échap replie la carte sans couper la session.
  useEffect(() => {
    if (!connected || !cardOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCardOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connected, cardOpen]);

  // Sans provider (rendu isolé), aucune session à piloter.
  if (!live) return null;

  const {
    busy, muted, toggleMute, transcript, lastCitations, toggle, sendText,
    inputLevel, outputLevel, isSpeaking, isListening,
  } = live;

  const state: VoiceState = connecting
    ? 'connecting'
    : muted
      ? 'muted'
      : busy
        ? 'busy'
        : isSpeaking
          ? 'speaking'
          : isListening
            ? 'listening'
            : 'idle-live';
  const stateColor = STATE_COLOR[state];
  const level = muted ? 0 : isSpeaking ? outputLevel : inputLevel;

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    sendText(text);
    setDraft('');
  };

  // ── Repos : pilule d'appel ──────────────────────────────────────────────
  if (!connected && !connecting) {
    return (
      <motion.button
        type="button"
        onClick={toggle}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
        className="flex min-h-8 items-center gap-2 rounded-full border border-[var(--notebook-border)] bg-[var(--notebook-surface)] px-3.5 py-1 text-sm font-medium text-[var(--notebook-accent)] transition-colors hover:border-[color-mix(in_srgb,var(--notebook-accent)_40%,transparent)] hover:bg-[var(--notebook-accent-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--notebook-accent)]"
        title="Interroger vos sources à la voix"
        aria-label="Démarrer l'assistant vocal"
      >
        <Mic className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span className="hidden sm:inline">Mode vocal</span>
      </motion.button>
    );
  }

  // ── Session : barre de contrôle + carte live ────────────────────────────
  return (
    <div className="relative flex items-center">
      <div
        className="flex min-h-8 items-center gap-1 rounded-full border bg-[var(--notebook-surface)] py-0.5 pl-3 pr-1 shadow-[var(--notebook-shadow-sm)] transition-colors"
        style={{ borderColor: `color-mix(in srgb, ${stateColor} 45%, transparent)` }}
      >
        {/* Ouvrir / replier la carte live */}
        <button
          type="button"
          onClick={() => setCardOpen(v => !v)}
          className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-1 text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--notebook-accent)]"
          aria-expanded={cardOpen}
          aria-controls="notebook-voice-card"
          title={cardOpen ? 'Replier la transcription (Échap)' : 'Afficher la transcription'}
        >
          {connecting ? (
            <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-[var(--text-muted)]" aria-hidden />
          ) : (
            <span className="flex h-3.5 items-center gap-[2px]" style={{ color: stateColor }} aria-hidden>
              {BAR_JITTER.map((jitter, i) => {
                const h = prefersReducedMotion || busy
                  ? 0.4
                  : Math.min(1, 0.18 + level * 2.6 * jitter);
                return (
                  <motion.span
                    key={i}
                    className="w-[3px] rounded-full bg-current"
                    animate={{ height: `${Math.round(h * 100)}%`, opacity: muted ? 0.4 : 1 }}
                    transition={{ duration: 0.08 }}
                  />
                );
              })}
            </span>
          )}
          <span className="hidden max-w-[11rem] truncate sm:inline" aria-live="polite">
            {STATE_LABEL[state]}
          </span>
          {cardOpen
            ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />}
        </button>

        <NbIconButton
          icon={muted ? MicOff : Mic}
          label={muted ? 'Réactiver le micro' : 'Couper le micro'}
          size="sm"
          active={muted}
          disabled={connecting}
          onClick={toggleMute}
          className={clsx(muted && '!bg-[var(--color-warning-subtle)] !text-[var(--color-warning)]')}
        />
        <NbIconButton
          icon={PhoneOff}
          label="Terminer la session vocale"
          size="sm"
          tone="danger"
          onClick={toggle}
          className="!bg-[var(--color-error-subtle)] !text-[var(--color-error)]"
        />
      </div>

      {/* ── Carte live : transcription + sources + saisie clavier ───────── */}
      <AnimatePresence>
        {cardOpen && (
          <motion.section
            id="notebook-voice-card"
            aria-label="Session vocale — transcription en direct"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={prefersReducedMotion ? { duration: 0.1 } : { type: 'spring', bounce: 0, duration: 0.28 }}
            className="absolute right-0 top-full z-50 mt-2 flex w-[380px] max-w-[calc(100vw-32px)] origin-top-right flex-col overflow-hidden rounded-2xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] shadow-[var(--notebook-shadow-lg)]"
          >
            {/* En-tête */}
            <div className="flex items-center gap-2 border-b border-[var(--notebook-border)] px-4 py-2.5">
              <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
                {!prefersReducedMotion && !connecting && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: stateColor }} />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: stateColor }} />
              </span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">En direct</span>
              <span className="truncate text-xs text-[var(--text-muted)]">· {STATE_LABEL[state]}</span>
              {busy && <Search className="ml-auto h-3.5 w-3.5 flex-shrink-0 animate-pulse text-[var(--color-warning)]" aria-hidden />}
            </div>

            {/* Transcription */}
            <div
              ref={transcriptRef}
              className="custom-scrollbar max-h-72 min-h-[96px] space-y-3 overflow-y-auto px-4 py-3"
              aria-live="polite"
            >
              {transcript.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <Mic className="h-5 w-5 text-[var(--text-dimmed)]" aria-hidden />
                  <p className="text-sm text-[var(--text-muted)]">
                    {connecting ? 'Préparation du micro…' : 'Posez votre question à voix haute.'}
                  </p>
                  <p className="text-xs text-[var(--text-dimmed)]">
                    Les réponses s'appuient uniquement sur les sources du notebook.
                  </p>
                </div>
              ) : (
                transcript.map((e) => (
                  <div
                    key={e.id}
                    className={clsx('flex', e.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <p
                      className={clsx(
                        'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed',
                        e.role === 'user'
                          ? 'rounded-br-md bg-[var(--notebook-chat-user)] text-[var(--text-primary)]'
                          : 'rounded-bl-md bg-[var(--notebook-surface-muted)] text-[var(--text-secondary)]',
                      )}
                    >
                      {e.text}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Sources citées par la dernière réponse */}
            {lastCitations.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--notebook-border)] px-4 py-2">
                <span className="flex items-center gap-1 text-xs text-[var(--text-dimmed)]">
                  <BookOpen className="h-3 w-3" aria-hidden /> Sources
                </span>
                {lastCitations.slice(0, 6).map((c, i) => (
                  <span
                    key={`${c.chunkId}-${i}`}
                    className="max-w-[12rem] truncate rounded-full bg-[var(--notebook-accent-surface)] px-2 py-0.5 text-xs text-[var(--notebook-accent)]"
                    title={c.excerpt}
                  >
                    {c.sourceTitle}
                  </span>
                ))}
                {lastCitations.length > 6 && (
                  <span className="text-xs text-[var(--text-dimmed)]">+{lastCitations.length - 6}</span>
                )}
              </div>
            )}

            {/* Saisie clavier de secours */}
            <form
              className="flex items-center gap-2 border-t border-[var(--notebook-border)] px-3 py-2"
              onSubmit={(e) => { e.preventDefault(); submitDraft(); }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={connecting}
                placeholder="Ou écrivez votre question…"
                aria-label="Écrire une question à l'assistant vocal"
                className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dimmed)] disabled:opacity-60"
              />
              <NbIconButton
                type="submit"
                icon={SendHorizontal}
                label="Envoyer"
                size="sm"
                disabled={!draft.trim() || connecting}
              />
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

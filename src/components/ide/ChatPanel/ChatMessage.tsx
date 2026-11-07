import { memo, useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { User, Sparkles, Copy, CheckCheck, ClipboardX, RefreshCw, Pin, PinOff, Pencil, ImageOff, FileText, Image } from 'lucide-react';
import type { TranscriptEntry, ContextSource } from '../../../hooks/useLiveAPI.js';
import type { UserProfile } from '../../../context/UserProfileContext.js';
import { BUBBLE_STYLES, TRANSITIONS } from './theme.js';
import { ChatMarkdown } from './ChatMarkdown.js';
import { BreathingDots } from './BreathingDots.js';
import { InlineDiffEditor } from './InlineDiffEditor.js';
import { parseMessageSegments } from './inlineEdits.js';

export interface ChatMessageProps {
  entry: TranscriptEntry;
  profile: UserProfile;
  reduceMotion: boolean;
  /** Prop conservée pour la future ré-activation du bloc « Sources ». */
  onExcludeSource?: (source: ContextSource) => void;
  onCopy?: (text: string) => void;
  onRetry?: () => void;
  isLast?: boolean;
  /** Message épinglé par l'utilisateur. */
  isPinned?: boolean;
  onTogglePin?: (id: string) => void;
  /** Édition d'un message utilisateur (préremplit le champ de saisie). */
  onEdit?: (entry: TranscriptEntry) => void;
  /** Terme de recherche à surligner dans le texte (messages utilisateur). */
  highlight?: string;
}

/** Surligne les occurrences de `term` dans `text` (insensible à la casse). */
function highlightText(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark
        key={i}
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 35%, transparent)', color: 'inherit', borderRadius: '2px' }}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * Carte de chargement affichée pendant la génération d'une image : cadre en
 * aspect 1:1 avec un balayage lumineux (shimmer) + libellé animé. Remplacée par
 * l'image réelle une fois la génération terminée (voir useTranscript).
 */
function GeneratingImage({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="flex flex-col gap-2" style={{ minWidth: '220px' }}>
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          width: '220px',
          aspectRatio: '1 / 1',
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 6%, var(--bg-panel))',
          border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
        }}
      >
        {!reduceMotion && (
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(110deg, transparent 20%, color-mix(in srgb, var(--accent-primary) 22%, transparent) 50%, transparent 80%)',
            }}
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🎨</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <BreathingDots color="var(--accent-primary)" reduceMotion={reduceMotion} size={5} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Génération de l'image…
        </span>
      </div>
    </div>
  );
}

/**
 * Carte d'échec affichée quand la génération d'image a raté : cadre statique
 * avec icône « image barrée » + message d'erreur. Remplace l'animation de
 * chargement (voir useTranscript.failPendingImage).
 */
function FailedImage({ message }: { message?: string }) {
  return (
    <div className="flex flex-col gap-2" style={{ minWidth: '220px' }}>
      <div
        className="relative overflow-hidden rounded-lg flex items-center justify-center"
        style={{
          width: '220px',
          aspectRatio: '1 / 1',
          backgroundColor: 'color-mix(in srgb, var(--color-error) 7%, var(--bg-panel))',
          border: '1px solid color-mix(in srgb, var(--color-error) 32%, transparent)',
        }}
      >
        <ImageOff size={30} style={{ color: 'var(--color-error)', opacity: 0.75 }} />
      </div>
      <div className="flex items-start gap-2">
        <ImageOff size={13} style={{ color: 'var(--color-error)', marginTop: '2px', flexShrink: 0 }} />
        <span className="text-xs" style={{ color: 'var(--color-error)' }}>
          {message && message.trim() ? message : "La génération de l'image a échoué."}
        </span>
      </div>
    </div>
  );
}

/** Bulle de message (assistant ou utilisateur) avec actions au survol. */
export const ChatMessage = memo(function ChatMessage({
  entry,
  profile: _profile,
  reduceMotion,
  onExcludeSource: _onExcludeSource,
  onCopy,
  onRetry,
  isLast,
  isPinned = false,
  onTogglePin,
  onEdit,
  highlight = '',
}: ChatMessageProps) {
  const isAssistant = entry.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const bubbleStyle = isAssistant ? BUBBLE_STYLES.assistant : BUBBLE_STYLES.user;

  // Découpe le message de l'assistante en prose + éditeurs diff inline. Les
  // directives ```edit path=… deviennent des cartes de modification de code.
  const isPlainBubble = !isAssistant || entry.pending === 'image' || entry.pending === 'image-error';
  const segments = useMemo(
    () => (isPlainBubble ? [] : parseMessageSegments(entry.text)),
    [isPlainBubble, entry.text],
  );
  const hasEdits = segments.some(s => s.kind === 'edit');

  const handleCopy = useCallback(async () => {
    setCopyFailed(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(entry.text);
      setCopied(true);
      onCopy?.(entry.text);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 2500);
    }
  }, [entry.text, onCopy]);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0.1 } : TRANSITIONS.spring}
      className={`flex gap-3 group relative ${isAssistant ? '' : 'flex-row-reverse'}`}
    >
      {/* Avatar — orbe pour l'assistante, pastille neutre pour l'utilisateur */}
      {isAssistant ? (
        <span className="lea-orb mt-0.5" data-state="online" style={{ width: 32, height: 32 }} aria-hidden="true">
          <Sparkles size={14} />
        </span>
      ) : (
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
            border: '1px solid var(--border-base)',
          }}
        >
          <User size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {/* Content */}
      <div className={`${hasEdits ? 'w-full max-w-full' : 'max-w-[86%]'} flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}>
        <div
          className={`lea-chat-bubble px-4 py-3 text-sm leading-relaxed text-left relative ${hasEdits ? 'block w-full' : 'inline-block'}`}
          data-role={isAssistant ? 'assistant' : 'user'}
          style={{
            background: bubbleStyle.bg,
            border: `1px solid ${isPinned ? 'color-mix(in srgb, var(--accent-primary) 55%, transparent)' : bubbleStyle.border}`,
            borderRadius: bubbleStyle.borderRadius,
            color: 'var(--text-primary)',
            boxShadow: bubbleStyle.shadow,
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Badge épinglé */}
          {isPinned && (
            <span
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#0a1628', boxShadow: '0 0 8px var(--accent-glow)' }}
              title="Message épinglé"
            >
              <Pin size={10} />
            </span>
          )}
          {entry.attachment ? (
            <div
              className="flex flex-col gap-2 min-w-0"
              style={{ minWidth: '220px', maxWidth: 'min(100%, 420px)' }}
              aria-label={`Document analysé : ${entry.attachment.fileName}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)', color: 'var(--accent-primary)' }}
                >
                  {entry.attachment.mimeType.startsWith('image/') ? <Image size={17} /> : <FileText size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate" title={entry.attachment.fileName}>
                    {entry.attachment.fileName}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                    Document analysé · {entry.attachment.extractedTextLength > 0
                      ? `${(entry.attachment.extractedTextLength / 1000).toFixed(1)}k caractères extraits`
                      : 'analyse visuelle'}
                  </p>
                </div>
                <span
                  className="text-[10px] rounded-full px-2 py-1 flex-shrink-0"
                  style={{ color: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)' }}
                >
                  {entry.attachment.provider === 'openrouter' ? 'OpenRouter' : 'Gemini'}
                </span>
              </div>
              {entry.attachment.summary && (
                <div
                  className="rounded-md px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--bg-input) 65%, transparent)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
                >
                  {entry.attachment.summary}
                </div>
              )}
            </div>
          ) : entry.pending === 'image' ? (
            <GeneratingImage reduceMotion={reduceMotion} />
          ) : entry.pending === 'image-error' ? (
            <FailedImage message={entry.imageError} />
          ) : isAssistant ? (
            segments.map((seg, i) => (
              seg.kind === 'edit' ? (
                <InlineDiffEditor
                  key={seg.id}
                  path={seg.path}
                  proposed={seg.content}
                  language={seg.language}
                />
              ) : (
                <ChatMarkdown key={`prose-${i}`} text={seg.text} />
              )
            ))
          ) : (
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {highlight ? highlightText(entry.text, highlight) : entry.text}
            </span>
          )}
        </div>

        {/* Footer: timestamp + actions */}
        <div
          className={`lea-chat-actions flex items-center gap-1.5 mt-1.5 px-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 ${isAssistant ? '' : 'flex-row-reverse'}`}
        >
          <time
            className="text-xs font-mono tracking-wide"
            dateTime={entry.timestamp.toISOString()}
            title={entry.timestamp.toLocaleString('fr-FR', {
              dateStyle: 'full', timeStyle: 'long',
            })}
            style={{ color: 'var(--text-dimmed)' }}
          >
            {entry.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </time>

          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded-md transition-colors hover:bg-[var(--bg-active)]"
            title={copyFailed ? 'Copie impossible : vérifiez les autorisations du navigateur' : copied ? 'Message copié' : 'Copier le message'}
            aria-label={copyFailed ? 'La copie a échoué' : copied ? 'Message copié' : 'Copier le message'}
            aria-live="polite"
          >
            {copyFailed
              ? <ClipboardX size={11} style={{ color: 'var(--color-error)' }} />
              : copied
                ? <CheckCheck size={11} style={{ color: 'var(--color-success)' }} />
                : <Copy size={11} style={{ color: 'var(--text-dimmed)' }} />
            }
          </button>

          {/* Pin / Unpin */}
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(entry.id)}
              className="p-1 rounded-md transition-colors hover:bg-[var(--bg-active)]"
              title={isPinned ? 'Désépingler' : 'Épingler'}
              aria-label={isPinned ? 'Désépingler le message' : 'Épingler le message'}
            >
              {isPinned
                ? <PinOff size={11} style={{ color: 'var(--accent-primary)' }} />
                : <Pin size={11} style={{ color: 'var(--text-dimmed)' }} />
              }
            </button>
          )}

          {/* Edit — messages utilisateur uniquement */}
          {!isAssistant && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="p-1 rounded-md transition-colors hover:bg-[var(--bg-active)]"
              title="Modifier et renvoyer"
              aria-label="Modifier et renvoyer le message"
            >
              <Pencil size={11} style={{ color: 'var(--text-dimmed)' }} />
            </button>
          )}

          {/* Retry — dernier message assistant uniquement */}
          {isAssistant && isLast && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="p-1 rounded-md transition-colors hover:bg-[var(--bg-active)]"
              title="Régénérer la réponse"
              aria-label="Régénérer la réponse"
            >
              <RefreshCw size={11} style={{ color: 'var(--text-dimmed)' }} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

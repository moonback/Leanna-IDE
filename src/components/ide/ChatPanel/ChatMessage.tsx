import { memo, useCallback, useState } from 'react';
import { motion } from 'motion/react';
import { User, Bot, Copy, CheckCheck, RefreshCw, Pin, PinOff, Pencil } from 'lucide-react';
import type { TranscriptEntry, ContextSource } from '../../../hooks/useLiveAPI.js';
import type { UserProfile } from '../../../context/UserProfileContext.js';
import { BUBBLE_STYLES, TRANSITIONS } from './theme.js';
import { ChatMarkdown } from './ChatMarkdown.js';

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
  const bubbleStyle = isAssistant ? BUBBLE_STYLES.assistant : BUBBLE_STYLES.user;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(entry.text).then(() => {
      setCopied(true);
      onCopy?.(entry.text);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [entry.text, onCopy]);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0.1 } : TRANSITIONS.spring}
      className={`flex gap-3 group relative ${isAssistant ? '' : 'flex-row-reverse'}`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 transition-transform group-hover:scale-105"
        style={{
          backgroundColor: isAssistant
            ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
            : 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${isAssistant ? 'color-mix(in srgb, var(--accent-primary) 25%, transparent)' : 'var(--border-base)'}`,
          boxShadow: isAssistant ? '0 0 12px color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'none',
        }}
      >
        {isAssistant
          ? <Bot size={14} style={{ color: 'var(--accent-primary)' }} />
          : <User size={14} style={{ color: 'var(--text-muted)' }} />
        }
      </div>

      {/* Content */}
      <div className={`max-w-[86%] flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}>
        <div
          className="px-4 py-3 text-sm leading-relaxed inline-block text-left transition-shadow duration-200 hover:shadow-lg relative"
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
          {isAssistant ? <ChatMarkdown text={entry.text} /> : (
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {highlight ? highlightText(entry.text, highlight) : entry.text}
            </span>
          )}
        </div>

        {/* Footer: timestamp + actions */}
        <div
          className={`flex items-center gap-1.5 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${isAssistant ? '' : 'flex-row-reverse'}`}
        >
          <span className="text-xs font-mono tracking-wide" style={{ color: 'var(--text-dimmed)' }}>
            {entry.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>

          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded-md transition-colors hover:bg-[var(--bg-active)]"
            title="Copier le message"
            aria-label="Copier le message"
          >
            {copied
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

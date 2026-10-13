import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown, Sparkles } from 'lucide-react';
import type { TranscriptEntry, ContextSource } from '../../../hooks/useLiveAPI.js';
import type { UserProfile } from '../../../context/UserProfileContext.js';
import { InlineApproval } from '../InlineApproval.js';
import { BreathingDots } from './BreathingDots.js';
import { EmptyState } from './EmptyState.js';
import { ChatMessage } from './ChatMessage.js';
import type { PendingChatMessage } from './types.js';

export interface ChatMessageListProps {
  // Données
  transcript: TranscriptEntry[];
  queue: PendingChatMessage[];
  profile: UserProfile;
  connected: boolean;
  connecting: boolean;
  isBusy: boolean;
  activityLength: number;
  reduceMotion: boolean;
  lastAssistantIdx: number;

  // Recherche
  searchQuery?: string;
  matchedIds?: Set<string>;
  currentMatchId?: string;

  // Épingles
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;

  // Actions
  onEditMessage: (entry: TranscriptEntry) => void;
  onExcludeSource: (source: ContextSource) => void;
  onCopy: () => void;
  onRetry: () => void;
  onDequeue: (index: number) => void;
  sendRawMessage: (msg: unknown) => void;

  // Scroll
  messagesRef: React.RefObject<HTMLDivElement | null>;
  messagesInnerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  showScrollBtn: boolean;
  onScrollToBottom: () => void;
}

/** Corps défilant du chat : indicateurs, messages, file d'attente, approbation. */
export function ChatMessageList({
  transcript, queue, profile, connected, connecting, isBusy, activityLength,
  reduceMotion, lastAssistantIdx,
  searchQuery = '', matchedIds, currentMatchId,
  isPinned, onTogglePin, onEditMessage, onExcludeSource, onCopy, onRetry, onDequeue,
  sendRawMessage,
  messagesRef, messagesInnerRef, onScroll, showScrollBtn, onScrollToBottom,
}: ChatMessageListProps) {
  const aiName = profile?.aiName || 'Leanna';
  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={messagesRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar"
      >
        <div ref={messagesInnerRef} className="space-y-4">

          {/* Connecting indicator */}
          {connecting && (
            <div className="flex items-start gap-3">
              <span className="lea-orb" data-state="connecting" style={{ width: 32, height: 32 }} aria-hidden="true">
                <Sparkles size={14} />
              </span>
              <div className="lea-thinking">
                <BreathingDots color="var(--color-warning)" reduceMotion={reduceMotion} size={5} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Connexion en cours…
                </span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {transcript.length === 0 && activityLength === 0 && !connecting && (
            <EmptyState connected={connected} reduceMotion={reduceMotion} aiName={aiName} />
          )}

          {/* Recherche : aucun résultat */}
          {hasSearch && matchedIds && matchedIds.size === 0 && transcript.length > 0 && (
            <div className="text-center text-xs py-4" style={{ color: 'var(--text-dimmed)' }}>
              Aucun message ne correspond à « {searchQuery} ».
            </div>
          )}

          {/* Messages */}
          <AnimatePresence initial={false}>
            {transcript.map((entry, idx) => {
              // En mode recherche, on masque les messages non correspondants.
              if (hasSearch && matchedIds && !matchedIds.has(entry.id)) return null;
              return (
                <div
                  key={entry.id}
                  data-message-id={entry.id}
                  style={currentMatchId === entry.id ? { scrollMarginTop: '12px' } : undefined}
                >
                  <ChatMessage
                    entry={entry}
                    profile={profile}
                    reduceMotion={reduceMotion}
                    isLast={idx === lastAssistantIdx && entry.role === 'assistant'}
                    isPinned={isPinned(entry.id)}
                    onTogglePin={onTogglePin}
                    onEdit={onEditMessage}
                    highlight={hasSearch ? searchQuery.trim() : ''}
                    onExcludeSource={onExcludeSource}
                    onCopy={onCopy}
                    onRetry={onRetry}
                  />
                </div>
              );
            })}
          </AnimatePresence>

          {/* Thinking indicator */}
          {isBusy && !hasSearch && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-start gap-3"
              role="status"
              aria-live="polite"
            >
              <span className="lea-orb" data-state="busy" style={{ width: 32, height: 32 }} aria-hidden="true">
                <Sparkles size={14} />
              </span>
              <div className="lea-thinking">
                <BreathingDots color="var(--accent-primary)" reduceMotion={reduceMotion} size={5} />
                <span
                  className={`text-xs font-medium${reduceMotion ? '' : ' lea-shimmer-text'}`}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {aiName} réfléchit…
                </span>
              </div>
            </motion.div>
          )}

          {/* Queue */}
          {queue.length > 0 && !hasSearch && (
            <div className="space-y-1.5 pl-11">
              {queue.map((msg, idx) => (
                <div
                  key={idx}
                  className="group/queue flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-xl relative overflow-hidden"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 6%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                  }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5"
                    style={{ backgroundColor: 'var(--accent-primary)', opacity: 0.5 }}
                  />
                  <span className="text-sm truncate ml-1" style={{ color: 'var(--text-muted)' }}>
                    {msg.displayText ?? msg.text}
                  </span>
                  <span className="text-xs flex-shrink-0 ml-auto" style={{ color: 'var(--text-dimmed)' }}>
                    en attente
                  </span>
                  <button
                    type="button"
                    onClick={() => onDequeue(idx)}
                    className="opacity-0 group-hover/queue:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--bg-active)] flex-shrink-0"
                    title="Retirer de la file"
                    aria-label="Retirer ce message de la file d'attente"
                  >
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>✕</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Approbation d'édition critique — carte inline non bloquante */}
          <InlineApproval sendMessage={sendRawMessage} />

          <div />
        </div>
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            transition={{ duration: 0.15 }}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            onClick={onScrollToBottom}
            className="absolute right-3 bottom-3 p-2.5 rounded-full shadow-lg z-30 flex items-center justify-center cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-hover))',
              color: '#fff',
              boxShadow: '0 8px 22px -6px color-mix(in srgb, var(--accent-primary) 70%, transparent), 0 0 0 1px rgba(255,255,255,0.18)',
            }}
            title="Aller au dernier message"
            aria-label="Aller au dernier message"
          >
            <ArrowDown size={14} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

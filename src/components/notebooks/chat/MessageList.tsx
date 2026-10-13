/**
 * MessageList — zone scrollable du chat : état de chargement, accueil +
 * suggestions, liste des messages (MessageItem), aperçu du streaming, boutons
 * stop / deep-dive / loading / follow-ups, bouton scroll-to-bottom, et le
 * tooltip de citation survolée. Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2, MessageCircle, Lightbulb, RefreshCw, StopCircle, Telescope, ArrowDown, Quote,
} from 'lucide-react';
import { SPRING_UI, SPRING_MOMENTUM_CHAT as SPRING_MOMENTUM } from '../motion.js';
import { NbBadge, NbButton, NbEmptyState, NbIconButton } from '../ui/primitives.js';
import { renderMessageContent } from './renderHelpers.js';
import { MessageItem } from './MessageItem.js';
import type { Citation, ChatMessage } from './types.js';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  loadingHistory: boolean;
  messages: ChatMessage[];
  suggestions: string[];
  suggestionOffset: number;
  setSuggestionOffset: React.Dispatch<React.SetStateAction<number>>;
  followUps: string[];
  followUpOffset: number;
  setFollowUpOffset: React.Dispatch<React.SetStateAction<number>>;
  streamingText: string;
  deepDiveProgress: string;
  loading: boolean;
  showScrollBtn: boolean;
  hoveredCitation: { citation: Citation; fullContent: string; x: number; y: number } | null;
  prefersReducedMotion: boolean | null;
  onSend: (question: string) => void;
  onStopStreaming: () => void;
  scrollToBottom: () => void;
  // Props transmises à MessageItem
  editingMsgId: string | null;
  editingContent: string;
  setEditingContent: (v: string) => void;
  copiedMsgId: string | null;
  speakingMsgId: string | null;
  feedbackMap: Record<string, 'up' | 'down'>;
  showCitations: string | null;
  setShowCitations: (v: string | null) => void;
  setHoveredCitation: (v: null) => void;
  onCopy: (msgId: string, content: string) => void;
  onRetry: (msgId: string) => void;
  onTTS: (msgId: string, content: string) => void;
  onSaveToNote: (msg: ChatMessage) => void;
  onOpenFolderPicker: (msg: ChatMessage) => void;
  onFeedback: (msgId: string, type: 'up' | 'down') => void;
  onEditStart: (msgId: string, content: string) => void;
  onEditCancel: () => void;
  onEditSubmit: (msgId: string) => void;
  onFetchCitation: (citation: Citation, x: number, y: number) => void;
}

export function MessageList(props: Props) {
  const {
    scrollContainerRef, messagesEndRef, onScroll, loadingHistory, messages,
    suggestions, suggestionOffset, setSuggestionOffset,
    followUps, followUpOffset, setFollowUpOffset,
    streamingText, deepDiveProgress, loading, showScrollBtn, hoveredCitation,
    prefersReducedMotion, onSend, onStopStreaming, scrollToBottom,
  } = props;

  const suggestionChipClass =
    'notebook-chip !whitespace-normal !rounded-xl !px-3 !py-2 text-left !text-sm leading-snug !text-[var(--text-primary)]';

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto custom-scrollbar px-5 py-6 lg:px-8"
      >
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--notebook-accent)]" />
          </div>
        ) : messages.length === 0 ? (
          /* Welcome state */
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-12">
            <NbEmptyState
              icon={MessageCircle}
              title="Interrogez vos sources"
              description="Posez une question et l'IA répondra en citant les passages pertinents de vos documents."
            />

            {/* Suggestions — 2 visibles + bouton pour en voir d'autres */}
            {suggestions.length > 0 && (
              <div className="w-full space-y-3">
                <p className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Suggestions
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {suggestions.slice(suggestionOffset, suggestionOffset + 2).map((s, i) => (
                    <button
                      key={`${suggestionOffset}-${i}`}
                      type="button"
                      onClick={() => onSend(s)}
                      className={suggestionChipClass}
                    >
                      <span className="line-clamp-2">{s}</span>
                    </button>
                  ))}
                </div>
                {suggestions.length > 2 && (
                  <NbButton
                    variant="ghost"
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => setSuggestionOffset((prev) => (prev + 2) >= suggestions.length ? 0 : prev + 2)}
                    className="!text-[var(--notebook-accent)]"
                  >
                    Autres suggestions
                  </NbButton>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                prefersReducedMotion={prefersReducedMotion}
                spring={SPRING_UI}
                loading={loading}
                editingMsgId={props.editingMsgId}
                editingContent={props.editingContent}
                setEditingContent={props.setEditingContent}
                copiedMsgId={props.copiedMsgId}
                speakingMsgId={props.speakingMsgId}
                feedbackMap={props.feedbackMap}
                showCitations={props.showCitations}
                setShowCitations={props.setShowCitations}
                setHoveredCitation={props.setHoveredCitation}
                onCopy={props.onCopy}
                onRetry={props.onRetry}
                onTTS={props.onTTS}
                onSaveToNote={props.onSaveToNote}
                onOpenFolderPicker={props.onOpenFolderPicker}
                onFeedback={props.onFeedback}
                onEditStart={props.onEditStart}
                onEditCancel={props.onEditCancel}
                onEditSubmit={props.onEditSubmit}
                onFetchCitation={props.onFetchCitation}
              />
            ))}

            {/* Streaming text */}
            {streamingText && (
              <motion.div
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
                className="mx-auto flex max-w-4xl justify-start"
              >
                <div
                  className="notebook-chat-message w-full border border-[var(--notebook-border)]"
                  data-role="assistant"
                >
                  {renderMessageContent(streamingText)}
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[var(--notebook-accent)]" />
                </div>
              </motion.div>
            )}

            {/* Stop streaming button */}
            {loading && (streamingText || deepDiveProgress) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex justify-center"
              >
                <NbButton
                  variant="secondary"
                  size="sm"
                  icon={StopCircle}
                  onClick={onStopStreaming}
                  className="[&>svg]:text-[var(--color-error)]"
                >
                  Arrêter la génération
                </NbButton>
              </motion.div>
            )}

            {/* Deep dive progress */}
            {deepDiveProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="flex items-center gap-2 rounded-xl border border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] px-4 py-3 text-xs text-[var(--notebook-accent)]">
                  <Telescope className="h-4 w-4 animate-pulse" />
                  <span className="font-medium">{deepDiveProgress}</span>
                </div>
              </motion.div>
            )}

            {/* Loading indicator */}
            {loading && !streamingText && !deepDiveProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mx-auto flex max-w-4xl justify-start"
              >
                <div
                  className="notebook-chat-message border border-[var(--notebook-border)] !px-5 !py-4"
                  data-role="assistant"
                >
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--notebook-accent)] [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--notebook-accent)] [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--notebook-accent)] [animation-delay:300ms]" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Follow-ups */}
            {followUps.length > 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mx-auto max-w-4xl space-y-3 pt-4"
              >
                <p className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Questions de suivi
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {followUps.slice(followUpOffset, followUpOffset + 2).map((q, i) => (
                    <button
                      key={`${followUpOffset}-${i}`}
                      type="button"
                      onClick={() => onSend(q)}
                      className={suggestionChipClass}
                    >
                      <span className="line-clamp-2">{q}</span>
                    </button>
                  ))}
                </div>
                {followUps.length > 2 && (
                  <NbButton
                    variant="ghost"
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => setFollowUpOffset((prev) => (prev + 2) >= followUps.length ? 0 : prev + 2)}
                    className="!text-[var(--notebook-accent)]"
                  >
                    Autres suggestions
                  </NbButton>
                )}
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_MOMENTUM}
              className="fixed bottom-28 right-8 z-30"
            >
              <NbIconButton
                icon={ArrowDown}
                label="Aller en bas de la conversation"
                onClick={scrollToBottom}
                className="!h-10 !w-10 !bg-[var(--notebook-accent)] !text-[var(--notebook-accent-text)] shadow-[var(--notebook-shadow-md)] hover:!opacity-90"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Citation hover tooltip */}
      <AnimatePresence>
        {hoveredCitation && (
          <motion.div
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            transition={{ duration: 0.1 }}
            className="pointer-events-none fixed z-50 max-w-md rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] p-4 text-[var(--text-primary)] shadow-[var(--notebook-shadow-lg)]"
            // Position dynamique (suit la citation survolée)
            style={{
              left: Math.min(hoveredCitation.x, window.innerWidth - 420),
              top: Math.max(hoveredCitation.y - 200, 8),
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Quote className="h-3.5 w-3.5 flex-shrink-0 text-[var(--notebook-accent)]" />
              <span className="truncate text-sm font-semibold">{hoveredCitation.citation.sourceTitle}</span>
              <NbBadge tone="accent" className="flex-shrink-0">
                {(hoveredCitation.citation.relevance * 100).toFixed(0)}%
              </NbBadge>
            </div>
            <p className="custom-scrollbar max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">
              {hoveredCitation.fullContent}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

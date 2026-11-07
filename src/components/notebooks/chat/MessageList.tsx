/**
 * MessageList — zone scrollable du chat : état de chargement, accueil +
 * suggestions, liste des messages (MessageItem), aperçu du streaming, boutons
 * stop / deep-dive / loading / follow-ups, bouton scroll-to-bottom, et le
 * tooltip de citation survolée. Composant présentationnel.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2, MessageCircle, Lightbulb, RefreshCw, StopCircle, Telescope, ArrowDown, Quote, X, FileText,
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
  /** Ouvre la source complète (visionneuse) — bouton de l'aperçu de citation */
  onOpenSource?: (sourceId: string) => void;
  /** En-tête d'accueil (titre + résumé du notebook) affiché tant qu'il n'y a aucun message */
  intro?: React.ReactNode;
}

export function MessageList(props: Props) {
  const {
    scrollContainerRef, messagesEndRef, onScroll, loadingHistory, messages,
    suggestions, suggestionOffset, setSuggestionOffset,
    followUps, followUpOffset, setFollowUpOffset,
    streamingText, deepDiveProgress, loading, showScrollBtn, hoveredCitation,
    prefersReducedMotion, onSend, onStopStreaming, scrollToBottom, intro,
    setHoveredCitation, onOpenSource,
  } = props;

  // Aperçu de citation : fermeture au clic extérieur, à Échap ou au scroll.
  const citationPopoverRef = useRef<HTMLDivElement>(null);
  const isCitationOpen = hoveredCitation !== null;
  useEffect(() => {
    if (!isCitationOpen) return;
    const close = () => setHoveredCitation(null);
    const onPointerDown = (e: PointerEvent) => {
      if (!citationPopoverRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const scroller = scrollContainerRef.current;
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    scroller?.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      scroller?.removeEventListener('scroll', close);
    };
  }, [isCitationOpen, setHoveredCitation, scrollContainerRef]);

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
          <div className={intro
            ? 'mx-auto flex max-w-3xl flex-col gap-6 py-2'
            : 'mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-12'}
          >
            {intro ?? (
              <NbEmptyState
                icon={MessageCircle}
                title="Interrogez vos sources"
                description="Posez une question et l'IA répondra en citant les passages pertinents de vos documents."
              />
            )}

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

      {/* Aperçu de citation (clic sur [SOURCE N] ou « Voir le détail ») */}
      <AnimatePresence>
        {hoveredCitation && (
          <motion.div
            ref={citationPopoverRef}
            role="dialog"
            aria-label={`Source : ${hoveredCitation.citation.sourceTitle}`}
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-50 w-[min(28rem,calc(100vw-16px))] rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] p-4 text-[var(--text-primary)] shadow-[var(--notebook-shadow-lg)]"
            // Au-dessus du marqueur cliqué s'il y a la place, sinon en dessous
            style={{
              left: Math.max(8, Math.min(hoveredCitation.x, window.innerWidth - 456)),
              ...(hoveredCitation.y > 300
                ? { bottom: window.innerHeight - hoveredCitation.y + 8 }
                : { top: hoveredCitation.y + 28 }),
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Quote className="h-3.5 w-3.5 flex-shrink-0 text-[var(--notebook-accent)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{hoveredCitation.citation.sourceTitle}</span>
              <NbBadge tone="accent" className="flex-shrink-0">
                {(hoveredCitation.citation.relevance * 100).toFixed(0)}%
              </NbBadge>
              <NbIconButton icon={X} label="Fermer" size="sm" onClick={() => setHoveredCitation(null)} />
            </div>
            {hoveredCitation.citation.filePath && (
              <div className="mb-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <FileText className="h-3 w-3 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />
                <span className="min-w-0 truncate font-mono" title={hoveredCitation.citation.filePath}>
                  {hoveredCitation.citation.filePath}
                </span>
              </div>
            )}
            <p className="custom-scrollbar max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">
              {hoveredCitation.fullContent}
            </p>
            {onOpenSource && (
              <div className="mt-3 flex justify-end border-t border-[var(--notebook-border)] pt-2">
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={FileText}
                  onClick={() => {
                    const { sourceId } = hoveredCitation.citation;
                    setHoveredCitation(null);
                    onOpenSource(sourceId);
                  }}
                  className="!min-h-0 !px-2 !py-1 !text-xs !text-[var(--notebook-accent)]"
                >
                  Ouvrir la source
                </NbButton>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

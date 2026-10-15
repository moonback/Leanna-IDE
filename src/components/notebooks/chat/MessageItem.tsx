/**
 * MessageItem — une bulle de message (utilisateur ou assistant) avec son mode
 * édition, sa barre d'actions et ses citations. Mémoïsé. Présentationnel.
 */

import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { SpringTransition } from '../motionTypes.js';
import {
  Check, Copy, RefreshCw, Square, Volume2, StickyNote, Download,
  ThumbsUp, ThumbsDown, Pencil, Quote, ChevronDown, ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import { NbBadge, NbButton, NbIconButton, NbTextarea } from '../ui/primitives.js';
import { buildCitationRefMap, renderMessageContent, type CitationLinks } from './renderHelpers.js';
import type { Citation, ChatMessage } from './types.js';

interface Props {
  msg: ChatMessage;
  prefersReducedMotion: boolean | null;
  spring: SpringTransition;
  loading: boolean;
  editingMsgId: string | null;
  editingContent: string;
  setEditingContent: (v: string) => void;
  copiedMsgId: string | null;
  speakingMsgId: string | null;
  feedbackMap: Record<string, 'up' | 'down'>;
  showCitations: string | null;
  setShowCitations: (v: string | null) => void;
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

export const MessageItem = memo(function MessageItem({
  msg, prefersReducedMotion, spring, loading,
  editingMsgId, editingContent, setEditingContent,
  copiedMsgId, speakingMsgId, feedbackMap, showCitations, setShowCitations,
  onCopy, onRetry, onTTS, onSaveToNote, onOpenFolderPicker, onFeedback,
  onEditStart, onEditCancel, onEditSubmit, onFetchCitation,
}: Props) {
  const isCopied = copiedMsgId === msg.id;
  const isSpeaking = speakingMsgId === msg.id;
  const feedback = feedbackMap[msg.id];
  /** Boutons texte de la barre d'actions : discrets, plus marqués au survol. */
  const actionClass = '!min-h-0 !px-2 !py-1 !text-xs';

  /** Marqueurs [SOURCE N] cliquables → aperçu du passage cité. */
  const citationLinks = useMemo<CitationLinks | undefined>(() => {
    if (msg.role !== 'assistant' || msg.citations.length === 0) return undefined;
    return {
      byRef: buildCitationRefMap(msg.content, msg.citations),
      onClick: (cit, e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onFetchCitation(cit, rect.left, rect.top);
      },
    };
  }, [msg.role, msg.content, msg.citations, onFetchCitation]);

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0.1 } : spring}
      className={`mx-auto mb-6 flex w-full max-w-4xl ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={clsx(
          'notebook-chat-message text-[var(--text-primary)]',
          msg.role === 'assistant' && 'border border-[var(--notebook-border)]',
        )}
        data-role={msg.role}
      >
        {/* Message content — with edit mode for user messages */}
        {msg.role === 'user' && editingMsgId === msg.id ? (
          <div className="space-y-2">
            <NbTextarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="text-sm"
              rows={3}
              // autoFocus justifié : le champ n'apparaît qu'après action explicite
              // (clic sur « Modifier ») ; focus immédiat attendu pour l'édition.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <div className="flex items-center gap-2">
              <NbButton
                variant="primary"
                size="sm"
                onClick={() => onEditSubmit(msg.id)}
                disabled={!editingContent.trim()}
              >
                Renvoyer
              </NbButton>
              <NbButton variant="secondary" size="sm" onClick={onEditCancel}>
                Annuler
              </NbButton>
            </div>
          </div>
        ) : msg.role === 'assistant' ? (
          renderMessageContent(msg.content, citationLinks)
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
        )}

        {/* Actions bar */}
        {editingMsgId !== msg.id && (
          <div className="mt-2 flex flex-wrap items-center gap-1 pt-1">
            <p className="text-xs text-[var(--text-dimmed)]">
              {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>

            {/* Separator dot */}
            <span className="text-xs text-[var(--text-dimmed)]" aria-hidden="true">•</span>

            {msg.role === 'assistant' && (
              <>
                {/* Copy */}
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={isCopied ? Check : Copy}
                  onClick={() => onCopy(msg.id, msg.content)}
                  className={clsx(actionClass, isCopied && '!bg-[var(--color-success-subtle)] !text-[var(--color-success)]')}
                  title="Copier la réponse"
                  aria-label={isCopied ? "Copié" : "Copier la réponse"}
                >
                  {isCopied ? 'Copié' : 'Copier'}
                </NbButton>

                {/* Retry */}
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={RefreshCw}
                  onClick={() => onRetry(msg.id)}
                  disabled={loading}
                  className={actionClass}
                  title="Régénérer la réponse"
                  aria-label="Régénérer la réponse"
                >
                  Retry
                </NbButton>

                {/* TTS */}
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={isSpeaking ? Square : Volume2}
                  onClick={() => onTTS(msg.id, msg.content)}
                  data-active={isSpeaking ? 'true' : undefined}
                  className={actionClass}
                  title={isSpeaking ? 'Arrêter la lecture' : 'Lire à voix haute (TTS IA)'}
                  aria-label={isSpeaking ? "Arrêter la lecture" : "Lire à voix haute"}
                >
                  {isSpeaking ? (
                    <>
                      <span className="flex gap-[2px]" aria-hidden="true">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <span
                            key={i}
                            className="h-2 w-[2px] rounded-full bg-current"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </span>
                      Stop
                    </>
                  ) : (
                    'Écouter'
                  )}
                </NbButton>

                {/* Save to notes */}
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={StickyNote}
                  onClick={() => onSaveToNote(msg)}
                  className={actionClass}
                  title="Sauvegarder dans les notes"
                  aria-label="Sauvegarder dans les notes"
                >
                  Note
                </NbButton>

                {/* Save as Markdown */}
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  onClick={() => onOpenFolderPicker(msg)}
                  className={actionClass}
                  title="Enregistrer ce message en fichier Markdown (.md)"
                  aria-label="Enregistrer en Markdown"
                >
                  MD
                </NbButton>

                {/* Separator */}
                <span className="text-xs text-[var(--text-dimmed)]" aria-hidden="true">•</span>

                {/* Feedback thumbs */}
                <div className="flex gap-1">
                  <NbIconButton
                    icon={ThumbsUp}
                    label="Bonne réponse"
                    size="sm"
                    onClick={() => onFeedback(msg.id, 'up')}
                    className={clsx(feedback === 'up' && '!bg-[var(--color-success-subtle)] !text-[var(--color-success)]')}
                  />
                  <NbIconButton
                    icon={ThumbsDown}
                    label="Mauvaise réponse"
                    size="sm"
                    onClick={() => onFeedback(msg.id, 'down')}
                    className={clsx(feedback === 'down' && '!bg-[var(--color-error-subtle)] !text-[var(--color-error)]')}
                  />
                </div>
              </>
            )}

            {msg.role === 'user' && (
              <>
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={Pencil}
                  onClick={() => onEditStart(msg.id, msg.content)}
                  className={actionClass}
                  title="Modifier et renvoyer"
                  aria-label="Modifier le message"
                >
                  Modifier
                </NbButton>

                {/* Save user message as Markdown */}
                <NbButton
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  onClick={() => onOpenFolderPicker(msg)}
                  className={actionClass}
                  title="Enregistrer ce message en fichier Markdown (.md)"
                  aria-label="Enregistrer en Markdown"
                >
                  MD
                </NbButton>
              </>
            )}
          </div>
        )}

        {/* Citations */}
        {msg.citations.length > 0 && (
          <div className="mt-3 border-t border-[var(--notebook-border)] pt-2">
            <NbButton
              variant="ghost"
              size="sm"
              icon={Quote}
              onClick={() => setShowCitations(showCitations === msg.id ? null : msg.id)}
              className="!min-h-0 !px-2 !py-1"
              aria-expanded={showCitations === msg.id}
              aria-controls={`citations-${msg.id}`}
              aria-label={`${msg.citations.length} citation${msg.citations.length > 1 ? 's' : ''} disponibles`}
            >
              <span>
                {msg.citations.length} citation{msg.citations.length > 1 ? 's' : ''}
              </span>
              <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform duration-200', showCitations === msg.id && 'rotate-180')} aria-hidden />
            </NbButton>

            <AnimatePresence>
              {showCitations === msg.id && (
                <motion.div
                  id={`citations-${msg.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {/* Conteneur scrollable avec hauteur max */}
                  <div className="custom-scrollbar mt-3 max-h-96 space-y-2 overflow-y-auto">
                    {msg.citations.map((cit, i) => (
                      <div
                        key={cit.chunkId || i}
                        className="notebook-card p-3 text-[var(--text-muted)]"
                        data-interactive="true"
                      >
                        {/* Header avec titre + pertinence */}
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {cit.sourceTitle}
                          </span>
                          <NbBadge tone="accent">
                            {(cit.relevance * 100).toFixed(0)}% pertinent
                          </NbBadge>
                        </div>

                        {/* Extrait avec affichage complet au clic */}
                        <p className="line-clamp-3 cursor-pointer text-sm leading-relaxed">
                          {cit.excerpt}
                        </p>

                        {/* Bouton pour voir le détail */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            onFetchCitation(cit, rect.left, rect.top);
                          }}
                          className="mt-1 flex items-center gap-1 rounded text-xs text-[var(--notebook-accent)] opacity-80 transition-opacity hover:opacity-100 hover:underline"
                        >
                          Voir le détail <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
});

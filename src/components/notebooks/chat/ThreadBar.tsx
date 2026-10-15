/**
 * ThreadBar — sélecteur de fil de discussion (dropdown), compteur de tokens
 * estimé, et bouton « Nouveau ». Composant présentationnel.
 */

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, ChevronDown, Trash2, MessageSquarePlus } from 'lucide-react';
import { clsx } from 'clsx';
import { SPRING_UI } from '../motion.js';
import { NbButton, NbIconButton } from '../ui/primitives.js';
import type { ChatMessage, ChatThreadSummary } from './types.js';

interface Props {
  threads: ChatThreadSummary[];
  activeThreadId: string | null;
  showThreadList: boolean;
  setShowThreadList: (v: boolean) => void;
  messages: ChatMessage[];
  onSwitchThread: (threadId: string | null) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;
  prefersReducedMotion: boolean | null;
  /** Contrôle de l'assistant vocal, rendu à côté du bouton « Nouveau ». */
  voiceSlot?: ReactNode;
}

export function ThreadBar({
  threads, activeThreadId, showThreadList, setShowThreadList,
  messages, onSwitchThread, onDeleteThread, onNewThread, prefersReducedMotion,
  voiceSlot,
}: Props) {
  const tokenCount = Math.round(messages.reduce((acc, m) => acc + m.content.length / 4, 0));
  const tokenToneClass = messages.length > 40
    ? 'text-[var(--color-error)]'
    : messages.length > 20
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--text-dimmed)]';

  const rowClass = (active: boolean) => clsx(
    'flex cursor-pointer items-center gap-2 px-4 py-2 transition-colors hover:bg-[var(--notebook-accent-surface)] focus-visible:bg-[var(--notebook-accent-surface)] focus-visible:outline-none',
    active && 'bg-[var(--notebook-accent-surface)]',
  );
  const rowIconClass = (active: boolean) => clsx(
    'h-3 w-3 flex-shrink-0',
    active ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-dimmed)]',
  );
  const rowLabelClass = (active: boolean) => clsx(
    'flex-1 truncate text-sm font-medium',
    active ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-primary)]',
  );

  return (
    <div className="notebook-panel-header !justify-start">
      <h2 className="notebook-panel-title flex-shrink-0">Discussion</h2>
      <span className="h-4 w-px flex-shrink-0 bg-[var(--notebook-border)]" aria-hidden />
      {/* Thread selector */}
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setShowThreadList(!showThreadList)}
          aria-expanded={showThreadList}
          className="notebook-ghost-button max-w-[250px] !text-[var(--text-primary)]"
        >
          <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 text-[var(--notebook-accent)]" />
          <span className="truncate">
            {threads.find(t => t.id === activeThreadId)?.title || 'Conversation principale'}
          </span>
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-[var(--text-dimmed)]" />
        </button>

        {/* Thread dropdown */}
        <AnimatePresence>
          {showThreadList && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
              className="absolute left-0 top-full z-40 mt-1 w-72 origin-top-left overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] shadow-[var(--notebook-shadow-lg)]"
            >
              <div className="custom-scrollbar max-h-60 overflow-y-auto">
                {/* Main conversation option */}
                <div
                  role="button"
                  tabIndex={0}
                  className={clsx(rowClass(activeThreadId === null), 'border-b border-[var(--notebook-border)]')}
                  onClick={() => onSwitchThread(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchThread(null); } }}
                >
                  <MessageCircle className={rowIconClass(activeThreadId === null)} />
                  <span className={rowLabelClass(activeThreadId === null)}>
                    Conversation principale
                  </span>
                </div>

                {/* Thread list */}
                {threads.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-[var(--text-dimmed)]">
                    Pas de conversations supplémentaires.
                  </p>
                ) : (
                  threads.map(thread => (
                    <div
                      key={thread.id}
                      role="button"
                      tabIndex={0}
                      className={clsx('group', rowClass(thread.id === activeThreadId))}
                      onClick={() => onSwitchThread(thread.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchThread(thread.id); } }}
                    >
                      <MessageCircle className={rowIconClass(thread.id === activeThreadId)} />
                      <span className={rowLabelClass(thread.id === activeThreadId)}>
                        {thread.title}
                      </span>
                      <NbIconButton
                        icon={Trash2}
                        label="Supprimer la conversation"
                        size="sm"
                        tone="danger"
                        onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id); }}
                        className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                      />
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Token counter (estimated) */}
      <div
        className="notebook-badge !text-xs"
        title="Estimation des tokens utilisés dans cette conversation"
      >
        <span className={tokenToneClass}>
          ~{tokenCount.toLocaleString()}
        </span>
        <span className="text-[var(--text-dimmed)]">tokens</span>
      </div>

      {/* Assistant vocal — Interroger vos sources */}
      {voiceSlot}

      {/* New thread button */}
      <NbButton
        variant="secondary"
        size="sm"
        icon={MessageSquarePlus}
        onClick={onNewThread}
        title="Nouvelle conversation"
        className="!text-[var(--notebook-accent)]"
      >
        <span className="hidden sm:inline">Nouveau</span>
      </NbButton>
    </div>
  );
}

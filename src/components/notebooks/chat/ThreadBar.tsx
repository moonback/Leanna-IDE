/**
 * ThreadBar — onglets des fils de discussion (conversation principale + fils),
 * bouton « + » nouvelle conversation, menu historique complet, compteur de
 * tokens estimé. Composant présentationnel.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, Home, Trash2, Plus, History, X } from 'lucide-react';
import { clsx } from 'clsx';
import { SPRING_UI } from '../motion.js';
import { NbIconButton } from '../ui/primitives.js';
import type { ChatMessage, ChatThreadSummary } from './types.js';

interface Props {
  threads: ChatThreadSummary[];
  mainSummary: Pick<ChatThreadSummary, 'messageCount' | 'preview'>;
  activeThreadId: string | null;
  showThreadList: boolean;
  setShowThreadList: (v: boolean) => void;
  messages: ChatMessage[];
  loading: boolean;
  onSwitchThread: (threadId: string | null) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;
  prefersReducedMotion: boolean | null;
  /** Contrôle de l'assistant vocal, rendu à droite de la barre. */
  voiceSlot?: ReactNode;
}

const GENERIC_TITLE = /^(Conversation \d+|Nouvelle conversation)$/;

interface Tab {
  id: string | null;
  label: string;
  count: number;
  date?: string;
}

export function ThreadBar({
  threads, mainSummary, activeThreadId, showThreadList, setShowThreadList,
  messages, loading, onSwitchThread, onDeleteThread, onNewThread, prefersReducedMotion,
  voiceSlot,
}: Props) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const tokenCount = Math.round(messages.reduce((acc, m) => acc + m.content.length / 4, 0));
  const tokenToneClass = messages.length > 40
    ? 'text-[var(--color-error)]'
    : messages.length > 20
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--text-dimmed)]';

  // Le fil affiché a des messages à jour : on s'en sert plutôt que du résumé serveur.
  const livePreview = messages.find(m => m.role === 'user')?.content.slice(0, 80);
  const tabs: Tab[] = [
    {
      id: null,
      label: (activeThreadId === null ? livePreview : mainSummary.preview) || 'Principale',
      count: activeThreadId === null ? messages.length : mainSummary.messageCount ?? 0,
    },
    ...threads.map(t => {
      const active = t.id === activeThreadId;
      const preview = active ? livePreview : t.preview;
      return {
        id: t.id,
        label: (GENERIC_TITLE.test(t.title) && preview) || t.title,
        count: active ? messages.length : t.messageCount ?? 0,
        date: t.createdAt,
      };
    }),
  ];

  // Garde l'onglet actif visible quand la barre défile.
  useEffect(() => {
    tablistRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeThreadId, threads.length]);

  return (
    <div className="notebook-panel-header !justify-start !gap-1">
      {/* Onglets */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Conversations"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(tab => {
          const active = tab.id === activeThreadId;
          const Icon = tab.id === null ? Home : MessageCircle;
          return (
            <div
              key={tab.id ?? 'main'}
              className={clsx(
                'group relative flex flex-shrink-0 items-center rounded-lg transition-colors',
                active
                  ? 'bg-[var(--notebook-accent-surface)]'
                  : 'hover:bg-[var(--notebook-surface-elevated)]',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                disabled={loading && !active}
                title={tab.id === null ? `Conversation principale — ${tab.label}` : tab.label}
                onClick={() => onSwitchThread(tab.id)}
                className={clsx(
                  'flex h-7 max-w-[180px] items-center gap-1.5 pl-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50',
                  tab.id === null ? 'pr-2.5' : 'pr-1',
                  active ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-muted)]',
                )}
              >
                <Icon className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
              {tab.id !== null && (
                <button
                  type="button"
                  aria-label={`Supprimer « ${tab.label} »`}
                  title="Supprimer la conversation"
                  onClick={() => onDeleteThread(tab.id!)}
                  className={clsx(
                    'mr-1 flex h-4 w-4 items-center justify-center rounded text-[var(--text-dimmed)] hover:bg-[var(--notebook-border)] hover:text-[var(--color-error)] focus-visible:opacity-100',
                    active ? 'opacity-60' : 'opacity-0 group-hover:opacity-60',
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <NbIconButton
        icon={Plus}
        label="Nouvelle conversation"
        size="sm"
        onClick={onNewThread}
        disabled={loading}
      />

      {/* Historique complet */}
      <div className="relative" onKeyDown={(e) => { if (e.key === 'Escape') setShowThreadList(false); }}>
        <NbIconButton
          icon={History}
          label="Toutes les conversations"
          size="sm"
          active={showThreadList}
          aria-expanded={showThreadList}
          onClick={() => setShowThreadList(!showThreadList)}
        />
        <AnimatePresence>
          {showThreadList && (
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setShowThreadList(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
                className="absolute right-0 top-full z-40 mt-1 w-80 origin-top-right overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] shadow-[var(--notebook-shadow-lg)]"
              >
                <p className="border-b border-[var(--notebook-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dimmed)]">
                  {tabs.length} conversation{tabs.length > 1 ? 's' : ''}
                </p>
                <div className="custom-scrollbar max-h-72 overflow-y-auto py-1">
                  {[...tabs].reverse().map(tab => {
                    const active = tab.id === activeThreadId;
                    const Icon = tab.id === null ? Home : MessageCircle;
                    return (
                      <div
                        key={tab.id ?? 'main'}
                        className={clsx(
                          'group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--notebook-accent-surface)]',
                          active && 'bg-[var(--notebook-accent-surface)]',
                        )}
                      >
                        <button
                          type="button"
                          disabled={loading && !active}
                          onClick={() => onSwitchThread(tab.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
                        >
                          <Icon className={clsx('h-3.5 w-3.5 flex-shrink-0', active ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-dimmed)]')} />
                          <span className="min-w-0 flex-1">
                            <span className={clsx('block truncate text-sm', active ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-primary)]')}>
                              {tab.label}
                            </span>
                            <span className="block text-[11px] text-[var(--text-dimmed)]">
                              {tab.id === null
                                ? 'Conversation principale'
                                : tab.date && new Date(tab.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                              {' · '}{tab.count} message{tab.count > 1 ? 's' : ''}
                            </span>
                          </span>
                        </button>
                        {tab.id !== null && (
                          <NbIconButton
                            icon={Trash2}
                            label="Supprimer la conversation"
                            size="sm"
                            tone="danger"
                            onClick={() => onDeleteThread(tab.id!)}
                            className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Token counter (estimated) */}
      <div
        className="notebook-badge flex-shrink-0 !text-xs"
        title="Estimation des tokens utilisés dans cette conversation"
      >
        <span className={tokenToneClass}>~{tokenCount.toLocaleString()}</span>
        <span className="hidden text-[var(--text-dimmed)] md:inline">tokens</span>
      </div>

      {voiceSlot}
    </div>
  );
}

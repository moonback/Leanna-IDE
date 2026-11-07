/**
 * Composer — zone de saisie minimaliste : textarea pleine largeur, puis une
 * barre discrète (périmètre des sources, ton, menu « Outils », envoi).
 * Toutes les actions secondaires (deep-dive, insights, comparaison, demandes
 * avec contexte, export, effacer) sont regroupées dans le menu Outils.
 * Présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  X, Filter, Telescope, Zap, GitCompare, Lightbulb, ArrowUp, Loader2, Download, Trash2, Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SPRING_UI } from '../motion.js';
import { NbButton } from '../ui/primitives.js';
import type { Personality } from './constants.js';
import type { ChatMessage } from './types.js';

interface Props {
  sources: { id: string; title: string }[];
  input: string;
  setInput: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  loading: boolean;
  queuedCount: number;
  messages: ChatMessage[];
  selectedSources: string[];
  showSourceFilter: boolean;
  setShowSourceFilter: (v: boolean) => void;
  toggleSourceFilter: (sourceId: string) => void;
  clearSourceFilter: () => void;
  showSlashMenu: boolean;
  filteredSlashCommands: { cmd: string; desc: string; prompt: string }[];
  showContextMenu: boolean;
  setShowContextMenu: (v: boolean) => void;
  contextSuggestions: { label: string; prompt: string }[];
  personalities: Personality[];
  personality: string;
  setPersonality: (v: string) => void;
  showPersonalityMenu: boolean;
  setShowPersonalityMenu: (v: boolean) => void;
  currentPersonality: Personality;
  prefersReducedMotion: boolean | null;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSubmit: () => void;
  onSend: (question: string) => void;
  onDeepDive: () => void;
  onInsights: () => void;
  onCompare: () => void;
  onExport: () => void;
  onClear: () => void;
}

const POPOVER =
  'absolute bottom-full z-50 mb-2 overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] shadow-[var(--notebook-shadow-lg)]';
const PILL =
  'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors hover:bg-[var(--notebook-accent-surface)] disabled:opacity-40';

function MenuItem({ icon: Icon, label, hint, onClick, disabled, danger }: {
  icon: LucideIcon; label: string; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--notebook-accent-surface)] disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon size={14} className={clsx('flex-shrink-0', danger ? 'text-[var(--color-error)]' : 'text-[var(--text-muted)]')} />
      <span className={clsx('flex-1 text-sm', danger ? 'text-[var(--color-error)]' : 'text-[var(--text-primary)]')}>{label}</span>
      {hint && <span className="text-[11px] text-[var(--text-dimmed)]">{hint}</span>}
    </button>
  );
}

function MenuSection({ title }: { title: string }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dimmed)]">
      {title}
    </p>
  );
}

export function Composer(props: Props) {
  const {
    sources, input, setInput, inputRef, loading, queuedCount, messages,
    selectedSources, showSourceFilter, setShowSourceFilter, toggleSourceFilter, clearSourceFilter,
    showSlashMenu, filteredSlashCommands, showContextMenu, setShowContextMenu, contextSuggestions,
    personalities, personality, setPersonality, showPersonalityMenu, setShowPersonalityMenu, currentPersonality,
    prefersReducedMotion, onInputChange, onKeyDown, onSubmit, onSend, onDeepDive, onInsights, onCompare, onExport, onClear,
  } = props;

  const canSend = !!input.trim() && !loading;
  const closeTools = () => setShowContextMenu(false);
  const PIcon = currentPersonality.icon;

  return (
    <div className="flex-shrink-0 px-3 pb-3 pt-2 lg:px-5">
      <div className="mx-auto max-w-4xl">
        {/* Source filter bar */}
        <AnimatePresence>
          {showSourceFilter && sources.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-2 overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-1.5 px-1">
                {sources.map(s => {
                  const isSelected = selectedSources.includes(s.id);
                  const isActive = isSelected || selectedSources.length === 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleSourceFilter(s.id)}
                      title={s.title}
                      className={clsx(
                        'rounded-full border px-2.5 py-0.5 text-xs transition-all active:scale-95',
                        isSelected
                          ? 'border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]'
                          : 'border-[var(--notebook-border)] text-[var(--text-muted)]',
                        !isActive && 'opacity-40',
                      )}
                    >
                      {s.title.length > 25 ? s.title.slice(0, 25) + '…' : s.title}
                    </button>
                  );
                })}
                {selectedSources.length > 0 && (
                  <NbButton variant="ghost" size="sm" icon={X} onClick={clearSourceFilter}>
                    Reset
                  </NbButton>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Slash command menu */}
        <AnimatePresence>
          {showSlashMenu && filteredSlashCommands.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mb-2 overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] shadow-[var(--notebook-shadow-md)]"
            >
              {filteredSlashCommands.map((cmd) => (
                <button
                  key={cmd.cmd}
                  type="button"
                  onClick={() => { setInput(''); onSend(cmd.prompt); }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--notebook-accent-surface)]"
                >
                  <code className="font-mono text-sm font-semibold text-[var(--notebook-accent)]">
                    {cmd.cmd}
                  </code>
                  <span className="text-xs text-[var(--text-muted)]">
                    {cmd.desc}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Carte de saisie */}
        <div className="rounded-2xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] shadow-[var(--notebook-shadow-sm)] transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--notebook-accent)] focus-within:ring-2 focus-within:ring-[var(--notebook-glow)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={'Posez une question sur vos sources... (/ pour les commandes)'}
            rows={1}
            className="block max-h-[160px] min-h-[44px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dimmed)]"
          />

          <div className="flex items-center gap-0.5 px-2 pb-2">
            {/* Périmètre des sources */}
            {sources.length > 1 && (
              <button
                type="button"
                aria-pressed={showSourceFilter}
                aria-label="Filtrer les sources"
                title="Filtrer les sources"
                onClick={() => setShowSourceFilter(!showSourceFilter)}
                className={clsx(
                  PILL,
                  selectedSources.length > 0 || showSourceFilter ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-muted)]',
                )}
              >
                <Filter size={13} />
                <span>
                  {selectedSources.length > 0
                    ? `${selectedSources.length}/${sources.length} sources`
                    : 'Toutes les sources'}
                </span>
              </button>
            )}

            {/* Ton de l'assistant */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPersonalityMenu(!showPersonalityMenu)}
                aria-expanded={showPersonalityMenu}
                title="Ton de l'assistant"
                className={clsx(PILL, 'text-[var(--text-muted)]')}
              >
                <PIcon size={13} />
                <span>{currentPersonality.label}</span>
              </button>

              <AnimatePresence>
                {showPersonalityMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
                    className={clsx(POPOVER, 'left-0 w-56 origin-bottom-left')}
                  >
                    <MenuSection title="Ton de l'assistant" />
                    {personalities.map((p) => {
                      const isCurrent = personality === p.id;
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPersonality(p.id); setShowPersonalityMenu(false); }}
                          className={clsx(
                            'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--notebook-accent-surface)]',
                            isCurrent && 'bg-[var(--notebook-accent-surface)]',
                          )}
                        >
                          <Icon size={14} className="flex-shrink-0 text-[var(--text-muted)]" />
                          <div className="min-w-0 flex-1">
                            <p className={clsx('text-xs font-medium', isCurrent ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-primary)]')}>
                              {p.label}
                            </p>
                            <p className="truncate text-xs text-[var(--text-dimmed)]">{p.desc}</p>
                          </div>
                          {isCurrent && (
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--notebook-accent)]" />
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {queuedCount > 0 && (
              <span className="ml-1 text-xs text-[var(--notebook-accent)]">{queuedCount} en attente</span>
            )}

            <div className="flex-1" />

            {/* Outils : toutes les actions secondaires */}
            <div className="context-menu-container relative">
              <button
                type="button"
                aria-expanded={showContextMenu}
                aria-haspopup="menu"
                title="Outils d'analyse"
                onClick={() => setShowContextMenu(!showContextMenu)}
                className={clsx(PILL, showContextMenu ? 'text-[var(--notebook-accent)]' : 'text-[var(--text-muted)]')}
              >
                <Sparkles size={13} />
                <span className="hidden sm:inline">Outils</span>
              </button>

              <AnimatePresence>
                {showContextMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className={clsx(POPOVER, 'right-0 max-h-[60vh] w-64 overflow-y-auto pb-1')}
                  >
                    <MenuSection title="Analyse" />
                    <MenuItem
                      icon={Telescope}
                      label="Deep Dive"
                      hint={input.trim() ? undefined : 'saisir une question'}
                      disabled={!input.trim() || loading}
                      onClick={() => { closeTools(); onDeepDive(); }}
                    />
                    <MenuItem
                      icon={Zap}
                      label="Insights clés"
                      disabled={loading}
                      onClick={() => { closeTools(); onInsights(); }}
                    />
                    {sources.length >= 2 && (
                      <MenuItem
                        icon={GitCompare}
                        label="Comparer les sources"
                        disabled={loading}
                        onClick={() => { closeTools(); onCompare(); }}
                      />
                    )}

                    {contextSuggestions.length > 0 && <MenuSection title="Avec contexte complet" />}
                    {contextSuggestions.map((s) => (
                      <MenuItem
                        key={s.label}
                        icon={Lightbulb}
                        label={s.label}
                        disabled={loading}
                        onClick={() => { closeTools(); setInput(''); onSend(s.prompt); }}
                      />
                    ))}

                    {messages.length > 0 && (
                      <>
                        <MenuSection title="Conversation" />
                        <MenuItem icon={Download} label="Exporter en Markdown" onClick={() => { closeTools(); onExport(); }} />
                        <MenuItem icon={Trash2} label="Effacer l'historique" danger onClick={() => { closeTools(); onClear(); }} />
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Envoi */}
            <button
              type="button"
              aria-label="Envoyer"
              title="Envoyer (Entrée)"
              onClick={onSubmit}
              disabled={!canSend}
              aria-busy={loading || undefined}
              className={clsx(
                'ml-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all',
                canSend
                  ? 'bg-[var(--notebook-accent)] text-[var(--notebook-accent-text)] hover:opacity-90 active:scale-95'
                  : 'bg-[var(--notebook-border)] text-[var(--text-dimmed)]',
              )}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

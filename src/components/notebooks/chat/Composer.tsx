/**
 * Composer — zone de saisie : barre de filtre de sources, menu slash, textarea,
 * boutons d'action (deep-dive / insights / compare / contexte / envoi), et barre
 * basse (indices, sélecteur de personnalité, export, effacer). Présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  X, Filter, Telescope, Zap, GitCompare, Lightbulb, Send, Loader2, Download, Trash2,
} from 'lucide-react';
import { SPRING_UI } from '../motion.js';
import { NbButton, NbIconButton } from '../ui/primitives.js';
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

export function Composer(props: Props) {
  const {
    sources, input, setInput, inputRef, loading, queuedCount, messages,
    selectedSources, showSourceFilter, setShowSourceFilter, toggleSourceFilter, clearSourceFilter,
    showSlashMenu, filteredSlashCommands, showContextMenu, setShowContextMenu, contextSuggestions,
    personalities, personality, setPersonality, showPersonalityMenu, setShowPersonalityMenu, currentPersonality,
    prefersReducedMotion, onInputChange, onKeyDown, onSubmit, onSend, onDeepDive, onInsights, onCompare, onExport, onClear,
  } = props;

  const canSend = !!input.trim() && !loading;

  return (
    <div className="flex-shrink-0 px-3 pb-3 pt-2 lg:px-5">
      {/* Source filter bar */}
      {showSourceFilter && sources.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="mb-2 overflow-hidden"
        >
          <div className="notebook-card flex flex-wrap items-center gap-2 p-2">
            <span className="flex-shrink-0 text-xs font-semibold text-[var(--text-dimmed)]">
              Sources actives :
            </span>
            {sources.map(s => {
              const isSelected = selectedSources.includes(s.id);
              const isActive = isSelected || selectedSources.length === 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleSourceFilter(s.id)}
                  className={clsx(
                    'rounded-full border border-[var(--notebook-border)] px-3 py-1 text-xs font-medium transition-all active:scale-95',
                    isSelected
                      ? 'bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]'
                      : 'bg-[var(--notebook-surface)] text-[var(--text-muted)]',
                    isActive ? 'ring-1 ring-[var(--notebook-accent)]' : 'opacity-40',
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

      {/* Main input container */}
      <div
        className="relative mx-auto flex max-w-4xl items-end rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] shadow-[var(--notebook-shadow-sm)] transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--notebook-accent)] focus-within:ring-2 focus-within:ring-[var(--notebook-glow)]"
      >
        {/* Left actions — filter */}
        <div className="flex flex-shrink-0 items-center py-2 pl-1.5">
          {sources.length > 1 && (
            <span className="relative inline-flex">
              <NbIconButton
                icon={Filter}
                label="Filtrer les sources"
                active={showSourceFilter || selectedSources.length > 0}
                onClick={() => setShowSourceFilter(!showSourceFilter)}
              />
              {selectedSources.length > 0 && (
                <span
                  className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--notebook-accent)] px-1 text-xs font-bold leading-none text-[var(--notebook-accent-text)]"
                  aria-hidden
                >
                  {selectedSources.length}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder={'Posez une question sur vos sources... (/ pour les commandes)'}
          rows={1}
          className="max-h-[110px] min-h-[42px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dimmed)]"
        />

        {/* Right action buttons */}
        <div className="context-menu-container relative flex flex-shrink-0 items-center gap-0.5 px-1.5 py-2">
          <NbIconButton
            icon={Telescope}
            label="Deep Dive — exploration approfondie"
            onClick={onDeepDive}
            disabled={!input.trim() || loading}
            className="!text-[var(--notebook-accent)]"
          />

          <NbIconButton
            icon={Zap}
            label="Extraire les insights clés"
            onClick={onInsights}
            disabled={loading}
            className="!text-[var(--color-warning)]"
          />

          {sources.length >= 2 && (
            <NbIconButton
              icon={GitCompare}
              label="Comparer les sources"
              onClick={onCompare}
              disabled={loading}
              className="!text-[var(--color-accent-alt)]"
            />
          )}

          {/* Context Menu Button */}
          <NbIconButton
            icon={Lightbulb}
            label="Demandes avec contexte complet"
            onClick={() => setShowContextMenu(!showContextMenu)}
            disabled={loading}
            className="!text-[var(--notebook-accent)]"
          />

          {/* Context Menu Dropdown */}
          <AnimatePresence>
            {showContextMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full right-0 z-50 mb-1 w-60 overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] shadow-[var(--notebook-shadow-lg)]"
              >
                <div className="border-b border-[var(--notebook-border)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--text-dimmed)]">
                    Demandes avec contexte complet
                  </p>
                </div>
                {contextSuggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => { setInput(''); onSend(s.prompt); setShowContextMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--notebook-accent-surface)]"
                  >
                    <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 text-[var(--notebook-accent)]" />
                    <span className="text-sm text-[var(--text-primary)]">{s.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Separator */}
          <div className="mx-1 h-5 w-px bg-[var(--notebook-border)]" />

          {/* Send button */}
          <NbIconButton
            icon={loading ? Loader2 : Send}
            label="Envoyer"
            onClick={onSubmit}
            disabled={!canSend}
            aria-busy={loading || undefined}
            className={clsx(
              loading && '[&>svg]:animate-spin',
              canSend && '!bg-[var(--notebook-accent)] !text-[var(--notebook-accent-text)] hover:!opacity-90',
            )}
          />
        </div>
      </div>

      {/* Bottom bar — hints + personality + secondary actions */}
      <div className="mt-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-[var(--text-dimmed)]">
            Entrée pour envoyer • / commandes
            {queuedCount > 0 && (
              <span className="text-[var(--notebook-accent)]">
                {' '}• {queuedCount} en attente
              </span>
            )}
            {selectedSources.length > 0 && (
              <span className="text-[var(--notebook-accent)]"> • {selectedSources.length} source{selectedSources.length > 1 ? 's' : ''}</span>
            )}
          </p>

          {/* Personality selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPersonalityMenu(!showPersonalityMenu)}
              aria-expanded={showPersonalityMenu}
              className="notebook-chip !px-2 !py-0.5 !text-xs"
            >
              {(() => { const PIcon = currentPersonality.icon; return <span className="inline-flex items-center"><PIcon size={13} /></span>; })()}
              <span>{currentPersonality.label}</span>
            </button>

            <AnimatePresence>
              {showPersonalityMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
                  className="absolute bottom-full left-0 z-40 mb-1 w-56 origin-bottom-left overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] shadow-[var(--notebook-shadow-lg)]"
                >
                  <div className="border-b border-[var(--notebook-border)] px-3 py-2">
                    <p className="text-xs font-semibold text-[var(--text-dimmed)]">Ton de l'assistant</p>
                  </div>
                  {personalities.map((p) => {
                    const isCurrent = personality === p.id;
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
                        {(() => { const PIcon = p.icon; return <span className="inline-flex items-center text-[var(--text-muted)]"><PIcon size={14} /></span>; })()}
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
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <>
              <NbIconButton
                icon={Download}
                label="Exporter en Markdown"
                size="sm"
                onClick={onExport}
              />
              <NbIconButton
                icon={Trash2}
                label="Effacer l'historique"
                size="sm"
                tone="danger"
                onClick={onClear}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

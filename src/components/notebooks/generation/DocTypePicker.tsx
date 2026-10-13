/**
 * DocTypePicker — barre de configuration (sources / prompt), dropdowns associés,
 * bouton « Rapport complet » (ouvre le modal) et grille des types de documents.
 * Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { Filter, PenLine, FileBarChart, ArrowRight, Loader2 } from 'lucide-react';
import type { SpringTransition } from '../motionTypes.js';
import { NbButton, NbTextarea, NbSectionLabel, NbBadge } from '../ui/primitives.js';
import { DOC_TYPES } from './constants.js';
import type { SourceItem } from './types.js';

interface Props {
  sources: SourceItem[];
  showSourceFilter: boolean;
  setShowSourceFilter: (v: boolean) => void;
  showCustomPrompt: boolean;
  setShowCustomPrompt: (v: boolean) => void;
  selectedSourceIds: string[];
  setSelectedSourceIds: (ids: string[]) => void;
  toggleSourceSelection: (sourceId: string) => void;
  customInstructions: string;
  setCustomInstructions: (v: string) => void;
  activeGenerationIds: Set<string>;
  generationQueue: { id: string; type: string }[];
  onOpenReportModal: () => void;
  onGenerate: (type: string) => void;
  onOpenInfographic: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reportModalTriggerRef: React.RefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  infographicModalTriggerRef: React.RefObject<any>;
  reduceMotion: boolean | null;
  modalSpring: SpringTransition;
}

export function DocTypePicker({
  sources,
  showSourceFilter,
  setShowSourceFilter,
  showCustomPrompt,
  setShowCustomPrompt,
  selectedSourceIds,
  setSelectedSourceIds,
  toggleSourceSelection,
  customInstructions,
  setCustomInstructions,
  activeGenerationIds,
  generationQueue,
  onOpenReportModal,
  onGenerate,
  onOpenInfographic,
  reportModalTriggerRef,
  infographicModalTriggerRef,
  reduceMotion,
  modalSpring,
}: Props) {
  const sourceFilterOn = showSourceFilter || selectedSourceIds.length > 0;
  const promptOn = showCustomPrompt || !!customInstructions.trim();
  return (
    <>
      {/* Quick config bar */}
      <div className="flex items-center gap-2">
        {sources.length > 1 && (
          <button
            type="button"
            onClick={() => setShowSourceFilter(!showSourceFilter)}
            className={clsx(
              'notebook-chip text-xs',
              sourceFilterOn && 'border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]',
            )}
          >
            <Filter className="h-3 w-3" aria-hidden />
            {selectedSourceIds.length > 0 ? `${selectedSourceIds.length} src` : 'Sources'}
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowCustomPrompt(!showCustomPrompt)}
          className={clsx(
            'notebook-chip text-xs',
            promptOn && 'border-[var(--color-warning)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
          )}
        >
          <PenLine className="h-3 w-3" aria-hidden />
          Prompt
          {customInstructions.trim() && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />}
        </button>

        <span className="ml-auto text-xs text-[var(--text-muted)]">
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Source filter dropdown */}
      <AnimatePresence>
        {showSourceFilter && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={modalSpring}
            className="overflow-hidden"
          >
            <div className="notebook-card space-y-1 rounded-xl p-2">
              {sources.map(src => (
                <label
                  key={src.id}
                  htmlFor={`doctype-src-${src.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--notebook-surface-muted)]"
                >
                  <input
                    id={`doctype-src-${src.id}`}
                    type="checkbox"
                    checked={selectedSourceIds.length === 0 || selectedSourceIds.includes(src.id)}
                    onChange={() => toggleSourceSelection(src.id)}
                    className="h-3 w-3 rounded accent-[var(--notebook-accent)]"
                  />
                  <span className="truncate text-xs text-[var(--text-primary)]">{src.title}</span>
                </label>
              ))}
              {selectedSourceIds.length > 0 && (
                <NbButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSourceIds([])}
                  className="w-full justify-start text-[var(--notebook-accent)]"
                >
                  Réinitialiser (toutes)
                </NbButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom instructions dropdown */}
      <AnimatePresence>
        {showCustomPrompt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={modalSpring}
            className="overflow-hidden"
          >
            <NbTextarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="Ex: Ton formel, focus technique, ajoute des exemples..."
              rows={2}
              className="text-xs"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate buttons — redesigned grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <NbSectionLabel>Générer</NbSectionLabel>
          {activeGenerationIds.size > 0 && (
            <NbBadge tone="accent" icon={Loader2} className="[&>svg]:animate-spin">
              {activeGenerationIds.size > 1 ? `${activeGenerationIds.size} en cours...` : 'En cours...'}
            </NbBadge>
          )}
        </div>

        {/* Bouton principal — Rapport complet (ouvre le modal) */}
        <button
          ref={reportModalTriggerRef}
          type="button"
          onClick={onOpenReportModal}
          disabled={sources.length === 0}
          className="notebook-studio-card flex w-full items-center gap-3 rounded-xl p-3 text-left active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
          title="Choisir un type de rapport • Suggestions IA incluses"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--color-error)_25%,transparent)] bg-[var(--color-error-subtle)]">
            <FileBarChart className="h-4 w-4 text-[var(--color-error)]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Rapport complet
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Types avancés
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)]" aria-hidden />
        </button>

        {/* Types rapides — 3 par ligne */}
        <div className="grid grid-cols-3 gap-2">
          {DOC_TYPES.filter(t => t.key !== 'full-report').map(({ key, label, icon: Icon, desc, color }) => {
            const isActive = [...activeGenerationIds].some(taskId => {
              const task = generationQueue.find(t => t.id === taskId);
              return task && task.type === key;
            });
            return (
              <motion.button
                key={key}
                type="button"
                ref={key === 'infographic' ? infographicModalTriggerRef : undefined}
                onClick={() => key === 'infographic' ? onOpenInfographic() : onGenerate(key)}
                disabled={sources.length === 0}
                whileTap={sources.length > 0 && !reduceMotion ? { scale: 0.98 } : {}}
                className="notebook-studio-card group relative flex w-full flex-col items-center gap-1 rounded-xl p-2 text-center disabled:pointer-events-none disabled:opacity-40"
                style={isActive ? {
                  borderColor: color,
                  backgroundColor: `color-mix(in srgb, ${color} 6%, var(--notebook-card-bg))`,
                } : undefined}
                title={desc}
              >
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
                >
                  {isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color }} aria-hidden />
                  ) : (
                    <Icon className="h-4 w-4" style={{ color }} aria-hidden />
                  )}
                </div>

                <span className="w-full truncate text-xs font-medium text-[var(--text-primary)]">
                  {label}
                </span>

                {isActive && (
                  <motion.div
                    layoutId="activeGenType"
                    className="pointer-events-none absolute inset-0 rounded-xl opacity-60"
                    style={{ border: `1.5px solid ${color}` }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Source count info */}
      {sources.length === 0 && (
        <p className="rounded-lg bg-[var(--notebook-surface-muted)] px-3 py-2 text-center text-xs text-[var(--text-dimmed)]">
          Ajoutez des sources pour activer la génération
        </p>
      )}
    </>
  );
}

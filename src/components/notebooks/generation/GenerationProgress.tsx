/**
 * GenerationProgress — barre de progression des générations actives + file
 * d'attente repliable. Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, CheckCircle2, X, RefreshCw, ChevronDown } from 'lucide-react';
import { NbIconButton } from '../ui/primitives.js';
import type { SpringTransition } from '../motionTypes.js';
import { DOC_TYPES, REPORT_TYPES, getDocTypeColor, getDocTypeLabel } from './constants.js';
import type { QueuedGeneration } from './types.js';

interface Props {
  activeGenerationIds: Set<string>;
  generationQueue: QueuedGeneration[];
  generationProgresses: Record<string, number>;
  showQueue: boolean;
  setShowQueue: (v: boolean) => void;
  onRetryTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  modalSpring: SpringTransition;
}

export function GenerationProgress({
  activeGenerationIds,
  generationQueue,
  generationProgresses,
  showQueue,
  setShowQueue,
  onRetryTask,
  onCancelTask,
  modalSpring,
}: Props) {
  return (
    <div className="notebook-card rounded-xl p-3">
      {/* Barre de progression pour la génération en cours */}
      {activeGenerationIds.size > 0 ? (
        <div className="space-y-3">
          {[...activeGenerationIds].map(taskId => {
            const task = generationQueue.find(t => t.id === taskId);
            if (!task) return null;

            const color = getDocTypeColor(task.type);
            const docType = DOC_TYPES.find(t => t.key === task.type) || REPORT_TYPES.find(t => t.key === task.type);
            const Icon = docType?.icon || Sparkles;
            const progress = generationProgresses[taskId] || 0;

            return (
              <div key={taskId} className="flex items-center gap-2">
                <div
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                >
                  <Icon className="h-3 w-3" style={{ color }} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                    {getDocTypeLabel(task.type)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums" style={{ color }}>
                      {progress}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Sparkles className="h-3 w-3" aria-hidden />
          <span>Prêt à générer</span>
          {generationQueue.length > 0 && (
            <span className="ml-1">({generationQueue.filter(t => t.status === 'pending').length} en attente)</span>
          )}
        </div>
      )}

      {/* File d'attente */}
      {generationQueue.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[var(--notebook-border)] pt-3">
          <button
            type="button"
            onClick={() => setShowQueue(!showQueue)}
            aria-expanded={showQueue}
            className="flex w-full items-center justify-between rounded-lg text-left"
          >
            <span className="notebook-eyebrow">
              File d'attente ({generationQueue.filter(t => t.status === 'pending').length})
            </span>
            <motion.span
              animate={{ rotate: showQueue ? 180 : 0 }}
              className="inline-flex text-[var(--text-muted)]"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </motion.span>
          </button>

          <AnimatePresence>
            {showQueue && generationQueue.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={modalSpring}
                className="space-y-2 overflow-hidden pt-2"
              >
                {generationQueue.map((task, index) => {
                  const docType = DOC_TYPES.find(t => t.key === task.type) || REPORT_TYPES.find(t => t.key === task.type);
                  const Icon = docType?.icon || Sparkles;
                  const color = getDocTypeColor(task.type);
                  const generating = task.status === 'generating';

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      className="rounded-lg border p-2 transition-colors"
                      style={{
                        borderColor: generating ? color : 'var(--notebook-border)',
                        backgroundColor: generating ? `color-mix(in srgb, ${color} 6%, transparent)` : 'var(--notebook-surface-muted)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                        >
                          {generating ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color }} aria-hidden />
                          ) : task.status === 'completed' ? (
                            <CheckCircle2 className="h-2.5 w-2.5" style={{ color }} aria-hidden />
                          ) : task.status === 'error' ? (
                            <X className="h-2.5 w-2.5 text-[var(--color-error)]" aria-hidden />
                          ) : (
                            <Icon className="h-2.5 w-2.5" style={{ color }} aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                            {index === 0 && task.status === 'pending' ? 'Suivant:' : ''} {task.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="text-xs text-[var(--text-dimmed)]">
                              Position: {index + 1}
                            </span>
                            {generating && task.progress > 0 && (
                              <>
                                <span className="text-xs text-[var(--text-dimmed)]">
                                  •
                                </span>
                                <span className="text-xs font-medium" style={{ color }}>
                                  {task.progress}%
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {task.status === 'error' && (
                          <NbIconButton
                            icon={RefreshCw}
                            label="Réessayer"
                            size="sm"
                            onClick={() => onRetryTask(task.id)}
                          />
                        )}
                        {index > 0 && task.status === 'pending' && (
                          <NbIconButton
                            icon={X}
                            label="Annuler"
                            size="sm"
                            tone="danger"
                            onClick={() => onCancelTask(task.id)}
                          />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

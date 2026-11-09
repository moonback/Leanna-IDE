/**
 * UploadQueue — progression réelle de l'ingestion et de l'indexation des sources.
 */
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2, XCircle, Clock3, FileText } from 'lucide-react';
import type { UploadFileStatus } from './constants.js';
import type { SpringTransition } from '../motionTypes.js';

interface Props {
  uploadQueue: UploadFileStatus[];
  uploadDone: number;
  uploadErrors: number;
  spring: SpringTransition;
}

function getStage(file: UploadFileStatus): string {
  if (file.status === 'success') return 'Importation terminée';
  if (file.status === 'error') return 'Échec de l’importation';
  if (file.status === 'pending') return file.progressDetail || 'En attente dans la file';
  if (file.progressDetail) return file.progressDetail;
  const progress = file.progress ?? 0;
  if (progress < 10) return 'Préparation du document';
  if (progress < 70) return 'Extraction et analyse du contenu';
  if (progress < 90) return 'Enregistrement et préparation RAG';
  return 'Finalisation de l’indexation';
}

export function UploadQueue({ uploadQueue, uploadDone, uploadErrors, spring }: Props) {
  const total = uploadQueue.length;
  const completed = uploadDone + uploadErrors;
  const progress = total
    ? Math.round(uploadQueue.reduce((sum, file) => sum + (file.status === 'success' ? 100 : file.progress ?? 0), 0) / total)
    : 0;
  const active = uploadQueue.some(file => file.status === 'pending' || file.status === 'uploading');

  return (
    <AnimatePresence>
      {total > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0, y: -6 }}
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -6 }}
          transition={spring}
          className="overflow-hidden"
        >
          <section
            className="space-y-3 rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-3.5"
            aria-label="Progression de l’importation des sources"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--notebook-accent)]" aria-hidden />
                  : completed === total && uploadErrors === 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden />
                  : <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">Importation et indexation</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{completed}/{total} documents traités{uploadErrors ? ` · ${uploadErrors} erreur(s)` : ''}</p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--notebook-accent)]">{progress}%</span>
            </div>

            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[var(--notebook-canvas)]"
              role="progressbar"
              aria-label="Progression globale de l’importation"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <motion.div
                className="h-full rounded-full bg-[var(--notebook-accent)]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>

            <div className="space-y-2.5">
              {uploadQueue.map((file, index) => {
                const value = file.status === 'success' ? 100 : Math.max(0, Math.min(100, file.progress ?? 0));
                return (
                  <div key={file.taskId || `${file.name}-${index}`} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {file.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" aria-hidden />
                        : file.status === 'error' ? <XCircle className="h-3.5 w-3.5 shrink-0 text-[var(--color-error)]" aria-hidden />
                        : file.status === 'pending' ? <Clock3 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                        : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--notebook-accent)]" aria-hidden />}
                      <span className={`min-w-0 flex-1 truncate text-xs ${file.status === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--text-primary)]'}`} title={file.name}>{file.name}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{value}%</span>
                    </div>
                    <div className="ml-5 h-1.5 overflow-hidden rounded-full bg-[var(--notebook-canvas)]">
                      <motion.div
                        className={`h-full rounded-full ${file.status === 'error' ? 'bg-[var(--color-error)]' : file.status === 'success' ? 'bg-[var(--color-success)]' : 'bg-[var(--notebook-accent)]'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="ml-5 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[10px] text-[var(--text-muted)]">{file.error || getStage(file)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

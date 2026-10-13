/**
 * UploadQueue — affichage de la file d'upload (barre de progression globale +
 * statut par fichier). Composant purement présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { UploadFileStatus } from './constants.js';
import type { SpringTransition } from '../motionTypes.js';

interface Props {
  uploadQueue: UploadFileStatus[];
  uploadDone: number;
  uploadErrors: number;
  spring: SpringTransition;
}

export function UploadQueue({ uploadQueue, uploadDone, uploadErrors, spring }: Props) {
  return (
    <AnimatePresence>
      {uploadQueue.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={spring}
          className="overflow-hidden"
        >
          <div className="space-y-2 rounded-xl border border-[var(--notebook-accent)] bg-[var(--notebook-surface)] p-3">
            <div className="flex items-center gap-2">
              {uploadDone === uploadQueue.length ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)]" aria-hidden />
              ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--notebook-accent)]" aria-hidden />
              )}
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Upload {uploadDone}/{uploadQueue.length}
                {uploadErrors > 0 && <span className="text-[var(--color-error)]"> · {uploadErrors} erreur{uploadErrors > 1 ? 's' : ''}</span>}
              </p>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--notebook-canvas)]">
              <motion.div
                className="h-full rounded-full bg-[var(--notebook-accent)]"
                initial={{ width: '0%' }}
                animate={{ width: `${(uploadDone / uploadQueue.length) * 100}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <div className="custom-scrollbar max-h-32 space-y-1 overflow-y-auto">
              {uploadQueue.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {f.status === 'pending' && <Loader2 className="h-3 w-3 flex-shrink-0 opacity-30" aria-hidden />}
                  {f.status === 'uploading' && <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-[var(--notebook-accent)]" aria-hidden />}
                  {f.status === 'success' && <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-[var(--color-success)]" aria-hidden />}
                  {f.status === 'error' && <XCircle className="h-3 w-3 flex-shrink-0 text-[var(--color-error)]" aria-hidden />}
                  <span className={f.status === 'error' ? 'flex-1 truncate text-[var(--color-error)]' : 'flex-1 truncate text-[var(--text-primary)]'}>
                    {f.name}
                  </span>
                  {f.error && <span className="max-w-[150px] truncate text-xs text-[var(--text-muted)]" title={f.error}>{f.error}</span>}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

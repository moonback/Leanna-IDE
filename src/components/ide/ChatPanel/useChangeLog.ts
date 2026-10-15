import { useCallback, useEffect, useState } from 'react';

// ─── Journal des modifications de code appliquées (feature #9) ───────────────
//
// Collecte, pour la session de conversation en cours, chaque fichier
// créé/modifié que l'utilisateur a appliqué depuis le chat (via l'éditeur diff
// inline). La source d'événement est le CustomEvent 'Leanna-file-written'
// émis par InlineDiffEditor au moment de l'application.
//
// Volontairement en mémoire (non persisté) : le journal reflète « ce qui a été
// appliqué pendant CETTE conversation », pas un historique global du projet.

/** Détail transporté par l'événement 'Leanna-file-written'. */
export interface FileWrittenDetail {
  path: string;
  added?: number;
  removed?: number;
  at?: number;
}

export interface ChangeLogEntry {
  path: string;
  /** Lignes ajoutées / retirées (cumul sur les applications successives). */
  added: number;
  removed: number;
  /** Nombre d'applications sur ce fichier dans la conversation. */
  count: number;
  /** Horodatage de la dernière application. */
  lastAt: number;
}

export const FILE_WRITTEN_EVENT = 'Leanna-file-written';

/**
 * Agrège les écritures de fichiers de la session en un journal dédupliqué par
 * chemin (dernière écriture en tête). Fournit un compteur total pour un badge.
 */
export function useChangeLog() {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);

  useEffect(() => {
    const onWritten = (e: Event) => {
      const detail = (e as CustomEvent<FileWrittenDetail>).detail;
      if (!detail || typeof detail.path !== 'string' || !detail.path) return;

      setEntries((prev) => {
        const at = detail.at ?? Date.now();
        const added = detail.added ?? 0;
        const removed = detail.removed ?? 0;
        const existing = prev.find(x => x.path === detail.path);

        const updated: ChangeLogEntry = existing
          ? {
            path: detail.path,
            added: existing.added + added,
            removed: existing.removed + removed,
            count: existing.count + 1,
            lastAt: at,
          }
          : { path: detail.path, added, removed, count: 1, lastAt: at };

        // Dernière écriture en tête ; une seule entrée par fichier.
        const rest = prev.filter(x => x.path !== detail.path);
        return [updated, ...rest];
      });
    };

    window.addEventListener(FILE_WRITTEN_EVENT, onWritten as EventListener);
    return () => window.removeEventListener(FILE_WRITTEN_EVENT, onWritten as EventListener);
  }, []);

  const clear = useCallback(() => setEntries([]), []);
  const remove = useCallback((path: string) => {
    setEntries(prev => prev.filter(x => x.path !== path));
  }, []);

  return { entries, clear, remove };
}

import React, { useState, useEffect, useCallback } from 'react';
import { X, BookOpen, Loader2, CheckCircle2, AlertCircle, FileCheck } from 'lucide-react';

interface NotebookLight {
  id: string;
  title: string;
  description: string;
  sourcesCount: number;
  color: string;
  icon: string;
}

interface NotebookPickerModalProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

/**
 * Modal permettant de choisir un notebook dans lequel importer un fichier.
 * Indique si le fichier est déjà présent dans un notebook.
 */
export function NotebookPickerModal({ filePath, fileName, onClose }: NotebookPickerModalProps) {
  const [notebooks, setNotebooks] = useState<NotebookLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  // Set of notebook IDs that already contain this file
  const [alreadyIn, setAlreadyIn] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notebooks');
        const data = await res.json();
        if (data.status === 'success') {
          const nbs: NotebookLight[] = data.notebooks ?? [];
          setNotebooks(nbs);

          // Check each notebook for existing source with same filename
          const checks = await Promise.allSettled(
            nbs.map(nb => fetch(`/api/notebooks/${nb.id}`).then(r => r.json()))
          );
          const presentIn = new Set<string>();
          checks.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value.status === 'success') {
              const sources: Array<{ title: string; origin: string }> = result.value.notebook?.sources ?? [];
              const match = sources.some(
                s => s.title === fileName || s.origin === filePath || s.origin === fileName
              );
              if (match) presentIn.add(nbs[idx].id);
            }
          });
          setAlreadyIn(presentIn);
        }
      } catch {
        setFeedback({ type: 'error', msg: 'Impossible de charger les notebooks' });
      } finally {
        setLoading(false);
      }
    })();
  }, [filePath, fileName]);

  const handleImport = useCallback(async (notebookId: string) => {
    setImporting(notebookId);
    setFeedback(null);
    try {
      // Read file content from the API
      const fileRes = await fetch(`/api/ide/file?path=${encodeURIComponent(filePath)}`);
      if (!fileRes.ok) {
        setFeedback({ type: 'error', msg: 'Impossible de lire le fichier' });
        setImporting(null);
        return;
      }
      const fileData = await fileRes.json();
      const content = fileData.content ?? '';

      // Determine mime type from extension
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        'md': 'text/markdown', 'txt': 'text/plain', 'json': 'application/json',
        'ts': 'text/typescript', 'tsx': 'text/typescript', 'js': 'text/javascript',
        'jsx': 'text/javascript', 'html': 'text/html', 'css': 'text/css',
        'yaml': 'text/yaml', 'yml': 'text/yaml', 'csv': 'text/csv',
        'py': 'text/x-python', 'rs': 'text/x-rust', 'go': 'text/x-go',
      };
      const mimeType = mimeMap[ext] || 'text/plain';

      // Upload to notebook as a file buffer
      const blob = new Blob([content], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, fileName);

      const uploadRes = await fetch(`/api/notebooks/${notebookId}/sources/upload`, {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (uploadData.status === 'success') {
        setFeedback({ type: 'success', msg: `${fileName} importé dans le notebook` });
        setAlreadyIn(prev => new Set([...prev, notebookId]));
        // Dispatch event so that NotebookDetail (or any listener) refreshes its sources
        window.dispatchEvent(new CustomEvent('notebook-sources-changed', { detail: { notebookId } }));
        setTimeout(onClose, 1200);
      } else {
        setFeedback({ type: 'error', msg: uploadData.error || 'Erreur lors de l\'import' });
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Erreur réseau' });
    } finally {
      setImporting(null);
    }
  }, [filePath, fileName, onClose]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 shadow-2xl"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Choisir un notebook"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={16} style={{ color: 'var(--accent-primary)' }} />
            <span className="text-sm font-semibold">Importer dans un notebook</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 transition hover:bg-white/10" aria-label="Fermer">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* File info */}
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Fichier :{' '}
          <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{fileName}</span>
        </p>

        {/* Feedback */}
        {feedback && (
          <div
            className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: feedback.type === 'success'
                ? 'color-mix(in srgb, #4ade80 15%, transparent)'
                : 'color-mix(in srgb, #f87171 15%, transparent)',
              color: feedback.type === 'success' ? '#4ade80' : '#f87171',
            }}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {feedback.msg}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
        ) : notebooks.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucun notebook disponible.</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-dimmed)' }}>
              Créez un notebook d'abord dans la section Notebooks.
            </p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
            {notebooks.map(nb => {
              const isPresent = alreadyIn.has(nb.id);
              return (
                <button
                  key={nb.id}
                  onClick={() => !isPresent && handleImport(nb.id)}
                  disabled={importing !== null || isPresent}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-60 disabled:cursor-default"
                  style={{ borderColor: 'var(--border-base)' }}
                  title={isPresent ? 'Ce fichier est déjà présent dans ce notebook' : `Importer dans ${nb.title}`}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-base flex-shrink-0"
                    style={{ backgroundColor: `${nb.color}22`, color: nb.color || 'var(--accent-primary)' }}
                  >
                    {nb.icon || '📓'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {nb.title}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {nb.sourcesCount} source{nb.sourcesCount !== 1 ? 's' : ''}
                      {nb.description ? ` · ${nb.description}` : ''}
                    </div>
                  </div>
                  {isPresent && (
                    <span
                      className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md flex-shrink-0"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      <FileCheck size={11} />
                      Déjà présent
                    </span>
                  )}
                  {importing === nb.id && (
                    <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm transition hover:bg-white/10"
            style={{ borderColor: 'var(--border-base)' }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { X, BookOpen, Loader2, CheckCircle2, AlertCircle, FileCheck, Plus } from 'lucide-react';
import { useToast } from '../ui/Toast';

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
  /** Si vrai, crée automatiquement un notebook si aucun n'existe */
  autoCreate?: boolean;
  /** Titre par défaut pour le notebook créé automatiquement */
  defaultNotebookTitle?: string;
  /** Description par défaut pour le notebook créé automatiquement */
  defaultNotebookDescription?: string;
}

/**
 * Modal permettant de choisir un notebook dans lequel importer un fichier.
 * Indique si le fichier est déjà présent dans un notebook.
 */
export function NotebookPickerModal({ 
  filePath, 
  fileName, 
  onClose, 
  autoCreate = false,
  defaultNotebookTitle = 'Mon premier notebook',
  defaultNotebookDescription = ''
}: NotebookPickerModalProps) {
  const { success, error: toastError } = useToast();
  const [notebooks, setNotebooks] = useState<NotebookLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  // Set of notebook IDs that already contain this file
  const [alreadyIn, setAlreadyIn] = useState<Set<string>>(new Set());

  // Fonction pour créer un notebook
  const createNotebook = useCallback(async (title: string, description?: string): Promise<string | null> => {
    setCreatingNotebook(true);
    try {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: title.trim(),
          description: description?.trim()
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur lors de la création du notebook');
      }
      
      const data = await res.json();
      success(`Notebook "${data.notebook.title}" créé`);
      return data.notebook.id;
    } catch (e: any) {
      toastError(e.message || 'Impossible de créer un notebook');
      return null;
    } finally {
      setCreatingNotebook(false);
    }
  }, [success, toastError]);

  // Fonction pour créer un notebook par défaut (utilisée pour l'auto-création)
  const createDefaultNotebook = useCallback(async (): Promise<string | null> => {
    // Utiliser le titre par défaut personnalisé
    const title = defaultNotebookTitle || 'Mon premier notebook';
    const description = defaultNotebookDescription || `Créé automatiquement pour l'import de ${fileName}`;
    return createNotebook(title, description);
  }, [defaultNotebookTitle, defaultNotebookDescription, fileName, createNotebook]);

  // Fonction pour charger les notebooks et vérifier les fichiers existants
  const loadAndCheckNotebooks = useCallback(async (createdId?: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/notebooks');
      const data = await res.json();
      let nbs: NotebookLight[] = data.notebooks ?? [];
      
      // Si un notebook a été créé, s'assurer qu'il est dans la liste
      if (createdId && !nbs.some(nb => nb.id === createdId)) {
        const newNbRes = await fetch(`/api/notebooks/${createdId}`);
        const newNbData = await newNbRes.json();
        if (newNbData.status === 'success' && newNbData.notebook) {
          nbs = [newNbData.notebook, ...nbs];
        }
      }
      
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
    } catch {
      setFeedback({ type: 'error', msg: 'Impossible de charger les notebooks' });
    } finally {
      setLoading(false);
    }
  }, [fileName, filePath, success]);

  useEffect(() => {
    (async () => {
      // Si autoCreate est activé et qu'il n'y a aucun notebook, en créer un automatiquement
      const initialRes = await fetch('/api/notebooks');
      const initialData = await initialRes.json();
      const hasNotebooks = (initialData.notebooks || []).length > 0;
      
      if (autoCreate && !hasNotebooks) {
        const newNotebookId = await createDefaultNotebook();
        if (newNotebookId) {
          await loadAndCheckNotebooks(newNotebookId);
          return;
        }
      }
      
      await loadAndCheckNotebooks();
    })();
  }, [loadAndCheckNotebooks, autoCreate, createDefaultNotebook]);

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
                ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                : 'color-mix(in srgb, var(--color-error) 15%, transparent)',
              color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
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
        ) : (
          <>
            {/* Liste des notebooks existants ou message si vide */}
            {notebooks.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucun notebook disponible.</p>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
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
                        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {nb.sourcesCount} source{nb.sourcesCount !== 1 ? 's' : ''}
                          {nb.description ? ` · ${nb.description}` : ''}
                        </div>
                      </div>
                      {isPresent && (
                        <span
                          className="flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-md flex-shrink-0"
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

            {/* Formulaire de création de notebook (affiché si showCreateForm) */}
            {showCreateForm && (
              <div className="mt-4 pt-4 border-t border-[var(--border-base)] space-y-3">
                <input
                  type="text"
                  value={newNotebookTitle}
                  onChange={(e) => setNewNotebookTitle(e.target.value)}
                  placeholder={defaultNotebookTitle || "Nom du notebook..."}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent border"
                  style={{
                    borderColor: 'var(--border-base)',
                    color: 'var(--text-primary)'
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newNotebookTitle.trim()) {
                      const newNotebookId = await createNotebook(
                        newNotebookTitle.trim(),
                        `Créé pour l'import de ${fileName}`
                      );
                      if (newNotebookId) {
                        await loadAndCheckNotebooks(newNotebookId);
                        setShowCreateForm(false);
                        setNewNotebookTitle('');
                      }
                    }
                    if (e.key === 'Escape') {
                      setShowCreateForm(false);
                      setNewNotebookTitle('');
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewNotebookTitle('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs transition hover:bg-white/10"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={async () => {
                      if (!newNotebookTitle.trim()) return;
                      const newNotebookId = await createNotebook(
                        newNotebookTitle.trim(),
                        `Créé pour l'import de ${fileName}`
                      );
                      if (newNotebookId) {
                        await loadAndCheckNotebooks(newNotebookId);
                        setShowCreateForm(false);
                        setNewNotebookTitle('');
                      }
                    }}
                    disabled={!newNotebookTitle.trim() || creatingNotebook}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'white'
                    }}
                  >
                    {creatingNotebook ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer avec bouton "Créer un nouveau" */}
        <div className="mt-4 flex justify-between items-center">
          {!showCreateForm && (
            <button
              onClick={() => {
                setShowCreateForm(true);
                setNewNotebookTitle(defaultNotebookTitle);
              }}
              disabled={creatingNotebook}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-white/10 disabled:opacity-60"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                color: 'var(--accent-primary)',
                border: '1px solid var(--border-base)'
              }}
            >
              <Plus size={14} />
              Créer un nouveau
            </button>
          )}
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

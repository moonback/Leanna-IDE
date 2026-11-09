/**
 * useSourceUpload — logique d'ajout de sources (upload fichiers, drag & drop,
 * URL, texte, presse-papier, import de codebase).
 *
 * Encapsule le « cluster upload/ingest » auparavant mêlé à SourcePanel :
 * l'état des formulaires, la file d'upload, le drag & drop, et les handlers
 * réseau correspondants.
 *
 * `uploading` est exposé avec son setter car il sert aussi d'indicateur
 * « occupé » aux actions de suppression détenues par le parent (comportement
 * d'origine : les boutons sont désactivés pendant toute mutation).
 */

import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client.js';
import type { UploadFileStatus } from './constants.js';

interface UseSourceUploadOptions {
  notebookId: string;
  onRefresh: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function useSourceUpload({ notebookId, onRefresh, onSuccess, onError }: UseSourceUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadFileStatus[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Formulaires
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [showTextForm, setShowTextForm] = useState(false);
  const [url, setUrl] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  // Import de codebase
  const [showCodebaseForm, setShowCodebaseForm] = useState(false);
  const [codebaseTitle, setCodebaseTitle] = useState('');
  const [codebaseExtensions, setCodebaseExtensions] = useState('');
  const [codebaseIncludeDirs, setCodebaseIncludeDirs] = useState('');
  const [codebaseExcludeDirs, setCodebaseExcludeDirs] = useState('');
  const [codebaseMaxSizeKb, setCodebaseMaxSizeKb] = useState(100);
  const [codebaseIncludeConfig, setCodebaseIncludeConfig] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // ─── Upload avec suivi réel de la file backend ──────────────────────────────

  const handleMultiUpload = useCallback(async (files: File[]) => {
    if (files.length === 0 || uploading) return;

    setUploading(true);
    setUploadQueue(files.map(f => ({ name: f.name, status: 'pending', progress: 0 })));

    try {
      const formData = new FormData();
      for (const file of files) formData.append('files', file);

      const queued = await api<{ taskIds: string[]; message: string }>(
        `/api/notebooks/${notebookId}/sources/upload-queued`,
        { method: 'POST', body: formData },
      );

      if (!queued.taskIds?.length) {
        throw new Error("Aucune tâche d'importation n'a été créée.");
      }

      const tracked = files.slice(0, queued.taskIds.length).map((file, index) => ({
        name: file.name,
        taskId: queued.taskIds[index],
        status: 'pending' as UploadFileStatus['status'],
        progress: 0,
      }));
      setUploadQueue(tracked);

      const pollTask = async (item: typeof tracked[number]) => {
        let consecutiveErrors = 0;
        while (true) {
          try {
            const response = await api<{
              task: {
                status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
                progress: number;
                progressStage?: string;
                progressDetail?: string;
                error?: string;
                result?: { title?: string; sourceId?: string; wordCount?: number; chunksCount?: number };
              };
            }>(`/api/notebooks/${notebookId}/sources/tasks/${item.taskId}`);

            consecutiveErrors = 0;
            const task = response.task;
            const terminal = ['completed', 'failed', 'cancelled'].includes(task.status);
            const status: UploadFileStatus['status'] =
              task.status === 'completed' ? 'success'
              : task.status === 'failed' || task.status === 'cancelled' ? 'error'
              : task.status === 'processing' ? 'uploading' : 'pending';

            setUploadQueue(current => current.map(file => file.taskId === item.taskId
              ? { ...file, status, progress: terminal ? (status === 'success' ? 100 : file.progress ?? 0) : Math.max(0, Math.min(100, task.progress || 0)), progressStage: task.progressStage, progressDetail: task.progressDetail, error: task.error }
              : file));

            if (terminal) {
              if (task.status !== 'completed') throw new Error(task.error || (task.status === 'cancelled' ? 'Importation annulée.' : 'Échec de l’importation.'));
              return task.result;
            }
          } catch (error) {
            if (error instanceof Error && !/fetch|network|réseau|timeout/i.test(error.message)) throw error;
            consecutiveErrors += 1;
            if (consecutiveErrors >= 5) throw error;
          }
          await new Promise(resolve => window.setTimeout(resolve, 700));
        }
      };

      const results = await Promise.allSettled(tracked.map(pollTask));
      const succeeded = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      if (succeeded > 0) {
        onSuccess(`${succeeded}/${results.length} source(s) ajoutée(s) et indexée(s)`);
        onRefresh();
      }
      if (failed > 0) onError(`${failed} fichier(s) en échec. Consultez le détail dans la file d'importation.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Échec de l’importation';
      setUploadQueue(files.map(f => ({ name: f.name, status: 'error', progress: 0, error: message })));
      onError(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      window.setTimeout(() => setUploadQueue([]), 8000);
    }
  }, [notebookId, uploading, onSuccess, onError, onRefresh]);

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleMultiUpload(droppedFiles);
  }, [handleMultiUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleMultiUpload(files);
  }, [handleMultiUpload]);

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  // ─── URL / Texte ─────────────────────────────────────────────────────────

  const handleUrlIngest = useCallback(async () => {
    if (!url.trim()) return;
    setUploading(true);
    try {
      const data = await api<{ source: { title: string } }>(
        `/api/notebooks/${notebookId}/sources/url`,
        { method: 'POST', json: { url: url.trim() } },
      );
      onSuccess(`Source "${data.source.title}" ajoutée`);
      setUrl(''); setShowUrlForm(false);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Ingestion failed');
    } finally { setUploading(false); }
  }, [url, notebookId, onSuccess, onError, onRefresh]);

  const handleTextAdd = useCallback(async () => {
    if (!textContent.trim()) return;
    setUploading(true);
    try {
      const data = await api<{ source: { title: string } }>(
        `/api/notebooks/${notebookId}/sources/text`,
        { method: 'POST', json: { title: textTitle.trim() || undefined, content: textContent } },
      );
      onSuccess(`Source "${data.source.title}" ajoutée`);
      setTextTitle(''); setTextContent(''); setShowTextForm(false);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur');
    } finally { setUploading(false); }
  }, [textTitle, textContent, notebookId, onSuccess, onError, onRefresh]);

  // ─── Presse-papier ─────────────────────────────────────────────────────────

  const handleClipboardPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        onError('Le presse-papier est vide');
        return;
      }
      setTextContent(text);
      setTextTitle('Collé depuis le presse-papier');
      setShowTextForm(true);
      onSuccess('Contenu collé — vérifiez et validez');
    } catch {
      onError("Impossible d'accéder au presse-papier. Autorisez l'accès dans le navigateur.");
    }
  }, [onError, onSuccess]);

  // ─── Import de codebase ───────────────────────────────────────────────────

  const handleCodebaseImport = useCallback(async () => {
    setUploading(true);
    try {
      const extensions = codebaseExtensions.trim()
        ? codebaseExtensions.split(/[\s,;]+/).filter(Boolean).map(e => e.startsWith('.') ? e : `.${e}`)
        : undefined;

      const splitDirs = (raw: string) =>
        raw.trim() ? raw.split(/[\s,;]+/).filter(Boolean) : undefined;
      const includeDirs = splitDirs(codebaseIncludeDirs);
      const excludeDirs = splitDirs(codebaseExcludeDirs);

      const data = await api<{
        source: { title: string; wordCount: number };
        stats: {
          filesCollected: number;
          filesSkipped?: number;
          totalLimitReached?: boolean;
          maxTotalKb?: number;
        };
      }>(`/api/notebooks/${notebookId}/sources/codebase`, {
        method: 'POST',
        json: {
          title: codebaseTitle.trim() || undefined,
          extensions,
          includeDirs,
          excludeDirs,
          maxFileSizeKb: codebaseMaxSizeKb,
          includeConfig: codebaseIncludeConfig,
        },
      });
      const { filesCollected, filesSkipped = 0, totalLimitReached } = data.stats;
      let message =
        `Codebase importé : "${data.source.title}" — ${filesCollected} fichiers, ${data.source.wordCount.toLocaleString()} mots`;
      if (filesSkipped > 0) {
        message += ` — ⚠️ ${filesSkipped} fichier(s) ignoré(s)`;
      }
      if (totalLimitReached) {
        message += ` (limite de ${data.stats.maxTotalKb ?? 2000} Ko atteinte, indexation partielle)`;
      }
      if (filesSkipped > 0 || totalLimitReached) {
        // Les troncatures méritent une notification visible (warning), pas un
        // simple succès silencieux.
        onError(message);
      } else {
        onSuccess(message);
      }
      setShowCodebaseForm(false);
      setCodebaseTitle('');
      setCodebaseExtensions('');
      setCodebaseIncludeDirs('');
      setCodebaseExcludeDirs('');
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur serveur');
    } finally {
      setUploading(false);
    }
  }, [notebookId, codebaseTitle, codebaseExtensions, codebaseIncludeDirs, codebaseExcludeDirs, codebaseMaxSizeKb, codebaseIncludeConfig, onSuccess, onError, onRefresh]);

  // Note : l'effet onUploadProgress reste dans le parent pour conserver le
  // contrat exact avec la prop onUploadProgress (il lit uploadQueue + uploading
  // exposés ci-dessous).

  return {
    // état
    uploading, setUploading,
    uploadQueue,
    dragOver,
    showUrlForm, setShowUrlForm,
    showTextForm, setShowTextForm,
    url, setUrl,
    textTitle, setTextTitle,
    textContent, setTextContent,
    showCodebaseForm, setShowCodebaseForm,
    codebaseTitle, setCodebaseTitle,
    codebaseExtensions, setCodebaseExtensions,
    codebaseIncludeDirs, setCodebaseIncludeDirs,
    codebaseExcludeDirs, setCodebaseExcludeDirs,
    codebaseMaxSizeKb, setCodebaseMaxSizeKb,
    codebaseIncludeConfig, setCodebaseIncludeConfig,
    fileInputRef,
    // handlers
    handleMultiUpload,
    handleDragOver, handleDragEnter, handleDragLeave, handleDrop,
    handleFileInputChange, openFilePicker,
    handleUrlIngest, handleTextAdd,
    handleClipboardPaste, handleCodebaseImport,
  };
}

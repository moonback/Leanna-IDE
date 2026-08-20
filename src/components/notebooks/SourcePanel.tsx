/**
 * SourcePanel — Gestion des sources d'un notebook
 *
 * Upload multi-fichiers avec drag & drop, ingestion d'URLs, ajout de texte.
 * UI/UX améliorée avec meilleur feedback, cards plus riches, et animations fluides.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Globe, FileText, Trash2, Loader2, Type, CheckCircle2, XCircle,
  Search, Eye, RefreshCw, Tag, ClipboardPaste, BarChart3,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { SourcesSummaryCard } from './SourcesSummaryCard';

interface SourceItem {
  id: string;
  title: string;
  type: string;
  origin: string;
  summary: string;
  keywords: string[];
  wordCount: number;
  language: string;
  addedAt: string;
  chunksCount: number;
}

interface Props {
  notebookId: string;
  sources: SourceItem[];
  onRefresh: () => void;
  /** Reports upload progress to parent (total files, completed count, active boolean) */
  onUploadProgress?: (state: { total: number; done: number; active: boolean }) => void;
  compact?: boolean;
  /** Called when a source is clicked in compact mode — opens it in the main panel */
  onSelectSource?: (sourceId: string) => void;
  /** Currently selected source ID (for highlighting in compact mode) */
  selectedSourceId?: string | null;
}

interface UploadFileStatus {
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

const TYPE_ICONS: Record<string, string> = {
  pdf: '📕', text: '📄', markdown: '📝', url: '🌐',
  html: '🌍', youtube: '📺', audio: '🎵', docx: '📘', image: '🖼️',
};

const TYPE_COLORS: Record<string, string> = {
  pdf: '#ef4444', text: '#6b7280', markdown: '#8b5cf6', url: '#3b82f6',
  html: '#06b6d4', youtube: '#ef4444', audio: '#f59e0b', docx: '#2563eb', image: '#10b981',
};

const ACCEPTED_EXTENSIONS = '.pdf,.txt,.md,.html,.docx,.doc,.rtf,.csv,.json,.yaml,.yml,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg';

export function SourcePanel({ notebookId, sources, onRefresh, onUploadProgress, compact = false, onSelectSource, selectedSourceId }: Props) {
  const { success, error: toastError } = useToast();
  const [uploading, setUploading] = useState(false);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [showTextForm, setShowTextForm] = useState(false);
  const [url, setUrl] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadFileStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [sourcePreview, setSourcePreview] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [showClipboardForm, setShowClipboardForm] = useState(false);
  const [tagInput, setTagInput] = useState<{ sourceId: string; value: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Report upload progress to parent
  useEffect(() => {
    if (!onUploadProgress) return;
    const done = uploadQueue.filter(f => f.status === 'success').length;
    onUploadProgress({ total: uploadQueue.length, done, active: uploading });
  }, [uploadQueue, uploading, onUploadProgress]);

  // Filtered sources
  const filteredSources = sources.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.keywords.some(k => k.toLowerCase().includes(q));
  });

  // ─── Multi-file upload ──────────────────────────────────────────────────────

  const handleMultiUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadQueue(files.map(f => ({ name: f.name, status: 'pending' })));

    if (files.length === 1) {
      const file = files[0];
      setUploadQueue([{ name: file.name, status: 'uploading' }]);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/notebooks/${notebookId}/sources/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(d.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setUploadQueue([{ name: file.name, status: 'success' }]);
        success(`Source "${data.source.title}" ajoutée (${data.source.wordCount} mots, ${data.source.chunksCount} chunks)`);
        onRefresh();
      } catch (e: any) {
        setUploadQueue([{ name: file.name, status: 'error', error: e.message }]);
        toastError(e.message);
      }
    } else {
      setUploadQueue(files.map(f => ({ name: f.name, status: 'uploading' })));
      try {
        const formData = new FormData();
        for (const file of files) formData.append('files', file);
        const res = await fetch(`/api/notebooks/${notebookId}/sources/upload-multi`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(d.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setUploadQueue(data.results.map((r: any) => ({
          name: r.filename, status: r.status, error: r.error,
        })));
        if (data.successCount > 0) {
          success(`${data.successCount}/${data.total} source(s) ajoutée(s)`);
          onRefresh();
        }
        if (data.errorCount > 0) toastError(`${data.errorCount} fichier(s) en erreur`);
      } catch (e: any) {
        setUploadQueue(files.map(f => ({ name: f.name, status: 'error', error: e.message })));
        toastError(e.message);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setUploadQueue([]), 5000);
  }, [notebookId, success, toastError, onRefresh]);

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleMultiUpload(droppedFiles);
  }, [handleMultiUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleMultiUpload(files);
  }, [handleMultiUpload]);

  const handleUrlIngest = useCallback(async () => {
    if (!url.trim()) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Ingestion failed' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      success(`Source "${data.source.title}" ajoutée`);
      setUrl(''); setShowUrlForm(false);
      onRefresh();
    } catch (e: any) {
      toastError(e.message);
    } finally { setUploading(false); }
  }, [url, notebookId, success, toastError, onRefresh]);

  const handleTextAdd = useCallback(async () => {
    if (!textContent.trim()) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: textTitle.trim() || undefined, content: textContent }),
      });
      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      success(`Source "${data.source.title}" ajoutée`);
      setTextTitle(''); setTextContent(''); setShowTextForm(false);
      onRefresh();
    } catch (e: any) { toastError(e.message); }
    finally { setUploading(false); }
  }, [textTitle, textContent, notebookId, success, toastError, onRefresh]);

  const handleDelete = useCallback(async (sourceId: string) => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      success('Source supprimée');
      onRefresh();
    } catch { toastError('Impossible de supprimer'); }
  }, [notebookId, success, toastError, onRefresh]);

  // ─── Preview source content ────────────────────────────────────────────────

  const handleTogglePreview = useCallback(async (sourceId: string) => {
    if (expandedSource === sourceId) {
      setExpandedSource(null);
      return;
    }
    setExpandedSource(sourceId);

    // Fetch content if not cached
    if (!sourcePreview[sourceId]) {
      setLoadingPreview(true);
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}/content`);
        if (res.ok) {
          const data = await res.json();
          setSourcePreview(prev => ({ ...prev, [sourceId]: data.content || data.text || 'Contenu non disponible' }));
        } else {
          setSourcePreview(prev => ({ ...prev, [sourceId]: 'Impossible de charger le contenu' }));
        }
      } catch {
        setSourcePreview(prev => ({ ...prev, [sourceId]: 'Erreur de chargement' }));
      } finally {
        setLoadingPreview(false);
      }
    }
  }, [expandedSource, sourcePreview, notebookId]);

  // ─── Re-index source ──────────────────────────────────────────────────────

  const handleReindex = useCallback(async (sourceId: string) => {
    setReindexingId(sourceId);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}/reindex`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      success(`Re-indexé : ${data.chunksCount || '?'} chunks générés`);
      onRefresh();
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setReindexingId(null);
    }
  }, [notebookId, success, toastError, onRefresh]);

  // ─── Add tag to source ────────────────────────────────────────────────────

  const handleAddTag = useCallback(async (sourceId: string, tag: string) => {
    if (!tag.trim()) return;
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: tag.trim() }),
      });
      if (!res.ok) throw new Error();
      setTagInput(null);
      onRefresh();
    } catch {
      toastError('Erreur lors de l\'ajout du tag');
    }
  }, [notebookId, toastError, onRefresh]);

  const handleRemoveTag = useCallback(async (sourceId: string, tag: string) => {
    try {
      await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      onRefresh();
    } catch { /* ignore */ }
  }, [notebookId, onRefresh]);

  // ─── Paste from clipboard ─────────────────────────────────────────────────

  const handleClipboardPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toastError('Le presse-papier est vide');
        return;
      }
      setTextContent(text);
      setTextTitle('Collé depuis le presse-papier');
      setShowTextForm(true);
      setShowClipboardForm(false);
      success('Contenu collé — vérifiez et validez');
    } catch {
      toastError('Impossible d\'accéder au presse-papier. Autorisez l\'accès dans le navigateur.');
    }
  }, [toastError, success]);

  // Stats
  const totalWords = sources.reduce((acc, s) => acc + s.wordCount, 0);
  const totalChunks = sources.reduce((acc, s) => acc + s.chunksCount, 0);

  // Hash des sources pour détecter les changements (ajout/suppression)
  const sourcesHash = useMemo(
    () => sources.map(s => s.id).sort().join('|'),
    [sources]
  );

  if (compact) {
    return (
      <div className="h-full min-h-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 flex-shrink-0">
          <div>
            <p className="notebook-eyebrow">Sources</p>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">{sources.length} document{sources.length > 1 ? 's' : ''}</h2>
          </div>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="notebook-primary-small">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            <span>Ajouter</span>
          </button>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} multiple onChange={handleFileInputChange} className="hidden" />
        </div>

        {/* Search */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="notebook-search-field" style={{ minHeight: 36 }}>
            <Search className="h-3.5 w-3.5" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher..." style={{ fontSize: '13px' }} />
          </div>
        </div>

        {/* Source list */}
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
          {sources.length === 0 ? (
            <div className="notebook-empty-state" style={{ padding: '32px 16px' }}>
              <div className="notebook-empty-state-icon" style={{ width: 44, height: 44 }}>
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Aucune source</p>
              <p className="text-xs text-[var(--text-muted)]">Ajoutez des documents pour commencer.</p>
            </div>
          ) : filteredSources.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">Aucun résultat.</p>
          ) : (
            <div className="space-y-0.5">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="notebook-source-row group w-full"
                  data-active={selectedSourceId === source.id}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSource?.(source.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <span className="notebook-source-icon" style={{ color: TYPE_COLORS[source.type] || 'var(--text-muted)' }}>
                      {TYPE_ICONS[source.type] || '📎'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{source.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                        {source.type} · {source.wordCount?.toLocaleString()} mots
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(source.id); }}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 flex-shrink-0"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto custom-scrollbar p-6 lg:p-8 space-y-5 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-2xl"
            style={{
              backgroundColor: 'var(--notebook-accent-surface)',
              border: '2.5px dashed var(--notebook-accent)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <div className="notebook-empty-state-icon" style={{ width: 64, height: 64 }}>
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--notebook-accent)' }}>
              Déposez vos fichiers ici
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              PDF, texte, Markdown, HTML, DOCX, CSV, JSON, YAML, Images
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload progress queue */}
      <AnimatePresence>
        {uploadQueue.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="p-4 rounded-xl border space-y-2"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--accent-primary)' }}
            >
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Upload {uploadQueue.filter(f => f.status === 'success').length}/{uploadQueue.length}
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${(uploadQueue.filter(f => f.status === 'success').length / uploadQueue.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              {uploadQueue.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  {f.status === 'pending' && <Loader2 className="w-3 h-3 opacity-30" />}
                  {f.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-primary)' }} />}
                  {f.status === 'success' && <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--color-success, #22c55e)' }} />}
                  {f.status === 'error' && <XCircle className="w-3 h-3" style={{ color: 'var(--color-error, #ef4444)' }} />}
                  <span className="truncate flex-1" style={{ color: f.status === 'error' ? 'var(--color-error, #ef4444)' : 'var(--text-primary)' }}>
                    {f.name}
                  </span>
                  {f.error && <span className="text-[9px] opacity-60 truncate max-w-[150px]">{f.error}</span>}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="notebook-fab disabled:opacity-50"
          style={{ padding: '10px 18px', fontSize: '13px' }}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Uploader
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <button
          onClick={() => { setShowUrlForm(!showUrlForm); setShowTextForm(false); }}
          className={`notebook-chip ${showUrlForm ? 'notebook-chip--active' : ''}`}
          style={showUrlForm ? { borderColor: 'var(--notebook-accent)', color: 'var(--notebook-accent)', background: 'var(--notebook-accent-surface)' } : {}}
        >
          <Globe className="w-3.5 h-3.5" />
          URL
        </button>

        <button
          onClick={() => { setShowTextForm(!showTextForm); setShowUrlForm(false); }}
          className={`notebook-chip ${showTextForm ? 'notebook-chip--active' : ''}`}
          style={showTextForm ? { borderColor: 'var(--notebook-accent)', color: 'var(--notebook-accent)', background: 'var(--notebook-accent-surface)' } : {}}
        >
          <Type className="w-3.5 h-3.5" />
          Texte
        </button>

        <button
          onClick={handleClipboardPaste}
          className="notebook-chip"
          title="Coller depuis le presse-papier"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Coller
        </button>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          <span>{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
          {totalWords > 0 && <span>{totalWords.toLocaleString()} mots</span>}
          {totalChunks > 0 && <span>{totalChunks} chunks</span>}
        </div>
      </div>

      {/* Search (when >3 sources) */}
      {sources.length > 3 && (
        <div className="notebook-search-field">
          <Search className="h-4 w-4 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les sources..."
          />
        </div>
      )}

      {/* URL Form */}
      <AnimatePresence>
        {showUrlForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4" style={{ color: 'var(--notebook-accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Importer une URL</p>
              </div>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlIngest()}
                placeholder="https://example.com/article..."
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleUrlIngest}
                  disabled={!url.trim() || uploading}
                  className="notebook-fab disabled:opacity-40"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {uploading ? 'Ingestion...' : 'Importer'}
                </button>
                <button
                  onClick={() => { setShowUrlForm(false); setUrl(''); }}
                  className="notebook-chip"
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text Form */}
      <AnimatePresence>
        {showTextForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Type className="w-4 h-4" style={{ color: 'var(--notebook-accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Ajouter du texte</p>
              </div>
              <input
                type="text"
                value={textTitle}
                onChange={e => setTextTitle(e.target.value)}
                placeholder="Titre (optionnel)"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
              />
              <div className="relative">
                <textarea
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  placeholder="Collez votre texte ici..."
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                  style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
                />
                {textContent && (
                  <span className="absolute bottom-2 right-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    ~{textContent.split(/\s+/).length} mots
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleTextAdd}
                  disabled={!textContent.trim() || uploading}
                  className="notebook-fab disabled:opacity-40"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {uploading ? 'Ajout...' : 'Ajouter'}
                </button>
                <button
                  onClick={() => { setShowTextForm(false); setTextTitle(''); setTextContent(''); }}
                  className="notebook-chip"
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Résumé global des sources */}
      <SourcesSummaryCard
        notebookId={notebookId}
        sourcesCount={sources.length}
        sourcesHash={sourcesHash}
      />

      {/* Sources List */}
      {sources.length === 0 ? (
        <div
          className="notebook-empty-state rounded-2xl border-2 border-dashed transition-colors"
          style={{ borderColor: dragOver ? 'var(--notebook-accent)' : 'var(--notebook-border)', padding: '48px 24px' }}
        >
          <div className="notebook-empty-state-icon" style={{ width: 56, height: 56 }}>
            <FileText className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Ajoutez vos premières sources
          </p>
          <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
            Glissez-déposez des fichiers, ou utilisez les boutons ci-dessus pour importer.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {['PDF', 'URL', 'Texte', 'DOCX', 'Markdown'].map(t => (
              <span key={t} className="notebook-chip" style={{ fontSize: '11px', padding: '4px 10px' }}>{t}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filteredSources.map((source) => (
              <motion.div
                key={source.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group p-4 rounded-2xl border flex gap-3 transition-all"
                style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-border)'; }}
              >
                {/* Type icon with color indicator */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xl flex-shrink-0">{TYPE_ICONS[source.type] || '📎'}</span>
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[source.type] || 'var(--text-dimmed)' }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {source.title}
                    </p>
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase flex-shrink-0"
                      style={{ backgroundColor: `${TYPE_COLORS[source.type] || '#6b7280'}15`, color: TYPE_COLORS[source.type] || 'var(--text-dimmed)' }}
                    >
                      {source.type}
                    </span>
                  </div>

                  <p className="text-[11px] mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                    {source.summary}
                  </p>

                  {/* Expanded content preview */}
                  <AnimatePresence>
                    {expandedSource === source.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div
                          className="mt-2 p-3 rounded-xl text-[11px] leading-relaxed max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap"
                          style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
                        >
                          {loadingPreview ? (
                            <div className="flex items-center gap-2" style={{ color: 'var(--text-dimmed)' }}>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Chargement du contenu...</span>
                            </div>
                          ) : (
                            sourcePreview[source.id] || source.summary
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="text-[10px] font-medium" style={{ color: 'var(--text-dimmed)' }}>
                      {source.wordCount.toLocaleString()} mots
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                      {source.chunksCount} chunks
                    </span>
                    <span className="text-[10px] uppercase font-medium" style={{ color: 'var(--text-dimmed)' }}>
                      {source.language}
                    </span>
                  </div>

                  {/* Keywords + Tags */}
                  {source.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {source.keywords.slice(0, 6).map((kw: string) => (
                        <span
                          key={kw}
                          className="text-[9px] px-2 py-0.5 rounded-full font-medium cursor-pointer transition-all hover:line-through hover:opacity-50"
                          style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-dimmed)', border: '1px solid var(--border-base)' }}
                          onClick={() => handleRemoveTag(source.id, kw)}
                          title="Cliquer pour retirer"
                        >
                          {kw}
                        </span>
                      ))}
                      {source.keywords.length > 6 && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ color: 'var(--text-dimmed)' }}>
                          +{source.keywords.length - 6}
                        </span>
                      )}
                      {/* Add tag inline */}
                      {tagInput?.sourceId === source.id ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleAddTag(source.id, tagInput.value); }}
                          className="inline-flex"
                        >
                          <input
                            type="text"
                            value={tagInput.value}
                            onChange={(e) => setTagInput({ sourceId: source.id, value: e.target.value })}
                            placeholder="tag..."
                            autoFocus
                            onBlur={() => setTagInput(null)}
                            className="text-[9px] px-2 py-0.5 rounded-full w-16 outline-none"
                            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}
                          />
                        </form>
                      ) : (
                        <button
                          onClick={() => setTagInput({ sourceId: source.id, value: '' })}
                          className="text-[9px] px-2 py-0.5 rounded-full font-medium transition-all hover:bg-[var(--accent-subtle)]"
                          style={{ color: 'var(--text-dimmed)', border: '1px dashed var(--border-base)' }}
                          title="Ajouter un tag"
                        >
                          + tag
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all self-start">
                  <button
                    onClick={() => handleTogglePreview(source.id)}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    title="Voir le contenu"
                  >
                    <Eye className="w-3.5 h-3.5" style={{ color: expandedSource === source.id ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
                  </button>
                  <button
                    onClick={() => handleReindex(source.id)}
                    disabled={reindexingId === source.id}
                    className="p-1.5 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors disabled:opacity-40"
                    title="Re-indexer la source"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reindexingId === source.id ? 'animate-spin' : ''}`} style={{ color: 'var(--accent-primary)' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(source.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {searchQuery && filteredSources.length === 0 && (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-dimmed)' }}>
              Aucune source ne correspond à "{searchQuery}"
            </p>
          )}
        </div>
      )}
    </div>
  );
}

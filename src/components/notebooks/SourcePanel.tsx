/**
 * SourcePanel — Gestion des sources d'un notebook
 *
 * Upload multi-fichiers avec drag & drop, ingestion d'URLs, ajout de texte.
 * UI/UX améliorée avec meilleur feedback, cards plus riches, et animations fluides.
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Globe, FileText, Trash2, Loader2, Type, CheckCircle2, XCircle,
  Search, Eye,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

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
}

interface UploadFileStatus {
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

const TYPE_ICONS: Record<string, string> = {
  pdf: '📕', text: '📄', markdown: '📝', url: '🌐',
  html: '🌍', youtube: '📺', audio: '🎵', docx: '📘',
};

const TYPE_COLORS: Record<string, string> = {
  pdf: '#ef4444', text: '#6b7280', markdown: '#8b5cf6', url: '#3b82f6',
  html: '#06b6d4', youtube: '#ef4444', audio: '#f59e0b', docx: '#2563eb',
};

const ACCEPTED_EXTENSIONS = '.pdf,.txt,.md,.html,.docx,.doc,.rtf,.csv,.json,.yaml,.yml';

export function SourcePanel({ notebookId, sources, onRefresh }: Props) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Stats
  const totalWords = sources.reduce((acc, s) => acc + s.wordCount, 0);
  const totalChunks = sources.reduce((acc, s) => acc + s.chunksCount, 0);

  return (
    <div
      className="h-full overflow-y-auto custom-scrollbar p-5 lg:p-7 space-y-4 relative"
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
              backgroundColor: 'rgba(var(--accent-primary-rgb, 99, 102, 241), 0.1)',
              border: '2.5px dashed var(--accent-primary)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Upload className="w-8 h-8" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>
              Déposez vos fichiers ici
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              PDF, texte, Markdown, HTML, DOCX, CSV, JSON, YAML
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
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shadow-sm"
          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
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
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all hover:bg-white/5 ${showUrlForm ? 'ring-1 ring-[var(--accent-primary)]' : ''}`}
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
        >
          <Globe className="w-3.5 h-3.5" />
          URL
        </button>

        <button
          onClick={() => { setShowTextForm(!showTextForm); setShowUrlForm(false); }}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all hover:bg-white/5 ${showTextForm ? 'ring-1 ring-[var(--accent-primary)]' : ''}`}
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
        >
          <Type className="w-3.5 h-3.5" />
          Texte
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-dimmed)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les sources..."
            className="w-full pl-9 pr-4 py-2 rounded-lg text-xs outline-none transition-all focus:ring-1 focus:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
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
            <div className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Ingérer une URL</p>
              </div>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlIngest()}
                placeholder="https://example.com/article..."
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-[var(--accent-primary)]"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleUrlIngest}
                  disabled={!url.trim() || uploading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition active:scale-95"
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
                >
                  {uploading ? 'Ingestion...' : 'Ingérer'}
                </button>
                <button
                  onClick={() => { setShowUrlForm(false); setUrl(''); }}
                  className="px-3 py-2 rounded-xl text-xs"
                  style={{ color: 'var(--text-muted)' }}
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
            <div className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Type className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Ajouter du texte</p>
              </div>
              <input
                type="text"
                value={textTitle}
                onChange={e => setTextTitle(e.target.value)}
                placeholder="Titre (optionnel)..."
                className="w-full px-4 py-2 rounded-xl text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              <div className="relative">
                <textarea
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  placeholder="Collez votre texte ici..."
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl text-xs outline-none resize-none"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                />
                {textContent && (
                  <span className="absolute bottom-2 right-3 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    ~{textContent.split(/\s+/).length} mots
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleTextAdd}
                  disabled={!textContent.trim() || uploading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition active:scale-95"
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
                >
                  {uploading ? 'Ajout...' : 'Ajouter'}
                </button>
                <button
                  onClick={() => { setShowTextForm(false); setTextTitle(''); setTextContent(''); }}
                  className="px-3 py-2 rounded-xl text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sources List */}
      {sources.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-14 gap-5 rounded-2xl border-2 border-dashed transition-colors"
          style={{ borderColor: dragOver ? 'var(--accent-primary)' : 'var(--border-base)' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
          >
            <FileText className="w-7 h-7" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Ajoutez vos premières sources
            </p>
            <p className="text-xs max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Glissez-déposez vos fichiers ici, ou utilisez les boutons ci-dessus.
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
              PDF, texte, Markdown, HTML, DOCX, CSV, JSON, YAML
            </p>
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
                className="group p-4 rounded-2xl border flex gap-3 transition-all hover:border-[var(--border-focus)] hover:shadow-sm"
                style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
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

                  {/* Expanded summary */}
                  <AnimatePresence>
                    {expandedSource === source.id && (
                      <motion.p
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="text-[11px] mt-1 leading-relaxed overflow-hidden"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {source.summary}
                      </motion.p>
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

                  {/* Keywords */}
                  {source.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {source.keywords.slice(0, 6).map((kw: string) => (
                        <span
                          key={kw}
                          className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-dimmed)', border: '1px solid var(--border-base)' }}
                        >
                          {kw}
                        </span>
                      ))}
                      {source.keywords.length > 6 && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ color: 'var(--text-dimmed)' }}>
                          +{source.keywords.length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all self-start">
                  <button
                    onClick={() => setExpandedSource(expandedSource === source.id ? null : source.id)}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    title="Voir plus"
                  >
                    <Eye className="w-3.5 h-3.5" style={{ color: 'var(--text-dimmed)' }} />
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

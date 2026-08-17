/**
 * SourcePanel — Gestion des sources d'un notebook
 *
 * Upload de fichiers, ingestion d'URLs, ajout de texte.
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Globe, FileText, Trash2, Loader2, Type,
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

const TYPE_ICONS: Record<string, string> = {
  pdf: '📕', text: '📄', markdown: '📝', url: '🌐',
  html: '🌍', youtube: '📺', audio: '🎵', docx: '📘',
};

export function SourcePanel({ notebookId, sources, onRefresh }: Props) {
  const { success, error: toastError } = useToast();
  const [uploading, setUploading] = useState(false);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [showTextForm, setShowTextForm] = useState(false);
  const [url, setUrl] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
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
      success(`Source "${data.source.title}" ajoutée (${data.source.wordCount} mots, ${data.source.chunksCount} chunks)`);
      onRefresh();
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [notebookId, success, toastError, onRefresh]);

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
      setUrl('');
      setShowUrlForm(false);
      onRefresh();
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setUploading(false);
    }
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
      setTextTitle('');
      setTextContent('');
      setShowTextForm(false);
      onRefresh();
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setUploading(false);
    }
  }, [textTitle, textContent, notebookId, success, toastError, onRefresh]);

  const handleDelete = useCallback(async (sourceId: string) => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      success('Source supprimée');
      onRefresh();
    } catch {
      toastError('Impossible de supprimer');
    }
  }, [notebookId, success, toastError, onRefresh]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-5 lg:p-7 space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Uploader
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.html,.docx,.doc,.csv,.json,.yaml,.yml"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          className="hidden"
        />

        <button
          onClick={() => { setShowUrlForm(!showUrlForm); setShowTextForm(false); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all hover:bg-white/5"
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
        >
          <Globe className="w-3.5 h-3.5" />
          URL
        </button>

        <button
          onClick={() => { setShowTextForm(!showTextForm); setShowUrlForm(false); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all hover:bg-white/5"
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
        >
          <Type className="w-3.5 h-3.5" />
          Texte
        </button>

        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </div>

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
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlIngest()}
                placeholder="https://example.com/article..."
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleUrlIngest}
                disabled={!url.trim() || uploading}
                className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition active:scale-95"
                style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
              >
                {uploading ? 'Ingestion...' : 'Ingérer'}
              </button>
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
              <input
                type="text"
                value={textTitle}
                onChange={e => setTextTitle(e.target.value)}
                placeholder="Titre (optionnel)..."
                className="w-full px-4 py-2 rounded-xl text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              <textarea
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                placeholder="Collez votre texte ici..."
                rows={6}
                className="w-full px-4 py-3 rounded-xl text-xs outline-none resize-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleTextAdd}
                disabled={!textContent.trim() || uploading}
                className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition active:scale-95"
                style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
              >
                {uploading ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sources List */}
      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-panel)' }}>
            <FileText className="w-7 h-7" style={{ color: 'var(--text-dimmed)' }} />
          </div>
          <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-dimmed)' }}>
            Ajoutez des sources (PDF, URLs, textes) pour alimenter votre notebook.
            L'IA pourra ensuite répondre à vos questions en citant ces documents.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="group p-4 rounded-2xl border flex gap-3 transition-all hover:border-[var(--border-focus)]"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
            >
              <span className="text-lg flex-shrink-0">{TYPE_ICONS[source.type] || '📎'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {source.title}
                </p>
                <p className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                  {source.summary}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    {source.wordCount} mots
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    {source.chunksCount} chunks
                  </span>
                  <span className="text-[9px] uppercase" style={{ color: 'var(--text-dimmed)' }}>
                    {source.language}
                  </span>
                </div>
                {source.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {source.keywords.slice(0, 5).map((kw: string) => (
                      <span key={kw} className="text-[8px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-dimmed)' }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(source.id)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 self-start"
              >
                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

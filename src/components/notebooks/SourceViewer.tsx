/**
 * SourceViewer — Affiche le contenu complet d'une source dans le panneau principal.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { FileText, Loader2, X, RefreshCw, Tag } from 'lucide-react';

interface SourceData {
  id: string;
  title: string;
  type: string;
  summary: string;
  keywords: string[];
  wordCount: number;
  language: string;
  chunksCount: number;
}

interface Props {
  notebookId: string;
  sourceId: string;
  source?: SourceData;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  pdf: '📕', text: '📄', markdown: '📝', url: '🌐',
  html: '🌍', youtube: '📺', audio: '🎵', docx: '📘',
};

const TYPE_COLORS: Record<string, string> = {
  pdf: '#ef4444', text: '#6b7280', markdown: '#8b5cf6', url: '#3b82f6',
  html: '#06b6d4', youtube: '#ef4444', audio: '#f59e0b', docx: '#2563eb',
};

export function SourceViewer({ notebookId, sourceId, source, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}/content`);
      if (!res.ok) throw new Error('Impossible de charger le contenu');
      const data = await res.json();
      setContent(data.content || data.text || 'Contenu non disponible');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [notebookId, sourceId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <span className="text-xl flex-shrink-0">
          {TYPE_ICONS[source?.type || ''] || '📎'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {source?.title || 'Source'}
            </h2>
            {source?.type && (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase flex-shrink-0"
                style={{
                  backgroundColor: `${TYPE_COLORS[source.type] || '#6b7280'}15`,
                  color: TYPE_COLORS[source.type] || 'var(--text-dimmed)',
                }}
              >
                {source.type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {source?.wordCount && (
              <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                {source.wordCount.toLocaleString()} mots
              </span>
            )}
            {source?.chunksCount && (
              <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                {source.chunksCount} passages
              </span>
            )}
            {source?.language && (
              <span className="text-[10px] uppercase" style={{ color: 'var(--text-dimmed)' }}>
                {source.language}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={fetchContent}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            title="Recharger le contenu"
          >
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            title="Fermer"
          >
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Keywords */}
      {source?.keywords && source.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
          <Tag className="w-3 h-3 mt-0.5" style={{ color: 'var(--text-dimmed)' }} />
          {source.keywords.map((kw) => (
            <span
              key={kw}
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement du contenu...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <FileText className="w-8 h-8" style={{ color: 'var(--color-error, #ef4444)' }} />
            <p className="text-sm" style={{ color: 'var(--color-error, #ef4444)' }}>{error}</p>
            <button
              onClick={fetchContent}
              className="px-4 py-2 rounded-xl text-xs font-semibold transition active:scale-95"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              Réessayer
            </button>
          </div>
        ) : (
          <div
            className="prose prose-sm max-w-none text-[13px] leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--text-primary)' }}
          >
            {content}
          </div>
        )}
      </div>
    </motion.div>
  );
}

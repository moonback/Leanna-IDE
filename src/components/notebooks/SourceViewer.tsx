/**
 * SourceViewer — Affiche le contenu complet d'une source dans le panneau principal.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  FileText, Loader2, X, RefreshCw, Tag,
  FileType, FileCode, Globe, Youtube, Music, FileText as FileDoc,
  Image as ImageIcon, Paperclip, Download, Bot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { sanitizeMarkdownHtml } from '../../utils/sanitizeMarkdownHtml.js';
import { renderChatMarkdown } from '../../utils/chatMarkdown.js';
import { api } from './api/client.js';
import { NbBadge, NbButton, NbIconButton, NbSectionLabel } from './ui/primitives.js';

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

const TYPE_ICONS: Record<string, LucideIcon> = {
  pdf: FileType, text: FileText, markdown: FileCode, url: Globe,
  html: Globe, youtube: Youtube, audio: Music, docx: FileDoc, image: ImageIcon,
};

function TypeIcon({ type, size = 20 }: { type: string; size?: number }) {
  const Icon = TYPE_ICONS[type] || Paperclip;
  const color = TYPE_COLORS[type] || 'var(--text-muted)';
  return <Icon size={size} style={{ color }} />;
}

const TYPE_COLORS: Record<string, string> = {
  pdf: 'var(--color-error)', text: 'var(--text-muted)', markdown: 'var(--color-accent-alt)', url: 'var(--notebook-accent)',
  html: 'var(--accent-secondary)', youtube: 'var(--color-error)', audio: 'var(--color-warning)', docx: 'var(--notebook-accent)', image: 'var(--color-success)',
};

export function SourceViewer({ notebookId, sourceId, source, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [htmlData, setHtmlData] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'text'>('visual');

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<SourceData & {
        content?: string;
        text?: string;
        imageBase64?: string;
        imageMimeType?: string;
        rawHtml?: string;
      }>(`/api/notebooks/${notebookId}/sources/${sourceId}/content`);
      setContent(data.content || data.text || 'Contenu non disponible');
      // If it's an image source, store the image data
      if (data.type === 'image' && data.imageBase64) {
        setImageData({ base64: data.imageBase64, mimeType: data.imageMimeType || 'image/png' });
        setHtmlData(null);
      } else if (data.type === 'html' && data.rawHtml) {
        setHtmlData(data.rawHtml);
        setImageData(null);
      } else {
        setImageData(null);
        setHtmlData(null);
      }
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
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="notebook-panel-header !gap-3 bg-[var(--notebook-surface)] !px-5 !py-3">
        <span className="inline-flex flex-shrink-0 items-center">
          <TypeIcon type={source?.type || ''} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="notebook-panel-title truncate">
              {source?.title || 'Source'}
            </h2>
            {source?.type && (
              <span
                className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase"
                style={{
                  backgroundColor: `color-mix(in srgb, ${TYPE_COLORS[source.type] || 'var(--text-muted)'} 12%, transparent)`,
                  color: TYPE_COLORS[source.type] || 'var(--text-dimmed)',
                }}
              >
                {source.type}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--text-dimmed)]">
            {source?.wordCount && (
              <span>
                {source.wordCount.toLocaleString()} mots
              </span>
            )}
            {source?.chunksCount && (
              <span>
                {source.chunksCount} passages
              </span>
            )}
            {source?.language && (
              <span className="uppercase">
                {source.language}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Toggle view mode for HTML sources */}
          {htmlData && (
            <div className="notebook-segmented mr-2">
              <button
                type="button"
                onClick={() => setViewMode('visual')}
                className="notebook-segment !px-3 !py-1 !text-xs"
                data-active={viewMode === 'visual'}
              >
                <span className="inline-flex items-center gap-1"><Globe size={12} aria-hidden /> Visuel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className="notebook-segment !px-3 !py-1 !text-xs"
                data-active={viewMode === 'text'}
              >
                <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden /> Texte</span>
              </button>
            </div>
          )}
          <NbIconButton icon={RefreshCw} label="Recharger le contenu" onClick={fetchContent} />
          <NbIconButton icon={X} label="Fermer" onClick={onClose} />
        </div>
      </div>

      {/* Keywords */}
      {source?.keywords && source.keywords.length > 0 && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--notebook-border)] px-5 py-3">
          <Tag className="h-3 w-3 text-[var(--text-dimmed)]" aria-hidden />
          {source.keywords.map((kw) => (
            <NbBadge key={kw}>{kw}</NbBadge>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--notebook-accent)]" aria-hidden />
            <p className="text-sm text-[var(--text-muted)]">Chargement du contenu...</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-[var(--color-error)]" aria-hidden />
            <p className="text-sm text-[var(--color-error)]">{error}</p>
            <NbButton variant="primary" size="sm" onClick={fetchContent}>
              Réessayer
            </NbButton>
          </div>
        ) : imageData ? (
          <div className="space-y-4">
            {/* Image display */}
            <div className="overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-canvas)] shadow-sm">
              <img
                src={`data:${imageData.mimeType};base64,${imageData.base64}`}
                alt={source?.title || 'Image source'}
                className="h-auto max-h-[600px] w-full object-contain"
              />
            </div>

            {/* Download button */}
            <div className="flex items-center gap-2">
              <NbButton
                variant="secondary"
                size="sm"
                icon={Download}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = `data:${imageData.mimeType};base64,${imageData.base64}`;
                  link.download = source?.title || 'image.png';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="!border-[color-mix(in_srgb,var(--color-success)_40%,transparent)] !bg-[var(--color-success-subtle)] !text-[var(--color-success)]"
              >
                Télécharger l'image
              </NbButton>
            </div>

            {/* AI description */}
            {content && (
              <div className="space-y-2">
                <NbSectionLabel className="inline-flex items-center gap-1.5">
                  <Bot size={13} aria-hidden /> Description IA
                </NbSectionLabel>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-canvas)] p-4 text-sm leading-relaxed text-[var(--text-primary)]">
                  {content}
                </div>
              </div>
            )}
          </div>
        ) : htmlData && viewMode === 'visual' ? (
          <div className="flex h-full flex-col gap-3">
            {/* Fond blanc volontaire : rendu fidèle d'une page HTML externe. */}
            <div className="flex-1 overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-white shadow-sm">
              <iframe
                srcDoc={htmlData}
                title={source?.title || 'HTML source'}
                className="h-full min-h-[500px] w-full border-0"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        ) : (
          <RenderedContent content={content || ''} type={source?.type} />
        )}
      </div>
    </motion.div>
  );
}

/* ─── Markdown / Text renderer ─────────────────────────────────────────────── */

function RenderedContent({ content, type }: { content: string; type?: string }) {
  const html = useMemo(() => {
    if (!content) return '';
    try {
      const isMarkdownLike = type === 'markdown' || type === 'text';
      if (isMarkdownLike) {
        // Pipeline unifié (comme le chat et la preview IDE) : rendu synchrone
        // forcé via renderChatMarkdown, puis sanitisation.
        return sanitizeMarkdownHtml(renderChatMarkdown(content));
      }
      // Fallback: wrap in <pre> for other text types
      const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre style="white-space:pre-wrap;word-break:break-word;">${escaped}</pre>`;
    } catch {
      return `<p>Erreur lors du rendu.</p>`;
    }
  }, [content, type]);

  return (
    <div
      className="markdown-body max-w-none text-[var(--text-primary)]"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with sanitizeMarkdownHtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

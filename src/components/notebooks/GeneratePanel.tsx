/**
 * GeneratePanel — Génération de contenu dérivé (FAQ, résumé, guide, etc.)
 *
 * UI améliorée avec rendu markdown, meilleur layout responsive, et feedback visuel.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, FileText, HelpCircle, GraduationCap, Briefcase, Clock, List,
  Loader2, Trash2, Copy, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { MermaidDiagram } from './MermaidDiagram';

interface SourceItem {
  id: string;
  title: string;
  type: string;
}

interface GeneratedDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  sourceIds: string[];
  createdAt: string;
}

interface Props {
  notebookId: string;
  sources: SourceItem[];
  onRefresh: () => void;
}

const DOC_TYPES = [
  { key: 'summary', label: 'Résumé', icon: FileText, desc: 'Synthèse structurée des sources', color: '#3b82f6' },
  { key: 'faq', label: 'FAQ', icon: HelpCircle, desc: '15-20 questions/réponses', color: '#8b5cf6' },
  { key: 'study-guide', label: 'Guide d\'étude', icon: GraduationCap, desc: 'Concepts, quiz, résumé', color: '#10b981' },
  { key: 'briefing', label: 'Briefing', icon: Briefcase, desc: 'Document exécutif concis', color: '#f59e0b' },
  { key: 'timeline', label: 'Chronologie', icon: Clock, desc: 'Événements et jalons', color: '#ef4444' },
  { key: 'outline', label: 'Plan', icon: List, desc: 'Structure hiérarchique', color: '#06b6d4' },
  { key: 'mindmap', label: 'Carte mentale', icon: Sparkles, desc: 'Mindmap visuelle Mermaid', color: '#ec4899' },
  { key: 'swot', label: 'Analyse SWOT', icon: Briefcase, desc: 'Forces, Faiblesses, Opportunités, Menaces', color: '#14b8a6' },
  { key: 'glossary', label: 'Glossaire', icon: HelpCircle, desc: 'Termes techniques définis', color: '#6366f1' },
];

/** Render markdown-like content with Mermaid diagram support */
function renderGeneratedContent(content: string): JSX.Element {
  // Split by code blocks (including mermaid)
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        // Handle code blocks
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim().toLowerCase() || '';
          const code = (lang ? lines.slice(1) : lines).join('\n').trim();

          // Render Mermaid diagrams visually
          if (lang === 'mermaid') {
            return <MermaidDiagram key={i} code={code} id={`gen-${i}`} />;
          }

          // Regular code block
          return (
            <pre
              key={i}
              className="px-4 py-3 rounded-xl text-[11px] overflow-x-auto font-mono"
              style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
            >
              <code>{code}</code>
            </pre>
          );
        }

        // Process non-code content line by line
        const lines = part.split('\n');

        return (
          <div key={i} className="space-y-2">
            {lines.map((line, j) => {
              if (!line.trim()) return <div key={j} className="h-2" />;

              // Headers
              if (line.startsWith('### ')) return <h4 key={j} className="text-xs font-bold mt-4 mb-1" style={{ color: 'var(--text-primary)' }}>{line.slice(4)}</h4>;
              if (line.startsWith('## ')) return <h3 key={j} className="text-sm font-bold mt-5 mb-1.5" style={{ color: 'var(--text-primary)' }}>{line.slice(3)}</h3>;
              if (line.startsWith('# ')) return <h2 key={j} className="text-base font-bold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>{line.slice(2)}</h2>;

              // Horizontal rule
              if (line.match(/^---+$/)) return <hr key={j} className="my-4" style={{ borderColor: 'var(--border-base)' }} />;

              // Blockquote
              if (line.startsWith('> ')) {
                return (
                  <blockquote key={j} className="pl-3 py-1 text-xs leading-relaxed italic border-l-2" style={{ borderColor: 'var(--accent-primary)', color: 'var(--text-muted)' }}>
                    {line.slice(2)}
                  </blockquote>
                );
              }

              // Lists
              if (line.match(/^[\-\*]\s/)) {
                return (
                  <div key={j} className="flex gap-2 pl-2">
                    <span className="text-[10px] mt-0.5 opacity-50">•</span>
                    <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>{line.slice(2)}</span>
                  </div>
                );
              }
              if (line.match(/^\d+\.\s/)) {
                const num = line.match(/^(\d+)\./)?.[1];
                return (
                  <div key={j} className="flex gap-2 pl-2">
                    <span className="text-[10px] mt-0.5 opacity-60 font-semibold min-w-[16px]" style={{ color: 'var(--accent-primary)' }}>{num}.</span>
                    <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>{line.replace(/^\d+\.\s/, '')}</span>
                  </div>
                );
              }

              // Regular text
              return <p key={j} className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{line}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function GeneratePanel({ notebookId, sources }: Props) {
  const { success, error: toastError } = useToast();
  const [generating, setGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<GeneratedDoc | null>(null);
  const [copied, setCopied] = useState(false);

  // Charger les docs générés
  useState(() => {
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/generated`);
        if (res.ok) {
          const data = await res.json();
          setGeneratedDocs(data.documents || []);
        }
      } catch { /* ignore */ }
    })();
  });

  const handleGenerate = useCallback(async (type: string) => {
    if (sources.length === 0) {
      toastError('Ajoutez des sources d\'abord.');
      return;
    }
    setGenerating(true);
    setGeneratingType(type);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      success(`"${data.document.title}" généré`);
      setGeneratedDocs(prev => [data.document, ...prev]);
      setSelectedDoc(data.document);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setGenerating(false);
      setGeneratingType(null);
    }
  }, [notebookId, sources, success, toastError]);

  const handleDelete = useCallback(async (docId: string) => {
    try {
      await fetch(`/api/notebooks/${notebookId}/generated/${docId}`, { method: 'DELETE' });
      setGeneratedDocs(prev => prev.filter(d => d.id !== docId));
      if (selectedDoc?.id === docId) setSelectedDoc(null);
      success('Document supprimé');
    } catch {
      toastError('Erreur');
    }
  }, [notebookId, selectedDoc, success, toastError]);

  const handleCopy = useCallback(async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left: Type selector + generated list */}
      <div
        className="w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r overflow-y-auto custom-scrollbar p-5 space-y-5"
        style={{ borderColor: 'var(--border-base)' }}
      >
        {/* Generate buttons */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            Générer un document
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {DOC_TYPES.map(({ key, label, icon: Icon, desc, color }) => (
              <button
                key={key}
                onClick={() => handleGenerate(key)}
                disabled={generating || sources.length === 0}
                className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:border-[var(--border-focus)] hover:shadow-sm disabled:opacity-40 active:scale-[0.98]"
                style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}15` }}
                >
                  {generatingType === key ? (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />
                  ) : (
                    <Icon className="w-4 h-4" style={{ color }} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                  <p className="text-[9px] mt-0.5 hidden lg:block" style={{ color: 'var(--text-dimmed)' }}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Source count info */}
        {sources.length === 0 && (
          <p className="text-[10px] text-center py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-dimmed)' }}>
            Ajoutez des sources pour activer la génération
          </p>
        )}

        {/* Generated docs list */}
        {generatedDocs.length > 0 && (
          <div className="space-y-2 pt-3 border-t" style={{ borderColor: 'var(--border-base)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              Documents ({generatedDocs.length})
            </p>
            {generatedDocs.map(doc => {
              const docType = DOC_TYPES.find(t => t.key === doc.type);
              return (
                <motion.div
                  key={doc.id}
                  layout
                  onClick={() => setSelectedDoc(doc)}
                  className={`group cursor-pointer p-3 rounded-xl border transition-all hover:shadow-sm ${selectedDoc?.id === doc.id ? 'ring-1 ring-[var(--accent-primary)]' : ''}`}
                  style={{ borderColor: selectedDoc?.id === doc.id ? 'var(--accent-primary)' : 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${docType?.color || '#6b7280'}15` }}
                    >
                      <Sparkles className="w-3 h-3" style={{ color: docType?.color || 'var(--accent-primary)' }} />
                    </div>
                    <p className="text-[11px] font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                      {doc.title}
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                      className="p-1 opacity-0 group-hover:opacity-100 rounded hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-3 h-3" style={{ color: 'var(--color-error)' }} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1 pl-7">
                    <span className="text-[9px] font-medium capitalize" style={{ color: docType?.color || 'var(--text-dimmed)' }}>
                      {doc.type}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                      {new Date(doc.createdAt).toLocaleDateString('fr')}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Document viewer */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {selectedDoc ? (
          <div className="space-y-5 max-w-3xl">
            {/* Document header */}
            <div className="flex items-start gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase"
                    style={{
                      backgroundColor: `${DOC_TYPES.find(t => t.key === selectedDoc.type)?.color || '#6b7280'}15`,
                      color: DOC_TYPES.find(t => t.key === selectedDoc.type)?.color || 'var(--text-dimmed)',
                    }}
                  >
                    {selectedDoc.type}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    {new Date(selectedDoc.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedDoc.title}
                </h2>
              </div>
              <button
                onClick={() => handleCopy(selectedDoc.content)}
                className="p-2.5 rounded-xl border transition-all hover:bg-white/5 active:scale-95 flex-shrink-0"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title="Copier le contenu"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Document content with markdown rendering */}
            {renderGeneratedContent(selectedDoc.content)}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Sparkles className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Générez du contenu
              </p>
              <p className="text-xs max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Sélectionnez un type de document à générer à partir de vos sources,
                ou consultez un document existant.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * GeneratePanel — Génération de contenu dérivé (FAQ, résumé, guide, etc.)
 *
 * Fonctionnalités :
 * - Génération en streaming (contenu affiché en temps réel)
 * - Sélection des sources spécifiques
 * - Instructions personnalisées (prompt custom)
 * - Export Markdown
 * - Régénération
 * - Rendu Mermaid pour les diagrammes
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, FileText, HelpCircle, GraduationCap, Briefcase, Clock, List,
  Loader2, Trash2, Copy, CheckCircle2, Download, RefreshCw, ChevronDown,
  ChevronUp, Filter, PenLine, Brain, Target, BookOpen, FolderInput,
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
  { key: 'mindmap', label: 'Carte mentale', icon: Brain, desc: 'Mindmap visuelle Mermaid', color: '#ec4899' },
  { key: 'swot', label: 'Analyse SWOT', icon: Target, desc: 'Forces, Faiblesses, Opportunités, Menaces', color: '#14b8a6' },
  { key: 'glossary', label: 'Glossaire', icon: BookOpen, desc: 'Termes techniques définis', color: '#6366f1' },
];

/** Render markdown-like content with Mermaid diagram support */
function renderGeneratedContent(content: string): JSX.Element {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim().toLowerCase() || '';
          const code = (lang ? lines.slice(1) : lines).join('\n').trim();

          if (lang === 'mermaid') {
            return <MermaidDiagram key={i} code={code} id={`gen-${i}`} />;
          }

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

        const lines = part.split('\n');
        return (
          <div key={i} className="space-y-1.5">
            {lines.map((line, j) => {
              if (!line.trim()) return <div key={j} className="h-1.5" />;
              if (line.startsWith('#### ')) return <h5 key={j} className="text-[11px] font-bold mt-3 mb-0.5" style={{ color: 'var(--text-primary)' }}>{line.slice(5)}</h5>;
              if (line.startsWith('### ')) return <h4 key={j} className="text-xs font-bold mt-4 mb-1" style={{ color: 'var(--text-primary)' }}>{line.slice(4)}</h4>;
              if (line.startsWith('## ')) return <h3 key={j} className="text-sm font-bold mt-5 mb-1.5" style={{ color: 'var(--text-primary)' }}>{line.slice(3)}</h3>;
              if (line.startsWith('# ')) return <h2 key={j} className="text-base font-bold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>{line.slice(2)}</h2>;
              if (line.match(/^---+$/)) return <hr key={j} className="my-4" style={{ borderColor: 'var(--border-base)' }} />;
              if (line.startsWith('> ')) {
                return (
                  <blockquote key={j} className="pl-3 py-1 text-xs leading-relaxed italic border-l-2" style={{ borderColor: 'var(--accent-primary)', color: 'var(--text-muted)' }}>
                    {line.slice(2)}
                  </blockquote>
                );
              }
              if (line.match(/^[\-\*]\s/)) {
                return (
                  <div key={j} className="flex gap-2 pl-2">
                    <span className="text-[10px] mt-0.5 opacity-50">•</span>
                    <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>{renderBoldItalic(line.slice(2))}</span>
                  </div>
                );
              }
              if (line.match(/^\d+\.\s/)) {
                const num = line.match(/^(\d+)\./)?.[1];
                return (
                  <div key={j} className="flex gap-2 pl-2">
                    <span className="text-[10px] mt-0.5 opacity-60 font-semibold min-w-[16px]" style={{ color: 'var(--accent-primary)' }}>{num}.</span>
                    <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>{renderBoldItalic(line.replace(/^\d+\.\s/, ''))}</span>
                  </div>
                );
              }
              return <p key={j} className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{renderBoldItalic(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Render bold and italic inline */
function renderBoldItalic(text: string): (string | JSX.Element)[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="italic opacity-80">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--bg-base)' }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export function GeneratePanel({ notebookId, sources, onRefresh }: Props) {
  const { success, error: toastError } = useToast();
  const [generating, setGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<GeneratedDoc | null>(null);
  const [copied, setCopied] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // Source selection
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [showSourceFilter, setShowSourceFilter] = useState(false);

  // Custom instructions
  const [customInstructions, setCustomInstructions] = useState('');
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  // Charger les docs générés
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/generated`);
        if (res.ok) {
          const data = await res.json();
          setGeneratedDocs(data.documents || []);
        }
      } catch { /* ignore */ }
    })();
  }, [notebookId]);

  // Auto-scroll pendant le streaming
  useEffect(() => {
    if (streamingText && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamingText]);

  // ─── Génération en streaming ────────────────────────────────────────────

  const handleGenerate = useCallback(async (type: string) => {
    if (sources.length === 0) {
      toastError('Ajoutez des sources d\'abord.');
      return;
    }
    setGenerating(true);
    setGeneratingType(type);
    setStreamingText('');
    setSelectedDoc(null);

    const sourceIds = selectedSourceIds.length > 0 ? selectedSourceIds : undefined;

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          sourceIds,
          customInstructions: customInstructions.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Pas de body stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              } else if (parsed.document) {
                setStreamingText('');
                setGeneratedDocs(prev => [parsed.document, ...prev]);
                setSelectedDoc(parsed.document);
                success(`"${parsed.document.title}" généré`);
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }
        }
      }
    } catch (e: any) {
      toastError(e.message);
      setStreamingText('');
    } finally {
      setGenerating(false);
      setGeneratingType(null);
      setStreamingText('');
    }
  }, [notebookId, sources, selectedSourceIds, customInstructions, success, toastError]);

  // ─── Régénérer ──────────────────────────────────────────────────────────

  const handleRegenerate = useCallback(async () => {
    if (!selectedDoc) return;
    // Supprimer l'ancien document
    try {
      await fetch(`/api/notebooks/${notebookId}/generated/${selectedDoc.id}`, { method: 'DELETE' });
      setGeneratedDocs(prev => prev.filter(d => d.id !== selectedDoc.id));
    } catch { /* ignore */ }
    setSelectedDoc(null);
    // Relancer la génération
    handleGenerate(selectedDoc.type);
  }, [selectedDoc, notebookId, handleGenerate]);

  // ─── Actions ────────────────────────────────────────────────────────────

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

  const handleExportMd = useCallback((doc: GeneratedDoc) => {
    const blob = new Blob([doc.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9àáâãäéèêëïîôùûüÿç\s-]/g, '')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleImportToWorkspace = useCallback(async (doc: GeneratedDoc) => {
    const filename = doc.title
      .replace(/[^a-zA-Z0-9àáâãäéèêëïîôùûüÿç\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    const filePath = `docs/generated/${filename}.md`;

    try {
      const token = localStorage.getItem('jarvis_api_token');
      const res = await fetch('/api/ide/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-jarvis-token': token } : {}),
        },
        body: JSON.stringify({ path: filePath, content: doc.content }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      success(`Importé dans le workspace : ${filePath}`);
    } catch (e: any) {
      toastError(`Erreur import : ${e.message}`);
    }
  }, [success, toastError]);

  const toggleSourceSelection = useCallback((sourceId: string) => {
    setSelectedSourceIds(prev =>
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  }, []);

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left panel: Controls + document list */}
      <div
        className="w-full lg:w-[300px] flex-shrink-0 border-b lg:border-b-0 lg:border-r overflow-y-auto custom-scrollbar p-4 lg:p-5 space-y-4"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {/* Quick config bar */}
        <div className="flex items-center gap-2">
          {/* Source filter toggle */}
          {sources.length > 1 && (
            <button
              onClick={() => setShowSourceFilter(!showSourceFilter)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-medium border transition-all ${showSourceFilter ? 'ring-1 ring-[var(--accent-primary)]' : 'hover:bg-white/5'}`}
              style={{ borderColor: 'var(--border-base)', color: selectedSourceIds.length > 0 ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            >
              <Filter className="w-3 h-3" />
              {selectedSourceIds.length > 0 ? `${selectedSourceIds.length} src` : 'Sources'}
            </button>
          )}

          {/* Custom prompt toggle */}
          <button
            onClick={() => setShowCustomPrompt(!showCustomPrompt)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-medium border transition-all ${showCustomPrompt ? 'ring-1 ring-[#f59e0b]' : 'hover:bg-white/5'}`}
            style={{ borderColor: 'var(--border-base)', color: customInstructions.trim() ? '#f59e0b' : 'var(--text-muted)' }}
          >
            <PenLine className="w-3 h-3" />
            Prompt
            {customInstructions.trim() && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
          </button>

          {/* Source count */}
          <span className="ml-auto text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Source filter dropdown */}
        <AnimatePresence>
          {showSourceFilter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div
                className="p-2.5 rounded-xl space-y-1"
                style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
              >
                {sources.map(src => (
                  <label
                    key={src.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSourceIds.length === 0 || selectedSourceIds.includes(src.id)}
                      onChange={() => toggleSourceSelection(src.id)}
                      className="w-3 h-3 rounded accent-[var(--accent-primary)]"
                    />
                    <span className="text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>{src.title}</span>
                  </label>
                ))}
                {selectedSourceIds.length > 0 && (
                  <button
                    onClick={() => setSelectedSourceIds([])}
                    className="text-[9px] px-2 py-1 w-full text-left hover:underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    Réinitialiser (toutes)
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom instructions dropdown */}
        <AnimatePresence>
          {showCustomPrompt && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                placeholder="Ex: Ton formel, focus technique, ajoute des exemples..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl text-[10px] outline-none resize-none transition-all focus:ring-1 focus:ring-[#f59e0b]"
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generate buttons — redesigned grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              Générer
            </p>
            {generating && (
              <span className="flex items-center gap-1.5 text-[9px] font-medium" style={{ color: 'var(--accent-primary)' }}>
                <Loader2 className="w-3 h-3 animate-spin" />
                En cours...
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 lg:grid-cols-1 gap-1.5">
            {DOC_TYPES.map(({ key, label, icon: Icon, desc, color }) => {
              const isActive = generatingType === key;
              return (
                <button
                  key={key}
                  onClick={() => handleGenerate(key)}
                  disabled={generating || sources.length === 0}
                  className={`relative w-full flex flex-col lg:flex-row items-center lg:items-center gap-1.5 lg:gap-3 p-2.5 lg:p-3 rounded-xl border text-center lg:text-left transition-all disabled:opacity-40 active:scale-[0.97] ${isActive ? 'ring-2' : 'hover:shadow-sm hover:-translate-y-0.5'}`}
                  style={{
                    borderColor: isActive ? color : 'var(--border-base)',
                    backgroundColor: isActive ? `${color}08` : 'var(--bg-panel)',
                    boxShadow: isActive ? `0 0 12px ${color}15` : undefined,
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}12`, border: `1px solid ${color}25` }}
                  >
                    {isActive ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />
                    ) : (
                      <Icon className="w-4 h-4" style={{ color }} />
                    )}
                  </div>

                  {/* Text */}
                  <div className="min-w-0 lg:flex-1">
                    <p className="text-[10px] lg:text-[11px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {label}
                    </p>
                    <p className="text-[8px] lg:text-[9px] mt-0.5 leading-tight hidden lg:block" style={{ color: 'var(--text-dimmed)' }}>
                      {desc}
                    </p>
                  </div>

                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeGenType"
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{ border: `2px solid ${color}`, opacity: 0.5 }}
                    />
                  )}
                </button>
              );
            })}
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
          <div className="space-y-2 pt-4 border-t" style={{ borderColor: 'var(--border-base)' }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                Historique
              </p>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                {generatedDocs.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {generatedDocs.map(doc => {
                const docType = DOC_TYPES.find(t => t.key === doc.type);
                const DocIcon = docType?.icon || Sparkles;
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <motion.div
                    key={doc.id}
                    layout
                    onClick={() => { setSelectedDoc(doc); setStreamingText(''); }}
                    className={`group cursor-pointer p-2.5 rounded-xl border transition-all hover:shadow-sm ${isSelected ? 'shadow-sm' : ''}`}
                    style={{
                      borderColor: isSelected ? docType?.color || 'var(--accent-primary)' : 'var(--border-base)',
                      backgroundColor: isSelected ? `${docType?.color || 'var(--accent-primary)'}08` : 'var(--bg-panel)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${docType?.color || '#6b7280'}15` }}
                      >
                        <DocIcon className="w-3.5 h-3.5" style={{ color: docType?.color || 'var(--accent-primary)' }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {doc.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[8px] font-medium" style={{ color: docType?.color || 'var(--text-dimmed)' }}>
                            {docType?.label || doc.type}
                          </span>
                          <span className="text-[8px]" style={{ color: 'var(--text-dimmed)' }}>•</span>
                          <span className="text-[8px]" style={{ color: 'var(--text-dimmed)' }}>
                            {new Date(doc.createdAt).toLocaleDateString('fr')}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                        className="p-1 opacity-0 group-hover:opacity-100 rounded hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" style={{ color: '#ef4444' }} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right: Document viewer */}
      <div ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {/* Streaming view */}
        {streamingText && !selectedDoc && (
          <div className="space-y-5 max-w-3xl">
            <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-base)' }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                Génération en cours...
              </span>
              <span className="text-[10px] ml-auto" style={{ color: 'var(--text-dimmed)' }}>
                {streamingText.length} caractères
              </span>
            </div>
            {renderGeneratedContent(streamingText)}
            <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ backgroundColor: 'var(--accent-primary)' }} />
          </div>
        )}

        {/* Selected document view */}
        {selectedDoc && !streamingText ? (
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
                    {DOC_TYPES.find(t => t.key === selectedDoc.type)?.label || selectedDoc.type}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    {new Date(selectedDoc.createdAt).toLocaleString('fr-FR')}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    • {selectedDoc.content.length} chars
                  </span>
                </div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedDoc.title}
                </h2>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleImportToWorkspace(selectedDoc)}
                  className="p-2 rounded-lg border transition-all hover:bg-white/5 active:scale-95"
                  style={{ borderColor: 'var(--border-base)', color: 'var(--accent-primary)' }}
                  title="Importer dans le workspace"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={generating}
                  className="p-2 rounded-lg border transition-all hover:bg-white/5 active:scale-95 disabled:opacity-30"
                  style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                  title="Régénérer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleExportMd(selectedDoc)}
                  className="p-2 rounded-lg border transition-all hover:bg-white/5 active:scale-95"
                  style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                  title="Exporter en Markdown"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleCopy(selectedDoc.content)}
                  className="p-2 rounded-lg border transition-all hover:bg-white/5 active:scale-95"
                  style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                  title="Copier"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Document content */}
            {renderGeneratedContent(selectedDoc.content)}
          </div>
        ) : !streamingText && (
          /* Empty state — professional landing */
          <div className="h-full flex flex-col items-center justify-center gap-6 px-8">
            <div className="relative">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <Sparkles className="w-8 h-8" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                style={{ backgroundColor: 'var(--bg-panel)', border: '2px solid var(--accent-primary)' }}
              >
                <span className="text-[10px] font-bold" style={{ color: 'var(--accent-primary)' }}>AI</span>
              </div>
            </div>

            <div className="text-center space-y-2 max-w-sm">
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Génération intelligente
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Transformez vos sources en documents structurés. Résumés, FAQ, guides d'étude, chronologies et plus encore.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
              {[
                { emoji: '⚡', label: 'Streaming', sub: 'Temps réel' },
                { emoji: '🎯', label: 'Sources', sub: 'Ciblé' },
                { emoji: '📝', label: 'Custom', sub: 'Instructions' },
              ].map(f => (
                <div
                  key={f.label}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
                >
                  <span className="text-base">{f.emoji}</span>
                  <span className="text-[9px] font-semibold" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
                  <span className="text-[8px]" style={{ color: 'var(--text-dimmed)' }}>{f.sub}</span>
                </div>
              ))}
            </div>

            {sources.length === 0 && (
              <p
                className="text-[10px] px-4 py-2 rounded-lg"
                style={{ backgroundColor: '#f59e0b10', color: '#f59e0b', border: '1px solid #f59e0b30' }}
              >
                ⚠️ Ajoutez des sources dans l'onglet Sources pour commencer
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

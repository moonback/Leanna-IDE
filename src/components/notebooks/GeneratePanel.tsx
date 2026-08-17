/**
 * GeneratePanel — Génération de contenu dérivé (FAQ, résumé, guide, etc.)
 */

import { useState, useCallback } from 'react';
import {
  Sparkles, FileText, HelpCircle, GraduationCap, Briefcase, Clock, List,
  Loader2, Trash2, Copy, CheckCircle2,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

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
  { key: 'summary', label: 'Résumé', icon: FileText, desc: 'Synthèse structurée des sources' },
  { key: 'faq', label: 'FAQ', icon: HelpCircle, desc: '15-20 questions/réponses' },
  { key: 'study-guide', label: 'Guide d\'étude', icon: GraduationCap, desc: 'Concepts, quiz, résumé' },
  { key: 'briefing', label: 'Briefing', icon: Briefcase, desc: 'Document exécutif concis' },
  { key: 'timeline', label: 'Chronologie', icon: Clock, desc: 'Événements et jalons' },
  { key: 'outline', label: 'Plan', icon: List, desc: 'Structure hiérarchique' },
];

export function GeneratePanel({ notebookId, sources }: Props) {
  const { success, error: toastError } = useToast();
  const [generating, setGenerating] = useState(false);
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
    <div className="h-full flex">
      {/* Left: Type selector + generated list */}
      <div className="w-72 flex-shrink-0 border-r overflow-y-auto custom-scrollbar p-4 space-y-4"
        style={{ borderColor: 'var(--border-base)' }}>

        {/* Generate buttons */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            Générer
          </p>
          {DOC_TYPES.map(({ key, label, icon: Icon, desc }) => (
            <button
              key={key}
              onClick={() => handleGenerate(key)}
              disabled={generating || sources.length === 0}
              className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:border-[var(--border-focus)] disabled:opacity-40"
              style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                <p className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {generating && (
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--accent-subtle)' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs" style={{ color: 'var(--accent-primary)' }}>Génération en cours...</span>
          </div>
        )}

        {/* Generated docs list */}
        {generatedDocs.length > 0 && (
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              Documents générés ({generatedDocs.length})
            </p>
            {generatedDocs.map(doc => (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className={`group cursor-pointer p-3 rounded-xl border transition-all ${selectedDoc?.id === doc.id ? 'border-[var(--accent-primary)]' : ''}`}
                style={{ borderColor: selectedDoc?.id === doc.id ? 'var(--accent-primary)' : 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  <p className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{doc.title}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                    className="ml-auto p-1 opacity-0 group-hover:opacity-100 rounded hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3" style={{ color: 'var(--color-error)' }} />
                  </button>
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
                  {doc.type} • {new Date(doc.createdAt).toLocaleDateString('fr')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Document viewer */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {selectedDoc ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedDoc.title}</h2>
              <button
                onClick={() => handleCopy(selectedDoc.content)}
                className="p-2 rounded-lg border transition-colors hover:bg-white/5"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title="Copier"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div
              className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed whitespace-pre-wrap"
              style={{ color: 'var(--text-primary)' }}
            >
              {selectedDoc.content}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Sparkles className="w-8 h-8" style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
              Sélectionnez un type de document à générer ou consultez un document existant.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

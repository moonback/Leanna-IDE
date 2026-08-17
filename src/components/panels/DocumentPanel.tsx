/**
 * DocumentPanel — Panneau dédié à la gestion et l'analyse inter-documents.
 *
 * Fonctionnalités :
 * - Liste des documents uploadés (persistés)
 * - Upload direct de nouveaux documents
 * - Recherche dans les documents
 * - Analyse des liens inter-documents
 * - Synthèse multi-documents
 * - Affichage des liens trouvés
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText, Upload, Search, Link2, Sparkles, Trash2,
  Loader2, X, ChevronDown, ChevronRight, Tag,
  FileImage, RefreshCw, AlertCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocumentEntry {
  id: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  keywords: string[];
  tags: string[];
  summary?: string;
  textLength: number;
}

interface DocumentLink {
  docA: string;
  docB: string;
  linkType: string;
  description: string;
  confidence: number;
}

interface AnalysisResult {
  links: DocumentLink[];
  synthesis: string;
  documents_analyzed: { id: string; fileName: string }[];
}

// ─── Composant Principal ─────────────────────────────────────────────────────

export function DocumentPanel() {
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [links, setLinks] = useState<DocumentLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocumentEntry[] | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'links' | 'analysis'>('documents');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Chargement initial ──────────────────────────────────────────────────────
  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_summaries: true, include_links: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocuments(data.documents || []);
      setLinks(data.links || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Refresh the document list
      await loadDocuments();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [loadDocuments]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  // ── Recherche ───────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, max_results: 10 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // ── Analyse des liens ───────────────────────────────────────────────────────
  const handleAnalyzeLinks = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    try {
      const ids = selectedDocs.size > 0 ? Array.from(selectedDocs) : undefined;
      const res = await fetch('/api/documents/analyze-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: ids, save_links: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalysisResult(data);
      setActiveTab('analysis');
      // Refresh links
      await loadDocuments();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }, [selectedDocs, loadDocuments]);

  // ── Synthèse ────────────────────────────────────────────────────────────────
  const handleSynthesize = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const ids = selectedDocs.size > 0 ? Array.from(selectedDocs) : undefined;
      const res = await fetch('/api/documents/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: ids, format: 'report' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalysisResult({
        links: [],
        synthesis: data.synthesis,
        documents_analyzed: data.documents_used || [],
      });
      setActiveTab('analysis');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }, [selectedDocs]);

  // ── Suppression ─────────────────────────────────────────────────────────────
  const handleRemove = useCallback(async (docId: string) => {
    try {
      await fetch('/api/documents/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId }),
      });
      setSelectedDocs((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      await loadDocuments();
    } catch (e: any) {
      setError(e.message);
    }
  }, [loadDocuments]);

  // ── Toggle sélection ────────────────────────────────────────────────────────
  const toggleSelect = useCallback((docId: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  const displayDocs = searchResults !== null ? searchResults : documents;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg-panel)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-base)' }}
      >
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
            Documents
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-dimmed)' }}>
            {documents.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadDocuments()}
            className="p-1.5 rounded-lg transition hover:bg-white/10"
            title="Rafraîchir"
          >
            <RefreshCw size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-1.5 rounded-lg transition hover:bg-white/10 disabled:opacity-30"
            title="Uploader un document"
          >
            {uploading ? (
              <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <Upload size={12} style={{ color: 'var(--accent-primary)' }} />
            )}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Tabs */}
      <div
        className="flex items-center gap-0.5 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-base)' }}
      >
        {(['documents', 'links', 'analysis'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-2.5 py-1 rounded-md text-[10px] font-medium transition"
            style={{
              backgroundColor: activeTab === tab ? 'var(--accent-primary-15)' : 'transparent',
              color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
          >
            {tab === 'documents' && '📄 Documents'}
            {tab === 'links' && '🔗 Liens'}
            {tab === 'analysis' && '✨ Analyse'}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {activeTab === 'documents' && (
        <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}
            >
              <Search size={11} style={{ color: 'var(--text-dimmed)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Rechercher dans les documents…"
                className="flex-1 bg-transparent text-[11px] outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              {searchResults !== null && (
                <button onClick={() => { setSearchResults(null); setSearchQuery(''); }} className="p-0.5">
                  <X size={10} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action bar (when docs selected) */}
      {activeTab === 'documents' && selectedDocs.size > 0 && (
        <div
          className="px-3 py-2 flex items-center gap-2 flex-shrink-0"
          style={{ backgroundColor: 'var(--accent-primary-10)', borderBottom: '1px solid var(--border-base)' }}
        >
          <span className="text-[10px] font-medium" style={{ color: 'var(--accent-primary)' }}>
            {selectedDocs.size} sélectionné{selectedDocs.size > 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleAnalyzeLinks}
            disabled={analyzing || selectedDocs.size < 2}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition disabled:opacity-30"
            style={{ backgroundColor: 'var(--accent-primary-15)', color: 'var(--accent-primary)' }}
            title="Analyser les liens entre les documents sélectionnés"
          >
            {analyzing ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
            Liens
          </button>
          <button
            onClick={handleSynthesize}
            disabled={analyzing}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition disabled:opacity-30"
            style={{ backgroundColor: 'var(--accent-primary-15)', color: 'var(--accent-primary)' }}
            title="Générer une synthèse croisée"
          >
            {analyzing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            Synthèse
          </button>
        </div>
      )}

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 py-2 flex-shrink-0"
          >
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px]"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171' }}
            >
              <AlertCircle size={11} />
              <span className="flex-1 truncate">{error}</span>
              <button onClick={() => setError(null)}><X size={10} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && documents.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
        ) : activeTab === 'documents' ? (
          <DocumentList
            documents={displayDocs}
            selectedDocs={selectedDocs}
            expandedDoc={expandedDoc}
            onToggleSelect={toggleSelect}
            onToggleExpand={(id) => setExpandedDoc(expandedDoc === id ? null : id)}
            onRemove={handleRemove}
          />
        ) : activeTab === 'links' ? (
          <LinksList links={links} documents={documents} />
        ) : (
          <AnalysisView result={analysisResult} />
        )}
      </div>

      {/* Footer: quick actions */}
      {documents.length >= 2 && activeTab === 'documents' && selectedDocs.size === 0 && (
        <div
          className="px-3 py-2 flex-shrink-0 flex items-center justify-center"
          style={{ borderTop: '1px solid var(--border-base)' }}
        >
          <button
            onClick={handleAnalyzeLinks}
            disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition disabled:opacity-30"
            style={{ backgroundColor: 'var(--accent-primary-15)', color: 'var(--accent-primary)' }}
          >
            {analyzing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            Analyser tous les liens
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

interface DocumentListProps {
  documents: DocumentEntry[];
  selectedDocs: Set<string>;
  expandedDoc: string | null;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
}

function DocumentList({ documents, selectedDocs, expandedDoc, onToggleSelect, onToggleExpand, onRemove }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <FileText size={20} style={{ color: 'var(--text-dimmed)' }} />
        </div>
        <div>
          <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            Aucun document
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-dimmed)' }}>
            Uploadez des PDF, images ou fichiers texte pour les analyser et croiser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-1">
      {documents.map((doc) => (
        <DocumentItem
          key={doc.id}
          doc={doc}
          selected={selectedDocs.has(doc.id)}
          expanded={expandedDoc === doc.id}
          onToggleSelect={() => onToggleSelect(doc.id)}
          onToggleExpand={() => onToggleExpand(doc.id)}
          onRemove={() => onRemove(doc.id)}
        />
      ))}
    </div>
  );
}

interface DocumentItemProps {
  doc: DocumentEntry;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onRemove: () => void;
}

function DocumentItem({ doc, selected, expanded, onToggleSelect, onToggleExpand, onRemove }: DocumentItemProps) {
  const isImage = doc.mimeType.startsWith('image/');
  const date = new Date(doc.uploadedAt);
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div
      className="group px-3 py-2 transition"
      style={{
        backgroundColor: selected ? 'var(--accent-primary-10)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent-primary)' : '2px solid transparent',
      }}
    >
      <div className="flex items-center gap-2">
        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          className="w-3.5 h-3.5 rounded border flex items-center justify-center transition flex-shrink-0"
          style={{
            borderColor: selected ? 'var(--accent-primary)' : 'var(--border-strong)',
            backgroundColor: selected ? 'var(--accent-primary)' : 'transparent',
          }}
        >
          {selected && <span className="text-[8px] text-white font-bold">✓</span>}
        </button>

        {/* Icon */}
        <div className="flex-shrink-0">
          {isImage ? (
            <FileImage size={13} style={{ color: '#a78bfa' }} />
          ) : (
            <FileText size={13} style={{ color: '#60a5fa' }} />
          )}
        </div>

        {/* Info */}
        <button onClick={onToggleExpand} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {doc.fileName}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 ml-3">
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{dateStr}</span>
            {doc.keywords.length > 0 && (
              <span className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
                {doc.keywords.slice(0, 3).join(', ')}
              </span>
            )}
          </div>
        </button>

        {/* Remove button */}
        <button
          onClick={onRemove}
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition hover:bg-red-500/10"
          title="Supprimer"
        >
          <Trash2 size={11} style={{ color: '#f87171' }} />
        </button>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && doc.summary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-6 pl-2" style={{ borderLeft: '1px solid var(--border-base)' }}>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {doc.summary}
              </p>
              {doc.tags.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <Tag size={9} style={{ color: 'var(--text-dimmed)' }} />
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Links List ──────────────────────────────────────────────────────────────

interface LinksListProps {
  links: DocumentLink[];
  documents: DocumentEntry[];
}

function LinksList({ links, documents }: LinksListProps) {
  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
        <Link2 size={20} style={{ color: 'var(--text-dimmed)' }} />
        <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          Aucun lien détecté. Lancez une analyse pour découvrir les connexions.
        </p>
      </div>
    );
  }

  const getDocName = (id: string) => documents.find((d) => d.id === id)?.fileName || id;

  const linkTypeColors: Record<string, string> = {
    thematic: '#60a5fa',
    complementary: '#34d399',
    contradictory: '#f87171',
    sequential: '#fbbf24',
    reference: '#a78bfa',
  };

  const linkTypeLabels: Record<string, string> = {
    thematic: 'Thématique',
    complementary: 'Complémentaire',
    contradictory: 'Contradictoire',
    sequential: 'Séquentiel',
    reference: 'Référence',
  };

  return (
    <div className="py-2 px-3 space-y-2">
      {links.map((link, idx) => (
        <div
          key={idx}
          className="rounded-lg p-2.5"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `${linkTypeColors[link.linkType] || '#6b7280'}20`,
                color: linkTypeColors[link.linkType] || '#6b7280',
              }}
            >
              {linkTypeLabels[link.linkType] || link.linkType}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              {Math.round(link.confidence * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium truncate max-w-[40%]">{getDocName(link.docA)}</span>
            <Link2 size={9} style={{ color: 'var(--text-dimmed)' }} />
            <span className="font-medium truncate max-w-[40%]">{getDocName(link.docB)}</span>
          </div>
          <p className="text-[9px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {link.description}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Analysis View ───────────────────────────────────────────────────────────

interface AnalysisViewProps {
  result: AnalysisResult | null;
}

function AnalysisView({ result }: AnalysisViewProps) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
        <Sparkles size={20} style={{ color: 'var(--text-dimmed)' }} />
        <div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Pas encore d'analyse
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-dimmed)' }}>
            Sélectionnez des documents et lancez une analyse ou une synthèse.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 px-3 space-y-3">
      {/* Documents analyzed */}
      {result.documents_analyzed.length > 0 && (
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-dimmed)' }}>
            Documents analysés
          </p>
          <div className="flex flex-wrap gap-1">
            {result.documents_analyzed.map((d) => (
              <span
                key={d.id}
                className="text-[9px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                {d.fileName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Links found */}
      {result.links.length > 0 && (
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-dimmed)' }}>
            {result.links.length} lien{result.links.length > 1 ? 's' : ''} trouvé{result.links.length > 1 ? 's' : ''}
          </p>
          <div className="space-y-1.5">
            {result.links.map((link, idx) => (
              <div key={idx} className="text-[10px] flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Link2 size={9} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                <span>{link.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Synthesis */}
      {result.synthesis && (
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-dimmed)' }}>
            Synthèse
          </p>
          <div
            className="text-[10px] leading-relaxed whitespace-pre-wrap rounded-lg p-3"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-base)',
            }}
          >
            {result.synthesis}
          </div>
        </div>
      )}
    </div>
  );
}

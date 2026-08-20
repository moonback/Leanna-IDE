/**
 * NotebookDetail — Vue détaillée d'un notebook (style NotebookLM)
 *
 * Layout 3 colonnes :
 * - Gauche : Sources (sidebar compacte)
 * - Centre : Chat IA (toujours visible) ou SourceViewer
 * - Droite : Studio (Notes, Générer, Audio)
 *
 * Avec navigation segmentée, split-view optionnel, et transitions fluides.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, FileText, MessageSquare, StickyNote, Sparkles, Mic,
  Loader2, RefreshCw, BookOpen, X, PanelRightOpen, PanelRightClose,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { SourcePanel } from './SourcePanel';
import { SourceViewer } from './SourceViewer';
import { NotebookChat } from './NotebookChat';
import { NotesPanel } from './NotesPanel';
import { GeneratePanel } from './GeneratePanel';
import { AudioOverviewPanel } from './AudioOverviewPanel';
import { SourcesPanelSkeleton } from '../ui/Skeleton';

interface NotebookData {
  id: string;
  title: string;
  description: string;
  sources: any[];
  notes: any[];
  generatedDocuments: any[];
  audioOverviews: any[];
  chatHistory: any[];
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

type Tab = 'sources' | 'chat' | 'notes' | 'generate' | 'audio';
type StudioTab = 'notes' | 'generate' | 'audio';

interface Props {
  notebookId: string;
  onBack: () => void;
}

export function NotebookDetail({ notebookId, onBack }: Props) {
  const { error: toastError } = useToast();
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [studioTab, setStudioTab] = useState<StudioTab>('notes');
  const [studioOpen, setStudioOpen] = useState(true);
  const [indexingProgress, setIndexingProgress] = useState<{ total: number; done: number; active: boolean }>({ total: 0, done: 0, active: false });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [viewingGeneratedDoc, setViewingGeneratedDoc] = useState<{ id: string; title: string; type: string; content: string; createdAt: string } | null>(null);

  const loadNotebook = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}`);
      if (!res.ok) throw new Error('Notebook introuvable');
      const data = await res.json();
      setNotebook(data.notebook);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setLoading(false);
    }
  }, [notebookId, toastError]);

  useEffect(() => { loadNotebook(); }, [loadNotebook]);

  // Listen for external source changes
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.notebookId || detail.notebookId === notebookId) {
        loadNotebook();
      }
    };
    window.addEventListener('notebook-sources-changed', handler);
    return () => window.removeEventListener('notebook-sources-changed', handler);
  }, [notebookId, loadNotebook]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('sources'); }
        if (e.key === '2') { e.preventDefault(); setActiveTab('chat'); }
        if (e.key === '3') { e.preventDefault(); setStudioTab('notes'); setStudioOpen(true); }
        if (e.key === '4') { e.preventDefault(); setStudioTab('generate'); setStudioOpen(true); }
        if (e.key === '5') { e.preventDefault(); setStudioTab('audio'); setStudioOpen(true); }
        if (e.key === '\\') { e.preventDefault(); setStudioOpen(v => !v); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading || !notebook) {
    return (
      <div className="notebook-workspace h-full flex flex-col">
        {/* Skeleton header */}
        <div className="flex items-center gap-3 border-b px-6 py-4" style={{ borderColor: 'var(--notebook-border)', backgroundColor: 'var(--notebook-surface-elevated)' }}>
          <div className="w-8 h-8 rounded-full animate-pulse" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
          <div className="w-10 h-10 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 rounded-full animate-pulse" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
            <div className="h-3 w-64 rounded-full animate-pulse" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
          </div>
        </div>
        {/* Skeleton content */}
        <div className="flex-1">
          <SourcesPanelSkeleton />
        </div>
      </div>
    );
  }

  const studioTabs: { key: StudioTab; icon: typeof StickyNote; label: string; badge?: number }[] = [
    { key: 'notes', icon: StickyNote, label: 'Notes', badge: notebook.notes.length },
    { key: 'generate', icon: Sparkles, label: 'Studio' },
    { key: 'audio', icon: Mic, label: 'Audio' },
  ];

  /** Renders the studio panel content */
  const renderStudioContent = (tab: StudioTab) => {
    switch (tab) {
      case 'notes':
        return <NotesPanel notebookId={notebookId} notes={notebook.notes} onRefresh={loadNotebook} />;
      case 'generate':
        return <GeneratePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} />;
      case 'audio':
        return <AudioOverviewPanel notebookId={notebookId} overviews={notebook.audioOverviews} sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} />;
    }
  };

  /** Renders the main center content */
  const renderMainContent = () => {
    if (selectedSourceId) {
      return (
        <SourceViewer
          notebookId={notebookId}
          sourceId={selectedSourceId}
          source={notebook.sources.find((s: any) => s.id === selectedSourceId)}
          onClose={() => setSelectedSourceId(null)}
        />
      );
    }

    // When a generated document is opened from the Studio
    if (viewingGeneratedDoc) {
      return (
        <GeneratePanel
          notebookId={notebookId}
          sources={notebook.sources}
          onRefresh={loadNotebook}
          fullView
          initialDoc={viewingGeneratedDoc}
          onClose={() => setViewingGeneratedDoc(null)}
        />
      );
    }

    if (activeTab === 'sources') {
      return <SourcePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onUploadProgress={setIndexingProgress} />;
    }

    return (
      <NotebookChat
        notebookId={notebookId}
        hasSources={notebook.sources.length > 0}
        sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))}
      />
    );
  };

  return (
    <div className="notebook-workspace h-full flex flex-col overflow-hidden">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="notebook-header flex-shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="notebook-icon-button"
            title="Retour aux notebooks"
            aria-label="Retour aux notebooks"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-base"
            style={{ backgroundColor: `${notebook.color}15`, color: notebook.color }}
            aria-hidden="true"
          >
            {notebook.icon || <BookOpen className="h-5 w-5" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="notebook-title truncate">{notebook.title}</h1>
              {indexingProgress.active && (
                <span className="notebook-pill">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {indexingProgress.done}/{indexingProgress.total}
                </span>
              )}
            </div>
            <p className="notebook-subtitle truncate">
              {notebook.description || `${notebook.sources.length} source${notebook.sources.length > 1 ? 's' : ''} · ${notebook.notes.length} note${notebook.notes.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {/* Center navigation */}
        <nav className="notebook-segmented hidden md:flex" aria-label="Notebook navigation">
          <button
            onClick={() => setActiveTab('sources')}
            className="notebook-segment"
            data-active={activeTab === 'sources'}
            title="Sources (Ctrl+1)"
          >
            <FileText className="h-4 w-4" />
            <span>Sources</span>
            <span className="notebook-count">{notebook.sources.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className="notebook-segment"
            data-active={activeTab === 'chat'}
            title="Chat (Ctrl+2)"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Chat</span>
          </button>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStudioOpen(v => !v)}
            className="notebook-icon-button hidden lg:flex"
            data-active={studioOpen}
            title={studioOpen ? 'Fermer Studio (Ctrl+\\)' : 'Ouvrir Studio (Ctrl+\\)'}
            aria-label={studioOpen ? 'Fermer Studio' : 'Ouvrir Studio'}
            aria-pressed={studioOpen}
          >
            {studioOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
          <button onClick={loadNotebook} className="notebook-icon-button" title="Actualiser" aria-label="Actualiser">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ─── Indexing Progress ─────────────────────────────── */}
      <AnimatePresence>
        {indexingProgress.active && indexingProgress.total > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 overflow-hidden border-b border-[var(--notebook-border)] bg-[var(--notebook-surface)] px-6 py-2"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--notebook-accent)]" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--notebook-accent)' }}
                  animate={{ width: `${(indexingProgress.done / indexingProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium">{indexingProgress.done}/{indexingProgress.total}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 3-Column Layout ──────────────────────────────── */}
      <div className="notebook-shell flex-1 overflow-hidden" data-studio-open={studioOpen}>
        {/* Left: Sources Rail */}
        <aside className="notebook-source-rail hidden min-w-0 lg:flex">
          <SourcePanel
            notebookId={notebookId}
            sources={notebook.sources}
            onRefresh={loadNotebook}
            onUploadProgress={setIndexingProgress}
            compact
            onSelectSource={(id) => setSelectedSourceId(id === selectedSourceId ? null : id)}
            selectedSourceId={selectedSourceId}
          />
        </aside>

        {/* Center: Main Content (Chat or Sources full view) */}
        <main className="notebook-main min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedSourceId || viewingGeneratedDoc?.id || activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {renderMainContent()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Right: Studio Panel (Notes / Generate / Audio) */}
        {studioOpen && (
          <aside className="notebook-context-rail hidden min-w-0 xl:flex flex-col overflow-hidden">
            {/* Studio tabs */}
            <div className="flex items-center gap-1 border-b border-[var(--notebook-border)] px-4 py-3">
              {studioTabs.map(({ key, icon: Icon, label, badge }) => (
                <button
                  key={key}
                  onClick={() => setStudioTab(key)}
                  className="notebook-segment"
                  data-active={studioTab === key}
                  title={label}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs">{label}</span>
                  {badge !== undefined && badge > 0 && <span className="notebook-count">{badge}</span>}
                </button>
              ))}
              <button
                onClick={() => setStudioOpen(false)}
                className="notebook-icon-button ml-auto"
                aria-label="Fermer le studio"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Studio content */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={studioTab}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  {renderStudioContent(studioTab)}
                </motion.div>
              </AnimatePresence>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

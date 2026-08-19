/**
 * NotebookDetail — Vue détaillée d'un notebook
 *
 * Onglets : Sources | Chat | Notes | Générer | Audio
 * Avec indicateur animé sur le tab actif et transition de contenu.
 * Supporte un mode split-view pour afficher deux onglets côte à côte.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, FileText, MessageSquare, StickyNote, Sparkles, Mic,
  Loader2, RefreshCw, BookOpen,
  Columns2, X,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { SourcePanel } from './SourcePanel';
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

interface Props {
  notebookId: string;
  onBack: () => void;
}

export function NotebookDetail({ notebookId, onBack }: Props) {
  const { error: toastError } = useToast();
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('sources');
  const [splitView, setSplitView] = useState(false);
  const [splitTab, setSplitTab] = useState<Tab>('chat');
  const [indexingProgress, setIndexingProgress] = useState<{ total: number; done: number; active: boolean }>({ total: 0, done: 0, active: false });
  const tabsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  // Keyboard shortcuts for tabs (Ctrl+1-5)
  useEffect(() => {
    const tabKeys: Tab[] = ['sources', 'chat', 'notes', 'generate', 'audio'];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 5) {
          e.preventDefault();
          setActiveTab(tabKeys[num - 1]);
        }
        // Ctrl+N → go to notes tab
        if (e.key === 'n') {
          e.preventDefault();
          setActiveTab('notes');
        }
        // Ctrl+F → focus on chat
        if (e.key === 'f') {
          e.preventDefault();
          setActiveTab('chat');
        }
        // Ctrl+\ → toggle split-view
        if (e.key === '\\') {
          e.preventDefault();
          setSplitView(v => {
            if (!v) {
              // Open split with a sensible default second tab
              setSplitTab(tabKeys.find(t => t !== activeTab) ?? 'chat');
            }
            return !v;
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  /** Toggle split-view: opens the given tab as the second pane, or closes split if already active */
  const handleSplitToggle = useCallback(() => {
    if (splitView) {
      setSplitView(false);
    } else {
      // Default the second pane to 'chat' unless active tab is already chat
      setSplitTab(activeTab === 'chat' ? 'sources' : 'chat');
      setSplitView(true);
    }
  }, [splitView, activeTab]);

  // If primary tab matches split tab, auto-swap to avoid duplicate
  useEffect(() => {
    if (splitView && activeTab === splitTab) {
      const tabKeys: Tab[] = ['sources', 'chat', 'notes', 'generate', 'audio'];
      const alt = tabKeys.find(t => t !== activeTab);
      if (alt) setSplitTab(alt);
    }
  }, [activeTab, splitTab, splitView]);

  if (loading || !notebook) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
        {/* Skeleton header */}
        <div className="flex items-center gap-3 border-b px-5 py-3.5" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
          <div className="w-8 h-8 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--border-base)' }} />
          <div className="w-9 h-9 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--border-base)' }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 rounded animate-pulse" style={{ backgroundColor: 'var(--border-base)' }} />
            <div className="h-2.5 w-56 rounded animate-pulse" style={{ backgroundColor: 'var(--border-base)' }} />
          </div>
        </div>
        {/* Skeleton tabs */}
        <div className="flex items-center gap-2 px-5 py-2 border-b" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--border-base)' }} />
          ))}
        </div>
        {/* Skeleton content */}
        <div className="flex-1">
          <SourcesPanelSkeleton />
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; icon: typeof FileText; label: string; badge?: number }[] = [
    { key: 'sources', icon: FileText, label: 'Sources', badge: notebook.sources.length },
    { key: 'chat', icon: MessageSquare, label: 'Chat' },
    { key: 'notes', icon: StickyNote, label: 'Notes', badge: notebook.notes.length },
    { key: 'generate', icon: Sparkles, label: 'Générer' },
    { key: 'audio', icon: Mic, label: 'Audio' },
  ];

  /** Renders the content for a given tab */
  const renderTabContent = (tab: Tab) => {
    switch (tab) {
      case 'sources':
        return <SourcePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onUploadProgress={setIndexingProgress} />;
      case 'chat':
        return <NotebookChat notebookId={notebookId} hasSources={notebook.sources.length > 0} sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))} />;
      case 'notes':
        return <NotesPanel notebookId={notebookId} notes={notebook.notes} onRefresh={loadNotebook} />;
      case 'generate':
        return <GeneratePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} />;
      case 'audio':
        return <AudioOverviewPanel notebookId={notebookId} overviews={notebook.audioOverviews} sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))} onRefresh={loadNotebook} />;
    }
  };

  /** Available tabs for the split-view second pane (exclude the primary active tab) */
  const splitTabOptions = tabs.filter(t => t.key !== activeTab);

  const primaryNav = tabs.filter(t => ['chat', 'notes', 'sources'].includes(t.key));
  const secondaryNav = tabs.filter(t => ['generate', 'audio'].includes(t.key));

  return (
    <div className="notebook-workspace h-full flex flex-col overflow-hidden">
      <header className="notebook-header flex-shrink-0">
        <div className="flex min-w-0 items-center gap-4">
          <button
            onClick={onBack}
            className="notebook-icon-button"
            title="Retour aux notebooks"
            aria-label="Retour aux notebooks"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--notebook-radius-md)] text-lg"
            style={{ backgroundColor: `${notebook.color}18`, color: notebook.color }}
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
                  Indexing {indexingProgress.done}/{indexingProgress.total}
                </span>
              )}
            </div>
            <p className="notebook-subtitle truncate">
              {notebook.description || `${notebook.sources.length} source${notebook.sources.length > 1 ? 's' : ''} · ${notebook.notes.length} note${notebook.notes.length > 1 ? 's' : ''} · AI knowledge workspace`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <nav className="notebook-segmented hidden md:flex" aria-label="Notebook workspace">
            {primaryNav.map(({ key, icon: Icon, label, badge }, idx) => (
              <button
                key={key}
                ref={(el) => { if (el) tabsRef.current.set(key, el); }}
                onClick={() => setActiveTab(key)}
                className="notebook-segment"
                data-active={activeTab === key}
                title={`${label} (Ctrl+${idx + 1})`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {badge !== undefined && <span className="notebook-count">{badge}</span>}
              </button>
            ))}
          </nav>

          <div className="notebook-actions">
            {secondaryNav.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="notebook-ghost-button"
                data-active={activeTab === key}
                title={label}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden xl:inline">{label}</span>
              </button>
            ))}
            <button
              onClick={handleSplitToggle}
              className="notebook-icon-button hidden lg:flex"
              data-active={splitView}
              title={splitView ? 'Fermer le split-view' : 'Mode split-view (Ctrl+\\)'}
              aria-label={splitView ? 'Fermer le split-view' : 'Ouvrir le split-view'}
              aria-pressed={splitView}
            >
              <Columns2 className="h-4 w-4" />
            </button>
            <button onClick={loadNotebook} className="notebook-icon-button" title="Actualiser" aria-label="Actualiser">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

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
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)]" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
                <motion.div className="h-full rounded-full bg-[var(--accent-primary)]" animate={{ width: `${(indexingProgress.done / indexingProgress.total) * 100}%` }} />
              </div>
              <span>{indexingProgress.done}/{indexingProgress.total}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="notebook-shell flex-1 overflow-hidden">
        <aside className="notebook-source-rail hidden min-w-0 lg:flex">
          <SourcePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onUploadProgress={setIndexingProgress} compact />
        </aside>

        <main className="notebook-main min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              {activeTab === 'sources' ? (
                <SourcePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onUploadProgress={setIndexingProgress} />
              ) : renderTabContent(activeTab)}
            </motion.div>
          </AnimatePresence>
        </main>

        <aside className="notebook-context-rail hidden min-w-0 2xl:flex">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="notebook-eyebrow">Knowledge</p>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Notes rapides</h2>
            </div>
            <button onClick={() => setActiveTab('notes')} className="notebook-ghost-button">Ouvrir</button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <NotesPanel notebookId={notebookId} notes={notebook.notes.slice(0, 6)} onRefresh={loadNotebook} compact />
          </div>
        </aside>

        {splitView && (
          <motion.aside className="notebook-context-rail min-w-[360px] max-w-[50%]" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: '42%' }} exit={{ opacity: 0, width: 0 }}>
            <div className="flex items-center gap-2 border-b border-[var(--notebook-border)] px-3 py-3">
              {splitTabOptions.map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => setSplitTab(key)} className="notebook-segment" data-active={splitTab === key}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
              <button onClick={() => setSplitView(false)} className="notebook-icon-button ml-auto" aria-label="Fermer le panneau"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{renderTabContent(splitTab)}</div>
          </motion.aside>
        )}
      </div>
    </div>
  );
}

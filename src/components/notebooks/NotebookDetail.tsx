/**
 * NotebookDetail — Vue détaillée d'un notebook
 *
 * Onglets : Sources | Chat | Notes | Générer | Audio
 * Avec indicateur animé sur le tab actif et transition de contenu.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, FileText, MessageSquare, StickyNote, Sparkles, Mic,
  Loader2, RefreshCw, Settings, ChevronRight, BookOpen,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { SourcePanel } from './SourcePanel';
import { NotebookChat } from './NotebookChat';
import { NotesPanel } from './NotesPanel';
import { GeneratePanel } from './GeneratePanel';
import { AudioOverviewPanel } from './AudioOverviewPanel';
import { SourcesPanelSkeleton, ChatPanelSkeleton, NotesPanelSkeleton } from '../ui/Skeleton';

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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Breadcrumb */}
      <div
        className="flex items-center gap-1.5 px-5 py-1.5 text-[10px] border-b lg:px-7"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <button
          onClick={onBack}
          className="hover:underline transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          Notebooks
        </button>
        <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
        <span className="font-medium truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
          {notebook.title}
        </span>
        <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
        <span style={{ color: 'var(--accent-primary)' }}>
          {tabs.find(t => t.key === activeTab)?.label}
        </span>
      </div>

      {/* Header */}
      <header
        className="flex flex-shrink-0 items-center gap-3 border-b px-5 py-3.5 lg:px-7"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <button
          onClick={onBack}
          className="p-2 rounded-lg transition-all hover:bg-white/5 active:scale-95"
          style={{ color: 'var(--text-muted)' }}
          title="Retour aux notebooks"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 shadow-sm"
          style={{ backgroundColor: `${notebook.color}20`, border: `1px solid ${notebook.color}30` }}
        >
          {notebook.icon}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {notebook.title}
          </h1>
          {notebook.description && (
            <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {notebook.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={loadNotebook}
            className="p-2 rounded-lg transition-all hover:bg-white/5 active:scale-95"
            style={{ color: 'var(--text-muted)' }}
            title="Actualiser"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Tabs with animated indicator */}
      <div
        className="relative flex items-center gap-0.5 px-5 py-1.5 flex-shrink-0 border-b overflow-x-auto lg:px-7"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        {tabs.map(({ key, icon: Icon, label, badge }, idx) => (
          <button
            key={key}
            ref={(el) => { if (el) tabsRef.current.set(key, el); }}
            onClick={() => setActiveTab(key)}
            className="relative flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
            style={{
              color: activeTab === key ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
            title={`${label} (Ctrl+${idx + 1})`}
          >
            {/* Active background indicator */}
            {activeTab === key && (
              <motion.div
                layoutId="activeTabBg"
                className="absolute inset-0 rounded-lg"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge !== undefined && badge > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[9px] font-bold min-w-[18px] text-center"
                  style={{
                    backgroundColor: activeTab === key ? 'var(--accent-primary)' : 'var(--bg-base)',
                    color: activeTab === key ? '#fff' : 'var(--text-dimmed)',
                  }}
                >
                  {badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Content with crossfade */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeTab === 'sources' && <SourcePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} />}
            {activeTab === 'chat' && <NotebookChat notebookId={notebookId} hasSources={notebook.sources.length > 0} sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))} />}
            {activeTab === 'notes' && <NotesPanel notebookId={notebookId} notes={notebook.notes} onRefresh={loadNotebook} />}
            {activeTab === 'generate' && <GeneratePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} />}
            {activeTab === 'audio' && <AudioOverviewPanel notebookId={notebookId} overviews={notebook.audioOverviews} sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))} onRefresh={loadNotebook} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

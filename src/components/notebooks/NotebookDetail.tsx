/**
 * NotebookDetail — Vue détaillée d'un notebook
 *
 * Onglets : Sources | Chat | Notes | Générer | Audio
 */

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, FileText, MessageSquare, StickyNote, Sparkles, Mic,
  Loader2, RefreshCw,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { SourcePanel } from './SourcePanel';
import { NotebookChat } from './NotebookChat';
import { NotesPanel } from './NotesPanel';
import { GeneratePanel } from './GeneratePanel';
import { AudioOverviewPanel } from './AudioOverviewPanel';

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

  if (loading || !notebook) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
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
      {/* Header */}
      <header
        className="flex flex-shrink-0 items-center gap-3 border-b px-5 py-3 lg:px-7"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <button
          onClick={onBack}
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
          style={{ backgroundColor: `${notebook.color}20` }}
        >
          {notebook.icon}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {notebook.title}
          </h1>
          {notebook.description && (
            <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
              {notebook.description}
            </p>
          )}
        </div>

        <button
          onClick={loadNotebook}
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--text-muted)' }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 px-5 py-2 flex-shrink-0 border-b overflow-x-auto lg:px-7"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        {tabs.map(({ key, icon: Icon, label, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
            style={{
              backgroundColor: activeTab === key ? 'var(--accent-subtle)' : 'transparent',
              color: activeTab === key ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {badge !== undefined && badge > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-dimmed)' }}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'sources' && <SourcePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} />}
        {activeTab === 'chat' && <NotebookChat notebookId={notebookId} hasSources={notebook.sources.length > 0} />}
        {activeTab === 'notes' && <NotesPanel notebookId={notebookId} notes={notebook.notes} onRefresh={loadNotebook} />}
        {activeTab === 'generate' && <GeneratePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} />}
        {activeTab === 'audio' && <AudioOverviewPanel notebookId={notebookId} overviews={notebook.audioOverviews} onRefresh={loadNotebook} />}
      </div>
    </div>
  );
}

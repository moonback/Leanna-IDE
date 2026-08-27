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
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowLeft, FileText, MessageSquare, StickyNote, Sparkles, Mic, Clock,
  Loader2, RefreshCw, BookOpen, X, PanelRightOpen, PanelRightClose,
  Save,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { SourcePanel } from './SourcePanel';
import { SourceViewer } from './SourceViewer';
import { NotebookChat } from './NotebookChat';
import { NotesPanel, type NoteEditorData } from './NotesPanel';
import { GeneratePanel } from './GeneratePanel';
import { HistoryPanel } from './HistoryPanel';
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
type StudioTab = 'notes' | 'generate' | 'audio' | 'history';

interface Props {
  notebookId: string;
  onBack: () => void;
}

// ─── Transition helpers ────────────────────────────────────────────────────
// Springs critically-damped par défaut (bounce: 0) : settle naturel, jamais de
// saut si l'utilisateur redéclenche une transition en plein vol. Basculent sur
// un simple fondu court si l'utilisateur a demandé moins de mouvement.
function useFluidTransition() {
  const reduceMotion = useReducedMotion();
  return {
    spring: reduceMotion
      ? { duration: 0.1, ease: 'easeOut' as const }
      : { type: 'spring' as const, bounce: 0, duration: 0.3 },
    // Variante crossfade pure, sans translation directionnelle — pour des vues
    // "pairs" (onglets non ordonnés) où glisser suggérerait une navigation
    // avant/arrière qui n'existe pas.
    fadeOnly: (offset: { x?: number; y?: number }) =>
      reduceMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : {
            initial: { opacity: 0, ...offset },
            animate: { opacity: 1, x: 0, y: 0 },
            exit: { opacity: 0, ...offset },
          },
  };
}

// ─── Note Editor — rendered in the center column ──────────────────────────────
function NoteEditorCenter({
  notebookId,
  data,
  onClose,
  onSaved,
}: {
  notebookId: string;
  data: NoteEditorData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [title, setTitle] = useState(data.title);
  const [content, setContent] = useState(data.content);
  const [saving, setSaving] = useState(false);
  const { spring, fadeOnly } = useFluidTransition();
  // Le note editor a une vraie origine (il remplace la vue courante plutôt que
  // de basculer entre pairs) : il garde un léger déplacement directionnel,
  // symétrique à l'entrée et à la sortie (même chemin dans les deux sens).
  const motionProps = fadeOnly({ x: 16 });

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (data.id) {
        // Update
        const res = await fetch(`/api/notebooks/${notebookId}/notes/${data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        });
        if (!res.ok) throw new Error();
        success('Note mise à jour');
      } else {
        // Create
        const res = await fetch(`/api/notebooks/${notebookId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        });
        if (!res.ok) throw new Error();
        success('Note créée');
      }
      onSaved();
    } catch {
      toastError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      {...motionProps}
      transition={spring}
      className="h-full flex flex-col"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
          >
            <StickyNote className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {data.id ? 'Modifier la note' : 'Nouvelle note'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {content.length} caractères
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-transform active:scale-95 hover:bg-white/5"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold disabled:opacity-40 transition-transform active:scale-95 text-white"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Sauvegarde...' : data.id ? 'Mettre à jour' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-6 pb-3 flex-shrink-0">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titre de la note..."
          autoFocus
          className="w-full text-xl font-bold bg-transparent outline-none placeholder:opacity-30 notebook-heading"
          style={{ color: 'var(--text-primary)' }}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
        />
        <div className="h-px mt-3" style={{ backgroundColor: 'var(--border-base)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Écrivez votre note ici... (Markdown supporté)"
          className="w-full h-full bg-transparent outline-none resize-none text-sm leading-7 placeholder:opacity-30"
          style={{ color: 'var(--text-secondary)' }}
        />
      </div>
    </motion.div>
  );
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
  const [noteEditorData, setNoteEditorData] = useState<NoteEditorData | null>(null);
  const { spring, fadeOnly } = useFluidTransition();
  
  // Détecte prefers-reduced-transparency pour le header
  const [reducedTransparency, setReducedTransparency] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    setReducedTransparency(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedTransparency(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  
  const headerStyle = reducedTransparency
    ? { backgroundColor: 'var(--notebook-surface-elevated)' }
    : { 
        backdropFilter: 'blur(20px) saturate(180%)', 
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        backgroundColor: 'var(--notebook-surface-elevated)' 
      };

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

  // Keyboard shortcuts — Cmd sur macOS, Ctrl ailleurs (convention plateforme)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (modifier && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('sources'); }
        if (e.key === '2') { e.preventDefault(); setActiveTab('chat'); }
        if (e.key === '3') { e.preventDefault(); setStudioTab('notes'); setStudioOpen(true); }
        if (e.key === '4') { e.preventDefault(); setStudioTab('generate'); setStudioOpen(true); }
        if (e.key === '5') { e.preventDefault(); setStudioTab('audio'); setStudioOpen(true); }
        if (e.key === '6') { e.preventDefault(); setStudioTab('history'); setStudioOpen(true); }
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
          <div className="w-10 h-10 rounded-full animate-pulse" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
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
    { key: 'generate', icon: Sparkles, label: 'Générer', badge: notebook.generatedDocuments.length },
    { key: 'notes', icon: StickyNote, label: 'Notes', badge: notebook.notes.length },
    { key: 'history', icon: Clock, label: 'Historique', badge: notebook.chatHistory.length },
    { key: 'audio', icon: Mic, label: 'Audio', badge: notebook.audioOverviews.length },
  ];

  /** Renders the studio panel content */
  const renderStudioContent = (tab: StudioTab) => {
    switch (tab) {
      case 'notes':
        return <NotesPanel notebookId={notebookId} notes={notebook.notes} onRefresh={loadNotebook} onOpenNoteEditor={(data) => { setNoteEditorData(data); setSelectedSourceId(null); setViewingGeneratedDoc(null); }} />;
      case 'generate':
        return <GeneratePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} />;
      case 'history':
        return <HistoryPanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} />;
      case 'audio':
        return <AudioOverviewPanel notebookId={notebookId} overviews={notebook.audioOverviews} sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} />;
      default:
        return <div className="p-4 text-center text-[var(--text-muted)]">Onglet non trouvé</div>;
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

    // Note editor in center column
    if (noteEditorData !== null) {
      return (
        <NoteEditorCenter
          notebookId={notebookId}
          data={noteEditorData}
          onClose={() => setNoteEditorData(null)}
          onSaved={() => { setNoteEditorData(null); loadNotebook(); }}
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

  // Contenu central : Sources / Chat / SourceViewer / NoteEditor sont des vues
  // "pairs" sans ordre spatial entre elles — un simple crossfade évite de
  // suggérer une navigation avant/arrière qui n'existe pas.
  const centerMotion = fadeOnly({});
  // Onglets Studio : même logique, pairs non ordonnées → crossfade pur.
  const studioMotion = fadeOnly({});

  return (
    <div className="notebook-workspace h-full flex flex-col overflow-hidden">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header
        className="notebook-header flex-shrink-0"
        style={headerStyle}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="notebook-icon-button transition-transform active:scale-90"
            title="Retour aux notebooks"
            aria-label="Retour aux notebooks"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-base"
            style={{ backgroundColor: `${notebook.color}15`, color: notebook.color }}
            aria-hidden="true"
          >
            {notebook.icon || <BookOpen className="h-5 w-5" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="notebook-title truncate notebook-heading">{notebook.title}</h1>
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
            onClick={() => { setActiveTab('sources'); setSelectedSourceId(null); }}
            className="notebook-segment transition-transform active:scale-95"
            data-active={activeTab === 'sources'}
            title="Sources (Ctrl+1 / ⌘1)"
          >
            <FileText className="h-4 w-4" />
            <span>Sources</span>
            <span className="notebook-count">{notebook.sources.length}</span>
          </button>
          <button
            onClick={() => { setActiveTab('chat'); setSelectedSourceId(null); }}
            className="notebook-segment transition-transform active:scale-95"
            data-active={activeTab === 'chat'}
            title="Chat (Ctrl+2 / ⌘2)"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Chat</span>
          </button>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStudioOpen(v => !v)}
            className="notebook-icon-button hidden md:flex transition-transform active:scale-90"
            data-active={studioOpen}
            title={studioOpen ? 'Fermer Studio (Ctrl+\\ / ⌘\\)' : 'Ouvrir Studio (Ctrl+\\ / ⌘\\)'}
            aria-label={studioOpen ? 'Fermer Studio' : 'Ouvrir Studio'}
            aria-pressed={studioOpen}
          >
            {studioOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
          <button
            onClick={loadNotebook}
            className="notebook-icon-button transition-transform active:scale-90"
            title="Actualiser"
            aria-label="Actualiser"
          >
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
            transition={spring}
            className="flex-shrink-0 overflow-hidden border-b border-[var(--notebook-border)] bg-[var(--notebook-surface)] px-6 py-2"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--notebook-accent)]" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--notebook-accent)' }}
                  animate={{ width: `${(indexingProgress.done / indexingProgress.total) * 100}%` }}
                  transition={spring}
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
        <aside className="notebook-source-rail hidden min-w-0 h-full lg:flex overflow-y-auto">
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
              {...centerMotion}
              transition={spring}
              className="h-full"
            >
              {renderMainContent()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Right: Studio Panel (Notes / Generate / Audio) */}
        {studioOpen && (
          <aside className="notebook-context-rail hidden min-w-0 md:flex flex-col overflow-hidden">
            {/* Studio tabs */}
            <div className="flex items-center gap-1 border-b border-[var(--notebook-border)] px-4 py-3">
              {studioTabs.map(({ key, icon: Icon, label, badge }) => {
                const shortcuts: Record<StudioTab, string> = {
                  notes: 'Ctrl+3 / ⌘3',
                  generate: 'Ctrl+4 / ⌘4',
                  history: 'Ctrl+6 / ⌘6',
                  audio: 'Ctrl+5 / ⌘5',
                };
                return (
                  <button
                    key={key}
                    onClick={() => setStudioTab(key)}
                    className="notebook-segment transition-transform active:scale-95"
                    data-active={studioTab === key}
                    title={`${label} (${shortcuts[key]})`}
                    aria-label={label}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {badge !== undefined && badge > 0 && <span className="notebook-count">{badge}</span>}
                  </button>
                );
              })}
              <button
                onClick={() => setStudioOpen(false)}
                className="notebook-icon-button ml-auto transition-transform active:scale-90 flex-shrink-0"
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
                  {...studioMotion}
                  transition={spring}
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
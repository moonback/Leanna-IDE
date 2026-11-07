/**
 * NotebookDetail — Vue détaillée d'un notebook (style NotebookLM)
 *
 * Layout 3 panneaux flottants, chacun repliable en rail d'icônes :
 * - Gauche : Sources (liste compacte + « Ajouter des sources »)
 * - Centre : Discussion (titre + résumé IA en accueil) ou SourceViewer /
 *   document généré / éditeur de note / gestionnaire d'ajout de sources
 * - Droite : Studio (Générer, Notes, Historique, Audio)
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowLeft, FileText, StickyNote, Sparkles, Mic, Clock, Plus, Activity,
  Loader2, RefreshCw, BookOpen, X, PanelRightOpen, PanelRightClose, PanelLeftOpen,
  Save, Maximize2, Minimize2,
} from 'lucide-react';
import { SourcesSummaryCard } from './SourcesSummaryCard.js';
import { useToast } from '../ui/Toast.js';
import { api, apiVoid } from './api/client.js';
import { SourcePanel } from './SourcePanel.js';
import { SourceViewer } from './SourceViewer.js';
import { NotebookChat } from './NotebookChat.js';
import { NotebookLiveProvider } from './chat/NotebookLiveContext.js';
import { NotebookVoicePanel } from './chat/NotebookVoicePanel.js';
import { NotesPanel, type NoteEditorData } from './NotesPanel.js';
import { GeneratePanel } from './GeneratePanel.js';
import { GeneratedDocsPanel } from './GeneratedDocsPanel.js';
import { AudioOverviewPanel } from './AudioOverviewPanel.js';
import { IndexingMonitor } from './IndexingMonitor.js';
import { SourcesPanelSkeleton } from '../ui/Skeleton.js';
import { NbButton, NbIconButton } from './ui/primitives.js';
import { ViewHeader } from '../ui/ViewHeader.js';

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
type StudioTab = 'generate' | 'audio' | 'history';

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
        await apiVoid(`/api/notebooks/${notebookId}/notes/${data.id}`, {
          method: 'PATCH',
          json: { title: title.trim(), content: content.trim() },
        });
        success('Note mise à jour');
      } else {
        // Create
        await apiVoid(`/api/notebooks/${notebookId}/notes`, {
          method: 'POST',
          json: { title: title.trim(), content: content.trim() },
        });
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
      className="flex h-full flex-col"
    >
      {/* Header */}
      <div className="notebook-panel-header px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)]">
            <StickyNote className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="notebook-panel-title truncate">
              {data.id ? 'Modifier la note' : 'Nouvelle note'}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {content.length} caractères
            </p>
          </div>
        </div>
        <div className="notebook-actions gap-2">
          <NbButton variant="ghost" size="sm" icon={X} onClick={onClose}>
            Annuler
          </NbButton>
          <NbButton
            variant="primary"
            size="sm"
            icon={Save}
            onClick={handleSave}
            disabled={!title.trim() || saving}
          >
            {saving ? 'Sauvegarde...' : data.id ? 'Mettre à jour' : 'Enregistrer'}
          </NbButton>
        </div>
      </div>

      {/* Title */}
      <div className="flex-shrink-0 px-6 pb-3 pt-6">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titre de la note..."
          autoFocus
          className="notebook-heading w-full bg-transparent text-xl font-bold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dimmed)]"
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
        />
        <div className="mt-3 h-px bg-[var(--notebook-border)]" />
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 px-6 pb-6">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Écrivez votre note ici... (Markdown supporté)"
          className="notebook-body h-full w-full resize-none bg-transparent text-sm leading-7 text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-dimmed)]"
        />
      </div>
    </motion.div>
  );
}

export function NotebookDetail({ notebookId, onBack }: Props) {
  const { error: toastError } = useToast();
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Centre = discussion par défaut (comme NotebookLM) ; 'sources' ouvre le
  // gestionnaire d'ajout de sources (upload, URL, texte, GitHub, codebase).
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [studioTab, setStudioTab] = useState<StudioTab>('generate');
  const [studioOpen, setStudioOpen] = useState(true);
  const [sourceRailOpen, setSourceRailOpen] = useState(true);
  const [panelWidths, setPanelWidths] = useState({ sources: 280, studio: 340 });
  const [panelWidthsReady, setPanelWidthsReady] = useState(false);
  const [audioDockElement, setAudioDockElement] = useState<HTMLDivElement | null>(null);
  const focusMode = !sourceRailOpen && !studioOpen;

  // Les largeurs sont partagées entre notebooks et conservées localement.
  // Les valeurs stockées sont validées pour éviter de casser la grille après
  // une ancienne version ou une valeur locale invalide.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('leanna:notebook:panel-widths');
      if (raw) {
        const saved = JSON.parse(raw) as { sources?: unknown; studio?: unknown };
        setPanelWidths({
          sources: typeof saved.sources === 'number' && Number.isFinite(saved.sources)
            ? Math.min(420, Math.max(220, saved.sources)) : 280,
          studio: typeof saved.studio === 'number' && Number.isFinite(saved.studio)
            ? Math.min(480, Math.max(260, saved.studio)) : 340,
        });
      }
    } catch {
      // Une préférence illisible ne doit jamais empêcher l'ouverture du Notebook.
    } finally {
      setPanelWidthsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!panelWidthsReady) return;
    try {
      window.localStorage.setItem('leanna:notebook:panel-widths', JSON.stringify(panelWidths));
    } catch {
      // Le workspace reste utilisable si le stockage local est indisponible.
    }
  }, [panelWidths, panelWidthsReady]);
  const [indexingProgress, setIndexingProgress] = useState<{ total: number; done: number; active: boolean }>({ total: 0, done: 0, active: false });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [showIndexing, setShowIndexing] = useState(false);
  const [viewingGeneratedDoc, setViewingGeneratedDoc] = useState<{ id: string; title: string; type: string; content: string; createdAt: string } | null>(null);
  // Compteur de documents générés tenu à jour en direct, sans recharger tout
  // le notebook (ce qui démonterait l'assistant vocal). Alimenté par l'event
  // léger 'notebook-generated-docs-changed'.
  const [generatedCount, setGeneratedCount] = useState(0);
  const [noteEditorData, setNoteEditorData] = useState<NoteEditorData | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const { spring, fadeOnly } = useFluidTransition();
  const prefersReducedMotion = useReducedMotion();

  const loadNotebook = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api<{ notebook: NotebookData }>(`/api/notebooks/${notebookId}`);
      if (!data.notebook || data.notebook.id !== notebookId || !Array.isArray(data.notebook.sources) || !Array.isArray(data.notebook.notes)) {
        throw new Error('Les données du notebook sont incomplètes ou invalides.');
      }
      setNotebook(data.notebook);
    } finally {
      setLoading(false);
    }
  }, [notebookId, toastError]);

  useEffect(() => { loadNotebook(); }, [loadNotebook]);

  // Synchroniser les statuts d'indexation sans recharger tout le Notebook :
  // l'indexation vectorielle se termine après l'ingestion du fichier et le
  // premier chargement peut donc encore voir "pending".
  useEffect(() => {
    if (!notebook) return;
    let cancelled = false;
    const refreshIndexing = async () => {
      try {
        const result = await api<{
          indexing: {
            sources: Array<{
              id: string;
              indexingStatus: NonNullable<NotebookData['sources'][number]['indexingStatus']>;
              indexingAttempts: number;
              indexingError?: string;
              indexingUpdatedAt?: string;
              indexingNextRetryAt?: string;
              indexingHistory?: unknown[];
            }>;
          };
        }>(`/api/notebooks/${notebookId}/embeddings/indexing-status`);
        if (cancelled) return;
        const byId = new Map(result.indexing.sources.map(source => [source.id, source]));
        setNotebook(current => {
          if (!current || current.id !== notebookId) return current;
          let changed = false;
          const sources = current.sources.map(source => {
            const status = byId.get(source.id);
            if (!status) return source;
            if (source.indexingStatus === status.indexingStatus
              && source.indexingAttempts === status.indexingAttempts
              && source.indexingError === status.indexingError
              && source.indexingUpdatedAt === status.indexingUpdatedAt
              && source.indexingNextRetryAt === status.indexingNextRetryAt) return source;
            changed = true;
            return { ...source, ...status };
          });
          return changed ? { ...current, sources } : current;
        });
      } catch {
        // Le statut détaillé reste disponible dans le moniteur ; une erreur
        // de rafraîchissement ne doit pas bloquer l'édition du Notebook.
      }
    };
    void refreshIndexing();
    const timer = window.setInterval(() => { void refreshIndexing(); }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [notebookId, Boolean(notebook)]);

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

  // Resynchroniser le compteur quand le notebook (re)charge depuis le serveur.
  const serverGeneratedCount = notebook?.generatedDocuments.length ?? 0;
  useEffect(() => {
    setGeneratedCount(serverGeneratedCount);
  }, [serverGeneratedCount]);

  // Compteur en direct : un document généré par l'assistant vocal incrémente le
  // badge sans recharger le notebook (préserve la session vocale active).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ notebookId?: string }>).detail;
      if (!detail?.notebookId || detail.notebookId === notebookId) {
        setGeneratedCount((n) => n + 1);
      }
    };
    window.addEventListener('notebook-generated-docs-changed', handler as EventListener);
    return () => window.removeEventListener('notebook-generated-docs-changed', handler as EventListener);
  }, [notebookId]);

  // Keyboard shortcuts — Cmd sur macOS, Ctrl ailleurs (convention plateforme)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (modifier && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); setSourceRailOpen(v => !v); }
        if (e.key === '2') { e.preventDefault(); setActiveTab('chat'); setSelectedSourceId(null); setViewingGeneratedDoc(null); setNoteEditorData(null); setNotesOpen(false); setShowIndexing(false); }
        if (e.key === '3') { e.preventDefault(); setNotesOpen(true); setSelectedSourceId(null); setViewingGeneratedDoc(null); setNoteEditorData(null); setShowIndexing(false); }
        if (e.key === '4') { e.preventDefault(); setStudioTab('generate'); setStudioOpen(true); }
        if (e.key === '5') { e.preventDefault(); setStudioTab('audio'); setStudioOpen(true); }
        if (e.key === '6') { e.preventDefault(); setStudioTab('history'); setStudioOpen(true); }
        if (e.key === '7') { e.preventDefault(); setShowIndexing(true); setSelectedSourceId(null); setViewingGeneratedDoc(null); setNoteEditorData(null); setNotesOpen(false); }
        if (e.key === '\\') { e.preventDefault(); setStudioOpen(v => !v); }
        if (e.key === '0') {
          e.preventDefault();
          const enteringFocus = sourceRailOpen || studioOpen;
          setSourceRailOpen(!enteringFocus);
          setStudioOpen(!enteringFocus);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sourceRailOpen, studioOpen]);

  if (loading) {
    return (
      <div className="notebook-workspace h-full flex flex-col">
        <div className="notebook-header flex-shrink-0 justify-start gap-3 bg-[var(--notebook-surface-elevated)]" aria-hidden="true">
          <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--notebook-surface-muted)]" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--notebook-surface-muted)]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded-full bg-[var(--notebook-surface-muted)]" />
            <div className="h-3 w-64 animate-pulse rounded-full bg-[var(--notebook-surface-muted)]" />
          </div>
        </div>
        <div className="flex-1"><SourcesPanelSkeleton /></div>
      </div>
    );
  }

  if (loadError || !notebook) {
    return (
      <div className="notebook-workspace flex h-full flex-col overflow-hidden">
        <ViewHeader title="Notebook indisponible" icon={BookOpen} description="Le contenu de ce notebook n’a pas pu être chargé." actions={<NbButton variant="ghost" icon={ArrowLeft} onClick={onBack}>Retour</NbButton>} />
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="max-w-lg text-sm text-[var(--text-muted)]">{loadError || 'Ce notebook est introuvable ou n’est plus accessible.'}</p>
          <div className="flex items-center gap-2">
            <NbButton variant="secondary" icon={RefreshCw} onClick={loadNotebook}>Réessayer</NbButton>
            <NbButton variant="ghost" onClick={onBack}>Retour à la bibliothèque</NbButton>
          </div>
        </div>
      </div>
    );
  }

  const studioTabs: { key: StudioTab; icon: typeof StickyNote; label: string; badge?: number }[] = [
    { key: 'generate', icon: Sparkles, label: 'Générer', badge: generatedCount },
    { key: 'history', icon: Clock, label: 'Historique', badge: generatedCount },
    { key: 'audio', icon: Mic, label: 'Vocal', badge: notebook.audioOverviews.length },
  ];
  const studioShortcuts: Record<StudioTab, string> = {
    generate: 'Ctrl+4 / ⌘4',
    audio: 'Ctrl+5 / ⌘5',
    history: 'Ctrl+6 / ⌘6',
  };

  // Signal de rafraîchissement du résumé : change quand l'ensemble des sources change
  const sourcesHash = notebook.sources.map((s: any) => s.id).sort().join('|');

  /** Ouvre le gestionnaire d'ajout de sources dans la colonne centrale */
  const openSourceManager = () => {
    setActiveTab('sources');
    setSelectedSourceId(null);
    setViewingGeneratedDoc(null);
    setNoteEditorData(null);
    setNotesOpen(false);
    setShowIndexing(false);
  };

  /** Ouvre le moniteur d'indexation dans la colonne centrale */
  const openIndexing = () => {
    setShowIndexing(true);
    setSelectedSourceId(null);
    setViewingGeneratedDoc(null);
    setNoteEditorData(null);
    setNotesOpen(false);
  };

  /** Ouvre les notes dans la colonne centrale */
  const openNotes = () => {
    setNotesOpen(true);
    setSelectedSourceId(null);
    setViewingGeneratedDoc(null);
    setNoteEditorData(null);
    setShowIndexing(false);
  };

  const openStudioTab = (key: StudioTab) => {
    setStudioTab(key);
    setStudioOpen(true);
  };

  /** Renders all studio panels simultaneously — active one is visible, others are hidden.
   *  This preserves component state (e.g. GeneratePanel queue) across tab switches. */
  const renderStudioPanels = () => (
    <>
      <div role="tabpanel" id="studio-panel-generate" aria-labelledby="studio-tab-generate" className="h-full transition-opacity duration-150" style={{ display: studioTab === 'generate' ? 'block' : 'none' }}>
        <GeneratePanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} />
      </div>
      <div role="tabpanel" id="studio-panel-history" aria-labelledby="studio-tab-history" className="h-full transition-opacity duration-150" style={{ display: studioTab === 'history' ? 'block' : 'none' }}>
        <GeneratedDocsPanel notebookId={notebookId} sources={notebook.sources} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} />
      </div>
      <div role="tabpanel" id="studio-panel-audio" aria-labelledby="studio-tab-audio" className="h-full transition-opacity duration-150" style={{ display: studioTab === 'audio' ? 'block' : 'none' }}>
        <AudioOverviewPanel notebookId={notebookId} overviews={notebook.audioOverviews} sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))} onRefresh={loadNotebook} onViewDoc={(doc) => setViewingGeneratedDoc(doc)} playerDockElement={audioDockElement} />
      </div>
    </>
  );

  /** Renders the main center content */
  const renderMainContent = () => {
    // Moniteur d'indexation — ouvert depuis la colonne Sources
    if (showIndexing) {
      return (
        <div className="flex h-full flex-col">
          <div className="notebook-panel-header px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)]">
                <Activity className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="notebook-panel-title truncate">Indexation</h2>
                <p className="text-xs text-[var(--text-muted)]">État réel des embeddings par source</p>
              </div>
            </div>
            <NbIconButton icon={X} label="Fermer" onClick={() => setShowIndexing(false)} />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <IndexingMonitor notebookId={notebookId} />
          </div>
        </div>
      );
    }

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

    // Notes — vue centrale ouverte depuis le header
    if (notesOpen) {
      return (
        <div className="flex h-full flex-col">
          <div className="notebook-panel-header px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)]">
                <StickyNote className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="notebook-panel-title truncate">Notes</h2>
                <p className="text-xs text-[var(--text-muted)]">{notebook.notes.length} note{notebook.notes.length > 1 ? 's' : ''}</p>
              </div>
            </div>
            <NbIconButton icon={X} label="Fermer les notes" onClick={() => setNotesOpen(false)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <NotesPanel
              notebookId={notebookId}
              notes={notebook.notes}
              onRefresh={loadNotebook}
              onOpenNoteEditor={(data) => { setNoteEditorData(data); setSelectedSourceId(null); setViewingGeneratedDoc(null); }}
            />
          </div>
        </div>
      );
    }

    if (activeTab === 'sources') {
      return (
        <SourcePanel
          notebookId={notebookId}
          sources={notebook.sources}
          onRefresh={loadNotebook}
          onUploadProgress={setIndexingProgress}
          onClose={() => setActiveTab('chat')}
        />
      );
    }

    return (
      <NotebookChat
        notebookId={notebookId}
        hasSources={notebook.sources.length > 0}
        sources={notebook.sources.map((s: any) => ({ id: s.id, title: s.title }))}
        onRefresh={loadNotebook}
        onAddSources={openSourceManager}
        onOpenSource={(id) => setSelectedSourceId(id)}
        intro={
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
                style={{ backgroundColor: `color-mix(in srgb, ${notebook.color || 'var(--notebook-accent)'} 14%, transparent)` }}
                aria-hidden
              >
                {notebook.icon || <BookOpen className="h-5 w-5" style={{ color: notebook.color }} />}
              </div>
              <div className="min-w-0">
                <h2 className="notebook-heading text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  {notebook.title}
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  {notebook.sources.length} source{notebook.sources.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <SourcesSummaryCard notebookId={notebookId} sourcesCount={notebook.sources.length} sourcesHash={sourcesHash} />
          </div>
        }
      />
    );
  };

  // Contenu central : Sources / Chat / SourceViewer / NoteEditor sont des vues
  // "pairs" sans ordre spatial entre elles — un simple crossfade évite de
  // suggérer une navigation avant/arrière qui n'existe pas.
  const centerMotion = fadeOnly({});

  return (
    <NotebookLiveProvider notebookId={notebookId}>
    <div className="notebook-workspace h-full flex flex-col overflow-hidden">
      <ViewHeader
        title={notebook.title}
        icon={BookOpen}
        description={notebook.description || `${notebook.sources.length} source${notebook.sources.length > 1 ? 's' : ''} · ${notebook.notes.length} note${notebook.notes.length > 1 ? 's' : ''}`}
        badge={indexingProgress.active ? `Indexation ${indexingProgress.done}/${indexingProgress.total}` : 'Notebook'}
        actions={
          <div className="flex items-center gap-2">
            <NbIconButton icon={ArrowLeft} label="Retour aux notebooks" onClick={onBack} className="transition-transform active:scale-90" />
            <div className="hidden md:flex"><NotebookVoicePanel prefersReducedMotion={prefersReducedMotion} /></div>
            <NbIconButton
              icon={StickyNote}
              label={`Notes${notebook.notes.length ? ` (${notebook.notes.length})` : ''}`}
              onClick={() => (notesOpen ? setNotesOpen(false) : openNotes())}
              className="transition-transform active:scale-90"
              data-active={notesOpen}
            />
            <NbIconButton
              icon={focusMode ? Minimize2 : Maximize2}
              label={focusMode ? 'Quitter le mode Focus (Ctrl+0 / ⌘0)' : 'Activer le mode Focus (Ctrl+0 / ⌘0)'}
              onClick={() => { setSourceRailOpen(focusMode); setStudioOpen(focusMode); }}
            />
            <NbIconButton icon={RefreshCw} label="Actualiser" onClick={loadNotebook} className="transition-transform active:scale-90" />
          </div>
        }
      />

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
              <Loader2 className="h-4 w-4 animate-spin text-[var(--notebook-accent)]" aria-hidden />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
                <motion.div
                  className="h-full rounded-full bg-[var(--notebook-accent)]"
                  animate={{ width: `${(indexingProgress.done / indexingProgress.total) * 100}%` }}
                  transition={spring}
                />
              </div>
              <span className="text-xs font-medium tabular-nums text-[var(--text-muted)]">{indexingProgress.done}/{indexingProgress.total}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 3 panneaux flottants (Sources · Discussion · Studio) ───── */}
      <div
        className="notebook-shell flex-1 overflow-hidden"
        data-studio-open={studioOpen}
        data-source-open={sourceRailOpen}
        style={{
          '--nb-left': sourceRailOpen ? `${panelWidths.sources}px` : 'var(--nb-rail)',
          '--nb-right': studioOpen ? `${panelWidths.studio}px` : 'var(--nb-rail)',
        } as React.CSSProperties}
      >
        {/* Gauche : Sources */}
        <aside
          className="notebook-panel notebook-panel--side notebook-panel--sources hidden lg:flex"
          data-collapsed={!sourceRailOpen}
          aria-label="Sources"
        >
          {sourceRailOpen ? (
            <SourcePanel
              notebookId={notebookId}
              sources={notebook.sources}
              onRefresh={loadNotebook}
              onUploadProgress={setIndexingProgress}
              compact
              onSelectSource={(id) => { setShowIndexing(false); setSelectedSourceId(id === selectedSourceId ? null : id); }}
              selectedSourceId={selectedSourceId}
              onAddSources={openSourceManager}
              onOpenIndexing={openIndexing}
              onCollapse={() => setSourceRailOpen(false)}
            />
          ) : (
            <div className="notebook-panel-rail">
              <NbIconButton
                icon={PanelLeftOpen}
                label="Afficher les sources (Ctrl+1 / ⌘1)"
                onClick={() => setSourceRailOpen(true)}
              />
              <NbIconButton icon={Plus} label="Ajouter des sources" onClick={openSourceManager} />
              <NbIconButton icon={Activity} label="Indexation (Ctrl+7 / ⌘7)" onClick={openIndexing} />
              <button
                type="button"
                onClick={() => setSourceRailOpen(true)}
                className="notebook-panel-rail-label"
              >
                <FileText className="h-3.5 w-3.5 rotate-90" aria-hidden />
                Sources{notebook.sources.length > 0 ? ` · ${notebook.sources.length}` : ''}
              </button>
            </div>
          )}
        </aside>

        {sourceRailOpen && (
          <div
            className="notebook-resize-handle notebook-resize-handle--sources hidden lg:flex"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner le panneau Sources"
            aria-valuemin={220}
            aria-valuemax={420}
            aria-valuenow={panelWidths.sources}
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) return;
              const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!bounds) return;
              setPanelWidths((current) => ({
                ...current,
                sources: Math.min(420, Math.max(220, event.clientX - bounds.left - 12)),
              }));
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const delta = event.shiftKey ? 32 : 12;
              setPanelWidths((current) => ({
                ...current,
                sources: Math.min(420, Math.max(220, current.sources + (event.key === 'ArrowRight' ? delta : -delta))),
              }));
            }}
          />
        )}

        {/* Centre : Discussion (ou source / document / note ouverts) */}
        <main className="notebook-panel notebook-main relative min-w-0 flex min-h-0 flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={showIndexing ? 'indexing' : selectedSourceId || viewingGeneratedDoc?.id || (noteEditorData ? 'note-editor' : notesOpen ? 'notes' : activeTab)}
              {...centerMotion}
              transition={spring}
              className="min-h-0 flex-1"
            >
              {renderMainContent()}
            </motion.div>
          </AnimatePresence>
          <div ref={setAudioDockElement} aria-label="Lecteur du podcast" className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-[var(--notebook-surface-elevated)] empty:hidden" />
        </main>

        {studioOpen && (
          <div
            className="notebook-resize-handle notebook-resize-handle--studio hidden lg:flex"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner le panneau Studio"
            aria-valuemin={260}
            aria-valuemax={480}
            aria-valuenow={panelWidths.studio}
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) return;
              const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!bounds) return;
              setPanelWidths((current) => ({
                ...current,
                studio: Math.min(480, Math.max(260, bounds.right - event.clientX - 12)),
              }));
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const delta = event.shiftKey ? 32 : 12;
              setPanelWidths((current) => ({
                ...current,
                studio: Math.min(480, Math.max(260, current.studio + (event.key === 'ArrowLeft' ? delta : -delta))),
              }));
            }}
          />
        )}

        {/* Droite : Studio (Générer · Notes · Historique · Audio) */}
        <aside
          className="notebook-panel notebook-panel--side notebook-panel--studio hidden lg:flex"
          data-collapsed={!studioOpen}
          aria-label="Studio"
        >
          {studioOpen ? (
            <>
              <div className="notebook-panel-header">
                <h2 className="notebook-panel-title">Studio</h2>
                <NbIconButton
                  icon={PanelRightClose}
                  label="Réduire le Studio (Ctrl+\ / ⌘\)"
                  onClick={() => setStudioOpen(false)}
                />
              </div>

              {/* Onglets du Studio — barre moderne avec indicateur actif glissant */}
              <div className="flex-shrink-0 px-3 pt-3">
                <div
                  className="notebook-studio-tabs"
                  role="tablist"
                  aria-label="Sections du Studio"
                >
                  {studioTabs.map(({ key, icon: Icon, label, badge }) => {
                    const isActive = studioTab === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`studio-tab-${key}`}
                        aria-selected={isActive}
                        aria-controls={`studio-panel-${key}`}
                        onClick={() => setStudioTab(key)}
                        className="notebook-studio-tab"
                        data-active={isActive}
                        title={`${label} (${studioShortcuts[key]})`}
                      >
                        {isActive && !prefersReducedMotion && (
                          <motion.span
                            layoutId="studio-tab-indicator"
                            className="notebook-studio-tab-indicator"
                            transition={spring}
                            aria-hidden
                          />
                        )}
                        {isActive && prefersReducedMotion && (
                          <span className="notebook-studio-tab-indicator" aria-hidden />
                        )}
                        <span className="notebook-studio-tab-inner">
                          <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
                          <span className="notebook-studio-tab-label">{label}</span>
                          {/* Compteur visible sur tous les onglets de la barre segmentée */}
                          {badge !== undefined && badge > 0 && (
                            <span className="notebook-studio-tab-badge" data-active={isActive || undefined}>
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tous les panneaux restent montés ; les inactifs sont masqués (display:none) */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {renderStudioPanels()}
              </div>
            </>
          ) : (
            <div className="notebook-panel-rail">
              <NbIconButton
                icon={PanelRightOpen}
                label="Ouvrir le Studio (Ctrl+\ / ⌘\)"
                onClick={() => setStudioOpen(true)}
              />
              {studioTabs.map(({ key, icon, label }) => (
                <NbIconButton
                  key={key}
                  icon={icon}
                  label={`${label} (${studioShortcuts[key]})`}
                  onClick={() => openStudioTab(key)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
    </NotebookLiveProvider>
  );
}
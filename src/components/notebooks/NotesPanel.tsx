/**
 * NotesPanel — Gestion des notes d'un notebook
 *
 * UI améliorée avec meilleur layout, compteur de caractères, et animations plus fluides.
 */

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Pin, Trash2, Edit3, Save, X, StickyNote, Clock, Search, ArrowUpDown,
  Download, FileText, Layout, ListChecks, BookOpen, Grid3X3, List, Link2, FilePlus2,
} from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { timeAgo } from './utils.js';
import { apiVoid, ApiError } from './api/client.js';
import { NotesCanvas } from './NotesCanvas.js';
import { TemplateSelectorModal } from '../templates/TemplateSelectorModal.js';
import { Sparkles } from 'lucide-react';
import { NbButton, NbEmptyState, NbIconButton, NbInput, NbModal, NbTextarea } from './ui/primitives.js';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteEditorData {
  id?: string;
  title: string;
  content: string;
}

interface Props {
  notebookId: string;
  notes: NoteItem[];
  onRefresh: () => void;
  compact?: boolean;
  /** Called when user wants to create/edit a note in the center column */
  onOpenNoteEditor?: (data: NoteEditorData) => void;
}

export function NotesPanel({ notebookId, notes, onRefresh, compact = false, onOpenNoteEditor }: Props) {
  const { success, error: toastError } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'alpha'>('newest');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('list');
  const [showSearchModal, setShowSearchModal] = useState(false);

  // ─── Note Templates ────────────────────────────────────────────────────────

  const templates = useMemo(() => [
    {
      id: 'cornell',
      label: 'Méthode Cornell',
      icon: Layout,
      color: 'var(--notebook-accent)',
      title: 'Notes Cornell — ',
      content: `## Questions / Indices\n\n- \n- \n\n## Notes principales\n\n\n\n## Résumé\n\n`,
    },
    {
      id: 'resume',
      label: 'Résumé',
      icon: FileText,
      color: 'var(--color-success)',
      title: 'Résumé — ',
      content: `## Points clés\n\n1. \n2. \n3. \n\n## Détails\n\n\n\n## Conclusion\n\n`,
    },
    {
      id: 'todo',
      label: 'To-do / Actions',
      icon: ListChecks,
      color: 'var(--color-warning)',
      title: 'Actions — ',
      content: `## À faire\n\n- [ ] \n- [ ] \n- [ ] \n\n## En cours\n\n- [ ] \n\n## Terminé\n\n- [x] \n`,
    },
    {
      id: 'meeting',
      label: 'Compte-rendu',
      icon: BookOpen,
      color: 'var(--color-accent-alt)',
      title: 'Réunion — ',
      content: `## Participants\n\n- \n\n## Ordre du jour\n\n1. \n\n## Décisions\n\n- \n\n## Actions à suivre\n\n- [ ] \n\n## Prochaine réunion\n\n`,
    },
  ], []);

  const applyTemplate = useCallback((template: typeof templates[0]) => {
    if (onOpenNoteEditor) {
      onOpenNoteEditor({ title: template.title, content: template.content });
    } else {
      setTitle(template.title);
      setContent(template.content);
      setShowForm(true);
      setShowTemplates(false);
      setEditingId(null);
    }
  }, [onOpenNoteEditor]);

  // ─── Export all notes ─────────────────────────────────────────────────────

  const handleExportAll = useCallback(() => {
    if (notes.length === 0) return;

    const markdown = notes
      .map(note => `# ${note.title}\n\n${note.content}\n\n---\n`)
      .join('\n');

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-export-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Notes exportées en Markdown');
  }, [notes, success]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    try {
      await apiVoid(`/api/notebooks/${notebookId}/notes`, {
        method: 'POST',
        json: { title: title.trim(), content: content.trim() },
      });
      success('Note créée');
      setTitle('');
      setContent('');
      setShowForm(false);
      onRefresh();
    } catch {
      toastError('Erreur');
    }
  }, [title, content, notebookId, success, toastError, onRefresh]);

  const handleUpdate = useCallback(async (noteId: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/notes/${noteId}`, {
        method: 'PATCH',
        json: { title: title.trim(), content: content.trim() },
      });
      success('Note mise à jour');
      setEditingId(null);
      setTitle('');
      setContent('');
      onRefresh();
    } catch {
      toastError('Erreur');
    }
  }, [title, content, notebookId, success, toastError, onRefresh]);

  const handleDelete = useCallback(async (noteId: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/notes/${noteId}`, { method: 'DELETE' });
      success('Note supprimée');
      onRefresh();
    } catch {
      toastError('Erreur');
    }
  }, [notebookId, success, toastError, onRefresh]);

  const handleTogglePin = useCallback(async (noteId: string, pinned: boolean) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/notes/${noteId}`, {
        method: 'PATCH',
        json: { pinned: !pinned },
      });
      onRefresh();
    } catch { /* ignore */ }
  }, [notebookId, onRefresh]);

  // Convertir une note en source : elle devient interrogeable par le chat
  // et utilisable par la génération de documents.
  const [addingToSources, setAddingToSources] = useState<string | null>(null);
  const handleAddToSources = useCallback(async (note: NoteItem) => {
    setAddingToSources(note.id);
    try {
      await apiVoid(`/api/notebooks/${notebookId}/notes/${note.id}/add-to-sources`, { method: 'POST' });
      success('Note ajoutée aux sources');
      onRefresh();
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409
        ? 'Cette note est déjà dans les sources'
        : e instanceof ApiError && e.status === 400
          ? 'La note est vide'
          : 'Erreur lors de l\'ajout aux sources';
      toastError(msg);
    } finally {
      setAddingToSources(null);
    }
  }, [notebookId, onRefresh, success, toastError]);

  const startEdit = (note: NoteItem) => {
    if (onOpenNoteEditor) {
      onOpenNoteEditor({ id: note.id, title: note.title, content: note.content });
    } else {
      setEditingId(note.id);
      setTitle(note.title);
      setContent(note.content);
      setShowForm(false);
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setContent('');
  };

  // Trier et filtrer
  const sorted = useMemo(() => {
    let filtered = [...notes];

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
      );
    }

    // Sort: pinned always first
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      switch (sortOrder) {
        case 'oldest':
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case 'alpha':
          return a.title.localeCompare(b.title, 'fr');
        case 'newest':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return filtered;
  }, [notes, searchQuery, sortOrder]);

  // ─── Backlinks detection ──────────────────────────────────────────────────

  const backlinks = useMemo(() => {
    const links: Record<string, string[]> = {};
    notes.forEach(note => {
      links[note.id] = [];
      notes.forEach(other => {
        if (note.id === other.id) return;
        // Check if this note's title is mentioned in the other's content
        if (other.content.toLowerCase().includes(note.title.toLowerCase()) && note.title.length > 2) {
          links[note.id].push(other.id);
        }
      });
    });
    return links;
  }, [notes]);

  const getNoteTitle = useCallback((id: string) => {
    return notes.find(n => n.id === id)?.title || 'Note inconnue';
  }, [notes]);

  if (compact) {
    const compactNotes = sorted.slice(0, 6);
    return (
      <div className="h-full overflow-y-auto custom-scrollbar px-4 pb-4">
        {compactNotes.length === 0 ? (
          <div className="rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-4 text-sm text-[var(--text-muted)]">
            Enregistrez les réponses utiles de l'IA sous forme de notes et elles apparaîtront ici.
          </div>
        ) : (
          <div className="space-y-3">
            {compactNotes.map(note => (
              <article key={note.id} className="notebook-note-card">
                <div className="flex items-start gap-2">
                  {note.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />}
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => startEdit(note)}>
                    <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{note.title}</h3>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{note.content}</p>
                    <p className="mt-3 text-xs text-[var(--text-muted)]">{timeAgo(note.updatedAt || note.createdAt)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`h-full ${viewMode === 'canvas' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'} p-4 lg:p-6 space-y-4`}>
      {/* Header with stats */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <NbButton
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => {
              if (onOpenNoteEditor) {
                onOpenNoteEditor({ title: '', content: '' });
              } else {
                setShowForm(true); setEditingId(null); setTitle(''); setContent('');
              }
            }}
            title="Nouvelle note"
            aria-label="Nouvelle note"
          />

          <NbIconButton
            icon={Search}
            size="sm"
            label="Rechercher"
            onClick={() => setShowSearchModal(true)}
          />

          {/* Templates dropdown */}
          <div className="relative">
            <NbIconButton
              icon={Layout}
              size="sm"
              label="Modèles"
              aria-expanded={showTemplates}
              aria-haspopup="menu"
              data-active={showTemplates ? 'true' : undefined}
              onClick={() => setShowTemplates(!showTemplates)}
            />
            <AnimatePresence>
              {showTemplates && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  className="absolute top-full left-0 mt-1 z-30 w-48 overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] py-1 shadow-xl"
                >
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--notebook-accent-surface)]"
                    >
                      <tpl.icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: tpl.color }} aria-hidden />
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--notebook-border)]" />
                  <button
                    type="button"
                    onClick={() => { setShowTemplates(false); setShowTemplateModal(true); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-[var(--notebook-accent)] transition-colors hover:bg-[var(--notebook-accent-surface)]"
                  >
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                    <span>Bibliothèque complète...</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <NbButton
            variant="secondary"
            size="sm"
            icon={ArrowUpDown}
            onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'alpha' : 'newest')}
            title="Tri"
          >
            {sortOrder === 'newest' ? 'Récentes' : sortOrder === 'oldest' ? 'Anciennes' : 'A → Z'}
          </NbButton>

          {notes.length > 0 && (
            <NbIconButton
              icon={Download}
              size="sm"
              label="Exporter"
              onClick={handleExportAll}
            />
          )}

          <div className="notebook-segmented ml-auto flex items-center">
            <NbIconButton
              icon={List}
              size="sm"
              label="Liste"
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            />
            <NbIconButton
              icon={Grid3X3}
              size="sm"
              label="Canvas"
              active={viewMode === 'canvas'}
              onClick={() => setViewMode('canvas')}
            />
          </div>

          <span className="text-xs text-[var(--text-dimmed)]">
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Search Modal */}
      <NbModal open={showSearchModal} onClose={() => setShowSearchModal(false)} size="md">
        <NbModal.Header>
          <Search className="h-4 w-4 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />
          <NbInput
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les notes..."
            className="flex-1 text-sm"
            autoFocus
          />
        </NbModal.Header>

        {/* Search Results */}
        <NbModal.Body className="max-h-96">
          {sorted.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              Aucune note trouvée
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    setShowSearchModal(false);
                    startEdit(note);
                  }}
                  className="notebook-card w-full p-3 text-left"
                  data-interactive="true"
                >
                  <div className="flex items-center gap-2">
                    {note.pinned && <Pin className="h-3 w-3 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {note.title}
                      </p>
                      {note.content && (
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                          {note.content}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-[var(--text-dimmed)]">
                          <Clock className="h-3 w-3" aria-hidden />
                          {timeAgo(note.updatedAt)}
                        </span>
                        {note.content && (
                          <span className="text-xs text-[var(--text-dimmed)]">
                            {note.content.length} car.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </NbModal.Body>
      </NbModal>

      {/* Inline fallback form (only when no onOpenNoteEditor prop provided) */}
      {!onOpenNoteEditor && (
        <AnimatePresence>
          {(showForm || editingId) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="notebook-card space-y-3 border-[var(--notebook-accent)] bg-[var(--notebook-surface)] p-4 shadow-[0_0_0_1px_var(--notebook-accent)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {editingId ? 'Modifier la note' : 'Nouvelle note'}
                    </p>
                  </div>
                  <NbIconButton icon={X} size="sm" label="Annuler" onClick={cancelForm} />
                </div>
                <NbInput
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Titre de la note..."
                  autoFocus
                  className="text-sm font-medium"
                />
                <div className="relative">
                  <NbTextarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Contenu de la note..."
                    rows={6}
                    className="pb-6 text-xs leading-relaxed"
                  />
                  <span className="absolute bottom-2 right-3 text-xs text-[var(--text-dimmed)]">
                    {content.length} car.
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <NbButton
                    variant="primary"
                    size="sm"
                    icon={Save}
                    onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
                    disabled={!title.trim()}
                  >
                    {editingId ? 'Mettre à jour' : 'Créer'}
                  </NbButton>
                  <NbButton variant="ghost" size="sm" icon={X} onClick={cancelForm}>
                    Annuler
                  </NbButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Canvas View */}
      {viewMode === 'canvas' && notes.length > 0 ? (
        <div className="flex-1 min-h-0 -mx-4 -mb-4 lg:-mx-6 lg:-mb-6">
          <NotesCanvas notes={notes} onSelectNote={(id) => { const note = notes.find(n => n.id === id); if (note) startEdit(note); }} />
        </div>
      ) : (
      <>
      {/* Notes List */}
      {sorted.length === 0 && !showForm ? (
        <NbEmptyState
          icon={StickyNote}
          title="Aucune note"
          description="Créez des notes pour organiser vos idées, annotations et insights."
          className="py-12"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence initial={false}>
            {sorted.map((note) => (
              <motion.div
                key={note.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="notebook-note-card group p-4"
                data-pinned={note.pinned ? 'true' : undefined}
                style={note.pinned ? { borderColor: 'var(--notebook-accent)' } : undefined}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => startEdit(note)}>
                    <div className="flex items-center gap-1">
                      {note.pinned && <Pin className="h-3 w-3 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />}
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {note.title}
                      </p>
                    </div>
                    {note.content && (
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">
                        {note.content}
                      </p>
                    )}
                    {/* Meta */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-dimmed)]">
                        <Clock className="h-3 w-3" aria-hidden />
                        {timeAgo(note.updatedAt)}
                      </span>
                      {note.content && (
                        <span className="text-xs text-[var(--text-dimmed)]">
                          {note.content.length} car.
                        </span>
                      )}
                      {backlinks[note.id]?.length > 0 && (
                        <span
                          className="notebook-count"
                          title={`Mentionné dans : ${backlinks[note.id].map(id => getNoteTitle(id)).join(', ')}`}
                        >
                          <Link2 className="h-3 w-3" aria-hidden />
                          {backlinks[note.id].length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <NbIconButton
                      icon={Pin}
                      size="sm"
                      label={note.pinned ? 'Désépingler' : 'Épingler'}
                      data-active={note.pinned ? 'true' : undefined}
                      onClick={() => handleTogglePin(note.id, note.pinned)}
                    />
                    <NbIconButton
                      icon={FilePlus2}
                      size="sm"
                      label="Ajouter aux sources"
                      disabled={addingToSources === note.id}
                      onClick={() => handleAddToSources(note)}
                    />
                    <NbIconButton
                      icon={Edit3}
                      size="sm"
                      label="Modifier"
                      onClick={() => startEdit(note)}
                    />
                    <NbIconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label="Supprimer"
                      onClick={() => handleDelete(note.id)}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      </>
      )}

      {/* Modal de sélection de templates */}
      <TemplateSelectorModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onCreateNote={(noteTitle, noteContent) => {
          setTitle(noteTitle);
          setContent(noteContent);
          setShowForm(true);
        }}
      />
    </div>
  );
}

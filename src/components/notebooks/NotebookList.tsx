/**
 * NotebookList — Page d'accueil des notebooks (style NotebookLM)
 *
 * Grille de cartes `.notebook-card`, recherche, tri, création rapide et
 * confirmation de suppression via NbModal.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  BookOpen, Plus, Trash2, Clock, FileText, MessageSquare,
  Search, SortAsc, SortDesc, ArrowRight, Github, LayoutGrid, List, X,
} from 'lucide-react';
import { CreateNotebookModal } from './CreateNotebookModal.js';
import { GitHubRepositoryImportModal } from './GitHubRepositoryImportModalLazy.js';
import { useToast } from '../ui/Toast.js';
import { timeAgoLong as timeAgo } from './utils.js';
import { SPRING_UI, SPRING_MOMENTUM } from './motion.js';
import { api, apiVoid } from './api/client.js';
import { NbButton, NbEmptyState, NbIconButton, NbModal } from './ui/primitives.js';

interface NotebookSummary {
  id: string;
  title: string;
  description: string;
  sourcesCount: number;
  notesCount: number;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  onSelectNotebook: (id: string) => void;
  onClose?: () => void;
}

type SortBy = 'updatedAt' | 'title' | 'sourcesCount';
type ViewMode = 'list' | 'grid';

export function NotebookList({ onSelectNotebook, onClose }: Props) {
  const { success, error: toastError } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGitHubImport, setShowGitHubImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const data = await api<{ workspace?: string; exists?: boolean }>('/api/workspace');
      const path = (data.workspace || '').trim();
      if (path && data.exists !== false) {
        // Extraire le dernier segment du chemin (nom du dossier), Windows ou POSIX
        const segments = path.replace(/[/\\]+$/, '').split(/[/\\]/);
        setWorkspaceName(segments[segments.length - 1] || path);
      } else {
        setWorkspaceName(null);
      }
    } catch {
      setWorkspaceName(null);
    }
  }, []);

  const loadNotebooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ notebooks?: NotebookSummary[] }>('/api/notebooks');
      setNotebooks(data.notebooks || []);
    } catch {
      toastError('Impossible de charger les notebooks');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { loadNotebooks(); loadWorkspace(); }, [loadNotebooks, loadWorkspace]);

  // Re-charger la liste et le workspace quand l'utilisateur change de workspace
  useEffect(() => {
    const handleWorkspaceChange = (e: Event) => {
      loadNotebooks();
      // Utiliser le détail de l'événement si disponible, sinon re-fetch
      const detail = (e as CustomEvent).detail as { workspace?: string | null } | undefined;
      if (detail && 'workspace' in detail) {
        const path = (detail.workspace || '').trim();
        if (path) {
          const segments = path.replace(/[/\\]+$/, '').split(/[/\\]/);
          setWorkspaceName(segments[segments.length - 1] || path);
        } else {
          setWorkspaceName(null);
        }
      } else {
        loadWorkspace();
      }
    };
    const handleNoWorkspace = () => setWorkspaceName(null);
    window.addEventListener('Leanna-workspace-changed', handleWorkspaceChange);
    window.addEventListener('Leanna-no-workspace-mode', handleNoWorkspace);
    return () => {
      window.removeEventListener('Leanna-workspace-changed', handleWorkspaceChange);
      window.removeEventListener('Leanna-no-workspace-mode', handleNoWorkspace);
    };
  }, [loadNotebooks, loadWorkspace]);

  const filteredNotebooks = useMemo(() => {
    let result = notebooks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(nb =>
        nb.title.toLowerCase().includes(q) ||
        nb.description.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'updatedAt') cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      else if (sortBy === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortBy === 'sourcesCount') cmp = a.sourcesCount - b.sourcesCount;
      return sortDesc ? -cmp : cmp;
    });
    return result;
  }, [notebooks, searchQuery, sortBy, sortDesc]);

  const handleDeleteClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(id);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await apiVoid(`/api/notebooks/${deleteTarget}`, { method: 'DELETE' });
      success('Notebook supprimé');
      setNotebooks(prev => prev.filter(n => n.id !== deleteTarget));
    } catch {
      toastError('Impossible de supprimer');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, success, toastError]);

  return (
    <div className="notebook-workspace flex h-full flex-col overflow-hidden bg-[var(--notebook-bg)]">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-6 pb-6 pt-8 lg:px-12">
        <div className="mx-auto flex max-w-8xl items-start justify-between gap-4">
          {/* Title block */}
          <div className="min-w-0">
            <div className="notebook-eyebrow mb-3 flex items-center gap-2 uppercase text-[var(--notebook-accent)]">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              {workspaceName || 'Espace de recherche'}
            </div>
            <h1 className="notebook-heading truncate text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {workspaceName ? `Notebooks · ${workspaceName}` : 'Vos notebooks'}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Retrouvez vos recherches et continuez là où vous vous êtes arrêté.
            </p>
          </div>

          {/* Actions */}
          <div className="notebook-actions flex-shrink-0">
            <NbButton variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>
              Nouveau
            </NbButton>
            <NbIconButton
              icon={Github}
              label="Importer depuis GitHub"
              onClick={() => setShowGitHubImport(true)}
            />
            {onClose && (
              <NbIconButton
                icon={LayoutGrid}
                label="Retour au sélecteur IDE / Notebook"
                onClick={onClose}
              />
            )}
          </div>
        </div>
      </header>

      {/* ─── Search & Sort Bar ──────────────────────────────── */}
      {notebooks.length > 0 && (
        <div className="flex-shrink-0 border-t border-[var(--notebook-border)] mx-6 py-4 lg:mx-12">
          <div className="mx-auto flex max-w-8xl items-center gap-3">
            {/* Search */}
            <div className="notebook-search-field max-w-md flex-1">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher…"
              />
              {searchQuery && (
                <NbIconButton
                  icon={X}
                  label="Effacer"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => setSearchQuery('')}
                />
              )}
            </div>

            {/* Sort controls */}
            <div className="ml-auto flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">Trier par</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortBy)}
                className="notebook-input w-auto cursor-pointer text-xs font-medium text-[var(--text-secondary)]"
              >
                <option value="updatedAt">Récent</option>
                <option value="title">Titre</option>
                <option value="sourcesCount">Sources</option>
              </select>
              <NbIconButton
                icon={sortDesc ? SortDesc : SortAsc}
                label={sortDesc ? 'Décroissant' : 'Croissant'}
                onClick={() => setSortDesc(!sortDesc)}
              />
              <div className="ml-1 flex items-center gap-1 border-l border-[var(--notebook-border)] pl-2">
                <NbIconButton
                  icon={List}
                  label="Vue liste"
                  active={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                />
                <NbIconButton
                  icon={LayoutGrid}
                  label="Vue grille"
                  active={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Notebook Cards ─────────────────────────────────── */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 pb-10 pt-2 lg:px-12">
        <div className="mx-auto max-w-8xl">
        {loading && viewMode === 'list' ? (
          /* ─── Skeleton (liste) ─── */
          <div className="flex flex-col gap-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`skeleton-row-${i}`} className="notebook-card flex items-center gap-4 rounded-xl px-5 py-3">
                <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--notebook-surface-muted)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 animate-pulse rounded-lg bg-[var(--notebook-surface-muted)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded-lg bg-[var(--notebook-surface-muted)]" />
                </div>
              </div>
            ))}
          </div>
        ) : loading ? (
          /* ─── Skeleton ─── */
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="notebook-card overflow-hidden rounded-xl">
                <div className="h-1 bg-[var(--notebook-surface-muted)]" />
                <div className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-[var(--notebook-surface-muted)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded-lg bg-[var(--notebook-surface-muted)]" />
                      <div className="h-3 w-1/3 animate-pulse rounded-lg bg-[var(--notebook-surface-muted)]" />
                    </div>
                  </div>
                  <div className="h-3 w-full animate-pulse rounded-lg bg-[var(--notebook-surface-muted)]" />
                  <div className="h-3 w-4/5 animate-pulse rounded-lg bg-[var(--notebook-surface-muted)]" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--notebook-surface-muted)]" />
                    <div className="h-6 w-16 animate-pulse rounded-full bg-[var(--notebook-surface-muted)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notebooks.length === 0 ? (
          /* ─── Empty state ─── */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_UI}
            className="notebook-card rounded-xl py-16"
          >
            <NbEmptyState
              icon={BookOpen}
              title="Créez votre premier notebook"
              description={
                <>
                  Importez vos documents et posez des questions.
                  L'IA répondra en citant les passages pertinents.
                </>
              }
              action={
                <NbButton variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>
                  Créer un notebook
                </NbButton>
              }
            />
          </motion.div>

        ) : filteredNotebooks.length === 0 ? (
          /* ─── No results ─── */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-12"
          >
            <NbEmptyState
              icon={Search}
              title="Aucun résultat"
              description={<>Aucun notebook pour « {searchQuery} »</>}
              action={
                <NbButton variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
                  Effacer la recherche
                </NbButton>
              }
            />
          </motion.div>

        ) : viewMode === 'list' ? (
          /* ─── List View ─── */
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filteredNotebooks.map((nb, i) => (
                <motion.div
                  key={nb.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  whileTap={{ scale: 0.995 }}
                  transition={{
                    ...(prefersReducedMotion ? { duration: 0.1 } : SPRING_MOMENTUM),
                    delay: i < 12 ? i * 0.02 : 0,
                  }}
                  onClick={() => onSelectNotebook(nb.id)}
                  data-spotlight
                  data-interactive="true"
                  className="notebook-card group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-xl py-3 pl-5 pr-3 hover:shadow-md"
                >
                  {/* Couleur du notebook (donnée) */}
                  <div
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: nb.color || 'var(--notebook-accent)' }}
                  />

                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--notebook-border)] bg-[var(--notebook-surface-muted)] text-base leading-none">
                    {nb.icon || '📓'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="notebook-body truncate text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--notebook-accent)]">
                      {nb.title}
                    </h3>
                    {nb.description && (
                      <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                        {nb.description}
                      </p>
                    )}
                  </div>

                  <div className="hidden flex-shrink-0 items-center gap-4 sm:flex">
                    <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
                      {nb.sourcesCount}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
                      <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
                      {nb.notesCount}
                    </span>
                    <span className="flex w-28 items-center justify-end gap-1 text-xs text-[var(--text-muted)]">
                      <Clock className="h-3 w-3 flex-shrink-0" aria-hidden />
                      <span className="truncate">{timeAgo(nb.updatedAt)}</span>
                    </span>
                  </div>

                  <NbIconButton
                    icon={Trash2}
                    label="Supprimer"
                    size="sm"
                    tone="danger"
                    onClick={(e) => handleDeleteClick(nb.id, e)}
                    className="flex-shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
                  />
                  <ArrowRight
                    className="h-4 w-4 flex-shrink-0 -translate-x-1 text-[var(--notebook-accent)] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                    aria-hidden
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* ─── Grid View ─── */
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {filteredNotebooks.map((nb, i) => (
                <motion.div
                  key={nb.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{
                    ...(prefersReducedMotion ? { duration: 0.1 } : SPRING_MOMENTUM),
                    delay: i < 12 ? i * 0.03 : 0,
                  }}
                  onClick={() => onSelectNotebook(nb.id)}
                  data-spotlight
                  data-interactive="true"
                  className="notebook-card group relative flex cursor-pointer flex-col overflow-hidden rounded-xl hover:shadow-lg"
                >
                  {/* Couleur du notebook (donnée) */}
                  <div
                    className="h-1 w-full flex-shrink-0"
                    style={{ backgroundColor: nb.color || 'var(--notebook-accent)' }}
                  />

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    {/* Card header */}
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-muted)] text-lg leading-none">
                        {nb.icon || '📓'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="notebook-body truncate text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--notebook-accent)]">
                          {nb.title}
                        </h3>
                        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <Clock className="h-3 w-3 flex-shrink-0" aria-hidden />
                          {timeAgo(nb.updatedAt)}
                        </p>
                      </div>

                      {/* Delete button */}
                      <NbIconButton
                        icon={Trash2}
                        label="Supprimer"
                        size="sm"
                        tone="danger"
                        onClick={(e) => handleDeleteClick(nb.id, e)}
                        className="flex-shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
                      />
                    </div>

                    {/* Description */}
                    {nb.description && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                        {nb.description}
                      </p>
                    )}

                    {/* Footer stats + open cta */}
                    <div className="mt-auto flex items-center gap-4 border-t border-[var(--notebook-border)] pt-3">
                      <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
                        {nb.sourcesCount}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
                        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
                        {nb.notesCount}
                      </span>
                      <span className="ml-auto flex -translate-x-1 items-center gap-1 text-xs font-semibold text-[var(--notebook-accent)] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                        Ouvrir
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ─── Create Notebook Modal ──────────────────────────── */}
      {showCreateModal && (
        <CreateNotebookModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadNotebooks}
        />
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────── */}
      <NbModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer ce notebook ?"
        tone="danger"
        size="sm"
      >
        <NbModal.Body className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-error-subtle)] text-[var(--color-error)]">
              <Trash2 className="h-4 w-4" aria-hidden />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Cette action est irréversible
            </p>
          </div>
          <p className="rounded-xl bg-[var(--notebook-surface-muted)] p-3 text-xs leading-relaxed text-[var(--text-muted)]">
            Toutes les sources, notes et conversations associées seront définitivement supprimées.
          </p>
        </NbModal.Body>
        <NbModal.Footer>
          <NbButton variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
            Annuler
          </NbButton>
          <NbButton variant="danger" size="sm" onClick={handleDeleteConfirm}>
            Supprimer
          </NbButton>
        </NbModal.Footer>
      </NbModal>

      {/* GitHub Import Modal */}
      {showGitHubImport && (
        <GitHubRepositoryImportModal
          onClose={() => setShowGitHubImport(false)}
          onImportSuccess={(notebookId, repository) => {
            success(`Dépôt ${repository} ingéré avec succès !`);
            loadNotebooks();
            onSelectNotebook(notebookId);
          }}
        />
      )}

      </div>
    </div>
  );
}

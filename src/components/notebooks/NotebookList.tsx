/**
 * NotebookList — Page d'accueil des notebooks
 *
 * Affiche tous les notebooks avec création rapide, recherche, tri et vue grille/liste.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Plus, Loader2, Trash2, Clock, FileText, MessageSquare,
  Search, Grid3X3, List, SortAsc, SortDesc, Sparkles, X,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { ViewHeader } from '../ui/ViewHeader';

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

type ViewMode = 'grid' | 'list';
type SortBy = 'updatedAt' | 'title' | 'sourcesCount';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `il y a ${days}j`;
  if (hours > 0) return `il y a ${hours}h`;
  if (mins > 0) return `il y a ${mins}m`;
  return 'maintenant';
}

export function NotebookList({ onSelectNotebook, onClose }: Props) {
  const { success, error: toastError } = useToast();
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);

  const loadNotebooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notebooks');
      if (!res.ok) throw new Error('Erreur réseau');
      const data = await res.json();
      setNotebooks(data.notebooks || []);
    } catch (e: any) {
      toastError('Impossible de charger les notebooks');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { loadNotebooks(); }, [loadNotebooks]);

  // Filtrage et tri
  const filteredNotebooks = useMemo(() => {
    let result = notebooks;

    // Recherche
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(nb =>
        nb.title.toLowerCase().includes(q) ||
        nb.description.toLowerCase().includes(q)
      );
    }

    // Tri
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'sourcesCount') {
        cmp = a.sourcesCount - b.sourcesCount;
      }
      return sortDesc ? -cmp : cmp;
    });

    return result;
  }, [notebooks, searchQuery, sortBy, sortDesc]);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDescription.trim() }),
      });
      if (!res.ok) throw new Error('Erreur création');
      const data = await res.json();
      success(`Notebook "${data.notebook.title}" créé`);
      setNewTitle('');
      setNewDescription('');
      setShowCreateForm(false);
      await loadNotebooks();
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setCreating(false);
    }
  }, [newTitle, newDescription, success, toastError, loadNotebooks]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Supprimer ce notebook et toutes ses sources ?')) return;
    try {
      const res = await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      success('Notebook supprimé');
      setNotebooks(prev => prev.filter(n => n.id !== id));
    } catch {
      toastError('Impossible de supprimer');
    }
  }, [success, toastError]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Header */}
      <ViewHeader
        icon={BookOpen}
        title="Notebooks"
        badge="AI Research"
        description="Collections de sources avec chat IA, résumés et génération"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-semibold transition-all active:scale-95 hover:opacity-90 shadow-sm"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--ctrl-hover)]"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Fermer"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        }
      />

      {/* Search & Filters Bar */}
      {notebooks.length > 0 && (
        <div
          className="flex items-center gap-3 px-5 py-3 lg:px-7 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
        >
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-dimmed)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un notebook..."
              className="w-full pl-9 pr-4 py-2 rounded-lg text-xs outline-none transition-all focus:ring-1"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 rounded-lg text-[10px] outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-muted)',
              }}
            >
              <option value="updatedAt">Récent</option>
              <option value="title">Titre</option>
              <option value="sourcesCount">Sources</option>
            </select>
            <button
              onClick={() => setSortDesc(!sortDesc)}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
              title={sortDesc ? 'Décroissant' : 'Croissant'}
            >
              {sortDesc ? <SortDesc className="w-3.5 h-3.5" /> : <SortAsc className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* View mode */}
          <div
            className="flex items-center rounded-lg overflow-hidden border"
            style={{ borderColor: 'var(--border-base)' }}
          >
            <button
              onClick={() => setViewMode('grid')}
              className="p-2 transition-colors"
              style={{
                backgroundColor: viewMode === 'grid' ? 'var(--accent-subtle)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--accent-primary)' : 'var(--text-dimmed)',
              }}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="p-2 transition-colors"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--accent-subtle)' : 'transparent',
                color: viewMode === 'list' ? 'var(--accent-primary)' : 'var(--text-dimmed)',
              }}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Count */}
          <span className="text-[10px] ml-1" style={{ color: 'var(--text-dimmed)' }}>
            {filteredNotebooks.length}/{notebooks.length}
          </span>
        </div>
      )}

      {/* Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b flex-shrink-0"
            style={{ borderColor: 'var(--border-base)' }}
          >
            <div className="p-5 lg:px-7 space-y-3" style={{ backgroundColor: 'var(--bg-panel)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Nouveau notebook
                </p>
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Titre du notebook..."
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-1"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Description (optionnel)..."
                className="w-full px-4 py-2 rounded-xl text-xs outline-none transition-all focus:ring-1"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || creating}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Créer'}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewDescription(''); }}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium transition-colors hover:bg-white/5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notebook Grid / List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {loading ? (
          <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3 max-w-2xl'}`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl border animate-pulse"
                style={{ borderColor: 'var(--border-base)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl" style={{ backgroundColor: 'var(--border-base)' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'var(--border-base)' }} />
                    <div className="h-3 w-full rounded" style={{ backgroundColor: 'var(--border-base)' }} />
                    <div className="flex gap-3 pt-2">
                      <div className="h-3 w-16 rounded" style={{ backgroundColor: 'var(--border-base)' }} />
                      <div className="h-3 w-12 rounded" style={{ backgroundColor: 'var(--border-base)' }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notebooks.length === 0 ? (
          /* Empty state — premier notebook avec onboarding */
          <div className="flex flex-col items-center justify-center py-16 gap-6 max-w-xl mx-auto">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <BookOpen className="w-9 h-9" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="text-center space-y-2">
              <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Bienvenue dans Notebooks
              </p>
              <p className="text-xs max-w-md leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Créez votre premier notebook pour commencer. Ajoutez des sources (PDF, URLs, textes)
                puis posez des questions — l'IA répondra en citant vos documents.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              {[
                { icon: '📚', title: 'Sources', desc: 'PDF, URLs, texte, Markdown, audio' },
                { icon: '💬', title: 'Chat IA', desc: 'Questions avec citations précises' },
                { icon: '🎙️', title: 'Podcast', desc: 'Générez un audio overview' },
              ].map((feat) => (
                <div
                  key={feat.title}
                  className="p-4 rounded-xl text-center space-y-1.5"
                  style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
                >
                  <span className="text-xl">{feat.icon}</span>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{feat.title}</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{feat.desc}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-md hover:shadow-lg"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              <Plus className="w-4 h-4" />
              Créer mon premier notebook
            </button>
          </div>
        ) : filteredNotebooks.length === 0 ? (
          /* No results from search */
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Search className="w-6 h-6" style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Aucun notebook trouvé pour "{searchQuery}"
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence initial={false}>
              {filteredNotebooks.map((nb, i) => (
                <motion.div
                  key={nb.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: i < 12 ? i * 0.03 : 0 }}
                  onClick={() => onSelectNotebook(nb.id)}
                  className="group cursor-pointer p-5 rounded-2xl border flex flex-col gap-3 transition-all hover:border-[var(--border-focus)] hover:shadow-lg hover:-translate-y-0.5"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
                >
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: `${nb.color}20`, border: `1px solid ${nb.color}30` }}
                    >
                      {nb.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {nb.title}
                      </p>
                      {nb.description && (
                        <p className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          {nb.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDelete(nb.id, e)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-auto pt-3 border-t" style={{ borderColor: 'var(--border-base)' }}>
                    <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--text-dimmed)' }}>
                      <FileText className="w-3 h-3" />
                      {nb.sourcesCount} source{nb.sourcesCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--text-dimmed)' }}>
                      <MessageSquare className="w-3 h-3" />
                      {nb.notesCount} note{nb.notesCount !== 1 ? 's' : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                      <Clock className="w-2.5 h-2.5" />
                      {timeAgo(nb.updatedAt)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {filteredNotebooks.map((nb, i) => (
                <motion.div
                  key={nb.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, delay: i < 20 ? i * 0.02 : 0 }}
                  onClick={() => onSelectNotebook(nb.id)}
                  className="group cursor-pointer flex items-center gap-4 px-4 py-3 rounded-xl border transition-all hover:border-[var(--border-focus)] hover:shadow-sm"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: `${nb.color}20` }}
                  >
                    {nb.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {nb.title}
                    </p>
                    {nb.description && (
                      <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {nb.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                      <FileText className="w-3 h-3" />
                      {nb.sourcesCount}
                    </span>
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                      <MessageSquare className="w-3 h-3" />
                      {nb.notesCount}
                    </span>
                    <span className="text-[9px] w-16 text-right" style={{ color: 'var(--text-dimmed)' }}>
                      {timeAgo(nb.updatedAt)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(nb.id, e)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

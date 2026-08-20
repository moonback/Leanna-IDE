/**
 * NotebookList — Page d'accueil des notebooks (style NotebookLM)
 *
 * Design Google NotebookLM : cards épurées, mise en page aérée,
 * création rapide, recherche et tri.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Plus, Loader2, Trash2, Clock, FileText, MessageSquare,
  Search, SortAsc, SortDesc, Sparkles, X, Upload, Globe, Mic,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `il y a ${days}j`;
  if (hours > 0) return `il y a ${hours}h`;
  if (mins > 0) return `il y a ${mins}m`;
  return 'à l\'instant';
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
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  const handleDeleteClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(id);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/notebooks/${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      success('Notebook supprimé');
      setNotebooks(prev => prev.filter(n => n.id !== deleteTarget));
    } catch {
      toastError('Impossible de supprimer');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, success, toastError]);

  return (
    <div className="notebook-workspace h-full flex flex-col overflow-hidden">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-6 lg:px-10 pt-8 pb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="notebook-empty-state-icon" style={{ width: 40, height: 40 }}>
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-medium" style={{ color: 'var(--text-primary)' }}>
                Mes Notebooks
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {notebooks.length} notebook{notebooks.length !== 1 ? 's' : ''} · Recherche IA avec citations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="notebook-fab"
            >
              <Plus className="w-4 h-4" />
              <span>Créer</span>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="notebook-icon-button"
                aria-label="Fermer"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Search & Sort Bar ──────────────────────────────── */}
      {notebooks.length > 0 && (
        <div className="flex-shrink-0 px-6 lg:px-10 pb-4">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="notebook-search-field flex-1 max-w-md">
              <Search className="h-4 w-4 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher un notebook..."
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="notebook-chip"
              style={{ cursor: 'pointer', border: '1px solid var(--notebook-border)' }}
            >
              <option value="updatedAt">Plus récent</option>
              <option value="title">Titre A-Z</option>
              <option value="sourcesCount">Nb. sources</option>
            </select>
            <button
              onClick={() => setSortDesc(!sortDesc)}
              className="notebook-icon-button"
              title={sortDesc ? 'Décroissant' : 'Croissant'}
            >
              {sortDesc ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ─── Create Form ────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden flex-shrink-0 px-6 lg:px-10"
          >
            <div
              className="rounded-2xl border p-6 mb-4 space-y-4"
              style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" style={{ color: 'var(--notebook-accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Nouveau notebook
                </span>
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Titre du notebook"
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  backgroundColor: 'var(--notebook-surface-muted)',
                  border: '1px solid var(--notebook-border)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Description (optionnel)"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  backgroundColor: 'var(--notebook-surface-muted)',
                  border: '1px solid var(--notebook-border)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || creating}
                  className="notebook-fab disabled:opacity-40"
                  style={{ padding: '10px 20px', fontSize: '13px' }}
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer le notebook'}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewDescription(''); }}
                  className="notebook-chip"
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Notebook Cards ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 lg:px-10 pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl border animate-pulse"
                style={{ borderColor: 'var(--notebook-border)', backgroundColor: 'var(--notebook-card-bg)' }}
              >
                <div className="space-y-3">
                  <div className="h-5 w-3/4 rounded-lg" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
                  <div className="h-4 w-full rounded-lg" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
                  <div className="flex gap-3 pt-3">
                    <div className="h-6 w-20 rounded-full" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
                    <div className="h-6 w-16 rounded-full" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notebooks.length === 0 ? (
          /* ─── Empty state — onboarding ─── */
          <div className="notebook-empty-state py-20">
            <div className="notebook-empty-state-icon" style={{ width: 72, height: 72 }}>
              <BookOpen className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Commencez avec un notebook
            </h2>
            <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
              Importez des sources (PDF, URLs, texte) et posez des questions.
              L'IA répondra en citant vos documents.
            </p>

            {/* Feature chips */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              {[
                { icon: Upload, label: 'Upload PDF' },
                { icon: Globe, label: 'Importer URL' },
                { icon: MessageSquare, label: 'Chat IA' },
                { icon: Sparkles, label: 'Résumés' },
                { icon: Mic, label: 'Audio Overview' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="notebook-chip">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
              ))}
            </div>

            <button
              onClick={() => setShowCreateForm(true)}
              className="notebook-fab mt-6"
            >
              <Plus className="w-4 h-4" />
              Créer mon premier notebook
            </button>
          </div>
        ) : filteredNotebooks.length === 0 ? (
          /* ─── No search results ─── */
          <div className="notebook-empty-state py-12">
            <Search className="w-6 h-6" style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Aucun résultat pour « {searchQuery} »
            </p>
          </div>
        ) : (
          /* ─── Grid View ─── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence initial={false}>
              {filteredNotebooks.map((nb, i) => (
                <motion.div
                  key={nb.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, delay: i < 12 ? i * 0.03 : 0 }}
                  onClick={() => onSelectNotebook(nb.id)}
                  className="group cursor-pointer rounded-2xl border p-5 flex flex-col gap-3 transition-all duration-200"
                  style={{
                    backgroundColor: 'var(--notebook-card-bg)',
                    borderColor: 'var(--notebook-border)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-accent)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-border)';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl flex-shrink-0">{nb.icon}</span>
                      <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {nb.title}
                      </h3>
                    </div>
                    <button
                      onClick={(e) => handleDeleteClick(nb.id, e)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 flex-shrink-0"
                      title="Supprimer"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>

                  {/* Description */}
                  {nb.description && (
                    <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {nb.description}
                    </p>
                  )}

                  {/* Footer stats */}
                  <div className="flex items-center gap-3 mt-auto pt-3">
                    <span className="notebook-chip" style={{ padding: '4px 10px', fontSize: '11px' }}>
                      <FileText className="w-3 h-3" />
                      {nb.sourcesCount} source{nb.sourcesCount !== 1 ? 's' : ''}
                    </span>
                    <span className="notebook-chip" style={{ padding: '4px 10px', fontSize: '11px' }}>
                      <MessageSquare className="w-3 h-3" />
                      {nb.notesCount} note{nb.notesCount !== 1 ? 's' : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
                      <Clock className="w-3 h-3" />
                      {timeAgo(nb.updatedAt)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ─── Delete Confirmation Modal ──────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border p-6 shadow-xl"
              style={{ backgroundColor: 'var(--notebook-surface-elevated)', borderColor: 'var(--notebook-border)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
                >
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Supprimer ce notebook ?
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Cette action est irréversible
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-muted)' }}>
                Toutes les sources, notes et conversations seront supprimées définitivement.
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="notebook-chip"
                  style={{ padding: '8px 16px' }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 hover:opacity-90"
                  style={{ backgroundColor: '#ef4444', color: '#fff' }}
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * NotebookList — Page d'accueil des notebooks
 *
 * Affiche tous les notebooks avec création rapide.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Plus, Loader2, Trash2, Clock, FileText, MessageSquare,
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
}

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

export function NotebookList({ onSelectNotebook }: Props) {
  const { success, error: toastError } = useToast();
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

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
      <header
        className="flex flex-shrink-0 items-center gap-4 border-b px-5 py-3 lg:px-7"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
          >
            <BookOpen className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Notebooks
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
              >
                AI Research
              </span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Collections de sources avec chat IA, résumés et génération
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateForm(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau
        </button>
      </header>

      {/* Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b"
            style={{ borderColor: 'var(--border-base)' }}
          >
            <div className="p-5 lg:px-7 space-y-3" style={{ backgroundColor: 'var(--bg-panel)' }}>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Titre du notebook..."
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
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
                placeholder="Description (optionnel)..."
                className="w-full px-4 py-2 rounded-xl text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || creating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Créer'}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewDescription(''); }}
                  className="px-4 py-2 rounded-xl text-xs font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notebook Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement...</p>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-panel)' }}>
              <BookOpen className="w-8 h-8" style={{ color: 'var(--text-dimmed)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Aucun notebook</p>
            <p className="text-xs text-center max-w-sm" style={{ color: 'var(--text-dimmed)' }}>
              Créez votre premier notebook pour commencer. Ajoutez-y des sources (PDF, URLs, textes)
              puis posez des questions — l'IA répondra en citant vos documents.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Créer un notebook
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence initial={false}>
              {notebooks.map((nb, i) => (
                <motion.div
                  key={nb.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18, delay: i < 12 ? i * 0.03 : 0 }}
                  onClick={() => onSelectNotebook(nb.id)}
                  className="group cursor-pointer p-5 rounded-2xl border flex flex-col gap-3 transition-all hover:border-[var(--border-focus)] hover:shadow-lg"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
                >
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: `${nb.color}20` }}
                    >
                      {nb.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {nb.title}
                      </p>
                      {nb.description && (
                        <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                          {nb.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDelete(nb.id, e)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-auto pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                      <FileText className="w-3 h-3" />
                      {nb.sourcesCount} source{nb.sourcesCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
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
        )}
      </div>
    </div>
  );
}

/**
 * NotebookList — Page d'accueil des notebooks (style NotebookLM)
 *
 * Design épuré et moderne avec cards colorées, animations fluides,
 * création rapide, recherche et tri.
 *
 * Motion pass: springs instead of fixed-duration tweens, feedback on
 * pointer-down, interruptible/reversible transitions, translucent
 * "materialized" modal, reduced-motion support, and size-specific
 * type tracking — following Apple's Designing Fluid Interfaces.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  BookOpen, Plus, Loader2, Trash2, Clock, FileText, MessageSquare,
  Search, SortAsc, SortDesc, Sparkles, X, Upload, Globe, Mic,
  ArrowRight, Layers,
} from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { CreateNotebookModal } from './CreateNotebookModal.js';

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

// Critically damped default — graceful, no overshoot. Used for anything
// that wasn't triggered by a physical gesture (fades, reveals, layout).
const SPRING_UI = { type: 'spring' as const, bounce: 0, duration: 0.3 };
// A touch of bounce, reserved for elements that *feel* grabbed/thrown
// (the create-notebook button, card hover lift).
const SPRING_MOMENTUM = { type: 'spring' as const, bounce: 0.18, duration: 0.3 };

export function NotebookList({ onSelectNotebook, onClose }: Props) {
  const { success, error: toastError } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Spatial consistency: the delete confirmation should feel anchored to
  // whichever card triggered it, not just appear dead-center every time.
  const [deleteOrigin, setDeleteOrigin] = useState<{ x: number; y: number } | null>(null);

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

  const handleDeleteClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDeleteOrigin({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
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
    <div className="notebook-workspace h-full flex flex-col overflow-hidden"style={{ backgroundColor: 'var(--bg)' }}>
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-6 lg:px-10 pt-8 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--notebook-accent))' }}
            >
              <Layers className="h-5 w-5 text-white" />
            </div> */}
            <div>
              {/* Display-size heading: tight leading, slightly negative tracking */}
              <h1
                className="text-xl font-semibold notebook-heading"
                style={{ color: 'var(--text-primary)' }}
              >
                Notebooks
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {notebooks.length > 0
                  ? `${notebooks.length} notebook${notebooks.length !== 1 ? 's' : ''} · ${notebooks.reduce((a, n) => a + n.sourcesCount, 0)} sources`
                  : 'Recherche IA avec citations sur vos documents'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setShowCreateModal(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_MOMENTUM}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--notebook-accent))',
                color: 'white',
                boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau</span>
            </motion.button>
            {onClose && (
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
                className="notebook-icon-button"
                aria-label="Fermer"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Search & Sort Bar ──────────────────────────────── */}
      {notebooks.length > 0 && (
        <div className="flex-shrink-0 px-6 lg:px-10 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2.5 flex-1 max-w-md px-4 py-2.5 rounded-full transition-colors duration-150 focus-within:ring-2"
              style={{
                backgroundColor: 'var(--notebook-surface-muted)',
                border: '1px solid var(--notebook-border)',
                ['--tw-ring-color' as any]: 'var(--accent-primary)',
              }}
            >
              <Search className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher un notebook..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
              {searchQuery && (
                <motion.button
                  onClick={() => setSearchQuery('')}
                  whileTap={{ scale: 0.85 }}
                  className="p-0.5 rounded"
                >
                  <X className="h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
                </motion.button>
              )}
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortBy)}
                className="px-3 py-2 rounded-full text-xs font-medium outline-none cursor-pointer transition-colors duration-150"
                style={{
                  backgroundColor: 'var(--notebook-surface-muted)',
                  border: '1px solid var(--notebook-border)',
                  color: 'var(--text-secondary)',
                }}
              >
                <option value="updatedAt">Récent</option>
                <option value="title">Titre</option>
                <option value="sourcesCount">Sources</option>
              </select>
              <motion.button
                onClick={() => setSortDesc(!sortDesc)}
                whileTap={{ scale: 0.9, rotate: sortDesc ? -8 : 8 }}
                transition={{ duration: 0.1 }}
                className="p-2 rounded-lg"
                style={{ color: 'var(--text-dimmed)' }}
                title={sortDesc ? 'Décroissant' : 'Croissant'}
              >
                {sortDesc ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
              </motion.button>
            </div>
          </div>
        </div>
      )}



      {/* ─── Notebook Cards ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 lg:px-10 pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border animate-pulse overflow-hidden"
                style={{ borderColor: 'var(--notebook-border)', backgroundColor: 'var(--notebook-card-bg)' }}
              >
                <div className="h-1.5" style={{ backgroundColor: 'var(--notebook-surface-muted)' }} />
                <div className="p-5 space-y-3">
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
          <div className="flex flex-col items-center justify-center text-center py-16 gap-5">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--notebook-accent))', opacity: 0.9 }}
            >
              <BookOpen className="h-9 w-9 text-white" />
            </div>
            <div className="space-y-2">
              <h2
                className="text-lg font-semibold notebook-heading"
                style={{ color: 'var(--text-primary)' }}
              >
                Créez votre premier notebook
              </h2>
              <p className="text-sm max-w-md leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Importez vos documents et posez des questions.
                L'IA répondra en citant les passages pertinents.
              </p>
            </div>

            {/* Feature grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2 max-w-lg">
              {[
                { icon: Upload, label: 'Upload PDF', desc: 'Glissez-déposez' },
                { icon: Globe, label: 'Importer URL', desc: 'Articles & pages' },
                { icon: MessageSquare, label: 'Chat IA', desc: 'Avec citations' },
                { icon: Sparkles, label: 'Résumés', desc: 'Auto-générés' },
                { icon: Mic, label: 'Audio', desc: 'Vue d\'ensemble' },
                { icon: FileText, label: 'Notes', desc: 'Personnalisées' },
              ].map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl"
                  style={{ backgroundColor: 'var(--notebook-surface-muted)' }}
                >
                  <Icon className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                  <span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>{desc}</span>
                </div>
              ))}
            </div>

            <motion.button
              onClick={() => setShowCreateModal(true)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_MOMENTUM}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium mt-4"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--notebook-accent))',
                color: 'white',
                boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
              }}
            >
              <Plus className="w-4 h-4" />
              Créer un notebook
            </motion.button>
          </div>
        ) : filteredNotebooks.length === 0 ? (
          /* ─── No search results ─── */
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <Search className="w-6 h-6" style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Aucun résultat pour « {searchQuery} »
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs font-medium mt-1"
              style={{ color: 'var(--accent-primary)' }}
            >
              Effacer la recherche
            </button>
          </div>
        ) : (
          /* ─── Grid View ─── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence initial={false}>
              {filteredNotebooks.map((nb, i) => (
                <motion.div
                  key={nb.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.005 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{
                    ...(prefersReducedMotion ? { duration: 0.1 } : SPRING_MOMENTUM),
                    delay: i < 12 ? i * 0.03 : 0,
                  }}
                  onClick={() => onSelectNotebook(nb.id)}
                  className="group cursor-pointer rounded-2xl border overflow-hidden flex flex-col"
                  style={{
                    backgroundColor: 'var(--notebook-card-bg)',
                    borderColor: 'var(--notebook-border)',
                  }}
                >
                  {/* Color accent bar */}
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: nb.color || 'var(--accent-primary)' }}
                  />

                  <div className="p-5 flex flex-col gap-3 flex-1">
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg"
                          style={{ backgroundColor: `${nb.color || 'var(--accent-primary)'}15` }}
                        >
                          {nb.icon || '📓'}
                        </div>
                        <div className="min-w-0">
                          <h3
                            className="text-sm font-semibold truncate notebook-body"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {nb.title}
                          </h3>
                          <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-dimmed)' }}>
                            <Clock className="w-3 h-3" />
                            {timeAgo(nb.updatedAt)}
                          </p>
                        </div>
                      </div>
                      {/* Always faintly visible (not hover-only) so touch and
                          keyboard users can find it — agency over discovery */}
                      <motion.button
                        onClick={(e) => handleDeleteClick(nb.id, e)}
                        whileTap={{ scale: 0.85 }}
                        className="p-1.5 rounded-lg opacity-30 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 hover:bg-red-500/10 flex-shrink-0"
                        title="Supprimer"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </motion.button>
                    </div>

                    {/* Description */}
                    {nb.description && (
                      <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {nb.description}
                      </p>
                    )}

                    {/* Footer stats */}
                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <span
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'var(--notebook-surface-muted)', color: 'var(--text-secondary)' }}
                      >
                        <FileText className="w-3 h-3" />
                        {nb.sourcesCount}
                      </span>
                      <span
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'var(--notebook-surface-muted)', color: 'var(--text-secondary)' }}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {nb.notesCount}
                      </span>
                      <span
                        className="ml-auto flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        Ouvrir
                        <ArrowRight className="w-3 h-3" />
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
      <AnimatePresence>
        {showCreateModal && (
          <CreateNotebookModal
            onClose={() => setShowCreateModal(false)}
            onCreated={loadNotebooks}
          />
        )}
      </AnimatePresence>

      {/* ─── Delete Confirmation Modal ──────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            onClick={() => setDeleteTarget(null)}
          >
            {/* Materialize: blur radius and scale animate together, so the
                surface reads as glass condensing into place, not just fading. */}
            <motion.div
              initial={{
                opacity: 0,
                scale: prefersReducedMotion ? 1 : 0.9,
                backdropFilter: 'blur(0px)',
                x: deleteOrigin ? deleteOrigin.x - window.innerWidth / 2 : 0,
                y: deleteOrigin ? deleteOrigin.y - window.innerHeight / 2 : 0,
              }}
              animate={{ opacity: 1, scale: 1, backdropFilter: 'blur(20px)', x: 0, y: 0 }}
              exit={{
                opacity: 0,
                scale: prefersReducedMotion ? 1 : 0.92,
                x: deleteOrigin ? (deleteOrigin.x - window.innerWidth / 2) * 0.4 : 0,
                y: deleteOrigin ? (deleteOrigin.y - window.innerHeight / 2) * 0.4 : 0,
              }}
              transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--notebook-surface-elevated) 85%, transparent)',
                borderColor: 'var(--notebook-border)',
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
                >
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Supprimer ce notebook ?
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Cette action est irréversible
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-muted)' }}>
                Toutes les sources, notes et conversations seront définitivement supprimées.
              </p>

              <div className="flex items-center justify-end gap-3">
                <motion.button
                  onClick={() => setDeleteTarget(null)}
                  whileTap={{ scale: 0.96 }}
                  className="px-4 py-2.5 rounded-full text-sm font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Annuler
                </motion.button>
                <motion.button
                  onClick={handleDeleteConfirm}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING_MOMENTUM}
                  className="px-5 py-2.5 rounded-full text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-error)', color: 'white', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}
                >
                  Supprimer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
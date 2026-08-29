import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Panel } from '../ui/Panel.js';
import { useToast } from '../ui/Toast.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Memory {
  id: string;
  content: string;
  created_at: string;
}

interface MemoryPanelProps {
  /** Optionnel : liste pré-chargée. Si absent, le panel charge lui-même. */
  memories?: Memory[];
  onRefresh?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (days > 0)  return `${days}j`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0)  return `${mins}m`;
  return 'maintenant';
}

// ─── Component ───────────────────────────────────────────────────────────────

export const MemoryPanel = React.memo(function MemoryPanel({
  memories: externalMemories,
  onRefresh: externalRefresh,
}: MemoryPanelProps) {
  const { success, error: toastError } = useToast();

  // Self-managed state when no external data provided
  const [internalMemories, setInternalMemories] = useState<Memory[]>([]);
  const [loading, setLoading]   = useState(!externalMemories);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery]       = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const memories = externalMemories ?? internalMemories;

  const load = useCallback(() => {
    if (externalRefresh) { externalRefresh(); return; }
    setLoading(true);
    fetch('/api/memories')
      .then(r => r.json())
      .then(d => setInternalMemories(d.memories || []))
      .catch(() => toastError('Impossible de charger les souvenirs'))
      .finally(() => setLoading(false));
  }, [externalRefresh, toastError]);

  useEffect(() => {
    if (!externalMemories) load();
  }, [externalMemories, load]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setInternalMemories(prev => prev.filter(m => m.id !== id));
      success('Souvenir supprimé');
    } catch {
      toastError('Impossible de supprimer');
    } finally {
      setDeleting(null);
    }
  }, [success, toastError]);

  const filtered = query.trim()
    ? memories.filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
    : memories;

  return (
    <Panel
      title="Mémoire"
      icon={<BrainCircuit className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />}
      actions={
        <div className="flex items-center gap-1">
          {/* Compteur */}
          {memories.length > 0 && (
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded-md tabular-nums"
              style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
            >
              {memories.length}
            </span>
          )}

          {/* Toggle search */}
          <button
            type="button"
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) setQuery(''); }}
            className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
            style={{
              color: searchOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
              backgroundColor: searchOpen ? 'var(--accent-subtle)' : 'transparent',
            }}
            aria-label="Rechercher"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--ctrl-hover)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Rafraîchir"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      {/* Search bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filtrer les souvenirs…"
                className="w-full pl-8 pr-8 py-2 rounded-lg text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border-base)')}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Effacer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5 custom-scrollbar">
        {loading ? (
          /* Skeleton */
          <div className="space-y-2">
            {[80, 60, 72].map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-xl animate-pulse"
                style={{ backgroundColor: 'var(--bg-base)', width: '100%', opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-10 gap-3"
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <BrainCircuit className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {query ? 'Aucune correspondance' : 'Aucun souvenir'}
              </p>
              <p className="text-sm leading-relaxed max-w-[200px]" style={{ color: 'var(--text-muted)' }}>
                {query
                  ? 'Essayez un autre terme.'
                  : 'Leanna retient automatiquement les informations importantes.'}
              </p>
            </div>
          </motion.div>
        ) : (
          /* Memory list */
          <AnimatePresence initial={false}>
            {filtered.map((memory, i) => (
              <motion.div
                key={memory.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.16, delay: i < 8 ? i * 0.025 : 0 }}
                className="group relative p-3 rounded-xl"
                style={{
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-base)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-base)')}
              >
                {/* Content */}
                <p
                  className="text-xs leading-relaxed pr-6 line-clamp-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {memory.content}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border-base)' }}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: 'var(--accent-primary)', boxShadow: '0 0 6px var(--accent-glow)' }}
                    />
                    <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {timeAgo(memory.created_at)}
                    </span>
                  </div>
                  <span className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--text-dimmed)' }}>
                    long terme
                  </span>
                </div>

                {/* Delete button */}
                <motion.button
                  type="button"
                  onClick={() => handleDelete(memory.id)}
                  disabled={deleting === memory.id}
                  whileTap={{ scale: 0.85 }}
                  className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1 rounded-md transition-opacity"
                  style={{ color: 'var(--color-error)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-error) 12%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                  aria-label="Supprimer"
                >
                  {deleting === memory.id
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />
                  }
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer — result count when filtering */}
      {query && filtered.length > 0 && (
        <p className="mt-2 text-xs text-center" style={{ color: 'var(--text-dimmed)' }}>
          {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
        </p>
      )}
    </Panel>
  );
});

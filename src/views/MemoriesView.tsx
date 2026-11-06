import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, Search, Trash2, RefreshCw, Loader2, X, Check, Eraser, Clock, Sparkles } from 'lucide-react';
import { useToast } from '../components/ui/Toast.js';
import { useConfirm } from '../components/ui/ConfirmDialog.js';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { viewHeaderProps } from '../config/navigation.js';

interface Memory { id: string; content: string; created_at: string; }

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (days > 0)  return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  if (hours > 0) return `Il y a ${hours}h`;
  if (mins > 0)  return `Il y a ${mins}m`;
  return 'À l\'instant';
}

export default function MemoriesView() {
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [memories, setMemories]     = useState<Memory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [query, setQuery]           = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [confirmId, setConfirmId]   = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/memories')
      .then(r => r.json())
      .then(d => setMemories(d.memories || []))
      .catch(() => toastError('Impossible de charger les souvenirs'))
      .finally(() => setLoading(false));
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const filtered = memories.filter(m =>
    query.length === 0 || m.content.toLowerCase().includes(query.toLowerCase())
  );

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    setConfirmId(null);
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMemories(prev => prev.filter(m => m.id !== id));
      success('Souvenir supprimé');
    } catch {
      toastError('Impossible de supprimer le souvenir');
    } finally {
      setDeleting(null);
    }
  }, [success, toastError]);

  const handleClearAll = useCallback(async () => {
    if (memories.length === 0) return;
    const confirmed = await confirm({
      title: 'Effacer tous les souvenirs',
      message: `Supprimer les ${memories.length} souvenir${memories.length > 1 ? 's' : ''} de Leanna ? Cette action est irréversible.`,
      confirmLabel: 'Tout effacer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    });
    if (!confirmed) return;
    setClearingAll(true);
    try {
      const res = await fetch('/api/memories/all', { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMemories([]);
      success('Tous les souvenirs ont été effacés');
    } catch {
      toastError('Impossible d\'effacer les souvenirs');
    } finally {
      setClearingAll(false);
    }
  }, [memories.length, confirm, success, toastError]);

  return (
    <div
      className="h-full flex flex-col"
    >
      {/* Header */}
      <ViewHeader
        {...viewHeaderProps('memories')}
        badge="Mémoire active"
        description="Les informations importantes retenues par Leanna"
        actions={
          <>
            <span className="hidden text-xs sm:inline" style={{ color: 'var(--text-muted)' }}>
              {memories.length} {memories.length === 1 ? 'entrée' : 'entrées'}
            </span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg p-2 transition-colors hover:bg-[var(--bg-active)] disabled:opacity-50"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Rafraîchir les souvenirs"
              title="Rafraîchir"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {memories.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearingAll}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-error-subtle, rgba(239,68,68,0.1))',
                  color: 'var(--color-error, #ef4444)',
                  border: '1px solid var(--color-error-border, rgba(239,68,68,0.2))',
                }}
                aria-label="Effacer tous les souvenirs"
                title="Effacer tous les souvenirs"
              >
                {clearingAll
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Eraser className="h-3 w-3" />
                }
                <span className="hidden sm:inline">{clearingAll ? 'Effacement…' : 'Tout effacer'}</span>
              </button>
            )}
          </>
        }
      />

      {/* Search + stats */}
      <div className="px-6 pt-4 pb-3 flex-shrink-0 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher dans les souvenirs…"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-xs outline-none transition-all focus:ring-2"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-primary)',
              ['--tw-ring-color' as any]: 'var(--border-focus)',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Stats bar */}
        {!loading && memories.length > 0 && (
          <div className="flex items-center gap-1.5 px-1">
            <Clock className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
            <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
              {query
                ? `${filtered.length}/${memories.length} souvenir${memories.length > 1 ? 's' : ''}`
                : `${memories.length} souvenir${memories.length > 1 ? 's' : ''} enregistré${memories.length > 1 ? 's' : ''}`
              }
            </span>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-dimmed)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement des souvenirs…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
              <BrainCircuit className="w-6 h-6" style={{ color: 'var(--text-dimmed)' }} />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                {query ? 'Aucune correspondance' : 'Aucun souvenir pour le moment'}
              </p>
              <p className="text-xs leading-relaxed max-w-xs" style={{ color: 'var(--text-dimmed)' }}>
                {query
                  ? `Aucun souvenir ne correspond à "${query}".`
                  : 'Parlez à Leanna — elle se souviendra automatiquement des informations importantes vous concernant.'}
              </p>
            </div>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
              >
                Effacer la recherche
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {filtered.map((memory, i) => (
                <motion.div
                  key={memory.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{    opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.18, delay: i < 12 ? i * 0.03 : 0 }}
                  data-spotlight
                  className="group relative p-4 rounded-2xl flex flex-col gap-3"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-base)',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-focus)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-base)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  {/* Icon + content */}
                  <div className="flex items-start gap-2.5">
                    <div
                      className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ backgroundColor: 'var(--bg-active)', border: '1px solid var(--border-base)' }}
                    >
                      <Sparkles className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>
                      {memory.content}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(memory.created_at)}</span>
                    </div>

                    {confirmId === memory.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs mr-1" style={{ color: 'var(--color-error)' }}>Confirmer ?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(memory.id)}
                          disabled={deleting === memory.id}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--color-error)', backgroundColor: 'var(--color-error-subtle, rgba(239,68,68,0.1))' }}
                          aria-label="Confirmer la suppression"
                        >
                          {deleting === memory.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Check className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          disabled={deleting === memory.id}
                          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
                          style={{ color: 'var(--text-muted)' }}
                          aria-label="Annuler"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        type="button"
                        onClick={() => setConfirmId(memory.id)}
                        whileTap={{ scale: 0.88 }}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          color: 'var(--color-error)',
                          backgroundColor: 'transparent',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-error-subtle, rgba(239,68,68,0.1))'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                        aria-label="Supprimer le souvenir"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Supprimer</span>
                      </motion.button>
                    )}
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

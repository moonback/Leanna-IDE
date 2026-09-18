/**
 * GoalsTab — Gestion des objectifs persistants
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Target, Plus, Pause, Play, Trash2, Loader2,
  ChevronDown, ChevronRight, AlertTriangle,
  Clock, RefreshCw,
} from 'lucide-react';
import { autonomousApi } from '../../../services/autonomousApi.js';
import type { Goal, GoalCreateInput, GoalStatus } from '../../../services/autonomousApi.js';

// ─── Status badges ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<GoalStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Actif',     color: 'text-green-400',  bg: 'bg-green-900/20' },
  paused:    { label: 'Pausé',     color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
  completed: { label: 'Complété',  color: 'text-blue-400',   bg: 'bg-blue-900/20' },
  failed:    { label: 'Échoué',    color: 'text-red-400',    bg: 'bg-red-900/20' },
  archived:  { label: 'Archivé',   color: 'text-gray-400',   bg: 'bg-gray-800/30' },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-gray-400',
};

const CADENCE_LABELS: Record<string, string> = {
  continuous: '∞ Continu',
  once:       '1× Une fois',
  on_change:  '⚡ Au changement',
  scheduled:  '🕐 Planifié',
};

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GoalCreateInput>({
    title: '',
    description: '',
    priority: 'medium',
    cadence: 'continuous',
    tags: [],
    successCriteria: [],
  });

  const set = (key: keyof GoalCreateInput, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      await autonomousApi.createGoal(form);
      setForm({ title: '', description: '', priority: 'medium', cadence: 'continuous' });
      setOpen(false);
      onCreated();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-base)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
      >
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-green-400" />
          Nouvel objectif
        </div>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3" style={{ backgroundColor: 'var(--bg-base)' }}>
          <input
            className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent focus:outline-none focus:ring-1"
            style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
            placeholder="Titre *"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
          />
          <textarea
            className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent focus:outline-none focus:ring-1 resize-none"
            style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
            placeholder="Description *"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Priorité</label>
              <select
                className="w-full px-2 py-1.5 rounded-lg text-sm border bg-transparent focus:outline-none"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
              >
                {['low', 'medium', 'high', 'critical'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Cadence</label>
              <select
                className="w-full px-2 py-1.5 rounded-lg text-sm border bg-transparent focus:outline-none"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
                value={form.cadence}
                onChange={(e) => set('cadence', e.target.value)}
              >
                {['continuous', 'once', 'on_change', 'scheduled'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs border transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Créer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Goal card ────────────────────────────────────────────────────────────────

function GoalCard({ goal, onRefresh }: { goal: Goal; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const cfg = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.active;

  const action = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); onRefresh(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border overflow-hidden transition-all" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5">
          {expanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{goal.title}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            <span className={`text-xs ${PRIORITY_COLORS[goal.priority]}`}>{goal.priority}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{CADENCE_LABELS[goal.cadence] ?? goal.cadence}</span>
            {goal.checks.length > 0 && <span>{goal.checks.length} check(s)</span>}
            {goal.lastMissionAt && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {new Date(goal.lastMissionAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {goal.status === 'active' && (
            <button
              onClick={() => action(() => autonomousApi.pauseGoal(goal.id))}
              disabled={busy}
              className="p-1.5 rounded hover:bg-yellow-900/30 transition-colors"
              title="Mettre en pause"
            >
              {busy ? <Loader2 size={13} className="animate-spin text-yellow-400" /> : <Pause size={13} className="text-yellow-400" />}
            </button>
          )}
          {goal.status === 'paused' && (
            <button
              onClick={() => action(() => autonomousApi.resumeGoal(goal.id))}
              disabled={busy}
              className="p-1.5 rounded hover:bg-green-900/30 transition-colors"
              title="Reprendre"
            >
              {busy ? <Loader2 size={13} className="animate-spin text-green-400" /> : <Play size={13} className="text-green-400" />}
            </button>
          )}
          <button
            onClick={() => { if (window.confirm(`Supprimer "${goal.title}" ?`)) action(() => autonomousApi.deleteGoal(goal.id)); }}
            disabled={busy}
            className="p-1.5 rounded hover:bg-red-900/30 transition-colors"
            title="Supprimer"
          >
            <Trash2 size={13} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-3 flex flex-col gap-2 text-xs border-t" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
          <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>{goal.description}</p>

          {goal.checks.length > 0 && (
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Checks :</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {goal.checks.map((c, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 border" style={{ borderColor: 'var(--border-base)' }}>
                    {c.label ?? c.type}
                  </span>
                ))}
              </div>
            </div>
          )}

          {goal.successCriteria.length > 0 && (
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Critères de succès :</span>
              <ul className="mt-1 ml-3 list-disc space-y-0.5">
                {goal.successCriteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {goal.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {goal.tags.map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded-full bg-blue-900/20 text-blue-400">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<GoalStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await autonomousApi.listGoals();
      setGoals(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? goals : goals.filter((g) => g.status === filter);

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 bg-red-900/20 border border-red-800/40 text-xs">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <CreateForm onCreated={load} />

      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {(['all', 'active', 'paused', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
              filter === f
                ? 'text-white font-medium'
                : 'hover:bg-white/10'
            }`}
            style={filter === f ? { backgroundColor: 'var(--accent)' } : { color: 'var(--text-muted)' }}
          >
            {f === 'all' ? `Tous (${goals.length})` :
             f === 'active' ? `Actifs (${goals.filter(g => g.status === 'active').length})` :
             f === 'paused' ? `Pausés (${goals.filter(g => g.status === 'paused').length})` :
             `Complétés (${goals.filter(g => g.status === 'completed').length})`}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1 hover:bg-white/10 rounded" title="Rafraîchir">
          <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Goals list */}
      {loading ? (
        <div className="flex items-center justify-center h-24 gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-24 gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Target size={24} className="opacity-30" />
          <span>{filter === 'all' ? 'Aucun objectif — créez-en un ci-dessus.' : `Aucun objectif ${filter}.`}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}

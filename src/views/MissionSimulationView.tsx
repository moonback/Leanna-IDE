import { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  FlaskConical, Loader2, Play, Pencil, X, FileEdit, TerminalSquare, Users,
  Wrench, Clock, DollarSign, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ViewHeader } from '../components/ui/ViewHeader.js';

// ─── Types mirrored from the MissionSimulator engine (mission_simulate) ──────

interface SimulatedStep { order: number; skillName: string; goalTitle: string }
interface SimulationReport {
  missionId: string;
  steps: SimulatedStep[];
  filesWouldChange: string[];
  commandsWouldRun: string[];
  agentsInvolved: string[];
  toolCalls: number;
  sideEffectsAvoided: number;
  estimatedDurationMs: number;
  estimatedCostUsd: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  risks: string[];
  planComplete: boolean;
  summary: string;
}

function riskColor(level: SimulationReport['riskLevel']): string {
  switch (level) {
    case 'critical': return 'var(--color-error)';
    case 'high': return 'var(--color-warning)';
    case 'medium': return 'var(--color-info)';
    default: return 'var(--color-success)';
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return 'n/a';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export default function MissionSimulationView() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const [objective, setObjective] = useState('');
  const description = '';
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulate = useCallback(async () => {
    if (!objective.trim()) return;
    setLoading(true); setError(null); setReport(null);
    try {
      const res = await fetch('/api/missions/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: objective.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setError(data?.error ?? 'Échec de la simulation.'); return; }
      setReport(data as SimulationReport);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [objective, description]);

  const execute = useCallback(async () => {
    if (!objective.trim()) return;
    setRunning(true); setError(null);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: objective.trim(), description: description.trim() || objective.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setError(data?.error ?? 'Échec du lancement.'); return; }
      navigate('/mission-timeline');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [objective, description, navigate]);

  const cancel = useCallback(() => { setReport(null); setError(null); }, []);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Simulation de mission"
        icon={FlaskConical}
        description="Prévisualise ce que Leanna ferait — fichiers, commandes, agents, coût, risque — avant d'exécuter réellement"
        badge="Dry-run"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">

          {/* Objective input */}
          <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            <label htmlFor="sim-objective" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Objectif</label>
            <textarea
              id="sim-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex : Corrige les erreurs TypeScript et vérifie que les tests passent"
              rows={2}
              className="w-full resize-none rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
            />
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => void simulate()}
                disabled={loading || !objective.trim()}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base)' }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                Simuler
              </button>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2 rounded-md p-3 text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {loading && !report && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Simulation en cours (dry-run, aucun effet de bord)…</p>
          )}

          {report && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="flex flex-col gap-4"
            >
              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric icon={FileEdit} label="Fichiers modifiés" value={report.filesWouldChange.length} />
                <Metric icon={TerminalSquare} label="Commandes" value={report.commandsWouldRun.length} />
                <Metric icon={Users} label="Agents" value={report.agentsInvolved.length} />
                <Metric icon={Wrench} label="Appels d'outils" value={report.toolCalls} />
                <Metric icon={Clock} label="Durée est." value={formatDuration(report.estimatedDurationMs)} />
                <Metric icon={DollarSign} label="Coût est." value={`$${report.estimatedCostUsd.toFixed(2)}`} />
              </div>

              {/* Risk banner */}
              <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium"
                style={{ backgroundColor: `color-mix(in srgb, ${riskColor(report.riskLevel)} 10%, transparent)`, color: riskColor(report.riskLevel), border: `1px solid color-mix(in srgb, ${riskColor(report.riskLevel)} 25%, transparent)` }}>
                {report.riskLevel === 'low' ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                Risque {report.riskLevel}
                {!report.planComplete && <span style={{ color: 'var(--text-muted)' }}>· plan incomplet</span>}
              </div>

              {report.risks.length > 0 && (
                <ListCard title="Risques détectés" items={report.risks} />
              )}
              {report.filesWouldChange.length > 0 && (
                <ListCard title="Fichiers qui seraient modifiés" items={report.filesWouldChange} mono />
              )}
              {report.commandsWouldRun.length > 0 && (
                <ListCard title="Commandes qui seraient exécutées" items={report.commandsWouldRun} mono />
              )}

              {/* Plan steps */}
              {report.steps.length > 0 && (
                <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Plan ({report.steps.length} étapes)</h2>
                  <ol className="flex flex-col gap-1">
                    {report.steps.map((s) => (
                      <li key={s.order} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>{s.order + 1}</span>
                        <code>{s.skillName}</code>
                        <span className="truncate" style={{ color: 'var(--text-dimmed)' }}>· {s.goalTitle}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={cancel}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}>
                  <X size={13} /> Annuler
                </button>
                <button type="button" onClick={() => { setReport(null); document.getElementById('sim-objective')?.focus(); }}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}>
                  <Pencil size={13} /> Modifier le plan
                </button>
                <button type="button" onClick={() => void execute()} disabled={running}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-success)', color: 'var(--bg-base)' }}>
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Exécuter réellement
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.FC<{ size?: number; style?: React.CSSProperties }>; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={12} style={{ color: 'var(--accent-primary)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}

function ListCard({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  return (
    <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>{title}</h2>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {mono ? <code>{it}</code> : it}
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Users, Loader2, Network, AlertTriangle, Search, DraftingCompass, Code2,
  FlaskConical, ShieldCheck, Eye, Gauge, FileText, ArrowDown,
} from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';

// ─── Types mirrored from the SwarmComposer (agent_compose_swarm) ─────────────

type SwarmStage = 'research' | 'design' | 'build' | 'verify' | 'review' | 'security' | 'optimize' | 'document';
interface SwarmMember { role: string; stage: SwarmStage; rationale: string }
interface SwarmComposition {
  objective: string;
  members: SwarmMember[];
  pipeline: string[];
  summary: string;
}

const STAGE_META: Record<SwarmStage, { label: string; icon: React.FC<{ size?: number; style?: React.CSSProperties }>; color: string }> = {
  research:  { label: 'Recherche',     icon: Search,          color: 'var(--color-info)' },
  design:    { label: 'Conception',    icon: DraftingCompass, color: 'var(--accent-primary)' },
  build:     { label: 'Implémentation', icon: Code2,          color: 'var(--accent-secondary)' },
  verify:    { label: 'Vérification',  icon: FlaskConical,    color: 'var(--color-info)' },
  review:    { label: 'Revue',         icon: Eye,             color: 'var(--color-warning)' },
  security:  { label: 'Sécurité',      icon: ShieldCheck,     color: 'var(--color-error)' },
  optimize:  { label: 'Optimisation',  icon: Gauge,           color: 'var(--accent-secondary)' },
  document:  { label: 'Documentation', icon: FileText,        color: 'var(--text-muted)' },
};

export default function AgentSwarmView() {
  const reduceMotion = useReducedMotion();
  const [objective, setObjective] = useState('');
  const [composition, setComposition] = useState<SwarmComposition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compose = useCallback(async () => {
    if (!objective.trim()) return;
    setLoading(true); setError(null); setComposition(null);
    try {
      const res = await fetch('/api/agents/compose-swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setError(data?.error ?? 'Échec de la composition.'); return; }
      setComposition({ objective: data.objective, members: data.members ?? [], pipeline: data.pipeline ?? [], summary: data.summary ?? '' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [objective]);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Agent Swarm"
        icon={Network}
        description="Leanna compose dynamiquement l'équipe d'agents adaptée à l'objectif, puis la dissout après la mission"
        badge="Composition"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">

          {/* Objective input */}
          <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            <label htmlFor="swarm-objective" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Objectif</label>
            <textarea
              id="swarm-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex : Optimise les performances de mon application"
              rows={2}
              className="w-full resize-none rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
            />
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => void compose()}
                disabled={loading || !objective.trim()}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base)' }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                Composer l'équipe
              </button>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2 rounded-md p-3 text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {loading && !composition && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Composition de l'équipe…</p>
          )}

          {composition && composition.members.length > 0 && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            >
              {/* Pipeline summary */}
              <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                {composition.members.length} agent(s) · pipeline : {composition.pipeline.join(' → ')}
              </p>

              {/* Vertical staged pipeline */}
              <ol className="flex flex-col items-stretch gap-0">
                {composition.members.map((m, i) => {
                  const meta = STAGE_META[m.stage] ?? STAGE_META.build;
                  const Icon = meta.icon;
                  return (
                    <li key={`${m.role}-${i}`} className="flex flex-col items-center">
                      <motion.div
                        className="w-full rounded-lg border p-3 shadow-sm"
                        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)', borderLeft: `3px solid ${meta.color}` }}
                        initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : i * 0.04 }}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}>
                            <Icon size={15} style={{ color: meta.color }} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{m.role}</span>
                              <span className="rounded-full px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}>{meta.label}</span>
                            </div>
                            <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{m.rationale}</p>
                          </div>
                        </div>
                      </motion.div>
                      {i < composition.members.length - 1 && (
                        <ArrowDown size={14} style={{ color: 'var(--text-dimmed)', margin: '2px 0' }} aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ol>

              <p className="mt-3 text-xs italic" style={{ color: 'var(--text-dimmed)' }}>
                L'équipe est dissoute automatiquement à la fin de la mission.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { Activity, Bot, BrainCircuit, Code2, Layers3, Workflow, Wrench, Zap } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ActivityStep } from '../../hooks/useActivity.js';

type GroupId = 'orchestration' | 'reasoning' | 'workspace' | 'automation' | 'skills' | 'tools';
interface Group {
  id: GroupId;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  x: number;
  y: number;
}
const GROUPS: Group[] = [
  { id: 'orchestration', label: 'Orchestration', description: 'Délégation et coordination', icon: Bot, x: 50, y: 8 },
  { id: 'reasoning', label: 'Raisonnement', description: 'Stratégies et réflexion', icon: BrainCircuit, x: 83, y: 31 },
  { id: 'workspace', label: 'Workspace', description: 'Lecture et modification du projet', icon: Code2, x: 83, y: 75 },
  { id: 'automation', label: 'Automatisation', description: 'Navigation et actions web', icon: Workflow, x: 50, y: 92 },
  { id: 'skills', label: 'Skills', description: 'Compétences et extensions', icon: Layers3, x: 17, y: 75 },
  { id: 'tools', label: 'Outils', description: 'Autres outils exécutés', icon: Wrench, x: 17, y: 31 },
];

function classify(tool: string): GroupId {
  if (tool.startsWith('agent_')) return 'orchestration';
  if (tool.startsWith('reasoning_')) return 'reasoning';
  if (tool.startsWith('automation_')) return 'automation';
  if (tool.startsWith('custom_') || tool.includes('skill')) return 'skills';
  if (/(project_file|project_directory|project_files|workspace|codebase)/.test(tool)) return 'workspace';
  return 'tools';
}

interface DashboardAgentNetworkProps {
  activity: ActivityStep[];
  reasoningActive: boolean;
  isBusy: boolean;
}

/** Graphe d'activité dérivé des vrais événements d'outils de la session Live. */
export const DashboardAgentNetwork = React.memo(function DashboardAgentNetwork({
  activity, reasoningActive, isBusy,
}: DashboardAgentNetworkProps) {
  const reduce = !!useReducedMotion();
  const [selected, setSelected] = useState<GroupId | null>(null);
  const stats = useMemo(() => {
    const grouped = new Map<GroupId, ActivityStep[]>();
    for (const group of GROUPS) grouped.set(group.id, []);
    for (const step of activity) grouped.get(classify(step.tool))?.push(step);
    return grouped;
  }, [activity]);
  const selectedGroup = GROUPS.find(group => group.id === selected);
  const selectedSteps = selected ? (stats.get(selected) ?? []).slice(-5).reverse() : [];
  const hasEvents = activity.length > 0;

  return (
    <section className="mt-4 overflow-hidden rounded-xl border p-3"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 66%, transparent)' }}
      aria-label="Réseau des activités de Leanna">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            <Activity size={13} style={{ color: 'var(--accent-primary)' }} /> Réseau d'activité
          </div>
          <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Connexions calculées à partir des événements réellement reçus</p>
        </div>
        <span className="rounded-full px-2 py-1 font-mono text-[10px]" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
          {activity.length} événement(s) observé(s)
        </span>
      </div>

      <div className="relative mx-auto h-[230px] max-w-[650px] sm:h-[250px]" role="group" aria-label="Catégories d'activité sélectionnables">
        <svg viewBox="0 0 600 260" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <radialGradient id="leanna-network-glow"><stop offset="0%" stopColor="var(--accent-primary)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0"/></radialGradient>
          </defs>
          <circle cx="300" cy="130" r="88" fill="url(#leanna-network-glow)" />
          {GROUPS.map((group, index) => {
            const x = group.x * 6;
            const y = group.y * 2.6;
            const count = stats.get(group.id)?.length ?? 0;
            const active = (stats.get(group.id) ?? []).some(step => step.status === 'running');
            return <g key={group.id}>
              <line x1="300" y1="130" x2={x} y2={y} stroke="var(--accent-primary)" strokeOpacity={count ? .52 : .14} strokeWidth={count ? 1.8 : 1} strokeDasharray={count ? '5 5' : '2 7'} />
              {count > 0 && !reduce && <motion.circle r="3.5" fill="var(--accent-primary)"
                animate={{ cx: [300, x], cy: [130, y], opacity: [.15, .95, .15] }}
                transition={{ duration: 2.8 + index * .25, repeat: Infinity, ease: 'linear', delay: index * .18 }} />}
              <circle cx={x} cy={y} r={active ? 16 : count ? 13 : 9} fill={active ? 'var(--accent-primary)' : 'var(--bg-panel)'} fillOpacity={active ? .26 : 1} stroke="var(--accent-primary)" strokeOpacity={count ? .8 : .25} strokeWidth={active ? 2 : 1.2}/>
            </g>;
          })}
          <circle cx="300" cy="130" r="34" fill="var(--bg-panel)" stroke="var(--accent-primary)" strokeWidth="1.5"/>
          <circle cx="300" cy="130" r="26" fill="var(--accent-subtle)"/>
        </svg>
        <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
          <motion.div animate={reduce || !isBusy ? undefined : { scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
            <Bot size={23} style={{ color: 'var(--accent-primary)' }}/>
          </motion.div>
          <span className="mt-1 text-[9px] font-bold tracking-widest" style={{ color: 'var(--text-primary)' }}>LEANNA</span>
          <span className="text-[8px]" style={{ color: isBusy ? 'var(--accent-primary)' : 'var(--text-dimmed)' }}>{isBusy ? 'ACTIVE' : 'CORE'}</span>
        </div>
        {GROUPS.map(group => {
          const steps = stats.get(group.id) ?? [];
          const count = steps.length;
          const running = steps.some(step => step.status === 'running');
          const errors = steps.filter(step => step.status === 'error').length;
          const Icon = group.icon;
          return <button key={group.id} type="button" onClick={() => setSelected(value => value === group.id ? null : group.id)}
            aria-pressed={selected === group.id}
            className="absolute z-20 flex min-w-[82px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-xl border px-2 py-1.5 text-center transition-all hover:-translate-y-[55%] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ left: group.x + '%', top: group.y + '%', borderColor: selected === group.id ? 'var(--accent-primary)' : 'var(--border-base)', backgroundColor: selected === group.id ? 'var(--accent-subtle)' : 'var(--bg-panel)', boxShadow: selected === group.id ? '0 0 20px color-mix(in srgb, var(--accent-primary) 20%, transparent)' : '0 4px 12px color-mix(in srgb, var(--bg) 25%, transparent)' }}>
            <span className="flex items-center gap-1" style={{ color: running ? 'var(--accent-primary)' : errors ? 'var(--color-error)' : 'var(--text-muted)' }}>
              <Icon size={13}/><span className="font-mono text-[10px] font-semibold">{count}</span>
              {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }}/>}
            </span>
            <span className="whitespace-nowrap text-[9px] font-medium" style={{ color: 'var(--text-primary)' }}>{group.label}</span>
          </button>;
        })}
      </div>

      <AnimatePresence mode="wait">
        {selectedGroup && (
          <motion.div key={selectedGroup.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="mt-2 rounded-lg border p-3" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedGroup.label}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{selectedGroup.description}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-md px-2 py-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>Fermer</button>
            </div>
            {selectedSteps.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Aucun événement observé dans cette catégorie pour cette session.</p> : (
              <ul className="space-y-1.5">
                {selectedSteps.map(step => <li key={step.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: step.status === 'running' ? 'var(--accent-primary)' : step.status === 'error' ? 'var(--color-error)' : 'var(--color-success, #22c55e)' }}/>
                  <span className="min-w-0 flex-1" style={{ color: 'var(--text-primary)' }}>{step.label}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{step.status === 'running' ? 'En cours' : step.status === 'error' ? 'Erreur' : 'Terminé'}</span>
                </li>)}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {!hasEvents && <p className="mt-1 text-center text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Le réseau se peuple automatiquement dès les premiers appels d'outils.</p>}
      {reasoningActive && <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--accent-primary)' }}><Zap size={11}/> Raisonnement en cours détecté</div>}
    </section>
  );
});

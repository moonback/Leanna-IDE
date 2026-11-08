import React, { useSyncExternalStore } from 'react';
import { Activity, Bot, Clock3, Loader2 } from 'lucide-react';
import { getAgentTasks, subscribe } from '../../stores/agentActivityStore.js';
import { motion, useReducedMotion } from 'motion/react';
import type { ActivityStep } from '../../hooks/useActivity.js';
import { DashboardAgentNetwork } from './DashboardAgentNetwork.js';

interface DashboardCoreProps {
  aiName: string;
  connected: boolean;
  connecting: boolean;
  activity: ActivityStep[];
  isBusy: boolean;
  reasoningActive: boolean;
}

/** Noyau visuel du dashboard : son état est exclusivement dérivé de la session Live réelle. */
export const DashboardCore = React.memo(function DashboardCore({
  aiName, connected, connecting, activity, isBusy, reasoningActive,
}: DashboardCoreProps) {
  const reduce = !!useReducedMotion();
  const status = connecting ? 'Connexion en cours' : connected ? 'Session connectée' : 'En attente de connexion';
  const accent = connected ? 'var(--color-success, #22c55e)' : 'var(--accent-primary)';
  const tasks = useSyncExternalStore(subscribe, getAgentTasks);
  const current = [...tasks].reverse().find(task => task.status === 'running');
  const recentSteps = activity.slice(-4).reverse();
  const stats = [
    { label: 'En cours', value: tasks.filter(task => task.status === 'running').length, color: 'var(--accent-primary)' },
    { label: 'Terminées', value: tasks.filter(task => task.status === 'completed').length, color: 'var(--color-success, #22c55e)' },
    { label: 'Échecs', value: tasks.filter(task => task.status === 'failed' || task.status === 'incomplete').length, color: 'var(--color-error, #ef4444)' },
    { label: 'Outils Live', value: activity.length, color: 'var(--accent-primary)' },
  ];

  return (
    <section
      className="relative mb-2 grid min-h-0 grid-cols-1 items-stretch gap-3 overflow-hidden rounded-xl border p-2.5 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,2fr)] lg:gap-4 lg:px-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent-primary) 28%, var(--border-base))',
        background: 'linear-gradient(115deg, color-mix(in srgb, var(--bg-panel) 96%, var(--accent-primary) 4%), color-mix(in srgb, var(--bg-secondary) 90%, transparent))',
        boxShadow: 'inset 0 1px 0 color-mix(in srgb, white 7%, transparent), 0 18px 48px color-mix(in srgb, var(--bg) 28%, transparent)',
        transformStyle: 'preserve-3d',
      }}
      aria-label={`Noyau de contrôle ${aiName} : ${status}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden
        style={{ backgroundImage: 'linear-gradient(color-mix(in srgb, var(--accent-primary) 10%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 10%, transparent) 1px, transparent 1px)', backgroundSize: '28px 28px', maskImage: 'linear-gradient(90deg, transparent, black 35%, black 75%, transparent)' }} />
      <div className="relative z-10 flex min-w-0 flex-col gap-3 self-stretch">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center" style={{ perspective: '600px' }}>
          <motion.div className="absolute inset-1 rounded-full border"
            style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 55%, transparent)', boxShadow: '0 0 22px color-mix(in srgb, var(--accent-primary) 18%, transparent)' }}
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} />
          <motion.div className="absolute inset-3 rounded-full border border-dashed"
            style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 38%, transparent)' }}
            animate={reduce ? undefined : { rotate: -360 }}
            transition={{ duration: 32, repeat: Infinity, ease: 'linear' }} />
          <motion.div className="absolute inset-5 rounded-full"
            style={{ background: `radial-gradient(circle, color-mix(in srgb, ${accent} 35%, transparent), color-mix(in srgb, ${accent} 8%, transparent) 65%, transparent)`, boxShadow: `0 0 30px color-mix(in srgb, ${accent} 24%, transparent)` }}
            animate={reduce ? undefined : { scale: [0.92, 1.08, 0.92], opacity: [0.72, 1, 0.72] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
          <Bot size={20} style={{ color: 'var(--text-primary)', zIndex: 1, filter: `drop-shadow(0 0 8px ${accent})` }} />
          <span className="absolute right-2 top-3 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 12px ${accent}` }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--accent-primary)' }}>
            <Activity size={12} /> Centre de contrôle
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{aiName} Core</h2>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
            {status}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border-base)', background: 'color-mix(in srgb, var(--bg-panel) 80%, transparent)' }}>
            <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
            <div className="font-mono text-lg font-semibold leading-tight" style={{ color: stat.value ? stat.color : 'var(--text-primary)' }}>{stat.value}</div>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border p-2.5" style={{ borderColor: current ? 'var(--accent-primary)' : 'var(--border-base)', background: 'color-mix(in srgb, var(--bg-panel) 80%, transparent)', transition: 'border-color .4s' }}>
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {current ? <Loader2 size={10} className={reduce ? undefined : 'animate-spin'} style={{ color: 'var(--accent-primary)' }}/> : <Clock3 size={10}/>} En ce moment
        </div>
        <div className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }} title={current?.title}>{current ? current.title : isBusy ? 'Leanna réfléchit…' : 'Aucune exécution en cours'}</div>
        {current && <div className="truncate text-[10px]" style={{ color: 'var(--accent-primary)' }}>{current.agentName}{current.progress?.label ? ` · ${current.progress.label}` : ''}</div>}
        <ul className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'var(--border-base)' }} aria-label="Dernières actions des outils">
          {recentSteps.length ? recentSteps.map(step => (
            <li key={step.id} className="flex items-center gap-1.5 text-[10px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: step.status === 'error' ? 'var(--color-error)' : step.status === 'running' ? 'var(--accent-primary)' : 'var(--color-success, #22c55e)' }}/>
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{step.label}</span>
            </li>
          )) : <li className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Les appels d'outils s'afficheront ici.</li>}
        </ul>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="text-right">
          <div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>SESSION LIVE</div>
          <div className="text-sm font-semibold" style={{ color: connected ? 'var(--color-success, #22c55e)' : 'var(--text-primary)' }}>{connected ? 'ACTIVE' : connecting ? 'CONNECTING' : 'IDLE'}</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: connected ? 'var(--color-success, #22c55e)' : 'var(--border-base)', backgroundColor: connected ? 'color-mix(in srgb, var(--color-success, #22c55e) 10%, var(--bg-panel))' : 'var(--bg-panel)', color: connected ? 'var(--color-success, #22c55e)' : 'var(--text-muted)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }} />
          {connecting ? 'Connexion…' : connected ? 'Session active' : 'Session hors ligne'}
        </div>
      </div>
      </div>
      <div className="min-w-0"><DashboardAgentNetwork activity={activity} reasoningActive={reasoningActive} isBusy={isBusy} /></div>
    </section>
  );
});

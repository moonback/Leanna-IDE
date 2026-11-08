import React, { useEffect, useState, useSyncExternalStore } from 'react';
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

function fmtMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  return sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')}`;
}

/** Durée écoulée, rafraîchie chaque seconde sans re-rendre tout le panneau. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  return <>{fmtMs(now - since)}</>;
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
  const recentSteps = activity.slice(-5).reverse();
  const running = tasks.filter(task => task.status === 'running').length;
  const completed = tasks.filter(task => task.status === 'completed');
  const failed = tasks.filter(task => task.status === 'failed' || task.status === 'incomplete').length;
  const successRate = completed.length + failed ? Math.round((completed.length / (completed.length + failed)) * 100) : null;
  const durations = completed.map(task => task.durationMs).filter((ms): ms is number => typeof ms === 'number');
  const avgTask = durations.length ? fmtMs(durations.reduce((x, y) => x + y, 0) / durations.length) : '—';
  const otherRunning = Math.max(0, running - 1);
  const currentPct = current?.progress?.total ? Math.round((current.progress.current / current.progress.total) * 100) : null;
  const toolsDone = activity.filter(step => step.status === 'done').length;
  const toolsFailed = activity.filter(step => step.status === 'error').length;
  const toolDurations = activity.filter(step => step.endTimestamp).map(step => step.endTimestamp!.getTime() - step.timestamp.getTime());
  const avgTool = toolDurations.length ? fmtMs(toolDurations.reduce((x, y) => x + y, 0) / toolDurations.length) : '';
  const stats = [
    { label: 'En cours', value: running, color: 'var(--accent-primary)', hint: "Missions d'agents en cours d'exécution" },
    { label: 'Terminées', value: completed.length, color: 'var(--color-success, #22c55e)', hint: 'Missions terminées avec succès' },
    { label: 'Échecs', value: failed, color: 'var(--color-error, #ef4444)', hint: 'Missions échouées ou incomplètes' },
    { label: 'Outils', value: activity.length, color: 'var(--accent-primary)', hint: "Appels d'outils de la session Live" },
  ];

  return (
    <section
      className="relative mb-2 grid min-h-0 grid-cols-1 items-stretch gap-3 xl:mb-0 xl:h-full xl:grid-rows-[minmax(0,1fr)] overflow-hidden rounded-xl border p-2.5 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,2fr)] lg:gap-4 lg:px-4"
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
      <div className="relative z-10 flex min-w-0 flex-col gap-2 self-stretch">
      {/* En-tête compact : orbe, nom, état de connexion et pastille de session sur une ligne. */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center" style={{ perspective: '600px' }}>
          <motion.div className="absolute inset-0 rounded-full border"
            style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 55%, transparent)', boxShadow: '0 0 16px color-mix(in srgb, var(--accent-primary) 18%, transparent)' }}
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} />
          <motion.div className="absolute inset-1.5 rounded-full border border-dashed"
            style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 38%, transparent)' }}
            animate={reduce ? undefined : { rotate: -360 }}
            transition={{ duration: 32, repeat: Infinity, ease: 'linear' }} />
          <motion.div className="absolute inset-3 rounded-full"
            style={{ background: `radial-gradient(circle, color-mix(in srgb, ${accent} 35%, transparent), transparent 70%)` }}
            animate={reduce ? undefined : { scale: [0.92, 1.08, 0.92], opacity: [0.72, 1, 0.72] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
          <Bot size={16} style={{ color: 'var(--text-primary)', zIndex: 1, filter: `drop-shadow(0 0 6px ${accent})` }} />
          <span className="absolute right-0.5 top-1 h-2 w-2 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--accent-primary)' }}>
            <Activity size={10} /> Centre de contrôle
          </div>
          <h2 className="truncate text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{aiName} Core</h2>
          <div className="truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>{status}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[9px] font-semibold"
          title={connecting ? 'Connexion…' : connected ? 'Session active' : 'Session hors ligne'}
          style={{ borderColor: connected ? 'var(--color-success, #22c55e)' : 'var(--border-base)', color: connected ? 'var(--color-success, #22c55e)' : 'var(--text-muted)',
            backgroundColor: connected ? 'color-mix(in srgb, var(--color-success, #22c55e) 10%, var(--bg-panel))' : 'var(--bg-panel)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}` }} />
          {connected ? 'LIVE' : connecting ? 'CONNEXION' : 'IDLE'}
        </span>
      </div>

      {/* Compteurs sur une ligne + taux de réussite et durée moyenne. */}
      <div className="rounded-lg border p-1.5" style={{ borderColor: 'var(--border-base)', background: 'color-mix(in srgb, var(--bg-panel) 80%, transparent)' }}>
        <div className="grid grid-cols-4">
          {stats.map((stat, k) => (
            <div key={stat.label} className="min-w-0 px-1 text-center" style={{ borderLeft: k ? '1px solid var(--border-base)' : undefined }} title={stat.hint}>
              <div className="font-mono text-base font-semibold leading-tight tabular-nums" style={{ color: stat.value ? stat.color : 'var(--text-primary)' }}>{stat.value}</div>
              <div className="truncate text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-2 px-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
          <span className="shrink-0">Réussite</span>
          <span className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border-base)' }}>
            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${successRate ?? 0}%`, background: successRate !== null && successRate < 70 ? 'var(--color-warning, #f59e0b)' : 'var(--color-success, #22c55e)' }}/>
          </span>
          <span className="shrink-0 font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>{successRate === null ? '—' : `${successRate} %`}</span>
          <span className="shrink-0 font-mono tabular-nums" title="Durée moyenne des missions terminées">⌀ {avgTask}</span>
        </div>
      </div>

      {/* Exécution en cours, détaillée. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border p-2" style={{ borderColor: current ? 'var(--accent-primary)' : 'var(--border-base)', background: 'color-mix(in srgb, var(--bg-panel) 80%, transparent)', transition: 'border-color .4s' }}>
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {current ? <Loader2 size={10} className={reduce ? undefined : 'animate-spin'} style={{ color: 'var(--accent-primary)' }}/> : <Clock3 size={10}/>} En ce moment
          {current && <span className="ml-auto font-mono normal-case tracking-normal" style={{ color: 'var(--accent-primary)' }}><Elapsed since={current.timestamp}/></span>}
        </div>
        {current ? <>
          <div className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }} title={current.title}>{current.title}</div>
          <div className="flex items-center gap-1 truncate text-[10px]" style={{ color: 'var(--accent-primary)' }}>
            {current.agentName}{current.progress?.label ? <span style={{ color: 'var(--text-muted)' }}>· {current.progress.label}</span> : null}
            {otherRunning > 0 && <span className="ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>+{otherRunning} autre{otherRunning > 1 ? 's' : ''}</span>}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: 'var(--border-base)' }}>
            {currentPct === null
              ? <motion.span className="block h-full w-1/3 rounded-full" style={{ background: 'var(--accent-primary)' }} animate={reduce ? undefined : { x: ['-100%', '300%'] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}/>
              : <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${currentPct}%`, background: 'var(--accent-primary)' }}/>}
          </div>
        </> : <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{isBusy ? `${aiName} réfléchit…` : 'Aucune exécution en cours'}</div>}

        <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 text-[9px] uppercase tracking-wider" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
          <span>Derniers outils</span>
          <span className="font-mono normal-case tracking-normal">{toolsDone} ✓ · <span style={{ color: toolsFailed ? 'var(--color-error)' : undefined }}>{toolsFailed} ✗</span>{avgTool ? ` · ⌀ ${avgTool}` : ''}</span>
        </div>
        <ul className="mt-1 min-h-0 space-y-0.5 overflow-hidden" aria-label="Dernières actions des outils">
          {recentSteps.length ? recentSteps.map(step => (
            <li key={step.id} className="flex items-center gap-1.5 text-[10px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: step.status === 'error' ? 'var(--color-error)' : step.status === 'running' ? 'var(--accent-primary)' : 'var(--color-success, #22c55e)' }}/>
              <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-secondary)' }} title={step.detail ?? step.label}>{step.label}</span>
              <span className="shrink-0 font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
                {step.endTimestamp ? fmtMs(step.endTimestamp.getTime() - step.timestamp.getTime()) : step.status === 'running' ? '…' : ''}
              </span>
            </li>
          )) : <li className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Les appels d'outils s'afficheront ici.</li>}
        </ul>
      </div>
      </div>
      <div className="min-h-0 min-w-0"><DashboardAgentNetwork activity={activity} reasoningActive={reasoningActive} isBusy={isBusy} /></div>
    </section>
  );
});

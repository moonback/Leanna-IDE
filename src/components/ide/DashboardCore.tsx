import React from 'react';
import { Activity, Bot } from 'lucide-react';
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

  return (
    <section
      className="relative mb-2 grid min-h-0 grid-cols-1 items-center gap-3 overflow-hidden rounded-xl border p-2.5 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,2fr)] lg:gap-4 lg:px-4"
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
      <div className="relative z-10 flex min-w-0 items-center gap-3">
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
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-3 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:items-end">
        <div className="text-right">
          <div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>SESSION LIVE</div>
          <div className="text-sm font-semibold" style={{ color: connected ? 'var(--color-success, #22c55e)' : 'var(--text-primary)' }}>{connected ? 'ACTIVE' : connecting ? 'CONNECTING' : 'IDLE'}</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: connected ? 'var(--color-success, #22c55e)' : 'var(--border-base)', backgroundColor: connected ? 'color-mix(in srgb, var(--color-success, #22c55e) 10%, var(--bg-panel))' : 'var(--bg-panel)', color: connected ? 'var(--color-success, #22c55e)' : 'var(--text-muted)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }} />
          {connecting ? 'Connexion…' : connected ? 'Session active' : 'Session hors ligne'}
        </div>
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-2"><DashboardAgentNetwork activity={activity} reasoningActive={reasoningActive} isBusy={isBusy} /></div>
    </section>
  );
});

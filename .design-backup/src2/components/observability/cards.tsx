import React from 'react';
import { motion } from 'motion/react';
import { fmt, fmtCost } from './format.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Petites briques d'affichage réutilisées par le tableau de bord d'observabilité.
// ═══════════════════════════════════════════════════════════════════════════════

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: accent ? 'var(--accent-secondary)' : 'var(--border-base)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: 'var(--accent-subtle)' }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: 'var(--accent-secondary)' }} />
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export function BarRow({
  label,
  tokens,
  cost,
  calls,
  maxCost,
}: {
  label: string;
  tokens: number;
  cost: number;
  calls: number;
  maxCost: number;
}) {
  const pct = maxCost > 0 ? Math.round((cost / maxCost) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        <div className="flex items-center gap-3 shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
          <span>{fmt(tokens)} tokens</span>
          <span className="font-medium" style={{ color: 'var(--accent-secondary)' }}>
            {fmtCost(cost)}
          </span>
          <span>{calls} appels</span>
        </div>
      </div>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: 'var(--accent-secondary)' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// Indicateur « label → valeur » pour les métriques runtime.
export function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-lg font-bold tabular-nums" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

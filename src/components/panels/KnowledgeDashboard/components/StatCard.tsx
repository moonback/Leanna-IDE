// ═══════════════════════════════════════════════════════════════════════════════
// StatCard — Carte statistique réutilisable
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  progress?: number;
  progressLabel?: string;
}

export function StatCard({ label, value, sub, icon, color, progress, progressLabel }: StatCardProps) {
  return (
    <div
      className="rounded-2xl p-3.5 flex flex-col gap-2"
      style={{
        backgroundColor: `${color}0B`,
        border: `1px solid ${color}22`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${color}1A`, color }}
          >
            {icon}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {label}
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
        {sub && <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{sub}</span>}
      </div>
      {typeof progress === 'number' && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: `${color}15` }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%`, backgroundColor: color }}
            />
          </div>
          {progressLabel && (
            <div className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {progressLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
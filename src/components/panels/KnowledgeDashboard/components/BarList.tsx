// ═══════════════════════════════════════════════════════════════════════════════
// BarList — Liste à barres réutilisable (extensions, types, tags, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';

interface BarListItem {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
}

interface BarListProps {
  items: BarListItem[];
  color: string;
  maxItems?: number;
  emptyMessage?: string;
}

export function BarList({ items, color, maxItems = 10, emptyMessage = 'Aucune donnée disponible' }: BarListProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = sorted[0]?.value || 1;

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {sorted.map((it, i) => (
        <li key={i} className="space-y-1">
          <div className="flex items-center justify-between text-[10.5px] gap-2">
            <span
              className="font-mono truncate"
              style={{ color: 'var(--text-primary)', maxWidth: '70%' }}
              title={it.label}
            >
              {it.label}
            </span>
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>
              {it.value}
              {it.suffix && <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{it.suffix}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${color}12` }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(it.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          {it.hint && (
            <div className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{it.hint}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
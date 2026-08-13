// ═══════════════════════════════════════════════════════════════════════════════
// FactList — Liste de faits mémoire réutilisable
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { TrendingUp, Clock, Database, FileCode } from 'lucide-react';
import type { ProjectFact } from '../types';
import { CATEGORY_META } from '../types';

interface FactListProps {
  items: ProjectFact[];
  showUsage?: boolean;
  showUpdatedAt?: boolean;
  emptyMessage?: string;
}

export function FactList({ items, showUsage, showUpdatedAt, emptyMessage = 'Aucun fait encore enregistré — lance une mission ou active l\'auto-extraction.' }: FactListProps) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] py-6 text-center" style={{ color: 'var(--text-dimmed)' }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map(f => {
        const meta = CATEGORY_META[f.category] ?? { label: f.category, color: '#94a3b8', icon: <Database size={10} /> };
        return (
          <li
            key={f.id}
            className="p-2.5 rounded-xl space-y-1.5"
            style={{ backgroundColor: 'var(--bg-panel-alt)', border: '1px solid var(--border-base)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
              >
                {meta.icon} {meta.label}
              </span>
              <div className="flex items-center gap-2 text-[9.5px]" style={{ color: 'var(--text-muted)' }}>
                {showUsage && (
                  <span title="Nombre d'utilisations">
                    <TrendingUp size={9} className="inline mr-1" /> {f.usageCount}
                  </span>
                )}
                {showUpdatedAt && <span>il y a {formatRelativeTime(f.updatedAt)}</span>}
                <span>conf {Math.round(f.confidence * 100)}%</span>
              </div>
            </div>
            <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {f.content.length > 280 ? `${f.content.slice(0, 277)}…` : f.content}
            </p>
            {(f.tags.length > 0 || f.sourceFile) && (
              <div className="flex flex-wrap items-center gap-1.5 text-[9.5px]">
                {f.sourceFile && (
                  <span className="font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-panel)', color: 'var(--text-dimmed)' }}>
                    {f.sourceFile}
                  </span>
                )}
                {[...new Set(f.tags)].slice(0, 5).map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22d3ee10', color: '#22d3ee' }}>
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const j = Math.floor(h / 24);
  return `${j}j`;
}
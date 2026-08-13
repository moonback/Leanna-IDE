// ═══════════════════════════════════════════════════════════════════════════════
// CycleList — Liste de cycles de dépendance réutilisable
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import type { DependencyCycle } from '../types';

interface CycleListProps {
  cycles: DependencyCycle[];
  cycleCount: number;
  maxDisplay?: number;
}

export function CycleList({ cycles, cycleCount, maxDisplay = 5 }: CycleListProps) {
  if (cycleCount === 0) {
    return (
      <div className="text-[11px] py-8 flex items-center justify-center gap-2" style={{ color: '#4ade80' }}>
        <CheckCircle size={14} /> Aucun cycle détecté — architecture saine
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {cycles.slice(0, maxDisplay).map((c, i) => (
        <li
          key={i}
          className="p-2 rounded-lg text-[10.5px]"
          style={{ backgroundColor: '#f871710C', border: '1px solid #f8717122' }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold" style={{ color: '#f87171' }}>Cycle #{i + 1}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {c.length} fichiers
            </span>
          </div>
          <div className="font-mono text-[9.5px] leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>
            {c.files.join('  →  ')}
          </div>
        </li>
      ))}
      {cycles.length > maxDisplay && (
        <li className="text-[10px] text-center py-2" style={{ color: 'var(--text-muted)' }}>
          +{cycles.length - maxDisplay} cycles supplémentaires
        </li>
      )}
    </ul>
  );
}
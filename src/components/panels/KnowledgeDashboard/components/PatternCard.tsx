// ═══════════════════════════════════════════════════════════════════════════════
// PatternCard — Carte de pattern appris réutilisable
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import type { DetectedPattern } from '../types';
import { PATTERN_META } from '../types';

interface PatternCardProps {
  pattern: DetectedPattern;
}

export function PatternCard({ pattern }: PatternCardProps) {
  const meta = PATTERN_META[pattern.type] ?? { label: pattern.type, color: '#818cf8' };

  return (
    <li
      className="p-2.5 rounded-xl space-y-1.5"
      style={{
        backgroundColor: `${meta.color}0A`,
        border: `1px solid ${meta.color}25`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase"
            style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
          >
            {pattern.isRecurring ? '🔁 Récurrent' : 'Pattern'}
          </span>
          {pattern.relatedFiles.slice(0, 2).map(rf => (
            <span key={rf} className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-panel)', color: 'var(--text-dimmed)' }}>
              {rf}
            </span>
          ))}
          {pattern.relatedFiles.length > 2 && (
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              +{pattern.relatedFiles.length - 2}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] font-semibold" style={{ color: meta.color }}>
          <span>×{pattern.occurrenceCount}</span>
          {pattern.growthPct > 0 && (
            <span style={{ color: pattern.growthPct > 0 ? '#f87171' : '#4ade80' }}>
              {pattern.growthPct > 0 ? '↑' : '↓'} {Math.abs(Math.round(pattern.growthPct * 100))}%
            </span>
          )}
        </div>
      </div>
      <p className="font-mono text-[10.5px] break-words leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        {pattern.signature.length > 220 ? `${pattern.signature.slice(0, 217)}…` : pattern.signature}
      </p>
    </li>
  );
}
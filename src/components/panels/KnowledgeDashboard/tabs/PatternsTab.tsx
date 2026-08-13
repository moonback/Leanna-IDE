// ═══════════════════════════════════════════════════════════════════════════════
// PatternsTab — Patterns appris par le LearningEngine
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { AlertTriangle, CheckCircle, Sparkles, Brain, Lightbulb } from 'lucide-react';
import { Panel } from '../../../../ui/Panel';
import { StatCard } from '../components/StatCard';
import { PatternCard } from '../components/PatternCard';
import type { DashboardPayload } from '../types';
import { PATTERN_META } from '../types';

interface PatternsTabProps {
  data: DashboardPayload;
}

export function PatternsTab({ data }: PatternsTabProps) {
  const { patterns } = data;
  const sections: { key: keyof typeof patterns; icon: React.ReactNode }[] = [
    { key: 'errorPatterns', icon: <AlertTriangle size={12} /> },
    { key: 'successPatterns', icon: <CheckCircle size={12} /> },
    { key: 'optimizations', icon: <Sparkles size={12} /> },
    { key: 'decisions', icon: <Brain size={12} /> },
  ];

  const total =
    patterns.errorPatterns.length +
    patterns.successPatterns.length +
    patterns.optimizations.length +
    patterns.decisions.length;

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Erreurs" value={patterns.errorPatterns.length} sub="patterns récurrents" icon={<AlertTriangle size={12} />} color="#f87171" />
        <StatCard label="Succès" value={patterns.successPatterns.length} sub="patterns récurrents" icon={<CheckCircle size={12} />} color="#4ade80" />
        <StatCard label="Optimisations" value={patterns.optimizations.length} icon={<Sparkles size={12} />} color="#60a5fa" />
        <StatCard label="Décisions" value={patterns.decisions.length} icon={<Brain size={12} />} color="#f59e0b" />
      </div>

      {total === 0 && (
        <Panel title="Comment ça marche ?" icon={<Lightbulb size={12} />} className="!p-4">
          <ul className="space-y-2 text-[10.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            <li>1. Lance au moins une mission autonome — le LearningEngine analysera chaque action (succès, échec, décision).</li>
            <li>2. Quand <strong>plus de 3 occurrences</strong> d'un pattern similaire s'accumulent, il est marqué <em>récurrent</em>.</li>
            <li>3. Les patterns sont stockés dans ProjectMemory avec des tags <code>lesson:*</code>.</li>
            <li>4. Le ReasoningPipeline les injecte ensuite automatiquement dans le contexte des prochaines missions.</li>
          </ul>
        </Panel>
      )}

      {sections.map(s => {
        const items = patterns[s.key] as import('../types').DetectedPattern[];
        if (items.length === 0) return null;
        const typeKey = items[0].type;
        const meta = PATTERN_META[typeKey] ?? { label: s.key, color: '#818cf8' };
        return (
          <Panel key={s.key} title={`${meta.label} · ${items.length}`} icon={<Sparkles size={12} />} className="!p-3">
            <ul className="space-y-1.5">
              {items.map((p, i) => (
                <PatternCard key={i} pattern={p} />
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════
// MemoryTab — Mémoire projet
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { Database, Boxes, Target, Sparkles, TrendingUp, Clock, Layers } from 'lucide-react';
import { Panel } from '../../../ui/Panel';
import { StatCard } from '../components/StatCard';
import { FactList } from '../components/FactList';
import type { DashboardPayload } from '../types';
import { formatBytes, formatNumber, formatRelativeTime } from '../utils';
import { CATEGORY_META } from '../types';

interface MemoryTabProps {
  data: DashboardPayload;
}

export function MemoryTab({ data }: MemoryTabProps) {
  const { memory } = data;

  const catList = useMemo(() =>
    Object.entries(memory.factByCategory).map(([k, v]) => {
      const meta = CATEGORY_META[k] ?? { label: k, color: '#94a3b8', icon: <Database size={10} /> };
      return { label: meta.label, value: v, hint: k, color: meta.color, icon: meta.icon };
    }),
    [memory.factByCategory]
  );

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Faits totaux" value={formatNumber(memory.totalFacts)} icon={<Database size={14} />} color="#34d399" />
        <StatCard label="Catégories" value={Object.keys(memory.factByCategory).length} icon={<Boxes size={14} />} color="#818cf8" />
        <StatCard label="Tags uniques" value={memory.topTags.length} sub="Top 20 affichés" icon={<Target size={14} />} color="#22d3ee" />
      </div>

      <Panel title="Faits par catégorie" icon={<Layers size={12} />} className="!p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {catList.length === 0 ? (
            <p className="text-[11px] py-4 col-span-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
              Aucune catégorie enregistrée
            </p>
          ) : (
            catList.map(c => {
              const max = Math.max(...catList.map(x => x.value));
              return (
                <div
                  key={c.label}
                  className="p-2 rounded-xl flex items-center gap-2"
                  style={{ backgroundColor: `${c.color}0B`, border: `1px solid ${c.color}25` }}
                >
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                  >
                    {c.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.label}</span>
                      <span className="font-bold" style={{ color: c.color }}>{c.value}</span>
                    </div>
                    <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: `${c.color}15` }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(c.value / max) * 100}%`, backgroundColor: c.color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <Panel title={`Tags les plus utilisés · ${memory.topTags.length}`} icon={<Sparkles size={12} />} className="!p-3">
        <div className="flex flex-wrap gap-1.5">
          {memory.topTags.map(t => {
            const max = memory.topTags[0]?.count || 1;
            const intensity = 0.2 + 0.8 * (t.count / max);
            return (
              <span
                key={t.tag}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold"
                style={{
                  backgroundColor: `rgba(34,211,238,${0.08 + 0.08 * intensity})`,
                  border: `1px solid rgba(34,211,238,${0.15 + 0.2 * intensity})`,
                  color: '#22d3ee',
                }}
              >
                #{t.tag} <span className="opacity-60 ml-1">×{t.count}</span>
              </span>
            );
          })}
          {memory.topTags.length === 0 && (
            <p className="text-[11px] py-4 text-center w-full" style={{ color: 'var(--text-dimmed)' }}>
              Aucun tag enregistré
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Top 10 : faits les plus utilisés" icon={<TrendingUp size={12} />} className="!p-3">
        <FactList items={memory.topUsedFacts} showUsage />
      </Panel>

      <Panel title="Derniers faits ajoutés" icon={<Clock size={12} />} className="!p-3">
        <FactList items={memory.recentFacts} showUpdatedAt />
      </Panel>
    </div>
  );
}
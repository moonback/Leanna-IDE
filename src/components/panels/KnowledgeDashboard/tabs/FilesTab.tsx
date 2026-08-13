// ═══════════════════════════════════════════════════════════════════════════════
// FilesTab — Fichiers & Couplage
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { FileCode, GitBranch, Network, Layers } from 'lucide-react';
import { Panel } from '../../../ui/Panel';
import { StatCard } from '../components/StatCard';
import { BarList } from '../components/BarList';
import type { DashboardPayload } from '../types';
import { formatBytes, formatNumber } from '../utils';

interface FilesTabProps {
  data: DashboardPayload;
}

export function FilesTab({ data }: FilesTabProps) {
  const { graph } = data;

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Taille moyenne" value={formatBytes(graph.averageFileSize)} icon={<FileCode size={14} />} color="#60a5fa" />
        <StatCard label="Fichiers / Couplage" value={graph.couplingRanking.length} sub="top 15 analysés" icon={<GitBranch size={14} />} color="#818cf8" />
      </div>

      <Panel title="Top 10 : plus gros fichiers (lignes)" icon={<FileCode size={12} />} className="!p-3">
        <BarList
          items={graph.topLargest.map(f => ({
            label: f.path,
            value: f.lines,
            suffix: 'lignes',
            hint: `${formatBytes(f.size)} · ${f.entities} entités`,
          }))}
          color="#60a5fa"
          maxItems={10}
        />
      </Panel>

      <Panel title="Top 10 : densité d'entités" icon={<Layers size={12} />} className="!p-3">
        <BarList
          items={graph.topEntityDense.map(f => ({
            label: f.path,
            value: f.entities,
            suffix: 'entités',
            hint: `${f.lines} lignes · densité ${(f.entities / Math.max(1, f.lines) * 100).toFixed(1)}%`,
          }))}
          color="#a78bfa"
          maxItems={10}
        />
      </Panel>

      <Panel title="Top 15 : couplage (dépendances + dépendants)" icon={<Network size={12} />} className="!p-3">
        <div className="space-y-1.5">
          {graph.couplingRanking.map((f, i) => (
            <div
              key={i}
              className="p-2 rounded-xl flex items-center justify-between gap-2"
              style={{ backgroundColor: 'var(--bg-panel-alt)', border: '1px solid var(--border-base)' }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10.5px] truncate" style={{ color: 'var(--text-primary)' }} title={f.path}>
                  {f.path}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#60a5fa15', color: '#60a5fa' }}>
                    ← {f.dependencies} dépendances
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f59e0b15', color: '#f59e0b' }}>
                    → {f.dependents} dépendants
                  </span>
                </div>
              </div>
              <span className="text-[12px] font-bold flex-shrink-0" style={{ color: '#818cf8' }}>
                {f.totalEdges}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
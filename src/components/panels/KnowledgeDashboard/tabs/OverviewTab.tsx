// ═══════════════════════════════════════════════════════════════════════════════
// OverviewTab — Vue globale du Knowledge System
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { Boxes, FileCode, Layers, Database, GitBranch, Network, Clock, CheckCircle } from 'lucide-react';
import { Panel } from '../../ui/Panel';
import { StatCard } from '../components/StatCard';
import { BarList } from '../components/BarList';
import type { DashboardPayload } from '../types';
import { formatNumber, formatBytes, formatRelativeTime } from '../utils';

interface OverviewTabProps {
  data: DashboardPayload;
}

export function OverviewTab({ data }: OverviewTabProps) {
  const { workspace, graph, memory, health } = data;

  const extList = useMemo(
    () => Object.entries(graph.filesByExtension).map(([k, v]) => ({ label: k, value: v })),
    [graph.filesByExtension]
  );
  const typeList = useMemo(
    () => Object.entries(graph.entitiesByType).map(([k, v]) => ({ label: k, value: v })),
    [graph.entitiesByType]
  );

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      {/* Workspace */}
      <Panel title="Workspace" icon={<Boxes size={12} />} className="!p-3">
        <div className="grid grid-cols-2 gap-2 text-[10.5px]">
          <div>
            <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Racine SELF
            </span>
            <p className="font-mono truncate mt-0.5" style={{ color: 'var(--text-primary)' }} title={workspace.selfRoot}>
              {workspace.selfRoot}
            </p>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Workspace actif
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: workspace.sandboxActive ? '#fb923c' : '#4ade80' }}
              />
              <span className="font-mono truncate" style={{ color: 'var(--text-primary)' }} title={workspace.activeWorkspace}>
                {workspace.activeWorkspace}
              </span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="Fichiers"
          value={formatNumber(graph.totalFiles)}
          sub={`${formatNumber(graph.totalLines)} lignes`}
          icon={<FileCode size={14} />}
          color="#60a5fa"
        />
        <StatCard
          label="Entités"
          value={formatNumber(graph.totalEntities)}
          sub={`${formatNumber(graph.totalExports)} exports · ${formatNumber(graph.totalImports)} imports`}
          icon={<Layers size={14} />}
          color="#a78bfa"
        />
        <StatCard
          label="Mémoire (faits)"
          value={formatNumber(memory.totalFacts)}
          sub={`${Object.keys(memory.factByCategory).length} catégories`}
          icon={<Database size={14} />}
          color="#34d399"
        />
        <StatCard
          label="Fraîcheur"
          value={`${Math.round(health.freshness * 100)}%`}
          sub={graph.lastIndexed ? `Il y a ${formatRelativeTime(graph.lastIndexed)}` : 'Jamais'}
          icon={<Clock size={14} />}
          color="#22d3ee"
          progress={health.freshness}
          progressLabel={health.initialized ? `${health.warnings.length} avertissement(s)` : 'KnowledgeGraph vide'}
        />
      </div>

      {/* Distribution extensions / types */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <Panel title="Fichiers par extension" icon={<FileCode size={12} />} className="!p-3">
          <BarList items={extList} color="#60a5fa" maxItems={8} />
        </Panel>
        <Panel title="Entités par type" icon={<Layers size={12} />} className="!p-3">
          <BarList items={typeList} color="#a78bfa" maxItems={8} />
        </Panel>
      </div>

      {/* Most Impacted + Cycles */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <Panel title={`Fichiers critiques (impactés) · ${graph.topImpacted.length}`} icon={<GitBranch size={12} />} className="!p-3">
          <BarList
            items={graph.topImpacted.map(f => ({
              label: f.path,
              value: f.impacted,
              suffix: 'dépendants',
            }))}
            color="#f59e0b"
            maxItems={5}
          />
        </Panel>
        <Panel title={`Cycles de dépendance · ${graph.cycleCount}`} icon={<Network size={12} />} className="!p-3">
          {graph.cycleCount === 0 ? (
            <div className="text-[11px] py-8 flex items-center justify-center gap-2" style={{ color: '#4ade80' }}>
              <CheckCircle size={14} /> Aucun cycle détecté — architecture saine
            </div>
          ) : (
            <ul className="space-y-1.5">
              {graph.cycles.slice(0, 5).map((c, i) => (
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
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function formatRelativeTime(dateStr: string): string {
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
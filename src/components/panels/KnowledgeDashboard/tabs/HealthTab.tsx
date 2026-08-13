// ═══════════════════════════════════════════════════════════════════════════════
// HealthTab — Santé du Knowledge System
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Gauge, Clock, FileCode, Layers, Network, Target, AlertTriangle, CheckCircle } from 'lucide-react';
import { Panel } from '../../../ui/Panel';
import { StatCard } from '../components/StatCard';
import type { DashboardPayload } from '../types';
import { formatRelativeTime } from '../utils';

interface HealthTabProps {
  data: DashboardPayload;
}

export function HealthTab({ data }: HealthTabProps) {
  const { health, graph } = data;

  const freshColor = health.freshness >= 0.8 ? '#4ade80' : health.freshness >= 0.5 ? '#fbbf24' : '#f87171';

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="Statut"
          value={health.initialized ? 'Initialisé' : 'Non initialisé'}
          sub={health.initialized ? 'KnowledgeGraph prêt' : 'Lance un reindex'}
          icon={<Gauge size={14} />}
          color={health.initialized ? '#4ade80' : '#f87171'}
        />
        <StatCard
          label="Fraîcheur globale"
          value={`${Math.round(health.freshness * 100)}%`}
          sub={graph.lastIndexed ? `Indexé il y a ${formatRelativeTime(graph.lastIndexed)}` : 'Jamais indexé'}
          icon={<Clock size={14} />}
          color={freshColor}
          progress={health.freshness}
        />
        <StatCard label="Fichiers" value={health.fileCount} sub="trackés par scanner" icon={<FileCode size={14} />} color="#60a5fa" />
        <StatCard label="Entités" value={health.entityCount} icon={<Layers size={14} />} color="#a78bfa" />
        <StatCard
          label="Cycles"
          value={health.cycleCount}
          sub={health.cycleCount === 0 ? 'aucun' : 'à auditer'}
          icon={<Network size={14} />}
          color={health.cycleCount === 0 ? '#4ade80' : '#f59e0b'}
        />
        <StatCard
          label="Modules critiques"
          value={health.criticalModuleCount}
          sub="à haut risque d'impact"
          icon={<Target size={14} />}
          color={health.criticalModuleCount === 0 ? '#4ade80' : '#f87171'}
        />
      </div>

      <Panel title={`Avertissements · ${health.warnings.length}`} icon={<AlertTriangle size={12} />} className="!p-3">
        {health.warnings.length === 0 ? (
          <div className="text-[11px] py-8 flex items-center justify-center gap-2" style={{ color: '#4ade80' }}>
            <CheckCircle size={16} /> Aucun avertissement — la base de connaissance est en bonne santé ✨
          </div>
        ) : (
          <ul className="space-y-1.5">
            {health.warnings.map((w, i) => (
              <li
                key={i}
                className="p-2.5 rounded-xl flex items-start gap-2 text-[10.5px]"
                style={{ backgroundColor: '#fbbf240C', border: '1px solid #fbbf2422' }}
              >
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
                <span style={{ color: 'var(--text-primary)' }}>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
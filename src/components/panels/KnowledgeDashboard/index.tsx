// ═══════════════════════════════════════════════════════════════════════════════
// KnowledgeDashboard — Orchestrateur principal (refactorisé)
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useState, useEffect } from 'react';
import { Brain, RefreshCw, Gauge, FileCode, Database, TrendingUp, Lightbulb, X, AlertTriangle } from 'lucide-react';
import { Panel } from '../../ui/Panel';
import { IconButton } from '../../ui/IconButton';
import { useKnowledgeDashboard } from './hooks/useKnowledgeDashboard';
import { useDashboardActions } from './hooks/useDashboardActions';
import { OverviewTab } from './tabs/OverviewTab';
import { FilesTab } from './tabs/FilesTab';
import { MemoryTab } from './tabs/MemoryTab';
import { HealthTab } from './tabs/HealthTab';
import { PatternsTab } from './tabs/PatternsTab';
import type { DashboardPayload, TabId } from './types';
import { formatRelativeTime } from './utils';

interface KnowledgeDashboardProps {
  inline?: boolean;
  onClose?: () => void;
}

export function KnowledgeDashboard({ inline = false, onClose }: KnowledgeDashboardProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { payload, loading, error, refresh, autoRefresh: isAutoRefresh, setAutoRefresh: toggleAutoRefresh, lastLoadedAt } =
    useKnowledgeDashboard({ autoRefreshInterval: 15_000, immediate: true });

  const actions = useDashboardActions();

  const handleReindex = useCallback(async () => {
    const result = await actions.reindex();
    if (result.success) {
      await refresh();
    }
  }, [actions, refresh]);

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Vue globale', icon: <Gauge size={11} /> },
    { id: 'files', label: 'Fichiers & Couplage', icon: <FileCode size={11} /> },
    { id: 'memory', label: 'Mémoire projet', icon: <Database size={11} /> },
    { id: 'health', label: 'Santé', icon: <TrendingUp size={11} /> },
    { id: 'patterns', label: 'Patterns appris', icon: <Lightbulb size={11} /> },
  ];

  const header = (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--border-base)',
        backgroundColor: 'var(--bg-panel-alt)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: '#818cf81A', color: '#818cf8' }}
        >
          <Brain size={14} />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            Knowledge System
          </span>
          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
            {payload
              ? `Généré il y a ${formatRelativeTime(payload.generatedAt)} · ${payload.workspace.sandboxActive ? 'Sandbox' : 'Workspace principal'}`
              : 'Chargement…'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          variant="default"
          icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
          onClick={refresh}
          tooltip="Rafraîchir"
          className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/40"
        />
        <label
          className="flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] cursor-pointer"
          style={{
            backgroundColor: isAutoRefresh ? '#22d3ee15' : 'transparent',
            border: `1px solid ${isAutoRefresh ? '#22d3ee33' : 'var(--border-base)'}`,
            color: isAutoRefresh ? '#22d3ee' : 'var(--text-muted)',
          }}
          title="Actualisation automatique toutes les 15s"
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: isAutoRefresh ? '#22d3ee' : 'var(--text-dimmed)' }}
          />
          Auto
          <input
            type="checkbox"
            className="hidden"
            checked={isAutoRefresh}
            onChange={e => toggleAutoRefresh(e.target.checked)}
          />
        </label>
        <IconButton
          variant="default"
          icon={<span className="text-[12px] leading-none" style={{ color: 'var(--text-dimmed)' }}>✕</span>}
          onClick={handleReindex}
          tooltip="Réindexer le Knowledge Graph"
          className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/40"
        />
        {onClose && (
          <IconButton
            variant="default"
            icon={<X size={12} />}
            onClick={onClose}
            tooltip="Fermer"
            className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/40"
          />
        )}
      </div>
    </div>
  );

  const tabsRow = (
    <div
      className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto custom-scrollbar"
      style={{
        borderBottom: '1px solid var(--border-base)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {TABS.map(t => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold whitespace-nowrap transition-colors"
            style={{
              backgroundColor: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-contrast)' : 'var(--text-muted)',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const content = (() => {
    if (loading) {
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3">
            <Brain size={24} className="animate-pulse" style={{ color: 'var(--text-dimmed)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Chargement des connaissances projet…
            </span>
          </div>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center p-8">
          <div
            className="p-4 rounded-2xl max-w-md"
            style={{ backgroundColor: '#f8717110', border: '1px solid #f8717133', color: '#f87171' }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold">Erreur de chargement</p>
                <p className="text-[10.5px] mt-1 opacity-90">{error.message}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (!payload) return null;

    switch (tab) {
      case 'overview':
        return <OverviewTab data={payload} />;
      case 'files':
        return <FilesTab data={payload} />;
      case 'memory':
        return <MemoryTab data={payload} />;
      case 'health':
        return <HealthTab data={payload} />;
      case 'patterns':
        return <PatternsTab data={payload} />;
    }
  })();

  return (
    <div
      className="flex flex-col w-full h-full min-h-0"
      style={{
        backgroundColor: inline ? 'transparent' : 'var(--bg-secondary)',
      }}
    >
      {header}
      {tabsRow}
      {content}
    </div>
  );
}
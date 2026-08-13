import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brain, RefreshCw, Database, FileCode, Network, Lightbulb,
  AlertTriangle, Gauge, Layers, Sparkles, TrendingUp, Clock,
  FileWarning, GitBranch, Target, Bot, Boxes, BarChart3,
  Link2, Trash2, Eye, Activity,
} from 'lucide-react';
import { Panel } from '../ui/Panel';
import { IconButton } from '../ui/IconButton';

// ═══════════════════════════════════════════════════════════════════════════════
// Types (miroir de la réponse GET /api/knowledge/dashboard)
// ═══════════════════════════════════════════════════════════════════════════════

interface DashboardWorkspace {
  selfRoot: string;
  activeWorkspace: string;
  sandboxActive: boolean;
}

interface DashboardGraph {
  lastIndexed: string;
  totalFiles: number;
  totalLines: number;
  totalEntities: number;
  totalExports: number;
  totalImports: number;
  averageFileSize: number;
  filesByExtension: Record<string, number>;
  entitiesByType: Record<string, number>;
  structuralEntities?: {
    routes: number;
    databaseTables: number;
    environmentVariables: number;
    tests: number;
    symbols: number;
  };
  relations?: {
    total: number;
    byType: Record<string, number>;
  };
  topLargest: { path: string; lines: number; size: number; entities: number }[];
  topEntityDense: { path: string; entities: number; lines: number }[];
  topImpacted: { path: string; impacted: number }[];
  couplingRanking: { path: string; dependencies: number; dependents: number; totalEdges: number }[];
  cycleCount: number;
  cycles: { files: string[]; length: number }[];
}

interface DashboardMemory {
  totalFacts: number;
  factByCategory: Record<string, number>;
  topTags: { tag: string; count: number }[];
  topUsedFacts: ProjectFact[];
  recentFacts: ProjectFact[];
}

type ProjectFactCategory =
  | 'architecture' | 'convention' | 'pattern' | 'decision'
  | 'known-bug' | 'api' | 'module' | 'workflow' | 'security'
  | 'stack' | 'refactoring' | 'todo';

interface ProjectFact {
  id: string;
  content: string;
  category: ProjectFactCategory;
  tags: string[];
  sourceFile?: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  usageCount: number;
}

interface KnowledgeHealth {
  initialized: boolean;
  fileCount: number;
  entityCount: number;
  exportCount: number;
  importCount: number;
  cycleCount: number;
  factCount: number;
  criticalModuleCount: number;
  freshness: number;
  lastIndexed?: string;
  warnings: string[];
}

interface DetectedPattern {
  type: 'error_pattern' | 'success_pattern' | 'optimization' | 'decision';
  signature: string;
  occurrenceCount: number;
  relatedFiles: string[];
  aggregatedImportance: number;
  growthPct: number;
  isRecurring: boolean;
}

interface DashboardPatterns {
  errorPatterns: DetectedPattern[];
  successPatterns: DetectedPattern[];
  optimizations: DetectedPattern[];
  decisions: DetectedPattern[];
}

interface DashboardPayload {
  generatedAt: string;
  workspace: DashboardWorkspace;
  graph: DashboardGraph;
  memory: DashboardMemory;
  health: KnowledgeHealth;
  patterns: DashboardPatterns;
}

// ─── Types Relations & Watcher ──────────────────────────────────────────────

interface EntityRelation {
  source: { name: string; filePath: string; type: string };
  target: { name: string; filePath: string; type: string };
  relationType:
    | 'extends' | 'implements' | 'uses' | 'tests' | 'configures' | 'composes' | 'depends_on'
    | 'calls' | 'serves' | 'reads_env' | 'writes_table' | 'reads_table' | 'tested_by';
  confidence: number;
  sourceLine?: number;
}

type TabId = 'overview' | 'files' | 'memory' | 'health' | 'patterns' | 'relations';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeTime(dateStr: string): string {
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

const CATEGORY_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  architecture: { label: 'Architecture', color: '#818cf8', icon: <Boxes size={10} /> },
  convention:   { label: 'Conventions',  color: '#22d3ee', icon: <Target size={10} /> },
  pattern:      { label: 'Patterns',     color: '#34d399', icon: <Sparkles size={10} /> },
  decision:     { label: 'Décisions',    color: '#f59e0b', icon: <Brain size={10} /> },
  'known-bug':  { label: 'Bugs connus',  color: '#f87171', icon: <AlertTriangle size={10} /> },
  api:          { label: 'API',          color: '#60a5fa', icon: <Network size={10} /> },
  module:       { label: 'Modules',      color: '#a78bfa', icon: <Layers size={10} /> },
  workflow:     { label: 'Workflows',    color: '#fbbf24', icon: <GitBranch size={10} /> },
  security:     { label: 'Sécurité',     color: '#ef4444', icon: <FileWarning size={10} /> },
  stack:        { label: 'Stack',        color: '#0ea5e9', icon: <Layers size={10} /> },
  refactoring:  { label: 'Refactorings', color: '#fb923c', icon: <BarChart3 size={10} /> },
  todo:         { label: 'TODO',         color: '#94a3b8', icon: <Target size={10} /> },
};

const PATTERN_META: Record<string, { label: string; color: string }> = {
  error_pattern:   { label: 'Patterns d\'erreurs', color: '#f87171' },
  success_pattern: { label: 'Patterns de succès',  color: '#4ade80' },
  optimization:    { label: 'Optimisations',       color: '#60a5fa' },
  decision:        { label: 'Décisions',           color: '#f59e0b' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Sous-composants légers
// ═══════════════════════════════════════════════════════════════════════════════

function StatCard({
  label, value, sub, icon, color, progress, progressLabel,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  progress?: number;
  progressLabel?: string;
}) {
  return (
    <div
      className="rounded-2xl p-3.5 flex flex-col gap-2"
      style={{
        backgroundColor: `${color}0B`,
        border: `1px solid ${color}22`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${color}1A`, color }}
          >
            {icon}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {label}
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
        {sub && <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{sub}</span>}
      </div>
      {typeof progress === 'number' && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: `${color}15` }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%`, backgroundColor: color }}
            />
          </div>
          {progressLabel && (
            <div className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {progressLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BarList<T extends { label: string; value: number; suffix?: string; hint?: string }>({
  items, color, maxItems = 10,
}: {
  items: T[];
  color: string;
  maxItems?: number;
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = sorted[0]?.value || 1;
  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
        Aucune donnée disponible
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

// ═══════════════════════════════════════════════════════════════════════════════
// Onglets
// ═══════════════════════════════════════════════════════════════════════════════

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',  label: 'Vue globale', icon: <Gauge size={11} /> },
  { id: 'files',     label: 'Fichiers & Couplage', icon: <FileCode size={11} /> },
  { id: 'relations', label: 'Relations', icon: <Link2 size={11} /> },
  { id: 'memory',    label: 'Mémoire projet', icon: <Database size={11} /> },
  { id: 'health',    label: 'Santé', icon: <TrendingUp size={11} /> },
  { id: 'patterns',  label: 'Patterns appris', icon: <Lightbulb size={11} /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard principal
// ═══════════════════════════════════════════════════════════════════════════════

interface KnowledgeDashboardProps {
  inline?: boolean;
  onClose?: () => void;
}

export function KnowledgeDashboard({ inline = false, onClose }: KnowledgeDashboardProps) {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [watcherActive, setWatcherActive] = useState(false);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
      const res = await fetch('/api/knowledge/dashboard', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 'success') throw new Error(json.error || 'Erreur inconnue');
      setPayload(json as DashboardPayload);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger le dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger le statut du FileWatcher
  const loadWatcherStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
      const res = await fetch('/api/knowledge/watcher', { headers });
      if (res.ok) {
        const json = await res.json();
        setWatcherActive(json.watcher?.running ?? false);
      }
    } catch { /* silent */ }
  }, []);

  // Purger les faits bruyants
  const handlePurge = useCallback(async () => {
    setPurging(true);
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { 'x-jarvis-token': token } : {}),
      };
      await fetch('/api/knowledge/memory/purge', { method: 'POST', headers });
      await load();
    } catch { /* silent */ }
    finally { setPurging(false); }
  }, [load]);

  useEffect(() => {
    load();
    loadWatcherStatus();
  }, [load, loadWatcherStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const header = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0" style={{
      borderBottom: '1px solid var(--border-base)',
      backgroundColor: 'var(--bg-panel-alt)',
    }}>
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: '#818cf81A', color: '#818cf8' }}
        >
          <Brain size={14} />
        </span>
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              Knowledge System
            </span>
            {/* FileWatcher indicator */}
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold"
              style={{
                backgroundColor: watcherActive ? '#4ade800D' : '#f871710D',
                border: `1px solid ${watcherActive ? '#4ade8033' : '#f8717133'}`,
                color: watcherActive ? '#4ade80' : '#f87171',
              }}
              title={watcherActive ? 'FileWatcher actif — indexation automatique' : 'FileWatcher inactif'}
            >
              <Activity size={8} />
              {watcherActive ? 'Live' : 'Off'}
            </span>
          </div>
          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
            {payload
              ? `Généré il y a ${relativeTime(payload.generatedAt)} · ${payload.workspace.sandboxActive ? 'Sandbox' : 'Workspace principal'}`
              : 'Chargement…'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          variant="default"
          icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
          onClick={load}
          tooltip="Rafraîchir"
          className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/40"
        />
        <label
          className="flex items-center gap-1.5 px-2 h-7 rounded-lg text-[10px] cursor-pointer"
          style={{
            backgroundColor: autoRefresh ? '#22d3ee15' : 'transparent',
            border: `1px solid ${autoRefresh ? '#22d3ee33' : 'var(--border-base)'}`,
            color: autoRefresh ? '#22d3ee' : 'var(--text-muted)',
          }}
          title="Actualisation automatique toutes les 15s"
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: autoRefresh ? '#22d3ee' : 'var(--text-dimmed)' }}
          />
          Auto
          <input
            type="checkbox"
            className="hidden"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
        </label>
        {onClose && (
          <IconButton
            variant="default"
            icon={<span className="text-[12px] leading-none" style={{ color: 'var(--text-dimmed)' }}>✕</span>}
            onClick={onClose}
            tooltip="Fermer"
            className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/40"
          />
        )}
      </div>
    </div>
  );

  const tabsRow = (
    <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto custom-scrollbar" style={{
      borderBottom: '1px solid var(--border-base)',
      backgroundColor: 'var(--bg-secondary)',
    }}>
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
            <Bot size={24} className="animate-pulse" style={{ color: 'var(--text-dimmed)' }} />
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
                <p className="text-[10.5px] mt-1 opacity-90">{error}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (!payload) return null;

    switch (tab) {
      case 'overview': return <OverviewTab data={payload} />;
      case 'files':    return <FilesTab data={payload} />;
      case 'relations': return <RelationsTab summary={payload.graph.relations} refreshKey={payload.generatedAt} />;
      case 'memory':   return <MemoryTab data={payload} purging={purging} onPurge={handlePurge} />;
      case 'health':   return <HealthTab data={payload} watcherActive={watcherActive} />;
      case 'patterns': return <PatternsTab data={payload} />;
    }
  })();

  return (
    <div className="flex flex-col w-full h-full min-h-0" style={{
      backgroundColor: inline ? 'transparent' : 'var(--bg-secondary)',
    }}>
      {header}
      {tabsRow}
      {content}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Contenus des onglets
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ data }: { data: DashboardPayload }) {
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
      <Panel
        title="Workspace"
        icon={<Boxes size={12} />}
        className="!p-3"
      >
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
          sub={graph.lastIndexed ? `Il y a ${relativeTime(graph.lastIndexed)}` : 'Jamais'}
          icon={<Clock size={14} />}
          color="#22d3ee"
          progress={health.freshness}
          progressLabel={health.initialized ? `${health.warnings.length} avertissement(s)` : 'KnowledgeGraph vide'}
        />
      </div>

      {/* Structure extraite */}
      <Panel title="Mémoire structurelle détectée" icon={<Network size={12} />} className="!p-3">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          {[
            { label: 'Routes API', value: graph.structuralEntities?.routes ?? 0, icon: <Network size={12} />, color: '#60a5fa' },
            { label: 'Tables DB', value: graph.structuralEntities?.databaseTables ?? 0, icon: <Database size={12} />, color: '#f59e0b' },
            { label: 'Variables env.', value: graph.structuralEntities?.environmentVariables ?? 0, icon: <Activity size={12} />, color: '#22d3ee' },
            { label: 'Tests', value: graph.structuralEntities?.tests ?? 0, icon: <Eye size={12} />, color: '#34d399' },
            { label: 'Symboles', value: graph.structuralEntities?.symbols ?? 0, icon: <Link2 size={12} />, color: '#a78bfa' },
          ].map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </div>
        <p className="mt-2 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
          Occurrences détectées dans le code indexé ; les valeurs sensibles ne sont jamais stockées.
        </p>
      </Panel>

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
        <Panel
          title={`Fichiers critiques (impactés) · ${graph.topImpacted.length}`}
          icon={<GitBranch size={12} />}
          className="!p-3"
        >
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
        <Panel
          title={`Cycles de dépendance · ${graph.cycleCount}`}
          icon={<Network size={12} />}
          className="!p-3"
        >
          {graph.cycleCount === 0 ? (
            <div className="text-[11px] flex items-center gap-2 py-6" style={{ color: '#4ade80' }}>
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

function CheckCircle(props: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function FilesTab({ data }: { data: DashboardPayload }) {
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

function MemoryTab({ data, purging, onPurge }: { data: DashboardPayload; purging?: boolean; onPurge?: () => void }) {
  const { memory } = data;

  const catList = Object.entries(memory.factByCategory).map(([k, v]) => {
    const meta = CATEGORY_META[k] ?? { label: k, color: '#94a3b8' };
    return { label: meta.label, value: v, hint: k };
  });

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      {/* Header avec Purge */}
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-2.5 flex-1">
          <StatCard label="Faits totaux" value={formatNumber(memory.totalFacts)} icon={<Database size={14} />} color="#34d399" />
          <StatCard label="Catégories" value={Object.keys(memory.factByCategory).length} icon={<Boxes size={14} />} color="#818cf8" />
          <StatCard label="Tags uniques" value={memory.topTags.length} sub="Top 20 affichés" icon={<Target size={14} />} color="#22d3ee" />
        </div>
      </div>

      {/* Purge action */}
      {onPurge && (
        <div
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ backgroundColor: '#f871710A', border: '1px solid #f8717120' }}
        >
          <div className="flex items-center gap-2">
            <Trash2 size={12} style={{ color: '#f87171' }} />
            <div>
              <p className="text-[10.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Nettoyer les faits bruyants
              </p>
              <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                Supprime les faits auto-générés sans valeur (keyword-saliency, hot-module éphémères)
              </p>
            </div>
          </div>
          <button
            onClick={onPurge}
            disabled={purging}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: '#f8717115',
              border: '1px solid #f8717133',
              color: '#f87171',
            }}
          >
            {purging ? <RefreshCw size={10} className="animate-spin" /> : <Trash2 size={10} />}
            {purging ? 'Nettoyage…' : 'Purger'}
          </button>
        </div>
      )}

      <Panel title="Faits par catégorie" icon={<Layers size={12} />} className="!p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {catList.length === 0 ? (
            <p className="text-[11px] py-4 col-span-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
              Aucune catégorie enregistrée
            </p>
          ) : (
            catList.map(c => {
              const meta = CATEGORY_META[c.hint ?? ''];
              const max = Math.max(...catList.map(x => x.value));
              return (
                <div
                  key={c.label}
                  className="p-2 rounded-xl flex items-center gap-2"
                  style={{ backgroundColor: `${meta?.color ?? '#94a3b8'}0B`, border: `1px solid ${meta?.color ?? '#94a3b8'}25` }}
                >
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${meta?.color ?? '#94a3b8'}1A`, color: meta?.color ?? '#94a3b8' }}
                  >
                    {meta?.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.label}</span>
                      <span className="font-bold" style={{ color: meta?.color ?? '#94a3b8' }}>{c.value}</span>
                    </div>
                    <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: `${meta?.color ?? '#94a3b8'}15` }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(c.value / max) * 100}%`, backgroundColor: meta?.color ?? '#94a3b8' }}
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

function FactList({
  items, showUsage, showUpdatedAt,
}: {
  items: ProjectFact[];
  showUsage?: boolean;
  showUpdatedAt?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] py-6 text-center" style={{ color: 'var(--text-dimmed)' }}>
        Aucun fait encore enregistré — lance une mission ou active l'auto-extraction.
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
                {showUpdatedAt && (
                  <span>il y a {relativeTime(f.updatedAt)}</span>
                )}
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

function HealthTab({ data, watcherActive }: { data: DashboardPayload; watcherActive?: boolean }) {
  const { health, graph } = data;

  const freshColor =
    health.freshness >= 0.8 ? '#4ade80' :
    health.freshness >= 0.5 ? '#fbbf24' : '#f87171';

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      {/* FileWatcher status banner */}
      <div
        className="flex items-center gap-3 p-3 rounded-xl"
        style={{
          backgroundColor: watcherActive ? '#4ade800A' : '#f871710A',
          border: `1px solid ${watcherActive ? '#4ade8025' : '#f8717125'}`,
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: watcherActive ? '#4ade801A' : '#f871711A',
            color: watcherActive ? '#4ade80' : '#f87171',
          }}
        >
          <Activity size={14} />
        </div>
        <div className="flex-1">
          <p className="text-[10.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
            FileWatcher — Indexation incrémentale
          </p>
          <p className="text-[9.5px]" style={{ color: 'var(--text-muted)' }}>
            {watcherActive
              ? 'Actif — les modifications de fichiers sont automatiquement ré-indexées en temps réel'
              : 'Inactif — seul le reindex manuel met à jour le graphe de connaissances'}
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase"
          style={{
            backgroundColor: watcherActive ? '#4ade8015' : '#f8717115',
            color: watcherActive ? '#4ade80' : '#f87171',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: watcherActive ? '#4ade80' : '#f87171' }}
          />
          {watcherActive ? 'En ligne' : 'Hors ligne'}
        </span>
      </div>

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
          sub={graph.lastIndexed ? `Indexé il y a ${relativeTime(graph.lastIndexed)}` : 'Jamais indexé'}
          icon={<Clock size={14} />}
          color={freshColor}
          progress={health.freshness}
        />
        <StatCard label="Fichiers" value={health.fileCount} sub="trackés par scanner" icon={<FileCode size={14} />} color="#60a5fa" />
        <StatCard label="Entités" value={health.entityCount} icon={<Layers size={14} />} color="#a78bfa" />
        <StatCard label="Cycles" value={health.cycleCount} sub={health.cycleCount === 0 ? 'aucun' : 'à auditer'} icon={<Network size={14} />} color={health.cycleCount === 0 ? '#4ade80' : '#f59e0b'} />
        <StatCard label="Modules critiques" value={health.criticalModuleCount} sub="à haut risque d'impact" icon={<Target size={14} />} color={health.criticalModuleCount === 0 ? '#4ade80' : '#f87171'} />
      </div>

      <Panel
        title={`Avertissements · ${health.warnings.length}`}
        icon={<AlertTriangle size={12} />}
        className="!p-3"
      >
        {health.warnings.length === 0 ? (
          <div className="text-[11px] py-8 flex items-center justify-center gap-2" style={{ color: '#4ade80' }}>
            <CheckCircle size={16} />
            Aucun avertissement — la base de connaissance est en bonne santé ✨
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

function PatternsTab({ data }: { data: DashboardPayload }) {
  const { patterns } = data;
  const sections: { key: keyof DashboardPatterns }[] = [
    { key: 'errorPatterns' },
    { key: 'successPatterns' },
    { key: 'optimizations' },
    { key: 'decisions' },
  ];

  const total =
    patterns.errorPatterns.length + patterns.successPatterns.length +
    patterns.optimizations.length + patterns.decisions.length;

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
        const items = patterns[s.key] as DetectedPattern[];
        if (items.length === 0) return null;
        const typeKey = items[0].type;
        const meta = PATTERN_META[typeKey] ?? { label: s.key, color: '#818cf8' };
        return (
          <Panel key={s.key} title={`${meta.label} · ${items.length}`} icon={<Sparkles size={12} />} className="!p-3">
            <ul className="space-y-1.5">
              {items.map((p, i) => (
                <li
                  key={i}
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
                        {p.isRecurring ? '🔁 Récurrent' : 'Pattern'}
                      </span>
                      {p.relatedFiles.slice(0, 2).map(rf => (
                        <span key={rf} className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-panel)', color: 'var(--text-dimmed)' }}>
                          {rf}
                        </span>
                      ))}
                      {p.relatedFiles.length > 2 && (
                        <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>+{p.relatedFiles.length - 2}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[9.5px] font-semibold" style={{ color: meta.color }}>
                      <span>×{p.occurrenceCount}</span>
                      {p.growthPct > 0 && (
                        <span style={{ color: p.growthPct > 0 ? '#f87171' : '#4ade80' }}>
                          {p.growthPct > 0 ? '↑' : '↓'} {Math.abs(Math.round(p.growthPct * 100))}%
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="font-mono text-[10.5px] break-words leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {p.signature.length > 220 ? `${p.signature.slice(0, 217)}…` : p.signature}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Onglet Relations — Visualisation des relations sémantiques entre entités
// ═══════════════════════════════════════════════════════════════════════════════

const RELATION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  extends:     { label: 'Hérite de',     color: '#818cf8', icon: <Layers size={10} /> },
  implements:  { label: 'Implémente',    color: '#22d3ee', icon: <Target size={10} /> },
  uses:        { label: 'Utilise',       color: '#60a5fa', icon: <Link2 size={10} /> },
  tests:       { label: 'Teste',         color: '#34d399', icon: <Eye size={10} /> },
  configures:  { label: 'Configure',     color: '#f59e0b', icon: <BarChart3 size={10} /> },
  composes:    { label: 'Compose',       color: '#fb923c', icon: <Boxes size={10} /> },
  depends_on:  { label: 'Dépend de',          color: '#94a3b8', icon: <GitBranch size={10} /> },
  calls:       { label: 'Appelle',            color: '#c084fc', icon: <Link2 size={10} /> },
  serves:      { label: 'Expose',             color: '#60a5fa', icon: <Network size={10} /> },
  reads_env:   { label: 'Lit env.',           color: '#22d3ee', icon: <Activity size={10} /> },
  writes_table:{ label: 'Écrit table',        color: '#f87171', icon: <Database size={10} /> },
  reads_table: { label: 'Lit table',          color: '#f59e0b', icon: <Database size={10} /> },
  tested_by:   { label: 'Testé par',          color: '#34d399', icon: <Eye size={10} /> },
};

function RelationsTab({ summary, refreshKey }: {
  summary?: { total: number; byType: Record<string, number> };
  refreshKey: string;
}) {
  const [relations, setRelations] = useState<EntityRelation[]>([]);
  const [relationCount, setRelationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    const fetchRelations = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('jarvis_api_token');
        const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
        const params = new URLSearchParams();
        if (typeFilter !== 'all') params.set('type', typeFilter);
        const query = params.size > 0 ? `?${params.toString()}` : '';
        const res = await fetch(`/api/knowledge/relations${query}`, { headers });
        if (res.ok) {
          const json = await res.json();
          const nextRelations = json.relations ?? [];
          setRelations(nextRelations);
          setRelationCount(typeof json.count === 'number' ? json.count : nextRelations.length);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchRelations();
  }, [typeFilter, refreshKey]);

  const filtered = useMemo(() => {
    let result = relations;
    if (typeFilter !== 'all') {
      result = result.filter(r => r.relationType === typeFilter);
    }
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(r =>
        r.source.name.toLowerCase().includes(q) ||
        r.target.name.toLowerCase().includes(q) ||
        r.source.filePath.toLowerCase().includes(q) ||
        r.target.filePath.toLowerCase().includes(q)
      );
    }
    return result;
  }, [relations, filter, typeFilter]);

  // Le dashboard fournit les agrégats complets ; l'endpoint relations ne retourne
  // volontairement qu'un échantillon de 100 relations pour garder l'UI réactive.
  const observedByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of relations) {
      counts[r.relationType] = (counts[r.relationType] || 0) + 1;
    }
    return counts;
  }, [relations]);
  const byType = summary?.byType ?? observedByType;
  const totalRelations = summary?.total ?? relationCount;

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Link2 size={24} className="animate-pulse" style={{ color: 'var(--text-dimmed)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Chargement des relations…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Relations indexées"
          value={totalRelations}
          sub={`${relations.length} chargée(s)`}
          icon={<Link2 size={14} />}
          color="#818cf8"
        />
        <StatCard
          label="Types détectés"
          value={Object.keys(byType).length}
          sub={`/ 13 possibles`}
          icon={<Layers size={14} />}
          color="#22d3ee"
        />
        <StatCard
          label="Entités reliées"
          value={new Set([...relations.map(r => r.source.name), ...relations.map(r => r.target.name)]).size}
          icon={<Boxes size={14} />}
          color="#34d399"
        />
      </div>

      {/* Distribution par type */}
      <Panel title="Relations par type" icon={<Link2 size={12} />} className="!p-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTypeFilter('all')}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: typeFilter === 'all' ? '#818cf81A' : 'transparent',
              border: `1px solid ${typeFilter === 'all' ? '#818cf833' : 'var(--border-base)'}`,
              color: typeFilter === 'all' ? '#818cf8' : 'var(--text-muted)',
            }}
          >
            Tous ({totalRelations})
          </button>
          {Object.entries(byType).map(([type, count]) => {
            const meta = RELATION_META[type] ?? { label: type, color: '#94a3b8', icon: null };
            const active = typeFilter === type;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(active ? 'all' : type)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                style={{
                  backgroundColor: active ? `${meta.color}1A` : 'transparent',
                  border: `1px solid ${active ? `${meta.color}33` : 'var(--border-base)'}`,
                  color: active ? meta.color : 'var(--text-muted)',
                }}
              >
                {meta.icon}
                {meta.label} ({count})
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Barre de recherche */}
      <div className="relative">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filtrer par nom d'entité ou fichier…"
          className="w-full pl-3 pr-3 py-2 rounded-xl text-[11px] outline-none"
          style={{
            backgroundColor: 'var(--bg-base)',
            border: '1px solid var(--border-base)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-base)')}
        />
      </div>

      {/* Liste des relations */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#818cf80D' }}
          >
            <Link2 size={20} style={{ color: '#818cf8' }} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              {relations.length === 0 ? 'Aucune relation extraite' : 'Aucun résultat'}
            </p>
            <p className="text-[11px] max-w-[250px]" style={{ color: 'var(--text-muted)' }}>
              {relations.length === 0
                ? 'Lance un knowledge_reindex pour extraire les dépendances, appels, routes, tables et variables d’environnement.'
                : 'Essaie un autre filtre.'}
            </p>
          </div>
        </div>
      ) : (
        <Panel
          title={`${filtered.length} résultat(s) chargé(s) · ${relationCount} indexée(s)`}
          icon={<Network size={12} />}
          className="!p-3"
        >
          <ul className="space-y-1.5 max-h-[400px] overflow-y-auto custom-scrollbar">
            {filtered.slice(0, 50).map((rel, i) => {
              const meta = RELATION_META[rel.relationType] ?? { label: rel.relationType, color: '#94a3b8', icon: null };
              return (
                <li
                  key={i}
                  className="p-2.5 rounded-xl flex items-center gap-2"
                  style={{ backgroundColor: 'var(--bg-panel-alt)', border: '1px solid var(--border-base)' }}
                >
                  {/* Source */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10.5px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {rel.source.name}
                    </p>
                    <p className="text-[9px] font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                      {rel.source.filePath}
                    </p>
                  </div>

                  {/* Arrow with relation type */}
                  <div className="flex flex-col items-center gap-0.5 flex-shrink-0 px-2">
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase"
                      style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                    <span className="text-[10px]" style={{ color: meta.color }}>→</span>
                  </div>

                  {/* Target */}
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-[10.5px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {rel.target.name}
                    </p>
                    <p className="text-[9px] font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                      {rel.target.filePath}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered.length > 50 && (
            <p className="text-[10px] text-center mt-2" style={{ color: 'var(--text-dimmed)' }}>
              Affiche 50 / {filtered.length} résultat(s) chargé(s)
              {relationCount > relations.length ? ` — ${relationCount} relation(s) correspondent côté serveur` : ''}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

/**
 * KnowledgeOverviewDashboard — tableau de bord complet du Knowledge System.
 *
 * Agrège en une vue : santé et fraîcheur de l'index, KPIs du graphe de code,
 * entités structurelles, relations, hotspots (couplage, impact, taille),
 * cycles de dépendances, mémoire projet, patterns appris, call-graph AST,
 * FileWatcher et documents.
 *
 * Sources : GET /api/knowledge/dashboard (principal), /api/documents/stats,
 * /api/knowledge/documents, /api/knowledge/ast/stats, /api/knowledge/watcher.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, BookOpen, Brain, CheckCircle2, Clock, Database, FileCode,
  FileText, Flame, Folder, GitBranch, GitFork, KeyRound, Layers, Link2, Loader2,
  Network, RefreshCw, Repeat, Route, TestTube2, TrendingUp, XCircle, Zap,
} from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { authHeaders } from '../../hooks/useCodeMapImpact.js';
import {
  BarList, FactList, FileTable, InfoItem, Kpi, Meter, MiniStat, Panel, PatternPanel, StatusBadge,
  PHASE_LABELS, fmt, shortPath, timeAgo,
} from './KnowledgeDashboardParts.js';
import type { AstStats, DashboardData, DocStats, DocsSummary, Progress, WatcherStats } from './KnowledgeDashboardParts.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Même règle que la route /api/knowledge/health. */
function overallStatus(warnings: string[]): 'healthy' | 'warning' | 'degraded' {
  if (warnings.length === 0) return 'healthy';
  return warnings.some((w) => w.includes('non initialisé') || w.includes('indisponible')) ? 'degraded' : 'warning';
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: authHeaders() });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function KnowledgeOverviewDashboard({ categoryColor }: { categoryColor: (category: string) => string }) {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [docs, setDocs] = useState<DocsSummary | null>(null);
  const [ast, setAst] = useState<AstStats | null>(null);
  const [watcher, setWatcher] = useState<WatcherStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  const load = useCallback(async () => {
    const [dashboard, docStats, wsDocs, watch] = await Promise.all([
      getJson<DashboardData>('/api/knowledge/dashboard'),
      getJson<{ stats: DocStats }>('/api/documents/stats'),
      getJson<{ documentCount: number; documents: { textLength?: number; mimeType?: string }[] }>('/api/knowledge/documents'),
      getJson<{ watcher: WatcherStats }>('/api/knowledge/watcher'),
    ]);
    setData(dashboard);
    const byType: Record<string, number> = { ...docStats?.stats.documentsByType };
    for (const d of wsDocs?.documents ?? []) {
      const type = d.mimeType || 'auto_extracted';
      byType[type] = (byType[type] ?? 0) + 1;
    }
    setDocs({
      count: (docStats?.stats.totalDocuments ?? 0) + (wsDocs?.documentCount ?? 0),
      chars: (wsDocs?.documents ?? []).reduce((s, d) => s + (d.textLength ?? 0), 0),
      stats: docStats?.stats ?? null,
      byType,
    });
    setWatcher(watch?.watcher ?? null);
    setLoading(false);
    // Chargé à part : /ast/stats peut construire l'index AST à la première visite.
    // En cas d'échec : état « Indisponible » plutôt qu'un « Chargement… » infini.
    getJson<AstStats>('/api/knowledge/ast/stats').then((r) => setAst(r ?? {
      astReady: false, stats: { totalNodes: 0, totalEdges: 0, resolvedEdges: 0, crossFileEdges: 0 },
    }));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Rafraîchissement : fin d'indexation (WebSocket) + filet de sécurité toutes les 60 s.
  useEffect(() => {
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent).detail as Progress & { type?: string };
      if (d.type && d.type !== 'knowledge_progress') return;
      if (d.phase === 'done') {
        setProgress(null);
        load();
      } else {
        setProgress({ phase: d.phase, current: d.current, total: d.total });
      }
    };
    window.addEventListener('Leanna-knowledge-progress', onProgress);
    const interval = setInterval(load, 60_000);
    return () => {
      window.removeEventListener('Leanna-knowledge-progress', onProgress);
      clearInterval(interval);
    };
  }, [load]);

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/knowledge/reindex', { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const seconds = ((json.stats?.durationMs ?? 0) / 1000).toFixed(1);
      success(`Projet réindexé : ${fmt(json.stats?.totalFiles)} fichiers en ${seconds} s`);
      await load();
    } catch {
      toastError('Échec de la réindexation du projet');
    } finally {
      setReindexing(false);
      setProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label="Chargement du tableau de bord">
        <Loader2 className="w-6 h-6 motion-safe:animate-spin" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" role="alert">
        <AlertTriangle className="w-8 h-8" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Impossible de charger le tableau de bord du Knowledge System.
        </p>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="text-xs px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-secondary)' }}>
          Réessayer
        </button>
      </div>
    );
  }

  const { graph, memory, health, patterns, workspace } = data;
  const status = overallStatus(health.warnings);
  const progressPct = progress && progress.total > 0 && progress.current > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null;
  const phaseLabel = progress ? PHASE_LABELS[progress.phase] ?? progress.phase : '';
  const declarations = ['function', 'class', 'interface', 'type', 'component', 'method']
    .reduce((s, t) => s + (graph.entitiesByType[t] ?? 0), 0);

  return (
    <div className="p-5 lg:p-7 space-y-5">
      {/* ── En-tête : statut, fraîcheur, workspace, actions ─────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tableau de bord Knowledge</h2>
            <StatusBadge status={status} />
            {workspace.sandboxActive && (
              <span className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--text-secondary)' }}>
                Sandbox active
              </span>
            )}
          </div>
          <p className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-muted)' }}>
            <Folder className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate font-mono" title={workspace.selfRoot}>{workspace.selfRoot || 'Aucun projet actif'}</span>
            <span aria-hidden="true">·</span>
            <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Indexé {timeAgo(graph.lastIndexed)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => load()} aria-label="Rafraîchir le tableau de bord"
            className="p-2 rounded-lg border" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={reindex} disabled={reindexing} aria-busy={reindexing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-secondary)' }}>
            {reindexing
              ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" />
              : <Zap className="w-3.5 h-3.5" aria-hidden="true" />}
            {reindexing ? 'Réindexation…' : 'Réindexer (code + documents)'}
          </button>
        </div>
      </div>

      {progress && (
        <div className="p-3 rounded-xl border space-y-2" role="status" aria-live="polite"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>{phaseLabel}</span>
            <span className="tabular-nums">{progressPct !== null ? `${progressPct} %` : 'en cours…'}</span>
          </div>
          <Meter value={progressPct ?? 100} max={100} indeterminate={progressPct === null} label={`Progression : ${phaseLabel}`} />
        </div>
      )}

      {health.warnings.length > 0 && (
        <ul className="p-3 rounded-xl border space-y-1" aria-label="Avertissements"
          style={{ backgroundColor: 'var(--color-warning-subtle)', borderColor: 'var(--border-warning-subtle)' }}>
          {health.warnings.map((w) => (
            <li key={w} className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="list" aria-label="Indicateurs clés">
        <Kpi icon={FileCode} label="Fichiers indexés" value={fmt(graph.totalFiles)} hint={`${fmt(graph.totalLines)} lignes`} />
        <Kpi icon={Layers} label="Déclarations" value={fmt(declarations)} hint={`${fmt(graph.totalEntities)} entités au total`} />
        <Kpi icon={Link2} label="Relations" value={fmt(graph.relations.total)} hint={`${fmt(graph.totalImports)} imports`} />
        <Kpi icon={Repeat} label="Cycles" value={fmt(graph.cycleCount)} warn={graph.cycleCount > 0}
          hint={`${fmt(health.criticalModuleCount)} modules critiques`} />
        <Kpi icon={Brain} label="Faits mémoire" value={fmt(memory.totalFacts)} hint="sur 500 max.">
          <Meter value={memory.totalFacts} max={500} label="Remplissage de la mémoire projet" />
        </Kpi>
        <Kpi icon={FileText} label="Documents" value={fmt(docs?.count)} hint={`${fmt(docs?.chars)} caractères extraits`} />
        <Kpi icon={GitFork} label="Fonctions AST" value={ast ? fmt(ast.stats.totalNodes) : '…'}
          hint={!ast ? 'Construction de l\'index…' : ast.astReady
            ? `${fmt(ast.stats.totalEdges)} appels · ${fmt(ast.stats.crossFileEdges)} inter-fichiers`
            : 'Tree-sitter indisponible'} />
        <Kpi icon={Activity} label="Fraîcheur" value={`${Math.round(health.freshness * 100)} %`}
          hint={`Moy. ${fmt(Math.round(graph.averageFileSize / 1024))} Ko / fichier`}>
          <Meter value={health.freshness * 100} max={100} label="Fraîcheur de l'index" />
        </Kpi>
      </div>

      {/* ── Structure du code ─────────────────────────────────────────────── */}
      <Panel icon={Network} title="Structure du projet">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <MiniStat icon={Route} label="Routes API" value={graph.structuralEntities.routes} />
          <MiniStat icon={Database} label="Tables BD" value={graph.structuralEntities.databaseTables} />
          <MiniStat icon={KeyRound} label="Variables d'env." value={graph.structuralEntities.environmentVariables} />
          <MiniStat icon={TestTube2} label="Cas de test" value={graph.structuralEntities.tests} />
          <MiniStat icon={Link2} label="Symboles" value={graph.structuralEntities.symbols} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel icon={Layers} title="Entités par type">
          <BarList items={Object.entries(graph.entitiesByType)} />
        </Panel>
        <Panel icon={FileCode} title="Fichiers par extension">
          <BarList items={Object.entries(graph.filesByExtension)} />
        </Panel>
        <Panel icon={Link2} title="Relations par type">
          <BarList items={Object.entries(graph.relations.byType)} empty="Aucune relation extraite" />
        </Panel>
      </div>

      {/* ── Hotspots ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={GitBranch} title="Fichiers les plus couplés">
          <FileTable
            columns={['Dépend de', 'Utilisé par', 'Total']}
            rows={graph.couplingRanking.slice(0, 10).map((r) => ({
              path: r.path, values: [r.dependencies, r.dependents, r.totalEdges],
            }))}
          />
        </Panel>
        <Panel icon={Flame} title="Fichiers les plus impactants" subtitle="Nombre de fichiers qui en dépendent">
          <BarList items={graph.topImpacted.map((f) => [f.path, f.impacted])} isPath empty="Aucune dépendance détectée" />
        </Panel>
        <Panel icon={FileText} title="Plus gros fichiers">
          <FileTable
            columns={['Lignes', 'Entités']}
            rows={graph.topLargest.map((f) => ({ path: f.path, values: [f.lines ?? 0, f.entities ?? 0] }))}
          />
        </Panel>
        <Panel icon={Layers} title="Fichiers les plus denses" subtitle="Entités par fichier">
          <BarList items={graph.topEntityDense.map((f) => [f.path, f.entities ?? 0])} isPath />
        </Panel>
      </div>

      {/* ── Cycles ────────────────────────────────────────────────────────── */}
      <Panel icon={Repeat} title={`Cycles de dépendances (${graph.cycleCount})`}>
        {graph.cycles.length === 0 ? (
          <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
            Aucun cycle détecté.
          </p>
        ) : (
          <ol className="space-y-2">
            {graph.cycles.map((c, i) => (
              <li key={c.files.join('>')} className="text-xs p-2 rounded-lg font-mono break-all"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                <span className="font-sans font-semibold mr-2" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                {[...c.files, c.files[0]].map((f) => shortPath(f)).join(' → ')}
              </li>
            ))}
            {graph.cycleCount > graph.cycles.length && (
              <li className="text-xs" style={{ color: 'var(--text-muted)' }}>
                + {graph.cycleCount - graph.cycles.length} autre(s) cycle(s)
              </li>
            )}
          </ol>
        )}
      </Panel>

      {/* ── Mémoire projet ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel icon={Brain} title="Faits par catégorie">
          <BarList items={Object.entries(memory.factByCategory)} colorOf={categoryColor} empty="Mémoire vide" />
        </Panel>
        <Panel icon={TrendingUp} title="Faits les plus utilisés">
          <FactList facts={memory.topUsedFacts} categoryColor={categoryColor} meta={(f) => `${f.usageCount}×`} />
        </Panel>
        <Panel icon={Clock} title="Faits récents">
          <FactList facts={memory.recentFacts} categoryColor={categoryColor} meta={(f) => timeAgo(f.updatedAt)} />
        </Panel>
      </div>

      {memory.topTags.length > 0 && (
        <Panel icon={BookOpen} title="Tags fréquents">
          <ul className="flex flex-wrap gap-1.5">
            {memory.topTags.map(({ tag, count }) => (
              <li key={tag} className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                {tag} <span style={{ color: 'var(--text-muted)' }}>{count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Base documentaire ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel icon={FileText} title="Base documentaire">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat icon={FileText} label="Documents" value={docs?.count ?? 0} />
            <MiniStat icon={Layers} label="Sections" value={docs?.stats?.totalSections ?? 0} />
            <MiniStat icon={BookOpen} label="Mots (uploads)" value={docs?.stats?.totalWords ?? 0} />
            <MiniStat icon={Brain} label="Faits extraits" value={docs?.stats?.totalFacts ?? 0} />
            <MiniStat icon={Link2} label="Liens entre docs" value={docs?.stats?.totalRelations ?? 0} />
            <MiniStat icon={Network} label="Entités nommées" value={docs?.stats?.totalEntities ?? 0} />
          </div>
        </Panel>
        <Panel icon={FileCode} title="Documents par type">
          <BarList items={Object.entries(docs?.byType ?? {})} empty="Aucun document" />
        </Panel>
        <Panel icon={Brain} title="Faits documentaires par catégorie">
          <BarList items={Object.entries(docs?.stats?.factsByCategory ?? {})} colorOf={categoryColor} empty="Aucun fait extrait" />
        </Panel>
      </div>

      {/* ── Patterns appris ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <PatternPanel icon={XCircle} title="Erreurs récurrentes" patterns={patterns.errorPatterns} />
        <PatternPanel icon={CheckCircle2} title="Succès récurrents" patterns={patterns.successPatterns} />
        <PatternPanel icon={Zap} title="Optimisations" patterns={patterns.optimizations} />
        <PatternPanel icon={GitBranch} title="Décisions" patterns={patterns.decisions} />
      </div>

      {/* ── Infrastructure ────────────────────────────────────────────────── */}
      <Panel icon={Activity} title="Infrastructure d'indexation">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <InfoItem label="FileWatcher" value={watcher ? (watcher.running ? 'Actif' : 'Arrêté') : 'Inconnu'}
            tone={watcher ? (watcher.running ? 'success' : 'error') : undefined} />
          <InfoItem label="Évènements traités" value={fmt(watcher?.totalEventsProcessed)} />
          <InfoItem label="Dernier évènement" value={watcher?.lastEventAt ? timeAgo(watcher.lastEventAt) : 'aucun'} />
          <InfoItem label="Tree-sitter (AST)" value={ast ? (ast.astReady ? 'Prêt' : 'Indisponible') : '…'}
            tone={ast ? (ast.astReady ? 'success' : 'error') : undefined} />
          <InfoItem label="Appels résolus"
            value={ast ? `${fmt(ast.stats.resolvedEdges)} / ${fmt(ast.stats.totalEdges)}` : '…'} />
          <InfoItem label="Exports" value={fmt(graph.totalExports)} />
          <InfoItem label="Imports" value={fmt(graph.totalImports)} />
          <InfoItem label="Données générées" value={timeAgo(data.generatedAt)} />
        </dl>
      </Panel>
    </div>
  );
}

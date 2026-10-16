/**
 * Sous-composants et helpers du KnowledgeOverviewDashboard.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Types (miroir des réponses API) ─────────────────────────────────────────

export interface Fact {
  id: string; content: string; category: string; tags: string[];
  usageCount: number; updatedAt: string; isStructural?: boolean;
}
export interface Pattern {
  signature: string; description: string; occurrenceCount: number;
  growthPct?: number; isRecurring?: boolean; relatedFiles: string[];
}

export interface FileRank { path: string; lines?: number; size?: number; entities?: number }
export interface CouplingRow { path: string; dependencies: number; dependents: number; totalEdges: number }

export interface DashboardData {
  generatedAt: string;
  workspace: { selfRoot: string; activeWorkspace: string; sandboxActive: boolean };
  graph: {
    lastIndexed: string;
    totalFiles: number; totalLines: number; totalEntities: number;
    totalExports: number; totalImports: number; averageFileSize: number;
    filesByExtension: Record<string, number>;
    entitiesByType: Record<string, number>;
    structuralEntities: {
      routes: number; databaseTables: number; environmentVariables: number; tests: number; symbols: number;
    };
    relations: { total: number; byType: Record<string, number> };
    topLargest: FileRank[];
    topEntityDense: FileRank[];
    topImpacted: { path: string; impacted: number }[];
    couplingRanking: CouplingRow[];
    cycleCount: number;
    cycles: { files: string[]; length: number }[];
  };
  memory: {
    totalFacts: number;
    factByCategory: Record<string, number>;
    topTags: { tag: string; count: number }[];
    topUsedFacts: Fact[];
    recentFacts: Fact[];
  };
  health: {
    initialized: boolean; freshness: number; criticalModuleCount: number;
    lastIndexed?: string; warnings: string[];
  };
  patterns: {
    errorPatterns: Pattern[]; successPatterns: Pattern[];
    optimizations: Pattern[]; decisions: Pattern[];
  };
}

export interface DocStats {
  totalDocuments: number; totalWords: number; totalSections: number; totalFacts: number;
  totalRelations: number; totalEntities: number;
  documentsByType: Record<string, number>; factsByCategory: Record<string, number>;
}
export interface DocsSummary { count: number; chars: number; stats: DocStats | null; byType: Record<string, number> }
export interface AstStats {
  astReady: boolean;
  stats: { totalNodes: number; totalEdges: number; resolvedEdges: number; crossFileEdges: number };
}
export interface WatcherStats { running: boolean; totalEventsProcessed: number; totalBatchesDispatched: number; lastEventAt: number }
export interface Progress { phase: string; current: number; total: number }

export const PHASE_LABELS: Record<string, string> = {
  incremental: 'Mise à jour incrémentale', parse: 'Analyse des fichiers', ast: 'Arbre syntaxique',
  relations: 'Extraction des relations', done: 'Terminé',
};

export const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('fr-FR');

export function timeAgo(value?: string | number): string {
  if (!value) return 'jamais';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

/** Raccourcit un chemin long en gardant les derniers segments (les plus informatifs). */
export function shortPath(p: string, keep = 3): string {
  const parts = p.split('/');
  return parts.length <= keep ? p : `…/${parts.slice(-keep).join('/')}`;
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

const STATUS_CFG = {
  healthy: { icon: CheckCircle2, label: 'Sain', color: 'var(--color-success)', bg: 'var(--color-success-subtle)' },
  warning: { icon: AlertTriangle, label: 'Avertissements', color: 'var(--color-warning)', bg: 'var(--color-warning-subtle)' },
  degraded: { icon: XCircle, label: 'Dégradé', color: 'var(--color-error)', bg: 'var(--color-error-subtle)' },
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_CFG }) {
  const { icon: Icon, label, color, bg } = STATUS_CFG[status];
  return (
    <span role="status" className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: bg, color: 'var(--text-primary)' }}>
      <Icon className="w-3 h-3" style={{ color }} aria-hidden="true" />
      {label}
    </span>
  );
}

export function Panel({ icon: Icon, title, subtitle, children }: {
  icon: LucideIcon; title: string; subtitle?: string; children: ReactNode;
}) {
  return (
    <section className="p-4 rounded-2xl border space-y-3 min-w-0" aria-label={title}
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
      <header>
        <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {title}
        </h3>
        {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-dimmed)' }}>{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function Kpi({ icon: Icon, label, value, hint, warn, children }: {
  icon: LucideIcon; label: string; value: string; hint?: string; warn?: boolean; children?: ReactNode;
}) {
  return (
    <div role="listitem" className="p-4 rounded-2xl border space-y-1.5 min-w-0"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: warn ? 'var(--border-warning-subtle)' : 'var(--border-base)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <Icon className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: warn ? 'var(--color-warning)' : 'var(--accent-primary)' }} aria-hidden="true" />
      </div>
      <p className="text-xl font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {hint && <p className="text-[11px] truncate" style={{ color: 'var(--text-dimmed)' }} title={hint}>{hint}</p>}
      {children}
    </div>
  );
}

export function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="p-2.5 rounded-xl flex items-center gap-2.5 min-w-0" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(value)}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  );
}

export function Meter({ value, max, label, indeterminate }: { value: number; max: number; label: string; indeterminate?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}
      role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}>
      <div className={`h-full rounded-full transition-all ${indeterminate ? 'motion-safe:animate-pulse' : ''}`}
        style={{ width: `${pct}%`, backgroundColor: 'var(--accent-primary)' }} />
    </div>
  );
}

/** Classement en barres horizontales mono-teinte (magnitude) ; `colorOf` = identité de catégorie. */
export function BarList({ items, isPath, colorOf, empty = 'Aucune donnée', limit = 10 }: {
  items: [string, number][]; isPath?: boolean; colorOf?: (key: string) => string; empty?: string; limit?: number;
}) {
  const sorted = items.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (sorted.length === 0) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{empty}</p>;
  const max = sorted[0][1];
  return (
    <ul className="space-y-2">
      {sorted.map(([key, value]) => (
        <li key={key} title={`${key} : ${fmt(value)}`} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={`truncate flex items-center gap-1.5 ${isPath ? 'font-mono' : ''}`} style={{ color: 'var(--text-secondary)' }}>
              {colorOf && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorOf(key) }} aria-hidden="true" />
              )}
              {isPath ? shortPath(key) : key}
            </span>
            <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmt(value)}</span>
          </div>
          <div className="h-1.5 rounded" style={{ backgroundColor: 'var(--bg-base)' }} aria-hidden="true">
            <div className="h-full rounded"
              style={{ width: `${(value / max) * 100}%`, backgroundColor: colorOf ? colorOf(key) : 'var(--accent-primary)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FileTable({ columns, rows }: { columns: string[]; rows: { path: string; values: number[] }[] }) {
  if (rows.length === 0) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune donnée</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th scope="col" className="text-left font-medium pb-2">Fichier</th>
            {columns.map((c) => (
              <th key={c} scope="col" className="text-right font-medium pb-2 pl-3 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.path} className="border-t" style={{ borderColor: 'var(--border-base)' }}>
              <td className="py-1.5 font-mono truncate max-w-[16rem]" style={{ color: 'var(--text-secondary)' }} title={r.path}>
                {shortPath(r.path)}
              </td>
              {r.values.map((v, i) => (
                <td key={columns[i]} className="py-1.5 pl-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FactList({ facts, categoryColor, meta }: {
  facts: Fact[]; categoryColor: (c: string) => string; meta: (f: Fact) => string;
}) {
  if (facts.length === 0) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun fait</p>;
  return (
    <ul className="space-y-2">
      {facts.slice(0, 6).map((f) => (
        <li key={f.id} className="text-xs flex items-start gap-2" title={f.content}>
          <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: categoryColor(f.category) }}
            aria-hidden="true" />
          <span className="flex-1 min-w-0 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
            <span className="sr-only">{f.category} : </span>{f.content}
          </span>
          <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>{meta(f)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PatternPanel({ icon, title, patterns }: { icon: LucideIcon; title: string; patterns: Pattern[] }) {
  return (
    <Panel icon={icon} title={`${title} (${patterns.length})`}>
      {patterns.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun pattern détecté</p>
      ) : (
        <ul className="space-y-2">
          {patterns.slice(0, 5).map((p) => (
            <li key={p.signature} className="text-xs" title={p.relatedFiles.join('\n') || undefined}>
              <p className="line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>
              <p className="mt-0.5 flex gap-2" style={{ color: 'var(--text-muted)' }}>
                <span>{p.occurrenceCount}×</span>
                {p.isRecurring && <span>récurrent</span>}
                {(p.growthPct ?? 0) > 0 && <span>+{Math.round(p.growthPct ?? 0)} %</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function InfoItem({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'error' }) {
  return (
    <div>
      <dt style={{ color: 'var(--text-dimmed)' }}>{label}</dt>
      <dd className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
        {tone && (
          <span className="w-2 h-2 rounded-full" aria-hidden="true"
            style={{ backgroundColor: tone === 'success' ? 'var(--color-success)' : 'var(--color-error)' }} />
        )}
        {value}
      </dd>
    </div>
  );
}

/**
 * ImpactPanel — panneau de la zone droite de l'IDE : ce qu'une modification du
 * fichier actif (ou du symbole ciblé) risque de casser. Lecture seule, branché
 * sur POST /api/knowledge/code-map/impact via useCodeMapImpact.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ClipboardCopy, FlaskConical, Pin, PinOff, RefreshCcw, X,
} from 'lucide-react';
import { authHeaders, useCodeMapImpact } from '../../hooks/useCodeMapImpact.js';
import {
  buildTestCommands, countImpactedSources, firstLineFor, groupByDistance,
  isCodeFile, riskColor, riskLabel, summaryHeadline, targetFile,
} from './impactModel.js';
import type { CodeMapImpactReport } from '../../types/codeMap.js';

export const MAX_ROWS_PER_GROUP = 100;
const DEPTHS = [1, 2, 3, 4, 5];

export interface ImpactPanelProps {
  target: string | null;
  pinned: boolean;
  onTogglePin: () => void;
  onOpenFile: (path: string, line?: number) => void;
  onClose: () => void;
}

function Message({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm"
      style={{ color: tone === 'error' ? 'var(--color-error)' : 'var(--text-muted)' }}>
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Analyse en cours" className="flex flex-col gap-2 p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded" style={{ backgroundColor: 'var(--border-base)', width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

function splitPath(p: string): { dir: string; name: string } {
  const i = p.lastIndexOf('/');
  return i === -1 ? { dir: '', name: p } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) };
}

/** ↑/↓ déplacent le focus entre les lignes `[data-impact-row]` du panneau. */
function handleRowKeys(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-impact-row]')];
  const i = rows.indexOf(document.activeElement as HTMLButtonElement);
  if (i === -1) return;
  e.preventDefault();
  rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
}

function ReportView({ report, onOpenFile }: { report: CodeMapImpactReport; onOpenFile: ImpactPanelProps['onOpenFile'] }) {
  const groups = useMemo(() => groupByDistance(report), [report]);
  const commands = useMemo(() => buildTestCommands(report.testsToRun), [report]);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(commands.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* presse-papiers indisponible : sans conséquence */ }
  }, [commands]);

  const alerts = [
    ...report.warnings,
    ...report.ambiguous.map((a) => `Plusieurs symboles nommés ${a.ref} — tous retenus`),
    ...(report.truncated || report.maxDepthReached
      ? ['Résultat partiel : augmente la profondeur ou cible un symbole précis']
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 p-3 text-sm" onKeyDown={handleRowKeys}>
      <p style={{ color: 'var(--text-muted)' }}>{summaryHeadline(report.summary)}</p>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Fichiers impactés', countImpactedSources(report)],
          ['Tests à relancer', report.testsToRun.length],
          ['Non couverts', report.untestedFiles.length],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded p-2" style={{ border: '1px solid var(--border-base)' }}>
            <dd className="text-lg font-semibold">{value}</dd>
            <dt className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{label}</dt>
          </div>
        ))}
      </dl>

      {groups.length === 0 && (
        <p style={{ color: 'var(--color-success)' }}>Aucun dépendant : modification sans effet de bord connu</p>
      )}

      {groups.map((g) => (
        <section key={g.distance} aria-label={g.label}>
          <h3 className="mb-1 text-xs font-semibold uppercase" style={{ color: 'var(--text-dimmed)' }}>{g.label}</h3>
          <ul className="flex flex-col">
            {g.files.slice(0, MAX_ROWS_PER_GROUP).map((f) => {
              const { dir, name } = splitPath(f.filePath);
              const extra = f.symbols.length - 3;
              return (
                <li key={f.filePath}>
                  <button
                    type="button"
                    data-impact-row
                    aria-label={f.filePath}
                    onClick={() => onOpenFile(f.filePath, firstLineFor(report, f.filePath))}
                    className="flex w-full flex-col items-start rounded px-2 py-1 text-left hover:bg-[var(--border-base)] focus:outline focus:outline-1 focus:outline-[var(--accent-primary)]"
                  >
                    <span className="flex w-full items-center gap-2 truncate">
                      <span className="truncate"><span style={{ color: 'var(--text-dimmed)' }}>{dir}</span>{name}</span>
                      {f.isTest && (
                        <span className="rounded px-1 text-[10px]" style={{ color: 'var(--color-info)', border: '1px solid var(--color-info)' }}>test</span>
                      )}
                    </span>
                    {f.symbols.length > 0 && (
                      <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                        {f.symbols.slice(0, 3).join(', ')}{extra > 0 ? ` +${extra}` : ''}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {g.files.length > MAX_ROWS_PER_GROUP && (
            <p className="px-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>
              +{g.files.length - MAX_ROWS_PER_GROUP} autres fichiers
            </p>
          )}
        </section>
      ))}

      {report.testsToRun.length > 0 && (
        <section aria-label="Tests à relancer">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase" style={{ color: 'var(--text-dimmed)' }}>
              <FlaskConical size={12} /> Tests à relancer
            </h3>
            <button type="button" onClick={copy} className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-primary)' }}>
              {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
              {copied ? 'Copié' : 'Copier la commande'}
            </button>
          </div>
          <ul className="flex flex-col">
            {report.testsToRun.map((t) => (
              <li key={t}>
                <button type="button" data-impact-row aria-label={t} onClick={() => onOpenFile(t)}
                  className="w-full truncate rounded px-2 py-1 text-left hover:bg-[var(--border-base)]">
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(alerts.length > 0 || report.untestedFiles.length > 0) && (
        <details open={alerts.length > 0}>
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-semibold uppercase" style={{ color: 'var(--color-warning)' }}>
            <AlertTriangle size={12} /> Alertes
          </summary>
          <ul className="mt-1 flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {alerts.map((a) => <li key={a}>{a}</li>)}
            {report.untestedFiles.map((f) => <li key={f}>Non couvert par un test : {f}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ImpactPanel({ target, pinned, onTogglePin, onOpenFile, onClose }: ImpactPanelProps) {
  const [depth, setDepth] = useState(3);
  const analyzable = !!target && isCodeFile(targetFile(target));
  const { report, loading, error, refresh } = useCodeMapImpact(analyzable ? target : null, depth);
  const [reindexing, setReindexing] = useState(false);

  const reindex = useCallback(async () => {
    setReindexing(true);
    try {
      await fetch('/api/knowledge/reindex', { method: 'POST', headers: authHeaders() });
    } catch { /* l'état d'erreur du rafraîchissement suffira */ }
    setReindexing(false);
    refresh();
  }, [refresh]);

  const primary = report?.targets[0];
  const unresolved = !!report && report.targets.length === 0 && report.unresolved.length > 0;

  let body: React.ReactNode;
  if (!target) body = <Message>Ouvre un fichier de code pour voir son impact</Message>;
  else if (!analyzable) body = <Message>Pas de code à analyser dans ce fichier</Message>;
  else if (error) body = (
    <Message tone="error">
      <span>{error}</span>
      <button type="button" onClick={refresh} className="flex items-center gap-1 rounded px-2 py-1"
        style={{ border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
        <RefreshCcw size={12} /> Réessayer
      </button>
    </Message>
  );
  else if (!report) body = <Skeleton />;
  else if (unresolved) body = (
    <Message>
      <span>Ce fichier ou symbole n'est pas encore dans la cartographie</span>
      <button type="button" onClick={reindex} disabled={reindexing} className="flex items-center gap-1 rounded px-2 py-1"
        style={{ border: '1px solid var(--border-base)' }}>
        <RefreshCcw size={12} /> {reindexing ? 'Réindexation…' : 'Réindexer'}
      </button>
    </Message>
  );
  else body = (
    <div style={{ opacity: loading ? 0.5 : 1 }} aria-busy={loading}>
      <ReportView report={report} onOpenFile={onOpenFile} />
    </div>
  );

  return (
    <section aria-label="Impact de la modification" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-shrink-0 items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border-base)' }}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{primary?.name ?? (target ? targetFile(target).split('/').pop() : 'Impact')}</div>
          {primary && <div className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{primary.kind}</div>}
        </div>
        {report && !unresolved && (
          <span className="rounded px-2 py-0.5 text-xs font-semibold"
            style={{ color: riskColor(report.risk), border: `1px solid ${riskColor(report.risk)}` }}
            title={`Score de risque ${report.riskScore}/100`}>
            {riskLabel(report.risk)}
          </span>
        )}
        <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="sr-only">Profondeur</span>
          <select aria-label="Profondeur" value={depth} onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded bg-transparent px-1" style={{ border: '1px solid var(--border-base)' }}>
            {DEPTHS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button type="button" onClick={onTogglePin} aria-label={pinned ? 'Désépingler la cible' : 'Épingler la cible'}
          aria-pressed={pinned} style={{ color: pinned ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer le panneau" style={{ color: 'var(--text-muted)' }}>
          <X size={14} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{body}</div>
    </section>
  );
}

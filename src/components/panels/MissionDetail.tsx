/**
 * MissionDetail — Détail complet d'une mission d'agent.
 *
 * Source : GET /api/agents/tasks/:taskId (server/routes/agents.ts →
 * serializeTaskDetail). Affiche ce que l'agent a réellement fait :
 * brief, critères de réussite, chronologie, résultat, fichiers lus/modifiés,
 * outils et commandes exécutés, vérifications et régressions.
 *
 * - Rafraîchi toutes les 3 s tant que la mission est en cours.
 * - Les fichiers sont cliquables (ouverture dans l'éditeur via
 *   l'événement « Leanna-open-file » écouté par IdeView).
 * - « Copier le rapport » exporte la mission en Markdown.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ClipboardCopy, Clock, FileCode2,
  FileSearch, Flag, Lightbulb, Loader2, ShieldCheck, ShieldX, Target, Terminal, Wrench, XCircle,
} from 'lucide-react';

// ─── Types (miroir de serializeTaskDetail côté serveur) ───────────────────────

export interface MissionDetailData {
  id: string;
  orchestrationId?: string;
  role: string;
  title: string;
  description?: string;
  priority?: string;
  status: string;
  createdAt?: string | number;
  startedAt?: string | number;
  completedAt?: string | number;
  timeoutMs?: number;
  context?: {
    files: string[];
    instructions?: string;
    successCriteria: string[];
    previousResultsCount: number;
  };
  result?: {
    success: boolean;
    outcome?: string;
    blockReason?: string;
    summary?: string;
    details?: string;
    filesModified: string[];
    fileValidationErrors: Array<string | { file?: string; path?: string; message?: string; error?: string }>;
    suggestions: string[];
    error?: string;
    durationMs?: number;
    delegatedSubTasks: string[];
    evidence?: {
      filesRead: string[];
      filesModified: string[];
      toolsExecuted: string[];
      commandsExecuted: string[];
      verification: { passed: boolean; checks: string[]; errors: string[] };
      regressions: string[];
    };
  };
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: MissionDetailData }
  | { kind: 'missing'; message: string }
  | { kind: 'error'; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POLL_MS = 3000;

function apiHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-Leanna-token': token } : {};
}

const toMs = (v?: string | number) => (v === undefined || v === null ? undefined : typeof v === 'number' ? v : Date.parse(v));

export function formatMs(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${s} s`;
}

const clock = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

function openFile(path: string) {
  window.dispatchEvent(new CustomEvent('Leanna-open-file', { detail: { path } }));
}

/** Compte les occurrences (ex. outils exécutés plusieurs fois). */
function countBy(list: string[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const OUTCOME_LABEL: Record<string, string> = {
  success: 'Réussie', completed: 'Terminée', partial: 'Partielle', blocked: 'Bloquée',
  failed: 'Échec', error: 'Erreur', timeout: 'Délai dépassé', cancelled: 'Annulée',
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critique', color: 'var(--color-error)' },
  high: { label: 'Haute', color: 'var(--color-warning)' },
  medium: { label: 'Normale', color: 'var(--accent-primary)' },
  normal: { label: 'Normale', color: 'var(--accent-primary)' },
  low: { label: 'Basse', color: 'var(--text-muted)' },
};

/** Rapport Markdown de la mission (copie presse-papiers). */
function toMarkdown(d: MissionDetailData): string {
  const r = d.result;
  const ev = r?.evidence;
  const lines: string[] = [`# ${d.title}`, '', `- **Agent** : ${d.role}`, `- **Statut** : ${d.status}`];
  if (d.priority) lines.push(`- **Priorité** : ${d.priority}`);
  if (r?.durationMs) lines.push(`- **Durée** : ${formatMs(r.durationMs)}`);
  if (d.description) lines.push('', '## Brief', '', d.description);
  if (d.context?.successCriteria.length) lines.push('', '## Critères de réussite', '', ...d.context.successCriteria.map(c => `- ${c}`));
  if (r?.summary) lines.push('', '## Résultat', '', r.summary);
  if (r?.error) lines.push('', '## Erreur', '', r.error);
  const modified = [...new Set([...(r?.filesModified ?? []), ...(ev?.filesModified ?? [])])];
  if (modified.length) lines.push('', '## Fichiers modifiés', '', ...modified.map(f => `- \`${f}\``));
  if (ev?.commandsExecuted.length) lines.push('', '## Commandes', '', ...ev.commandsExecuted.map(c => `- \`${c}\``));
  if (ev) lines.push('', `## Vérification : ${ev.verification.passed ? 'réussie' : 'échouée'}`, '', ...ev.verification.checks.map(c => `- ✓ ${c}`), ...ev.verification.errors.map(e => `- ✗ ${e}`));
  if (r?.suggestions.length) lines.push('', '## Suggestions', '', ...r.suggestions.map(s => `- ${s}`));
  return lines.join('\n');
}

// ─── Hook de chargement ───────────────────────────────────────────────────────

function useMissionDetail(taskId: string, live: boolean): [LoadState, () => void] {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const res = await fetch(`/api/agents/tasks/${encodeURIComponent(taskId)}`, { headers: apiHeaders() });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.status === 404) setState({ kind: 'missing', message: json.error ?? 'Mission introuvable.' });
        else if (!res.ok || !json.task) setState({ kind: 'error', message: json.error ?? `Erreur ${res.status}` });
        else setState({ kind: 'ready', data: json.task as MissionDetailData });
      } catch {
        if (alive) setState(prev => (prev.kind === 'ready' ? prev : { kind: 'error', message: 'Serveur injoignable.' }));
      }
      if (alive && live) timer = setTimeout(load, POLL_MS);
    };
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [taskId, live, nonce]);

  return [state, reload];
}

// ─── Petits blocs d'interface ────────────────────────────────────────────────

function Section({
  icon: Icon, title, count, color = 'var(--text-muted)', defaultOpen = true, children,
}: {
  icon: ComponentType<{ size?: number; style?: CSSProperties }>;
  title: string;
  count?: number;
  color?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="lea-mission-section">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="lea-mission-section__head">
        <Icon size={12} style={{ color }} />
        <span className="flex-1 text-left">{title}</span>
        {count !== undefined && <span className="lea-mission-count">{count}</span>}
        <ChevronDown size={12} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 160ms ease' }} />
      </button>
      {open && <div className="lea-mission-section__body">{children}</div>}
    </section>
  );
}

function FileList({ files, tone }: { files: string[]; tone: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, 8);
  return (
    <ul className="m-0 list-none space-y-0.5 p-0">
      {shown.map(f => (
        <li key={f}>
          <button type="button" onClick={() => openFile(f)} className="lea-mission-file" title={`Ouvrir ${f}`}>
            <FileCode2 size={11} style={{ color: tone, flexShrink: 0 }} />
            <span className="truncate">{f}</span>
          </button>
        </li>
      ))}
      {files.length > 8 && (
        <li>
          <button type="button" onClick={() => setAll(a => !a)} className="lea-mission-more">
            {all ? 'Réduire' : `+ ${files.length - 8} autres`}
          </button>
        </li>
      )}
    </ul>
  );
}

/** Chronologie : création → démarrage → fin, avec part d'attente et d'exécution. */
function Timeline({ d, now }: { d: MissionDetailData; now: number }) {
  const created = toMs(d.createdAt);
  const started = toMs(d.startedAt);
  const completed = toMs(d.completedAt);
  const end = completed ?? now;
  const waitMs = created && started ? started - created : created && !started ? end - created : undefined;
  const runMs = started ? end - started : undefined;
  const total = (waitMs ?? 0) + (runMs ?? 0);
  const waitPct = total > 0 && waitMs ? Math.max(4, (waitMs / total) * 100) : 0;
  const running = !!started && !completed;
  const timeoutPct = running && d.timeoutMs ? Math.min(100, ((now - started!) / d.timeoutMs) * 100) : null;

  return (
    <div className="space-y-2">
      <div className="lea-mission-bar" aria-hidden="true">
        {waitPct > 0 && <span style={{ width: `${waitPct}%`, background: 'var(--text-dimmed)' }} />}
        {runMs !== undefined && <span className={running ? 'is-live' : undefined} style={{ flex: 1, background: d.result?.success === false ? 'var(--color-error)' : 'var(--accent-primary)' }} />}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div><dt className="lea-mission-dt">Créée</dt><dd className="tabular-nums">{clock(created)}</dd></div>
        <div><dt className="lea-mission-dt">Démarrée</dt><dd className="tabular-nums">{clock(started)}</dd></div>
        <div><dt className="lea-mission-dt">{completed ? 'Terminée' : 'En cours'}</dt><dd className="tabular-nums">{completed ? clock(completed) : '…'}</dd></div>
        <div><dt className="lea-mission-dt">Attente</dt><dd className="tabular-nums">{formatMs(waitMs)}</dd></div>
        <div><dt className="lea-mission-dt">Exécution</dt><dd className="tabular-nums">{formatMs(d.result?.durationMs ?? runMs)}</dd></div>
        <div><dt className="lea-mission-dt">Délai max</dt><dd className="tabular-nums">{formatMs(d.timeoutMs)}</dd></div>
      </dl>
      {timeoutPct !== null && timeoutPct > 60 && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: timeoutPct > 85 ? 'var(--color-error)' : 'var(--color-warning)' }}>
          <Clock size={11} /> {Math.round(timeoutPct)} % du délai maximal consommé
        </p>
      )}
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function MissionDetail({
  taskId, status, color, fallbackSummary,
}: {
  taskId: string;
  /** Statut connu localement (store) : pilote le rafraîchissement automatique. */
  status: string;
  color: string;
  /** Résumé du store, affiché si le serveur n'a plus la mission. */
  fallbackSummary?: string;
}) {
  const live = status === 'running' || status === 'pending';
  const [state, reload] = useMissionDetail(taskId, live);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Horloge locale pour la chronologie d'une mission en cours
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Le statut local change (fin de mission) → recharge immédiate du détail
  useEffect(() => { reload(); }, [status, reload]);

  const data = state.kind === 'ready' ? state.data : null;
  const r = data?.result;
  const ev = r?.evidence;
  const modified = useMemo(() => [...new Set([...(r?.filesModified ?? []), ...(ev?.filesModified ?? [])])], [r, ev]);
  const tools = useMemo(() => countBy(ev?.toolsExecuted ?? []), [ev]);

  const copyReport = () => {
    if (!data) return;
    navigator.clipboard?.writeText(toMarkdown(data)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => { /* presse-papiers indisponible */ });
  };

  if (state.kind === 'loading') {
    return (
      <div className="space-y-2 py-1" aria-busy="true">
        {[90, 70, 80].map((w, i) => <div key={i} className="skeleton-shimmer h-2.5" style={{ width: `${w}%`, borderRadius: 3 }} />)}
      </div>
    );
  }

  if (state.kind !== 'ready' || !data) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>
          <AlertTriangle size={11} />
          {state.kind === 'missing'
            ? 'Détail indisponible : mission purgée ou issue d’une session précédente.'
            : `Détail indisponible (${state.kind === 'error' ? state.message : ''}).`}
          {state.kind === 'error' && <button type="button" onClick={reload} className="lea-mission-more">Réessayer</button>}
        </p>
        {fallbackSummary && <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{fallbackSummary}</p>}
      </div>
    );
  }

  const prio = data.priority ? PRIORITY_META[data.priority] ?? { label: data.priority, color: 'var(--text-muted)' } : null;
  const outcome = r?.outcome ? OUTCOME_LABEL[r.outcome] ?? r.outcome : r ? (r.success ? 'Réussie' : 'Échec') : null;
  const outcomeColor = !r ? 'var(--text-muted)' : r.success ? 'var(--color-success)' : r.outcome === 'partial' ? 'var(--color-warning)' : 'var(--color-error)';
  const criteria = data.context?.successCriteria ?? [];
  const validationErrors = (r?.fileValidationErrors ?? []).map(e =>
    typeof e === 'string' ? e : `${e.file ?? e.path ?? ''}${e.file || e.path ? ' : ' : ''}${e.message ?? e.error ?? ''}`,
  ).filter(Boolean);

  return (
    <div className="lea-mission space-y-2" style={{ ['--mission-color' as string]: color }}>
      {/* Bandeau : priorité, issue, actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {prio && (
          <span className="lea-mission-tag" style={{ color: prio.color, background: mix(prio.color, 12) }}>
            <Flag size={10} /> {prio.label}
          </span>
        )}
        {outcome && (
          <span className="lea-mission-tag" style={{ color: outcomeColor, background: mix(outcomeColor, 12) }}>
            {r?.success ? <CheckCircle2 size={10} /> : <XCircle size={10} />} {outcome}
          </span>
        )}
        {ev && (
          <span
            className="lea-mission-tag"
            style={{ color: ev.verification.passed ? 'var(--color-success)' : 'var(--color-error)', background: mix(ev.verification.passed ? 'var(--color-success)' : 'var(--color-error)', 12) }}
            title="Vérification automatique après exécution"
          >
            {ev.verification.passed ? <ShieldCheck size={10} /> : <ShieldX size={10} />}
            {ev.verification.passed ? 'Vérifiée' : 'Vérification échouée'}
          </span>
        )}
        {live && <span className="lea-mission-tag" style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}><Loader2 size={10} className="animate-spin" /> Suivi en direct</span>}
        <div className="flex-1" />
        <button type="button" onClick={copyReport} className="lea-mission-action" title="Copier le rapport en Markdown">
          {copied ? <Check size={11} style={{ color: 'var(--color-success)' }} /> : <ClipboardCopy size={11} />}
          {copied ? 'Copié' : 'Rapport'}
        </button>
      </div>

      {/* Erreur / blocage en premier : c'est ce que l'on cherche */}
      {(r?.error || r?.blockReason) && (
        <div className="lea-mission-callout" style={{ ['--tone' as string]: 'var(--color-error)' }} role="alert">
          <AlertTriangle size={12} />
          <div className="min-w-0">
            {r.blockReason && <p className="font-semibold">Bloquée : {r.blockReason}</p>}
            {r.error && <p className="break-words">{r.error}</p>}
          </div>
        </div>
      )}

      {r?.summary && (
        <div className="lea-mission-callout" style={{ ['--tone' as string]: r.success ? 'var(--color-success)' : 'var(--text-muted)' }}>
          <CheckCircle2 size={12} />
          <p className="min-w-0 whitespace-pre-wrap break-words">{r.summary}</p>
        </div>
      )}

      <Section icon={Clock} title="Chronologie" color={color}>
        <Timeline d={data} now={now} />
      </Section>

      {(data.description || data.context?.instructions || criteria.length > 0) && (
        <Section icon={Target} title="Brief de mission" count={criteria.length || undefined} color={color} defaultOpen={live}>
          {data.description && <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{data.description}</p>}
          {data.context?.instructions && (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold">Instructions : </span>{data.context.instructions}
            </p>
          )}
          {criteria.length > 0 && (
            <ul className="mt-2 m-0 list-none space-y-1 p-0">
              {/* Le serveur ne dit pas quel critère est atteint : puces neutres
                  (le verdict global est donné par l'issue et la vérification). */}
              {criteria.map(c => (
                <li key={c} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: 'var(--mission-color)', opacity: 0.6 }} />
                  {c}
                </li>
              ))}
            </ul>
          )}
          {data.context && data.context.files.length > 0 && (
            <div className="mt-2">
              <p className="lea-mission-dt mb-1">Fichiers ciblés</p>
              <FileList files={data.context.files} tone="var(--text-muted)" />
            </div>
          )}
        </Section>
      )}

      {modified.length > 0 && (
        <Section icon={FileCode2} title="Fichiers modifiés" count={modified.length} color="var(--color-warning)">
          <FileList files={modified} tone="var(--color-warning)" />
        </Section>
      )}

      {ev && ev.filesRead.length > 0 && (
        <Section icon={FileSearch} title="Fichiers lus" count={ev.filesRead.length} defaultOpen={false}>
          <FileList files={ev.filesRead} tone="var(--text-dimmed)" />
        </Section>
      )}

      {tools.length > 0 && (
        <Section icon={Wrench} title="Outils utilisés" count={ev!.toolsExecuted.length} defaultOpen={false}>
          <div className="flex flex-wrap gap-1">
            {tools.map(([tool, n]) => (
              <span key={tool} className="lea-mission-chip">{tool.replace(/_/g, ' ')}{n > 1 && <b>×{n}</b>}</span>
            ))}
          </div>
        </Section>
      )}

      {ev && ev.commandsExecuted.length > 0 && (
        <Section icon={Terminal} title="Commandes exécutées" count={ev.commandsExecuted.length} defaultOpen={false}>
          <pre className="lea-mission-pre">{ev.commandsExecuted.map(c => `$ ${c}`).join('\n')}</pre>
        </Section>
      )}

      {ev && (ev.verification.checks.length > 0 || ev.verification.errors.length > 0 || ev.regressions.length > 0 || validationErrors.length > 0) && (
        <Section
          icon={ev.verification.passed ? ShieldCheck : ShieldX}
          title="Vérification"
          count={ev.verification.checks.length + ev.verification.errors.length}
          color={ev.verification.passed ? 'var(--color-success)' : 'var(--color-error)'}
          defaultOpen={!ev.verification.passed}
        >
          <ul className="m-0 list-none space-y-1 p-0 text-xs">
            {ev.verification.checks.map(c => (
              <li key={`c-${c}`} className="flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={12} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: 1 }} />{c}
              </li>
            ))}
            {[...ev.verification.errors, ...validationErrors].map(e => (
              <li key={`e-${e}`} className="flex items-start gap-1.5" style={{ color: 'var(--color-error)' }}>
                <XCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />{e}
              </li>
            ))}
            {ev.regressions.map(g => (
              <li key={`r-${g}`} className="flex items-start gap-1.5" style={{ color: 'var(--color-warning)' }}>
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />Régression : {g}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r && r.suggestions.length > 0 && (
        <Section icon={Lightbulb} title="Suggestions de l'agent" count={r.suggestions.length} color="var(--color-accent-alt)" defaultOpen={false}>
          <ul className="m-0 list-disc space-y-1 pl-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {r.suggestions.map(s => <li key={s}>{s}</li>)}
          </ul>
        </Section>
      )}

      {r && r.delegatedSubTasks.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {r.delegatedSubTasks.length} sous-tâche{r.delegatedSubTasks.length > 1 ? 's' : ''} déléguée{r.delegatedSubTasks.length > 1 ? 's' : ''} à d'autres agents.
        </p>
      )}

      {r?.details && (
        <div>
          <button type="button" onClick={() => setShowDetails(v => !v)} className="lea-mission-more" aria-expanded={showDetails}>
            {showDetails ? 'Masquer le rapport détaillé' : 'Afficher le rapport détaillé'}
          </button>
          {showDetails && <pre className="lea-mission-pre mt-1.5">{r.details}</pre>}
        </div>
      )}
    </div>
  );
}

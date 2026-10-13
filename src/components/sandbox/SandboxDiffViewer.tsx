import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X, ChevronDown, ChevronUp, FileCode2, FilePlus2, FileX2,
  RefreshCcw, Loader2, Check, RotateCcw, CheckCheck, XCircle,
  ArrowLeft, Columns2, AlignJustify, Keyboard, Search, Copy,
  CheckCircle2, Circle, FoldVertical, UnfoldVertical, AlertTriangle,
} from 'lucide-react';
import { useConfirm } from '../ui/ConfirmDialog.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  lineNumOld?: number;
  lineNumNew?: number;
}

export type DiffMode = 'side-by-side' | 'unified';

type StatusFilter = 'all' | FileDiff['status'];
type Segments = Array<{ text: string; highlight: boolean }>;
type SideLine = { num?: number; content: string; type: DiffLine['type']; wordSegments?: Segments };
/** Élément affiché : une ligne, ou un bloc de lignes inchangées replié. */
type RenderItem = { kind: 'row'; idx: number } | { kind: 'fold'; start: number; end: number };

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════

const LINE_HEIGHT = 20;
/** Lignes de contexte gardées autour de chaque changement quand le repli est actif. */
const CONTEXT_LINES = 3;
/** En dessous de ce nombre de lignes inchangées consécutives, on ne replie pas. */
const MIN_FOLD = 4;
/** Au-delà (lignes × lignes du bloc central), le LCS est trop coûteux : diff dégradé. */
const LCS_CELL_LIMIT = 4_000_000;
const VIEWED_KEY = 'leanna.sandbox.viewed';
const PREFS_KEY = 'leanna.sandbox.diffPrefs';

/** Couleurs dérivées des tokens du thème (lisibles en clair comme en sombre). */
const TINT = {
  addRow: 'color-mix(in srgb, var(--color-success) 11%, transparent)',
  addGutter: 'color-mix(in srgb, var(--color-success) 18%, var(--bg-base))',
  addMark: 'color-mix(in srgb, var(--color-success) 32%, transparent)',
  delRow: 'color-mix(in srgb, var(--color-error) 11%, transparent)',
  delGutter: 'color-mix(in srgb, var(--color-error) 18%, var(--bg-base))',
  delMark: 'color-mix(in srgb, var(--color-error) 32%, transparent)',
  gutter: 'var(--bg-base)',
} as const;

const STATUS_META: Record<FileDiff['status'], { label: string; color: string; icon: typeof FileCode2 }> = {
  added: { label: 'Ajouté', color: 'var(--color-success)', icon: FilePlus2 },
  modified: { label: 'Modifié', color: 'var(--color-warning)', icon: FileCode2 },
  deleted: { label: 'Supprimé', color: 'var(--color-error)', icon: FileX2 },
};

const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-Leanna-token': token } : {};
}

// Supprime les lignes vides au début et à la fin pour éviter les artefacts de diff
function trimEmptyLines(content: string): string {
  const lines = content.split('\n');
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') start++;
  while (end > start && lines[end - 1] === '') end--;
  return lines.slice(start, end).join('\n');
}

/**
 * Diff ligne à ligne.
 * 1. Préfixe et suffixe communs retirés d'abord (cas courant : petite
 *    modification dans un gros fichier → le LCS ne porte que sur le milieu).
 * 2. LCS sur un tableau plat Uint32Array (bien moins de mémoire qu'un number[][]).
 * 3. Si le bloc central reste énorme, diff dégradé (tout retiré puis tout
 *    ajouté) plutôt que de geler l'interface.
 */
function computeDiff(original: string, modified: string): { lines: DiffLine[]; degraded: boolean } {
  const a = original.split('\n');
  const b = modified.split('\n');

  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

  const out: DiffLine[] = [];
  for (let k = 0; k < pre; k++) out.push({ type: 'unchanged', content: a[k], lineNumOld: k + 1, lineNumNew: k + 1 });

  const midA = a.slice(pre, a.length - suf);
  const midB = b.slice(pre, b.length - suf);
  const m = midA.length;
  const n = midB.length;
  let degraded = false;

  if (m * n > LCS_CELL_LIMIT) {
    degraded = true;
    midA.forEach((content, k) => out.push({ type: 'removed', content, lineNumOld: pre + k + 1 }));
    midB.forEach((content, k) => out.push({ type: 'added', content, lineNumNew: pre + k + 1 }));
  } else if (m > 0 || n > 0) {
    const w = n + 1;
    const dp = new Uint32Array((m + 1) * w);
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i * w + j] = midA[i - 1] === midB[j - 1]
          ? dp[(i - 1) * w + j - 1] + 1
          : Math.max(dp[(i - 1) * w + j], dp[i * w + j - 1]);
      }
    }
    const mid: DiffLine[] = [];
    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
        mid.push({ type: 'unchanged', content: midA[i - 1], lineNumOld: pre + i, lineNumNew: pre + j });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i * w + j - 1] >= dp[(i - 1) * w + j])) {
        mid.push({ type: 'added', content: midB[j - 1], lineNumNew: pre + j });
        j--;
      } else {
        mid.push({ type: 'removed', content: midA[i - 1], lineNumOld: pre + i });
        i--;
      }
    }
    for (let k = mid.length - 1; k >= 0; k--) out.push(mid[k]);
  }

  for (let k = suf; k > 0; k--) {
    out.push({
      type: 'unchanged',
      content: a[a.length - k],
      lineNumOld: a.length - k + 1,
      lineNumNew: b.length - k + 1,
    });
  }
  return { lines: out, degraded };
}

function computeWordDiff(oldText: string, newText: string): { oldSegments: Segments; newSegments: Segments } {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const m = oldTokens.length;
  const n = newTokens.length;
  const w = n + 1;
  const dp = new Uint32Array((m + 1) * w);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i * w + j] = oldTokens[i - 1] === newTokens[j - 1]
        ? dp[(i - 1) * w + j - 1] + 1
        : Math.max(dp[(i - 1) * w + j], dp[i * w + j - 1]);
    }
  }
  const oldMarks = new Array(m).fill(true);
  const newMarks = new Array(n).fill(true);
  let ii = m;
  let jj = n;
  while (ii > 0 && jj > 0) {
    if (oldTokens[ii - 1] === newTokens[jj - 1]) {
      oldMarks[ii - 1] = false;
      newMarks[jj - 1] = false;
      ii--; jj--;
    } else if (dp[ii * w + jj - 1] >= dp[(ii - 1) * w + jj]) {
      jj--;
    } else {
      ii--;
    }
  }
  return { oldSegments: mergeSegments(oldTokens, oldMarks), newSegments: mergeSegments(newTokens, newMarks) };
}

function tokenize(text: string): string[] {
  // Amélioré : capture les mots, espaces, et caractères spéciaux séparément
  // pour une meilleure détection des petits changements
  const tokens = text.match(/(\S+)|(\s+)|([\n])/g) || [];
  // Fusionne les tokens consécutifs de même type (sauf newlines)
  const merged: string[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    // Fusionne avec le dernier token si même type (non-vide et pas newline)
    if (last && last !== '\n' && token !== '\n' && 
        ((/\S/.test(last) && /\S/.test(token)) || 
         (/\s/.test(last) && /\s/.test(token)))) {
      merged[merged.length - 1] = last + token;
    } else {
      merged.push(token);
    }
  }
  return merged.length > 0 ? merged : [''];
}

function mergeSegments(tokens: string[], marks: boolean[]): Array<{ text: string; highlight: boolean }> {
  const segments: Array<{ text: string; highlight: boolean }> = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Ignore les newlines isolés pour éviter les segments vides
    if (token === '\n') continue;
    
    const last = segments[segments.length - 1];
    if (last && last.highlight === marks[i]) {
      last.text += token;
    } else {
      segments.push({ text: token, highlight: marks[i] });
    }
  }
  return segments;
}

function highlightSyntax(text: string): Array<{ text: string; color: string }> {
  const spans: Array<{ text: string; color: string }> = [];
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:import|export|from|const|let|var|function|async|await|return|if|else|for|while|switch|case|break|continue|new|class|interface|type|extends|implements|throw|try|catch|finally|typeof|instanceof|in|of|default|void|null|undefined|true|false|this|super|static|abstract|readonly|private|protected|public|enum|namespace|module|declare|as|is|keyof|infer|never|unknown|any|number|string|boolean|object|symbol|bigint)\b)|(\/\/.*$)|(\/\*[\s\S]*?\*\/)|((?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?:n)?)|([{}()[\];,.:?!<>=+\-*/%&|^~@#])/gm;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: text.slice(lastIndex, match.index), color: '' });
    }

    if (match[1]) {
      spans.push({ text: match[0], color: 'var(--color-success)' });
    } else if (match[2]) {
      spans.push({ text: match[0], color: 'var(--color-accent-alt)' });
    } else if (match[3] || match[4]) {
      spans.push({ text: match[0], color: 'var(--text-muted)' });
    } else if (match[5]) {
      spans.push({ text: match[0], color: 'var(--accent-primary)' });
    } else if (match[6]) {
      spans.push({ text: match[0], color: 'var(--text-muted)' });
    } else {
      spans.push({ text: match[0], color: '' });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    spans.push({ text: text.slice(lastIndex), color: '' });
  }

  return spans.length > 0 ? spans : [{ text, color: '' }];
}

/** Construit la liste affichée : lignes visibles + blocs inchangés repliés. */
function buildRenderItems(changed: boolean[], foldEnabled: boolean, expandedFolds: Set<number>): RenderItem[] {
  const n = changed.length;
  if (!foldEnabled || !changed.some(Boolean)) {
    return Array.from({ length: n }, (_, idx) => ({ kind: 'row' as const, idx }));
  }
  const keep = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!changed[i]) continue;
    for (let k = Math.max(0, i - CONTEXT_LINES); k <= Math.min(n - 1, i + CONTEXT_LINES); k++) keep[k] = true;
  }
  const items: RenderItem[] = [];
  let i = 0;
  while (i < n) {
    if (keep[i]) { items.push({ kind: 'row', idx: i }); i++; continue; }
    let j = i;
    while (j < n && !keep[j]) j++;
    if (j - i >= MIN_FOLD && !expandedFolds.has(i)) {
      items.push({ kind: 'fold', start: i, end: j });
    } else {
      for (let k = i; k < j; k++) items.push({ kind: 'row', idx: k });
    }
    i = j;
  }
  return items;
}

function readViewed(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(VIEWED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}

function readPrefs(): { mode: DiffMode; fold: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { mode?: DiffMode; fold?: boolean };
    return { mode: p.mode === 'unified' ? 'unified' : 'side-by-side', fold: p.fold !== false };
  } catch { return { mode: 'side-by-side', fold: true }; }
}

/** Le raccourci clavier doit-il être ignoré (saisie, modificateur, dialogue ouvert) ? */
function shouldIgnoreKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest('.monaco-editor'))) return true;
  // Un dialogue modal (confirmation…) gère lui-même son clavier
  return !!document.querySelector('[role="dialog"][aria-modal="true"]');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const StatusBadge = memo(function StatusBadge({ status }: { status: FileDiff['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider"
      style={{ color: meta.color, backgroundColor: mix(meta.color, 12), border: `1px solid ${mix(meta.color, 25)}` }}
    >
      {meta.label}
    </span>
  );
});

// Barre proportionnelle style GitHub : 5 cases réparties entre ajouts/suppressions
const DiffStatBar = memo(function DiffStatBar({ added, removed }: { added: number; removed: number }) {
  const total = added + removed;
  if (total === 0) return null;
  const SEGMENTS = 5;
  let greenCount: number;
  if (added === 0) greenCount = 0;
  else if (removed === 0) greenCount = SEGMENTS;
  else greenCount = Math.min(SEGMENTS - 1, Math.max(1, Math.round((added / total) * SEGMENTS)));
  return (
    <span className="flex items-center gap-0.5" aria-hidden title={`${added} ajout(s), ${removed} suppression(s)`}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-[2px]"
          style={{ backgroundColor: i < greenCount ? 'var(--color-success)' : 'var(--color-error)', opacity: 0.85 }}
        />
      ))}
    </span>
  );
});

const SyntaxSpan = memo(function SyntaxSpan({ text }: { text: string }) {
  const tokens = highlightSyntax(text);
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} style={tok.color ? { color: tok.color } : undefined}>{tok.text}</span>
      ))}
    </>
  );
});

const SyntaxLine = memo(function SyntaxLine({
  content, segments, tone,
}: { content: string; segments?: Segments; tone?: 'add' | 'del' }) {
  if (!segments) return <SyntaxSpan text={content} />;
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark
            key={i}
            style={{
              backgroundColor: tone === 'del' ? TINT.delMark : TINT.addMark,
              color: 'inherit',
              borderRadius: 3,
              padding: '0 1px',
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <SyntaxSpan key={i} text={seg.text} />
        ),
      )}
    </>
  );
});

/** Ligne de code : gouttière collante (numéros), marqueur coloré, contenu coloré. */
const CodeRow = memo(function CodeRow({
  idx, nums, type, content, segments, prefix,
}: {
  idx: number;
  nums: Array<number | undefined>;
  type: DiffLine['type'];
  content: string;
  segments?: Segments;
  prefix?: boolean;
}) {
  const isAdd = type === 'added';
  const isDel = type === 'removed';
  const rowBg = isAdd ? TINT.addRow : isDel ? TINT.delRow : 'transparent';
  const gutterBg = isAdd ? TINT.addGutter : isDel ? TINT.delGutter : TINT.gutter;
  const accent = isAdd ? 'var(--color-success)' : isDel ? 'var(--color-error)' : 'transparent';
  return (
    <div data-row={idx} className="lea-diff-row flex w-max min-w-full" style={{ backgroundColor: rowBg, minHeight: LINE_HEIGHT }}>
      <span
        className="sticky left-0 z-[1] flex flex-shrink-0 select-none"
        style={{ backgroundColor: gutterBg, boxShadow: `inset -2px 0 0 ${accent}` }}
        aria-hidden="true"
      >
        {nums.map((n, k) => (
          <span key={k} className="inline-block w-10 pr-2 text-right tabular-nums" style={{ color: type === 'unchanged' ? 'var(--text-dimmed)' : accent }}>
            {n ?? ''}
          </span>
        ))}
      </span>
      {prefix && (
        <span className="inline-block w-5 flex-shrink-0 select-none text-center font-bold" style={{ color: accent }} aria-hidden="true">
          {isAdd ? '+' : isDel ? '−' : ''}
        </span>
      )}
      <span className="flex-1 whitespace-pre pl-2 pr-4" style={{ color: 'var(--text-primary)' }}>
        <SyntaxLine content={content} segments={segments} tone={isDel ? 'del' : 'add'} />
      </span>
    </div>
  );
});

/** Bloc de lignes inchangées replié : un clic l'affiche. */
const FoldRow = memo(function FoldRow({
  count, onExpand, showLabel,
}: { count: number; onExpand: () => void; showLabel: boolean }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="lea-diff-fold sticky left-0 flex w-full items-center gap-2 px-3 text-xs"
      style={{ height: LINE_HEIGHT + 6 }}
      title={`Afficher ${count} ligne${count > 1 ? 's' : ''} inchangée${count > 1 ? 's' : ''}`}
      aria-label={`Afficher ${count} lignes inchangées`}
    >
      <UnfoldVertical size={12} aria-hidden="true" />
      {showLabel && <span>{count} ligne{count > 1 ? 's' : ''} inchangée{count > 1 ? 's' : ''}</span>}
    </button>
  );
});

// ─── File List Sidebar ──────────────────────────────────────────────────────

const FileList = memo(function FileList({
  files, allFiles, selectedPath, onSelect, loading, viewed, onToggleViewed,
  query, onQuery, statusFilter, onStatusFilter,
}: {
  files: FileDiff[];
  allFiles: FileDiff[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  loading: boolean;
  viewed: Set<string>;
  onToggleViewed: (path: string) => void;
  query: string;
  onQuery: (q: string) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
}) {
  const counts = useMemo(() => {
    const c = { all: allFiles.length, added: 0, modified: 0, deleted: 0 };
    for (const f of allFiles) c[f.status]++;
    return c;
  }, [allFiles]);
  const viewedCount = allFiles.filter(f => viewed.has(f.path)).length;
  const progress = allFiles.length ? viewedCount / allFiles.length : 0;

  const FILTERS: Array<{ id: StatusFilter; label: string; color: string }> = [
    { id: 'all', label: 'Tous', color: 'var(--text-secondary)' },
    { id: 'modified', label: 'Modif.', color: STATUS_META.modified.color },
    { id: 'added', label: 'Ajout', color: STATUS_META.added.color },
    { id: 'deleted', label: 'Suppr.', color: STATUS_META.deleted.color },
  ];

  return (
    <aside
      className="flex w-64 flex-shrink-0 flex-col lg:w-72"
      style={{ borderRight: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
      aria-label="Fichiers modifiés"
    >
      {/* Progression de la revue */}
      <div className="px-3 pt-3 pb-2">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Revue</span>
          <span className="tabular-nums" style={{ color: progress === 1 ? 'var(--color-success)' : 'var(--text-muted)' }}>
            {viewedCount}/{allFiles.length} vu{viewedCount > 1 ? 's' : ''}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }} role="progressbar" aria-valuemin={0} aria-valuemax={allFiles.length} aria-valuenow={viewedCount} aria-label="Fichiers examinés">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: progress === 1 ? 'var(--color-success)' : 'var(--accent-primary)', originX: 0 }}
            initial={false}
            animate={{ scaleX: progress }}
            transition={{ type: 'spring', stiffness: 200, damping: 28 }}
          />
        </div>
      </div>

      {/* Recherche */}
      <div className="px-3 pb-2">
        <label className="lea-diff-search flex items-center gap-2 rounded-lg px-2.5" style={{ height: 30 }}>
          <Search size={12} style={{ color: 'var(--text-dimmed)', flexShrink: 0 }} aria-hidden="true" />
          <input
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Filtrer les fichiers…"
            aria-label="Filtrer les fichiers"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text-primary)', boxShadow: 'none' }}
          />
          {query && (
            <button type="button" onClick={() => onQuery('')} aria-label="Effacer le filtre" className="rounded p-0.5 hover:bg-[var(--bg-hover)]">
              <X size={11} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </label>
      </div>

      {/* Filtres par statut */}
      <div className="flex flex-wrap gap-1 px-3 pb-2" role="group" aria-label="Filtrer par statut">
        {FILTERS.map(f => {
          const active = statusFilter === f.id;
          const n = counts[f.id];
          if (f.id !== 'all' && n === 0) return null;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onStatusFilter(f.id)}
              aria-pressed={active}
              className="lea-diff-chip flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              data-active={active ? 'true' : undefined}
              style={{ ['--chip' as string]: f.color }}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar" style={{ borderTop: '1px solid var(--border-base)' }}>
        {loading ? (
          <div className="space-y-2 p-3" aria-busy="true">
            {[70, 90, 60, 80].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="skeleton-shimmer h-3.5 w-3.5" style={{ borderRadius: 3 }} />
                <div className="skeleton-shimmer h-2.5" style={{ width: `${w}%`, borderRadius: 3 }} />
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center">
            <FileCode2 size={20} style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {allFiles.length === 0 ? 'Aucune modification' : 'Aucun fichier ne correspond'}
            </p>
          </div>
        ) : (
          <ul className="m-0 list-none p-1.5" role="listbox" aria-label="Fichiers">
            {files.map(file => {
              const isSelected = selectedPath === file.path;
              const meta = STATUS_META[file.status];
              const Icon = meta.icon;
              const isViewed = viewed.has(file.path);
              const name = file.path.split('/').pop();
              const dir = file.path.slice(0, Math.max(0, file.path.length - (name?.length ?? 0) - 1));
              return (
                <li key={file.path} role="option" aria-selected={isSelected}>
                  <div
                    className="lea-diff-file group flex items-center gap-2 rounded-lg px-2 py-1.5"
                    data-active={isSelected ? 'true' : undefined}
                    style={{ ['--file-accent' as string]: meta.color, opacity: isViewed && !isSelected ? 0.6 : 1 }}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleViewed(file.path)}
                      className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                      title={isViewed ? 'Marquer comme non vu (V)' : 'Marquer comme vu (V)'}
                      aria-label={isViewed ? `Marquer ${name} comme non vu` : `Marquer ${name} comme vu`}
                      aria-pressed={isViewed}
                    >
                      {isViewed
                        ? <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
                        : <Circle size={13} style={{ color: 'var(--text-dimmed)' }} />}
                    </button>
                    <button type="button" onClick={() => onSelect(file.path)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={file.path}>
                      <Icon size={13} style={{ color: meta.color, flexShrink: 0 }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-sm font-medium"
                          style={{
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            textDecoration: file.status === 'deleted' ? 'line-through' : undefined,
                          }}
                        >
                          {name}
                        </span>
                        {dir && <span className="block truncate font-mono text-xs" style={{ color: 'var(--text-dimmed)' }}>{dir}</span>}
                      </span>
                      <span
                        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-xs font-bold leading-none"
                        style={{ color: meta.color, backgroundColor: mix(meta.color, 14) }}
                        aria-label={meta.label}
                      >
                        {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface SandboxDiffViewerProps {
  onClose: () => void;
  initialSelectedFile?: string | null;
  embedded?: boolean;
}

export function SandboxDiffViewer({ onClose, initialSelectedFile, embedded = false }: SandboxDiffViewerProps) {
  const { confirm } = useConfirm();
  const reduceMotion = useReducedMotion() ?? false;

  // ─── State ───────────────────────────────────────────────────────────────────
  const [initialPrefs] = useState(readPrefs);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(initialSelectedFile ?? null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [modifiedContent, setModifiedContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>(initialPrefs.mode);
  const [foldContext, setFoldContext] = useState(initialPrefs.fold);
  const [expandedFolds, setExpandedFolds] = useState<Set<number>>(() => new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [viewed, setViewed] = useState<Set<string>>(readViewed);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: diffMode, fold: foldContext })); } catch { /* ignore */ }
  }, [diffMode, foldContext]);
  useEffect(() => {
    try { sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...viewed])); } catch { /* ignore */ }
  }, [viewed]);

  // ─── Refs for scrolling ─────────────────────────────────────────────────────
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const unifiedScrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(0);

  // ─── Load file list ────────────────────────────────────────────────────────
  // Sans dépendance à selectedFile : sélectionner un fichier ne relance plus
  // le chargement de toute la liste (c'était le cas avant).
  const loadDiffs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sandbox/diff', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.status === 'success') {
        const list: FileDiff[] = data.diffs || [];
        setFiles(list);
        setSelectedFile(prev => {
          if (prev && list.some(f => f.path === prev)) return prev;
          return list[0]?.path ?? null;
        });
        // Les fichiers disparus n'ont plus à compter comme « vus »
        setViewed(prev => {
          const next = new Set([...prev].filter(p => list.some(f => f.path === p)));
          return next.size === prev.size ? prev : next;
        });
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDiffs(); }, [loadDiffs]);

  // Rafraîchit la liste quand le sandbox change ailleurs (agent, autre panneau)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => { if (t) clearTimeout(t); t = setTimeout(() => { void loadDiffs(); }, 250); };
    window.addEventListener('Leanna-sandbox-file-changed', onChange);
    return () => { if (t) clearTimeout(t); window.removeEventListener('Leanna-sandbox-file-changed', onChange); };
  }, [loadDiffs]);

  // ─── Load file content ─────────────────────────────────────────────────────
  const loadSeq = useRef(0);
  const loadFileContent = useCallback(async (filePath: string) => {
    const seq = ++loadSeq.current; // ignore les réponses d'un fichier déjà quitté
    setFileLoading(true);
    setOriginalContent(null);
    setModifiedContent(null);
    try {
      const res = await fetch(`/api/sandbox/file-diff?path=${encodeURIComponent(filePath)}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (seq !== loadSeq.current) return;
      if (data.status === 'success') {
        setOriginalContent(trimEmptyLines(data.original ?? ''));
        setModifiedContent(trimEmptyLines(data.modified ?? ''));
      }
    } catch {
      /* silent */
    } finally {
      if (seq === loadSeq.current) setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile);
      setCurrentChunkIdx(0);
      setExpandedFolds(new Set());
    }
  }, [selectedFile, loadFileContent]);

  // ─── Liste filtrée (recherche + statut) ─────────────────────────────────────
  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter(f => (statusFilter === 'all' || f.status === statusFilter) && (!q || f.path.toLowerCase().includes(q)));
  }, [files, query, statusFilter]);

  /** Fichier à sélectionner après traitement de `path` : le suivant, sinon le précédent. */
  const neighbourOf = useCallback((path: string) => {
    const list = visibleFiles.length ? visibleFiles : files;
    const i = list.findIndex(f => f.path === path);
    if (i === -1) return null;
    return list[i + 1]?.path ?? list[i - 1]?.path ?? null;
  }, [visibleFiles, files]);

  const toggleViewed = useCallback((path: string) => {
    setViewed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  // ─── Accept / Reject file ──────────────────────────────────────────────────
  const handleAcceptFile = useCallback(async (filePath: string) => {
    setActionBusy(filePath);
    setFeedback(null);
    const next = neighbourOf(filePath);
    try {
      const res = await fetch('/api/sandbox/accept-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success' && data.applied === true) {
        setFeedback({ type: 'success', msg: `${filePath.split('/').pop()} appliqué au projet` });
        setSelectedFile(next); // enchaîne directement sur le fichier suivant
        window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
        await loadDiffs();
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Le fichier n’a pas pu être appliqué' });
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Erreur réseau' });
    } finally {
      setActionBusy(null);
    }
  }, [loadDiffs, neighbourOf]);

  const handleRejectFile = useCallback(async (filePath: string) => {
    const name = filePath.split('/').pop();
    const ok = await confirm({
      title: 'Rejeter ce fichier ?',
      message: `Les modifications de « ${name} » dans le sandbox seront définitivement annulées.`,
      confirmLabel: 'Rejeter',
      cancelLabel: 'Annuler',
      variant: 'danger',
    });
    if (!ok) return;
    setActionBusy(filePath);
    setFeedback(null);
    const next = neighbourOf(filePath);
    try {
      const res = await fetch('/api/sandbox/reject-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success' && data.reverted === true) {
        setFeedback({ type: 'success', msg: `${name} rejeté` });
        setSelectedFile(next);
        window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
        await loadDiffs();
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Le fichier n’a pas pu être rejeté' });
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Erreur réseau' });
    } finally {
      setActionBusy(null);
    }
  }, [loadDiffs, neighbourOf, confirm]);

  // ─── Accept / Reject ALL (avec confirmation : actions irréversibles) ────────
  const handleAcceptAll = useCallback(async () => {
    const ok = await confirm({
      title: `Appliquer ${files.length} fichier${files.length > 1 ? 's' : ''} au projet ?`,
      message: 'Toutes les modifications du sandbox seront écrites dans le workspace réel (après validation).',
      confirmLabel: 'Tout appliquer',
      cancelLabel: 'Annuler',
      variant: 'warning',
    });
    if (!ok) return;
    setActionBusy('all');
    setFeedback(null);
    try {
      const res = await fetch('/api/sandbox/sync', { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      if (data.status === 'success') {
        setFeedback({ type: 'success', msg: `${files.length} fichier(s) appliqué(s)` });
        setFiles([]);
        setSelectedFile(null);
        window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
      } else if (data.status === 'validation_failed') {
        const errCount = data.errorCount || 0;
        const warnCount = data.warningCount || 0;
        setFeedback({ type: 'error', msg: `Validation échouée : ${errCount} erreur(s), ${warnCount} avertissement(s). Corrigez les erreurs avant de synchroniser.` });
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Erreur lors de la synchronisation' });
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Erreur réseau' });
    } finally {
      setActionBusy(null);
    }
  }, [files.length, confirm]);

  const handleRejectAll = useCallback(async () => {
    const ok = await confirm({
      title: `Rejeter les ${files.length} fichiers modifiés ?`,
      message: 'Toutes les modifications en attente dans le sandbox seront définitivement perdues. Cette action est irréversible.',
      confirmLabel: 'Tout rejeter',
      cancelLabel: 'Annuler',
      variant: 'danger',
    });
    if (!ok) return;
    setActionBusy('all');
    setFeedback(null);
    try {
      const res = await fetch('/api/sandbox/discard', { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setFeedback({ type: 'success', msg: 'Toutes les modifications rejetées' });
        setFiles([]);
        setSelectedFile(null);
        window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Erreur lors de l\'abandon des modifications' });
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Erreur réseau' });
    } finally {
      setActionBusy(null);
    }
  }, [files.length, confirm]);

  const copyPath = useCallback(() => {
    if (!selectedFile) return;
    navigator.clipboard?.writeText(selectedFile).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* presse-papiers indisponible */ });
  }, [selectedFile]);

  // ─── Compute diff lines ────────────────────────────────────────────────────
  const { lines: diffLines, degraded } = useMemo(() => {
    if (originalContent === null || modifiedContent === null) return { lines: [] as DiffLine[], degraded: false };
    return computeDiff(originalContent, modifiedContent);
  }, [originalContent, modifiedContent]);

  const wordDiffMap = useMemo(() => {
    const map = new Map<number, { oldSegments: Segments; newSegments: Segments }>();
    if (degraded) return map; // diff dégradé : pas de diff au mot (trop coûteux)
    for (let i = 0; i < diffLines.length - 1; i++) {
      if (diffLines[i].type === 'removed' && diffLines[i + 1].type === 'added') {
        map.set(i, computeWordDiff(diffLines[i].content, diffLines[i + 1].content));
      }
    }
    return map;
  }, [diffLines, degraded]);

  const { leftLines, rightLines } = useMemo(() => {
    const left: SideLine[] = [];
    const right: SideLine[] = [];
    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      const wordDiff = wordDiffMap.get(i);
      if (line.type === 'unchanged') {
        left.push({ num: line.lineNumOld, content: line.content, type: 'unchanged' });
        right.push({ num: line.lineNumNew, content: line.content, type: 'unchanged' });
      } else if (line.type === 'removed') {
        if (wordDiff) {
          left.push({ num: line.lineNumOld, content: line.content, type: 'removed', wordSegments: wordDiff.oldSegments });
          right.push({ num: diffLines[i + 1].lineNumNew, content: diffLines[i + 1].content, type: 'added', wordSegments: wordDiff.newSegments });
          i++;
        } else {
          left.push({ num: line.lineNumOld, content: line.content, type: 'removed' });
          right.push({ content: '', type: 'unchanged' });
        }
      } else {
        left.push({ content: '', type: 'unchanged' });
        right.push({ num: line.lineNumNew, content: line.content, type: 'added' });
      }
    }
    return { leftLines: left, rightLines: right };
  }, [diffLines, wordDiffMap]);

  // ─── Lignes changées, blocs repliés, chunks ─────────────────────────────────
  const sideChanged = useMemo(
    () => leftLines.map((l, i) => l.type !== 'unchanged' || rightLines[i].type !== 'unchanged'),
    [leftLines, rightLines],
  );
  const unifiedChanged = useMemo(() => diffLines.map(l => l.type !== 'unchanged'), [diffLines]);
  const changed = diffMode === 'side-by-side' ? sideChanged : unifiedChanged;

  const renderItems = useMemo(
    () => buildRenderItems(changed, foldContext, expandedFolds),
    [changed, foldContext, expandedFolds],
  );
  const hiddenLines = useMemo(
    () => renderItems.reduce((n, it) => (it.kind === 'fold' ? n + it.end - it.start : n), 0),
    [renderItems],
  );

  const chunkIndices = useMemo(() => {
    const indices: number[] = [];
    let inChunk = false;
    changed.forEach((c, i) => {
      if (c && !inChunk) { indices.push(i); inChunk = true; } else if (!c) inChunk = false;
    });
    return indices;
  }, [changed]);
  const totalChunks = chunkIndices.length;

  // Changer de mode réinitialise les blocs dépliés (les index diffèrent)
  useEffect(() => { setExpandedFolds(new Set()); setCurrentChunkIdx(0); }, [diffMode]);

  // ─── Navigation ────────────────────────────────────────────────────────────
  // Positionne via le DOM (les blocs repliés faussent un calcul index × hauteur).
  const navigateToChunk = useCallback((idx: number) => {
    if (idx < 0 || idx >= chunkIndices.length) return;
    setCurrentChunkIdx(idx);
    const lineIdx = chunkIndices[idx];
    const containers = diffMode === 'side-by-side'
      ? [leftScrollRef.current, rightScrollRef.current]
      : [unifiedScrollRef.current];
    for (const c of containers) {
      const row = c?.querySelector<HTMLElement>(`[data-row="${lineIdx}"]`);
      if (c && row) c.scrollTo({ top: Math.max(0, row.offsetTop - 60), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [diffMode, chunkIndices, reduceMotion]);

  const goNextChunk = useCallback(() => navigateToChunk(Math.min(currentChunkIdx + 1, totalChunks - 1)), [currentChunkIdx, totalChunks, navigateToChunk]);
  const goPrevChunk = useCallback(() => navigateToChunk(Math.max(currentChunkIdx - 1, 0)), [currentChunkIdx, navigateToChunk]);

  const selectNextFile = useCallback(() => {
    const list = visibleFiles;
    if (list.length === 0) return;
    const idx = list.findIndex(f => f.path === selectedFile);
    if (idx < list.length - 1) setSelectedFile(list[idx + 1].path);
  }, [selectedFile, visibleFiles]);

  const selectPrevFile = useCallback(() => {
    const list = visibleFiles;
    const idx = list.findIndex(f => f.path === selectedFile);
    if (idx > 0) setSelectedFile(list[idx - 1].path);
  }, [selectedFile, visibleFiles]);

  // ─── Synchronized scrolling ──────────────────────────────────────────────
  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (isScrolling.current) return;
    isScrolling.current = true;
    const sourceEl = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const targetEl = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop;
      targetEl.scrollLeft = sourceEl.scrollLeft;
    }
    requestAnimationFrame(() => { isScrolling.current = false; });
  }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || shouldIgnoreKey(e)) return;
      const withMod = e.ctrlKey || e.metaKey;
      // Ctrl/⌘ + ↑/↓ : changer de fichier. Toute autre combinaison avec
      // modificateur est ignorée (Ctrl+A ne doit PAS accepter un fichier).
      if (withMod && !e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (e.key === 'ArrowDown') selectNextFile(); else selectPrevFile();
        return;
      }
      if (withMod || e.altKey) return;

      switch (e.key) {
        case 'Escape':
          if (showShortcuts) setShowShortcuts(false); else onClose();
          break;
        case 'a': case 'A':
          if (selectedFile && !actionBusy) handleAcceptFile(selectedFile);
          break;
        case 'r': case 'R':
          if (selectedFile && !actionBusy) handleRejectFile(selectedFile);
          break;
        case 'n': case 'N': case 'j': case 'J':
          goNextChunk();
          break;
        case 'p': case 'P': case 'k': case 'K':
          goPrevChunk();
          break;
        case 'v': case 'V':
          if (selectedFile) toggleViewed(selectedFile);
          break;
        case 'f': case 'F':
          setFoldContext(prev => !prev);
          break;
        case 'm': case 'M':
          setDiffMode(prev => (prev === 'side-by-side' ? 'unified' : 'side-by-side'));
          break;
        case '?':
          setShowShortcuts(prev => !prev);
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    onClose, showShortcuts, selectedFile, actionBusy, handleAcceptFile, handleRejectFile,
    goNextChunk, goPrevChunk, selectNextFile, selectPrevFile, toggleViewed,
  ]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const l of diffLines) {
      if (l.type === 'added') added++;
      if (l.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  const selectedFileStatus = files.find(f => f.path === selectedFile)?.status;
  const isBusy = actionBusy !== null;
  const isViewed = !!selectedFile && viewed.has(selectedFile);
  const expandFold = (start: number) => setExpandedFolds(prev => new Set(prev).add(start));

  const SHORTCUTS: Array<[string, string]> = [
    ['Accepter le fichier', 'A'], ['Rejeter le fichier', 'R'], ['Marquer comme vu', 'V'],
    ['Changement suivant', 'N / J'], ['Changement précédent', 'P / K'],
    ['Fichier suivant', 'Ctrl+↓'], ['Fichier précédent', 'Ctrl+↑'],
    ['Replier le contexte', 'F'], ['Côte à côte / unifié', 'M'], ['Fermer', 'Esc'],
  ];

  // ─── Render ──────────────────────────────────────────────────────────────
  const renderSide = (side: 'left' | 'right') => {
    const lines = side === 'left' ? leftLines : rightLines;
    return renderItems.map(it => (
      it.kind === 'fold' ? (
        <FoldRow
          key={`f${it.start}`}
          count={it.end - it.start}
          onExpand={() => expandFold(it.start)}
          showLabel={side === 'left'}
        />
      ) : (
        <CodeRow
          key={it.idx}
          idx={it.idx}
          nums={[lines[it.idx].num]}
          type={lines[it.idx].type}
          content={lines[it.idx].content}
          segments={lines[it.idx].wordSegments}
        />
      )
    ));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`lea-diff ${embedded ? 'relative flex flex-1 min-h-0 flex-col' : 'fixed inset-0 z-50 flex flex-col'}`}
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div
        className="lea-diff-header flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-base)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {embedded ? 'Comparer les modifications' : 'Modifications Sandbox'}
          </h2>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
            {files.length} fichier{files.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* Mode : contrôle segmenté avec pastille glissante */}
          <div className="lea-diff-seg relative flex rounded-lg p-0.5" role="group" aria-label="Mode d'affichage">
            {(['side-by-side', 'unified'] as const).map(m => {
              const active = diffMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDiffMode(m)}
                  aria-pressed={active}
                  title={`${m === 'side-by-side' ? 'Côte à côte' : 'Unifié'} (M)`}
                  className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
                  style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  {active && (
                    <motion.span
                      layoutId="lea-diff-mode"
                      className="absolute inset-0 rounded-md"
                      style={{ backgroundColor: 'var(--bg-panel)', boxShadow: 'var(--shadow-xs)' }}
                      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {m === 'side-by-side' ? <Columns2 size={12} /> : <AlignJustify size={12} />}
                    {m === 'side-by-side' ? 'Split' : 'Unifié'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Repli du contexte */}
          <button
            type="button"
            onClick={() => setFoldContext(v => !v)}
            aria-pressed={foldContext}
            className="lea-diff-btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
            data-active={foldContext ? 'true' : undefined}
            title={foldContext ? 'Afficher tout le fichier (F)' : 'Replier les lignes inchangées (F)'}
          >
            {foldContext ? <FoldVertical size={12} /> : <UnfoldVertical size={12} />}
            <span className="hidden md:inline">{foldContext ? 'Contexte' : 'Tout'}</span>
          </button>

          {/* Navigation entre changements */}
          {totalChunks > 0 && (
            <div className="lea-diff-seg flex items-center gap-0.5 rounded-lg px-0.5" role="group" aria-label="Navigation entre les changements">
              <button type="button" onClick={goPrevChunk} disabled={currentChunkIdx === 0} className="lea-diff-icon rounded-md p-1.5" title="Changement précédent (P)" aria-label="Changement précédent">
                <ChevronUp size={13} />
              </button>
              <span className="px-1 font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }} aria-live="polite">
                {currentChunkIdx + 1}/{totalChunks}
              </span>
              <button type="button" onClick={goNextChunk} disabled={currentChunkIdx >= totalChunks - 1} className="lea-diff-icon rounded-md p-1.5" title="Changement suivant (N)" aria-label="Changement suivant">
                <ChevronDown size={13} />
              </button>
            </div>
          )}

          {files.length > 1 && (
            <>
              <span className="mx-1 h-5 w-px" style={{ backgroundColor: 'var(--border-base)' }} aria-hidden="true" />
              <button type="button" onClick={handleAcceptAll} disabled={isBusy} className="lea-diff-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ ['--tone' as string]: 'var(--color-success)' }} title="Appliquer toutes les modifications au projet">
                {actionBusy === 'all' ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
                <span className="hidden sm:inline">Tout accepter</span>
              </button>
              <button type="button" onClick={handleRejectAll} disabled={isBusy} className="lea-diff-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ ['--tone' as string]: 'var(--color-error)' }} title="Rejeter toutes les modifications">
                <XCircle size={12} />
                <span className="hidden sm:inline">Tout rejeter</span>
              </button>
              <span className="mx-1 h-5 w-px" style={{ backgroundColor: 'var(--border-base)' }} aria-hidden="true" />
            </>
          )}

          <button type="button" onClick={() => void loadDiffs()} className="lea-diff-icon rounded-lg p-2" title="Rafraîchir" aria-label="Rafraîchir la liste">
            <RefreshCcw size={14} className={loading ? 'animate-spin' : undefined} />
          </button>
          <button type="button" onClick={() => setShowShortcuts(p => !p)} className="lea-diff-icon rounded-lg p-2" title="Raccourcis clavier (?)" aria-label="Raccourcis clavier" aria-expanded={showShortcuts} data-active={showShortcuts ? 'true' : undefined}>
            <Keyboard size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="lea-diff-icon rounded-lg p-2"
            title={embedded ? 'Retour aux contrôles du sandbox (Escape)' : 'Fermer (Escape)'}
            aria-label={embedded ? 'Retour aux contrôles du sandbox' : 'Fermer'}
          >
            {embedded ? <ArrowLeft size={16} /> : <X size={16} />}
          </button>
        </div>
      </div>

      {/* ─── Shortcuts overlay ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="lea-dialog absolute top-14 right-4 z-50 w-64 rounded-xl p-4"
            style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
            role="dialog"
            aria-label="Raccourcis clavier"
          >
            <p className="mb-2.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Raccourcis clavier</p>
            <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {SHORTCUTS.map(([label, key]) => (
                <div key={label} className="flex items-center justify-between gap-6">
                  <span>{label}</span>
                  <kbd className="kbd">{key}</kbd>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Feedback toast ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className="absolute top-14 left-1/2 z-50 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2 shadow-lg"
            style={{
              backgroundColor: `color-mix(in srgb, ${feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'} 14%, var(--bg-panel))`,
              border: `1px solid ${mix(feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)', 35)}`,
              color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {feedback.type === 'success' ? <Check size={13} /> : <XCircle size={13} />}
            <span className="text-sm font-medium">{feedback.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <FileList
          files={visibleFiles}
          allFiles={files}
          selectedPath={selectedFile}
          onSelect={setSelectedFile}
          loading={loading && files.length === 0}
          viewed={viewed}
          onToggleViewed={toggleViewed}
          query={query}
          onQuery={setQuery}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
        />

        <div className="flex flex-1 flex-col min-w-0">
          {/* File info bar */}
          {selectedFile && (
            <div className="lea-diff-filebar flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-mono text-sm" style={{ color: 'var(--text-secondary)' }} title={selectedFile}>{selectedFile}</span>
                <button type="button" onClick={copyPath} className="lea-diff-icon flex-shrink-0 rounded p-1" title="Copier le chemin" aria-label="Copier le chemin du fichier">
                  {copied ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
                </button>
              </span>
              {selectedFileStatus && <StatusBadge status={selectedFileStatus} />}
              {(stats.added > 0 || stats.removed > 0) && (
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-2 font-mono text-xs font-medium tabular-nums">
                    {stats.added > 0 && <span style={{ color: 'var(--color-success)' }}>+{stats.added}</span>}
                    {stats.removed > 0 && <span style={{ color: 'var(--color-error)' }}>−{stats.removed}</span>}
                  </span>
                  <DiffStatBar added={stats.added} removed={stats.removed} />
                </span>
              )}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleViewed(selectedFile)}
                  aria-pressed={isViewed}
                  className="lea-diff-btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  data-active={isViewed ? 'true' : undefined}
                  title="Marquer comme vu (V)"
                >
                  {isViewed ? <CheckCircle2 size={12} style={{ color: 'var(--color-success)' }} /> : <Circle size={12} />}
                  Vu
                </button>
                <button type="button" onClick={() => handleAcceptFile(selectedFile)} disabled={isBusy} className="lea-diff-action lea-diff-action--solid flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ ['--tone' as string]: 'var(--color-success)' }} title="Appliquer ce fichier au projet (A)">
                  {actionBusy === selectedFile ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Accepter
                </button>
                <button type="button" onClick={() => handleRejectFile(selectedFile)} disabled={isBusy} className="lea-diff-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ ['--tone' as string]: 'var(--color-error)' }} title="Rejeter ce fichier (R)">
                  <RotateCcw size={12} />
                  Rejeter
                </button>
              </div>
            </div>
          )}

          {/* Diff dégradé : fichier trop volumineux pour un diff ligne à ligne */}
          {degraded && selectedFile && (
            <div className="flex items-center gap-2 px-4 py-1.5 text-xs flex-shrink-0" role="status" style={{ color: 'var(--color-warning)', backgroundColor: mix('var(--color-warning)', 10), borderBottom: `1px solid ${mix('var(--color-warning)', 25)}` }}>
              <AlertTriangle size={12} />
              Fichier très modifié : affichage simplifié (bloc retiré puis bloc ajouté) pour garder l'interface fluide.
            </div>
          )}

          {/* Diff content */}
          {fileLoading ? (
            <div className="flex-1 space-y-2 p-4" aria-busy="true">
              {[85, 60, 92, 40, 75, 55, 88, 30].map((w, i) => (
                <div key={i} className="skeleton-shimmer h-3" style={{ width: `${w}%`, borderRadius: 3, opacity: 1 - i * 0.08 }} />
              ))}
            </div>
          ) : files.length === 0 && !loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center lea-enter">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: mix('var(--color-success)', 12), color: 'var(--color-success)', boxShadow: `0 0 0 6px ${mix('var(--color-success)', 5)}` }}>
                <CheckCheck size={24} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tout est synchronisé</p>
              <p className="max-w-xs text-xs" style={{ color: 'var(--text-muted)' }}>
                Aucune modification en attente dans le sandbox. Les changements apparaîtront ici dès qu'un fichier sera modifié.
              </p>
            </div>
          ) : !selectedFile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                <FileCode2 size={22} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Sélectionnez un fichier pour voir les modifications</p>
              <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{files.length} fichier{files.length > 1 ? 's' : ''} en attente de revue</p>
            </div>
          ) : diffLines.length > 0 && stats.added === 0 && stats.removed === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <FileCode2 size={20} style={{ color: 'var(--text-dimmed)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucune différence de contenu</p>
              <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                Le fichier est identique (les changements peuvent porter sur des lignes vides ou les métadonnées).
              </p>
            </div>
          ) : diffMode === 'side-by-side' ? (
            <div className="flex-1 flex min-h-0">
              {(['left', 'right'] as const).map(side => (
                <div key={side} className="flex flex-1 flex-col min-w-0" style={side === 'left' ? { borderRight: '1px solid var(--border-base)' } : undefined}>
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
                    style={{
                      backgroundColor: side === 'left' ? TINT.delRow : TINT.addRow,
                      borderBottom: '1px solid var(--border-base)',
                    }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: side === 'left' ? 'var(--color-error)' : 'var(--color-success)' }} aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: side === 'left' ? 'var(--color-error)' : 'var(--color-success)' }}>
                      {side === 'left' ? 'Avant · original' : 'Après · sandbox'}
                    </span>
                  </div>
                  <div
                    ref={side === 'left' ? leftScrollRef : rightScrollRef}
                    onScroll={() => handleScroll(side)}
                    className="relative flex-1 overflow-auto custom-scrollbar font-mono text-sm leading-[20px]"
                  >
                    {renderSide(side)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div ref={unifiedScrollRef} className="relative flex-1 overflow-auto custom-scrollbar font-mono text-sm leading-[20px]">
              {renderItems.map(it => {
                if (it.kind === 'fold') {
                  return <FoldRow key={`f${it.start}`} count={it.end - it.start} onExpand={() => expandFold(it.start)} showLabel />;
                }
                const idx = it.idx;
                const line = diffLines[idx];
                let wordSegs: Segments | undefined;
                if (line.type === 'removed' && wordDiffMap.has(idx)) wordSegs = wordDiffMap.get(idx)!.oldSegments;
                else if (line.type === 'added' && wordDiffMap.has(idx - 1)) wordSegs = wordDiffMap.get(idx - 1)!.newSegments;
                return (
                  <CodeRow
                    key={idx}
                    idx={idx}
                    nums={[line.lineNumOld, line.lineNumNew]}
                    type={line.type}
                    content={line.content}
                    segments={wordSegs}
                    prefix
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Footer legend ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 flex-shrink-0" style={{ borderTop: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
        {([['Supprimé', TINT.delMark], ['Ajouté', TINT.addMark]] as const).map(([label, bg]) => (
          <span key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: bg }} aria-hidden="true" />
            {label}
          </span>
        ))}
        {foldContext && hiddenLines > 0 && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <FoldVertical size={11} aria-hidden="true" />
            {hiddenLines} ligne{hiddenLines > 1 ? 's' : ''} inchangée{hiddenLines > 1 ? 's' : ''} repliée{hiddenLines > 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: 'var(--text-dimmed)' }}>
          <kbd className="kbd">?</kbd> raccourcis · {diffMode === 'side-by-side' ? 'Gauche : original · Droite : sandbox' : 'Diff unifié'}
        </span>
      </div>
    </motion.div>
  );
}

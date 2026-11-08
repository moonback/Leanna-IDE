import {
  lazy, Suspense, useCallback, useEffect, useState,
} from 'react';
import {
  Check, X, FileCode, Loader2, RotateCcw, AlertCircle, SplitSquareHorizontal, ExternalLink,
  FlaskConical, ChevronDown, ChevronRight,
} from 'lucide-react';
import { ideApi, type TestRunResult } from '../../../services/ideApi.js';
import { languageFromPath } from './inlineEdits.js';

/** Reconnaît un fichier de test (miroir côté serveur de TEST_FILE_RE). */
function isTestFile(p: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p);
}

// ═══════════════════════════════════════════════════════════════════════════
// InlineDiffEditor — éditeur diff embarqué dans une bulle de chat.
//
// Affiche, pour une proposition d'édition de l'assistante, un comparateur
// Monaco (gauche = version actuelle du disque, droite = version proposée,
// ÉDITABLE). L'utilisateur peut ajuster la proposition puis l'appliquer en un
// clic (écriture via ideApi.saveFile) ou l'écarter.
//
// Charge CodeMirror à la demande (bundlé, pas de CDN)
// et la discipline de disposition des modèles de MarkdownPromptDiff / DiffViewer.
// ═══════════════════════════════════════════════════════════════════════════

const CodeMirrorDiffEditorLazy = lazy(() => import('./CodeMirrorDiffEditor.js'));

type Status = 'loading' | 'ready' | 'applying' | 'applied' | 'error';

export interface InlineDiffEditorProps {
  /** Chemin du fichier cible (relatif à l'espace de travail). */
  path: string;
  /** Contenu proposé par l'assistante. */
  proposed: string;
  /** Langage pour la coloration Monaco (déduit du chemin si absent). */
  language?: string;
  /** Notifie le parent après application réussie (ex. toast / changelog). */
  onApplied?: (path: string) => void;
}

/** Détecte le thème clair de l'app pour accorder Monaco (défaut : sombre). */
function isLightTheme(): boolean {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'high-contrast-light';
}

/** Compte lignes ajoutées / retirées (diff ligne-à-ligne naïf mais utile). */
function countLineDelta(before: string, after: string): { added: number; removed: number } {
  const a = before.split('\n');
  const b = after.split('\n');
  const bSet = new Map<string, number>();
  for (const l of b) bSet.set(l, (bSet.get(l) ?? 0) + 1);
  const aSet = new Map<string, number>();
  for (const l of a) aSet.set(l, (aSet.get(l) ?? 0) + 1);
  let added = 0;
  let removed = 0;
  for (const [line, count] of bSet) added += Math.max(0, count - (aSet.get(line) ?? 0));
  for (const [line, count] of aSet) removed += Math.max(0, count - (bSet.get(line) ?? 0));
  return { added, removed };
}

export function InlineDiffEditor({ path, proposed, language, onApplied }: InlineDiffEditorProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>('');
  // Contenu courant du panneau de droite (éditable). Initialisé à la proposition.
  const [current, setCurrent] = useState<string>(proposed);
  const [sideBySide, setSideBySide] = useState(true);
  const [isNewFile, setIsNewFile] = useState(false);

  // ── État d'exécution des tests (feature #8) ──────────────────────────────
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testOutputOpen, setTestOutputOpen] = useState(false);

  const lang = language || languageFromPath(path);
  const dark = !isLightTheme();
  const testable = isTestFile(path);

  // ── Chargement de la version actuelle du fichier ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    ideApi.readFile(path, true)
      .then((content) => {
        if (cancelled) return;
        setOriginal(content);
        setIsNewFile(false);
        setStatus('ready');
      })
      .catch(() => {
        // Fichier absent : on propose une création (original vide).
        if (cancelled) return;
        setOriginal('');
        setIsNewFile(true);
        setStatus('ready');
      });
    return () => { cancelled = true; };
  }, [path]);


  // ── Application de la modification ───────────────────────────────────────
  const apply = useCallback(async () => {
    setStatus('applying');
    setError(null);
    try {
      await ideApi.saveFile(path, current);
      setStatus('applied');
      setOriginal(current); // la version disque devient la version appliquée
      setIsNewFile(false);
      onApplied?.(path);
      // Rafraîchit un éventuel onglet ouvert sur ce fichier + alimente le
      // journal des modifications (feature #9) avec le détail du changement.
      const delta = countLineDelta(original, current);
      window.dispatchEvent(new CustomEvent('Leanna-file-written', {
        detail: { path, added: delta.added, removed: delta.removed, at: Date.now() },
      }));
    } catch (err) {
      console.error('[InlineDiffEditor] saveFile failed:', err);
      setError(err instanceof Error ? err.message : 'Échec de l\'écriture du fichier.');
      setStatus('error');
    }
  }, [path, current, original, onApplied]);

  // ── Exécution des tests du fichier (feature #8) ──────────────────────────
  const runTests = useCallback(async () => {
    setTestRunning(true);
    setTestError(null);
    setTestResult(null);
    try {
      const result = await ideApi.runTests(path);
      setTestResult(result);
      // Ouvre la sortie automatiquement en cas d'échec (c'est là qu'elle sert).
      setTestOutputOpen(!result.ok);
    } catch (err) {
      console.error('[InlineDiffEditor] runTests failed:', err);
      setTestError(err instanceof Error ? err.message : "Impossible de lancer les tests.");
    } finally {
      setTestRunning(false);
    }
  }, [path]);

  const reset = useCallback(() => {
    setCurrent(proposed);
  }, [proposed]);

  const openFile = useCallback(() => {
    window.dispatchEvent(new CustomEvent('Leanna-action', { detail: { type: 'open-file', path } }));
  }, [path]);

  const { added, removed } = countLineDelta(original, current);
  const dirty = current !== proposed;
  const applied = status === 'applied';
  const fileName = path.split(/[/\\]/).pop() || path;

  return (
    <div
      className="my-2 rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${applied ? 'color-mix(in srgb, var(--color-success) 45%, transparent)' : 'var(--border-base)'}`,
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {/* En-tête : fichier + stats + bascule d'affichage */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' }}
        >
          <FileCode size={13} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={path}>
              {fileName}
            </span>
            {isNewFile && (
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ color: 'var(--accent-primary)', backgroundColor: 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' }}
              >
                nouveau
              </span>
            )}
          </div>
          <span className="text-xs font-mono truncate block" style={{ color: 'var(--text-dimmed)' }}>{path}</span>
        </div>

        {/* Compteurs +/- */}
        {status === 'ready' || applied ? (
          <span className="flex items-center gap-1.5 text-xs font-mono flex-shrink-0">
            {added > 0 && <span style={{ color: 'var(--color-success)' }}>+{added}</span>}
            {removed > 0 && <span style={{ color: 'var(--color-error)' }}>-{removed}</span>}
          </span>
        ) : null}

        {/* Bascule côte à côte / inline */}
        <button
          type="button"
          onClick={() => setSideBySide(v => !v)}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-active)] flex-shrink-0"
          title={sideBySide ? 'Vue unifiée' : 'Vue côte à côte'}
          aria-label={sideBySide ? 'Afficher la vue unifiée' : 'Afficher la vue côte à côte'}
        >
          <SplitSquareHorizontal size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button
          type="button"
          onClick={openFile}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-active)] flex-shrink-0"
          title="Ouvrir le fichier dans l'éditeur"
          aria-label="Ouvrir le fichier dans l'éditeur"
        >
          <ExternalLink size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Corps : diff CodeMirror, chargé uniquement lorsqu'un bloc edit est affiché */}
      {status === 'loading' ? (
        <div className="flex items-center justify-center gap-2 text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la version actuelle…
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 text-xs py-8" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement du comparateur…
            </div>
          }
        >
          <CodeMirrorDiffEditorLazy
            original={original}
            modified={current}
            language={lang}
            dark={dark}
            sideBySide={sideBySide}
            readOnly={applied}
            onChange={setCurrent}
          />
        </Suspense>
      )}

      {/* Erreur */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--color-error)', borderTop: '1px solid var(--border-base)' }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 py-2.5" style={{ borderTop: '1px solid var(--border-base)' }}>
        {applied ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--color-success)' }}>
            <Check size={13} /> Modification appliquée
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={apply}
              disabled={status !== 'ready' && status !== 'error'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base, #0a1628)' }}
            >
              {status === 'applying'
                ? <><Loader2 size={13} className="animate-spin" /> Application…</>
                : <><Check size={13} /> {isNewFile ? 'Créer le fichier' : 'Appliquer'}</>}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
                style={{ border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
                title="Rétablir la proposition initiale de l'assistante"
              >
                <RotateCcw size={13} /> Réinitialiser
              </button>
            )}
          </>
        )}

        {/* Lancer les tests — fichiers de test uniquement. Disponible une fois
            la proposition appliquée (ou si le fichier existait déjà). */}
        {testable && (applied || !isNewFile) && (
          <button
            type="button"
            onClick={runTests}
            disabled={testRunning}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ border: '1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent)', color: 'var(--accent-primary)' }}
            title="Exécuter les tests unitaires de ce fichier"
          >
            {testRunning
              ? <><Loader2 size={13} className="animate-spin" /> Tests en cours…</>
              : <><FlaskConical size={13} /> Lancer les tests</>}
          </button>
        )}

        {!applied && !(testable && (applied || !isNewFile)) && (
          <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--text-dimmed)' }}>
            <X size={12} /> Non appliquée tant que vous n'avez pas validé
          </span>
        )}
      </div>

      {/* Résultats des tests (feature #8) */}
      {testError && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--color-error)', borderTop: '1px solid var(--border-base)' }}>
          <AlertCircle size={13} /> {testError}
        </div>
      )}
      {testResult && (
        <div style={{ borderTop: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-2 px-3 py-2">
            <span
              className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                color: testResult.ok ? 'var(--color-success)' : 'var(--color-error)',
                backgroundColor: `color-mix(in srgb, ${testResult.ok ? 'var(--color-success)' : 'var(--color-error)'} 14%, transparent)`,
              }}
            >
              {testResult.ok ? <Check size={12} /> : <X size={12} />}
              {testResult.ok ? 'Tests réussis' : (testResult.timedOut ? 'Délai dépassé' : 'Tests en échec')}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
              {testResult.runner} · {(testResult.durationMs / 1000).toFixed(1)}s
              {testResult.exitCode != null ? ` · code ${testResult.exitCode}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setTestOutputOpen(v => !v)}
              className="ml-auto flex items-center gap-1 text-xs transition-colors hover:text-[var(--text-primary)]"
              style={{ color: 'var(--text-muted)' }}
              aria-expanded={testOutputOpen}
            >
              {testOutputOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {testOutputOpen ? 'Masquer la sortie' : 'Voir la sortie'}
            </button>
          </div>
          {testOutputOpen && (
            <pre
              className="mx-3 mb-3 p-2.5 rounded-lg text-xs overflow-auto custom-scrollbar"
              style={{
                maxHeight: '220px',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-base, #0a1628)',
                border: '1px solid var(--border-base)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {[testResult.stdout, testResult.stderr].filter(Boolean).join('\n').trim() || '(aucune sortie)'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

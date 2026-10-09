import { lazy, Suspense, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * MarkdownPromptEditor — Éditeur Markdown avec coloration syntaxique (Monaco).
 *
 * Pourquoi Monaco plutôt qu'un <textarea> :
 *   L'objectif est de « mieux percevoir » le prompt. Monaco apporte une vraie
 *   coloration syntaxique Markdown (titres, gras/italique, listes, blocs de
 *   code, liens, citations, front-matter HTML), des numéros de ligne et le
 *   repli de blocs — tout en restant pleinement éditable.
 *
 * Intégration conforme au projet :
 *   On réutilise l'instance Monaco BUNDLÉE via loader.config({ monaco }) comme
 *   le font DiffViewer / IdeView, afin d'éviter le chargement CDN (violations
 *   CSP) et de rester cohérent avec le reste de l'app. Le composant est lazy
 *   pour ne pas alourdir le bundle initial des Paramètres.
 *
 * Thème :
 *   Deux thèmes personnalisés (clair/sombre) sont définis au montage pour
 *   accorder les couleurs de coloration à la palette de l'app.
 */

// Lazy load Monaco + instance bundlée (même pattern que IdeView).
const MonacoEditor = lazy(() =>
  Promise.all([
    import('@monaco-editor/react'),
    import('monaco-editor'),
  ]).then(([monacoReact, monacoInstance]) => {
    monacoReact.loader.config({ monaco: monacoInstance });
    return { default: monacoReact.Editor };
  })
);

// Noms des thèmes personnalisés enregistrés au premier montage.
const THEME_DARK = 'leanna-prompt-dark';
const THEME_LIGHT = 'leanna-prompt-light';

/**
 * Enregistre deux thèmes Markdown riches. Les règles ciblent les tokens du
 * tokenizer Markdown de Monaco pour distinguer visuellement chaque élément.
 */
function defineThemes(monaco: any): void {
  // ── Thème sombre ──────────────────────────────────────────────────────────
  monaco.editor.defineTheme(THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'd4d4d4' },
      // Titres Markdown (#, ##, …)
      { token: 'keyword.md', foreground: '4fc1ff', fontStyle: 'bold' },
      { token: 'keyword', foreground: '4fc1ff', fontStyle: 'bold' },
      // Gras / italique
      { token: 'strong', foreground: 'ffd479', fontStyle: 'bold' },
      { token: 'emphasis', foreground: 'c586c0', fontStyle: 'italic' },
      // Listes (puces / numéros)
      { token: 'string.md', foreground: 'd4d4d4' },
      // Blocs & spans de code
      { token: 'variable.md', foreground: 'ce9178' },
      { token: 'variable.source.md', foreground: 'ce9178' },
      // Liens
      { token: 'string.link.md', foreground: '6a9955', fontStyle: 'underline' },
      // Citations (>)
      { token: 'comment', foreground: '7f848e', fontStyle: 'italic' },
      // Balises HTML (front-matter <!-- ... -->, <instructions> …)
      { token: 'tag', foreground: '569cd6' },
      { token: 'metatag', foreground: '808080', fontStyle: 'italic' },
      { token: 'delimiter.html', foreground: '808080' },
      { token: 'attribute.name', foreground: '9cdcfe' },
      { token: 'attribute.value', foreground: 'ce9178' },
    ],
    colors: {
      'editor.background': '#1a1b26',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#9da5b4',
      'editor.selectionBackground': '#2d4f67',
      'editor.lineHighlightBackground': '#20212e',
      'editorCursor.foreground': '#4fc1ff',
      'editorIndentGuide.background': '#2a2b3c',
    },
  });

  // ── Thème clair ───────────────────────────────────────────────────────────
  monaco.editor.defineTheme(THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '24292e' },
      { token: 'keyword.md', foreground: '0366d6', fontStyle: 'bold' },
      { token: 'keyword', foreground: '0366d6', fontStyle: 'bold' },
      { token: 'strong', foreground: 'b08800', fontStyle: 'bold' },
      { token: 'emphasis', foreground: '6f42c1', fontStyle: 'italic' },
      { token: 'string.md', foreground: '24292e' },
      { token: 'variable.md', foreground: 'd73a49' },
      { token: 'variable.source.md', foreground: 'd73a49' },
      { token: 'string.link.md', foreground: '22863a', fontStyle: 'underline' },
      { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
      { token: 'tag', foreground: '22863a' },
      { token: 'metatag', foreground: '6a737d', fontStyle: 'italic' },
      { token: 'delimiter.html', foreground: '6a737d' },
      { token: 'attribute.name', foreground: '005cc5' },
      { token: 'attribute.value', foreground: '032f62' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#24292e',
      'editorLineNumber.foreground': '#babec6',
      'editorLineNumber.activeForeground': '#24292e',
      'editor.lineHighlightBackground': '#f6f8fa',
      'editorCursor.foreground': '#0366d6',
    },
  });
}

interface MarkdownPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** true → thème sombre, false → thème clair. */
  dark: boolean;
  /** Hauteur CSS de l'éditeur (ex: "360px"). */
  height?: string;
  /** Lecture seule (ex: pendant un chargement). */
  readOnly?: boolean;
  /** Appelé avec (ctrl/cmd+S) pour déclencher la sauvegarde. */
  onSave?: () => void;
  /**
   * Optimise un extrait sélectionné via l'IA. Reçoit le texte sélectionné et
   * le mode ('auto' = réglages courants ; 'manual' = l'appelant demande une
   * instruction précise à l'utilisateur). Doit renvoyer le texte de
   * remplacement, ou null pour annuler. L'éditeur applique lui-même le
   * remplacement (en préservant l'historique d'annulation).
   */
  onOptimizeSelection?: (args: { selection: string; mode: 'auto' | 'manual' }) => Promise<string | null>;
}

export function MarkdownPromptEditor({
  value, onChange, dark, height = '360px', readOnly = false, onSave, onOptimizeSelection,
}: MarkdownPromptEditorProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onOptimizeSelectionRef = useRef(onOptimizeSelection);
  onOptimizeSelectionRef.current = onOptimizeSelection;
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  /**
   * Récupère la sélection courante, appelle le parent pour obtenir le texte
   * optimisé, puis remplace la sélection par ce texte via executeEdits (ce qui
   * conserve l'undo et déclenche onChange automatiquement).
   */
  const runSelectionOptimize = useCallback(async (mode: 'auto' | 'manual') => {
    const editor = editorRef.current;
    const handler = onOptimizeSelectionRef.current;
    if (!editor || !handler) return;

    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model || selection.isEmpty()) return;

    const selectedText = model.getValueInRange(selection);
    if (!selectedText.trim()) return;

    const replacement = await handler({ selection: selectedText, mode });
    if (replacement == null) return; // annulé ou échec

    // Remplace la sélection. pushUndoStop garde l'opération annulable d'un coup.
    editor.pushUndoStop();
    editor.executeEdits('optimize-selection', [
      { range: selection, text: replacement, forceMoveMarkers: true },
    ]);
    editor.pushUndoStop();
    editor.focus();
  }, []);

  const handleMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    defineThemes(monaco);
    monaco.editor.setTheme(dark ? THEME_DARK : THEME_LIGHT);

    // Ctrl/Cmd+S → sauvegarde (sans déclencher le dialogue de sauvegarde du navigateur).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });

    // ── Actions du menu contextuel (clic droit) sur une sélection ────────────
    // Visibles uniquement quand du texte est sélectionné (editorHasSelection).
    editor.addAction({
      id: 'leanna-optimize-selection-auto',
      label: '✨ Optimiser la sélection (auto)',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.5,
      precondition: 'editorHasSelection',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyO],
      run: () => { void runSelectionOptimize('auto'); },
    });
    editor.addAction({
      id: 'leanna-optimize-selection-manual',
      label: '✨ Optimiser la sélection (demande précise)…',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.6,
      precondition: 'editorHasSelection',
      run: () => { void runSelectionOptimize('manual'); },
    });
  }, [dark, runSelectionOptimize]);

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ border: '1px solid var(--border-base)' }}
    >
      <Suspense
        fallback={
          <div
            className="flex items-center justify-center gap-2 text-xs"
            style={{ height, color: 'var(--text-muted)' }}
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'éditeur…
          </div>
        }
      >
        <MonacoEditor
          language="markdown"
          theme={dark ? THEME_DARK : THEME_LIGHT}
          value={value}
          onChange={(v) => onChange(v ?? '')}
          onMount={handleMount}
          height={height}
          options={{
            readOnly,
            fontSize: 13,
            lineHeight: 20,
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            wordWrap: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderWhitespace: 'none',
            lineNumbers: 'on',
            folding: true,
            padding: { top: 10, bottom: 10 },
            smoothScrolling: true,
            automaticLayout: true,
            stickyScroll: { enabled: false },
            overviewRulerLanes: 0,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          }}
        />
      </Suspense>
    </div>
  );
}

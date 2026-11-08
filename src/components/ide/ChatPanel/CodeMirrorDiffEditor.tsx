import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { sql } from '@codemirror/lang-sql';

interface CodeMirrorDiffEditorProps {
  original: string;
  modified: string;
  language: string;
  dark: boolean;
  sideBySide: boolean;
  readOnly: boolean;
  onChange: (value: string) => void;
}

function languageExtension(language: string) {
  switch (language.toLowerCase()) {
    case 'typescript':
      return javascript({ typescript: true });
    case 'javascript':
    case 'jsx':
      return javascript({ jsx: language === 'jsx' });
    case 'json':
      return json();
    case 'css':
      return css();
    case 'html':
      return html();
    case 'markdown':
      return markdown();
    case 'python':
      return python();
    case 'yaml':
      return yaml();
    case 'sql':
      return sql();
    default:
      return [];
  }
}

function editorTheme(dark: boolean) {
  return EditorView.theme({
    '&': {
      height: '320px',
      fontSize: '12px',
      backgroundColor: dark ? '#111827' : '#ffffff',
      color: dark ? '#e5e7eb' : '#1f2937',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      lineHeight: '18px',
    },
    '.cm-gutters': {
      backgroundColor: dark ? '#111827' : '#f8fafc',
      color: dark ? '#64748b' : '#94a3b8',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: dark ? 'rgba(148,163,184,.08)' : 'rgba(15,23,42,.04)',
    },
    '.cm-merge-a .cm-changedLine, .cm-merge-b .cm-changedLine': {
      backgroundColor: dark ? 'rgba(234,179,8,.10)' : 'rgba(234,179,8,.12)',
    },
    '.cm-merge-a .cm-deletedLine, .cm-merge-b .cm-insertedLine': {
      backgroundColor: dark ? 'rgba(239,68,68,.14)' : 'rgba(239,68,68,.10)',
    },
    '.cm-merge-b .cm-insertedLine': {
      backgroundColor: dark ? 'rgba(34,197,94,.14)' : 'rgba(34,197,94,.10)',
    },
    '.cm-merge-a .cm-deletedLine': {
      backgroundColor: dark ? 'rgba(239,68,68,.14)' : 'rgba(239,68,68,.10)',
    },
    '.cm-content': {
      padding: '8px 0',
    },
    '.cm-line': {
      padding: '0 8px',
    },
  }, { dark });
}

export default function CodeMirrorDiffEditor({
  original,
  modified,
  language,
  dark,
  sideBySide,
  readOnly,
  onChange,
}: CodeMirrorDiffEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | MergeView | null>(null);
  const onChangeRef = useRef(onChange);
  const modifiedRef = useRef(modified);

  onChangeRef.current = onChange;
  modifiedRef.current = modified;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const commonExtensions = [
      basicSetup,
      languageExtension(language),
      editorTheme(dark),
      EditorView.lineWrapping,
    ];
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString());
    });

    if (sideBySide) {
      const merge = new MergeView({
        a: {
          doc: original,
          extensions: [
            ...commonExtensions,
            EditorView.editable.of(false),
            EditorState.readOnly.of(true),
          ],
        },
        b: {
          doc: modifiedRef.current,
          extensions: [
            ...commonExtensions,
            EditorView.editable.of(!readOnly),
            EditorState.readOnly.of(readOnly),
            updateListener,
          ],
        },
        parent: host,
        orientation: 'a-b',
        highlightChanges: true,
        gutter: true,
      });
      viewRef.current = merge;
    } else {
      const view = new EditorView({
        parent: host,
        doc: modifiedRef.current,
        extensions: [
          ...commonExtensions,
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly),
          unifiedMergeView({
            original,
            highlightChanges: true,
            gutter: true,
            syntaxHighlightDeletions: true,
            allowInlineDiffs: true,
          }),
          updateListener,
        ],
      });
      viewRef.current = view;
    }

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
      host.replaceChildren();
    };
  }, [original, language, dark, sideBySide, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    const editor = view instanceof MergeView ? view.b : view;
    if (!editor || editor.state.doc.toString() === modified) return;
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: modified,
      },
    });
  }, [modified]);

  return (
    <div
      ref={hostRef}
      className="leanna-codemirror-diff w-full overflow-hidden"
      style={{
        height: '320px',
        backgroundColor: dark ? '#111827' : '#ffffff',
        borderTop: '1px solid var(--border-base)',
        borderBottom: '1px solid var(--border-base)',
      }}
    />
  );
}

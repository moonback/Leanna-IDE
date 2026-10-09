import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { Loader2 } from 'lucide-react';

/**
 * MarkdownPromptDiff — Vue différentielle (avant / après) d'un prompt Markdown.
 *
 * Objectif : montrer visuellement les lignes ajoutées / retirées / modifiées
 * entre une version de référence (`original`) et le contenu courant (`modified`),
 * exactement comme un diff Git. On réutilise le `DiffEditor` natif de Monaco,
 * déjà employé par le DiffViewer de l'IDE.
 *
 * Côté droit (`modified`) éditable : l'utilisateur peut ajuster directement
 * dans la vue diff ; chaque frappe est remontée via `onChange`.
 *
 * Intégration conforme au projet : instance Monaco BUNDLÉE via
 * loader.config({ monaco }) (évite le CDN / les violations CSP), chargement
 * paresseux pour ne pas alourdir le bundle initial des Paramètres.
 */

const DiffEditorLazy = lazy(() =>
  Promise.all([
    import('@monaco-editor/react'),
    import('monaco-editor'),
  ]).then(([monacoReact, monacoInstance]) => {
    monacoReact.loader.config({ monaco: monacoInstance });
    return { default: monacoReact.DiffEditor };
  })
);

interface MarkdownPromptDiffProps {
  /** Version de référence (côté gauche, lecture seule). */
  original: string;
  /** Version courante (côté droit, éditable). */
  modified: string;
  /** Remonte les éditions faites dans le panneau de droite. */
  onChange: (value: string) => void;
  /** true → thème sombre, false → thème clair. */
  dark: boolean;
  /** Hauteur CSS (ex: "420px"). */
  height?: string;
  /** Affichage côte à côte (true) ou en ligne (false). */
  sideBySide?: boolean;
}

export function MarkdownPromptDiff({
  original, modified, onChange, dark, height = '420px', sideBySide = true,
}: MarkdownPromptDiffProps) {
  const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleMount = useCallback((diffEditor: editor.IStandaloneDiffEditor) => {
    diffRef.current = diffEditor;
    // Applique le mode d'affichage courant dès le montage.
    diffEditor.updateOptions({ renderSideBySide: sideBySide });
    // Écoute les éditions du modèle « modifié » (panneau de droite).
    const modifiedEditor = diffEditor.getModifiedEditor();
    modifiedEditor.onDidChangeModelContent(() => {
      onChangeRef.current(modifiedEditor.getValue());
    });
  }, [sideBySide]);

  // Le composant DiffEditor n'applique les `options` qu'au montage : pour que
  // la bascule côte-à-côte / unifié prenne effet à chaud, on appelle
  // updateOptions() quand `sideBySide` change après le montage.
  useEffect(() => {
    diffRef.current?.updateOptions({ renderSideBySide: sideBySide });
  }, [sideBySide]);

  // Dispose proprement les modèles + l'éditeur au démontage, pour éviter les
  // rejets « Canceled » que Monaco émet quand ses tâches différées sont
  // annulées à l'unmount (même précaution que DiffViewer).
  useEffect(() => {
    return () => {
      const ed = diffRef.current;
      if (!ed) return;
      diffRef.current = null;
      try {
        // IMPORTANT : disposer d'ABORD le widget, qui détache ses modèles,
        // AVANT de disposer les modèles eux-mêmes. L'ordre inverse déclenche
        // « TextModel got disposed before DiffEditorWidget model got reset ».
        const model = ed.getModel();
        const original = model?.original;
        const modified = model?.modified;
        // Détache les modèles du widget pour qu'il ne les référence plus.
        ed.setModel(null);
        ed.dispose();
        original?.dispose();
        modified?.dispose();
      } catch { /* déjà disposé — sans effet */ }
    };
  }, []);

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
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement du comparateur…
          </div>
        }
      >
        <DiffEditorLazy
          original={original}
          modified={modified}
          language="markdown"
          theme={dark ? 'vs-dark' : 'vs'}
          height={height}
          onMount={handleMount}
          options={{
            renderSideBySide: sideBySide,
            // Empêche Monaco de retomber automatiquement en vue « inline » quand
            // le conteneur est étroit : c'est ce basculement implicite qui
            // donnait l'impression de numéros de ligne dupliqués. On force donc
            // le respect du choix explicite de l'utilisateur.
            renderSideBySideInlineBreakpoint: 0,
            useInlineViewWhenSpaceIsLimited: false,
            readOnly: false,
            originalEditable: false,
            fontSize: 13,
            lineHeight: 20,
            wordWrap: 'on',
            diffWordWrap: 'on',
            ignoreTrimWhitespace: false,
            renderWhitespace: 'none',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderOverviewRuler: false,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          }}
        />
      </Suspense>
    </div>
  );
}

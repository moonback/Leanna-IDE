/**
 * MermaidDiagram — Rendu de diagrammes Mermaid
 *
 * Utilise la lib mermaid pour convertir le code Mermaid en SVG.
 * Gère le thème clair/sombre et le resize.
 */

import { useEffect, useRef, useState, memo } from 'react';
import mermaid from 'mermaid';

interface Props {
  code: string;
  id?: string;
}

let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    mindmap: {
      padding: 16,
      useMaxWidth: true,
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
  });
  mermaidInitialized = true;
}

export const MermaidDiagram = memo(function MermaidDiagram({ code, id }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [rendering, setRendering] = useState(true);
  const uniqueId = useRef(`mermaid-${id || Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!code.trim()) return;

    let cancelled = false;

    async function render() {
      setRendering(true);
      setError('');

      try {
        initMermaid();

        // Nettoyer le code (retirer les espaces de début/fin)
        const cleanCode = code.trim();

        const { svg: renderedSvg } = await mermaid.render(uniqueId.current, cleanCode);

        if (!cancelled) {
          setSvg(renderedSvg);
          setRendering(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Erreur de rendu Mermaid');
          setRendering(false);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (rendering) {
    return (
      <div
        className="flex items-center justify-center py-8 rounded-xl"
        style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Rendu du diagramme...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div
          className="px-4 py-3 rounded-xl text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
        >
          ⚠️ Impossible de rendre le diagramme : {error}
        </div>
        {/* Afficher le code source en fallback */}
        <pre
          className="px-4 py-3 rounded-xl text-[11px] overflow-x-auto font-mono"
          style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
        >
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto rounded-xl p-4"
      style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

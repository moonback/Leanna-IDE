/**
 * Rendu d'infographie et hook d'accessibilité, extraits de renderHelpers pour
 * garder chaque fichier sous la limite de taille.
 */

import { useEffect, useState, type JSX } from 'react';
import { Lightbulb, Download, Folder, Brain } from 'lucide-react';
import { NbButton, NbBadge } from '../ui/primitives.js';

/**
 * Ajoute le token d'API en paramètre de requête aux URL d'images servies par
 * le serveur. Les balises <img> natives ne passent pas par le wrapper fetch de
 * main.tsx et ne peuvent pas poser l'en-tête `x-leanna-token` ; sans token en
 * query, la route /api/* protégée répond 401. Les sources `data:` (base64) et
 * les URL absolues externes sont laissées intactes.
 */
function withApiToken(url: string): string {
  if (!url.startsWith('/api/')) return url;
  const token = (() => {
    try { return localStorage.getItem('Leanna_api_token'); } catch { return null; }
  })();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/** Render infographic content — affiche l'image PNG directement */
export function renderInfographicContent(content: string): JSX.Element {
  let imageSrc = '';
  let prompt = '';
  let model = '';
  let filePath = '';
  let sizeKB = 0;

  try {
    const data = JSON.parse(content);
    if (data.type === 'infographic-image') {
      // Préférer l'URL de l'image servie par le serveur (le base64 n'est plus
      // persisté dans le notebook). Repli sur le base64 pour les anciens
      // documents générés avant cette migration.
      if (data.imageUrl) {
        imageSrc = withApiToken(data.imageUrl);
      } else if (data.imageBase64) {
        imageSrc = `data:${data.mediaType};base64,${data.imageBase64}`;
      }
      prompt = data.prompt || '';
      model = data.model || '';
      filePath = data.filePath || '';
      sizeKB = data.sizeKB || 0;
    }
  } catch {
    const imgMatch = content.match(/!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/);
    if (imgMatch) imageSrc = imgMatch[1];
  }

  if (!imageSrc) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-8">
        <Lightbulb className="h-8 w-8 text-[var(--color-warning)] opacity-50" aria-hidden />
        <p className="text-sm text-[var(--text-muted)]">
          Aucune image trouvée
        </p>
      </div>
    );
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = filePath ? filePath.split('/').pop()! : `infographie-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="notebooklm-infographic space-y-6">
      <div className="overflow-hidden rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-canvas)] shadow-2xl">
        <img
          src={imageSrc}
          alt="Infographie générée"
          className="h-auto max-h-[850px] w-full object-contain"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NbButton variant="primary" icon={Download} onClick={handleDownload}>
          Télécharger PNG
        </NbButton>

        {filePath && (
          <NbBadge icon={Folder} className="px-3 py-1">
            {filePath.split('/').pop()}
          </NbBadge>
        )}
        {sizeKB > 0 && (
          <NbBadge className="px-3 py-1">
            {sizeKB} KB
          </NbBadge>
        )}
      </div>

      {(prompt || model) && (
        <div className="notebook-card space-y-3 rounded-xl p-4">
          {model && (
            <p className="flex items-center gap-2 text-sm">
              <Brain className="h-4 w-4 text-[var(--notebook-accent)] opacity-70" aria-hidden />
              <span className="font-medium text-[var(--text-primary)]">
                Modèle:
              </span>
              <span className="text-[var(--text-dimmed)]"> {model}</span>
            </p>
          )}
          {prompt && (
            <p className="text-sm">
              <span className="font-medium text-[var(--text-primary)]">
                Prompt:
              </span>
              <span className="ml-2 leading-relaxed text-[var(--text-dimmed)]">
                {prompt.slice(0, 250)}
                {prompt.length > 250 ? '...' : ''}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Détecte prefers-reduced-transparency pour durcir les scrims de modal */
export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

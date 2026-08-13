import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbProps {
  path: string;           // ex: "src/components/ide"
  onNavigate: (path: string) => void;
}

/**
 * Breadcrumb cliquable dans l'en-tête de l'explorateur.
 * "workspace / src / components / ide"
 */
export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  const segments = path === '.' ? [] : path.split('/');

  return (
    <nav
      className="flex min-w-0 items-center gap-0.5 text-xs"
      aria-label="Chemin courant"
    >
      {/* Racine */}
      <button
        className="flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-white/10"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => onNavigate('.')}
        title="workspace"
      >
        <Home size={11} />
      </button>

      {segments.map((seg, i) => {
        const segPath = segments.slice(0, i + 1).join('/');
        const isLast  = i === segments.length - 1;
        return (
          <React.Fragment key={segPath}>
            <ChevronRight size={10} style={{ color: 'var(--border-strong, #444)', flexShrink: 0 }} />
            <button
              className="max-w-[80px] truncate rounded px-1 py-0.5 transition hover:bg-white/10"
              style={{
                color: isLast ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: isLast ? 500 : 400,
              }}
              onClick={() => onNavigate(segPath)}
              title={segPath}
            >
              {seg}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

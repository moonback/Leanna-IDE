import { Gauge, AlertTriangle, AlertOctagon, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import type { PromptContextState } from '../../hooks/useToken';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

const LEVEL_STYLES = {
  ok: {
    bar: 'linear-gradient(90deg, #10b981, #06b6d4)',
    bg: '#e6fffa', // Fond clair pour OK
    border: '#b2f2bb', // Bordure claire
    text: '#0ca678', // Texte vert plus sombre
    label: 'Normal',
  },
  warn: {
    bar: 'linear-gradient(90deg, #f59e0b, #fb923c)',
    bg: '#fff9db', // Fond clair pour Warn
    border: '#ffe066', // Bordure claire
    text: '#e67700', // Texte orange plus sombre
    label: 'Élevé',
  },
  critical: {
    bar: 'linear-gradient(90deg, #ef4444, #dc2626)',
    bg: '#fff5f5', // Fond clair pour Critical
    border: '#ffc9c9', // Bordure claire
    text: '#e03131', // Texte rouge plus sombre
    label: 'Critique',
  },
} as const;

interface PromptContextIndicatorProps {
  context: PromptContextState;
  connected?: boolean;
}

/**
 * Indicateur temps réel de l'utilisation de la fenêtre de contexte du prompt.
 */
export function PromptContextIndicator({ context, connected = false }: PromptContextIndicatorProps) {
  const styles = LEVEL_STYLES[context.level];
  const hasData = context.currentSize > 0 || connected;
  const { summarizeContext } = useLiveAPIContext();
  const [summarizing, setSummarizing] = useState(false);

  return (
    <div
      className="rounded-xl p-2.5"
      style={{
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Gauge size={12} style={{ color: styles.text, flexShrink: 0 }} />
          <span className="text-[10px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            Contexte prompt
          </span>
          {connected && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: styles.bg, color: styles.text }}
            >
              live
            </span>
          )}
        </div>
        <span className="text-[9px] font-bold tabular-nums flex-shrink-0" style={{ color: styles.text }}>
          {hasData ? `${context.percent}%` : '—'}
        </span>
      </div>

      <div
        className="h-1.5 rounded-full overflow-hidden mb-1.5"
        style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, context.percent)}%`,
            background: styles.bar,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {hasData
            ? `${formatTokens(context.currentSize)} / ${formatTokens(context.maxSize)} tokens`
            : 'En attente de connexion…'}
        </span>
        {hasData && (
          <span className="text-[9px] font-medium" style={{ color: styles.text }}>
            {styles.label}
            {context.turns > 0 ? ` · ${context.turns} tour${context.turns > 1 ? 's' : ''}` : ''}
          </span>
        )}
      </div>

      {context.suggestion && context.level !== 'ok' && (
        <div
          className="flex items-start gap-1.5 mt-2 px-2 py-1.5 rounded-lg text-[9-xs]"
          style={{ backgroundColor: 'rgba(0,0,0,0.04)', color: 'var(--text-muted)' }}
        >
          {context.level === 'critical'
            ? <AlertOctagon size={10} className="flex-shrink-0 mt-0.5" style={{ color: styles.text }} />
            : <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" style={{ color: styles.text }} />}
          <span>{context.suggestion}</span>
        </div>
      )}

      {/* Bouton de résumé automatique quand le contexte est élevé */}
      {context.level !== 'ok' && (
        <button
          type="button"
          onClick={async () => {
            if (summarizing) return;
            setSummarizing(true);
            try {
              await summarizeContext(8);
            } finally {
              setSummarizing(false);
            }
          }}
          disabled={summarizing || !connected}
          className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(14,165,233,0.08)',
            border: '1px solid rgba(14,165,233,0.2)',
            color: '#0e97a0',
          }}
        >
          {summarizing ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Sparkles size={10} />
          )}
          {summarizing ? 'Résumé…' : 'Résumer le contexte'}
        </button>
      )}
    </div>
  );
}

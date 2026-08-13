import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useTransition,
} from 'react';
import {
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Zap,
  X,
  Loader2,
  AlertTriangle,
  Gauge,
  Sparkles,
  Clock,
  Hash,
  Brain,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import { formatExactTokenCount, formatTokenCount } from '../../utils/tokenFormatting';

// ===== Types =====
interface OptimizationData {
  systemPromptTokens: number;
  memoryTokens: number;
  totalBaseTokens: number;
  availableForConversation: number;
  suggestions: string[];
  modelBudget: { maxTotal: number };
  compactEnabled?: boolean;
  savedTokens?: number;
}

interface TokenDetailModalProps {
  onClose: () => void;
}

// ===== Helpers =====
const timeAgo = (date: Date): string => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'à l\'instant';
  if (seconds < 60) return `il y a ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  return `il y a ${Math.floor(minutes / 60)}h`;
};

// ===== Composant =====
export function TokenDetailModal({ onClose }: TokenDetailModalProps) {
  const { tokenUsage, promptContext } = useLiveAPIContext();
  const { profile, setField, save } = useProfile();

  const [optimization, setOptimization] = useState<OptimizationData | null>(null);
  const [loadingOpt, setLoadingOpt] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const abortControllerRef = useRef<AbortController | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Derived data from context
  const { totalTokens, totalPromptTokens, totalCompletionTokens, history } = tokenUsage;

  // Memoized formatted values to avoid recalculations
  const formatted = useMemo(
    () => ({
      total: formatTokenCount(totalTokens),
      totalExact: formatExactTokenCount(totalTokens),
      prompt: formatTokenCount(totalPromptTokens),
      completion: formatTokenCount(totalCompletionTokens),
    }),
    [totalTokens, totalPromptTokens, totalCompletionTokens]
  );

  // Load optimization with abort support
  const loadOptimization = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingOpt(true);
    setOptError(null);

    try {
      const res = await fetch('/api/tokens/optimization', {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.status === 'success') {
        setOptimization(data.optimization);
      } else {
        throw new Error(data.message || 'Erreur inconnue');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Optimization fetch error:', err);
      setOptError("Impossible de charger les données d'optimisation");
    } finally {
      if (abortControllerRef.current === controller) {
        setLoadingOpt(false);
      }
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadOptimization();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadOptimization]);

  // Toggle compact mode with optimistic update and safe reload
  const handleToggleCompact = useCallback(async () => {
    const newValue = !profile.compactPrompt;
    setField('compactPrompt', newValue);
    try {
      await save();
      // Reload optimization in a transition to avoid blocking UI
      startTransition(() => {
        loadOptimization();
      });
    } catch (error) {
      console.error('Save failed:', error);
      // Rollback optimistic update if save fails (optional)
      setField('compactPrompt', profile.compactPrompt);
    }
  }, [profile.compactPrompt, setField, save, loadOptimization]);

  // Focus trap and ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        // Simple focus trap: keep focus inside modal
        const focusable = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Focus first interactive element after mount
    setTimeout(() => {
      const firstButton = modalRef.current?.querySelector('button');
      firstButton?.focus();
    }, 50);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ---- Rendu ----
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-3 py-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[84vh] overflow-hidden flex flex-col rounded-[28px] shadow-2xl"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-base)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 16%, transparent)' }}
            >
              <TrendingUp className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            </div>
            <div>
              <h2 id="modal-title" className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Détails du Système
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Contexte & tokens • {history.length} requêtes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-accent-primary"
            style={{ color: 'var(--text-muted)', backgroundColor: 'transparent' }}
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-thin">

          {/* ── Section : Contexte du Prompt ──────────────────────────── */}
          <div
            className="rounded-3xl p-4 space-y-3"
            style={{
              backgroundColor: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-base)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Brain
                  className="w-4 h-4"
                  style={{
                    color:
                      promptContext.level === 'critical'
                        ? 'var(--color-error)'
                        : promptContext.level === 'warn'
                          ? 'var(--color-warning)'
                          : 'var(--color-success)',
                  }}
                  aria-hidden="true"
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary, #a1a1aa)' }}
                >
                  Contexte du Prompt
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {promptContext.level !== 'ok' && (
                  promptContext.level === 'critical'
                    ? <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} aria-hidden="true" />
                    : <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
                )}
                <span
                  className="text-[12px] font-bold tabular-nums"
                  style={{
                    color:
                      promptContext.level === 'critical'
                        ? 'var(--color-error)'
                        : promptContext.level === 'warn'
                          ? 'var(--color-warning)'
                          : 'var(--color-success)',
                  }}
                >
                  {promptContext.percent}%
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div
                className="h-2.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 78%, transparent)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, promptContext.percent)}%`,
                    background:
                      promptContext.level === 'critical'
                        ? 'linear-gradient(90deg, #ef4444, #b91c1c)'
                        : promptContext.level === 'warn'
                          ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                          : 'linear-gradient(90deg, #10b981, #06b6d4)',
                  }}
                  role="progressbar"
                  aria-valuenow={Math.min(100, promptContext.percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Utilisation du contexte"
                />
              </div>
              <div
                className="flex justify-between mt-1 text-[9px]"
                style={{ color: 'var(--text-dimmed, #52525b)' }}
              >
                <span>{formatTokenCount(promptContext.currentSize)} utilisés</span>
                <span>{formatTokenCount(promptContext.maxSize)} max</span>
              </div>
            </div>

            {/* Turns */}
            {promptContext.turns > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <MessageSquare className="w-3 h-3" aria-hidden="true" />
                <span>{promptContext.turns} tour{promptContext.turns > 1 ? 's' : ''} dans le contexte</span>
              </div>
            )}

            {/* Suggestion */}
            {promptContext.suggestion ? (
              <div
                className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{
                  color: 'var(--color-warning)',
                  backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                }}
              >
                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-[10px]">{promptContext.suggestion}</span>
              </div>
            ) : promptContext.level === 'ok' && promptContext.currentSize > 0 ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{
                  color: 'var(--color-success)',
                  backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                }}
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                <span className="text-[10px]">Contexte en bonne santé</span>
              </div>
            ) : null}
          </div>

          {/* ── Section : Utilisation des Tokens ──────────────────────── */}

          {/* Total tokens */}
          <div className="text-center">
            <div className="flex items-center gap-2 justify-center mb-2">
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--text-secondary, #a1a1aa)' }}
              >
                Utilisation des Tokens
              </span>
            </div>
            <p className="text-3xl font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatted.total}
            </p>
            <p className="text-[10px] font-mono" style={{ color: 'var(--text-dimmed)' }} title="Valeur exacte">
              {formatted.totalExact} exact
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              tokens utilisés cette session
            </p>
          </div>

          {/* Prompt vs Completion */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-3xl p-4 border"
              style={{
                backgroundColor: 'rgba(14,165,233,0.08)',
                borderColor: 'rgba(14,165,233,0.16)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUp className="w-3.5 h-3.5" style={{ color: 'var(--color-info)' }} aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-info)' }}>Prompt</span>
              </div>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatted.prompt}</p>
            </div>
            <div
              className="rounded-3xl p-4 border"
              style={{
                backgroundColor: 'rgba(16,185,129,0.08)',
                borderColor: 'rgba(16,185,129,0.16)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDown className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-success)' }}>Réponse</span>
              </div>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatted.completion}</p>
            </div>
          </div>

          {/* Optimisation */}
          {optimization && (
            <div
              className="rounded-3xl p-4 space-y-3"
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-base)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary, #a1a1aa)' }}>
                  Contexte
                </span>
              </div>

              {/* Barre de progression */}
              <div>
                <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>Base: {formatTokenCount(optimization.totalBaseTokens)}</span>
                  <span>Max: {formatTokenCount(optimization.modelBudget.maxTotal)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 78%, transparent)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (optimization.totalBaseTokens / optimization.modelBudget.maxTotal) * 100)}%`,
                      background:
                        optimization.totalBaseTokens / optimization.modelBudget.maxTotal > 0.7
                          ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                          : 'linear-gradient(90deg, #10b981, #06b6d4)',
                    }}
                    role="progressbar"
                    aria-valuenow={Math.min(100, (optimization.totalBaseTokens / optimization.modelBudget.maxTotal) * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[9px]" style={{ color: 'var(--text-dimmed, #52525b)' }}>
                  <span>Prompt sys: {formatTokenCount(optimization.systemPromptTokens)}</span>
                  <span>Mémoire: {formatTokenCount(optimization.memoryTokens)}</span>
                  <span>Dispo: {formatTokenCount(optimization.availableForConversation)}</span>
                </div>
              </div>

              {/* Économies */}
              {optimization.compactEnabled && optimization.savedTokens && optimization.savedTokens > 0 && (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                  style={{
                    color: 'var(--color-success)',
                    backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                  }}
                >
                  <Zap className="w-3 h-3" aria-hidden="true" />
                  <span className="text-[10px] font-semibold">−{formatTokenCount(optimization.savedTokens)} économisés (mode compact)</span>
                </div>
              )}

              {/* Suggestions */}
              {optimization.suggestions.length > 0 && (
                <div className="space-y-1 mt-2">
                  {optimization.suggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg"
                      style={{
                        color: 'var(--color-warning)',
                        backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                      }}
                    >
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-[10px]">{suggestion}</span>
                    </div>
                  ))}
                </div>
              )}

              {optimization.suggestions.length === 0 && !optimization.compactEnabled && (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                  style={{
                    color: 'var(--color-success)',
                    backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                  }}
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span className="text-[10px]">Utilisation optimale</span>
                </div>
              )}
            </div>
          )}

          {/* État de chargement / erreur optimisation */}
          {loadingOpt && (
            <div className="flex items-center justify-center py-3" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>Chargement des données...</span>
            </div>
          )}
          {optError && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{
                color: 'var(--color-error)',
                backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              }}
            >
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              <span>{optError}</span>
            </div>
          )}

          {/* Toggle compact */}
          <button
            type="button"
            onClick={handleToggleCompact}
            disabled={isPending}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-3xl text-[11px] font-medium transition-all ${isPending ? 'opacity-60 cursor-wait' : 'hover:shadow-sm'}`}
            style={{
              border: profile.compactPrompt ? '1px solid rgba(16,185,129,0.24)' : '1px solid var(--border-base)',
              backgroundColor: profile.compactPrompt ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
              color: profile.compactPrompt ? 'var(--color-success)' : 'var(--text-secondary)',
            }}
            aria-pressed={profile.compactPrompt}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4" aria-hidden="true" />
              Mode compact (−40% tokens prompt)
            </span>
            <span
              className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
              style={{
                backgroundColor: profile.compactPrompt ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.08)',
                color: profile.compactPrompt ? 'var(--color-success)' : 'var(--text-muted)',
              }}
            >
              {profile.compactPrompt ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Historique */}
          {history.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Dernières requêtes ({history.length})
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                {[...history]
                  .reverse()
                  .slice(0, 25)
                  .map((usage, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--bg-input) 80%, transparent)' }}
                    >
                      <div className="flex-1 flex items-center gap-2 text-[11px] tabular-nums">
                        <span className="font-medium" style={{ color: 'var(--color-info)' }}>↑{formatTokenCount(usage.promptTokens)}</span>
                        <span className="font-medium" style={{ color: 'var(--color-success)' }}>↓{formatTokenCount(usage.completionTokens)}</span>
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                          Σ{formatTokenCount(usage.totalTokens)}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                        <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                        {timeAgo(usage.timestamp)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {history.length === 0 && (
            <div className="text-center py-6">
              <Hash className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Aucune requête enregistrée
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
                Les tokens apparaîtront après la première interaction
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
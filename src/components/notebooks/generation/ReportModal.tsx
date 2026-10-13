/**
 * ReportModal — modal « Générer un rapport » : suggestions IA + grille complète
 * des types de rapports. Composant présentationnel.
 *
 * Posée sur NbModal (ui/Modal) : focus piégé, Échap, clic voile et
 * restitution du focus sont gérés par la primitive.
 */

import { FileBarChart, Lightbulb, RefreshCw, Sparkles, Zap, ArrowRight } from 'lucide-react';
import { NbModal, NbButton, NbBadge } from '../ui/primitives.js';
import { DOC_TYPES, REPORT_TYPES } from './constants.js';

interface Suggestion {
  type: string;
  title: string;
  description: string;
  reason: string;
  relevance: number;
  recommendedSourceIds: string[];
}

interface Props {
  show: boolean;
  sources: { id: string }[];
  suggestions: Suggestion[];
  loadingSuggestions: boolean;
  onClose: () => void;
  onLoadSuggestions: () => void;
  onSelectSuggestion: (suggestion: Suggestion) => void;
  onSelectType: (type: string) => void;
}

/** Carte cliquable de la grille (suggestion ou type de rapport). */
const GRID_CARD =
  'notebook-card group relative w-full overflow-hidden rounded-xl text-left transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]';

export function ReportModal({
  show, sources, suggestions, loadingSuggestions,
  onClose, onLoadSuggestions, onSelectSuggestion, onSelectType,
}: Props) {
  return (
    <NbModal open={show} onClose={onClose} size="2xl">
      {/* Modal header */}
      <NbModal.Header>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--color-error)_25%,transparent)] bg-[var(--color-error-subtle)]">
          <FileBarChart className="h-5 w-5 text-[var(--color-error)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Générer un rapport
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Choisissez un type ou suivez les suggestions basées sur vos {sources.length} source{sources.length > 1 ? 's' : ''}
          </p>
        </div>
      </NbModal.Header>

      {/* Modal content — scrollable */}
      <NbModal.Body className="space-y-6 p-6">
        {/* Suggestions IA */}
        <div className="space-y-4 rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-warning)_7%,transparent),color-mix(in_srgb,var(--notebook-accent)_5%,transparent))] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[var(--color-warning-subtle)]">
              <Lightbulb className="h-4 w-4 text-[var(--color-warning)]" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
                Suggestions pour vos sources
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-dimmed)]">
                Recommandations générées par l'IA
              </p>
            </div>
            {!loadingSuggestions && suggestions.length > 0 && (
              <NbBadge tone="warning" className="flex-shrink-0">
                {suggestions.length}
              </NbBadge>
            )}
            {!loadingSuggestions && (
              <NbButton
                size="sm"
                icon={RefreshCw}
                onClick={onLoadSuggestions}
                className="ml-auto flex-shrink-0"
                title="Demander de nouvelles suggestions (actualisation manuelle)"
              >
                {suggestions.length > 0 ? 'Rafraîchir' : 'Obtenir des suggestions'}
              </NbButton>
            )}
          </div>

          {loadingSuggestions && (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="notebook-card flex animate-pulse items-start gap-3 rounded-xl p-4"
                >
                  <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-[var(--notebook-surface-muted)]" />
                  <div className="flex-1 space-y-2 pt-0.5">
                    <div className="h-3 w-3/4 rounded-full bg-[var(--notebook-surface-muted)]" />
                    <div className="h-2.5 w-full rounded-full bg-[var(--notebook-surface-muted)]" />
                    <div className="h-2.5 w-2/3 rounded-full bg-[var(--notebook-surface-muted)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingSuggestions && suggestions.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {suggestions.map((suggestion, idx) => {
                const docType = REPORT_TYPES.find(t => t.key === suggestion.type) || DOC_TYPES.find(t => t.key === suggestion.type);
                const SugIcon = docType?.icon || Sparkles;
                const docColor = docType?.color || 'var(--text-muted)';
                const relevance = Math.max(0, Math.min(100, suggestion.relevance ?? 0));
                return (
                  <button
                    key={idx}
                    type="button"
                    data-interactive="true"
                    onClick={() => onSelectSuggestion(suggestion)}
                    className={`${GRID_CARD} flex flex-col gap-3 p-4`}
                  >
                    <span
                      className="absolute bottom-0 left-0 top-0 w-1 opacity-80 transition-all group-hover:w-1.5"
                      style={{ backgroundColor: docColor }}
                    />
                    <div className="flex items-start gap-3 pl-1">
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110"
                        style={{ backgroundColor: `color-mix(in srgb, ${docColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${docColor} 25%, transparent)` }}
                      >
                        <SugIcon className="h-4 w-4" style={{ color: docColor }} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold leading-tight text-[var(--text-primary)]">
                          {suggestion.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                          {suggestion.reason}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--text-dimmed)]">
                          Pertinence
                        </span>
                        <span className="text-xs font-semibold" style={{ color: docColor }}>
                          {relevance}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
                        <span
                          className="block h-full rounded-full transition-all"
                          style={{ width: `${relevance}%`, backgroundColor: docColor }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-1 pl-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="text-xs font-semibold text-[var(--notebook-accent)]">Générer ce rapport</span>
                      <Zap className="h-3.5 w-3.5 text-[var(--color-warning)]" aria-hidden />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!loadingSuggestions && suggestions.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[var(--notebook-canvas)] px-4 py-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-warning-subtle)]">
                <Sparkles className="h-5 w-5 text-[var(--color-warning)]" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Aucune suggestion pour le moment
                </p>
                <p className="mt-1 max-w-xs text-xs text-[var(--text-dimmed)]">
                  Lancez l'analyse pour que l'IA identifie les rapports les plus pertinents à partir de vos sources.
                </p>
              </div>
              <NbButton variant="primary" size="sm" icon={Sparkles} onClick={onLoadSuggestions}>
                Obtenir des suggestions
              </NbButton>
            </div>
          )}
        </div>

        {/* Séparateur */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--notebook-border)]" />
          <span className="notebook-eyebrow">
            ou choisir un type de rapport
          </span>
          <div className="h-px flex-1 bg-[var(--notebook-border)]" />
        </div>

        {/* Grille de tous les types */}
        <div className="grid grid-cols-2 gap-3">
          {REPORT_TYPES.map(({ key, label, icon: Icon, desc, color }) => (
            <button
              key={key}
              type="button"
              data-interactive="true"
              onClick={() => onSelectType(key)}
              className={`${GRID_CARD} flex items-start gap-3 p-4`}
            >
              <span
                className="absolute bottom-0 left-0 top-0 w-1 opacity-70 transition-all group-hover:w-1.5"
                style={{ backgroundColor: color }}
              />
              <div
                className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}
              >
                <Icon className="h-4 w-4" style={{ color }} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  {label}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-[var(--text-dimmed)]">
                  {desc}
                </p>
              </div>
              <ArrowRight
                className="mt-1 h-3.5 w-3.5 flex-shrink-0 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                style={{ color }}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </NbModal.Body>

      {/* Modal footer */}
      <NbModal.Footer align="between" className="bg-[var(--notebook-surface-muted)] py-3">
        <p className="text-xs text-[var(--text-dimmed)]">
          {sources.length} source{sources.length > 1 ? 's' : ''} disponible{sources.length > 1 ? 's' : ''} • Le rapport sera généré en streaming
        </p>
        <NbButton variant="ghost" size="sm" onClick={onClose}>
          Annuler
        </NbButton>
      </NbModal.Footer>
    </NbModal>
  );
}

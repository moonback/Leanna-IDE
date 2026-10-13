/**
 * DocViewer — vue plein écran : affiche le streaming en cours, le document
 * sélectionné (avec barre d'actions) ou un état vide. Composant présentationnel.
 */

import { forwardRef, type JSX } from 'react';
import {
  Loader2, ArrowLeft, FolderInput, RefreshCw, Download, Copy, CheckCircle2,
  Presentation, Sparkles, Zap, Target, PenLine, AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NbIconButton, NbBadge } from '../ui/primitives.js';
import { DOC_TYPES, REPORT_TYPES, SLIDE_EXCLUDED_TYPES } from './constants.js';
import { renderGeneratedContent } from './renderHelpers.js';
import { renderInfographicContent } from './renderInfographic.js';
import type { GeneratedDoc, QueuedGeneration } from './types.js';

interface Props {
  sources: { id: string }[];
  streamingTexts: Record<string, string>;
  activeGenerationIds: Set<string>;
  generationQueue: QueuedGeneration[];
  selectedDoc: GeneratedDoc | null;
  copied: boolean;
  onClose?: () => void;
  onImportToWorkspace: (doc: GeneratedDoc) => void;
  onRegenerate: () => void;
  onExportMd: (doc: GeneratedDoc) => void;
  onCopy: (content: string) => void;
  onOpenSlides: () => void;
}

export const DocViewer = forwardRef<HTMLDivElement, Props>(function DocViewer({
  sources,
  streamingTexts,
  activeGenerationIds,
  generationQueue,
  selectedDoc,
  copied,
  onClose,
  onImportToWorkspace,
  onRegenerate,
  onExportMd,
  onCopy,
  onOpenSlides,
}, ref) {
  return (
    <div ref={ref} className="notebooklm-viewer custom-scrollbar flex-1 overflow-y-auto p-5 lg:p-8">
      {/* Streaming view */}
      {Object.keys(streamingTexts).length > 0 && !selectedDoc && (
        <div className="max-w-3xl space-y-5">
          <div className="flex items-center gap-2 border-b border-[var(--notebook-border)] pb-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--notebook-accent)]" aria-hidden />
            <span className="text-xs font-medium text-[var(--text-primary)]">
              {activeGenerationIds.size > 1 ? `${activeGenerationIds.size} générations en cours...` : 'Génération en cours...'}
            </span>
            <span className="ml-auto text-xs tabular-nums text-[var(--text-dimmed)]">
              {Object.values(streamingTexts).reduce((sum, text) => sum + text.length, 0)} caractères
            </span>
          </div>
          {activeGenerationIds.size === 1 ? (
            (() => {
              const taskId = [...activeGenerationIds][0];
              const task = generationQueue.find(t => t.id === taskId);
              const streamingText = streamingTexts[taskId] || '';
              if (!task) return null;
              return task.type === 'infographic' && streamingText.includes('data:image/')
                ? renderInfographicContent(streamingText)
                : renderGeneratedContent(streamingText);
            })()
          ) : (
            <div className="text-xs text-[var(--text-muted)]">
              Plusieurs générations en cours. Voir la file d'attente pour les détails.
            </div>
          )}
          <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-[var(--notebook-accent)]" />
        </div>
      )}

      {/* Selected document view */}
      {selectedDoc && Object.keys(streamingTexts).length === 0 ? (
        <div className={`space-y-5 ${selectedDoc.type === 'mindmap' ? 'max-w-none' : 'mx-auto max-w-6xl'}`}>
          {/* Document header — sticky */}
          <div className="notebooklm-doc-header sticky top-0 z-10 flex items-start gap-3 border-b border-[var(--notebook-border)] bg-[var(--notebook-canvas)] pb-6 pt-2 backdrop-blur-md">
            {onClose && (
              <NbIconButton icon={ArrowLeft} label="Retour" onClick={onClose} className="mt-0.5 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                {(() => {
                  const docType = DOC_TYPES.find(t => t.key === selectedDoc.type) || REPORT_TYPES.find(t => t.key === selectedDoc.type);
                  const docColor = docType?.color || 'var(--text-muted)';
                  return (
                    <span
                      className="notebook-badge uppercase"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${docColor} 15%, transparent)`,
                        color: docColor,
                      }}
                    >
                      {docType?.label || selectedDoc.type}
                    </span>
                  );
                })()}
                <span className="text-xs text-[var(--text-dimmed)]">
                  {new Date(selectedDoc.createdAt).toLocaleString('fr-FR')}
                </span>
                <span className="text-xs text-[var(--text-dimmed)]">
                  • {selectedDoc.content.length} chars
                </span>
              </div>
              <h2 className="notebook-heading text-base font-semibold text-[var(--text-primary)]">
                {selectedDoc.title}
              </h2>
            </div>

            {/* Action buttons */}
            <div className="notebook-actions flex-shrink-0">
              <NbIconButton
                icon={FolderInput}
                label="Importer dans le workspace"
                onClick={() => onImportToWorkspace(selectedDoc)}
              />
              <NbIconButton
                icon={RefreshCw}
                label="Régénérer"
                onClick={onRegenerate}
                disabled={sources.length === 0}
              />
              <NbIconButton
                icon={Download}
                label="Exporter en Markdown"
                onClick={() => onExportMd(selectedDoc)}
              />
              <NbIconButton
                icon={copied ? CheckCircle2 : Copy}
                label="Copier"
                onClick={() => onCopy(selectedDoc.content)}
                className={copied ? 'text-[var(--color-success)]' : undefined}
              />
              {!SLIDE_EXCLUDED_TYPES.has(selectedDoc.type) && (
                <NbIconButton
                  icon={Presentation}
                  label="Générer une présentation Reveal.js"
                  onClick={onOpenSlides}
                  className="text-[var(--notebook-accent)]"
                />
              )}
            </div>
          </div>

          {/* Document content */}
          {selectedDoc.type === 'infographic' ? (
            renderInfographicContent(selectedDoc.content)
          ) : (
            renderGeneratedContent(selectedDoc.content)
          )}
        </div>
      ) : Object.keys(streamingTexts).length === 0 && (
        /* Empty state — professional landing */
        <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)]">
              <Sparkles className="h-8 w-8 text-[var(--notebook-accent)]" aria-hidden />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--notebook-accent)] bg-[var(--notebook-surface)] shadow-md">
              <span className="text-xs font-semibold text-[var(--notebook-accent)]">AI</span>
            </div>
          </div>

          <div className="max-w-sm space-y-2 text-center">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Génération intelligente
            </h3>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Transformez vos sources en documents structurés. Résumés, FAQ, guides d'étude, chronologies et plus encore.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="grid w-full max-w-sm grid-cols-3 gap-3">
            {([
              { icon: Zap, label: 'Streaming', sub: 'Temps réel' },
              { icon: Target, label: 'Sources', sub: 'Ciblé' },
              { icon: PenLine, label: 'Custom', sub: 'Instructions' },
            ] as { icon: LucideIcon; label: string; sub: string }[]).map(f => {
              const FIcon = f.icon;
              return (
                <div
                  key={f.label}
                  className="notebook-card flex flex-col items-center gap-1 rounded-xl p-3"
                >
                  <span className="inline-flex items-center text-[var(--text-muted)]"><FIcon size={16} aria-hidden /></span>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{f.label}</span>
                  <span className="text-xs text-[var(--text-dimmed)]">{f.sub}</span>
                </div>
              );
            })}
          </div>

          {sources.length === 0 && (
            <NbBadge tone="warning" icon={AlertTriangle} className="px-4 py-2 text-xs font-medium">
              Ajoutez des sources dans l'onglet Sources pour commencer
            </NbBadge>
          )}
        </div>
      )}
    </div>
  );
}) as (props: Props & { ref?: React.Ref<HTMLDivElement> }) => JSX.Element;

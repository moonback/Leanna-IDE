/**
 * SourceListCompact — rendu compact (colonne latérale) de la liste des sources :
 * en-tête avec actions de sélection / suppression globale, recherche, liste en
 * pilules, et pied de page avec statistiques. Composant présentationnel.
 */

import type { SpringTransition, TapScaleProps } from '../motionTypes.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Trash2, Plus, FileText, CheckSquare, Square, X, PanelLeftClose, Activity,
} from 'lucide-react';
import { TYPE_ICONS, TYPE_COLORS, ACCEPTED_EXTENSIONS, type SourceItem } from './constants.js';
import { NbButton, NbEmptyState, NbIconButton } from '../ui/primitives.js';

// Primitives animables (whileTap) comme les anciens motion.button.
const MotionButton = motion.create(NbButton);
const MotionIconButton = motion.create(NbIconButton);

interface Props {
  sources: SourceItem[];
  filteredSources: SourceItem[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedSources: string[];
  selectedSourceId?: string | null;
  uploading: boolean;
  confirmDeleteAll: boolean;
  allFilteredSelected: boolean;
  totalWords: number;
  totalChunks: number;
  prefersReducedMotion: boolean | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  spring: SpringTransition;
  springSnappy: SpringTransition;
  tapScale: TapScaleProps;

  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openFilePicker: () => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
  onToggleSelect: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onSelectSource?: (sourceId: string) => void;
  /** Ouvre le gestionnaire d'ajout (URL, texte, GitHub…) ; à défaut, le sélecteur de fichiers */
  onAddSources?: () => void;
  /** Ouvre le moniteur d'indexation (État des embeddings par source) */
  onOpenIndexing?: () => void;
  /** Replie le panneau Sources */
  onCollapse?: () => void;
}

export function SourceListCompact(props: Props) {
  const {
    sources, filteredSources, searchQuery, setSearchQuery,
    selectedSources, selectedSourceId, uploading, confirmDeleteAll, allFilteredSelected,
    totalWords, totalChunks, prefersReducedMotion,
    fileInputRef, spring, springSnappy, tapScale,
    onFileInputChange, openFilePicker, onSelectAll, onDeleteSelected, onDeleteAll,
    onToggleSelect, onDelete, onSelectSource, onAddSources, onOpenIndexing, onCollapse,
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="notebook-panel-header">
        <h2 className="notebook-panel-title flex items-center gap-2">
          Sources
          {sources.length > 0 && <span className="notebook-count">{sources.length}</span>}
        </h2>
        <div className="flex flex-shrink-0 items-center gap-1">
          <AnimatePresence mode="wait" initial={false}>
            {selectedSources.length > 0 && (
              <motion.div
                key="selection-actions"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springSnappy}
                className="flex items-center gap-1"
              >
                <MotionIconButton
                  {...tapScale}
                  icon={CheckSquare}
                  label={allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  onClick={onSelectAll}
                  disabled={uploading}
                  className="!text-[var(--notebook-accent)]"
                />
                <MotionButton
                  {...tapScale}
                  variant="secondary"
                  size="sm"
                  icon={Trash2}
                  loading={uploading}
                  onClick={onDeleteSelected}
                  className="!border-transparent !bg-[var(--color-error-subtle)] !text-[var(--color-error)]"
                >
                  <span>{selectedSources.length}</span>
                </MotionButton>
              </motion.div>
            )}
          </AnimatePresence>
          {onCollapse && (
            <NbIconButton
              icon={PanelLeftClose}
              label="Réduire le panneau Sources"
              onClick={onCollapse}
            />
          )}
        </div>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} multiple onChange={onFileInputChange} className="hidden" />
      </div>

      {/* Ajouter + Indexation + recherche */}
      <div className="flex-shrink-0 space-y-2 px-3 pb-1 pt-3">
        <div className="flex items-center gap-2">
          <MotionButton
            {...tapScale}
            variant="secondary"
            icon={Plus}
            loading={uploading}
            onClick={onAddSources ?? openFilePicker}
            className="min-w-0 flex-1 !rounded-full"
          >
            Ajouter des sources
          </MotionButton>
          {onOpenIndexing && (
            <MotionIconButton
              {...tapScale}
              icon={Activity}
              label="Indexation — état des embeddings par source (Ctrl+7 / ⌘7)"
              title="Indexation"
              onClick={onOpenIndexing}
              className="flex-shrink-0"
            />
          )}
        </div>
      {sources.length > 0 && (
        <div>
          <div className="notebook-search-field !gap-2 !pr-1">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              aria-label="Rechercher dans les sources"
              className="!text-xs"
            />
            {searchQuery && (
              <NbIconButton
                icon={X}
                size="sm"
                label="Effacer la recherche"
                onClick={() => setSearchQuery('')}
                className="!h-6 !w-6 flex-shrink-0"
              />
            )}
          </div>
        </div>
      )}
      </div>

      {/* Source list */}
      <div className="custom-scrollbar max-h-full min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {sources.length === 0 ? (
          <NbEmptyState
            icon={FileText}
            title="Aucune source"
            description="Ajoutez des documents pour alimenter l'IA."
            action={
              <MotionButton
                {...tapScale}
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={onAddSources ?? openFilePicker}
              >
                Ajouter une source
              </MotionButton>
            }
          />
        ) : filteredSources.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Search className="h-4 w-4 text-[var(--text-dimmed)]" aria-hidden />
            <p className="text-xs text-[var(--text-muted)]">Aucun résultat pour « {searchQuery} »</p>
          </div>
        ) : (
          <div className="space-y-1 pt-1">
            <AnimatePresence initial={false}>
              {filteredSources.map((source) => {
                const isSelected = selectedSources.includes(source.id);
                const isSingleSelected = selectedSourceId === source.id;
                const hasSelection = selectedSources.length > 0;
                const typeColor = TYPE_COLORS[source.type] || 'var(--text-muted)';

                return (
                  <motion.div
                    key={source.id}
                    layout={!prefersReducedMotion}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={spring}
                    className="notebook-source-row group cursor-pointer !gap-2 !px-2"
                    data-active={isSingleSelected || isSelected}
                    onClick={() => {
                      if (hasSelection) {
                        onToggleSelect(source.id);
                      } else {
                        onSelectSource?.(source.id);
                      }
                    }}
                  >
                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(source.id); }}
                      className={`flex-shrink-0 rounded p-0.5 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--notebook-accent)] ${hasSelection || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
                      ) : (
                        <Square className="h-4 w-4 text-[var(--text-dimmed)]" aria-hidden />
                      )}
                    </button>

                    {/* File type icon */}
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
                      style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 12%, transparent)` }}
                    >
                      {TYPE_ICONS[source.type] || '📎'}
                    </div>

                    {/* Text content */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {source.title}
                      </p>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-[var(--text-dimmed)]">
                        <span className="truncate">{source.type} · {source.wordCount?.toLocaleString()} mots</span>
                        {source.indexingStatus && (
                          <span
                            className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              source.indexingStatus === 'indexed'
                                ? 'text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)]'
                                : source.indexingStatus === 'failed'
                                  ? 'text-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)]'
                                  : source.indexingStatus === 'partial'
                                    ? 'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)]'
                                    : 'text-[var(--text-muted)] bg-[var(--notebook-surface-muted)]'
                            }`}
                            title={source.indexingError || `Indexation : ${source.indexingStatus}`}
                            aria-label={`État de l'indexation : ${source.indexingStatus}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            {source.indexingStatus === 'indexed' ? 'Indexé' :
                              source.indexingStatus === 'pending' ? 'En attente' :
                              source.indexingStatus === 'partial' ? 'Partiel' : 'Échec'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete button on hover */}
                    <NbIconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label={`Supprimer ${source.title}`}
                      title="Supprimer"
                      onClick={(e) => { e.stopPropagation(); onDelete(source.id); }}
                      className="flex-shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer stats */}
      {sources.length > 0 && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-[var(--notebook-border)] py-1.5 pl-4 pr-2">
          <p className="truncate text-xs tabular-nums text-[var(--text-dimmed)]">
            {totalWords.toLocaleString()} mots · {totalChunks} chunks
          </p>
          <MotionIconButton
            {...tapScale}
            icon={Trash2}
            size="sm"
            tone="danger"
            label="Supprimer toutes les sources"
            title={confirmDeleteAll ? 'Cliquez pour confirmer' : 'Supprimer toutes les sources'}
            onClick={onDeleteAll}
            disabled={uploading}
            className={confirmDeleteAll ? '!bg-[var(--color-error-subtle)] !text-[var(--color-error)]' : undefined}
          />
        </div>
      )}
    </div>
  );
}

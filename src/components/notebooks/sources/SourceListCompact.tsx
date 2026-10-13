/**
 * SourceListCompact — rendu compact (colonne latérale) de la liste des sources :
 * en-tête avec actions de sélection / suppression globale, recherche, liste en
 * pilules, et pied de page avec statistiques. Composant présentationnel.
 */

import type { SpringTransition, TapScaleProps } from '../motionTypes.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Trash2, Plus, FileText, CheckSquare, Square, X,
} from 'lucide-react';
import { TYPE_ICONS, TYPE_COLORS, ACCEPTED_EXTENSIONS, type SourceItem } from './constants.js';
import { NbButton, NbEmptyState, NbIconButton, NbSectionLabel } from '../ui/primitives.js';

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
}

export function SourceListCompact(props: Props) {
  const {
    sources, filteredSources, searchQuery, setSearchQuery,
    selectedSources, selectedSourceId, uploading, confirmDeleteAll, allFilteredSelected,
    totalWords, totalChunks, prefersReducedMotion,
    fileInputRef, spring, springSnappy, tapScale,
    onFileInputChange, openFilePicker, onSelectAll, onDeleteSelected, onDeleteAll,
    onToggleSelect, onDelete, onSelectSource,
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* Header */}
      <div className="notebook-panel-header !py-3">
        <div className="min-w-0">
          <NbSectionLabel>Sources</NbSectionLabel>
          <h2 className="notebook-panel-title truncate">
            {sources.length} document{sources.length !== 1 ? 's' : ''}
          </h2>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <AnimatePresence mode="wait" initial={false}>
            {selectedSources.length > 0 ? (
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
                  <span>Supprimer ({selectedSources.length})</span>
                </MotionButton>
              </motion.div>
            ) : (
              <motion.div
                key="default-actions"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springSnappy}
                className="flex items-center gap-1"
              >
                {sources.length > 0 && (
                  <MotionIconButton
                    {...tapScale}
                    icon={Trash2}
                    tone="danger"
                    label="Supprimer toutes les sources"
                    title={confirmDeleteAll ? 'Cliquez pour confirmer' : 'Supprimer toutes les sources'}
                    onClick={onDeleteAll}
                    disabled={uploading}
                    className={confirmDeleteAll ? '!bg-[var(--color-error-subtle)] !text-[var(--color-success)]' : undefined}
                  />
                )}
                <MotionButton
                  {...tapScale}
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  loading={uploading}
                  onClick={openFilePicker}
                >
                  <span>Ajouter</span>
                </MotionButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} multiple onChange={onFileInputChange} className="hidden" />
      </div>

      {/* Search */}
      {sources.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2">
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
                onClick={openFilePicker}
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
                      <p className="mt-0.5 truncate text-xs text-[var(--text-dimmed)]">
                        {source.type} · {source.wordCount?.toLocaleString()} mots
                      </p>
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
        <div className="flex-shrink-0 border-t border-[var(--notebook-border)] px-4 py-2">
          <p className="text-center text-xs text-[var(--text-dimmed)]">
            {totalWords.toLocaleString()} mots · {totalChunks} chunks
          </p>
        </div>
      )}
    </div>
  );
}

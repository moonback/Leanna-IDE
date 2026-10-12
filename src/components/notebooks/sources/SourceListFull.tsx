/**
 * SourceListFull — rendu plein écran de la liste des sources : cartes avec
 * aperçu du contenu, mots-clés/tags, ré-indexation et suppression par item.
 * Composant présentationnel.
 *
 * Performance (Phase 3) : au-delà de VIRTUALIZE_THRESHOLD sources affichées, la
 * liste bascule sur une virtualisation `react-window` (fenêtrage) pour ne monter
 * dans le DOM que les cartes visibles. En-dessous du seuil — le cas courant — on
 * conserve la liste animée (motion/AnimatePresence : layout + enter/exit) à
 * l'identique. La carte elle-même (SourceCard) est partagée entre les deux
 * chemins ; seule l'enveloppe diffère (motion.div animé vs div statique mesuré).
 */

import { motion, AnimatePresence } from 'motion/react';
import { List, useDynamicRowHeight, type RowComponentProps } from 'react-window';
import type { SpringTransition, TapScaleProps } from '../motionTypes.js';
import {
  Sparkles, Search, Loader2, Eye, RefreshCw, Trash2, CheckSquare, Square, X, Plus,
} from 'lucide-react';
import { TYPE_ICONS, TYPE_COLORS, type SourceItem } from './constants.js';

// Seuil au-delà duquel on vire sur la virtualisation. En-dessous, la liste
// animée reste identique au comportement d'origine.
const VIRTUALIZE_THRESHOLD = 40;
// Hauteur par défaut d'une carte avant mesure dynamique (react-window).
const ESTIMATED_ROW_HEIGHT = 132;

interface Props {
  sources: SourceItem[];
  filteredSources: SourceItem[];
  searchQuery: string;
  dragOver: boolean;
  selectedSources: string[];
  expandedSource: string | null;
  loadingPreview: boolean;
  sourcePreview: Record<string, string>;
  reindexingId: string | null;
  tagInput: { sourceId: string; value: string } | null;
  prefersReducedMotion: boolean | null;
  spring: SpringTransition;
  tapScale: TapScaleProps;

  onToggleSelect: (sourceId: string) => void;
  onTogglePreview: (sourceId: string) => void;
  onReindex: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onRemoveTag: (sourceId: string, tag: string) => void;
  onAddTag: (sourceId: string, tag: string) => void;
  setTagInput: (v: { sourceId: string; value: string } | null) => void;
}

/**
 * Props partagées entre toutes les cartes d'une liste (état d'affichage +
 * callbacks). Identiques pour chaque carte, elles sont construites une seule
 * fois puis étalées (`{...shared}`) dans chaque `SourceCard` — évite la
 * duplication entre le chemin animé et le chemin virtualisé.
 */
interface SourceCardSharedProps {
  expandedSource: string | null;
  loadingPreview: boolean;
  sourcePreview: Record<string, string>;
  reindexingId: string | null;
  tagInput: { sourceId: string; value: string } | null;
  tapScale: TapScaleProps;
  onToggleSelect: (sourceId: string) => void;
  onTogglePreview: (sourceId: string) => void;
  onReindex: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onRemoveTag: (sourceId: string, tag: string) => void;
  onAddTag: (sourceId: string, tag: string) => void;
  setTagInput: (v: { sourceId: string; value: string } | null) => void;
}

/** Props propres au contenu d'une carte source (hors enveloppe animée). */
interface SourceCardProps extends SourceCardSharedProps {
  source: SourceItem;
  isSelected: boolean;
  selectedCount: number;
}

/**
 * SourceCard — contenu interne d'une carte source (checkbox, icône, méta,
 * mots-clés, aperçu, actions). Partagé entre le chemin animé et le chemin
 * virtualisé. N'inclut PAS l'enveloppe (motion.div / div) ni le hover border.
 */
function SourceCard({
  source, isSelected, selectedCount,
  expandedSource, loadingPreview, sourcePreview, reindexingId, tagInput,
  tapScale, onToggleSelect, onTogglePreview, onReindex, onDelete,
  onRemoveTag, onAddTag, setTagInput,
}: SourceCardProps) {
  const typeColor = TYPE_COLORS[source.type] || 'var(--text-muted)';
  const isExpanded = expandedSource === source.id;
  const isReindexing = reindexingId === source.id;
  return (
    <>
      {/* Checkbox de sélection */}
      <button
        type="button"
        onClick={() => onToggleSelect(source.id)}
        className={`flex-shrink-0 self-start mt-0.5 transition-opacity ${isSelected || selectedCount > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
      >
        {isSelected ? (
          <CheckSquare className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        ) : (
          <Square className="w-4 h-4" style={{ color: 'var(--text-dimmed)' }} />
        )}
      </button>

      {/* Type icon with color indicator */}
      <div
        className="flex flex-col items-center gap-1 flex-shrink-0 w-7 h-7 rounded-full justify-center"
        style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 12%, transparent)` }}
      >
        <span className="text-sm leading-none">{TYPE_ICONS[source.type] || '📎'}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {source.title}
          </p>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase flex-shrink-0 leading-none"
            style={{ letterSpacing: '0.04em', backgroundColor: `color-mix(in srgb, ${typeColor} 14%, transparent)`, color: typeColor }}
          >
            {source.type}
          </span>
        </div>

        <p className="text-xs mt-0.5 leading-relaxed line-clamp-1" style={{ color: 'var(--text-muted)' }}>
          {source.summary}
        </p>

        {/* Expanded content preview */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="mt-2 p-3 rounded-xl text-xs leading-relaxed max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap"
                style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-secondary)' }}
              >
                {loadingPreview ? (
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-dimmed)' }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Chargement du contenu…</span>
                  </div>
                ) : (
                  sourcePreview[source.id] || source.summary
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Meta row — séparateurs à puce discrets pour un alignement net */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs" style={{ color: 'var(--text-dimmed)' }}>
          <span className="font-medium">{source.wordCount.toLocaleString()} mots</span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span>{source.chunksCount} chunks</span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span className="uppercase font-medium" style={{ letterSpacing: '0.02em' }}>{source.language}</span>
        </div>

        {/* Keywords + Tags — toujours rendu (ajout d'un 1er tag possible). */}
        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
          {source.keywords.slice(0, 6).map((kw: string) => (
            <span
              key={kw}
              className="group/tag inline-flex items-center gap-1 text-xs pl-2.5 pr-1.5 py-0.5 rounded-full font-medium transition-colors"
              style={{ backgroundColor: 'var(--notebook-surface-muted)', color: 'var(--text-secondary)', border: '1px solid var(--notebook-border)' }}
            >
              {kw}
              <button
                type="button"
                onClick={() => onRemoveTag(source.id, kw)}
                className="flex items-center justify-center w-3.5 h-3.5 rounded-full transition-colors hover:bg-[var(--notebook-accent-surface)]"
                title="Retirer ce mot-clé"
                aria-label={`Retirer le mot-clé ${kw}`}
              >
                <X className="w-2.5 h-2.5" style={{ color: 'var(--text-dimmed)' }} />
              </button>
            </span>
          ))}
          {source.keywords.length > 6 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--text-dimmed)' }}>
              +{source.keywords.length - 6}
            </span>
          )}
          {/* Add tag inline */}
          {tagInput?.sourceId === source.id ? (
            <form
              onSubmit={(e) => { e.preventDefault(); onAddTag(source.id, tagInput.value); }}
              className="inline-flex"
            >
              <input
                type="text"
                value={tagInput.value}
                onChange={(e) => setTagInput({ sourceId: source.id, value: e.target.value })}
                placeholder="mot-clé…"
                // autoFocus justifié : le champ n'apparaît qu'après clic sur
                // « + tag » ; focus immédiat attendu pour la saisie.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onBlur={() => setTagInput(null)}
                className="text-xs px-2.5 py-0.5 rounded-full w-20 outline-none"
                style={{ backgroundColor: 'var(--notebook-accent-surface)', color: 'var(--text-primary)', border: '1px solid var(--notebook-accent)' }}
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setTagInput({ sourceId: source.id, value: '' })}
              className="inline-flex items-center gap-0.5 text-xs pl-1.5 pr-2 py-0.5 rounded-full font-medium transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--notebook-accent-surface)] hover:border-[var(--notebook-accent)] hover:text-[var(--notebook-accent)]"
              style={{ color: 'var(--text-dimmed)', border: '1px dashed var(--border-base)' }}
              title="Ajouter un mot-clé"
            >
              <Plus className="w-3 h-3" />
              tag
            </button>
          )}
        </div>
      </div>

      {/* Actions — le bouton actif (aperçu ouvert) reste visible même sans hover */}
      <div className={`flex flex-col gap-1 transition-opacity self-start focus-within:opacity-100 group-hover:opacity-100 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
        <motion.button
          {...tapScale}
          type="button"
          onClick={() => onTogglePreview(source.id)}
          aria-pressed={isExpanded}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--notebook-accent-surface)]"
          style={isExpanded ? { backgroundColor: 'var(--notebook-accent-surface)' } : undefined}
          title={isExpanded ? 'Masquer le contenu' : 'Voir le contenu'}
          aria-label={isExpanded ? 'Masquer le contenu' : 'Voir le contenu'}
        >
          <Eye className="w-3.5 h-3.5" style={{ color: isExpanded ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
        </motion.button>
        <motion.button
          {...tapScale}
          type="button"
          onClick={() => onReindex(source.id)}
          disabled={isReindexing}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--notebook-accent-surface)] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Re-indexer la source"
          aria-label="Re-indexer la source"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} style={{ color: 'var(--accent-primary)' }} />
        </motion.button>
        <motion.button
          {...tapScale}
          type="button"
          onClick={() => onDelete(source.id)}
          className="p-1.5 rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)]"
          title="Supprimer"
          aria-label={`Supprimer ${source.title}`}
        >
          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
        </motion.button>
      </div>
    </>
  );
}

/** Styles communs à l'enveloppe d'une carte (animée ou statique). */
function cardWrapperStyle(isSelected: boolean): React.CSSProperties {
  return {
    backgroundColor: 'var(--notebook-card-bg)',
    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--notebook-border)',
    boxShadow: isSelected ? '0 0 0 1px var(--accent-primary)' : 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  };
}

const hoverEnter = (isSelected: boolean) => (e: React.MouseEvent<HTMLElement>) => {
  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-accent)';
};
const hoverLeave = (isSelected: boolean) => (e: React.MouseEvent<HTMLElement>) => {
  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-border)';
};

/** Rangée virtualisée (react-window) : enveloppe statique + SourceCard. */
type RowData = SourceCardSharedProps & {
  filteredSources: SourceItem[];
  selectedSources: string[];
};

function VirtualRow({ index, style, filteredSources, selectedSources, ...shared }: RowComponentProps<RowData>) {
  const source = filteredSources[index];
  const isSelected = selectedSources.includes(source.id);
  return (
    // L'espacement inter-cartes est en padding-bottom sur l'élément mesuré par
    // react-window (et non en margin sur l'enfant) pour que la hauteur dynamique
    // inclue bien le gap.
    <div style={style} className="pb-3">
      <div
        className="group p-3 rounded-xl border flex gap-2"
        style={cardWrapperStyle(isSelected)}
        onMouseEnter={hoverEnter(isSelected)}
        onMouseLeave={hoverLeave(isSelected)}
      >
        <SourceCard
          source={source}
          isSelected={isSelected}
          selectedCount={selectedSources.length}
          {...shared}
        />
      </div>
    </div>
  );
}

export function SourceListFull({
  sources,
  filteredSources,
  searchQuery,
  dragOver,
  selectedSources,
  expandedSource,
  loadingPreview,
  sourcePreview,
  reindexingId,
  tagInput,
  prefersReducedMotion,
  spring,
  tapScale,
  onToggleSelect,
  onTogglePreview,
  onReindex,
  onDelete,
  onRemoveTag,
  onAddTag,
  setTagInput,
}: Props) {
  // Cache de hauteurs dynamiques pour la virtualisation (hauteurs de carte
  // variables selon mots-clés / aperçu étendu). Hook toujours appelé (règles
  // des hooks) même si la virtualisation n'est pas active.
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: ESTIMATED_ROW_HEIGHT });

  // État + callbacks communs à chaque carte (voir SourceCardSharedProps).
  const shared: SourceCardSharedProps = {
    expandedSource, loadingPreview, sourcePreview, reindexingId, tagInput, tapScale,
    onToggleSelect, onTogglePreview, onReindex, onDelete, onRemoveTag, onAddTag, setTagInput,
  };

  if (sources.length === 0) {
    return (
      <div
        className="notebook-empty-state rounded-2xl border-2 border-dashed transition-colors"
        style={{ borderColor: dragOver ? 'var(--notebook-accent)' : 'var(--notebook-border)', padding: '48px 24px' }}
      >
        <div className="notebook-empty-state-icon" style={{ width: 56, height: 56 }}>
          <Sparkles className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Ajoutez vos premières sources
        </p>
        <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Glissez-déposez des fichiers, ou utilisez les boutons ci-dessus pour importer.
        </p>
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {['PDF', 'URL', 'Texte', 'DOCX', 'Markdown'].map(t => (
            <span key={t} className="notebook-chip" style={{ fontSize: '11px', padding: '4px 10px' }}>{t}</span>
          ))}
        </div>
      </div>
    );
  }

  // ── Chemin virtualisé : grandes listes (fenêtrage, sans animation layout) ──
  if (filteredSources.length > VIRTUALIZE_THRESHOLD) {
    return (
      <div className="space-y-3">
        <List
          rowComponent={VirtualRow}
          rowCount={filteredSources.length}
          rowHeight={rowHeight}
          rowProps={{ filteredSources, selectedSources, ...shared }}
          style={{ height: 'min(70vh, 720px)' }}
          overscanCount={4}
        />
      </div>
    );
  }

  // ── Chemin animé : cas courant, comportement d'origine à l'identique ──────
  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {filteredSources.map((source) => {
          const isSelected = selectedSources.includes(source.id);
          return (
            <motion.div
              key={source.id}
              layout={!prefersReducedMotion}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={spring}
              className="group p-3 rounded-xl border flex gap-2"
              style={cardWrapperStyle(isSelected)}
              onMouseEnter={hoverEnter(isSelected)}
              onMouseLeave={hoverLeave(isSelected)}
            >
              <SourceCard
                source={source}
                isSelected={isSelected}
                selectedCount={selectedSources.length}
                {...shared}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {searchQuery && filteredSources.length === 0 && (
        <div className="flex flex-col items-center gap-2.5 py-12 text-center">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full"
            style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)' }}
          >
            <Search className="h-4 w-4" style={{ color: 'var(--text-dimmed)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Aucun résultat
          </p>
          <p className="text-xs max-w-xs" style={{ color: 'var(--text-dimmed)' }}>
            Aucune source ne correspond à « {searchQuery} ».
          </p>
        </div>
      )}
    </div>
  );
}

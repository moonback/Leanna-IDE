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
import { clsx } from 'clsx';
import { TYPE_ICONS, TYPE_COLORS, type SourceItem } from './constants.js';
import { NbBadge, NbEmptyState, NbIconButton } from '../ui/primitives.js';

// Bouton icône des notebooks, animable (whileTap) comme les anciens motion.button.
const MotionIconButton = motion.create(NbIconButton);

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
        className={clsx(
          'mt-0.5 flex-shrink-0 self-start rounded transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--notebook-accent)]',
          isSelected || selectedCount > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
      >
        {isSelected ? (
          <CheckSquare className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
        ) : (
          <Square className="h-4 w-4 text-[var(--text-dimmed)]" aria-hidden />
        )}
      </button>

      {/* Type icon with color indicator */}
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 12%, transparent)` }}
      >
        <span className="text-sm leading-none">{TYPE_ICONS[source.type] || '📎'}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
            {source.title}
          </p>
          <span
            className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide"
            style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 14%, transparent)`, color: typeColor }}
          >
            {source.type}
          </span>
        </div>

        <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-[var(--text-muted)]">
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
                className="custom-scrollbar mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--notebook-border)] bg-[var(--notebook-surface-muted)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]"
              >
                {loadingPreview ? (
                  <div className="flex items-center gap-2 text-[var(--text-dimmed)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
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
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-dimmed)]">
          <span className="font-medium">{source.wordCount.toLocaleString()} mots</span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span>{source.chunksCount} chunks</span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span className="font-medium uppercase tracking-wide">{source.language}</span>
        </div>

        {/* Keywords + Tags — toujours rendu (ajout d'un 1er tag possible). */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {source.keywords.slice(0, 6).map((kw: string) => (
            <span
              key={kw}
              className="group/tag inline-flex items-center gap-1 rounded-full border border-[var(--notebook-border)] bg-[var(--notebook-surface-muted)] py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors"
            >
              {kw}
              <button
                type="button"
                onClick={() => onRemoveTag(source.id, kw)}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[var(--text-dimmed)] transition-colors hover:bg-[var(--notebook-accent-surface)] hover:text-[var(--notebook-accent)]"
                title="Retirer ce mot-clé"
                aria-label={`Retirer le mot-clé ${kw}`}
              >
                <X className="h-2.5 w-2.5" aria-hidden />
              </button>
            </span>
          ))}
          {source.keywords.length > 6 && (
            <span className="rounded-full px-2 py-0.5 text-xs text-[var(--text-dimmed)]">
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
                className="w-20 rounded-full border border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] px-2.5 py-0.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dimmed)]"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setTagInput({ sourceId: source.id, value: '' })}
              className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[var(--notebook-border)] py-0.5 pl-1.5 pr-2 text-xs font-medium text-[var(--text-dimmed)] opacity-0 transition-colors hover:border-[var(--notebook-accent)] hover:bg-[var(--notebook-accent-surface)] hover:text-[var(--notebook-accent)] focus-visible:opacity-100 group-hover:opacity-100"
              title="Ajouter un mot-clé"
            >
              <Plus className="h-3 w-3" aria-hidden />
              tag
            </button>
          )}
        </div>
      </div>

      {/* Actions — le bouton actif (aperçu ouvert) reste visible même sans hover */}
      <div className={clsx('flex flex-col gap-1 self-start transition-opacity focus-within:opacity-100 group-hover:opacity-100', isExpanded ? 'opacity-100' : 'opacity-0')}>
        <MotionIconButton
          {...tapScale}
          icon={Eye}
          size="sm"
          label={isExpanded ? 'Masquer le contenu' : 'Voir le contenu'}
          active={isExpanded}
          onClick={() => onTogglePreview(source.id)}
        />
        <MotionIconButton
          {...tapScale}
          icon={RefreshCw}
          size="sm"
          label="Re-indexer la source"
          onClick={() => onReindex(source.id)}
          disabled={isReindexing}
          className={clsx(isReindexing && '[&_svg]:animate-spin')}
        />
        <MotionIconButton
          {...tapScale}
          icon={Trash2}
          size="sm"
          tone="danger"
          label={`Supprimer ${source.title}`}
          title="Supprimer"
          onClick={() => onDelete(source.id)}
        />
      </div>
    </>
  );
}

/** Classes communes à l'enveloppe d'une carte (animée ou statique). */
function cardWrapperClass(isSelected: boolean): string {
  return clsx(
    'notebook-card group flex gap-2 p-3',
    isSelected && '!border-[var(--notebook-accent)] shadow-[0_0_0_1px_var(--notebook-accent)]',
  );
}

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
      <div className={cardWrapperClass(isSelected)} data-interactive="true">
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
      <NbEmptyState
        icon={Sparkles}
        title="Ajoutez vos premières sources"
        description="Glissez-déposez des fichiers, ou utilisez les boutons ci-dessus pour importer."
        className={clsx(
          'rounded-2xl border-2 border-dashed transition-colors',
          dragOver ? 'border-[var(--notebook-accent)]' : 'border-[var(--notebook-border)]',
        )}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {['PDF', 'URL', 'Texte', 'DOCX', 'Markdown'].map(t => (
              <NbBadge key={t}>{t}</NbBadge>
            ))}
          </div>
        }
      />
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
              className={cardWrapperClass(isSelected)}
              data-interactive="true"
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
        <NbEmptyState
          icon={Search}
          title="Aucun résultat"
          description={<>Aucune source ne correspond à « {searchQuery} ».</>}
        />
      )}
    </div>
  );
}

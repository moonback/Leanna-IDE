/**
 * DocTypePicker — barre de configuration (sources / prompt), dropdowns associés,
 * bouton « Rapport complet » (ouvre le modal) et grille des types de documents.
 * Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { Filter, PenLine, FileBarChart, ArrowRight, Loader2, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SpringTransition } from '../motionTypes.js';
import { NbButton, NbTextarea, NbSectionLabel, NbBadge } from '../ui/primitives.js';
import { DOC_TYPES } from './constants.js';
import type { SourceItem } from './types.js';

interface Props {
  sources: SourceItem[];
  showSourceFilter: boolean;
  setShowSourceFilter: (v: boolean) => void;
  showCustomPrompt: boolean;
  setShowCustomPrompt: (v: boolean) => void;
  selectedSourceIds: string[];
  setSelectedSourceIds: (ids: string[]) => void;
  toggleSourceSelection: (sourceId: string) => void;
  customInstructions: string;
  setCustomInstructions: (v: string) => void;
  activeGenerationIds: Set<string>;
  generationQueue: { id: string; type: string }[];
  onOpenReportModal: () => void;
  onGenerate: (type: string) => void;
  onOpenInfographic: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reportModalTriggerRef: React.RefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  infographicModalTriggerRef: React.RefObject<any>;
  reduceMotion: boolean | null;
  modalSpring: SpringTransition;
}

export function DocTypePicker({
  sources,
  showSourceFilter,
  setShowSourceFilter,
  showCustomPrompt,
  setShowCustomPrompt,
  selectedSourceIds,
  setSelectedSourceIds,
  toggleSourceSelection,
  customInstructions,
  setCustomInstructions,
  activeGenerationIds,
  generationQueue,
  onOpenReportModal,
  onGenerate,
  onOpenInfographic,
  reportModalTriggerRef,
  infographicModalTriggerRef,
  reduceMotion,
  modalSpring,
}: Props) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [typeSearch, setTypeSearch] = useState('');
  const sourceFilterOn = showSourceFilter || selectedSourceIds.length > 0;
  const promptOn = showCustomPrompt || !!customInstructions.trim();

  const categories = [
    { key: 'all', label: 'Tout', description: 'Tous les formats disponibles' },
    { key: 'understand', label: 'Comprendre', description: 'Synthétiser et clarifier les sources' },
    { key: 'learn', label: 'Apprendre', description: 'Mémoriser et réviser les notions' },
    { key: 'analyze', label: 'Analyser', description: 'Évaluer, comparer et illustrer' },
    { key: 'organize', label: 'Organiser', description: 'Structurer les idées et les actions' },
  ] as const;

  const categoryByType: Record<string, string> = {
    summary: 'understand',
    faq: 'understand',
    glossary: 'understand',
    'study-guide': 'learn',
    swot: 'analyze',
    infographic: 'analyze',
    'full-report': 'analyze',
    briefing: 'organize',
    timeline: 'organize',
    outline: 'organize',
    mindmap: 'organize',
    roadmap: 'organize',
  };

  const visibleTypes = useMemo(() => DOC_TYPES.filter((type) => {
    const matchesCategory = activeCategory === 'all' || categoryByType[type.key] === activeCategory;
    const query = typeSearch.trim().toLocaleLowerCase('fr');
    const matchesSearch = !query || `${type.label} ${type.desc}`.toLocaleLowerCase('fr').includes(query);
    return type.key !== 'full-report' && matchesCategory && matchesSearch;
  }), [activeCategory, typeSearch]);
  return (
    <>
      {/* Quick config bar — chips à gauche, compteur de sources à droite */}
      <div className="notebook-gen-configbar">
        <div className="flex items-center gap-2">
          {sources.length > 1 && (
            <button
              type="button"
              onClick={() => setShowSourceFilter(!showSourceFilter)}
              className={clsx(
                'notebook-chip text-xs',
                sourceFilterOn && 'border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]',
              )}
            >
              <Filter className="h-3 w-3" aria-hidden />
              {selectedSourceIds.length > 0 ? `${selectedSourceIds.length} src` : 'Sources'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCustomPrompt(!showCustomPrompt)}
            className={clsx(
              'notebook-chip text-xs',
              promptOn && 'border-[var(--color-warning)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
            )}
          >
            <PenLine className="h-3 w-3" aria-hidden />
            Prompt
            {customInstructions.trim() && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />}
          </button>
        </div>

        <span className="notebook-gen-configbar-count">
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Source filter dropdown */}
      <AnimatePresence>
        {showSourceFilter && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={modalSpring}
            className="overflow-hidden"
          >
            <div className="notebook-card space-y-1 rounded-xl p-2">
              {sources.map(src => (
                <label
                  key={src.id}
                  htmlFor={`doctype-src-${src.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--notebook-surface-muted)]"
                >
                  <input
                    id={`doctype-src-${src.id}`}
                    type="checkbox"
                    checked={selectedSourceIds.length === 0 || selectedSourceIds.includes(src.id)}
                    onChange={() => toggleSourceSelection(src.id)}
                    className="h-3 w-3 rounded accent-[var(--notebook-accent)]"
                  />
                  <span className="truncate text-xs text-[var(--text-primary)]">{src.title}</span>
                </label>
              ))}
              {selectedSourceIds.length > 0 && (
                <NbButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSourceIds([])}
                  className="w-full justify-start text-[var(--notebook-accent)]"
                >
                  Réinitialiser (toutes)
                </NbButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom instructions dropdown */}
      <AnimatePresence>
        {showCustomPrompt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={modalSpring}
            className="overflow-hidden"
          >
            <NbTextarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="Ex: Ton formel, focus technique, ajoute des exemples..."
              rows={2}
              className="text-xs"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Catalogue organisé par intention : recherche + filtres de catégories. */}
      <section className="space-y-3" aria-labelledby="notebook-generation-title">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <NbSectionLabel>Studio de création</NbSectionLabel>
            <p id="notebook-generation-title" className="mt-1 text-xs text-[var(--text-muted)]">
              Choisissez ce que vous souhaitez produire à partir de vos sources.
            </p>
          </div>
          {activeGenerationIds.size > 0 && (
            <NbBadge tone="accent" icon={Loader2} className="flex-shrink-0 [&>svg]:animate-spin">
              {activeGenerationIds.size > 1 ? `${activeGenerationIds.size} en cours...` : 'En cours...'}
            </NbBadge>
          )}
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-card-bg)] px-3 py-2.5 focus-within:border-[var(--notebook-accent)]">
          <Search className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" aria-hidden />
          <input
            type="search"
            value={typeSearch}
            onChange={(event) => setTypeSearch(event.target.value)}
            placeholder="Rechercher un format..."
            aria-label="Rechercher un format de génération"
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dimmed)]"
          />
          {typeSearch && (
            <button type="button" onClick={() => setTypeSearch('')} aria-label="Effacer la recherche" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </label>

        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filtrer les formats par catégorie">
          {categories.map((category) => (
            <button
              key={category.key}
              type="button"
              aria-pressed={activeCategory === category.key}
              title={category.description}
              onClick={() => setActiveCategory(category.key)}
              className={clsx(
                'flex-shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                activeCategory === category.key
                  ? 'border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]'
                  : 'border-[var(--notebook-border)] text-[var(--text-secondary)] hover:border-[var(--notebook-accent)] hover:text-[var(--text-primary)]',
              )}
            >
              {category.label}
            </button>
          ))}
        </div>

        {(activeCategory === 'all' || activeCategory === 'analyze') && (!typeSearch || 'rapports rapport complet'.includes(typeSearch.toLocaleLowerCase('fr'))) && (
          <button
            ref={reportModalTriggerRef}
            type="button"
            onClick={onOpenReportModal}
            disabled={sources.length === 0}
            className="notebook-studio-card notebook-gen-card group w-full active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
            title="Choisir un type de rapport • Suggestions IA incluses"
          >
            <span className="notebook-gen-card-icon" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)' }}>
              <FileBarChart className="h-4 w-4" style={{ color: 'var(--color-error)' }} aria-hidden />
            </span>
            <span className="notebook-gen-card-label">
              <span className="notebook-gen-card-text">Rapports spécialisés</span>
              <span className="notebook-gen-card-badge">12 modèles</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </button>
        )}

        {visibleTypes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {visibleTypes.map(({ key, label, icon: Icon, desc, color, badge }) => {
              const isActive = [...activeGenerationIds].some(taskId => {
                const task = generationQueue.find(t => t.id === taskId);
                return task && task.type === key;
              });
              return (
                <motion.button
                  key={key}
                  type="button"
                  ref={key === 'infographic' ? infographicModalTriggerRef : undefined}
                  onClick={() => key === 'infographic' ? onOpenInfographic() : onGenerate(key)}
                  disabled={sources.length === 0}
                  whileTap={sources.length > 0 && !reduceMotion ? { scale: 0.98 } : {}}
                  className="notebook-studio-card notebook-gen-card group relative min-h-[92px] items-start disabled:pointer-events-none disabled:opacity-40"
                  style={isActive ? { borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 6%, var(--notebook-card-bg))` } : undefined}
                  title={desc}
                  aria-label={`${label} : ${desc}`}
                >
                  <span className="notebook-gen-card-icon" style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}>
                    {isActive ? <Loader2 className="h-4 w-4 animate-spin" style={{ color }} aria-hidden /> : <Icon className="h-4 w-4" style={{ color }} aria-hidden />}
                  </span>
                  <span className="notebook-gen-card-label min-w-0 flex-1">
                    <span className="notebook-gen-card-text">{label}</span>
                    <span className="mt-1 line-clamp-2 text-[10px] font-normal leading-snug text-[var(--text-muted)]">{desc}</span>
                    {badge && <span className="notebook-gen-card-badge">{badge}</span>}
                  </span>
                  {isActive && (
                    <motion.div layoutId="activeGenType" className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-60" style={{ border: `1.5px solid ${color}` }} />
                  )}
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--notebook-border)] px-4 py-7 text-center">
            <Search className="mx-auto h-5 w-5 text-[var(--text-muted)]" aria-hidden />
            <p className="mt-2 text-xs font-medium text-[var(--text-primary)]">Aucun format trouvé</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Essayez un autre terme ou une autre catégorie.</p>
            <button type="button" onClick={() => { setTypeSearch(''); setActiveCategory('all'); }} className="mt-3 text-xs font-medium text-[var(--notebook-accent)] hover:underline">
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </section>

      {/* Source count info */}
      {sources.length === 0 && (
        <p className="rounded-lg bg-[var(--notebook-surface-muted)] px-3 py-2 text-center text-xs text-[var(--text-dimmed)]">
          Ajoutez des sources pour activer la génération
        </p>
      )}
    </>
  );
}

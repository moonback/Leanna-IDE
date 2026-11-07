/**
 * AudioGenerator — colonne gauche de l'Audio Overview : carte de génération
 * (durée, options avancées, sources, instructions), bouton générer, et liste
 * des podcasts déjà produits.
 *
 * Composant présentationnel : l'état de configuration et les actions réseau
 * sont détenus par le parent (AudioOverviewPanel) et passés en props.
 */

import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  Mic, Play, Clock, Radio, Settings2, CheckSquare, Trash2,
} from 'lucide-react';
import { NbButton, NbIconButton, NbBadge, NbSectionLabel, NbTextarea } from '../ui/primitives.js';
import type { AudioOverview, AudioSource, Tone } from './types.js';

interface Props {
  fullView: boolean;
  sources: AudioSource[];
  overviews: AudioOverview[];
  selectedOverview: AudioOverview | null;

  // Configuration de génération (détenue par le parent)
  duration: 'short' | 'medium' | 'long';
  setDuration: (d: 'short' | 'medium' | 'long') => void;
  showOptions: boolean;
  setShowOptions: (v: boolean) => void;
  tone: Tone;
  setTone: (t: Tone) => void;
  selectedSourceIds: string[];
  toggleSource: (sourceId: string) => void;
  selectAllSources: () => void;
  deselectAllSources: () => void;
  customInstructions: string;
  setCustomInstructions: (v: string) => void;
  hostName: string;
  setHostName: (v: string) => void;
  coHostName: string;
  setCoHostName: (v: string) => void;
  coHostPersonality: string;
  setCoHostPersonality: (v: string) => void;

  generating: boolean;
  onGenerate: () => void;
  onSelectOverview: (ov: AudioOverview) => void;
  onDelete: (overviewId: string) => void;
  formatDuration: (seconds: number) => string;
}

/** Option sélectionnable (durée, ton). */
function optionClass(selected: boolean, shape: string) {
  return clsx(
    'border text-xs font-medium transition-colors',
    shape,
    selected
      ? 'border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]'
      : 'border-[var(--notebook-border)] bg-[var(--notebook-canvas)] text-[var(--text-muted)] hover:bg-[var(--notebook-surface-muted)] hover:text-[var(--text-primary)]',
  );
}

export function AudioGenerator({
  fullView,
  sources,
  overviews,
  selectedOverview,
  duration,
  setDuration,
  showOptions,
  setShowOptions,
  tone,
  setTone,
  selectedSourceIds,
  toggleSource,
  selectAllSources,
  deselectAllSources,
  customInstructions,
  setCustomInstructions,
  hostName,
  setHostName,
  coHostName,
  setCoHostName,
  coHostPersonality,
  setCoHostPersonality,
  generating,
  onGenerate,
  onSelectOverview,
  onDelete,
  formatDuration,
}: Props) {
  return (
    <div
      className={clsx(
        fullView ? 'w-full flex-shrink-0 border-b border-[var(--notebook-border)] lg:w-80 lg:border-b-0 lg:border-r' : 'flex-1',
        'custom-scrollbar space-y-5 overflow-y-auto bg-[var(--notebook-studio-bg)] p-4',
      )}
    >
      {/* Generator card */}
      <div className="notebook-card space-y-4 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="notebook-empty-state-icon !mb-0 !h-9 !w-9">
            <Mic className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Audio Overview
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Podcast IA conversationnel
            </p>
          </div>
        </div>

        {/* Duration selector */}
        <div className="space-y-2">
          <NbSectionLabel>Durée cible</NbSectionLabel>
          <div className="flex gap-2">
            {([
              { key: 'short' as const, label: '~5 min', icon: '⚡' },
              { key: 'medium' as const, label: '~10 min', icon: '📻' },
              { key: 'long' as const, label: '~15 min', icon: '🎙️' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDuration(opt.key)}
                className={optionClass(duration === opt.key, 'flex flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2')}
              >
                <span className="text-sm">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Options toggle */}
        <NbButton
          variant="ghost"
          size="sm"
          icon={Settings2}
          onClick={() => setShowOptions(!showOptions)}
          data-active={showOptions ? 'true' : undefined}
          aria-expanded={showOptions}
          className="w-full justify-start"
        >
          Options avancées
        </NbButton>

        {/* Advanced options */}
        <AnimatePresence>
          {showOptions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {/* Tone selector */}
              <div className="space-y-2">
                <NbSectionLabel>Ton</NbSectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'casual' as Tone, label: '😊 Décontracté' },
                    { key: 'academic' as Tone, label: '🎓 Académique' },
                    { key: 'humorous' as Tone, label: '😄 Humoristique' },
                    { key: 'professional' as Tone, label: '💼 Professionnel' },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setTone(opt.key)}
                      className={optionClass(tone === opt.key, 'rounded-full px-2 py-1')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source selector */}
              {sources.length > 1 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <NbSectionLabel>
                      Sources ({selectedSourceIds.length}/{sources.length})
                    </NbSectionLabel>
                    <NbButton
                      variant="ghost"
                      size="sm"
                      onClick={selectedSourceIds.length === sources.length ? deselectAllSources : selectAllSources}
                      className="text-[var(--notebook-accent)]"
                    >
                      {selectedSourceIds.length === sources.length ? 'Aucune' : 'Toutes'}
                    </NbButton>
                  </div>
                  <div className="custom-scrollbar max-h-28 space-y-1 overflow-y-auto">
                    {sources.map(src => {
                      const checked = selectedSourceIds.includes(src.id);
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => toggleSource(src.id)}
                          className={clsx(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors',
                            checked
                              ? 'bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]'
                              : 'text-[var(--text-muted)] hover:bg-[var(--notebook-surface-muted)]',
                          )}
                        >
                          <CheckSquare
                            className={clsx('h-3 w-3 flex-shrink-0', !checked && 'opacity-30')}
                            aria-hidden
                          />
                          <span className="truncate">{src.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Personnalités du podcast */}
              <div className="space-y-2 rounded-lg border border-[var(--notebook-border)] p-3">
                <NbSectionLabel>Personnalités du podcast</NbSectionLabel>
                <label className="block space-y-1 text-xs text-[var(--text-muted)]">
                  <span>Présentatrice principale</span>
                  <input value={hostName} onChange={e => setHostName(e.target.value)} maxLength={32} className="w-full rounded-lg border border-[var(--notebook-border)] bg-[var(--notebook-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]" />
                </label>
                <label className="block space-y-1 text-xs text-[var(--text-muted)]">
                  <span>Seconde personnalité</span>
                  <input value={coHostName} onChange={e => setCoHostName(e.target.value)} maxLength={32} className="w-full rounded-lg border border-[var(--notebook-border)] bg-[var(--notebook-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]" />
                </label>
                <label className="block space-y-1 text-xs text-[var(--text-muted)]">
                  <span>Personnalité et rôle du co-animateur</span>
                  <NbTextarea value={coHostPersonality} onChange={e => setCoHostPersonality(e.target.value)} rows={3} maxLength={600} placeholder="Ex. contradicteur bienveillant, expert technique, journaliste curieux..." className="text-xs leading-relaxed" />
                </label>
              </div>

              {/* Custom instructions */}
              <div className="space-y-2">
                <NbSectionLabel>
                  Instructions personnalisées
                </NbSectionLabel>
                <NbTextarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Ex: Insiste sur les aspects pratiques, ajoute des exemples concrets..."
                  className="text-xs leading-relaxed"
                  rows={2}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <NbButton
          variant="primary"
          icon={Radio}
          loading={generating}
          onClick={onGenerate}
          disabled={selectedSourceIds.length === 0}
          className="w-full"
        >
          {generating ? 'Script + piste audio en cours...' : 'Générer le podcast'}
        </NbButton>
      </div>

      {/* Previous overviews */}
      {overviews.length > 0 && (
        <div className="space-y-2">
          <NbSectionLabel>
            Podcasts ({overviews.length})
          </NbSectionLabel>
          <AnimatePresence initial={false}>
            {overviews.map(ov => {
              const isSelected = selectedOverview?.id === ov.id;
              return (
              <motion.div
                key={ov.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative"
              >
                <button
                  type="button"
                  data-interactive="true"
                  onClick={() => onSelectOverview(ov)}
                  aria-label={`Sélectionner l'aperçu audio : ${ov.title}`}
                  className={clsx(
                    'notebook-card w-full rounded-xl p-3 text-left',
                    isSelected && '!border-[var(--notebook-accent)] ring-1 ring-[var(--notebook-accent)]',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)]">
                      <Play className="h-3.5 w-3.5 text-[var(--notebook-accent)]" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate pr-6 text-sm font-semibold text-[var(--text-primary)]">
                        {ov.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-[var(--text-dimmed)]">
                          <Clock className="h-2.5 w-2.5" aria-hidden />
                          {formatDuration(ov.estimatedDuration)}
                        </span>
                        <NbBadge tone={ov.status === 'ready' ? 'success' : ov.status === 'error' ? 'error' : 'warning'}>
                          {ov.status === 'ready' ? '● Prêt' : ov.status === 'error' ? '● Erreur' : '● En cours'}
                        </NbBadge>
                      </div>
                    </div>
                  </div>
                </button>
                <NbIconButton
                  icon={Trash2}
                  label="Supprimer"
                  size="sm"
                  tone="danger"
                  onClick={(e) => { e.stopPropagation(); onDelete(ov.id); }}
                  className="absolute right-2 top-2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                />
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

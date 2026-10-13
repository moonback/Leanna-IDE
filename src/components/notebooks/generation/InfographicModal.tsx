/**
 * InfographicModal — modal de configuration d'infographie (orientation, langue,
 * style visuel, niveau de détail, description). Composant présentationnel ;
 * l'état de configuration infra* est détenu par le parent.
 *
 * Posée sur NbModal (ui/Modal) : focus piégé, Échap, clic voile et
 * restitution du focus sont gérés par la primitive.
 */

import { clsx } from 'clsx';
import { Lightbulb, Smartphone, Monitor, Square } from 'lucide-react';
import { NbModal, NbButton, NbTextarea, NbSectionLabel } from '../ui/primitives.js';

interface Props {
  show: boolean;
  sources: { id: string }[];
  selectedSourceIds: string[];
  infraOrientation: 'portrait' | 'landscape' | 'square';
  setInfraOrientation: (v: 'portrait' | 'landscape' | 'square') => void;
  infraStyle: string;
  setInfraStyle: (v: string) => void;
  infraDetail: 'low' | 'medium' | 'high';
  setInfraDetail: (v: 'low' | 'medium' | 'high') => void;
  infraLang: string;
  setInfraLang: (v: string) => void;
  infraDescription: string;
  setInfraDescription: (v: string) => void;
  onClose: () => void;
  onGenerate: () => void;
}

/** Option sélectionnable (orientation, langue, style, détail). */
function optionClass(selected: boolean, shape: string) {
  return clsx(
    'border text-xs font-medium transition-colors',
    shape,
    selected
      ? 'border-[var(--color-warning)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)]'
      : 'border-[var(--notebook-border)] bg-[var(--notebook-canvas)] text-[var(--text-muted)] hover:bg-[var(--notebook-surface-muted)] hover:text-[var(--text-primary)]',
  );
}

export function InfographicModal({
  show, sources, selectedSourceIds,
  infraOrientation, setInfraOrientation,
  infraStyle, setInfraStyle,
  infraDetail, setInfraDetail,
  infraLang, setInfraLang,
  infraDescription, setInfraDescription,
  onClose, onGenerate,
}: Props) {
  return (
    <NbModal open={show} onClose={onClose} size="md">
      {/* Header */}
      <NbModal.Header>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-warning-subtle)]">
          <Lightbulb className="h-4 w-4 text-[var(--color-warning)]" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Créer une infographie</h3>
          <p className="text-xs text-[var(--text-dimmed)]">Générée par IA à partir de vos sources</p>
        </div>
      </NbModal.Header>

      {/* Body */}
      <NbModal.Body className="space-y-5 px-6 py-5">
        {/* Orientation */}
        <div className="space-y-3">
          <NbSectionLabel>Choisissez une orientation</NbSectionLabel>
          <div className="flex gap-2">
            {([
              { key: 'portrait' as const, label: 'Portrait', icon: Smartphone },
              { key: 'landscape' as const, label: 'Paysage', icon: Monitor },
              { key: 'square' as const, label: 'Carré', icon: Square },
            ]).map(opt => {
              const OIcon = opt.icon;
              return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setInfraOrientation(opt.key)}
                className={optionClass(infraOrientation === opt.key, 'flex flex-1 flex-col items-center gap-1 rounded-xl px-3 py-3')}
              >
                <span className="inline-flex items-center"><OIcon size={18} aria-hidden /></span>
                {opt.label}
              </button>
              );
            })}
          </div>
        </div>

        {/* Langue */}
        <div className="space-y-3">
          <NbSectionLabel>Langue</NbSectionLabel>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'fr', label: 'Français', flag: '🇫🇷' },
              { key: 'en', label: 'English', flag: '🇬🇧' },
              { key: 'es', label: 'Español', flag: '🇪🇸' },
              { key: 'de', label: 'Deutsch', flag: '🇩🇪' },
              { key: 'ar', label: 'العربية', flag: '🇸🇦' },
              { key: 'pt', label: 'Português', flag: '🇧🇷' },
              { key: 'it', label: 'Italiano', flag: '🇮🇹' },
              { key: 'zh', label: '中文', flag: '🇨🇳' },
              { key: 'ja', label: '日本語', flag: '🇯🇵' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setInfraLang(opt.key)}
                className={optionClass(infraLang === opt.key, 'flex items-center gap-1 rounded-full px-3 py-1')}
              >
                <span>{opt.flag}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style visuel */}
        <div className="space-y-3">
          <NbSectionLabel>Choisissez un style visuel</NbSectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'auto', label: 'Sélection auto', emoji: '✨' },
              { key: 'kawaii', label: 'Kawaii', emoji: '🌸' },
              { key: 'clay', label: 'Pâte à modeler', emoji: '🎨' },
              { key: 'sketch', label: 'Croquis', emoji: '✏️' },
              { key: 'anime', label: 'Anime', emoji: '🎌' },
              { key: 'editorial', label: 'Éditorial', emoji: '📰' },
              { key: 'educational', label: 'Éducatif', emoji: '📚' },
              { key: 'bento', label: 'Grille Bento', emoji: '🍱' },
              { key: 'bricks', label: 'Briques', emoji: '🧱' },
              { key: 'scientific', label: 'Scientifique', emoji: '🔬' },
              { key: 'professional', label: 'Professionnel', emoji: '💼' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setInfraStyle(opt.key)}
                className={optionClass(infraStyle === opt.key, 'flex items-center gap-2 rounded-lg px-3 py-2')}
              >
                <span>{opt.emoji}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Niveau de détail */}
        <div className="space-y-3">
          <NbSectionLabel>Niveau de détail</NbSectionLabel>
          <div className="flex gap-2">
            {([
              { key: 'low' as const, label: 'Minimal', desc: '3-4 éléments' },
              { key: 'medium' as const, label: 'Modéré', desc: '5-7 sections' },
              { key: 'high' as const, label: 'Dense', desc: 'Très détaillé' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setInfraDetail(opt.key)}
                className={optionClass(infraDetail === opt.key, 'flex flex-1 flex-col items-center gap-0.5 rounded-xl px-3 py-2')}
              >
                <span className="font-semibold">{opt.label}</span>
                <span className="text-xs opacity-60">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sources */}
        {sources.length > 1 && (
          <div className="space-y-1">
            <NbSectionLabel>
              Sources ({selectedSourceIds.length || sources.length}/{sources.length})
            </NbSectionLabel>
            <p className="text-xs text-[var(--text-dimmed)]">
              {selectedSourceIds.length === 0 ? 'Toutes les sources seront utilisées' : `${selectedSourceIds.length} source(s) sélectionnée(s)`}
            </p>
          </div>
        )}

        {/* Description personnalisée */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text-muted)]">
            Décrivez l'infographie que vous souhaitez créer
          </p>
          <NbTextarea
            value={infraDescription}
            onChange={(e) => setInfraDescription(e.target.value)}
            placeholder="Ex: Une infographie sur les tendances du marché avec des statistiques clés, un comparatif visuel des acteurs principaux..."
            className="text-xs leading-relaxed"
            rows={3}
          />
        </div>
      </NbModal.Body>

      {/* Footer */}
      <NbModal.Footer align="between" className="px-6">
        <NbButton variant="ghost" onClick={onClose}>
          Annuler
        </NbButton>
        <NbButton variant="primary" icon={Lightbulb} onClick={onGenerate}>
          Générer l'infographie
        </NbButton>
      </NbModal.Footer>
    </NbModal>
  );
}

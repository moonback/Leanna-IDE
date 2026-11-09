/**
 * CustomReportModal — modal « Rapport vierge » : l'utilisateur décrit textuellement
 * le rapport souhaité (sujet, sections, ton…). Le détail saisi pilote entièrement
 * la génération (type `custom-report`, détail passé en instructions). Composant
 * présentationnel ; l'état `detail` est détenu par le parent.
 *
 * Posée sur NbModal (ui/Modal) : focus piégé, Échap, clic voile et
 * restitution du focus sont gérés par la primitive.
 */

import { FilePlus2 } from 'lucide-react';
import { NbModal, NbButton, NbTextarea, NbSectionLabel } from '../ui/primitives.js';

interface Props {
  show: boolean;
  sources: { id: string }[];
  selectedSourceIds: string[];
  detail: string;
  setDetail: (v: string) => void;
  onClose: () => void;
  onGenerate: () => void;
}

export function CustomReportModal({
  show, sources, selectedSourceIds, detail, setDetail, onClose, onGenerate,
}: Props) {
  const canGenerate = sources.length > 0 && detail.trim().length > 0;

  return (
    <NbModal open={show} onClose={onClose} size="md">
      {/* Header */}
      <NbModal.Header>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--notebook-accent)_25%,transparent)] bg-[var(--notebook-accent-surface)]">
          <FilePlus2 className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Rapport vierge</h3>
          <p className="text-xs text-[var(--text-dimmed)]">Décrivez le rapport à générer — structure et contenu libres</p>
        </div>
      </NbModal.Header>

      {/* Body */}
      <NbModal.Body className="space-y-4 px-6 py-5">
        <div className="space-y-2">
          <NbSectionLabel>Détail du rapport</NbSectionLabel>
          <NbTextarea
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Ex : Un rapport en 4 parties sur l'état du marché — contexte, acteurs clés, tendances 2026 et recommandations. Ton formel, inclure un tableau comparatif."
            className="text-xs leading-relaxed"
            rows={6}
          />
          <p className="text-[11px] text-[var(--text-dimmed)]">
            Indiquez le sujet, les sections souhaitées, le ton et tout élément à inclure.
            La structure du rapport suivra votre description.
          </p>
        </div>

        {sources.length > 1 && (
          <p className="rounded-lg bg-[var(--notebook-surface-muted)] px-3 py-2 text-[11px] text-[var(--text-dimmed)]">
            {selectedSourceIds.length === 0
              ? `Toutes les sources (${sources.length}) seront utilisées`
              : `${selectedSourceIds.length}/${sources.length} source(s) sélectionnée(s)`}
          </p>
        )}
      </NbModal.Body>

      {/* Footer */}
      <NbModal.Footer align="between" className="px-6">
        <NbButton variant="ghost" onClick={onClose}>
          Annuler
        </NbButton>
        <NbButton variant="primary" icon={FilePlus2} onClick={onGenerate} disabled={!canGenerate}>
          Générer le rapport
        </NbButton>
      </NbModal.Footer>
    </NbModal>
  );
}

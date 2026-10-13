/**
 * FolderPickerModal — modale « Enregistrer en Markdown » : choix du dossier de
 * destination dans la sandbox (liste ou chemin personnalisé). Présentationnel.
 */

import { clsx } from 'clsx';
import { FileDown, FolderOpen, Folder, Check } from 'lucide-react';
import { NbButton, NbInput, NbModal } from '../ui/primitives.js';
import type { ChatMessage, SandboxFolder } from './types.js';

interface Props {
  folderPickerMsg: ChatMessage | null;
  sandboxFolders: SandboxFolder[];
  selectedFolder: string;
  setSelectedFolder: (v: string) => void;
  customFolderName: string;
  setCustomFolderName: (v: string) => void;
  savingMd: boolean;
  /** Conservé pour compatibilité : NbModal gère déjà prefers-reduced-motion. */
  prefersReducedMotion: boolean | null;
  onClose: () => void;
  onSave: () => void;
}

export function FolderPickerModal({
  folderPickerMsg, sandboxFolders, selectedFolder, setSelectedFolder,
  customFolderName, setCustomFolderName, savingMd, onClose, onSave,
}: Props) {
  return (
    <NbModal open={!!folderPickerMsg} onClose={onClose} size="md">
      <NbModal.Header>
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-[var(--notebook-accent-surface)] p-2">
            <FileDown className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Enregistrer en Markdown
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Choisir le dossier de destination dans la sandbox
            </p>
          </div>
        </div>
      </NbModal.Header>

      <NbModal.Body noPadding>
        {/* Folder list */}
        <div className="custom-scrollbar max-h-56 overflow-y-auto px-4 py-3">
          {sandboxFolders.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--text-dimmed)]">
              Chargement des dossiers…
            </p>
          ) : (
            <div className="space-y-1">
              {sandboxFolders.map(f => {
                const isSelected = selectedFolder === f.path && !customFolderName;
                return (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => { setSelectedFolder(f.path); setCustomFolderName(''); }}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm text-[var(--text-primary)] transition-colors',
                      isSelected
                        ? 'bg-[var(--notebook-accent-surface)] ring-1 ring-[var(--notebook-accent)]'
                        : 'hover:bg-[var(--notebook-surface-muted)]',
                    )}
                    // Indentation selon la profondeur (valeur dynamique)
                    style={{ paddingLeft: `${12 + f.depth * 16}px` }}
                  >
                    {isSelected
                      ? <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-[var(--notebook-accent)]" />
                      : <Folder className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dimmed)]" />
                    }
                    <span className="truncate">{f.name || '/ (racine sandbox)'}</span>
                    {isSelected && (
                      <Check className="ml-auto h-3 w-3 flex-shrink-0 text-[var(--notebook-accent)]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom folder input */}
        <div className="px-4 pb-3">
          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
            Ou saisir un chemin personnalisé
          </p>
          <NbInput
            type="text"
            value={customFolderName}
            onChange={e => { setCustomFolderName(e.target.value); setSelectedFolder(''); }}
            placeholder="ex: docs/notes"
          />
        </div>

        {/* Destination preview */}
        {(selectedFolder !== '' || customFolderName.trim()) && (
          <div className="mx-4 mb-3 rounded-lg bg-[var(--notebook-accent-surface)] px-3 py-2 text-xs text-[var(--notebook-accent)]">
            <span className="font-medium">Destination : </span>
            <span className="font-mono">
              {customFolderName.trim() || selectedFolder || '/'}/
            </span>
          </div>
        )}
      </NbModal.Body>

      <NbModal.Footer>
        <NbButton variant="secondary" onClick={onClose}>
          Annuler
        </NbButton>
        <NbButton
          variant="primary"
          icon={FileDown}
          loading={savingMd}
          onClick={onSave}
          disabled={selectedFolder === '' && !customFolderName.trim()}
        >
          {savingMd ? 'Enregistrement…' : 'Enregistrer'}
        </NbButton>
      </NbModal.Footer>
    </NbModal>
  );
}

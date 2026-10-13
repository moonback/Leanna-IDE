/**
 * CreateNotebookModal — Modal pour créer un nouveau notebook
 *
 * Posée sur NbModal (focus piégé, Échap, clic voile, portail) et habillée
 * avec les primitives notebooks.
 */

import { useState, useCallback, useId } from 'react';
import { Plus } from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { api } from './api/client.js';
import { errorMessage } from './utils.js';
import { NbButton, NbInput, NbModal } from './ui/primitives.js';

interface CreateNotebookModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateNotebookModal({ onClose, onCreated }: CreateNotebookModalProps) {
  const { success, error: toastError } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const titleInputId = useId();
  const descriptionInputId = useId();

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const data = await api<{ notebook: { title: string } }>('/api/notebooks', {
        method: 'POST',
        json: { title: title.trim(), description: description.trim() },
      });
      success(`Notebook "${data.notebook.title}" créé`);
      setTitle('');
      setDescription('');
      onCreated();
      onClose();
    } catch (e: unknown) {
      toastError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }, [title, description, success, toastError, onClose, onCreated]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleCreate();
  }, [handleCreate]);

  return (
    <NbModal open onClose={onClose} title="Créer un notebook" size="md">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <NbModal.Body className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Recherche IA avec citations sur vos documents
          </p>

          <div>
            <label htmlFor={titleInputId} className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Titre
            </label>
            <NbInput
              id={titleInputId}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nom du notebook"
              autoFocus
              className="font-medium"
            />
          </div>

          <div>
            <label htmlFor={descriptionInputId} className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Description (optionnel)
            </label>
            <NbInput
              id={descriptionInputId}
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ajoutez une description (optionnel)"
            />
          </div>
        </NbModal.Body>

        <NbModal.Footer>
          <NbButton variant="ghost" onClick={onClose}>
            Annuler
          </NbButton>
          <NbButton
            type="submit"
            variant="primary"
            icon={Plus}
            loading={creating}
            disabled={!title.trim()}
          >
            Créer
          </NbButton>
        </NbModal.Footer>
      </form>
    </NbModal>
  );
}

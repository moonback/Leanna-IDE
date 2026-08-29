/**
 * NotebooksView — Vue principale des Notebooks (concurrent NotebookLM)
 *
 * Navigation entre :
 *   - Liste des notebooks (page d'accueil)
 *   - Détail d'un notebook (sources, chat, notes, génération)
 *
 * Utilise le hash URL (#notebook=<id>) pour persister l'état de navigation
 * et supporter le bouton retour du navigateur.
 */

import { useState, useCallback, useEffect } from 'react';
import { NotebookList } from '../components/notebooks/NotebookList';
import { NotebookDetail } from '../components/notebooks/NotebookDetail';

function getNotebookIdFromHash(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/notebook=([^&]+)/);
  return match ? match[1] : null;
}

export default function NotebooksView({ onClose }: { onClose?: () => void }) {
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(getNotebookIdFromHash);

  // Sync hash → state (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      setSelectedNotebookId(getNotebookIdFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSelect = useCallback((id: string) => {
    window.location.hash = `notebook=${id}`;
    setSelectedNotebookId(id);
  }, []);

  const handleBack = useCallback(() => {
    // Remove hash to go back to list
    history.pushState(null, '', window.location.pathname + window.location.search);
    setSelectedNotebookId(null);
  }, []);

  if (selectedNotebookId) {
    return <NotebookDetail notebookId={selectedNotebookId} onBack={handleBack} />;
  }

  return <NotebookList onSelectNotebook={handleSelect} onClose={onClose} />;
}

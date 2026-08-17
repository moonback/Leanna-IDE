/**
 * NotebooksView — Vue principale des Notebooks (concurrent NotebookLM)
 *
 * Navigation entre :
 *   - Liste des notebooks (page d'accueil)
 *   - Détail d'un notebook (sources, chat, notes, génération)
 */

import { useState, useCallback } from 'react';
import { NotebookList } from '../components/notebooks/NotebookList';
import { NotebookDetail } from '../components/notebooks/NotebookDetail';

export default function NotebooksView() {
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);

  const handleBack = useCallback(() => setSelectedNotebookId(null), []);

  if (selectedNotebookId) {
    return <NotebookDetail notebookId={selectedNotebookId} onBack={handleBack} />;
  }

  return <NotebookList onSelectNotebook={setSelectedNotebookId} />;
}

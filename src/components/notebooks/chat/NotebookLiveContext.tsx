/**
 * NotebookLiveContext — maintient la session vocale « Interroger vos sources »
 * vivante tant que l'on reste dans le notebook.
 *
 * Problème résolu : `useNotebookLive` vivait dans `NotebookVoicePanel`, lui-même
 * monté dans `NotebookChat`. Or `NotebookChat` est démonté dès que l'utilisateur
 * ouvre un document généré, une source, une note, ou l'onglet Sources — ce qui
 * fermait la session WebSocket et coupait le vocal.
 *
 * Solution : instancier `useNotebookLive` UNE SEULE FOIS dans ce provider, monté
 * au niveau de `NotebookDetail` (qui reste monté tant qu'on est dans le
 * notebook). Les composants enfants (bouton `NotebookVoicePanel`) consomment la
 * session via ce contexte au lieu d'instancier le hook eux-mêmes.
 *
 * Les sources interrogées et les callbacks (toast / document généré) varient
 * selon la vue (chat) ; ils sont injectés dynamiquement via `setVoiceConfig`
 * sans recréer la session.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNotebookLive } from './useNotebookLive.js';

type NotebookLive = ReturnType<typeof useNotebookLive>;

interface GeneratedDocInfo {
  taskId?: string;
  id: string;
  type: string;
  title: string;
}

export interface NotebookVoiceConfig {
  selectedSources?: string[];
  onError?: (message: string) => void;
  onInfo?: (message: string) => void;
  onDocumentGenerated?: (doc: GeneratedDocInfo) => void;
}

interface NotebookLiveContextValue {
  live: NotebookLive;
  /** Met à jour les sources interrogées + callbacks sans recréer la session. */
  setVoiceConfig: (config: NotebookVoiceConfig) => void;
}

const NotebookLiveContext = createContext<NotebookLiveContextValue | null>(null);

export function NotebookLiveProvider({
  notebookId,
  children,
}: {
  notebookId: string;
  children: ReactNode;
}) {
  // Sources + callbacks courants, pilotés par la vue active (chat) via refs pour
  // éviter de recréer la session à chaque changement.
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const onErrorRef = useRef<NotebookVoiceConfig['onError']>(undefined);
  const onInfoRef = useRef<NotebookVoiceConfig['onInfo']>(undefined);
  const onDocGeneratedRef = useRef<NotebookVoiceConfig['onDocumentGenerated']>(undefined);

  const live = useNotebookLive({
    notebookId,
    selectedSources,
    onError: (message) => onErrorRef.current?.(message),
    onDocumentGenerating: (info) => {
      onInfoRef.current?.(`Génération du document (${info.type})…`);
      window.dispatchEvent(new CustomEvent('notebook-voice-generation-start', {
        detail: { notebookId, taskId: info.taskId, type: info.type },
      }));
    },
    onDocumentGenerated: (doc) => {
      onInfoRef.current?.(`Document généré : ${doc.title}`);
      window.dispatchEvent(new CustomEvent('notebook-voice-generation-done', {
        detail: { notebookId, taskId: doc.taskId, type: doc.type, title: doc.title },
      }));
      onDocGeneratedRef.current?.(doc);
    },
    onDocumentGenerationError: (info) => {
      window.dispatchEvent(new CustomEvent('notebook-voice-generation-done', {
        detail: { notebookId, taskId: info.taskId, type: info.type, error: info.error },
      }));
    },
  });

  const setVoiceConfig = useCallback((config: NotebookVoiceConfig) => {
    if (config.onError !== undefined) onErrorRef.current = config.onError;
    if (config.onInfo !== undefined) onInfoRef.current = config.onInfo;
    if (config.onDocumentGenerated !== undefined) onDocGeneratedRef.current = config.onDocumentGenerated;
    if (config.selectedSources !== undefined) {
      setSelectedSources(prev => {
        const next = config.selectedSources ?? [];
        // Évite un re-render inutile si la sélection est inchangée.
        if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
        return next;
      });
    }
  }, []);

  const value = useMemo(() => ({ live, setVoiceConfig }), [live, setVoiceConfig]);

  return (
    <NotebookLiveContext.Provider value={value}>
      {children}
    </NotebookLiveContext.Provider>
  );
}

/** Accès à la session vocale partagée. Retourne null hors d'un provider. */
export function useNotebookLiveContext(): NotebookLiveContextValue | null {
  return useContext(NotebookLiveContext);
}

/**
 * Pont de configuration : composant sans rendu monté par la vue chat pour
 * pousser au provider les sources filtrées + callbacks courants. Permet de
 * garder le bouton vocal dans le header (via le provider) tout en laissant la
 * vue chat piloter ce que la voix interroge. No-op hors d'un provider.
 */
export function NotebookVoiceConfigBridge(config: NotebookVoiceConfig): null {
  const ctx = useContext(NotebookLiveContext);
  const { selectedSources, onError, onInfo, onDocumentGenerated } = config;
  const setVoiceConfig = ctx?.setVoiceConfig;
  // Sérialise la sélection pour une dépendance stable.
  const sourcesKey = (selectedSources ?? []).join(',');
  useEffect(() => {
    if (!setVoiceConfig) return;
    setVoiceConfig({ selectedSources, onError, onInfo, onDocumentGenerated });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setVoiceConfig, sourcesKey, onError, onInfo, onDocumentGenerated]);
  return null;
}

/**
 * useChatThreads — gestion des fils de discussion du chat.
 * Détient la liste des threads (ordre de création, comme des onglets), le
 * résumé de la conversation principale, et expose les actions
 * nouveau/changer/supprimer.
 *
 * Reçoit les setters du stream (messages, streaming, follow-ups) car changer ou
 * supprimer un thread réinitialise la conversation affichée.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, apiVoid } from '../api/client.js';
import type { ChatThread } from '../api/types.js';
import type { ChatMessage, ChatThreadSummary } from './types.js';

interface UseChatThreadsOptions {
  notebookId: string;
  activeThreadId: string | null;
  setActiveThreadId: (v: string | null) => void;
  /** Nombre de messages du fil affiché : évite de recréer un fil vide */
  activeMessageCount: number;
  /** Un flux est en cours : changer de fil mélangerait la réponse avec un autre fil */
  loading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setMessages: (v: ChatMessage[]) => void;
  setStreamingText: (v: string) => void;
  setFollowUps: (v: string[]) => void;
}

type MainSummary = Pick<ChatThreadSummary, 'messageCount' | 'preview'>;

export function useChatThreads({
  notebookId, activeThreadId, setActiveThreadId, activeMessageCount, loading, inputRef,
  setMessages, setStreamingText, setFollowUps,
}: UseChatThreadsOptions) {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [mainSummary, setMainSummary] = useState<MainSummary>({});
  const [showThreadList, setShowThreadList] = useState(false);

  // Charger la liste des threads (une seule fois)
  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ threads?: ChatThread[]; main?: MainSummary }>(
          `/api/notebooks/${notebookId}/chat/threads`,
        );
        setThreads(data.threads || []);
        setMainSummary(data.main || {});
      } catch { /* ignore */ }
    })();
  }, [notebookId]);

  const resetView = useCallback(() => {
    setFollowUps([]);
    setStreamingText('');
  }, [setFollowUps, setStreamingText]);

  const handleNewThread = useCallback(async () => {
    setShowThreadList(false);
    if (loading) return;
    // Le fil actif est déjà vierge : on le réutilise au lieu d'empiler des onglets vides.
    if (activeThreadId !== null && activeMessageCount === 0) {
      inputRef.current?.focus();
      return;
    }
    try {
      const data = await api<{ thread: ChatThread }>(
        `/api/notebooks/${notebookId}/chat/threads`,
        { method: 'POST', json: { title: 'Nouvelle conversation' } },
      );
      setThreads(prev => [...prev, data.thread]);
      setActiveThreadId(data.thread.id);
      setMessages([]);
      resetView();
      inputRef.current?.focus();
    } catch { /* ignore */ }
  }, [notebookId, loading, activeThreadId, activeMessageCount, inputRef, setActiveThreadId, setMessages, resetView]);

  const handleSwitchThread = useCallback((threadId: string | null) => {
    setShowThreadList(false);
    if (threadId === activeThreadId || loading) return;
    setActiveThreadId(threadId);
    resetView();
  }, [activeThreadId, loading, setActiveThreadId, resetView]);

  const handleDeleteThread = useCallback(async (threadId: string) => {
    if (loading && threadId === activeThreadId) return;
    const thread = threads.find(t => t.id === threadId);
    const label = thread?.preview || thread?.title || 'cette conversation';
    if (!window.confirm(`Supprimer définitivement « ${label} » ?`)) return;
    try {
      await apiVoid(`/api/notebooks/${notebookId}/chat/threads/${threadId}`, { method: 'DELETE' });
      const idx = threads.findIndex(t => t.id === threadId);
      const remaining = threads.filter(t => t.id !== threadId);
      setThreads(remaining);
      if (activeThreadId === threadId) {
        // Active l'onglet voisin (celui de gauche, sinon la conversation principale).
        const next = remaining[Math.max(0, idx - 1)] ?? null;
        setActiveThreadId(next?.id ?? null);
        if (!next) setMessages([]);
        resetView();
      }
    } catch { /* ignore */ }
  }, [notebookId, loading, activeThreadId, threads, setActiveThreadId, setMessages, resetView]);

  return {
    threads, mainSummary,
    showThreadList, setShowThreadList,
    handleNewThread,
    handleSwitchThread,
    handleDeleteThread,
  };
}

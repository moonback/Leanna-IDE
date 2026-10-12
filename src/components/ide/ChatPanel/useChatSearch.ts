import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TranscriptEntry } from '../../../hooks/useLiveAPI.js';

export interface UseChatSearchOptions {
  transcript: TranscriptEntry[];
  reduceMotion: boolean;
  /** Conteneur dans lequel chercher les éléments [data-message-id]. */
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Recherche plein-texte dans le fil de discussion : filtre les messages,
 * suit la correspondance courante, navigue (suivant/précédent) et fait
 * défiler jusqu'à l'élément ciblé. L'ouverture/fermeture est également gérée.
 */
export function useChatSearch({ transcript, reduceMotion, containerRef }: UseChatSearchOptions) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const matchedEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as TranscriptEntry[];
    return transcript.filter(e => e.text.toLowerCase().includes(q));
  }, [query, transcript]);

  const matchedIds = useMemo(() => new Set(matchedEntries.map(e => e.id)), [matchedEntries]);
  const currentMatchId = matchedEntries[cursor]?.id;

  // Recentre le curseur quand la requête change.
  useEffect(() => { setCursor(0); }, [query]);

  // Fait défiler jusqu'à la correspondance courante.
  useEffect(() => {
    if (!currentMatchId) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-message-id="${currentMatchId}"]`);
    el?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [currentMatchId, reduceMotion, containerRef]);

  const next = useCallback(() => {
    setCursor(c => (matchedEntries.length === 0 ? 0 : (c + 1) % matchedEntries.length));
  }, [matchedEntries.length]);

  const prev = useCallback(() => {
    setCursor(c => (matchedEntries.length === 0 ? 0 : (c - 1 + matchedEntries.length) % matchedEntries.length));
  }, [matchedEntries.length]);

  const open = useCallback(() => setShowSearch(true), []);

  const close = useCallback(() => {
    setShowSearch(false);
    setQuery('');
    setCursor(0);
  }, []);

  const toggle = useCallback(() => {
    setShowSearch(s => {
      if (s) { setQuery(''); setCursor(0); }
      return !s;
    });
  }, []);

  return {
    showSearch,
    query,
    setQuery,
    matchedEntries,
    matchedIds,
    currentMatchId,
    currentMatchNumber: matchedEntries.length > 0 ? cursor + 1 : 0,
    next,
    prev,
    open,
    close,
    toggle,
  };
}

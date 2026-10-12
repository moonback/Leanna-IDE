import { useCallback, useState } from 'react';
import { STORAGE_KEYS } from './theme.js';
import { readJSON, writeJSON } from './utils.js';

/**
 * Gère l'ensemble des identifiants de messages épinglés par l'utilisateur,
 * persisté dans localStorage. Les épingles survivent au rechargement.
 */
export function usePinnedMessages() {
  const [pinned, setPinned] = useState<Set<string>>(
    () => new Set(readJSON<string[]>(STORAGE_KEYS.pinned, [])),
  );

  const persist = useCallback((next: Set<string>) => {
    writeJSON(STORAGE_KEYS.pinned, [...next]);
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(next);
      return next;
    });
  }, [persist]);

  const isPinned = useCallback((id: string) => pinned.has(id), [pinned]);

  const clearPins = useCallback(() => {
    setPinned(new Set());
    persist(new Set());
  }, [persist]);

  return { pinned, togglePin, isPinned, clearPins };
}

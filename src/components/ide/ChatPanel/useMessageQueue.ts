import { useCallback, useEffect, useRef, useState } from 'react';
import type { PendingChatMessage } from './types.js';

/**
 * File d'attente des messages envoyés pendant que l'assistant est occupé.
 * Les messages sont dépilés automatiquement (avec un léger délai) dès que
 * l'assistant redevient disponible et que la connexion est active.
 */
export function useMessageQueue(
  isBusy: boolean,
  connected: boolean,
  sendTextMessage: (text: string, displayText?: string) => void,
) {
  const [queue, setQueue] = useState<PendingChatMessage[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isBusy && queue.length > 0 && connected) {
      timerRef.current = setTimeout(() => {
        const [next, ...rest] = queue;
        sendTextMessage(next.text, next.displayText);
        setQueue(rest);
        timerRef.current = null;
      }, 300);
    }
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [isBusy, queue, connected, sendTextMessage]);

  const enqueue = useCallback((message: PendingChatMessage) => {
    setQueue(prev => [...prev, message]);
  }, []);

  const dequeue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  return { queue, enqueue, dequeue };
}

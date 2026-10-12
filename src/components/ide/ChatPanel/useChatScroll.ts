import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface UseChatScrollOptions {
  reduceMotion: boolean;
  /** Nombre de messages — relance l'auto-scroll quand il change. */
  messageCount: number;
  /** Longueur du dernier message (streaming) — relance l'auto-scroll. */
  lastEntryText?: string;
  /** Id du dernier message. */
  lastEntryId?: string;
  /** Dépendances additionnelles qui doivent déclencher un auto-scroll. */
  extraDeps?: unknown[];
}

/**
 * Encapsule la logique de défilement du fil de discussion :
 * - auto-scroll vers le bas tant que l'utilisateur est près du bas,
 * - détection du défilement manuel (désactive l'auto-scroll),
 * - bouton « aller en bas » quand on remonte,
 * - observation du redimensionnement du contenu (streaming / images).
 */
export function useChatScroll({
  reduceMotion,
  messageCount,
  lastEntryText,
  lastEntryId,
  extraDeps = [],
}: UseChatScrollOptions) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const container = messagesRef.current;
    if (!container) return;
    isProgrammaticScrollRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    const target = container.scrollHeight - container.clientHeight;
    if (target < 0) { isProgrammaticScrollRef.current = false; return; }
    if (smooth && !reduceMotion) {
      container.scrollTo({ top: target, behavior: 'smooth' });
      scrollTimeoutRef.current = setTimeout(() => { isProgrammaticScrollRef.current = false; }, 350);
    } else {
      container.scrollTop = target;
      requestAnimationFrame(() => { isProgrammaticScrollRef.current = false; });
    }
    shouldAutoScrollRef.current = true;
    setShowScrollBtn(false);
  }, [reduceMotion]);

  useEffect(() => () => { if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); }, []);

  const handleMessagesScroll = useCallback(() => {
    const c = messagesRef.current;
    if (!c || isProgrammaticScrollRef.current) return;
    const dist = c.scrollHeight - c.scrollTop - c.clientHeight;
    shouldAutoScrollRef.current = dist <= 80;
    setShowScrollBtn(dist > 80 && messageCount > 1);
  }, [messageCount]);

  // Auto-scroll à chaque mise à jour du fil, si on est déjà près du bas.
  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom(false);
      const raf = requestAnimationFrame(() => {
        if (shouldAutoScrollRef.current) scrollToBottom(false);
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, lastEntryId, lastEntryText, scrollToBottom, ...extraDeps]);

  // Observe le redimensionnement du contenu (streaming, images chargées).
  useEffect(() => {
    const inner = messagesInnerRef.current;
    if (!inner) return;
    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (shouldAutoScrollRef.current) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (shouldAutoScrollRef.current) scrollToBottom(false);
        });
      }
    });
    observer.observe(inner);
    return () => { observer.disconnect(); if (rafId) cancelAnimationFrame(rafId); };
  }, [scrollToBottom]);

  const forceAutoScroll = useCallback(() => { shouldAutoScrollRef.current = true; }, []);

  return {
    messagesRef,
    messagesInnerRef,
    showScrollBtn,
    scrollToBottom,
    handleMessagesScroll,
    forceAutoScroll,
  };
}

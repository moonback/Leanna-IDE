import { useCallback, useRef, useState } from 'react';
import { MIN_WIDTH, MAX_WIDTH } from './theme.js';

interface ResizeSession {
  pointerId: number;
  startClientX: number;
  startWidth: number;
}

/**
 * Gère le redimensionnement horizontal d'un panneau ancré au bord droit.
 * La largeur est bornée entre MIN_WIDTH et MAX_WIDTH ; `onWidthChange` est
 * appelé au relâchement pour persister la valeur.
 */
export function useResizablePanel(
  disabled: boolean,
  initialWidth: number,
  onWidthChange: (w: number) => void,
) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeSession = useRef<ResizeSession | null>(null);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeSession.current = { pointerId: e.pointerId, startClientX: e.clientX, startWidth: width };
    setIsResizing(true);
  }, [disabled, width]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    const s = resizeSession.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = s.startClientX - e.clientX;
    setWidth(Math.min(Math.max(s.startWidth + dx, MIN_WIDTH), MAX_WIDTH));
  }, []);

  const handleResizeEnd = useCallback((e: React.PointerEvent) => {
    const s = resizeSession.current;
    if (!s || e.pointerId !== s.pointerId) return;
    setIsResizing(false);
    resizeSession.current = null;
    onWidthChange(width);
  }, [width, onWidthChange]);

  return {
    width, isResizing, setWidth,
    resizeHandlers: {
      onPointerDown: handleResizeStart,
      onPointerMove: handleResizeMove,
      onPointerUp: handleResizeEnd,
      onPointerCancel: handleResizeEnd,
    },
  };
}

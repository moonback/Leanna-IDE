import { useCallback, useRef, useState } from 'react';
import { useMotionValue, animate } from 'motion/react';
import { DRAG_HYSTERESIS, EDGE_MARGIN } from './theme.js';

// ─── Rubber-band helpers ──────────────────────────────────────────────────────

function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function clampWithRubberband(value: number, min: number, max: number, dimension: number): number {
  if (value < min) return min + rubberband(value - min, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
}

interface DragSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  anchorRect: DOMRect;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * Rend un panneau flottant déplaçable au pointeur avec effet élastique
 * (rubber-band) aux bords et recentrage spring au relâchement.
 */
export function useDraggablePanel(
  panelRef: React.RefObject<HTMLDivElement | null>,
  disabled: boolean,
  reduceMotion: boolean,
) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const session = useRef<DragSession | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const panel = panelRef.current;
    if (!panel) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    session.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      anchorRect: panel.getBoundingClientRect(),
      startX: mx.get(),
      startY: my.get(),
      moved: false,
    };
  }, [disabled, panelRef, mx, my]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startClientX;
    const dy = e.clientY - s.startClientY;
    if (!s.moved) {
      if (Math.hypot(dx, dy) < DRAG_HYSTERESIS) return;
      s.moved = true;
      setIsDragging(true);
    }
    const minLeft = EDGE_MARGIN;
    const maxLeft = window.innerWidth - EDGE_MARGIN - s.anchorRect.width;
    const minTop = EDGE_MARGIN;
    const maxTop = window.innerHeight - EDGE_MARGIN - s.anchorRect.height;
    const cl = clampWithRubberband(s.anchorRect.left + dx, minLeft, maxLeft, window.innerWidth);
    const ct = clampWithRubberband(s.anchorRect.top + dy, minTop, maxTop, window.innerHeight);
    mx.set(s.startX + (cl - s.anchorRect.left));
    my.set(s.startY + (ct - s.anchorRect.top));
  }, [mx, my]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    setIsDragging(false);
    const minLeft = EDGE_MARGIN;
    const maxLeft = window.innerWidth - EDGE_MARGIN - s.anchorRect.width;
    const minTop = EDGE_MARGIN;
    const maxTop = window.innerHeight - EDGE_MARGIN - s.anchorRect.height;
    const curLeft = s.anchorRect.left + (mx.get() - s.startX);
    const curTop = s.anchorRect.top + (my.get() - s.startY);
    const tl = Math.min(Math.max(curLeft, minLeft), maxLeft);
    const tt = Math.min(Math.max(curTop, minTop), maxTop);
    if (tl !== curLeft) {
      animate(mx, mx.get() + (tl - curLeft), reduceMotion
        ? { duration: 0.15, ease: 'easeOut' }
        : { type: 'spring', bounce: 0.15, duration: 0.4, velocity: mx.getVelocity() });
    }
    if (tt !== curTop) {
      animate(my, my.get() + (tt - curTop), reduceMotion
        ? { duration: 0.15, ease: 'easeOut' }
        : { type: 'spring', bounce: 0.15, duration: 0.4, velocity: my.getVelocity() });
    }
    session.current = null;
  }, [mx, my, reduceMotion]);

  const resetPosition = useCallback(() => { mx.set(0); my.set(0); }, [mx, my]);

  return {
    mx, my, isDragging, resetPosition,
    dragHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}

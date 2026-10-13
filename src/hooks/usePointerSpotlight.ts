/**
 * usePointerSpotlight — un seul listener délégué (passif, throttlé par rAF)
 * qui pose --mx / --my sur la carte survolée. Le halo est dessiné en CSS
 * (styles/motion-pro.css §5) pour :
 *   .card-interactive · .notebook-studio-card · .notebook-note-card · [data-spotlight]
 *
 * Pour activer l'effet sur n'importe quel élément : ajouter `data-spotlight`.
 * Désactivé en prefers-reduced-motion et sur les écrans tactiles.
 */
import { useEffect } from 'react';

const SELECTOR = '.card-interactive, .notebook-studio-card, .notebook-note-card, [data-spotlight]';

export function usePointerSpotlight() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia?.('(pointer: fine)');
    if (reduce?.matches || finePointer?.matches === false) return;

    let frame = 0;
    let lastEvent: PointerEvent | null = null;
    let current: HTMLElement | null = null;

    const apply = () => {
      frame = 0;
      const e = lastEvent;
      if (!e) return;
      const target = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (current && current !== target) {
        current.style.removeProperty('--mx');
        current.style.removeProperty('--my');
      }
      current = target;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      target.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };

    const onMove = (e: PointerEvent) => {
      lastEvent = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
      if (current) {
        current.style.removeProperty('--mx');
        current.style.removeProperty('--my');
      }
    };
  }, []);
}

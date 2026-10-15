/**
 * useSceneVisibility — la scène ne doit rendre que si quelqu'un la voit
 * (plan §3.3, règle 3) : fenêtre visible ET au premier plan, mode Focus
 * désactivé. Sinon la boucle de rendu est arrêtée (0 frame WebGL).
 */
import { useEffect, useState } from 'react';

export function computeSceneActive(p: { hidden: boolean; focused: boolean; focusMode: boolean }): boolean {
  return !p.hidden && p.focused && !p.focusMode;
}

export function useSceneVisibility(focusMode: boolean): boolean {
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');
  const [focused, setFocused] = useState(() => (typeof document.hasFocus === 'function' ? document.hasFocus() : true));

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return computeSceneActive({ hidden, focused, focusMode });
}

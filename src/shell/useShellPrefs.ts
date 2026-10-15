/**
 * useShellPrefs — préférences d'affichage du shell v3, persistées par
 * contexte : le rail droit est ouvert par défaut sur les vues globales et
 * fermé dans l'IDE (où RightDock occupe déjà la colonne droite).
 */
import { useCallback, useState } from 'react';

const KEY = 'Leanna_shell_v3_prefs';

type RailContext = 'ide' | 'global';
interface ShellPrefs { rightRail: Record<RailContext, boolean> }

const DEFAULTS: ShellPrefs = { rightRail: { ide: false, global: true } };

function load(): ShellPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<ShellPrefs>;
    return {
      rightRail: {
        ide: typeof p.rightRail?.ide === 'boolean' ? p.rightRail.ide : DEFAULTS.rightRail.ide,
        global: typeof p.rightRail?.global === 'boolean' ? p.rightRail.global : DEFAULTS.rightRail.global,
      },
    };
  } catch {
    return DEFAULTS;
  }
}

export function useRightRailOpen(context: RailContext): [boolean, (open: boolean) => void] {
  const [prefs, setPrefs] = useState<ShellPrefs>(load);
  const setOpen = useCallback((open: boolean) => {
    setPrefs(prev => {
      const next = { ...prev, rightRail: { ...prev.rightRail, [context]: open } };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
      return next;
    });
  }, [context]);
  return [prefs.rightRail[context], setOpen];
}

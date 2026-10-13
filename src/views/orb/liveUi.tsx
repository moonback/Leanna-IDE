import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/** Petits utilitaires partagés par la vue live (/orb-live). */

export function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}


export function HeaderButton({ onClick, active, title, badge, children }: {
  onClick: () => void; active?: boolean; title: string; badge?: number; children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} aria-pressed={active}
      className="relative flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-all hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        backgroundColor: active ? 'var(--accent-subtle)' : undefined,
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)' : 'transparent'}`,
      }}>
      {children}
      {!!badge && badge > 0 && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', boxShadow: '0 0 0 2px var(--bg-sidebar)' }}>
          {badge}
        </motion.span>
      )}
    </button>
  );
}

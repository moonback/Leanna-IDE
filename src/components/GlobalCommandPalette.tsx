/**
 * GlobalCommandPalette — Ctrl/⌘+K disponible sur TOUTES les pages.
 *
 * Constat d'audit : la CommandPalette existante n'est montée que dans IdeView.
 * Sur Pilotage, Notebooks, Documents, Mémoire… il n'y avait aucun accès rapide
 * clavier. Ce composant lit la navigation depuis config/navigation.ts (source
 * unique) : ajouter une page à NAV_ITEMS l'ajoute ici automatiquement.
 *
 * Montage (src/main.tsx → Layout, à côté de <MissionCreatedPrompt />) :
 *   <GlobalCommandPalette />
 * Il se désactive tout seul sur /ide (l'IDE garde sa palette riche).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CornerDownLeft, Home, Search, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NAV_GROUPS, ROUTES } from '../config/navigation.js';

interface PaletteItem {
  id: string;
  label: string;
  group: string;
  path: string;
  icon: LucideIcon;
  /** Mots-clés de recherche supplémentaires (sans accents). */
  keywords: string;
}

/** Synonymes pour retrouver une page par son intention, pas seulement son nom. */
const KEYWORDS: Record<string, string> = {
  ide: 'code editeur terminal fichiers projet developpement',
  notebooks: 'notes sources rag recherche cahier',
  documents: 'knowledge fichiers pdf base connaissance',
  github: 'git depot repository commit pull request',
  automation: 'workflow taches planifiees cron automatisation',
  memories: 'memoire souvenirs contexte',
  history: 'historique conversations passe',
  lists: 'snippets code bibliotheque extraits',
  observability: 'metriques budget sante runtime tokens cout logs',
  settings: 'parametres preferences apparence theme cles api profil',
  home: 'accueil demarrage dashboard',
};

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Score : préfixe > mot > inclusion > sous-séquence. 0 = pas de match. */
function score(query: string, item: PaletteItem): number {
  if (!query) return 1;
  const q = norm(query.trim());
  const label = norm(item.label);
  if (label.startsWith(q)) return 100;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 80;
  if (label.includes(q)) return 60;
  if (norm(item.keywords).includes(q)) return 40;
  let i = 0;
  for (const ch of label) if (ch === q[i]) i++;
  return i === q.length ? 20 : 0;
}

function buildItems(): PaletteItem[] {
  const items: PaletteItem[] = [
    { id: 'home', label: 'Accueil', group: 'Navigation', path: ROUTES.home, icon: Home, keywords: KEYWORDS.home },
  ];
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      items.push({
        id: it.id, label: it.label, group: g.label || 'Navigation', path: it.path, icon: it.icon,
        keywords: KEYWORDS[it.id] ?? '',
      });
    }
  }
  items.push({
    id: 'settings', label: 'Paramètres', group: 'Système', path: `${ROUTES.ide}?page=settings`,
    icon: Settings, keywords: KEYWORDS.settings,
  });
  return items;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function GlobalCommandPalette() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const onIde = pathname === ROUTES.ide;
  const allItems = useMemo(buildItems, []);

  const results = useMemo(
    () => allItems
      .map((item) => ({ item, s: score(query, item) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.item),
    [allItems, query],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    returnFocusRef.current?.focus?.();
  }, []);

  const run = useCallback((item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    navigate(item.path);
  }, [close, navigate]);

  // Raccourci global
  useEffect(() => {
    if (onIde) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        returnFocusRef.current = document.activeElement as HTMLElement | null;
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onIde]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  // Garde l'élément actif visible dans la liste
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  if (onIde) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-start justify-center px-4 pt-[14vh]"
          style={{ zIndex: 'var(--z-modal)', background: 'var(--overlay-veil, rgba(0,0,0,0.5))' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.12 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label="Palette de commandes"
            className="surface-raised w-full max-w-xl overflow-hidden"
            style={{ borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-xl)' }}
            initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
          >
            <div className="flex items-center gap-3 border-b px-4" style={{ borderColor: 'var(--border-base)' }}>
              <Search aria-hidden="true" className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
                aria-activedescendant={results.length ? `${listId}-opt-${active}` : undefined}
                aria-label="Rechercher une page ou une action"
                placeholder="Aller à… (Pilotage, Notebooks, Paramètres)"
                className="h-12 w-full bg-transparent text-base outline-none"
                style={{ color: 'var(--text-primary)' }}
                autoComplete="off" spellCheck={false}
              />
              <span className="kbd flex-shrink-0">Échap</span>
            </div>

            <ul id={listId} role="listbox" aria-label="Résultats" className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && (
                <li className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  Aucun résultat pour « {query} »
                </li>
              )}
              {results.map((item, i) => {
                const Icon = item.icon;
                const selected = i === active;
                return (
                  <li
                    key={item.id} id={`${listId}-opt-${i}`} role="option" aria-selected={selected}
                    onMouseMove={() => setActive(i)} onClick={() => run(item)}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
                    style={{
                      borderRadius: 'var(--radius-md)',
                      background: selected ? 'var(--accent-subtle)' : 'transparent',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 flex-shrink-0"
                      style={{ color: selected ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                    <span className="flex-1 truncate text-sm font-medium">{item.label}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.group}</span>
                    {selected && <CornerDownLeft aria-hidden="true" className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />}
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-4 border-t px-4 py-2 text-xs"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> naviguer</span>
              <span className="flex items-center gap-1.5"><span className="kbd">↵</span> ouvrir</span>
              <span className="ml-auto flex items-center gap-1.5"><span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span><span className="kbd">K</span></span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GlobalCommandPalette;

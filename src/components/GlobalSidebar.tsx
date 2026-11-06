/**
 * GlobalSidebar — Navigation globale de Leanna.
 *
 * Expose des *capacités*, pas l'architecture interne. Barre verticale
 * repliable (icônes ↔ étiquettes), groupée par domaine.
 *
 * Améliorations de cette version :
 *  - Ouverture au survol en *overlay* : plus aucun décalage du contenu de la page.
 *  - Intention de survol (délais d'entrée/sortie) : pas de clignotement en
 *    traversant la barre. Le focus clavier la déplie aussi.
 *  - Ressorts (spring) pour la largeur, un halo de survol qui glisse d'un item
 *    à l'autre et un indicateur d'item actif partagé qui se déplace.
 *  - Tooltips rendus dans un portail (plus coupés par le overflow du conteneur).
 *  - Groupes repliables avec hauteur animée, état persisté.
 *  - Clavier : ↑ ↓ Home End pour parcourir, Ctrl/⌘+B pour épingler/réduire.
 *  - Sélecteur Full/Ask avec pastille glissante, retour tactile (tap), progression animée.
 *  - Respect de prefers-reduced-motion partout (useReducedMotion).
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  Settings, PanelLeftClose, PanelLeftOpen, ChevronDown,
  Power, MessageCircle, Mic, MicOff, Bot, ArrowLeft, FolderInput, Radio, Search,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext.js';
import { useConfirm } from './ui/ConfirmDialog.js';
import { useAgentStatus } from '../hooks/useAgentStatus.js';
import { sidebarSections } from '../config/ideSidebarConfig.js';
import { NAV_GROUPS, type NavItem } from '../config/navigation.js';
import type { UnifiedSidebarProps } from './sidebar/types.js';
// @ts-ignore - Asset handled by bundler
import logoDark from '../../assets/images/icon-sombre.png';

/* ------------------------------------------------------------------ */
/* Types & données                                                     */
/* ------------------------------------------------------------------ */

/** Outil IDE : bascule un panneau au lieu de naviguer. */
interface ToolItem {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}
interface ToolGroup { id: string; label: string; items: ToolItem[] }

const COLLAPSE_KEY = 'leanna_global_sidebar_collapsed';
const GROUPS_KEY = 'leanna_global_sidebar_closed_groups';
const WIDTH_COLLAPSED = 60;
const WIDTH_EXPANDED = 252;
const HOVER_IN_MS = 110;
const HOVER_OUT_MS = 220;

/** Construit les groupes d'outils IDE à partir de la config partagée. */
function buildToolGroups(props: GlobalSidebarProps): ToolGroup[] {
  const p = props as unknown as Record<string, unknown>;
  const connected = Boolean(props.assistantConnected);
  const groups: ToolGroup[] = [];

  for (const section of sidebarSections) {
    const items: ToolItem[] = [];
    for (const config of section.items) {
      const leaves = config.type === 'submenu' ? (config.children ?? []) : [config];
      for (const leaf of leaves) {
        if (!leaf.actionKey) continue;
        const onClick = p[leaf.actionKey] as (() => void) | undefined;
        if (typeof onClick !== 'function') continue;
        const active = leaf.stateKey ? Boolean(p[leaf.stateKey]) : false;
        const disabled = Boolean(leaf.requiresAssistant) && !connected;
        items.push({ id: leaf.id, label: leaf.label, icon: leaf.icon, active, disabled, onClick });
      }
    }
    if (items.length > 0) groups.push({ id: section.id, label: section.label ?? '', items });
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* Contexte d'interaction (halo de survol partagé, mouvement réduit)   */
/* ------------------------------------------------------------------ */

interface SidebarCtx {
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  reduceMotion: boolean;
}
const SidebarContext = createContext<SidebarCtx>({ hoverId: null, setHoverId: () => {}, reduceMotion: false });

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]';

/* ------------------------------------------------------------------ */
/* Tooltip (portail → jamais coupé par un overflow)                    */
/* ------------------------------------------------------------------ */

function useTooltip(label: string, enabled: boolean, reduceMotion: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    if (!enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
  }, [enabled]);
  const hide = useCallback(() => setPos(null), []);

  useEffect(() => { if (!enabled) setPos(null); }, [enabled]);

  const tooltip =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <AnimatePresence>
            {pos && enabled && (
              <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 100, pointerEvents: 'none' }} className="-translate-y-1/2">
                <motion.div
                  role="tooltip"
                  initial={reduceMotion ? false : { opacity: 0, x: -6, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
                  transition={{ duration: reduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
                  className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium shadow-lg"
                  style={{ backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
                >
                  {label}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        );

  return { ref, show, hide, tooltip };
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */

export type GlobalSidebarProps = { variant?: 'global' | 'ide' } & Partial<Omit<UnifiedSidebarProps, 'context'>>;

export function GlobalSidebar(props: GlobalSidebarProps = {}) {
  const mode: 'global' | 'ide' = props.variant === 'ide' ? 'ide' : 'global';
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion() ?? false;
  const { theme } = useTheme();
  const { confirm } = useConfirm();
  const agent = useAgentStatus();
  const navRef = useRef<HTMLElement>(null);

  /* Préférence persistée : repliée par défaut (hors survol). */
  const [pinnedCollapsed, setPinnedCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, pinnedCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [pinnedCollapsed]);

  /* Groupes repliés (persistés). */
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify(closedGroups)); } catch { /* ignore */ }
  }, [closedGroups]);
  const toggleGroup = useCallback((id: string) => setClosedGroups((s) => ({ ...s, [id]: !s[id] })), []);

  /* Survol / focus avec intention (délais) → déplie en overlay. */
  const [hovered, setHovered] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const schedule = useCallback((value: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHovered(value), delay);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const collapsed = pinnedCollapsed && !hovered;
  /** Dépliée au survol par-dessus le contenu (et non épinglée ouverte). */
  const overlay = pinnedCollapsed && hovered;

  /* Halo de survol partagé. */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const ctx = useMemo<SidebarCtx>(() => ({ hoverId, setHoverId, reduceMotion }), [hoverId, reduceMotion]);

  /* Raccourci Ctrl/⌘+B : épingler / réduire (ignoré dans les champs d'édition). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b' || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest('.monaco-editor'))) return;
      e.preventDefault();
      setPinnedCollapsed((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Navigation clavier ↑ ↓ Home End entre les items. */
  const onNavKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const els = Array.from(navRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]:not(:disabled)') ?? []);
    if (els.length === 0) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    let next = i;
    if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % els.length;
    if (e.key === 'ArrowUp') next = i <= 0 ? els.length - 1 : i - 1;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = els.length - 1;
    e.preventDefault();
    els[next]?.focus();
  }, []);

  const isActive = useCallback(
    (path: string) => (path === '/ide' ? pathname === '/' || pathname === '/ide' : pathname === path),
    [pathname],
  );

  /* Changer de projet racine : ferme les onglets, désactive le workspace, ouvre la modale. */
  const handleSwitchWorkspace = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Changer de projet',
      message: 'Changer de projet va fermer les onglets ouverts et désactiver le workspace courant. Continuer ?',
      confirmLabel: 'Changer de projet',
      cancelLabel: 'Annuler',
      variant: 'warning',
    });
    if (!confirmed) return;

    window.dispatchEvent(new CustomEvent('Leanna-workspace-changed', { detail: { workspace: null } }));
    try {
      const res = await fetch('/api/self-root/clear', { method: 'POST' });
      if (!res.ok) console.error('[GlobalSidebar] Échec de la désactivation du workspace:', res.status);
    } catch (e) {
      console.error('[GlobalSidebar] Échec de la désactivation du workspace:', e);
    }
    // `force: true` → la modale de sélection ne doit PAS permettre de revenir en
    // arrière (pas de bouton fermer, pas d'Échap) : l'ancien projet est déjà fermé.
    window.dispatchEvent(new CustomEvent('Leanna-open-workspace-switcher', { detail: { force: true } }));
  }, [confirm]);

  /* Ouvre la présence vocale (orb + live) dans une fenêtre dédiée. En Electron,
     une vraie BrowserWindow via IPC ; en dev web, repli sur un onglet /orb-live. */
  const handleOpenOrbWindow = useCallback(() => {
    const api = (window as unknown as { electronAPI?: { openOrbWindow?: () => Promise<unknown> } }).electronAPI;
    if (api?.openOrbWindow) {
      void api.openOrbWindow();
    } else {
      window.open('/orb-live', '_blank', 'noopener,noreferrer,width=440,height=760');
    }
  }, []);

  const [navQuery, setNavQuery] = useState('');
  const normalizedQuery = navQuery.trim().toLocaleLowerCase('fr');
  const visibleNavGroups = useMemo(
    () => NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLocaleLowerCase('fr').includes(normalizedQuery)),
    })).filter((group) => group.items.length > 0),
    [normalizedQuery],
  );
  const toolGroups = mode === 'ide' ? buildToolGroups(props) : [];
  const visibleToolGroups = useMemo(
    () => toolGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLocaleLowerCase('fr').includes(normalizedQuery)),
    })).filter((group) => group.items.length > 0),
    [toolGroups, normalizedQuery],
  );

  const spring = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 40, mass: 0.9 };

  return (
    <SidebarContext.Provider value={ctx}>
      <LayoutGroup id="leanna-global-sidebar">
        {/* Emplacement réservé : il ne suit que l'état ÉPINGLÉ. Le dépliage au
            survol se fait en overlay par-dessus le contenu — sans redimensionner
            la page ni l'éditeur à chaque passage de la souris. */}
        <motion.div
          className="relative h-full flex-shrink-0"
          initial={false}
          animate={{ width: pinnedCollapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}
          transition={spring}
        >
          <motion.nav
            ref={navRef}
            aria-label="Navigation Leanna"
            className="lea-sidebar absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r"
            data-overlay={overlay ? 'true' : undefined}
            initial={false}
            animate={{
              width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED,
              boxShadow: overlay
                ? '18px 0 48px -16px rgba(0,0,0,0.5), 1px 0 0 0 rgba(0,0,0,0)'
                : '0 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0)',
            }}
            transition={spring}
            style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
            onPointerEnter={() => schedule(true, HOVER_IN_MS)}
            onPointerLeave={() => { schedule(false, HOVER_OUT_MS); setHoverId(null); }}
            onFocusCapture={(e) => {
              if ((e.target as HTMLElement).matches?.(':focus-visible')) schedule(true, 0);
            }}
            onBlurCapture={(e) => {
              if (!navRef.current?.contains(e.relatedTarget as Node | null)) schedule(false, HOVER_OUT_MS);
            }}
            onKeyDown={onNavKeyDown}
          >
            {/* Marque + bouton d'épinglage */}
            <div
              className={`relative flex flex-shrink-0 items-center gap-2.5 px-3 ${collapsed ? 'justify-center' : ''}`}
              style={{
                height: 60,
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-primary) 7%, transparent) 0%, transparent 100%)',
              }}
            >
              <motion.span
                aria-hidden
                whileHover={reduceMotion ? undefined : { rotate: -8, scale: 1.08 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl"
                style={{
                  boxShadow: '0 2px 10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                <img src={logoDark} alt="Leanna" className="h-full w-full object-contain" draggable={false} />
              </motion.span>
              <FadeSlide show={!collapsed} className="min-w-0 flex-1" reduceMotion={reduceMotion}>
                <span className="flex flex-col leading-tight">
                  <span className="block truncate text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    Leanna
                  </span>
                  <span className="block truncate text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--accent-primary)' }}>
                    AI WORKSPACE
                  </span>
                </span>
              </FadeSlide>
              {!collapsed && (
                <IconButton
                  label={pinnedCollapsed ? 'Épingler la navigation (Ctrl+B)' : 'Réduire automatiquement (Ctrl+B)'}
                  onClick={() => setPinnedCollapsed((c) => !c)}
                  tooltipEnabled={false}
                >
                  <motion.span
                    key={String(pinnedCollapsed)}
                    initial={reduceMotion ? false : { rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ duration: 0.18 }}
                    className="flex"
                  >
                    {pinnedCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                  </motion.span>
                </IconButton>
              )}
            </div>

            {/* Pastille d'état de l'agent (IDE) — clic = Mission Control */}
            {mode === 'ide' && (
              <AgentPill
                agent={agent}
                collapsed={collapsed}
                reduceMotion={reduceMotion}
                onClick={() => navigate('/pilotage')}
              />
            )}

            {/* Bloc assistant (IDE) */}
            {mode === 'ide' && (
              <IdeAssistantBlock
                collapsed={collapsed}
                reduceMotion={reduceMotion}
                connected={Boolean(props.assistantConnected)}
                working={Boolean(props.assistantWorking)}
                muted={Boolean(props.assistantMuted)}
                sessionMode={props.mode === 'ask' ? 'ask' : 'full'}
                onConnect={props.onConnectAssistant}
                onDisconnect={props.onDisconnectAssistant}
                onToggleChat={props.onToggleChat}
                onMuteToggle={props.onMuteToggle}
                onToggleMode={props.onToggleMode}
              />
            )}

            {!collapsed && (
              <div className="lea-sidebar__search mx-2 mb-2 flex h-9 flex-shrink-0 items-center gap-2 rounded-lg px-3">
                <Search size={15} aria-hidden />
                <input
                  type="search"
                  value={navQuery}
                  onChange={(event) => setNavQuery(event.target.value)}
                  placeholder="Rechercher une section…"
                  aria-label="Rechercher dans la navigation"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--text-dimmed)]"
                />
                {navQuery && (
                  <button type="button" onClick={() => setNavQuery('')} className="text-xs" aria-label="Effacer la recherche">×</button>
                )}
              </div>
            )}

            {/* Navigation groupée (routes) ou outils (IDE) */}
            <div className={`min-h-0 flex-1 px-2 pb-2 ${collapsed ? 'overflow-hidden' : 'overflow-y-auto'} [scrollbar-width:thin]`}>
              {mode === 'ide' && visibleNavGroups.map((group, gi) => (
                <Group key={group.id} id={group.id} label={group.label} first={gi === 0} collapsed={collapsed}
                  open={!closedGroups[group.id]} onToggle={toggleGroup} count={group.items.length}
                  hasActive={group.items.some((item) => isActive(item.path))}>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <NavButton item={item} active={isActive(item.path)} collapsed={collapsed} onClick={() => navigate(item.path)} />
                    </li>
                  ))}
                </Group>
              ))}
              {mode === 'ide'
                ? visibleToolGroups.map((group, gi) => (
                    <Group
                      key={group.id}
                      id={group.id}
                      label={group.label}
                      first={gi === 0}
                      collapsed={collapsed}
                      open={!closedGroups[group.id]}
                      onToggle={toggleGroup}
                      count={group.items.length}
                      hasActive={group.items.some((i) => i.active)}
                    >
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <NavButton
                            item={{ id: item.id, path: '', label: item.label, icon: item.icon }}
                            active={item.active}
                            toggle
                            disabled={item.disabled}
                            collapsed={collapsed}
                            onClick={item.onClick}
                          />
                        </li>
                      ))}
                    </Group>
                  ))
                : visibleNavGroups.map((group, gi) => (
                    <Group
                      key={group.id}
                      id={group.id}
                      label={group.label}
                      first={gi === 0}
                      collapsed={collapsed}
                      open={!closedGroups[group.id]}
                      onToggle={toggleGroup}
                      count={group.items.length}
                      hasActive={group.items.some((i) => isActive(i.path))}
                    >
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <NavButton item={item} active={isActive(item.path)} collapsed={collapsed} onClick={() => navigate(item.path)} />
                        </li>
                      ))}
                    </Group>
                  ))}
              {normalizedQuery && visibleNavGroups.length === 0 && visibleToolGroups.length === 0 && !collapsed && (
                <p className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  Aucun élément ne correspond à « {navQuery} ».
                </p>
              )}
            </div>

            {/* Pied : présence vocale + changer de projet + paramètres */}
            <div className="mt-auto flex-shrink-0 border-t px-2 py-1" style={{ borderColor: 'var(--border-base)' }}>
              <NavButton
                item={{ id: 'orb-live', path: '', label: 'Présence vocale', icon: Radio }}
                active={false}
                collapsed={collapsed}
                onClick={handleOpenOrbWindow}
              />
              <NavButton
                item={{ id: 'switch-workspace', path: '', label: 'Changer de projet', icon: FolderInput }}
                active={false}
                collapsed={collapsed}
                onClick={handleSwitchWorkspace}
              />
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <NavButton
                    item={{ id: 'settings', path: '/settings', label: 'Paramètres', icon: Settings }}
                    active={pathname === '/settings'}
                    collapsed={collapsed}
                    onClick={() => navigate('/settings')}
                  />
                </div>
                
              </div>
              
            </div>

            {/* Marqueur de thème (invisible, garde le thème réactif pour l'outillage) */}
            <span data-theme-marker={theme} className="sr-only" aria-hidden />
          </motion.nav>
        </motion.div>
      </LayoutGroup>
    </SidebarContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Briques                                                             */
/* ------------------------------------------------------------------ */

/** Apparition/disparition douce d'un contenu (étiquettes) sans décalage de layout. */
function FadeSlide({ show, children, className, reduceMotion }: { show: boolean; children: ReactNode; className?: string; reduceMotion: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className={className}
          initial={reduceMotion ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Petit bouton icône avec retour tactile (tap) et tooltip optionnel. */
function IconButton({
  label, onClick, children, tooltipEnabled = true, className = '', style,
}: { label: string; onClick?: () => void; children: ReactNode; tooltipEnabled?: boolean; className?: string; style?: React.CSSProperties }) {
  const { reduceMotion } = useContext(SidebarContext);
  const tip = useTooltip(label, tooltipEnabled, reduceMotion);
  return (
    <>
      <motion.button
        ref={tip.ref}
        type="button"
        onClick={onClick}
        aria-label={label}
        title={tooltipEnabled ? undefined : label}
        onPointerEnter={tip.show}
        onPointerLeave={tip.hide}
        onFocus={tip.show}
        onBlur={tip.hide}
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        className={`flex-shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)] ${FOCUS_RING} ${className}`}
        style={{ color: 'var(--text-dimmed)', ...style }}
      >
        {children}
      </motion.button>
      {tip.tooltip}
    </>
  );
}



/** Groupe repliable : en-tête cliquable, hauteur animée, séparateur en mode icônes. */
function Group({
  id, label, first, collapsed, open, onToggle, children, count = 0, hasActive = false,
}: {
  id: string; label: string; first: boolean; collapsed: boolean; open: boolean; onToggle: (id: string) => void; children: ReactNode;
  /** Nombre d'items (affiché quand le groupe est replié). */
  count?: number;
  /** Un item du groupe est actif : signalé même groupe replié. */
  hasActive?: boolean;
}) {
  const { reduceMotion } = useContext(SidebarContext);
  const showItems = collapsed || open; // en mode icônes tout reste visible

  return (
    <section className="mb-0.5" aria-label={label || undefined}>
      {collapsed ? (
        !first && <div className="lea-sidebar__sep mx-3 my-2 h-px" aria-hidden />
      ) : label ? (
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={open}
          className={`group/head flex w-full items-center justify-between rounded-md px-3 pb-1.5 pt-3 text-left ${FOCUS_RING}`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider transition-colors group-hover/head:text-[var(--text-secondary)]" style={{ color: 'var(--text-dimmed)' }}>
              {label}
            </span>
            {/* Groupe replié : nombre d'items + point si l'item actif est caché dedans */}
            <AnimatePresence initial={false}>
              {!open && (
                <motion.span
                  key="count"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: reduceMotion ? 0 : 0.16 }}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 text-xs tabular-nums leading-4"
                  style={{
                    color: hasActive ? 'var(--accent-primary)' : 'var(--text-dimmed)',
                    backgroundColor: hasActive ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-hover)',
                  }}
                >
                  {hasActive && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }} aria-hidden />}
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="flex opacity-0 transition-opacity group-hover/head:opacity-100 group-focus-visible/head:opacity-100"
            style={{ color: 'var(--text-dimmed)' }}
          >
            <ChevronDown size={12} />
          </motion.span>
        </button>
      ) : null}

      <AnimatePresence initial={false}>
        {showItems && (
          <motion.ul
            className="flex flex-col gap-0.5 overflow-hidden"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Item de navigation : halo de survol glissant, indicateur actif partagé, tooltip portail. */
function NavButton({
  item, active, collapsed, onClick, disabled = false, toggle = false,
}: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void; disabled?: boolean; toggle?: boolean }) {
  const Icon = item.icon;
  const { hoverId, setHoverId, reduceMotion } = useContext(SidebarContext);
  const label = disabled ? `${item.label} (nécessite l'assistant connecté)` : item.label;
  const tip = useTooltip(label, collapsed, reduceMotion);
  const isHovered = hoverId === item.id && !disabled;
  const layoutTransition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 520, damping: 42 };

  return (
    <>
      <motion.button
        ref={tip.ref}
        type="button"
        data-nav-item
        onClick={onClick}
        disabled={disabled}
        aria-current={!toggle && active ? 'page' : undefined}
        aria-pressed={toggle ? active : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={!collapsed && disabled ? label : undefined}
        onPointerEnter={() => { setHoverId(item.id); tip.show(); }}
        onPointerLeave={() => { setHoverId(null); tip.hide(); }}
        onFocus={() => { setHoverId(item.id); tip.show(); }}
        onBlur={() => { setHoverId(null); tip.hide(); }}
        whileTap={reduceMotion || disabled ? undefined : { scale: 0.97 }}
        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
        style={{ color: active ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
      >
        {/* Halo de survol : un seul élément qui glisse d'un item à l'autre */}
        {isHovered && !active && (
          <motion.span
            aria-hidden
            layoutId="nav-hover"
            className="absolute inset-0 rounded-lg"
            style={{ backgroundColor: 'var(--bg-hover)' }}
            transition={layoutTransition}
          />
        )}

        {/* Fond + barre d'item actif : partagés, ils se déplacent vers le nouvel item */}
        {active && (
          <>
            <motion.span
              aria-hidden
              layoutId="nav-active-bg"
              className="lea-sidebar__active absolute inset-0 rounded-lg"
              transition={layoutTransition}
            />
            <motion.span
              aria-hidden
              layoutId="nav-active-bar"
              className="lea-sidebar__bar absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
              transition={layoutTransition}
            />
          </>
        )}

        <motion.span
          className="relative z-10 flex flex-shrink-0"
          animate={{ scale: isHovered ? 1.1 : 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          style={{
            color: active ? 'var(--accent-primary)' : isHovered ? 'var(--text-primary)' : 'var(--text-muted)',
            filter: active ? 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent-primary) 55%, transparent))' : undefined,
          }}
        >
          <Icon size={18} />
        </motion.span>

        <span className="relative z-10 flex min-w-0 flex-1 items-center">
          <FadeSlide show={!collapsed} className="min-w-0 flex-1" reduceMotion={reduceMotion}>
            <span className={`block truncate text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
          </FadeSlide>
        </span>

        {/* Point d'état pour les outils-bascules IDE */}
        {toggle && active && !collapsed && (
          <motion.span
            aria-hidden
            initial={reduceMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            className="relative z-10 h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          />
        )}
      </motion.button>
      {tip.tooltip}
    </>
  );
}

/** Pastille d'état de l'agent — clic = retour à Mission Control. */
function AgentPill({
  agent, collapsed, reduceMotion, onClick,
}: { agent: ReturnType<typeof useAgentStatus>; collapsed: boolean; reduceMotion: boolean; onClick: () => void }) {
  const progress = typeof agent.progress === 'number' ? Math.min(1, Math.max(0, agent.progress)) : null;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title="Ouvrir Mission Control"
      aria-label={`État de Leanna : ${agent.label}. Ouvrir Mission Control.`}
      whileHover={reduceMotion ? undefined : { x: 2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      className={`group/pill mx-2 mb-2 mt-1 flex flex-shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:border-[var(--accent-primary)] ${collapsed ? 'justify-center' : ''}${agent.active && !reduceMotion ? ' lea-glow-border' : ''} ${FOCUS_RING}`}
      style={{
        background: 'linear-gradient(180deg, var(--bg-panel) 0%, color-mix(in srgb, var(--bg-panel) 70%, var(--bg-secondary)) 100%)',
        border: '1px solid var(--border-base)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center" aria-hidden>
        {agent.active && !reduceMotion && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full"
            style={{ backgroundColor: agent.color }}
            animate={{ opacity: [0.55, 0, 0.55], scale: [1, 2.4, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <motion.span
          className="relative inline-flex h-2 w-2 rounded-full"
          animate={{ backgroundColor: agent.color }}
          transition={{ duration: 0.4 }}
        />
      </span>

      <FadeSlide show={!collapsed} className="min-w-0 flex-1 text-left" reduceMotion={reduceMotion}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={agent.label}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="block"
          >
            <span className="block truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.label}</span>
            <span className="block truncate text-xs" style={{ color: 'var(--text-muted)' }}>{agent.reason}</span>
          </motion.span>
        </AnimatePresence>
        {progress !== null && (
          <span
            className="mt-1.5 block h-1 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--border-base)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <motion.span
              className="block h-full rounded-full"
              initial={false}
              animate={{ width: `${Math.round(progress * 100)}%`, backgroundColor: agent.color }}
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 24 }}
            />
          </span>
        )}
      </FadeSlide>

      {!collapsed && (
        <ArrowLeft
          size={13}
          className="flex-shrink-0 transition-transform group-hover/pill:-translate-x-0.5"
          style={{ color: 'var(--text-dimmed)' }}
          aria-hidden
        />
      )}
    </motion.button>
  );
}

/** Bouton d'action compact (défini hors du composant : pas de remontage à chaque rendu).
 *  Tooltip rendu en portail (jamais coupé par l'overflow de la barre), état
 *  désactivé explicite et retour tactile respectant prefers-reduced-motion. */
function Ctrl({
  icon: Icon, label, onClick, active, tone, reduceMotion, disabled = false, pressed,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  tone?: string;
  reduceMotion: boolean;
  disabled?: boolean;
  pressed?: boolean;
}) {
  const tip = useTooltip(label, true, reduceMotion);
  return (
    <>
      <motion.button
        ref={tip.ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed ?? active}
        onPointerEnter={tip.show}
        onPointerLeave={tip.hide}
        onFocus={tip.show}
        onBlur={tip.hide}
        whileHover={reduceMotion || disabled ? undefined : { y: -1 }}
        whileTap={reduceMotion || disabled ? undefined : { scale: 0.92 }}
        className={`flex h-8 flex-1 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
        style={{
          backgroundColor: active ? 'var(--bg-active)' : 'var(--bg-input)',
          color: tone ?? 'var(--text-secondary)',
          border: '1px solid var(--border-base)',
        }}
      >
        <Icon size={14} />
      </motion.button>
      {tip.tooltip}
    </>
  );
}

function IdeAssistantBlock({
  collapsed, reduceMotion, connected, working, muted, sessionMode,
  onConnect, onDisconnect, onToggleChat, onMuteToggle, onToggleMode,
}: {
  collapsed: boolean;
  reduceMotion: boolean;
  connected: boolean;
  working: boolean;
  muted: boolean;
  sessionMode: 'full' | 'ask';
  onConnect?: () => void;
  onDisconnect?: () => void;
  onToggleChat?: () => void;
  onMuteToggle?: () => void;
  onToggleMode?: () => void;
}) {
  const dotColor = !connected
    ? 'var(--text-dimmed)'
    : working ? 'var(--accent-primary)' : muted ? 'var(--color-warning)' : 'var(--color-success)';

  if (!connected) {
    // Un seul appel à l'action : connecter l'assistant.
    return (
      <div className="mx-2 mb-3 mt-0.5 flex-shrink-0">
        <motion.button
          type="button"
          onClick={onConnect}
          title="Connecter l'assistant IA"
          aria-label="Connecter l'assistant IA"
          whileHover={reduceMotion ? undefined : { scale: 1.02, y: -1 }}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          className={`group/cta relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-3 py-2.5 text-xs font-bold tracking-wide ${FOCUS_RING}`}
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 100%)',
            color: 'var(--bg-base)',
            boxShadow: '0 4px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          {!reduceMotion && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover/cta:translate-x-full"
            />
          )}
          <Bot size={15} className="relative" />
          {!collapsed && <span className="relative">Connecter l'IA</span>}
        </motion.button>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="mx-2 mb-2 flex flex-shrink-0 flex-col gap-1">
        {/* <Ctrl reduceMotion={reduceMotion} icon={MessageCircle} label="Chat IA" onClick={onToggleChat} active={working} tone="var(--accent-primary)" /> */}
        <Ctrl reduceMotion={reduceMotion} icon={muted ? MicOff : Mic} label={muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={onMuteToggle} tone={muted ? 'var(--color-warning)' : undefined} />
      </div>
    );
  }

  const statusLabel = working ? 'En cours' : muted ? 'En pause' : 'Connecté';

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-2 mb-2 flex-shrink-0 overflow-hidden rounded-xl border shadow-sm"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2 w-2 flex-shrink-0 items-center justify-center" aria-hidden>
            {working && !reduceMotion && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: dotColor }} />
            )}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full transition-colors" style={{ backgroundColor: dotColor }} />
          </span>
          <span className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }} aria-live="polite">
            {statusLabel}
          </span>
        </div>

        {/* Sélecteur Full / Ask avec pastille glissante */}
        <div
          role="group"
          aria-label="Mode de session"
          className="relative flex flex-shrink-0 rounded-md p-0.5"
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}
        >
          {(['full', 'ask'] as const).map((m) => {
            const current = sessionMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => { if (!current) onToggleMode?.(); }}
                aria-pressed={current}
                title={m === 'full' ? 'Mode complet' : 'Mode question'}
                className={`relative rounded px-2 py-0.5 text-xs font-semibold ${FOCUS_RING}`}
                style={{ color: current ? 'var(--text-primary)' : 'var(--text-dimmed)' }}
              >
                {current && (
                  <motion.span
                    layoutId="session-mode-pill"
                    aria-hidden
                    className="absolute inset-0 rounded"
                    style={{ backgroundColor: 'var(--bg-active)' }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
                  />
                )}
                <span className="relative">{m === 'full' ? 'Full' : 'Ask'}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 p-2">
        <Ctrl reduceMotion={reduceMotion} icon={MessageCircle} label="Chat IA" onClick={onToggleChat} active={working} tone="var(--accent-primary)" />
        <Ctrl reduceMotion={reduceMotion} icon={muted ? MicOff : Mic} label={muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={onMuteToggle} tone={muted ? 'var(--color-warning)' : undefined} />
        <Ctrl reduceMotion={reduceMotion} icon={Power} label="Déconnecter l'assistant" onClick={onDisconnect} tone="var(--color-error)" />
      </div>
    </motion.div>
  );
}
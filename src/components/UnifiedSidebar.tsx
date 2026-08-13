/**
 * UnifiedSidebar — Sidebar unifiée fusionnant la navigation globale
 * et les outils IDE en un seul composant cohérent, sans doublons.
 *
 * Structure :
 * 1. Brand Row (en-tête — logo cliquable pour retourner à l'éditeur)
 * 2. IDE Tools (panneaux contextuels, uniquement en mode IDE)
 * 3. Agent Status (contrôle IA, uniquement en mode IDE)
 * 4. Navigation Globale (pages de haut niveau)
 * 5. Footer (paramètres, aide, quit)
 *
 * Améliorations v2 :
 * - Hook useTheme() appelé au top-level (respect des règles React)
 * - Composants extraits : QuitConfirmDialog, AgentStatusBlock, ModeToggleButton
 * - Hook custom useIDEState pour consolider state/actions
 * - buildAIMenuItems simplifié avec flatMap
 * - Accessibilité : Escape, role="menu", aria-labels
 * - Types explicites (pas de cast as Record)
 * - noop déclaré avant utilisation
 */

import { useRef, useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  History,
  Zap,
  HelpCircle,
  Power,
  Settings,
  SlidersHorizontal,
  BrainCircuit,
} from 'lucide-react';
import { motion } from 'motion/react';

import { useTheme } from '../context/ThemeContext';
import { SidebarSection, SidebarSeparator } from './ide/sidebar/SidebarSection';
import { SidebarItem } from './ide/sidebar/SidebarItem';
import { sidebarSections } from '../config/ideSidebarConfig';
import type { LucideIcon } from 'lucide-react';
import logoDark from '../../assets/images/icon-sombre.png';
import logoLight from '../../assets/images/icon-light.png';

import { QuitConfirmDialog } from './sidebar/QuitConfirmDialog';
import { AgentStatusBlock } from './sidebar/AgentStatusBlock';
import { buildAIMenuItems } from './sidebar/buildAIMenuItems';
import { useIDEState } from './sidebar/useIDEState';
import type { UnifiedSidebarProps, SidebarContext } from './sidebar/types';

// Re-export types for consumers
export type { UnifiedSidebarProps } from './sidebar/types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const noop = () => {};

interface NavItem {
  path: string;
  icon: LucideIcon;
  label: string;
  match: (p: string) => boolean;
}

const GLOBAL_NAV_ITEMS: NavItem[] = [
  { path: '/history', icon: History, label: 'Historique', match: (p) => p === '/history' },
  { path: '/memories', icon: BrainCircuit, label: 'Mémoires', match: (p) => p === '/memories' },
  { path: '/automation', icon: Zap, label: 'Tâches', match: (p) => p === '/automation' },
  { path: '/settings', icon: Settings, label: 'Paramètres', match: (p) => p === '/settings' },
];

// ─── Composant Principal ───────────────────────────────────────────────────────

export const UnifiedSidebar = memo(function UnifiedSidebar(props: UnifiedSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { context } = props;

  const assistantMenuRef = useRef<HTMLDivElement>(null);
  const [assistantMenuOpen, setAssistantMenuOpen] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const hasAnimatedRef = useRef(false);

  // ── Consolidated IDE state/actions via custom hook ──
  const { state, actions } = useIDEState(props);

  // ── AI Menu items (memoized) ──
  const aiMenuItems = useMemo(
    () => buildAIMenuItems(props.assistantConnected ?? false),
    [props.assistantConnected]
  );

  // ── Close assistant menu on outside click ──
  useEffect(() => {
    if (!assistantMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (assistantMenuRef.current && !assistantMenuRef.current.contains(event.target as Node)) {
        setAssistantMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [assistantMenuOpen]);

  // Mark animated after first render
  useEffect(() => {
    hasAnimatedRef.current = true;
  }, []);

  // ── Quit handlers ──
  const handleQuitClose = useCallback(() => setShowQuitConfirm(false), []);
  const handleQuitConfirm = useCallback(() => {
    setShowQuitConfirm(false);
    (window as any).electronAPI?.quit();
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <nav
      className="flex flex-col items-center select-none relative"
      style={{
        width: '48px',
        borderRight: '1px solid var(--border-base)',
        backgroundColor: 'var(--bg-sidebar)',
        height: '100%',
        paddingBottom: '6px',
        boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
      }}
      aria-label="Navigation principale"
    >
      {/* ═══ BRAND LOGO ═══ */}
      <BrandLogo theme={theme} onNavigate={() => navigate('/ide')} />

      {/* ═══ IDE TOOLS ═══ */}
      {context === 'ide' && (
        <IDEToolsSections
          state={state}
          actions={actions}
          assistantConnected={props.assistantConnected ?? false}
          skipAnimation={hasAnimatedRef.current}
        />
      )}

      {/* Spacer flexible */}
      <div className="flex-1" />

      {/* ═══ AGENT STATUS (IDE only) ═══ */}
      {context === 'ide' && (
        <AgentStatusBlock
          assistantConnected={props.assistantConnected ?? false}
          assistantWorking={props.assistantWorking ?? false}
          assistantMuted={props.assistantMuted ?? false}
          assistantMenuOpen={assistantMenuOpen}
          assistantMenuRef={assistantMenuRef}
          setAssistantMenuOpen={setAssistantMenuOpen}
          aiMenuItems={aiMenuItems}
          state={state}
          actions={actions}
          mode={props.mode ?? 'full'}
          onToggleChat={props.onToggleChat ?? noop}
          onToggleMode={props.onToggleMode ?? noop}
          onConnectAssistant={props.onConnectAssistant ?? noop}
          onDisconnectAssistant={props.onDisconnectAssistant ?? noop}
          onMuteToggle={props.onMuteToggle ?? noop}
        />
      )}

      {/* ═══ NAVIGATION GLOBALE ═══ */}
      <SidebarSeparator thin />
      <GlobalNavSection
        context={context}
        currentPath={location.pathname}
        navigate={navigate}
        showHistory={props.showHistory ?? false}
        onToggleHistory={props.onToggleHistory ?? noop}
        showAutomation={props.showAutomation ?? false}
        onToggleAutomation={props.onToggleAutomation ?? noop}
        showMemory={props.showMemory ?? false}
        onToggleMemory={props.onToggleMemory ?? noop}
      />

      {/* ═══ FOOTER ═══ */}
      <SidebarSeparator thin />
      <FooterSection
        context={context}
        currentPath={location.pathname}
        navigate={navigate}
        showSettings={props.showSettings ?? false}
        onToggleSettings={props.onToggleSettings ?? noop}
        showHelp={props.showHelp ?? false}
        onToggleHelp={props.onToggleHelp ?? noop}
      />

      {/* Quit App (Electron) */}
      {(window as any).electronAPI && (
        <>
          <SidebarItem
            icon={Power}
            active={false}
            onClick={() => setShowQuitConfirm(true)}
            title="Quitter Jarvis OS"
          />
          <QuitConfirmDialog
            open={showQuitConfirm}
            onClose={handleQuitClose}
            onConfirm={handleQuitConfirm}
          />
        </>
      )}
    </nav>
  );
});

// ─── Sub-components ────────────────────────────────────────────────────────────

function BrandLogo({ theme, onNavigate }: { theme: string; onNavigate: () => void }) {
  return (
    <div
      className="w-full h-[60px] flex items-center justify-center flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-base)' }}
    >
      <button
        type="button"
        className="w-[48px] h-[48px] rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer"
        style={{
          background: 'rgba(255,255,255,0.04)',
          boxShadow: '0 0 12px rgba(0,0,0,0.12)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
        onClick={onNavigate}
        title="Jarvis OS"
        aria-label="Retourner à l'éditeur"
      >
        <img
          src={theme === 'dark' ? logoDark : logoLight}
          alt="Jarvis OS"
          className="w-full h-full object-contain"
        />
      </button>
    </div>
  );
}

function IDEToolsSections({
  state,
  actions,
  assistantConnected,
  skipAnimation,
}: {
  state: import('./sidebar/types').IDEPanelState;
  actions: import('./sidebar/types').IDEPanelActions;
  assistantConnected: boolean;
  skipAnimation: boolean;
}) {
  // Cast to Record for SidebarSection compatibility (config-driven keys)
  const stateRecord = state as unknown as Record<string, boolean | string | null>;
  const actionsRecord = actions as unknown as Record<string, () => void>;

  return (
    <div className="w-full flex flex-col items-center pt-1">
      {sidebarSections.map((section, idx) => (
        <motion.div
          key={section.id}
          className="w-full"
          initial={skipAnimation ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: skipAnimation ? 0 : idx * 0.05, duration: 0.2, ease: 'easeOut' }}
        >
          <SidebarSection
            config={section}
            state={stateRecord}
            actions={actionsRecord}
            assistantConnected={assistantConnected}
          />
          {idx < sidebarSections.length - 1 && <SidebarSeparator />}
        </motion.div>
      ))}
    </div>
  );
}

function GlobalNavSection({
  context,
  currentPath,
  navigate,
  showHistory,
  onToggleHistory,
  showAutomation,
  onToggleAutomation,
  showMemory,
  onToggleMemory,
}: {
  context: SidebarContext;
  currentPath: string;
  navigate: (path: string) => void;
  showHistory: boolean;
  onToggleHistory: () => void;
  showAutomation: boolean;
  onToggleAutomation: () => void;
  showMemory: boolean;
  onToggleMemory: () => void;
}) {
  // Map path → IDE panel toggle (pour éviter navigation hors contexte IDE)
  const ideOverrides: Record<string, { active: boolean; onClick: () => void }> = {
    '/history': { active: showHistory, onClick: onToggleHistory },
    '/automation': { active: showAutomation, onClick: onToggleAutomation },
    '/memories': { active: showMemory, onClick: onToggleMemory },
  };

  return (
    <div className="w-full flex flex-col items-center" role="navigation" aria-label="Navigation globale">
      {GLOBAL_NAV_ITEMS.map(({ path, icon, label, match }) => {
        const override = context === 'ide' ? ideOverrides[path] : undefined;
        const active = override ? override.active : match(currentPath);
        const onClick = override ? override.onClick : () => navigate(path);

        return (
          <SidebarItem
            key={path}
            icon={icon}
            active={active}
            onClick={onClick}
            title={label}
          />
        );
      })}
    </div>
  );
}

function FooterSection({
  context,
  currentPath,
  navigate,
  showSettings,
  onToggleSettings,
  showHelp,
  onToggleHelp,
}: {
  context: SidebarContext;
  currentPath: string;
  navigate: (path: string) => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  showHelp: boolean;
  onToggleHelp: () => void;
}) {
  return (
    <div className="w-full flex flex-col items-center" role="navigation" aria-label="Aide et paramètres">
      {/* {context === 'ide' && (
        <SidebarItem
          icon={SlidersHorizontal}
          active={showSettings}
          onClick={onToggleSettings}
          title="Réglages éditeur"
        />
      )} */}
      <SidebarItem
        icon={HelpCircle}
        active={context === 'ide' ? showHelp : currentPath === '/help'}
        onClick={context === 'ide' ? onToggleHelp : () => navigate('/help')}
        title="Aide"
      />
    </div>
  );
}

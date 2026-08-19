/**
 * UnifiedSidebar — Sidebar unifiée (48px fixe, mode compact uniquement).
 *
 * Structure :
 * 1. Brand Row (logo)
 * 2. IDE Tools (panneaux contextuels)
 * 3. Agent Status (contrôle IA)
 * 4. Navigation Globale (flyout)
 * 5. Footer (paramètres, aide, quit)
 */

import { useRef, useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  History,
  Zap,
  HelpCircle,
  Power,
  Settings,
  BrainCircuit,
  LayoutList,
  FileText,
  BookOpen,
} from 'lucide-react';
import { motion } from 'motion/react';

import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/UserProfileContext';
import { SidebarSection, SidebarSeparator } from './ide/sidebar/SidebarSection';
import { SidebarItem } from './ide/sidebar/SidebarItem';
import { sidebarSections } from '../config/ideSidebarConfig';
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

// ─── Composant Principal ───────────────────────────────────────────────────────

export const UnifiedSidebar = memo(function UnifiedSidebar(props: UnifiedSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { profile } = useProfile();
  const { context } = props;

  const assistantMenuRef = useRef<HTMLDivElement>(null);
  const [assistantMenuOpen, setAssistantMenuOpen] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const hasAnimatedRef = useRef(false);

  // ── Consolidated IDE state/actions via custom hook ──
  const { state, actions } = useIDEState(props);

  // ── AI Menu items (memoized) ──
  const aiMenuItems = useMemo(
    () => buildAIMenuItems(props.assistantConnected ?? false, profile.agents.enabled),
    [props.assistantConnected, profile.agents.enabled]
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
  useEffect(() => { hasAnimatedRef.current = true; }, []);

  // ── Quit handlers ──
  const handleQuitClose = useCallback(() => setShowQuitConfirm(false), []);
  const handleQuitConfirm = useCallback(() => {
    setShowQuitConfirm(false);
    (window as any).electronAPI?.quit();
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <nav
      className="jarvis-sidebar flex flex-col items-center select-none relative"
      style={{
        width: '56px',
        borderRight: '1px solid var(--ide-shell-border)',
        backgroundColor: 'var(--ide-sidebar-bg)',
        height: '100%',
        paddingBottom: '8px',
        boxShadow: 'none',
      }}
      aria-label="Navigation principale"
    >
      {/* ═══ BRAND LOGO ═══ */}
      <BrandLogo theme={theme} onNavigate={() => navigate('/ide')} />

      {/* ═══ IDE TOOLS ═══ */}
      <div className="flex-1 w-full flex flex-col min-h-0">
        {context === 'ide' && (
          <IDEToolsSections
            state={state}
            actions={actions}
            assistantConnected={props.assistantConnected ?? false}
            skipAnimation={hasAnimatedRef.current}
          />
        )}

        {/* Spacer */}
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
      </div>

      {/* ═══ BOTTOM — fixed ═══ */}
      <div className="w-full flex flex-col items-center flex-shrink-0">
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
          showNotebooks={props.showNotebooks ?? false}
          onToggleNotebooks={props.onToggleNotebooks ?? noop}
        />

        <SidebarSeparator thin />
        <FooterSection
          context={context}
          currentPath={location.pathname}
          navigate={navigate}
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
      </div>
    </nav>
  );
});

// ─── Sub-components ────────────────────────────────────────────────────────────

function BrandLogo({ theme, onNavigate }: { theme: string; onNavigate: () => void }) {
  return (
    <div
      className="w-full h-[64px] flex items-center justify-center flex-shrink-0"
      style={{ borderBottom: '1px solid var(--ide-shell-border)' }}
    >
      <button
        type="button"
        className="w-[38px] h-[38px] rounded-[14px] overflow-hidden flex items-center justify-center cursor-pointer"
        style={{
          background: 'var(--ide-sidebar-item-bg)',
          boxShadow: 'none',
          border: '1px solid var(--ide-shell-border)',
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
  const stateRecord = state as unknown as Record<string, boolean | string | null>;
  const actionsRecord = actions as unknown as Record<string, () => void>;

  return (
    <div className="w-full flex flex-col gap-1 pt-3">
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
  showNotebooks,
  onToggleNotebooks,
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
  showNotebooks: boolean;
  onToggleNotebooks: () => void;
}) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const submenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!submenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (submenuRef.current && !submenuRef.current.contains(e.target as Node)) {
        setSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [submenuOpen]);

  useEffect(() => {
    setSubmenuOpen(false);
  }, [currentPath, showHistory, showAutomation, showMemory, showNotebooks]);

  const subItems = [
    { id: 'history', path: '/history', icon: History, label: 'Historique', active: showHistory, onClick: onToggleHistory },
    { id: 'memories', path: '/memories', icon: BrainCircuit, label: 'Mémoires', active: showMemory, onClick: onToggleMemory },
    { id: 'automation', path: '/automation', icon: Zap, label: 'Tâches', active: showAutomation, onClick: onToggleAutomation },
    { id: 'documents', path: '/documents', icon: FileText, label: 'Documents', active: currentPath === '/documents', onClick: () => navigate('/documents') },
    { id: 'notebooks', path: '/notebooks', icon: BookOpen, label: 'Notebooks', active: showNotebooks, onClick: onToggleNotebooks },
  ];

  const anyActive = subItems.some(item =>
    context === 'ide' ? item.active : item.path === currentPath
  );

  return (
    <div className="w-full flex flex-col items-center relative" role="navigation" aria-label="Navigation globale" ref={submenuRef}>
      <SidebarItem
        icon={LayoutList}
        active={anyActive || submenuOpen}
        onClick={() => setSubmenuOpen(prev => !prev)}
        title="Historique · Mémoires · Tâches"
        hasSubmenu
      />

      {submenuOpen && (
        <div
          className="absolute left-[52px] bottom-0 z-50 py-1.5 rounded-lg border shadow-lg"
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderColor: 'var(--border-base)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            minWidth: '160px',
          }}
        >
          {subItems.map(({ id, path, icon: Icon, label, active, onClick }) => {
            const isActive = context === 'ide' ? active : path === currentPath;
            const handleClick = context === 'ide' ? onClick : () => navigate(path);

            return (
              <button
                key={id}
                onClick={() => {
                  handleClick();
                  setSubmenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11px] font-medium transition-colors hover:bg-white/8"
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                  backgroundColor: isActive ? 'var(--accent-subtle)' : undefined,
                }}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FooterSection({
  context,
  currentPath,
  navigate,
  showHelp,
  onToggleHelp,
}: {
  context: SidebarContext;
  currentPath: string;
  navigate: (path: string) => void;
  showHelp: boolean;
  onToggleHelp: () => void;
}) {
  return (
    <div className="w-full flex flex-col items-center" role="navigation" aria-label="Aide et paramètres">
      <SidebarItem
        icon={Settings}
        active={currentPath === '/settings'}
        onClick={() => navigate('/settings')}
        title="Paramètres"
      />
      <SidebarItem
        icon={HelpCircle}
        active={context === 'ide' ? showHelp : currentPath === '/help'}
        onClick={context === 'ide' ? onToggleHelp : () => navigate('/help')}
        title="Aide"
      />
    </div>
  );
}

/**
 * AgentStatusBlock — Section agent IA de la sidebar.
 * Inclut le status indicator, le flyout menu, et le mode toggle.
 */

import { useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff, Power, Sparkles, MessageCircle } from 'lucide-react';

import { SidebarItem, SidebarStatusIndicator } from '../ide/sidebar/SidebarItem';
import { FlyoutMenu, FlyoutHeader, FlyoutItem, FlyoutSeparator } from '../ide/sidebar/FlyoutMenu';
import { SidebarSeparator } from '../ide/sidebar/SidebarSection';
import { ModeToggleButton } from './ModeToggleButton';
import type { AIMenuItem, IDEPanelState, IDEPanelActions } from './types';

interface AgentStatusBlockProps {
  assistantConnected: boolean;
  assistantWorking: boolean;
  assistantMuted: boolean;
  assistantMenuOpen: boolean;
  assistantMenuRef: React.RefObject<HTMLDivElement | null>;
  setAssistantMenuOpen: (v: boolean) => void;
  aiMenuItems: AIMenuItem[];
  state: IDEPanelState;
  actions: IDEPanelActions;
  mode: 'full' | 'ask';
  onToggleChat: () => void;
  onToggleMode: () => void;
  onConnectAssistant: () => void;
  onDisconnectAssistant: () => void;
  onMuteToggle: () => void;
}

export function AgentStatusBlock({
  assistantConnected,
  assistantWorking,
  assistantMuted,
  assistantMenuOpen,
  assistantMenuRef,
  setAssistantMenuOpen,
  aiMenuItems,
  state,
  actions,
  mode,
  onToggleChat,
  onToggleMode,
  onConnectAssistant,
  onDisconnectAssistant,
  onMuteToggle,
}: AgentStatusBlockProps) {
  // Keyboard handler : Escape ferme le flyout
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && assistantMenuOpen) {
      setAssistantMenuOpen(false);
    }
  }, [assistantMenuOpen, setAssistantMenuOpen]);

  useEffect(() => {
    if (!assistantMenuOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [assistantMenuOpen, handleKeyDown]);

  // Helper pour accéder au state en tant que record (pour les clés dynamiques du config)
  const stateRecord = state as unknown as Record<string, boolean | string | null>;
  const actionsRecord = actions as unknown as Record<string, () => void>;

  return (
    <>
      {/* Quick chat toggle when connected */}
      {assistantConnected && (
        <SidebarItem
          icon={MessageCircle}
          active={state.showChat}
          onClick={onToggleChat}
          title="Chat IA (Ctrl+L)"
        />
      )}

      {/* Agent status indicator + flyout menu */}
      <div
        className="relative w-full flex flex-col items-center"
        ref={assistantMenuRef}
        role="group"
        aria-label="Statut de l'agent IA"
      >
        <div className="relative w-full h-[48px] flex flex-col items-center justify-center gap-1">
          <SidebarStatusIndicator
            connected={assistantConnected}
            working={assistantWorking}
            muted={assistantMuted}
            onClick={() => !assistantConnected && onConnectAssistant()}
            onContextMenu={() => assistantConnected && setAssistantMenuOpen(!assistantMenuOpen)}
            onMuteToggle={onMuteToggle}
          />

          {/* Status label under icon */}
          <AnimatePresence mode="wait">
            {!assistantConnected ? (
              <motion.span
                key="label-off"
                className="text-[6.5px] uppercase tracking-[0.14em] font-bold pointer-events-none"
                style={{ color: 'var(--accent-primary)', opacity: 0.7 }}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: [0.4, 0.85, 0.4], y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ opacity: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 0.15 } }}
              >
                Activer
              </motion.span>
            ) : assistantWorking ? (
              <motion.span
                key="label-working"
                className="text-[6.5px] uppercase tracking-[0.14em] font-bold pointer-events-none"
                style={{ color: 'var(--accent-primary)' }}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: [0.6, 1, 0.6], y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ opacity: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 0.15 } }}
              >
                En cours
              </motion.span>
            ) : (
              <motion.span
                key="label-on"
                className="text-[6.5px] uppercase tracking-[0.14em] font-bold pointer-events-none"
                style={{ color: 'var(--color-success)', opacity: 0.75 }}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 0.75, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.15 }}
              >
                En ligne
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {assistantMenuOpen && (
            <FlyoutMenu align="bottom">
              <FlyoutHeader>
                <span className="flex items-center gap-2">
                  <Sparkles size={13} style={{ color: 'var(--accent-primary)' }} />
                  Contrôle IA
                </span>
              </FlyoutHeader>

              <div role="menu" aria-label="Options de l'agent IA">
                {aiMenuItems.map((item) => (
                  <FlyoutItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={item.stateKey ? Boolean(stateRecord[item.stateKey]) : false}
                    dot={item.dotStateKey ? (Boolean(stateRecord[item.dotStateKey]) ? '#0ea5e9' : undefined) : undefined}
                    onClick={() => {
                      if (item.actionKey && actionsRecord[item.actionKey]) {
                        actionsRecord[item.actionKey]();
                        setAssistantMenuOpen(false);
                      }
                    }}
                  />
                ))}
              </div>

              <FlyoutSeparator />
              <FlyoutItem
                icon={assistantMuted ? MicOff : Mic}
                label={assistantMuted ? 'Réactiver le micro' : 'Couper le micro'}
                active={!assistantMuted}
                onClick={() => { setAssistantMenuOpen(false); onMuteToggle(); }}
              />
              <FlyoutItem
                icon={Power}
                label="Déconnecter l'agent"
                active={false}
                onClick={() => { setAssistantMenuOpen(false); onDisconnectAssistant(); }}
              />
            </FlyoutMenu>
          )}
        </AnimatePresence>
      </div>

      <SidebarSeparator thin />

      {/* Mode toggle — bouton visuel full vs ask */}
      <ModeToggleButton mode={mode} onToggle={onToggleMode} />
    </>
  );
}

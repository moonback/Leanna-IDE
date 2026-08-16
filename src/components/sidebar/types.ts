/**
 * Types consolidés pour la UnifiedSidebar.
 * Regroupe les états et actions IDE pour réduire le nombre de props.
 */

import type { LucideIcon } from 'lucide-react';

// ─── Contexte de la sidebar ────────────────────────────────────────────────────

export type SidebarContext = 'global' | 'ide';

// ─── État des panneaux IDE ─────────────────────────────────────────────────────

export interface IDEPanelState {
  showExplorer: boolean;
  showGlobalSearch: boolean;
  showTerminal: boolean;
  showPreview: boolean;
  showSettings: boolean;
  showRunMenu: boolean;
  showCheckpoints: boolean;
  showSandbox: boolean;
  showWorkflow: boolean;
  showSkillsMonitor: boolean;
  showChat: boolean;
  showAgents: boolean;
  showMissions: boolean;
  showSystemHealth: boolean;
  showKnowledgeSystem: boolean;
  showMcp: boolean;
  showFleet: boolean;
  previewUrl: string | null;
  visionEnabled: boolean;
  screenShareEnabled: boolean;
}

// ─── Actions des panneaux IDE ──────────────────────────────────────────────────

export interface IDEPanelActions {
  onToggleExplorer: () => void;
  onToggleSearch: () => void;
  onToggleTerminal: () => void;
  onTogglePreview: () => void;
  onToggleSettings: () => void;
  onToggleRunMenu: () => void;
  onToggleCheckpoints: () => void;
  onToggleSandbox: () => void;
  onToggleWorkflow: () => void;
  onToggleSkillsMonitor: () => void;
  onToggleChat: () => void;
  onToggleAgents: () => void;
  onToggleMissions: () => void;
  onToggleSystemHealth: () => void;
  onToggleKnowledgeSystem: () => void;
  onToggleMcp: () => void;
  onToggleFleet: () => void;
  onToggleVision: () => void;
  onToggleScreenShare: () => void;
}

// ─── État de l'assistant ───────────────────────────────────────────────────────

export interface AssistantState {
  connected: boolean;
  working: boolean;
  muted: boolean;
}

export interface AssistantActions {
  onConnect: () => void;
  onDisconnect: () => void;
  onMuteToggle: () => void;
}

// ─── Item de menu IA ───────────────────────────────────────────────────────────

export interface AIMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  stateKey?: string;
  actionKey?: string;
  dotStateKey?: string;
}

// ─── Props de la sidebar ───────────────────────────────────────────────────────

export interface UnifiedSidebarProps {
  /** Contexte actif : 'global' pour pages non-IDE, 'ide' pour l'éditeur */
  context: SidebarContext;

  // ── IDE State (only used when context === 'ide') ──
  showExplorer?: boolean;
  showGlobalSearch?: boolean;
  showTerminal?: boolean;
  showPreview?: boolean;
  showSettings?: boolean;
  showRunMenu?: boolean;
  showCheckpoints?: boolean;
  showSandbox?: boolean;
  showWorkflow?: boolean;
  showSkillsMonitor?: boolean;
  showChat?: boolean;
  showAgents?: boolean;
  showMissions?: boolean;
  showSystemHealth?: boolean;
  showKnowledgeSystem?: boolean;
  showMcp?: boolean;
  showFleet?: boolean;
  previewUrl?: string | null;
  assistantConnected?: boolean;
  assistantWorking?: boolean;
  assistantMuted?: boolean;
  visionEnabled?: boolean;
  screenShareEnabled?: boolean;
  mode?: 'full' | 'ask';

  // ── IDE Actions (only used when context === 'ide') ──
  onToggleExplorer?: () => void;
  onToggleSearch?: () => void;
  onToggleTerminal?: () => void;
  onTogglePreview?: () => void;
  onToggleSettings?: () => void;
  onToggleRunMenu?: () => void;
  onToggleCheckpoints?: () => void;
  onToggleSandbox?: () => void;
  onToggleWorkflow?: () => void;
  onToggleSkillsMonitor?: () => void;
  onToggleChat?: () => void;
  onToggleAgents?: () => void;
  onToggleMissions?: () => void;
  onToggleSystemHealth?: () => void;
  onToggleKnowledgeSystem?: () => void;
  onToggleMcp?: () => void;
  onToggleFleet?: () => void;
  onToggleVision?: () => void;
  onToggleScreenShare?: () => void;
  onToggleMode?: () => void;
  onRunCommand?: (command: string) => void;
  onDisconnectAssistant?: () => void;
  onConnectAssistant?: () => void;
  onMuteToggle?: () => void;
  onToggleHelp?: () => void;
  showHelp?: boolean;
  onToggleHistory?: () => void;
  showHistory?: boolean;
  onToggleAutomation?: () => void;
  showAutomation?: boolean;
  onToggleMemory?: () => void;
  showMemory?: boolean;
}

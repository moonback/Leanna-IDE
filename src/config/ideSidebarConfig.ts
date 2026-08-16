/**
 * Configuration externe de la sidebar IDE.
 * Organisée en sous-menus par catégorie pour réduire le nombre d'icônes visibles.
 *
 * Icônes visibles (5 au total) :
 * 1. Explorateur (accès direct — le plus utilisé)
 * 2. Fichiers & Code (sous-menu : Recherche, Terminal, Aperçu)
 * 3. Source & Déploiement (sous-menu : Git, GitHub, Checkpoints, Sandbox, Workflow)
 * 4. Données & Outils (sous-menu : Knowledge, Santé, MCP, Médias)
 * 5. (IA via le menu agent en bas — inchangé)
 */

import {
  Search, SquareTerminal, Frame,
  GitBranch, Camera, Monitor,
  MessageCircle, FolderTree, ChartNoAxesColumnIncreasing, Workflow,
  Cable, ShieldCheck, Container, Bot, Crosshair,
  Activity, Wrench, Code2, Users, BookOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SidebarItemType = 'button' | 'submenu';

export interface SidebarItemConfig {
  id: string;
  type: SidebarItemType;
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  /** Key in the sidebar state that tracks visibility/active status */
  stateKey?: string;
  /** Toggle handler key */
  actionKey?: string;
  /** Show dot indicator when this state key is truthy */
  dotStateKey?: string;
  /** Only show when assistant is connected */
  requiresAssistant?: boolean;
  /** Sub-items for submenu type */
  children?: SidebarItemConfig[];
}

export interface SidebarSectionConfig {
  id: string;
  label?: string;
  items: SidebarItemConfig[];
}

// ─── Configuration ───────────────────────────────────────────────────────────

export const sidebarSections: SidebarSectionConfig[] = [

  // ═══ Explorateur — accès direct (icône toujours visible) ═══
  {
    id: 'explorer',
    label: 'Explorateur',
    items: [
      {
        id: 'explorer',
        type: 'button',
        icon: FolderTree,
        label: 'Explorateur (Ctrl+Shift+E)',
        shortcut: 'Ctrl+Shift+E',
        stateKey: 'showExplorer',
        actionKey: 'onToggleExplorer',
      },
    ],
  },

  // ═══ Code & Exécution — sous-menu regroupant Recherche, Terminal, Aperçu ═══
  {
    id: 'code-exec',
    label: 'Code & Exécution',
    items: [
      {
        id: 'code-tools',
        type: 'submenu',
        icon: Code2,
        label: 'Code & Exécution',
        children: [
          {
            id: 'search',
            type: 'button',
            icon: Search,
            label: 'Recherche (Ctrl+Shift+F)',
            shortcut: 'Ctrl+Shift+F',
            stateKey: 'showGlobalSearch',
            actionKey: 'onToggleSearch',
          },
          {
            id: 'terminal',
            type: 'button',
            icon: SquareTerminal,
            label: 'Terminal (Ctrl+`)',
            shortcut: 'Ctrl+`',
            stateKey: 'showTerminal',
            actionKey: 'onToggleTerminal',
          },
          {
            id: 'preview',
            type: 'button',
            icon: Frame,
            label: 'Aperçu web',
            stateKey: 'showPreview',
            actionKey: 'onTogglePreview',
            dotStateKey: 'previewUrl',
          },
        ],
      },
    ],
  },

  // ═══ Source & Déploiement — sous-menu Git, CI/CD, etc. ═══
  {
    id: 'source-deploy',
    label: 'Source & Déploiement',
    items: [
      {
        id: 'source-menu',
        type: 'submenu',
        icon: GitBranch,
        label: 'Source & Déploiement',
        children: [
          {
            id: 'checkpoints',
            type: 'button',
            icon: ShieldCheck,
            label: 'Checkpoints',
            stateKey: 'showCheckpoints',
            actionKey: 'onToggleCheckpoints',
          },
          {
            id: 'sandbox',
            type: 'button',
            icon: Container,
            label: 'Sandbox',
            stateKey: 'showSandbox',
            actionKey: 'onToggleSandbox',
          },
          {
            id: 'workflow',
            type: 'button',
            icon: Workflow,
            label: 'Workflow (CI/CD)',
            stateKey: 'showWorkflow',
            actionKey: 'onToggleWorkflow',
          },
        ],
      },
    ],
  },

  // ═══ Données & Outils — sous-menu Knowledge, Monitoring, MCP, Médias ═══
  {
    id: 'data-tools',
    label: 'Données & Outils',
    items: [
      {
        id: 'tools-menu',
        type: 'submenu',
        icon: Wrench,
        label: 'Données & Outils',
        children: [
          {
            id: 'knowledge-system',
            type: 'button',
            icon: BookOpen,
            label: 'Knowledge System (Documents & RAG)',
            stateKey: 'showKnowledgeSystem',
            actionKey: 'onToggleKnowledgeSystem',
          },
          {
            id: 'system-health',
            type: 'button',
            icon: Activity,
            label: 'Santé système',
            stateKey: 'showSystemHealth',
            actionKey: 'onToggleSystemHealth',
          },
          {
            id: 'mcp',
            type: 'button',
            icon: Cable,
            label: 'Serveurs MCP (outils externes)',
            stateKey: 'showMcp',
            actionKey: 'onToggleMcp',
          },
          {
            id: 'vision',
            type: 'button',
            icon: Camera,
            label: 'Caméra (Vision)',
            stateKey: 'visionEnabled',
            actionKey: 'onToggleVision',
            requiresAssistant: true,
          },
          {
            id: 'screen-share',
            type: 'button',
            icon: Monitor,
            label: "Partage d'écran",
            stateKey: 'screenShareEnabled',
            actionKey: 'onToggleScreenShare',
            requiresAssistant: true,
          },
        ],
      },
    ],
  },

  // ═══ IA & Agent — items exposés via le flyout du status agent ═══
  {
    id: 'ai-agent',
    label: 'Intelligence Artificielle',
    items: [
      {
        id: 'chat',
        type: 'button',
        icon: MessageCircle,
        label: 'Chat IA (Ctrl+L)',
        shortcut: 'Ctrl+L',
        stateKey: 'showChat',
        actionKey: 'onToggleChat',
        requiresAssistant: true,
      },
      {
        id: 'agents',
        type: 'button',
        icon: Bot,
        label: 'Agents multi-rôles',
        stateKey: 'showAgents',
        actionKey: 'onToggleAgents',
        requiresAssistant: true,
      },
      {
        id: 'fleet',
        type: 'button',
        icon: Users,
        label: "Flotte d'agents autonomes",
        stateKey: 'showFleet',
        actionKey: 'onToggleFleet',
        requiresAssistant: true,
      },
      {
        id: 'missions',
        type: 'button',
        icon: Crosshair,
        label: 'Missions autonomes',
        stateKey: 'showMissions',
        actionKey: 'onToggleMissions',
        requiresAssistant: true,
      },
      {
        id: 'skills-monitor',
        type: 'button',
        icon: ChartNoAxesColumnIncreasing,
        label: "Suivi de l'Agent",
        stateKey: 'showSkillsMonitor',
        actionKey: 'onToggleSkillsMonitor',
        requiresAssistant: true,
      },
    ],
  },
];

// ─── Run Commands ────────────────────────────────────────────────────────────

export const runCommands = [
  { label: 'npm run dev', cmd: 'npm run dev' },
  { label: 'npm install', cmd: 'npm install' },
  { label: 'npm run build', cmd: 'npm run build' },
  { label: 'npm run desktop', cmd: 'npm run desktop' },
  { label: 'npm test', cmd: 'npm test' },
];

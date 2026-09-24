/**
 * Tool-Agent Mapper
 * 
 * Ce module fournit un mapping dynamique entre les outils (tools) et les agents,
 * basé sur les capabilities définies dans les rôles d'agents.
 * 
 * Il remplace le mapping statique TOOL_TO_AGENT de agentActivityStore.ts
 * par une approche basée sur les définitions centralisées dans roles.ts.
 */

import { getAgentDefinition, listAgentDefinitions } from './roles.js';
import type { AgentRole } from './types.js';

/**
 * Rôle neutre pour les outils exécutables non rattachés à un agent spécialisé.
 * Doit rester synchronisé avec `UNATTRIBUTED_ROLE` côté renderer
 * (src/stores/agentActivityStore.ts). Ne JAMAIS retomber sur 'writer' : cela
 * attribue faussement des primitives système (browser, telegram, exec…) au
 * Rédacteur et corrompt la télémétrie agentique.
 */
export const UNATTRIBUTED_ROLE: AgentRole = 'system';

// ═══════════════════════════════════════════════════════════════════════════════
// Cache pour le mapping outil → rôle(s)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mapping dynamique outil → rôle(s) d'agent(s)
 * Généré à partir des capabilities des agents définis dans roles.ts
 */
let toolToAgentsCache: Map<string, AgentRole[]> = new Map();

/**
 * Mapping outil → rôle principal (pour compatibilité avec l'ancien système)
 * Chaque outil est associé au premier rôle d'agent qui le supporte
 */
let toolToPrimaryAgentCache: Map<string, AgentRole> = new Map();

/**
 * Indique si le cache a été initialisé
 */
let isInitialized = false;

// ═══════════════════════════════════════════════════════════════════════════════
// Catégories d'outils pour classification sémantique
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Catégories d'outils pour une classification sémantique.
 * Chaque catégorie regroupe des outils similaires et est associée à des rôles d'agents typiques.
 * 
 * Ces catégories sont utilisées pour :
 * 1. L'auto-complétion et la découverte d'outils
 * 2. Le routing intelligent des requêtes
 * 3. La spécialisation des agents
 */
export const TOOL_CATEGORIES: Record<string, { 
  label: string; 
  description: string; 
  typicalRoles: AgentRole[]; 
  keywords: string[]; 
}> = {
  // Catégories Code & Ingénierie
  file_operations: {
    label: 'Opérations sur fichiers',
    description: 'Lecture, écriture, modification et gestion de fichiers projet',
    typicalRoles: ['coder', 'refactor', 'debugger', 'writer', 'formatter', 'architect'],
    keywords: ['file', 'fichier', 'read', 'write', 'modify', 'patch', 'create', 'delete', 'rename'],
  },
  code_analysis: {
    label: 'Analyse de code',
    description: 'Analyse statique, vérification de syntaxe et de types',
    typicalRoles: ['reviewer', 'security', 'architect', 'debugger'],
    keywords: ['analyze', 'verify', 'lint', 'typecheck', 'check', 'review', 'audit'],
  },
  code_search: {
    label: 'Recherche dans le code',
    description: 'Recherche de motifs, navigation dans la codebase',
    typicalRoles: ['researcher', 'debugger', 'reviewer', 'architect'],
    keywords: ['search', 'find', 'grep', 'locate', 'explore', 'navigate'],
  },
  version_control: {
    label: 'Contrôle de version',
    description: 'Opérations Git et gestion de versions',
    typicalRoles: ['coder', 'writer'],
    keywords: ['git', 'commit', 'push', 'pull', 'branch', 'merge', 'diff', 'status'],
  },
  
  // Catégories Connaissance & Mémoire
  knowledge: {
    label: 'Connaissance et mémoire projet',
    description: 'Gestion de la mémoire persistante et analyse d\'impact',
    typicalRoles: ['researcher', 'planner', 'architect', 'coder'],
    keywords: ['knowledge', 'memory', 'context', 'impact', 'semantic', 'entity', 'graph'],
  },
  
  // Catégories Qualité & Tests
  testing: {
    label: 'Tests et validation',
    description: 'Exécution de tests et validation de qualité',
    typicalRoles: ['tester', 'reviewer', 'security', 'debugger'],
    keywords: ['test', 'verify', 'validate', 'lint', 'build', 'compile', 'check'],
  },
  
  // Catégories Rédaction & Documentation
  documentation: {
    label: 'Rédaction et documentation',
    description: 'Création et modification de documents',
    typicalRoles: ['writer', 'formatter', 'proofreader', 'translator', 'summarizer'],
    keywords: ['write', 'document', 'format', 'proofread', 'translate', 'summarize'],
  },
  
  // Catégories Recherche & Analyse
  research: {
    label: 'Recherche et analyse',
    description: 'Collecte d\'informations et analyse technique',
    typicalRoles: ['researcher', 'architect', 'planner'],
    keywords: ['research', 'analyze', 'collect', 'synthesize', 'understand', 'impact'],
  },
  
  // Catégories Planification & Orchestration
  planning: {
    label: 'Planification et orchestration',
    description: 'Création de plans et orchestration multi-agents',
    typicalRoles: ['planner', 'architect'],
    keywords: ['plan', 'orchestrate', 'delegate', 'mission', 'task', 'strategy'],
  },
  
  // Catégories Système & Automatisation
  system: {
    label: 'Opérations système',
    description: 'Exécution de commandes système et notifications',
    typicalRoles: ['coder', 'writer'],
    keywords: ['system', 'execute', 'command', 'notify', 'open', 'process'],
  },
  
  // Catégories Automatisation & Vision
  automation: {
    label: 'Automatisation et interaction',
    description: 'Navigation web, capture d\'écran et interaction automatisée',
    typicalRoles: ['researcher', 'vision'],
    keywords: ['automation', 'browser', 'navigate', 'click', 'screenshot', 'inspect', 'extract'],
  },
  vision: {
    label: 'Analyse visuelle',
    description: 'Analyse de captures d\'écran et perception visuelle',
    typicalRoles: ['vision'],
    keywords: ['vision', 'screenshot', 'analyze', 'visual', 'image', 'detect', 'perceive'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Initialisation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialise le mapping outil → agent à partir des définitions d'agents.
 * Doit être appelé au démarrage de l'application.
 */
export function initializeToolAgentMapper(): void {
  if (isInitialized) return;
  
  const agents = listAgentDefinitions();
  
  // Réinitialiser les caches
  toolToAgentsCache = new Map();
  toolToPrimaryAgentCache = new Map();
  
  // Pour chaque agent, enregistrer ses capabilities
  for (const agent of agents) {
    const role = agent.role;
    
    for (const capability of agent.capabilities) {
      // Ajouter le rôle à la liste des agents capables d'utiliser cet outil
      if (!toolToAgentsCache.has(capability)) {
        toolToAgentsCache.set(capability, []);
      }
      
      const rolesForTool = toolToAgentsCache.get(capability)!;
      
      // Éviter les doublons
      if (!rolesForTool.includes(role)) {
        rolesForTool.push(role);
      }
      
      // Si c'est le premier rôle pour cet outil, le définir comme rôle principal
      if (!toolToPrimaryAgentCache.has(capability)) {
        toolToPrimaryAgentCache.set(capability, role);
      }
    }
  }
  
  isInitialized = true;
  console.log(`[ToolAgentMapper] Mapping initialisé: ${toolToAgentsCache.size} outils mappés vers ${agents.length} agents`);
}

/**
 * Obtient tous les rôles d'agents capables d'utiliser un outil donné.
 * 
 * @param tool - Le nom de l'outil
 * @returns Tableau des rôles d'agents (peut être vide si l'outil n'est pas trouvé)
 */
export function getAgentsForTool(tool: string): AgentRole[] {
  if (!isInitialized) {
    initializeToolAgentMapper();
  }
  
  return toolToAgentsCache.get(tool) || [];
}

/**
 * Obtient le rôle d'agent principal pour un outil donné.
 * Utilisé pour la compatibilité avec le système existant.
 * 
 * @param tool - Le nom de l'outil
 * @returns Le rôle principal, ou le rôle neutre `UNATTRIBUTED_ROLE` en fallback
 */
export function getPrimaryAgentForTool(tool: string): AgentRole {
  if (!isInitialized) {
    initializeToolAgentMapper();
  }
  
  return toolToPrimaryAgentCache.get(tool) || UNATTRIBUTED_ROLE;
}

/**
 * Vérifie si un rôle d'agent peut utiliser un outil donné.
 * 
 * @param role - Le rôle de l'agent
 * @param tool - Le nom de l'outil
 * @returns true si l'agent peut utiliser l'outil
 */
export function canAgentUseTool(role: AgentRole, tool: string): boolean {
  const definition = getAgentDefinition(role);
  if (!definition) return false;
  
  return definition.capabilities.includes(tool);
}

/**
 * Obtient la catégorie d'un outil à partir de son nom.
 * 
 * @param tool - Le nom de l'outil
 * @returns La catégorie correspondante ou undefined
 */
export function getToolCategory(tool: string): string | undefined {
  for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
    if (config.keywords.some(keyword => tool.toLowerCase().includes(keyword.toLowerCase()))) {
      return category;
    }
  }
  return undefined;
}

/**
 * Obtient toutes les catégories disponibles.
 */
export function getAllToolCategories(): typeof TOOL_CATEGORIES {
  return { ...TOOL_CATEGORIES };
}

/**
 * Obtient tous les outils disponibles pour un rôle d'agent donné.
 * 
 * @param role - Le rôle de l'agent
 * @returns Tableau des outils disponibles
 */
export function getToolsForAgent(role: AgentRole): string[] {
  const definition = getAgentDefinition(role);
  return definition ? [...definition.capabilities] : [];
}

/**
 * Obtient les rôles d'agents recommandés pour une catégorie d'outil donnée.
 * 
 * @param category - La catégorie d'outil
 * @returns Tableau des rôles d'agents recommandés
 */
export function getRecommendedRolesForCategory(category: string): AgentRole[] {
  const config = TOOL_CATEGORIES[category];
  return config ? [...config.typicalRoles] : [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

export {
  toolToAgentsCache,
  toolToPrimaryAgentCache,
  isInitialized,
};

/**
 * SkillAdapter — Convertit les Skills legacy en ToolDefinitions
 * 
 * Ce module est le cœur de la Phase 2 de la migration.
 * Il permet d'utiliser toutes les skills existantes dans le nouveau ToolRegistry
 * sans modifier les fichiers de skills.
 * 
 * Flux :
 *   Skill existante (server/skills/*.ts)
 *     ↓ adaptSkill()
 *   ToolDefinition[] 
 *     ↓ ToolRegistry.registerAll()
 *   Nouveau runtime
 */

import type { ToolDefinition, ToolDeclaration } from "../types";

// ═══════════════════════════════════════════════════════════════════════════════
// Interface Legacy Skill (contractuelle, pas d'import depuis l'ancien code)
// ═══════════════════════════════════════════════════════════════════════════════

export interface LegacySkillDeclaration {
  name: string;
  description: string;
  parameters?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface LegacySkill {
  name: string;
  declarations: LegacySkillDeclaration[];
  handleToolCall: (name: string, args: any, context?: any) => Promise<any> | any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Skill → ToolDefinition conversion
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convertit une skill legacy en une liste de ToolDefinitions pour le ToolRegistry.
 * 
 * @param skill - L'instance de skill legacy
 * @param options - Options de conversion
 * @returns Les ToolDefinitions correspondantes
 */
export function adaptSkill(skill: LegacySkill, options: AdaptOptions = {}): ToolDefinition[] {
  return skill.declarations.map((decl) => adaptDeclaration(skill, decl, options));
}

/**
 * Convertit une seule déclaration en ToolDefinition.
 */
function adaptDeclaration(
  skill: LegacySkill,
  decl: LegacySkillDeclaration,
  options: AdaptOptions
): ToolDefinition {
  const declaration: ToolDeclaration = {
    name: decl.name,
    description: decl.description,
    parameters: decl.parameters ?? {},
  };

  return {
    declaration,
    handler: async (args: Record<string, unknown>) => {
      return skill.handleToolCall(decl.name, args, options.context);
    },
    category: options.category ?? skill.name,
    timeoutMs: options.timeoutMs ?? 30_000,
    permissions: options.permissions ?? inferPermissions(decl.name, skill.name),
  };
}

/**
 * Déduit les permissions d'un outil à partir de son nom et de sa catégorie.
 */
function inferPermissions(toolName: string, skillName: string): ToolDefinition["permissions"] {
  const name = toolName.toLowerCase();
  const permissions: ToolDefinition["permissions"] = [];

  // Lecture
  if (name.includes("read") || name.includes("list") || name.includes("get") || name.includes("search") || name.includes("outline")) {
    permissions.push("read");
  }

  // Écriture
  if (name.includes("write") || name.includes("patch") || name.includes("modify") || name.includes("create") || name.includes("delete") || name.includes("update")) {
    permissions.push("write");
  }

  // Exécution
  if (name.includes("run") || name.includes("exec") || name.includes("command")) {
    permissions.push("execute");
  }

  // Réseau
  if (skillName === "github" || skillName === "weather" || name.includes("navigate") || name.includes("fetch")) {
    permissions.push("network");
  }

  // Dangereux
  if (name.includes("delete") || name.includes("remove") || name.includes("drop")) {
    permissions.push("dangerous");
  }

  // Si aucune permission détectée, au minimum "read"
  if (permissions.length === 0) {
    permissions.push("read");
  }

  return permissions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Batch adapter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convertit un ensemble de skills legacy en ToolDefinitions.
 * Utile pour la migration en masse au démarrage.
 */
export function adaptAllSkills(
  skills: LegacySkill[],
  options: AdaptOptions = {}
): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];
  const seen = new Set<string>();

  for (const skill of skills) {
    const adapted = adaptSkill(skill, { ...options, category: skill.name });
    for (const def of adapted) {
      // Déduplication par nom d'outil
      if (!seen.has(def.declaration.name)) {
        seen.add(def.declaration.name);
        definitions.push(def);
      }
    }
  }

  return definitions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reverse adapter (ToolRegistry → SkillManager handleToolCall interface)
// ═══════════════════════════════════════════════════════════════════════════════

import type { ToolRegistry } from "../ToolRegistry";

/**
 * Crée une fonction handleToolCall compatible avec l'ancien SkillManager
 * mais qui route les appels vers le nouveau ToolRegistry.
 * 
 * Cela permet aux composants qui dépendent de `handleToolCall(name, args)`
 * de fonctionner sans modification pendant la transition.
 */
export function createToolCallProxy(registry: ToolRegistry): (name: string, args: any) => Promise<any> {
  return async (name: string, args: any) => {
    // Normalisation du nom (même logique que l'ancien SkillManager)
    let normalizedName = name;
    if (name.includes(':')) {
      normalizedName = name.split(':').pop()!;
    }

    return registry.call(normalizedName, args ?? {});
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdaptOptions {
  /** Catégorie à assigner (sinon: skill.name) */
  category?: string;
  /** Timeout par défaut pour les handlers */
  timeoutMs?: number;
  /** Permissions override */
  permissions?: ToolDefinition["permissions"];
  /** Contexte à passer aux handlers */
  context?: any;
}

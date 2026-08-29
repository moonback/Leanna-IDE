/**
 * SkillManagerV2 — Remplacement simplifié du SkillManager
 * 
 * Réduit 957 lignes à ~200 en déléguant au ToolRegistry.
 * Conserve l'interface publique exacte pour la compatibilité avec:
 *   - server.ts (handleToolCall, getToolDeclarations, getRelevantToolDeclarations)
 *   - AgentOrchestrator (setSkillHandler)
 *   - Workflow Engine (setWorkflowSkillHandler)
 *   - Mission System (initMissionSystem)
 * 
 * Différences avec l'ancien SkillManager:
 *   - Plus de lazy loading complexe (tout enregistré au démarrage via ToolRegistry)
 *   - Plus de scoring par keywords (le LLM choisit ses outils)
 *   - Plus de self-healing (séparé dans son propre module si nécessaire)
 *   - Plus de 5 systèmes d'initialisation chaînés
 */

import { ToolRegistry } from "../ToolRegistry";
import { EventBus } from "../EventBus";
import { adaptSkill, adaptAllSkills, createToolCallProxy } from "./SkillAdapter";
import type { LegacySkill } from "./SkillAdapter";
import type { ToolCallMetrics } from "../types";

// ═══════════════════════════════════════════════════════════════════════════════
// SkillManagerV2
// ═══════════════════════════════════════════════════════════════════════════════

export class SkillManagerV2 {
  private registry: ToolRegistry;
  private eventBus: EventBus;
  private skills: LegacySkill[] = [];
  // private initialized = false;

  constructor(config?: { eventBus?: EventBus; registry?: ToolRegistry }) {
    this.eventBus = config?.eventBus ?? new EventBus();
    this.registry = config?.registry ?? new ToolRegistry({
      enableMetrics: true,
      eventBus: this.eventBus,
      defaultTimeoutMs: 30_000,
    });
  }

  // ─── Initialisation ────────────────────────────────────────────────────────

  /**
   * Enregistre une skill legacy dans le nouveau système.
   * Convertit ses déclarations en ToolDefinitions et les enregistre dans le ToolRegistry.
   */
  registerSkill(skill: LegacySkill): void {
    // Éviter les doublons
    if (this.skills.some((s) => s.name === skill.name)) {
      // Remplacer
      this.skills = this.skills.filter((s) => s.name !== skill.name);
      // Unregister les anciens outils de cette skill
      for (const decl of skill.declarations) {
        this.registry.unregister(decl.name);
      }
    }

    this.skills.push(skill);
    const definitions = adaptSkill(skill);
    this.registry.registerAll(definitions);
  }

  /**
   * Enregistre toutes les skills d'un coup (démarrage).
   */
  registerAllSkills(skills: LegacySkill[]): void {
    const definitions = adaptAllSkills(skills);
    this.registry.registerAll(definitions);
    this.skills = [...skills];

    console.log(
      `[SkillManagerV2] ${definitions.length} outil(s) enregistrés depuis ${skills.length} skill(s): ${skills.map((s) => s.name).join(", ")}`
    );
  }

  // ─── Interface publique (compatible SkillManager v1) ───────────────────────

  /**
   * Appelle un outil par son nom.
   * Interface identique à l'ancien SkillManager.handleToolCall().
   */
  async handleToolCall(name: string, args: any, _context?: any): Promise<any> {
    // Normalisation du nom (compatibilité Gemini qui préfixe)
    let normalizedName = name;
    if (name.includes(":")) {
      normalizedName = name.split(":").pop()!;
    } else if (!this.registry.has(name)) {
      // Tenter de détecter un préfixe de skill
      for (const skill of this.skills) {
        const prefix = skill.name + "_";
        if (name.startsWith(prefix)) {
          const stripped = name.slice(prefix.length);
          if (this.registry.has(stripped)) {
            normalizedName = stripped;
            break;
          }
        }
      }
    }

    return this.registry.call(normalizedName, args ?? {});
  }

  /**
   * Retourne toutes les déclarations d'outils.
   * Compatible avec l'interface de l'ancien SkillManager.
   */
  getToolDeclarations(enabledSkillIds?: string[]): any[] {
    if (!enabledSkillIds) {
      return this.registry.getDeclarations();
    }

    // Filtrer par catégorie (= skill name dans notre mapping)
    return enabledSkillIds.flatMap((id) => this.registry.getDeclarationsByCategory(id));
  }

  /**
   * Version simplifiée de getRelevantToolDeclarations.
   * 
   * Dans le nouveau système, on ne fait plus de scoring par keywords.
   * Le LLM est assez intelligent pour choisir les bons outils.
   * On retourne simplement toutes les déclarations.
   * 
   * Si on veut optimiser les tokens, on peut filtrer par catégorie.
   */
  getRelevantToolDeclarations(_query: string, enabledSkillIds?: string[]): {
    declarations: any[];
    scoredSkills: { name: string; score: number }[];
    alwaysLoaded: string[];
    dynamicallyLoaded: string[];
  } {
    const declarations = this.getToolDeclarations(enabledSkillIds);
    return {
      declarations,
      scoredSkills: this.skills.map((s) => ({ name: s.name, score: 10 })),
      alwaysLoaded: this.skills.map((s) => s.name),
      dynamicallyLoaded: [],
    };
  }

  // ─── Accès au ToolRegistry ─────────────────────────────────────────────────

  /**
   * Retourne le ToolRegistry interne (pour l'injection dans le runtime).
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * Retourne l'EventBus interne.
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Crée un handler compatible avec l'ancien interface.
   * Utile pour les composants qui attendent (name, args) => Promise<any>.
   */
  createHandler(): (name: string, args: any) => Promise<any> {
    return createToolCallProxy(this.registry);
  }

  // ─── Métriques ─────────────────────────────────────────────────────────────

  /**
   * Retourne les métriques par outil.
   */
  getMetrics(): Record<string, { calls: number; failures: number; avgMs: number }> {
    return this.registry.getToolMetrics();
  }

  /**
   * Retourne l'historique des appels.
   */
  getCallHistory(limit = 50): ToolCallMetrics[] {
    return this.registry.getCallHistory(limit);
  }

  /**
   * Nombre total d'outils enregistrés.
   */
  get toolCount(): number {
    return this.registry.size;
  }

  /**
   * Vérifie si un outil existe.
   */
  hasTool(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Liste les catégories (= noms de skills).
   */
  getCategories(): string[] {
    return this.registry.getCategories();
  }
}

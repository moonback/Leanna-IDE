/**
 * SystemPromptBuilder — Construit le prompt système depuis le PromptRegistry
 * 
 * Remplace les 12 fichiers de l'ancien système (buildSystemInstruction + 11 modules)
 * par un seul builder qui compose les sections depuis le registry.
 * 
 * Avantages :
 * - Un seul fichier à maintenir
 * - Sections activées/désactivées dynamiquement
 * - Variables injectées uniformément
 * - Mode compact automatique
 * - Extensible sans modification du builder
 */

import { PromptRegistry } from "../PromptRegistry";
import { loadPromptTemplates } from "./loader";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname_compat = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SystemPromptConfig {
  /** Nom de l'assistant */
  aiName?: string;
  /** Nom de l'utilisateur */
  userName?: string;
  /** Rôle de l'utilisateur */
  userRole?: string;
  /** Langue de réponse */
  language?: "fr" | "en" | "es" | "de" | "pt";
  /** Style de réponse */
  responseStyle?: "concise" | "balanced" | "detailed";
  /** Mode compact (économie de tokens) */
  compact?: boolean;
  /** Mode de session : 'full' (agent) ou 'ask' (chat/Q&A documentaire) */
  mode?: "full" | "ask";
  /** Configuration des agents (enabled/disabled + rôles autorisés) */
  agents?: { enabled: boolean; allowedRoles?: string[] };
  /** Sections à exclure du prompt */
  excludeSections?: string[];
  /** Sections additionnelles à inclure */
  extraSections?: Array<{ id: string; content: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════════════════════

export class SystemPromptBuilder {
  private registry: PromptRegistry;
  private loaded = false;

  constructor(registry?: PromptRegistry) {
    this.registry = registry ?? new PromptRegistry();
  }

  /**
   * Charge les templates depuis les fichiers .md.
   * Appeler une seule fois au démarrage.
   */
  loadTemplates(promptsDir?: string): void {
    const dir = promptsDir ?? __dirname_compat;
    loadPromptTemplates(this.registry, dir);
    this.loaded = true;
  }

  /**
   * Construit le prompt système complet.
   */
  build(config: SystemPromptConfig = {}): string {
    if (!this.loaded) {
      this.loadTemplates();
    }

    const variables: Record<string, string> = {
      aiName: config.aiName ?? "Jarvis",
      userName: config.userName ?? "",
      userRole: config.userRole ?? "",
    };

    const renderOpts = {
      variables,
      compact: config.compact,
      exclude: config.excludeSections,
    };

    const isAskMode = config.mode === "ask";

    // Assembler les sections dans l'ordre
    const sections: string[] = [];

    if (isAskMode) {
      // ── Mode Chat/Ask : prompt optimisé pour le Q&A documentaire ──

      // 1. Chat prompt (analyse documentaire, Q&A contextuel)
      if (this.registry.has("chat")) {
        sections.push(this.registry.render("chat", renderOpts));
      }

      // 2. Sécurité (toujours présente)
      if (this.registry.has("safety")) {
        sections.push(this.registry.render("safety", renderOpts));
      }

      // 3. Efficacité des outils (lecture seule en ask mode)
      if (this.registry.has("efficiency")) {
        sections.push(this.registry.render("efficiency", renderOpts));
      }

    } else {
      // ── Mode Full : prompt agent complet ──

      // 1. Base (identité, processus de réflexion, communication)
      if (this.registry.has("base")) {
        sections.push(this.registry.render("base", renderOpts));
      }

      // 2. Autonomie (boucle de contrôle)
      if (this.registry.has("autonomy")) {
        sections.push(this.registry.render("autonomy", renderOpts));
      }

      // 3. Efficacité des outils
      if (this.registry.has("efficiency")) {
        sections.push(this.registry.render("efficiency", renderOpts));
      }

      // 4. Sécurité
      if (this.registry.has("safety")) {
        sections.push(this.registry.render("safety", renderOpts));
      }

      // 5. Système multi-agents (conditionnel selon config.agents)
      const agentsEnabled = config.agents?.enabled !== false; // activé par défaut
      if (agentsEnabled && this.registry.has("agents-system")) {
        const allowedRoles = config.agents?.allowedRoles;
        if (allowedRoles && allowedRoles.length > 0) {
          // Injecter un prompt agents filtré avec seulement les rôles autorisés
          sections.push(this.buildFilteredAgentsPrompt(allowedRoles, renderOpts));
        } else {
          // Tous les agents actifs
          sections.push(this.registry.render("agents-system", renderOpts));
        }
      } else if (!agentsEnabled) {
        // Agents désactivés : l'assistant agit seul, peut écrire directement
        sections.push(this.buildSoloModePrompt());
      }

      // 6. Directives AI Studio Build (comportement, technique, conception)
      if (this.registry.has("ai-studio-directives")) {
        sections.push(this.registry.render("ai-studio-directives", renderOpts));
      }
    }

    // 7. Sections additionnelles (extensibilité) — les deux modes
    if (config.extraSections) {
      for (const section of config.extraSections) {
        sections.push(section.content);
      }
    }

    // 8. Instructions de langue et style
    const footer = this.buildFooter(config);
    if (footer) sections.push(footer);

    return sections.filter(Boolean).join("\n\n");
  }

  /**
   * Retourne le registry pour enregistrer des templates additionnels.
   */
  getRegistry(): PromptRegistry {
    return this.registry;
  }

  // ─── Privé ───────────────────────────────────────────────────────────────

  /**
   * Construit un prompt agents filtré avec uniquement les rôles autorisés.
   */
  private buildFilteredAgentsPrompt(allowedRoles: string[], _renderOpts: any): string {
    const ALL_ROLES: Record<string, { description: string; write: boolean }> = {
      coder:     { description: "Modifications de fichiers demandées par l'utilisateur", write: true },
      test:      { description: "Tests unitaires, d'intégration et E2E", write: true },
      docs:      { description: "Documentation technique", write: true },
      refactor:  { description: "Refactoring (pas de changement de comportement)", write: true },
      security:  { description: "Audit de sécurité", write: false },
      review:    { description: "Revue de code", write: false },
      architect: { description: "Architecture et coordination", write: false },
    };

    const lines: string[] = [];
    lines.push("# Système Multi-Agents (restreint)");
    lines.push("");
    lines.push("Tu fais partie du système multi-agents Jarvis-OS.");
    lines.push(`**Agents activés :** ${allowedRoles.join(", ")}`);
    lines.push("");

    // Si coder est actif, garder la règle de délégation obligatoire
    if (allowedRoles.includes("coder")) {
      lines.push("## ⚠️ RÈGLE — MODIFICATIONS DE FICHIERS");
      lines.push("");
      lines.push("Toute modification de code DOIT être déléguée à l'agent `coder` via `agent_delegate`.");
      lines.push("Tu ne dois JAMAIS appeler `write_project_file`, `modify_project_file` ou `patch_project_file` directement.");
      lines.push("");
    }

    lines.push("## Agents disponibles");
    lines.push("");
    lines.push("| Rôle | Description | Écriture |");
    lines.push("|------|-------------|----------|");
    for (const role of allowedRoles) {
      const info = ALL_ROLES[role];
      if (info) {
        const writeCol = info.write ? "✅ OUI" : "❌ Lecture seule";
        lines.push(`| **${role}** | ${info.description} | ${writeCol} |`);
      }
    }
    lines.push("");
    lines.push(`**Agents NON disponibles :** les rôles non listés ci-dessus sont désactivés. Ne tente pas de déléguer à un agent non autorisé.`);

    return lines.join("\n");
  }

  /**
   * Prompt pour le mode solo (agents désactivés) : l'assistant peut agir directement.
   */
  private buildSoloModePrompt(): string {
    return [
      "# Mode Solo — Agents désactivés",
      "",
      "Le système multi-agents est **désactivé**. Tu agis seul.",
      "",
      "## Règles en mode solo",
      "",
      "1. **Tu peux modifier les fichiers directement** via `write_project_file`, `modify_project_file` ou `patch_project_file`",
      "2. **Pas de délégation** — `agent_delegate` et `agent_orchestrate` ne sont pas disponibles",
      "3. **Vérification obligatoire** — Après chaque modification, vérifie le résultat avec `verify_file`",
      "4. **Checkpoint git** — Avant une modification non triviale, crée un commit pour rollback",
      "5. **Lecture ciblée** — `read_file_outline` d'abord, puis lignes pertinentes uniquement",
      "",
      "## Processus d'exécution",
      "",
      "```",
      "Lire le fichier → Comprendre le contexte → Modifier → Vérifier → Confirmer à l'utilisateur",
      "```",
    ].join("\n");
  }

  private buildFooter(config: SystemPromptConfig): string {
    const parts: string[] = [];

    if (config.language && config.language !== "fr") {
      const langMap: Record<string, string> = {
        en: "Respond exclusively in English.",
        es: "Respond exclusively in Spanish.",
        de: "Respond exclusively in German.",
        pt: "Respond exclusively in Portuguese.",
      };
      if (langMap[config.language]) parts.push(langMap[config.language]);
    }

    if (config.responseStyle) {
      const styleMap: Record<string, string> = {
        concise: "Sois ultra-concis. 1 à 3 phrases sauf demande explicite.",
        balanced: "Adapte la longueur à la complexité.",
        detailed: "Réponses détaillées et structurées avec listes et exemples.",
      };
      if (styleMap[config.responseStyle]) parts.push(styleMap[config.responseStyle]);
    }

    return parts.length > 0 ? `## Instructions de communication\n\n${parts.join("\n")}` : "";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton pour usage simple
// ═══════════════════════════════════════════════════════════════════════════════

let _builder: SystemPromptBuilder | null = null;

/**
 * Retourne le builder singleton (lazy-init).
 */
export function getSystemPromptBuilder(): SystemPromptBuilder {
  if (!_builder) {
    _builder = new SystemPromptBuilder();
    _builder.loadTemplates();
  }
  return _builder;
}

/**
 * Construit le prompt système avec la config par défaut.
 * Drop-in replacement pour l'ancien buildSystemInstruction().
 */
export function buildSystemInstructionV3(config: SystemPromptConfig = {}): string {
  return getSystemPromptBuilder().build(config);
}

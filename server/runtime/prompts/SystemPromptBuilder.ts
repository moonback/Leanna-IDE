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
    const ALL_ROLES: Record<string, { description: string; write: boolean; category: string }> = {
      // Code & Ingénierie logicielle
      coder:       { description: "Implémentation de fonctionnalités, écriture et modification de code propre", write: true, category: "Code" },
      refactor:    { description: "Restructuration, Clean Code, réduction de dette technique et découpage", write: true, category: "Code" },
      debugger:    { description: "Diagnostic d'erreurs/stacktraces, root-cause et patches correctifs ciblés", write: true, category: "Code" },
      reviewer:    { description: "Revue de code, audit de qualité, détection d'anti-patterns et standards", write: false, category: "Code" },
      tester:      { description: "Conception et écriture de tests automatisés (unitaires, intégration)", write: true, category: "Code" },
      security:    { description: "Audit de sécurité applicative, vulnérabilités OWASP et secrets", write: false, category: "Code" },
      architect:   { description: "Conception logicielle, modélisation de données, contrats et modules", write: true, category: "Code" },
      // Rédaction & Documentation
      writer:      { description: "Rédaction de documents (README, guides, articles, rapports)", write: true, category: "Docs" },
      formatter:   { description: "Mise en forme et formatage Markdown", write: true, category: "Docs" },
      researcher:  { description: "Recherche et collecte d'informations", write: false, category: "Docs" },
      proofreader: { description: "Correction orthographique, grammaticale et stylistique", write: true, category: "Docs" },
      translator:  { description: "Traduction et localisation multilingue", write: true, category: "Docs" },
      summarizer:  { description: "Résumés et synthèses condensées", write: true, category: "Docs" },
      planner:     { description: "Plans et structures de documents", write: false, category: "Docs" },
    };

    const lines: string[] = [];
    lines.push("# Système Multi-Agents");
    lines.push("");
    lines.push("Tu fais partie du système multi-agents Jarvis-OS, couvrant l'ingénierie de code et la rédaction.");
    lines.push(`**Agents activés :** ${allowedRoles.join(", ")}`);
    lines.push("");

    // Règles de délégation conditionnelles
    lines.push("## ⚠️ RÈGLES DE DÉLÉGATION");
    lines.push("");
    if (allowedRoles.includes("coder")) {
      lines.push("- **Code & Développement :** Délègue l'écriture et les modifications de code à `coder` via `agent_delegate`.");
    }
    if (allowedRoles.includes("refactor")) {
      lines.push("- **Refactoring :** Délègue le Clean Code et le découpage de modules à `refactor`.");
    }
    if (allowedRoles.includes("debugger")) {
      lines.push("- **Débogage :** Délègue la résolution d'erreurs et de stacktraces à `debugger`.");
    }
    if (allowedRoles.includes("writer")) {
      lines.push("- **Rédaction :** Délègue la rédaction de documents à `writer`.");
    }
    lines.push("");

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

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

import { PromptRegistry } from "../PromptRegistry.js";
import { loadPromptTemplates } from "./loader.js";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  SystemPromptConfig,
  AgentRole,
  AGENT_ROLES_INFO,
  LANG_INSTRUCTIONS_FR,
  STYLE_INSTRUCTIONS_FR,
} from "./types.js";

const __dirname_compat = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

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
      aiName: config.aiName ?? "Leanna",
      userName: config.userName ?? "",
      userRole: config.userRole ?? "",
    };

    const opts = { 
      compact: true,           // Mode compact activé par défaut
      ...config 
    };

    const renderOpts = {
      variables,
      compact: opts.compact,
      exclude: opts.excludeSections,
    };

    const isAskMode = config.mode === "ask";

    // Assembler les sections dans l'ordre
    const sections: string[] = [];

    if (isAskMode) {
      // ── Mode Chat/Ask : prompt optimisé pour le Q&A documentaire ──

      // 1. Sécurité avant toute politique opérationnelle
      if (this.registry.has("safety")) {
        sections.push(this.registry.render("safety", renderOpts));
      }

      // 2. Chat prompt (analyse documentaire, Q&A contextuel)
      if (this.registry.has("chat")) {
        sections.push(this.registry.render("chat", renderOpts));
      }

      // 3. Efficacité des outils (lecture seule en ask mode)
      if (this.registry.has("efficiency")) {
        sections.push(this.registry.render("efficiency", renderOpts));
      }

    } else {
      // ── Mode Full : prompt agent complet ──

      // 1. Identité, périmètre et politique de tâche
      if (this.registry.has("base")) {
        sections.push(this.registry.render("base", renderOpts));
      }

      // 2. Autorité et garde-fous : avant les instructions d'exécution
      if (this.registry.has("safety")) {
        sections.push(this.registry.render("safety", renderOpts));
      }

      // 3. Directives de politique technique et comportementale
      if (this.registry.has("ai-studio-directives")) {
        sections.push(this.registry.render("ai-studio-directives", renderOpts));
      }

      // 4. Politique d'utilisation des outils
      if (this.registry.has("efficiency")) {
        sections.push(this.registry.render("efficiency", renderOpts));
      }

      // 5. Navigateur web intégré (comportement conversationnel)
      if (this.registry.has("browser")) {
        sections.push(this.registry.render("browser", renderOpts));
      }

      // 6. Système multi-agents (conditionnel selon config.agents)
      const agentsEnabled = config.agents?.enabled !== false; // activé par défaut
      if (agentsEnabled && this.registry.has("agents-system")) {
        const allowedRoles = config.agents?.allowedRoles as AgentRole[] | undefined;
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

      // 7. Boucle d'autonomie : après les règles et les capacités disponibles
      if (this.registry.has("autonomy")) {
        sections.push(this.registry.render("autonomy", renderOpts));
      }
    }

    // 7. Contexte du Workspace (projet actif vs mode sans projet)
    sections.push(this.buildWorkspaceSection(config.workspace));

    // 8. Sections additionnelles (extensibilité) — les deux modes
    if (config.extraSections) {
      for (const section of config.extraSections) {
        sections.push(section.content);
      }
    }

    // 9. Instructions de langue et style
    const footer = this.buildFooter(config);
    if (footer) sections.push(footer);

    return sections.filter(Boolean).join("\n\n");
  }

  /**
   * Construit la section d'instructions relative à l'état du workspace.
   */
  private buildWorkspaceSection(workspace?: string): string {
    const trimmed = workspace?.trim();
    if (trimmed) {
      return [
        "## Workspace Projet Actif",
        `Le dossier du projet sur lequel tu travailles actuellement est : \`${trimmed}\`.`,
        "Toutes les opérations de lecture, recherche et modification de fichiers s'appliquent à ce projet.",
      ].join("\n");
    }

    return [
      "## Mode Sans Projet Ouvert",
      "Actuellement, AUCUN workspace (projet de code) n'est ouvert dans Leanna.",
      "- C'est un état normal et prévu : l'utilisateur utilise l'application pour de la discussion générale, du conseil, de l'assistance, de la conception ou de la recherche web.",
      "- Ne tente PAS d'appeler des outils d'inspection ou de manipulation de fichiers de projet (ex: get_workspace_info, list_project_files, read_project_file, search_in_files, etc.) car aucun projet n'est actif.",
      "- Ne signale JAMAIS d'erreur technique de workspace ou de problème d'ouverture de workspace : réponds simplement et directement aux questions de l'utilisateur.",
      "- Si l'utilisateur exprime le souhait de créer un nouveau projet, tu peux lui proposer d'utiliser l'outil `project_scaffold` pour générer un projet React/Vite/Next.js.",
      "- Si l'utilisateur demande à travailler sur du code existant, rappelle-lui gentiment qu'il peut sélectionner son dossier de projet via le sélecteur de workspace dans l'interface.",
    ].join("\n");
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
  private buildFilteredAgentsPrompt(allowedRoles: AgentRole[], _renderOpts: any): string {
    const lines: string[] = [];
    lines.push("# Système Multi-Agents");
    lines.push("");
    lines.push("Tu fais partie du système multi-agents Leanna, couvrant l'ingénierie de code et la rédaction.");
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
      const info = AGENT_ROLES_INFO[role];
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
      "1. **Toutes les modifications sont isolées dans la Sandbox (.Leanna/sandbox)** via `write_project_file`, `modify_project_file` ou `patch_project_file` sans impacter directement le workspace réel",
      "2. **Pas de délégation** — `agent_delegate` et `agent_orchestrate` ne sont pas disponibles",
      "3. **Vérification obligatoire dans la sandbox** — Après chaque modification, vérifie le résultat avec `verify_file`",
      "4. **Checkpoint git** — Avant une modification non triviale, crée un commit pour rollback",
      "5. **Lecture ciblée** — `read_file_outline` d'abord, puis lignes pertinentes uniquement",
      "",
      "## Processus d'exécution",
      "",
      "```",
      "Lire le fichier → Comprendre le contexte → Modifier dans la sandbox → Vérifier → Confirmer à l'utilisateur",
      "```",
    ].join("\n");
  }

  private buildFooter(config: SystemPromptConfig): string {
    const parts: string[] = [];

    if (config.language && config.language !== "fr") {
      const langInstructions = LANG_INSTRUCTIONS_FR[config.language];
      if (langInstructions) parts.push(langInstructions);
    }

    if (config.responseStyle) {
      const styleInstructions = STYLE_INSTRUCTIONS_FR[config.responseStyle];
      if (styleInstructions) parts.push(styleInstructions);
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
 * Source canonique de construction du prompt système.
 */
export function buildSystemPrompt(config: SystemPromptConfig = {}): string {
  return getSystemPromptBuilder().build(config);
}

/** @deprecated Utiliser buildSystemPrompt. */
export function buildSystemInstructionV3(config: SystemPromptConfig = {}): string {
  return buildSystemPrompt(config);
}

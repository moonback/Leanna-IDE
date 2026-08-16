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

      // 5. Système multi-agents
      if (this.registry.has("agents-system")) {
        sections.push(this.registry.render("agents-system", renderOpts));
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

/**
 * Prompt Loader — Charge les fichiers .md dans le PromptRegistry
 * 
 * Automatise la découverte et l'enregistrement des templates de prompts
 * depuis le dossier server/runtime/prompts/*.md
 * 
 * Convention de nommage :
 *   base.md         → id: "base"
 *   autonomy.md     → id: "autonomy"
 *   agents-system.md → id: "agents-system"
 * 
 * Front-matter optionnel (première ligne) :
 *   <!-- extends: base, category: system -->
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { PromptRegistry } from "../PromptRegistry.js";

const __dirname_compat = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// Loader
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Charge tous les fichiers .md du dossier prompts dans le registry.
 */
export function loadPromptTemplates(registry: PromptRegistry, promptsDir?: string): number {
  const dir = promptsDir ?? __dirname_compat;
  let count = 0;

  if (!fs.existsSync(dir)) {
    console.warn(`[PromptLoader] Dossier introuvable: ${dir}`);
    return 0;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const id = file.replace(/\.md$/, "");

      // Extraire le front-matter optionnel (HTML comment en première ligne)
      const meta = parseFrontMatter(content);
      const cleanContent = meta.content;

      registry.registerContent(id, cleanContent, {
        name: id,
        extends: meta.extends,
        category: meta.category ?? "system",
        version: 1,
      });

      count++;
    } catch (err) {
      console.error(`[PromptLoader] Erreur chargement ${file}:`, (err as Error).message);
    }
  }

  return count;
}

/**
 * Construit le prompt système complet à partir du registry.
 * Équivalent simplifié de l'ancien buildSystemInstruction().
 */
export function buildSystemPrompt(
  registry: PromptRegistry,
  profile: { aiName?: string; userName?: string; userRole?: string; compact?: boolean } = {}
): string {
  const variables: Record<string, string> = {
    aiName: profile.aiName ?? "Leanna",
    userName: profile.userName ?? "",
    userRole: profile.userRole ?? "",
  };

  const sections: string[] = [];

  // Base prompt
  if (registry.has("base")) {
    sections.push(registry.render("base", { variables, compact: profile.compact }));
  }

  // Autonomy engine
  if (registry.has("autonomy")) {
    sections.push(registry.render("autonomy", { compact: profile.compact }));
  }

  // Agent system (si agents actifs)
  if (registry.has("agents-system")) {
    sections.push(registry.render("agents-system", { compact: profile.compact }));
  }

  return sections.filter(Boolean).join("\n\n---\n\n");
}

// ─── Front-matter parser ──────────────────────────────────────────────────────

interface FrontMatter {
  content: string;
  extends?: string;
  category?: string;
}

function parseFrontMatter(raw: string): FrontMatter {
  const lines = raw.split("\n");
  const firstLine = lines[0]?.trim();

  // Format: <!-- extends: base, category: system -->
  if (firstLine?.startsWith("<!--") && firstLine.endsWith("-->")) {
    const meta = firstLine.slice(4, -3).trim();
    const pairs = meta.split(",").reduce((acc, pair) => {
      const [key, value] = pair.split(":").map((s) => s.trim());
      if (key && value) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    return {
      content: lines.slice(1).join("\n").trim(),
      extends: pairs["extends"],
      category: pairs["category"],
    };
  }

  return { content: raw };
}

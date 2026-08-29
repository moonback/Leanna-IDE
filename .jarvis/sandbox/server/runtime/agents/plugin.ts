/**
 * Agent Plugin Interface & Factory
 * 
 * Définit le contrat qu'un agent-plugin doit respecter
 * et fournit un factory pour créer des agents facilement.
 * 
 * L'ajout d'un nouvel agent = un seul fichier qui exporte un AgentPlugin.
 * Aucune modification du runtime nécessaire.
 */

import type { AgentMetadata, AgentContext, TaskResult } from "../types";
import type { ToolRegistry } from "../ToolRegistry";
import type { AgentPlugin } from "../AgentRuntime";

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Helper
// ═══════════════════════════════════════════════════════════════════════════════

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  /** Prompt système de l'agent */
  systemPrompt: string;
  /** Nombre max de tâches simultanées (défaut: 1) */
  maxConcurrency?: number;
  /** Timeout par défaut (ms, défaut: 60_000) */
  timeoutMs?: number;
  /** Fonction d'exécution personnalisée (optionnelle) */
  execute?: (context: AgentContext, tools: ToolRegistry, systemPrompt: string) => Promise<TaskResult>;
}

/**
 * Crée un agent-plugin à partir d'une configuration simple.
 * 
 * Exécution par défaut :
 *   1. Construit le prompt avec le contexte
 *   2. Appelle le LLM via l'outil "llm_call"
 *   3. Parse le résultat
 * 
 * Si un `execute` custom est fourni, il est utilisé à la place.
 */
export function defineAgent(config: AgentConfig): AgentPlugin {
  const metadata: AgentMetadata = {
    id: config.id,
    name: config.name,
    description: config.description,
    capabilities: config.capabilities,
    maxConcurrency: config.maxConcurrency ?? 1,
    timeoutMs: config.timeoutMs ?? 60_000,
  };

  const execute = config.execute
    ? (context: AgentContext, tools: ToolRegistry) => config.execute!(context, tools, config.systemPrompt)
    : createDefaultExecutor(config.systemPrompt);

  return { metadata, execute };
}

/**
 * Crée l'exécuteur par défaut basé sur le LLM.
 * 
 * Flux :
 *   Read Context → Build Prompt → Call Model → Parse → Return
 */
function createDefaultExecutor(_systemPrompt: string) {
  return async (context: AgentContext, tools: ToolRegistry): Promise<TaskResult> => {
    const startTime = Date.now();
    const sysPrompt = _systemPrompt;

    try {
      // 1. Lire les fichiers du contexte
      const fileContents: string[] = [];
      for (const file of context.files.slice(0, 10)) {
        try {
          const content = await tools.call("read_project_file", { path: file });
          fileContents.push(`--- ${file} ---\n${content}`);
        } catch {
          // Fichier non lisible — on continue
        }
      }

      // 2. Construire le prompt complet
      const prompt = buildPrompt(sysPrompt, context, fileContents);

      // 3. Appeler le LLM
      const response = await tools.call("llm_generate", {
        system: sysPrompt,
        prompt,
        temperature: 0.3,
        maxTokens: 4096,
      }) as { text: string };

      const text = typeof response === "string" ? response : response?.text ?? "";

      // 4. Parser le résultat
      const result = parseAgentResponse(text);

      return {
        ...result,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        summary: `Erreur agent: ${(err as Error).message}`,
        error: (err as Error).message,
        durationMs: Date.now() - startTime,
      };
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(
  _systemPrompt: string,
  context: AgentContext,
  fileContents: string[]
): string {
  const parts: string[] = [
    `# Tâche : ${context.title}`,
    "",
    context.description,
  ];

  if (context.instructions) {
    parts.push("", "## Instructions supplémentaires", context.instructions);
  }

  if (fileContents.length > 0) {
    parts.push("", "## Fichiers de contexte", ...fileContents);
  }

  if (context.previousResults?.length) {
    parts.push("", "## Résultats précédents");
    for (const prev of context.previousResults) {
      parts.push(`- ${prev.success ? "✓" : "✗"} ${prev.summary}`);
    }
  }

  return parts.join("\n");
}

function parseAgentResponse(text: string): Omit<TaskResult, "durationMs"> {
  // Extraire le résumé (premier paragraphe ou ## Résumé)
  const summaryMatch = text.match(/## Résumé\n([\s\S]*?)(?=\n##|$)/);
  const summary = summaryMatch
    ? summaryMatch[1].trim().slice(0, 500)
    : text.split("\n").filter((l) => l.trim()).slice(0, 3).join(" ").slice(0, 500);

  // Extraire les fichiers modifiés
  const filesModified: string[] = [];
  const fileMatches = text.matchAll(/(?:modifié|créé|écrit)\s*:\s*`?([^\s`]+)`?/gi);
  for (const match of fileMatches) {
    filesModified.push(match[1]);
  }

  // Extraire les suggestions
  const suggestions: string[] = [];
  const sugMatch = text.match(/## Recommandations([\s\S]*?)(?=\n##|$)/);
  if (sugMatch) {
    const lines = sugMatch[1].split("\n").filter((l) => l.trim().startsWith("-"));
    suggestions.push(...lines.map((l) => l.replace(/^-\s*/, "").trim()));
  }

  // Déterminer le succès
  const hasError = /erreur|échec|impossible|failed/i.test(summary);

  return {
    success: !hasError,
    summary,
    details: text,
    filesModified: filesModified.length > 0 ? filesModified : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

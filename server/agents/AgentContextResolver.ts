/**
 * AgentContextResolver — Résolution et lecture du contexte fichier d'une tâche
 *
 * Responsabilité unique : déterminer quels fichiers du dépôt fournir en contexte
 * à l'agent, puis lire leur contenu. La découverte de l'inventaire est réservée
 * aux agents autorisés à `list_project_files` et ne modifie jamais les fichiers.
 *
 * Le résolveur ne détient aucun handler de skills : il reçoit une fonction
 * `callTool` (déjà bornée par timeout) via son constructeur, ce qui garde
 * l'`AgentExecutor` propriétaire du `SkillHandler`.
 */
import type { AgentTask } from "./types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("AgentContextResolver");

/** Appelle un outil du workspace (déjà borné par timeout). */
export type ToolCaller = (toolName: string, args: Record<string, unknown>) => Promise<any>;

export class AgentContextResolver {
  constructor(private readonly callTool: ToolCaller) {}

  /**
   * Résout un contexte explicite, ou découvre une sélection bornée et stable du
   * dépôt pour les audits. La découverte est réservée aux agents autorisés à
   * lister le projet et ne modifie jamais les fichiers.
   */
  async resolveContextFiles(task: AgentTask, capabilities: string[]): Promise<string[]> {
    const mentionedFiles = this.extractMentionedFiles(task);
    const hardExplicitFiles: string[] = [...new Set(task.context.files)].filter(Boolean) as string[];

    // Si des fichiers explicites sont fournis par l'appelant (pas extraits), les utiliser directement
    if (hardExplicitFiles.length > 0 && !capabilities.includes("list_project_files")) {
      return hardExplicitFiles.slice(0, 10) as string[];
    }

    // Toujours découvrir l'inventaire pour résoudre les noms partiels/fuzzy
    if (!capabilities.includes("list_project_files")) {
      return hardExplicitFiles.slice(0, 10) as string[];
    }

    try {
      const inventory = await this.callTool("list_project_files", { path: ".", recursive: true });
      if (inventory?.status !== "success" || !Array.isArray(inventory.files)) {
        log.warn(`[${task.id.slice(0, 8)}] Découverte de contexte indisponible: ${inventory?.error ?? inventory?.message ?? "réponse invalide"}`);
        return hardExplicitFiles.slice(0, 10) as string[];
      }

      const allFiles: string[] = inventory.files;

      // Résoudre les fichiers mentionnés via fuzzy matching dans l'inventaire
      const resolvedMentioned = mentionedFiles
        .map((mentioned) => this.fuzzyResolveFile(mentioned, allFiles))
        .filter(Boolean) as string[];

      // Combiner : fichiers explicites + fichiers résolus + sélection structurante
      const priorityFiles = [...new Set([...hardExplicitFiles, ...resolvedMentioned])];

      if (priorityFiles.length >= 10) {
        const selected: string[] = priorityFiles.slice(0, 10);
        task.context.files = selected;
        log.info(`[${task.id.slice(0, 8)}] Contexte explicite résolu: ${selected.length} fichier(s)`);
        return selected;
      }

      const selectedFiles = this.selectProjectFiles(allFiles, task, resolvedMentioned);
      task.context.files = selectedFiles;
      task.context.metadata = {
        ...task.context.metadata,
        projectContextDiscovered: true,
        projectFileCount: inventory.count,
        contextSelection: {
          strategy: "role_mission_relevance_v1",
          agentRole: task.role,
          selectedFileCount: selectedFiles.length,
          explicitFileCount: resolvedMentioned.length,
          inventoryFileCount: inventory.count,
        },
      };
      log.info(`[${task.id.slice(0, 8)}] Contexte projet découvert: ${selectedFiles.length}/${inventory.count} fichier(s) sélectionné(s)`);
      return selectedFiles as string[];
    } catch (error) {
      log.warn(`[${task.id.slice(0, 8)}] Échec de découverte du contexte: ${(error as Error).message}`);
      return hardExplicitFiles.slice(0, 10) as string[];
    }
  }

  /** Résout un nom de fichier partiel ou casé différemment dans l'inventaire. */
  fuzzyResolveFile(mentioned: string, allFiles: string[]): string | null {
    const normalized = mentioned.replace(/\\/g, "/").toLowerCase();
    // Exact match
    const exact = allFiles.find((file) => file.replace(/\\/g, "/") === mentioned);
    if (exact) return exact;
    // Case-insensitive suffix match
    const suffixMatch = allFiles.find((file) => {
      const fileLower = file.replace(/\\/g, "/").toLowerCase();
      return fileLower.endsWith("/" + normalized) || fileLower === normalized;
    });
    return suffixMatch ?? null;
  }

  /** Extrait les chemins de fichiers mentionnés dans le titre et la description de la tâche. */
  extractMentionedFiles(task: AgentTask): string[] {
    const text = `${task.title} ${task.description} ${task.context.instructions ?? ""}`;
    // Chercher des patterns de fichiers courants (avec extension)
    const filePattern = /(?:^|\s|["'`([\]])([a-zA-Z0-9_/\\.-]+\.(?:ts|tsx|js|jsx|json|md|css|scss|html|vue|py|rs|go))\b/gi;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = filePattern.exec(text)) !== null) {
      const candidate = match[1].replace(/\\/g, "/");
      if (!candidate.startsWith(".") && !candidate.includes("node_modules")) {
        matches.push(candidate);
      }
    }
    return [...new Set(matches)];
  }

  /**
   * Sélectionne les fichiers en fonction du rôle et de l'intention de la mission.
   * Les chemins explicitement mentionnés restent prioritaires ; les fichiers
   * simplement structurels ne doivent pas évincer les fichiers du domaine visé.
   */
  selectProjectFiles(files: string[], task: AgentTask, resolvedMentioned: string[] = []): string[] {
    const role = String(task.role ?? "").toLowerCase();
    const query = `${task.title} ${task.description} ${task.context.instructions ?? ""}`.toLowerCase();
    const explicitRank = new Map(resolvedMentioned.map((file, index) => [file.replace(/\\/g, "/"), index]));
    const normalizedFiles = [...new Set(files.map((file) => file.replace(/\\/g, "/")))]
      .filter((file) => !file.startsWith(".git/") && !file.startsWith(".Leanna/") && !file.includes("/node_modules/"));

    const roleTerms: Record<string, string[]> = {
      coder: ["src/", "server/", "components", "routes", "services"],
      refactor: ["src/", "server/", "components", "utils"],
      debugger: ["test", "spec", "error", "logger", "src/", "server/"],
      reviewer: ["test", "spec", "security", "permission", "src/", "server/"],
      tester: ["test", "spec", "__tests__", "vitest", "jest"],
      security: ["security", "permission", "auth", "policy", "guard", "sandbox"],
      architect: ["runtime", "architecture", "types", "config", "server/", "src/"],
      ui_ux: ["src/", "components", ".css", ".scss", ".tsx"],
      accessibility: ["src/", "components", ".tsx", ".css"],
      performance: ["runtime", "cache", "worker", "performance", "src/", "server/"],
      documentation: [".md", "docs/"],
      writer: [".md", "docs/"],
      seo: ["seo", "meta", "sitemap", "src/"],
    };
    const terms = [...new Set([
      ...query.split(/[^a-zà-ÿ0-9_./-]+/).filter((word) => word.length >= 3),
      ...(roleTerms[role] ?? []),
    ])];
    const ignoredForRole = (file: string): boolean => {
      const isTest = /(^|[./_-])(test|spec)([./_-]|$)|__tests__/.test(file.toLowerCase());
      if (role === "tester" || role === "debugger" || role === "reviewer") return false;
      return isTest;
    };
    const score = (file: string): number => {
      const lower = file.toLowerCase();
      const explicitBase = explicitRank.has(file) ? 1_000 - (explicitRank.get(file) ?? 0) * 10 : 0;
      const structuralBase = file === "package.json" || file === "tsconfig.json" ? 2 : file === "README.md" ? 1 : 0;
      const pathTokens = lower.split(/[/.\\_-]+/).filter(Boolean);
      let relevance = 0;
      for (const term of terms) {
        if (term.includes("/") || term.startsWith(".")) {
          if (lower.includes(term)) relevance += 3;
        } else if (pathTokens.some((token) => token === term)) {
          relevance += 4;
        } else if (lower.includes(term)) {
          relevance += 1;
        }
      }
      if (role === "tester" && /test|spec|__tests__/.test(lower)) relevance += 12;
      if (role === "security" && /security|permission|auth|policy|guard|sandbox/.test(lower)) relevance += 10;
      if (role === "ui_ux" && /components|pages|styles|\.tsx$|\.css$/.test(lower)) relevance += 8;
      if (role === "documentation" && /\.md$|^docs\//.test(lower)) relevance += 8;
      return explicitBase + structuralBase + relevance;
    };

    return normalizedFiles
      .filter((file) => !ignoredForRole(file))
      .sort((left, right) => score(right) - score(left) || left.localeCompare(right))
      .slice(0, 10);
  }

  async readContextFiles(
    files: string[],
    options: { maxTotalChars?: number; maxPerFileChars?: number; maxFiles?: number } = {}
  ): Promise<string[]> {
    const maxTotalChars = Math.max(2_000, Math.min(48_000, options.maxTotalChars ?? 24_000));
    const maxPerFileChars = Math.max(1_000, Math.min(16_000, options.maxPerFileChars ?? 8_000));
    const maxFiles = Math.max(1, Math.min(10, options.maxFiles ?? 10));
    const fileContents: string[] = [];
    let remaining = maxTotalChars;

    for (const [index, file] of files.slice(0, maxFiles).entries()) {
      if (remaining < 512) break;
      try {
        // Le fichier principal est lu intégralement côté outil, mais l'injection
        // est plafonnée. Chaque autre fichier dispose de son propre quota.
        const content = await this.callTool("read_project_file", {
          path: file,
          ...(index === 0 ? { full: true } : {}),
        });
        if (!content || typeof content !== "object" || typeof content.content !== "string") continue;

        const allowance = Math.min(maxPerFileChars, remaining - Math.min(160, remaining));
        if (allowance < 256) break;
        const raw = content.content as string;
        let bounded = raw;
        if (raw.length > allowance) {
          const marker = "\n\n/* … CONTENU TRONQUÉ — budget de contexte atteint … */\n\n";
          const available = Math.max(0, allowance - marker.length);
          const headLength = Math.floor(available * 0.7);
          const tailLength = available - headLength;
          bounded = raw.slice(0, headLength) + marker + (tailLength > 0 ? raw.slice(-tailLength) : "");
        }
        const rendered = `--- ${file} ---\n${bounded}`;
        if (rendered.length > remaining) break;
        fileContents.push(rendered);
        remaining -= rendered.length;
      } catch (err) {
        log.debug(`Échec lecture: ${file} — ${(err as Error).message}`);
      }
    }
    log.debug(`Fichiers lus: ${fileContents.length}/${Math.min(files.length, maxFiles)}; caractères injectables=${maxTotalChars - remaining}; principal=${files[0] ?? "aucun"}`);
    return fileContents;
  }
}

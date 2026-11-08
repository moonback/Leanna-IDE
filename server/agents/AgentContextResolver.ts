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
import { semanticSearch } from "../knowledge/SemanticSearch.js";
import { projectMemory } from "../knowledge/ProjectMemory.js";
import { knowledgeGraph } from "../knowledge/KnowledgeGraph.js";

const log = createLogger("AgentContextResolver");

const MEMORY_CATEGORY_PRIORITY: Record<string, number> = {
  security: 10, "known-bug": 9, decision: 8, architecture: 7,
  api: 6, convention: 5, workflow: 4, stack: 3, module: 2,
  pattern: 2, refactoring: 1, todo: 0,
};

export function resolveAdaptiveMemoryBudget(role: string, query: string, phase?: string): number {
  const roleBudget: Record<string, number> = {
    security: 7_000, architect: 6_500, reviewer: 6_000, debugger: 5_800,
    coder: 5_000, refactor: 5_000, tester: 4_800, performance: 5_500,
    researcher: 5_500, planner: 4_000, documentation: 3_800, writer: 3_800,
  };
  let budget = roleBudget[role.toLowerCase()] ?? 4_000;
  if (query.length > 1_200) budget += 1_000;
  else if (query.length < 180) budget -= 500;
  if (phase === "verify" || phase === "recovery") budget += 1_000;
  if (phase === "discovery") budget -= 500;
  return Math.max(2_000, Math.min(8_000, budget));
}

export function detectMemoryConflicts(facts: Array<{ content: string; category?: string; sourceFile?: string }>): Array<Record<string, unknown>> {
  const polarity = (value: string): number => {
    const text = value.toLowerCase();
    const negative = /\b(no|not|never|without|cannot|can't|disable[ds]?|forbid(?:den)?|interdit|sans|ne\\s+pas|jamais|désactivé|desactive)\b/.test(text);
    const positive = /\b(yes|always|must|enable[ds]?|allow(?:ed)?|required|autorisé|obligatoire|activé|active)\b/.test(text);
    return negative === positive ? 0 : negative ? -1 : 1;
  };
  const tokens = (value: string): Set<string> => new Set(value.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_./-]+/).filter((token) => token.length >= 4));
  const conflicts: Array<Record<string, unknown>> = [];
  for (let i = 0; i < facts.length; i++) for (let j = i + 1; j < facts.length; j++) {
    const left = facts[i], right = facts[j];
    if (!left || !right) continue;
    const lp = polarity(left.content), rp = polarity(right.content);
    if (!lp || lp === rp || (left.category !== right.category && left.sourceFile !== right.sourceFile)) continue;
    const a = tokens(left.content), b = tokens(right.content);
    const intersection = [...a].filter((token) => b.has(token)).length;
    const union = new Set([...a, ...b]).size;
    const similarity = union ? intersection / union : 0;
    if (similarity >= 0.45) conflicts.push({
      factIndexes: [i, j], similarity: Number(similarity.toFixed(2)),
      reason: "possible_opposite_polarity_same_topic",
      resolution: "requires_current_source_verification",
    });
  }
  return conflicts.slice(0, 5);
}


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
      const selected = hardExplicitFiles.slice(0, 10) as string[];
      this.attachMemoryBridge(task, selected);
      return selected;
    }

    // Toujours découvrir l'inventaire pour résoudre les noms partiels/fuzzy
    if (!capabilities.includes("list_project_files")) {
      const selected = hardExplicitFiles.slice(0, 10) as string[];
      this.attachMemoryBridge(task, selected);
      return selected;
    }

    try {
      const inventory = await this.callTool("list_project_files", { path: ".", recursive: true });
      if (inventory?.status !== "success" || !Array.isArray(inventory.files)) {
        log.warn(`[${task.id.slice(0, 8)}] Découverte de contexte indisponible: ${inventory?.error ?? inventory?.message ?? "réponse invalide"}`);
        const selected = hardExplicitFiles.slice(0, 10) as string[];
        this.attachMemoryBridge(task, selected);
        return selected;
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
        this.attachMemoryBridge(task, selected);
        log.info(`[${task.id.slice(0, 8)}] Contexte explicite résolu: ${selected.length} fichier(s)`);
        return selected;
      }

      // Réutiliser le moteur sémantique existant (KnowledgeGraph + index TF-IDF).
      // En cas d'index indisponible, la sélection lexicale/rôle reste un fallback.
      let semanticCandidates: string[] = [];
      const missionQuery = `${task.title} ${task.description} ${task.context.instructions ?? ""}`.trim();
      if (missionQuery.length >= 3) {
        try {
          semanticCandidates = semanticSearch.searchAll(missionQuery)
            .slice(0, 8)
            .map((result) => result.filePath);
        } catch (error) {
          log.debug(`Recherche sémantique indisponible pour [${task.id.slice(0, 8)}]: ${(error as Error).message}`);
        }
      }

      const selectedFiles = this.selectProjectFiles(allFiles, task, resolvedMentioned, semanticCandidates);
      task.context.files = selectedFiles;
      const memoryBridge = this.buildMemoryBridge(task, selectedFiles);
      task.context.metadata = {
        ...task.context.metadata,
        projectContextDiscovered: true,
        projectFileCount: inventory.count,
        contextSelection: {
          strategy: "semantic_role_mission_relevance_v2",
          agentRole: task.role,
          selectedFileCount: selectedFiles.length,
          explicitFileCount: resolvedMentioned.length,
          semanticCandidateCount: semanticCandidates.length,
          inventoryFileCount: inventory.count,
        },
        contextMemory: memoryBridge,
      };
      log.info(`[${task.id.slice(0, 8)}] Contexte projet découvert: ${selectedFiles.length}/${inventory.count} fichier(s) sélectionné(s)`);
      return selectedFiles as string[];
    } catch (error) {
      log.warn(`[${task.id.slice(0, 8)}] Échec de découverte du contexte: ${(error as Error).message}`);
      const selected = hardExplicitFiles.slice(0, 10) as string[];
      this.attachMemoryBridge(task, selected);
      return selected;
    }
  }

  /** Résout un nom de fichier partiel ou casé différemment dans l'inventaire. */
  /**
   * Assemble une mémoire de mission compacte et traçable à partir des systèmes
   * existants. Les faits gardent leur provenance ; seuls les résultats réussis
   * des tâches précédentes sont transmis comme acquis.
   */
  private attachMemoryBridge(task: AgentTask, files: string[]): void {
    task.context.metadata = {
      ...task.context.metadata,
      contextMemory: this.buildMemoryBridge(task, files),
    };
  }

  buildMemoryBridge(task: AgentTask, selectedFiles: string[]): Record<string, unknown> {
    const query = `${task.title} ${task.description} ${task.context.instructions ?? ""}`.trim();
    const role = String(task.role ?? "default");
    const phase = typeof task.context.metadata?.phase === "string" ? task.context.metadata.phase : undefined;
    const budgetChars = resolveAdaptiveMemoryBudget(role, query, phase);
    const rawFacts = query.length >= 3 ? projectMemory.searchFacts(query, 24) : [];
    const maxAgeDays = 180;
    const rankedFacts = rawFacts.map((fact) => {
      const updatedAt = Date.parse(fact.updatedAt || fact.createdAt);
      const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86_400_000) : null;
      const freshness = ageDays === null ? 0.65 : Math.max(0.25, 1 - ageDays / 365);
      const categoryPriority = MEMORY_CATEGORY_PRIORITY[fact.category] ?? 0;
      const score = fact.confidence * 0.55 + freshness * 0.2 + (categoryPriority / 10) * 0.25;
      return { fact, ageDays, freshness, score };
    }).filter(({ fact, ageDays }) =>
      fact.confidence >= 0.35 && (ageDays === null || ageDays <= maxAgeDays || fact.isStructural)
    ).sort((a, b) => b.score - a.score);

    const selectedSet = new Set(selectedFiles.map((file) => file.replace(/\\\\/g, "/")));
    const graphRelations = selectedFiles.slice(0, 8).map((file) => {
      const dependencies = knowledgeGraph.getDependencies(file).map((item) => item.replace(/\\\\/g, "/"))
        .filter((item) => selectedSet.has(item)).slice(0, 5);
      const dependents = knowledgeGraph.getDependents(file).map((item) => item.replace(/\\\\/g, "/"))
        .filter((item) => selectedSet.has(item)).slice(0, 5);
      return { file, dependencies, dependents };
    }).filter((item) => item.dependencies.length > 0 || item.dependents.length > 0);

    const verifiedPreviousResults = (task.context.previousResults ?? [])
      .filter((result) => result?.success === true && result.evidence?.verification?.passed === true)
      .slice(-5).map((result) => ({
        status: "verified_success",
        summary: String(result.summary ?? "").slice(0, 1_000),
        filesModified: (result.evidence?.filesModified ?? result.filesModified ?? []).slice(0, 10),
        verificationChecks: (result.evidence?.verification?.checks ?? []).slice(0, 10),
        durationMs: result.durationMs,
        provenance: "previous_agent_task_result_with_passing_evidence",
      }));

    const boundedFacts: Array<Record<string, unknown>> = [];
    let remaining = Math.max(0, budgetChars - JSON.stringify(graphRelations).length
      - JSON.stringify(verifiedPreviousResults).length - 600);
    for (const item of rankedFacts) {
      const fact = item.fact;
      const candidate = {
        id: fact.id, content: fact.content.slice(0, 700), category: fact.category,
        confidence: Math.max(0, Math.min(1, fact.confidence)), sourceFile: fact.sourceFile ?? null,
        tags: (fact.tags ?? []).slice(0, 8), createdAt: fact.createdAt, updatedAt: fact.updatedAt,
        ageDays: item.ageDays === null ? null : Math.round(item.ageDays),
        freshness: Number(item.freshness.toFixed(2)), provenance: "project_memory",
        verification: "stored_fact_not_independently_reverified",
      };
      const size = JSON.stringify(candidate).length;
      if (size > remaining) continue;
      boundedFacts.push(candidate);
      remaining -= size;
      if (boundedFacts.length >= 12) break;
    }
    const conflicts = detectMemoryConflicts(boundedFacts.map((fact) => ({
      content: String(fact.content ?? ""),
      category: typeof fact.category === "string" ? fact.category : undefined,
      sourceFile: typeof fact.sourceFile === "string" ? fact.sourceFile : undefined,
    })));

    return {
      version: 2, query, role, phase: phase ?? "unspecified",
      budget: { maxChars: budgetChars, usedForFacts: budgetChars - remaining },
      facts: boundedFacts, graphRelations, previousResults: verifiedPreviousResults, conflicts,
      diagnostics: {
        factsMatched: rawFacts.length, factsEligible: rankedFacts.length,
        factsIncluded: boundedFacts.length, staleFactsExcluded: rawFacts.length - rankedFacts.length,
        graphRelationsIncluded: graphRelations.length,
        successfulPreviousResultsIncluded: verifiedPreviousResults.length,
        possibleConflicts: conflicts.length,
      },
      trust: "retrieved_context_untrusted_validate_before_action",
    };
  }

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
  selectProjectFiles(files: string[], task: AgentTask, resolvedMentioned: string[] = [], semanticCandidates: string[] = []): string[] {
    const role = String(task.role ?? "").toLowerCase();
    const query = `${task.title} ${task.description} ${task.context.instructions ?? ""}`.toLowerCase();
    const explicitRank = new Map(resolvedMentioned.map((file, index) => [file.replace(/\\/g, "/"), index]));
    const semanticRank = new Map(semanticCandidates.map((file, index) => [file.replace(/\\/g, "/"), index]));
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
      const semanticBase = semanticRank.has(file) ? 80 - (semanticRank.get(file) ?? 0) * 6 : 0;
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
      return explicitBase + semanticBase + structuralBase + relevance;
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

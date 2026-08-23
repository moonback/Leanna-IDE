/**
 * AgentExecutor — Exécute une tâche agent individuelle
 *
 * Responsabilité unique : le cycle de vie d'exécution d'une tâche :
 * 1. Lecture des fichiers de contexte
 * 2. Construction du prompt (via PromptBuilder)
 * 3. Appel à reasoning_think
 * 4. Écriture des fichiers générés (via GeneratedFileWriter)
 * 5. Extraction du résultat (via ResultParser)
 * 6. **Parse et déclenchement des délégations autonomes (via DelegationParser)**
 * 7. Notification de progression (via ProgressNotifier)
 */
import { randomUUID } from "crypto";
import type { AgentTask } from "./types";
import { getAgentDefinition } from "./roles";
import { PromptBuilder } from "./PromptBuilder";
import { GeneratedFileWriter } from "./GeneratedFileWriter";
import { ResultParser } from "./ResultParser";
import { DelegationParser, type ParsedDelegation } from "./DelegationParser";
import { ProgressNotifier } from "./ProgressNotifier";
import { agentMessageBus } from "./AgentMessageBus";
import type { TaskRequestPayload } from "./AgentCommunication";
import { createLogger } from "../utils/logger";
import { WorkspaceState, type VerificationRecord } from "./WorkspaceState";
import { AgentRepairLoop } from "./AgentRepairLoop";

const log = createLogger("AgentExecutor");

/** Handler externe pour exécuter les actions d'un agent */
export type SkillHandler = (name: string, args: any) => Promise<any>;

interface AgentToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

interface ToolExecutionState {
  resultText: string;
  toolsExecuted: string[];
  filesRead: string[];
  filesModified: string[];
  errors: string[];
  observations: string[];
  /** Every successful or rejected write; completion gates all of these files. */
  touchedFiles: Set<string>;
  /** Bounded, progress-aware repair policies, isolated per file. */
  repairLoops: Map<string, AgentRepairLoop>;
  blockedFiles: Set<string>;
  /** Authoritative disk observations and hash-bound verification evidence. */
  workspace: WorkspaceState;
  fileSnapshots: Map<string, string>;
}

// Seuls les appels structurés correspondant à des skills du workspace sont
// exécutables. Un faux appel `bash` généré par le modèle n'est jamais exécuté.
const EXECUTABLE_AGENT_TOOLS = new Set([
  "list_project_files",
  "read_project_file",
  "read_file_outline",
  "search_in_files",
  "analyze_project_file",
  "write_project_file",
  "modify_project_file",
  "apply_patch",
  "patch_project_file",
  "rename_project_file",
  "delete_project_file",
  "create_project_directory",
  "verify_file",
  "verify_typecheck",
  "verify_lint",
  "verify_full",
  "knowledge_build_context",
  "knowledge_semantic_search",
  "knowledge_search_entities",
  "knowledge_memory_search",
  "knowledge_memory_add",
  "knowledge_memory_list",
  "knowledge_impact_analyze",
  "knowledge_graph_query",
  "knowledge_status",
  "knowledge_reindex",
  "reasoning_think",
]);

export class AgentExecutor {
  private skillHandler: SkillHandler | null = null;
  private promptBuilder = new PromptBuilder();
  private fileWriter: GeneratedFileWriter;
  private resultParser = new ResultParser();
  private delegationParser = new DelegationParser();
  private notifier: ProgressNotifier;

  /** Compteur de tâches en cours par rôle */
  private runningCount: Map<string, number> = new Map();

  constructor(notifier: ProgressNotifier) {
    this.notifier = notifier;
    this.fileWriter = new GeneratedFileWriter(null);
  }

  setSkillHandler(handler: SkillHandler): void {
    this.skillHandler = handler;
    this.fileWriter.setSkillHandler(handler);
  }

  /** Retourne le nombre de tâches en cours pour un rôle */
  getRunningCount(role: string): number {
    return this.runningCount.get(role) ?? 0;
  }

  /**
   * Exécute une tâche agent de bout en bout.
   * Modifie task.status, task.result, task.startedAt, task.completedAt in-place.
   */
  async execute(task: AgentTask): Promise<void> {
    const agent = getAgentDefinition(task.role);
    const taskShortId = task.id.slice(0, 8);

    log.info(`[task:${taskShortId}] ▶ [${agent.name}] Démarrage tâche: "${task.title}"`);

    if (!this.skillHandler) {
      log.error(`[task:${taskShortId}] [${agent.name}] SkillHandler non initialisé`);
      task.status = "failed";
      task.result = {
        success: false,
        summary: "Aucun handler de skills configuré.",
        error: "SkillHandler non initialisé",
        durationMs: 0,
      };
      this.notifier.notify(task, "failed");
      return;
    }

    const startTime = Date.now();

    // Mettre à jour le statut
    task.status = "running";
    task.startedAt = new Date().toISOString();
    this.incrementRunning(task.role);
    this.notifier.notify(task, "started");

    try {
      // ── Étape 1: Découverte puis lecture bornée du contexte ──
      // Les audits sans fichiers explicites doivent examiner le dépôt, pas demander
      // au modèle de fournir lui-même une archive ou des chemins locaux.
      log.debug(`[${agent.name}] Préparation du contexte projet...`);
      const contextFiles = await this.resolveContextFiles(task, agent.capabilities);
      const fileContents = await this.readContextFiles(contextFiles);

      // ── Étape 2: Construction du prompt ──
      const executionPrompt = this.promptBuilder.build(agent, task, fileContents);
      log.debug(`[${agent.name}] Prompt: ${executionPrompt.length} chars`);

      // ── Étape 3: Exécution directe par l'agent ──
      log.debug(`[${agent.name}] Exécution via agent_execute...`);
      const thinkResult = await this.skillHandler("agent_execute", {
        prompt: executionPrompt,
      });

      const initialResultText = this.resultParser.normalizeResult(thinkResult);
      const toolExecution = await this.executeToolLoop(agent, executionPrompt, initialResultText);
      const resultText = toolExecution.resultText;
      log.debug(`[${agent.name}] Résultat final: ${resultText.length} chars après ${toolExecution.observations.length} observation(s) d'outil`);

      // ── Étape 4: Matérialisation et vérification des modifications ──
      const generatedWriteResult = await this.fileWriter.writeFromAgentOutput(task, resultText);
      const generatedRegistration = await this.registerGeneratedWrites(generatedWriteResult.written, toolExecution);
      const writeResult = {
        written: [...new Set([...toolExecution.filesModified, ...generatedRegistration.verified])],
        errors: [...toolExecution.errors.map((error) => ({ path: "tool-call", error })), ...generatedWriteResult.errors, ...generatedRegistration.errors],
      };
      const durationMs = Date.now() - startTime;
      const evidence = this.collectEvidence(task, fileContents, writeResult, resultText, toolExecution);
      const incompleteReason = this.getIncompleteReason(task, resultText, evidence);
      const success = incompleteReason === null;

      // Un texte non exceptionnel ne suffit jamais : completed nécessite des preuves
      // observables collectées par l'exécuteur, pas seulement déclarées par le modèle.
      task.status = success ? "completed" : "failed";
      task.completedAt = new Date().toISOString();
      task.result = {
        success,
        summary: this.resultParser.extractSummary(resultText),
        details: resultText,
        filesModified: writeResult.written,
        fileValidationErrors: writeResult.errors,
        suggestions: this.resultParser.extractSuggestions(resultText),
        error: incompleteReason ?? undefined,
        durationMs,
        evidence,
      };

      if (!success) {
        log.warn(`⚠️ [${agent.name}] Résultat incomplet — ${incompleteReason}`);
        this.notifier.notify(task, "failed");
        return;
      }

      // ── Étape 5: Les délégations ne partent qu'après une exécution vérifiée ──
      const subTaskIds = await this.dispatchDelegations(task, resultText);
      if (subTaskIds.length > 0) {
        task.result.delegatedSubTasks = subTaskIds;
      }

      log.info(`[task:${taskShortId}] ✅ [${agent.name}] Terminé en ${(durationMs / 1000).toFixed(1)}s — ${task.result.summary}`);
      this.notifier.notify(task, "completed");
    } catch (error) {
      const durationMs = Date.now() - startTime;
      task.status = "failed";
      task.completedAt = new Date().toISOString();
      task.result = {
        success: false,
        summary: `Échec de l'agent ${agent.name}`,
        error: (error as Error).message,
        durationMs,
      };

      log.error(`[task:${taskShortId}] ❌ [${agent.name}] Échec après ${(durationMs / 1000).toFixed(1)}s: ${(error as Error).message}`);
      this.notifier.notify(task, "failed");
    } finally {
      this.decrementRunning(task.role);
    }
  }

  // ─── Helpers internes ─────────────────────────────────────────────────────

  /**
   * Boucle Observe → Act → Observe bornée. Le modèle peut demander des skills
   * structurés, mais ne peut ni lancer bash ni sortir du workspace.
   * Limité à MAX_TOOL_TURNS tours pour éviter les boucles infinies.
   */
  private static readonly MAX_TOOL_TURNS = 8;
  /** Taille maximale d’une observation cumulée envoyée au modèle suivant. */
  private static readonly MAX_OBSERVATION_CHARS = 240_000;
  /** Limite de sécurité par snapshot, supérieure aux composants UI usuels. */
  private static readonly MAX_FILE_CONTEXT_CHARS = 200_000;

  private async executeToolLoop(
    agent: { name: string; capabilities: string[] },
    executionPrompt: string,
    initialResultText: string
  ): Promise<ToolExecutionState> {
    const state: ToolExecutionState = {
      resultText: initialResultText,
      toolsExecuted: [],
      filesRead: [],
      filesModified: [],
      errors: [],
      observations: [],
      touchedFiles: new Set(),
      repairLoops: new Map(),
      blockedFiles: new Set(),
      workspace: new WorkspaceState(async (path) => {
        const result = await this.skillHandler!("read_project_file", { path, full: true });
        if (result?.error || result?.status === "failed" || typeof result?.content !== "string") {
          throw new Error(this.formatToolFailure(result));
        }
        return result.content;
      }),
      fileSnapshots: new Map(),
    };

    for (let turn = 0; turn < AgentExecutor.MAX_TOOL_TURNS; turn++) {
      const calls = this.extractToolCalls(state.resultText);
      if (calls.length === 0) break;

      // Si on atteint l'avant-dernier tour, forcer la synthèse après exécution
      const isLastAllowedTurn = turn >= AgentExecutor.MAX_TOOL_TURNS - 2;

      const observationCountBefore = state.observations.length;
      await this.executeRequestedTools(agent, calls, state);
      const observations = state.observations
        .slice(observationCountBefore)
        .join("\n")
        .slice(-AgentExecutor.MAX_OBSERVATION_CHARS);

      // Construire le contexte des fichiers lus (workspace state persisté)
      const fileContextSection = state.fileSnapshots.size > 0
        ? [
            "",
            "## Fichiers en mémoire (état courant autoritaire pour apply_patch)",
            ...[...state.fileSnapshots.entries()].map(([filePath, content]) => {
              const truncated = content.length > AgentExecutor.MAX_FILE_CONTEXT_CHARS
                ? content.slice(0, AgentExecutor.MAX_FILE_CONTEXT_CHARS) + `\n... [tronqué par sécurité — ${content.split("\n").length} lignes au total. Relis la section manquante avec read_project_file(full:true) ou startLine/endLine]`
                : content;
              return `### ${filePath}\n\`\`\`\n${truncated}\n\`\`\``;
            }),
            "",
          ].join("\n")
        : "";

      // ── Compter les lectures répétées sans écriture ──────────────────────
      const readsSinceWrite = state.filesRead.length - state.filesModified.length;
      const stallNote = readsSinceWrite >= 2
        ? `\n⚠️ Tu as lu ${readsSinceWrite} fois le fichier sans avoir émis de apply_patch. Produis maintenant un apply_patch ou déclare le blocage.`
        : "";

      const synthesisInstruction = isLastAllowedTurn
        ? "⚠️ C'est ton dernier tour d'appels d'outils. Tu DOIS maintenant produire le résultat final. Ne demande plus d'appels d'outils."
        : `Poursuis la tâche avec ces observations. Les appels bash/shell et les chemins /workspace ne sont pas disponibles.\nUtilise uniquement les skills structurés autorisés si une action supplémentaire est indispensable.\nPour apply_patch, fournis un diff unifié complet avec les lignes \`---\`, \`+++\` et \`@@\`; le backend refuse un patch dont le contexte ne correspond pas exactement au fichier courant.\nSinon, rends maintenant le résultat final vérifié.\nNe renvoie jamais un plan seul ni un JSON tool_calls sans résultat final.${stallNote}`;

      // Ne remplacer que le snapshot du fichier dans le followUp —
      // le prompt initial (contrat d'exécution, liste des outils) doit toujours être présent.
      // Pour les tours suivants, on injecte uniquement la section fichier + observations.
      const followUpPrompt = [
        executionPrompt,
        fileContextSection,
        "",
        "## Observations d'exécution (tour " + (turn + 1) + ")",
        observations,
        "",
        synthesisInstruction,
      ].join("\n");
      const followUp = await this.skillHandler!("agent_execute", {
        prompt: followUpPrompt,
      });
      state.resultText = this.resultParser.normalizeResult(followUp);
    }

    // Si on sort de la boucle à MAX_TOOL_TURNS et que le résultat contient encore des tool_calls,
    // logger un avertissement — le modèle est en boucle
    if (this.extractToolCalls(state.resultText).length > 0) {
      log.warn(`[${agent.name}] Boucle de tool calls interrompue après ${AgentExecutor.MAX_TOOL_TURNS} tours. Forçage de synthèse.`);
      state.errors.push(`Boucle de tool calls interrompue après ${AgentExecutor.MAX_TOOL_TURNS} tours.`);
    }

    return state;
  }

  private extractToolCalls(resultText: string): AgentToolCall[] {
    // Format 1: JSON structuré {"tool_calls": [...]}
    try {
      const parsed = JSON.parse(resultText.trim());
      if (Array.isArray(parsed?.tool_calls)) {
        const rawCalls: unknown[] = parsed.tool_calls;
        const calls = rawCalls
          .filter((call): call is { name: string; parameters?: unknown; arguments?: unknown } => Boolean(call && typeof call === "object" && typeof (call as { name?: unknown }).name === "string"))
          .slice(0, 6)
          .map((call: { name: string; parameters?: unknown; arguments?: unknown }) => ({
            name: call.name,
            parameters: this.extractCallParams(call),
          }));
        if (calls.length > 0) return calls;
      }
    } catch { /* not JSON */ }

    // Format 2: <|tool_call>call:tool_name{"param":"value"} ou variantes provider
    const providerPattern = /<\|tool_call>call:(\w+)\s*(\{[^}]*\})?/gi;
    const providerCalls: AgentToolCall[] = [];
    let providerMatch: RegExpExecArray | null;
    while ((providerMatch = providerPattern.exec(resultText)) !== null && providerCalls.length < 6) {
      const name = providerMatch[1];
      let parameters: Record<string, unknown> = {};
      if (providerMatch[2]) {
        try { parameters = JSON.parse(providerMatch[2]); } catch { /* malformed */ }
      }
      providerCalls.push({ name, parameters });
    }
    if (providerCalls.length > 0) return providerCalls;

    // Format 3: {"name": "tool", "parameters"|"arguments": {...}} en ligne (certains providers)
    // Utilise un parsing JSON-aware au lieu d'un regex fragile pour capturer les objets imbriqués
    const inlineCalls: AgentToolCall[] = [];
    const inlinePattern = /\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"(?:parameters|arguments)"\s*:\s*/gi;
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlinePattern.exec(resultText)) !== null && inlineCalls.length < 6) {
      const name = inlineMatch[1];
      // Extraire l'objet JSON à partir de la position après "parameters":
      const paramsStartIdx = resultText.indexOf('{', inlineMatch.index! + inlineMatch[0].length - 1);
      const params = this.extractJsonObject(resultText, paramsStartIdx);
      if (params !== null) {
        inlineCalls.push({ name, parameters: params });
      }
    }
    return inlineCalls;
  }

  /** Extrait les paramètres d'un appel, acceptant "parameters" ou "arguments" (format OpenAI). */
  private extractCallParams(call: { parameters?: unknown; arguments?: unknown; args?: unknown }): Record<string, unknown> {
    const raw = call.parameters ?? call.arguments ?? call.args;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    // Si c'est une string JSON, tenter de la parser
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { /* not valid JSON */ }
    }
    return {};
  }

  /** Parse un objet JSON en respectant les accolades imbriquées. */
  private extractJsonObject(text: string, startIdx: number): Record<string, unknown> | null {
    if (startIdx < 0 || text[startIdx] !== '{') return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < text.length && i < startIdx + 2000; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(startIdx, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  /** Sérialise une observation sans tronquer le contenu des lectures complètes. */
  private formatToolObservation(toolName: string, result: any): string {
    const serialized = JSON.stringify(result) ?? String(result);
    const limit = ["read_project_file", "read_file_outline"].includes(toolName)
      ? AgentExecutor.MAX_FILE_CONTEXT_CHARS
      : 8_000;
    const suffix = serialized.length > limit
      ? `\n... [observation tronquée à ${limit} caractères]`
      : "";
    return `- ${toolName}: succès — ${serialized.slice(0, limit)}${suffix}`;
  }

  private formatToolFailure(result: any): string {
    if (!result) return "outil sans résultat";
    const phases = [result.typecheck ?? result.tsc, result.lint, result.test].filter(Boolean);
    const details = phases.flatMap((phase: any) => [
      phase.output,
      phase.stdout,
      phase.stderr,
      phase.errors,
      phase.violations,
    ].flatMap((value: any) => Array.isArray(value)
      ? value.map((item) => typeof item === "string" ? item : item?.message ?? JSON.stringify(item))
      : value ? [String(value)] : []));
    const issues = Array.isArray(result.allIssues)
      ? result.allIssues.map((issue: any) => `${issue.file ?? "global"}${issue.line ? `:${issue.line}` : ""} — ${issue.message ?? JSON.stringify(issue)}`)
      : [];
    const streams = [result.stdout, result.stderr, result.message, result.error, ...details, ...issues]
      .filter(Boolean)
      .join("\n");
    return streams.slice(0, 5000) || `outil en échec (code ${result.exitCode ?? "inconnu"})`;
  }

  private async refreshFileSnapshot(
    requestedPath: string,
    state: ToolExecutionState,
    reason: string,
    afterWrite = false,
  ): Promise<boolean> {
    const file = await state.workspace.reread(requestedPath, afterWrite ? "write" : "read");
    state.toolsExecuted.push("read_project_file");
    if (file.status === "error" || !file.exists || typeof file.content !== "string") {
      state.fileSnapshots.delete(requestedPath);
      state.observations.push(`- read_project_file ${requestedPath}: échec pendant le rafraîchissement ${reason} — ${file.errors.at(-1) ?? "contenu indisponible"}`);
      return false;
    }
    state.filesRead.push(requestedPath);
    state.fileSnapshots.set(requestedPath, file.content);
    state.observations.push(`- read_project_file ${requestedPath}: instantané courant SHA-256 ${file.contentHash.slice(0, 12)} rafraîchi ${reason}; il remplace tout contenu initial.`);
    return true;
  }

  private async registerGeneratedWrites(paths: string[], state: ToolExecutionState): Promise<{ verified: string[]; errors: { path: string; error: string }[] }> {
    const verified: string[] = []; const errors: { path: string; error: string }[] = [];
    for (const filePath of [...new Set(paths)]) {
      state.touchedFiles.add(filePath);
      if (!await this.refreshFileSnapshot(filePath, state, "après la génération", true)) { errors.push({ path: filePath, error: "Relecture post-écriture impossible." }); continue; }
      const verification = await this.skillHandler!("verify_file", { path: filePath });
      state.toolsExecuted.push("verify_file");
      const record = verification?.verificationRecord;
      if (this.isVerificationRecord(record)) state.workspace.recordVerification(filePath, record);
      else state.workspace.markError(filePath, "verify_file n'a pas retourné de preuve hashée structurée.");
      await this.refreshFileSnapshot(filePath, state, "après la vérification générée");
      const file = state.workspace.get(filePath);
      if (verification?.ok === true && verification?.status === "success" && file?.status === "verified" && file.verifiedHash === file.contentHash) { verified.push(filePath); state.filesModified.push(filePath); }
      else errors.push({ path: filePath, error: this.formatToolFailure(verification) });
    }
    return { verified, errors };
  }

  private repairInstruction(state: ToolExecutionState, path: string, issues: unknown, patch?: string): string {
    const normalized = Array.isArray(issues) && issues.length > 0
      ? issues as import("./WorkspaceState").VerificationIssue[]
      : [{ type: "execution", file: path, line: null, column: null, severity: "error" as const, rule: "tool-result", message: "Écriture ou vérification non confirmée." }];
    const key = path.replace(/\\/g, "/").replace(/^\.\//, "");
    const loop = state.repairLoops.get(key) ?? new AgentRepairLoop();
    state.repairLoops.set(key, loop);
    const file = state.workspace.get(path);
    const directive = loop.assess({ issues: normalized, currentHash: file?.contentHash, currentVersion: file?.version, patch });
    if (directive.action === "stop") { state.blockedFiles.add(key); state.errors.push(`repair(${path}): ${directive.reason}`); }
    return directive.requiredAction;
  }

  private isVerificationRecord(value: unknown): value is VerificationRecord {
    const record = value as Partial<VerificationRecord> | undefined;
    return Boolean(record && typeof record.contentHash === "string" && typeof record.hashBefore === "string" && typeof record.hashAfter === "string" && typeof record.ok === "boolean" && ["success", "failed", "stale"].includes(record.status ?? ""));
  }

  private async executeRequestedTools(
    agent: { name: string; capabilities: string[] },
    calls: AgentToolCall[],
    state: ToolExecutionState
  ): Promise<void> {
    const seenCalls = new Set<string>();
    const writePathsHandled = new Set<string>();

    for (const call of calls) {
      const callSignature = `${call.name}:${JSON.stringify(call.parameters)}`;
      if (seenCalls.has(callSignature)) {
        state.observations.push(`- ${call.name}: appel identique ignoré dans ce tour; l'observation du premier appel est suffisante.`);
        continue;
      }
      seenCalls.add(callSignature);

      if (!EXECUTABLE_AGENT_TOOLS.has(call.name) || !agent.capabilities.includes(call.name)) {
        // Tenter une résolution partielle (le modèle tronque parfois les noms)
        // Stratégie : 1) préfixe direct, 2) suppression de _project_file côté outil,
        // 3) suppression de _project_file côté appel (ex: verify_project_file → verify_file)
        const callWithoutProject = call.name.replace("_project_file", "_file");
        const callBase = call.name.replace("_project_file", "");
        const resolved = [...EXECUTABLE_AGENT_TOOLS].find(
          (tool) =>
            tool.startsWith(call.name) ||
            call.name.startsWith(tool.replace("_project_file", "")) ||
            tool === callWithoutProject ||
            tool === callBase
        );
        if (resolved && agent.capabilities.includes(resolved)) {
          call.name = resolved;
        } else {
          log.warn(`[${agent.name}] Appel d'outil refusé: ${call.name}`);
          state.observations.push(`- ${call.name}: refusé. Outil non autorisé pour ${agent.name}; bash/shell ne sont jamais exécutés.`);
          continue;
        }
      }

      const requestedPath = typeof call.parameters.path === "string" ? call.parameters.path : undefined;
      const isWriteCall = requestedPath && ["write_project_file", "apply_patch", "patch_project_file"].includes(call.name);
      const pathKey = requestedPath?.replace(/\\/g, "/").replace(/^\.\//, "");

      // Tous les patches d'une réponse sont produits à partir du même état. Après une
      // écriture, tout second patch du même fichier serait nécessairement obsolète.
      if (isWriteCall && pathKey && writePathsHandled.has(pathKey)) {
        state.observations.push(`- ${call.name} ${requestedPath}: écriture différée. Une écriture de ce fichier a déjà été traitée ce tour; attends l'instantané rafraîchi avant un nouveau patch.`);
        continue;
      }
      if (isWriteCall && pathKey) writePathsHandled.add(pathKey);
      if (isWriteCall && pathKey && state.blockedFiles.has(pathKey)) {
        state.observations.push(`- ${call.name} ${requestedPath}: écriture bloquée par le diagnostic de non-progression; signaler le bloqueur au lieu de répéter le patch.`);
        continue;
      }

      try {
        log.info(`[${agent.name}] Exécution outil structuré: ${call.name} args=${JSON.stringify(call.parameters).slice(0, 200)}`);
        const result = await this.skillHandler!(call.name, call.parameters);
        state.toolsExecuted.push(call.name);
        if (isWriteCall && requestedPath) state.touchedFiles.add(requestedPath);
        if (result?.error || result?.status === "failed") {
          const error = this.formatToolFailure(result);
          if (isWriteCall && requestedPath) {
            await this.refreshFileSnapshot(requestedPath, state, "après le refus d'écriture");
            const instruction = this.repairInstruction(state, requestedPath, result?.allIssues, JSON.stringify(call.parameters));
            state.observations.push(`- ${call.name} ${requestedPath}: échec — ${error}\n${instruction}`);
          } else {
            state.errors.push(`${call.name}: ${error}`);
            state.observations.push(`- ${call.name}: échec — ${error}`);
          }
          continue;
        }

        if (requestedPath && ["read_project_file", "read_file_outline"].includes(call.name)) {
          state.filesRead.push(requestedPath);
          if (call.name === "read_project_file" && typeof result?.content === "string" && result?.status === "success") {
            state.workspace.observe(requestedPath, result.content);
            state.fileSnapshots.set(requestedPath, result.content);
          }
        }
        if (isWriteCall && requestedPath) {
          if (!await this.refreshFileSnapshot(requestedPath, state, "après l'écriture", true)) {
            state.workspace.markError(requestedPath, "Impossible de relire le fichier réellement écrit.");
            state.errors.push(`${call.name}(${requestedPath}): relecture post-écriture impossible.`);
            continue;
          }

          const verification = await this.skillHandler!("verify_file", { path: requestedPath });
          state.toolsExecuted.push("verify_file");
          const record = verification?.verificationRecord;
          if (!this.isVerificationRecord(record)) state.workspace.markError(requestedPath, "verify_file n'a pas retourné de preuve hashée structurée.");
          else state.workspace.recordVerification(requestedPath, record);
          await this.refreshFileSnapshot(requestedPath, state, "après la vérification");
          const file = state.workspace.get(requestedPath);
          const verified = Boolean(record && this.isVerificationRecord(record) && verification?.status === "success" && verification?.ok === true && file?.status === "verified" && file.verifiedHash === file.contentHash);
          if (!verified) {
            const error = this.formatToolFailure(verification);
            const instruction = this.repairInstruction(state, requestedPath, verification?.allIssues ?? record?.allIssues, JSON.stringify(call.parameters));
            state.observations.push(`- ${call.name} ${requestedPath}: écrit mais vérification non courante/échouée — ${error}\n${instruction}`);
            continue;
          }
          state.filesModified.push(requestedPath);
        }

        state.observations.push(this.formatToolObservation(call.name, result));
      } catch (error) {
        const message = (error as Error).message;
        state.errors.push(`${call.name}: ${message}`);
        state.observations.push(`- ${call.name}: erreur — ${message}`);
      }
    }
  }

  /** Construit les preuves à partir des appels réellement effectués par l'exécuteur. */
  private collectEvidence(
    task: AgentTask,
    fileContents: string[],
    writeResult: { written: string[]; errors: { path: string; error: string }[] },
    resultText: string,
    toolExecution: ToolExecutionState
  ) {
    const filesRead = [...new Set([
      ...fileContents
        .map((content) => content.match(/^--- (.+) ---/m)?.[1])
        .filter((path): path is string => Boolean(path)),
      ...toolExecution.filesRead,
    ])];
    const toolsExecuted = [...new Set([
      "agent_execute",
      ...(task.context.metadata?.projectContextDiscovered === true ? ["list_project_files"] : []),
      ...(filesRead.length > 0 ? ["read_project_file"] : []),
      ...toolExecution.toolsExecuted,
      ...(writeResult.written.length > 0 ? ["write_project_file/apply_patch puis verify_file"] : []),
    ])];
    const findings = this.extractFindings(resultText);
    const completion = toolExecution.workspace.completionReport(toolExecution.touchedFiles);
    const writeRequired = ["writer", "formatter", "proofreader", "translator", "summarizer"].includes(task.role)
      // Une sous-tâche explicitement orientée lecture/analyse n'exige pas d'écriture.
      // On détecte cela par l'absence totale de mot-clé d'écriture dans le titre/description
      // ET par la présence de mots-clés d'analyse.
      && !this.isAnalysisOnlyTask(task);
    const readEvidenceRequired = ["researcher", "planner"].includes(task.role);
    const planningOnly = this.isPlanningOnly(resultText);
    const declaredFailure = this.resultParser.detectFailure(resultText);
    const errors = [
      ...writeResult.errors.map((error) => `${error.path}: ${error.error}`),
      ...completion.errors,
      ...(declaredFailure ? [`Le rapport final déclare un échec : ${declaredFailure}`] : []),
      ...(planningOnly ? ["La sortie décrit un plan sans résultat d'exécution."] : []),
      ...(writeRequired && writeResult.written.length === 0 ? ["Aucun fichier confirmé par write_project_file puis verify_file."] : []),
      ...(readEvidenceRequired && filesRead.length === 0 ? ["Aucun fichier lu : audit impossible à vérifier."] : []),
      ...(readEvidenceRequired && findings.length === 0 ? ["Aucun constat concret fourni."] : []),
    ];

    return {
      filesRead,
      filesModified: writeResult.written,
      toolsExecuted,
      commandsExecuted: [],
      findings,
      workspaceCompletion: completion,
      verification: {
        passed: errors.length === 0,
        checks: [
          "agent_execute exécuté",
          ...(filesRead.length > 0 ? [`${filesRead.length} fichier(s) lu(s)`] : []),
          ...(writeResult.written.length > 0 ? [`${writeResult.written.length} fichier(s) écrit(s) et vérifié(s)`] : []),
        ],
        errors,
      },
    };
  }

  private getIncompleteReason(
    task: AgentTask,
    resultText: string,
    evidence: ReturnType<AgentExecutor["collectEvidence"]>
  ): string | null {
    if (evidence.verification.passed) return null;
    const firstError = evidence.verification.errors[0] ?? "preuves d'exécution insuffisantes";
    return `Tâche "${task.title}" incomplète : ${firstError} Sortie: ${resultText.slice(0, 180).replace(/\s+/g, " ")}`;
  }

  /** Extrait des constats opérationnels, pas les sections de planification. */
  private extractFindings(resultText: string): string[] {
    const section = resultText.match(
      /##\s*(?:Résultats vérifiés|Findings|Constats|Détails|Details)\s*\n([\s\S]*?)(?=\n##|$)/i
    )?.[1] ?? "";
    return section
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
      .filter((line) => line.length >= 12)
      .filter((line) => !/^(?:je vais|je dois|il faut|je commencerai|i will|i need to)/i.test(line))
      .slice(0, 20);
  }

  /**
   * Détecte si une tâche est purement analytique/lecture et ne requiert donc pas d'écriture.
   * Utilisé pour assouplir le vérificateur writeRequired.
   */
  private isAnalysisOnlyTask(task: AgentTask): boolean {
    const text = `${task.title} ${task.description} ${task.context.instructions ?? ""}`.toLowerCase();
    // Si le titre/description mentionne explicitement une modification, une correction, une création,
    // on considère qu'une écriture est attendue.
    const writingSignal = /\b(?:modifier?|modifi[e é]|crée?r?|write|implement|apply|patch|fix|correct|refactor|add|update|change)\b/i;
    if (writingSignal.test(text)) return false;
    // Mots-clés indiquant une tâche d'analyse pure
    const analysisSignal = /\b(?:analys|inspect|audit|review|check|read|lire|analyser|examin|rapport|report|résumé|summary|checkpoint\s+git|identifier|liste|list)\b/i;
    return analysisSignal.test(text);
  }

  private isPlanningOnly(resultText: string): boolean {
    const prose = resultText.replace(/^\s*#{1,6}.*$/gm, "").trim();
    // Si le texte contient un appel d'outil (JSON ou format provider), ce n'est pas un plan seul
    if (/\{"tool_calls"\s*:|<\|tool_call>|```[\w]*:[^\n]+\n/i.test(resultText)) return false;
    const planningSignal = /\b(?:je vais|je dois|je commencerai|il faut|je vais commencer|i will|i need to|i should)\b/i;
    const executionSignal = /\b(?:corrig(?:é|ée|és|ées)?|modifi(?:é|ée|és|ées)?|cré(?:é|ée|és|ées)?|écrit|exécut(?:é|ée|és|ées)?|vérifi(?:é|ée|és|ées)?|lu|analys(?:é|ée|és|ées)?|identifi(?:é|ée|és|ées)?|trouv(?:é|ée|és|ées)?|fixed|modified|created|wrote|ran|verified|read|reviewed)\b/i;
    return planningSignal.test(prose) && !executionSignal.test(prose);
  }

  /**
   * Parse la sortie de l'agent, extrait les blocs ## DÉLÉGATION
   * et envoie des task_request sur le bus pour chaque délégation valide.
   *
   * Les sous-tâches sont lancées en parallèle (fire-and-forget) :
   * elles s'exécutent indépendamment et leurs résultats sont loggés.
   * On retourne les IDs des tâches déléguées pour la traçabilité.
   */
  private async dispatchDelegations(
    parentTask: AgentTask,
    resultText: string
  ): Promise<string[]> {
    const { delegations, warnings } = this.delegationParser.parse(
      resultText,
      parentTask.role
    );

    // Logger les avertissements de parsing
    for (const w of warnings) {
      log.warn(`[DelegationParser] ${w}`);
    }

    if (delegations.length === 0) return [];

    const agent = getAgentDefinition(parentTask.role);
    log.info(
      `🔀 [${agent.name}] ${delegations.length} délégation(s) détectée(s) — dispatch en cours...`
    );

    const subTaskIds: string[] = [];

    // Lancer toutes les délégations en parallèle (fire-and-forget)
    const dispatches = delegations.map((delegation) =>
      this.sendDelegation(parentTask, delegation).then((taskId) => {
        if (taskId) subTaskIds.push(taskId);
      })
    );

    await Promise.allSettled(dispatches);

    log.info(
      `[${agent.name}] ${subTaskIds.length}/${delegations.length} délégation(s) envoyée(s) sur le bus`
    );

    return subTaskIds;
  }

  /**
   * Envoie une délégation unique sur le bus de messages.
   * Retourne l'ID de la sous-tâche créée, ou null en cas d'erreur.
   */
  private async sendDelegation(
    parentTask: AgentTask,
    delegation: ParsedDelegation
  ): Promise<string | null> {
    const taskId = randomUUID();
    const agent = getAgentDefinition(parentTask.role);

    // Construire une description enrichie avec le contexte du parent
    const description = [
      `Sous-tâche déléguée par [${agent.name}]`,
      ``,
      `Raison : ${delegation.reason}`,
      ``,
      `Contexte de la tâche parent :`,
      `- Titre : ${parentTask.title}`,
      `- Description : ${parentTask.description.slice(0, 300)}`,
      ...(parentTask.result?.summary
        ? [`- Résultat parent : ${parentTask.result.summary}`]
        : []),
    ].join("\n");

    const message = {
      id: randomUUID(),
      type: "task_request" as const,
      from: parentTask.role,
      to: delegation.targetRole,
      priority: delegation.priority as "low" | "medium" | "high" | "critical",
      timestamp: new Date().toISOString(),
      payload: {
        type: "task_request",
        taskId,
        title: `[Sous-tâche] ${delegation.reason.slice(0, 80)}`,
        description,
        files: [
          ...delegation.files,
          // Inclure aussi les fichiers du parent qui sont pertinents
          ...(parentTask.result?.filesModified ?? []),
        ].filter((v, i, arr) => arr.indexOf(v) === i), // dédupliquer
        instructions: delegation.instructions,
      } as TaskRequestPayload,
      metadata: {
        parentTaskId: parentTask.id,
        parentRole: parentTask.role,
        delegationBlockIndex: delegation.blockIndex,
        autonomous: true,
      },
    };

    try {
      // Publish fire-and-forget (pas d'await de réponse — la sous-tâche s'exécute de manière autonome)
      await agentMessageBus.publish(message);

      log.info(
        `📤 [${agent.name}] Délégation envoyée → [${delegation.targetRole}]: "${delegation.reason.slice(0, 60)}" (task: ${taskId.slice(0, 8)})`
      );
      return taskId;
    } catch (err) {
      log.error(
        `[${agent.name}] Échec envoi délégation → [${delegation.targetRole}]: ${(err as Error).message}`
      );
      return null;
    }
  }

  /**
   * Résout un contexte explicite, ou découvre une sélection bornée et stable du
   * dépôt pour les audits. La découverte est réservée aux agents autorisés à
   * lister le projet et ne modifie jamais les fichiers.
   */
  private async resolveContextFiles(task: AgentTask, capabilities: string[]): Promise<string[]> {
    const mentionedFiles = this.extractMentionedFiles(task);
    const hardExplicitFiles = [...new Set(task.context.files)].filter(Boolean);

    // Si des fichiers explicites sont fournis par l'appelant (pas extraits), les utiliser directement
    if (hardExplicitFiles.length > 0 && !capabilities.includes("list_project_files")) {
      return hardExplicitFiles.slice(0, 10);
    }

    // Toujours découvrir l'inventaire pour résoudre les noms partiels/fuzzy
    if (!capabilities.includes("list_project_files")) {
      return hardExplicitFiles.slice(0, 10);
    }

    try {
      const inventory = await this.skillHandler!("list_project_files", { path: ".", recursive: true });
      if (inventory?.status !== "success" || !Array.isArray(inventory.files)) {
        log.warn(`[${task.id.slice(0, 8)}] Découverte de contexte indisponible: ${inventory?.error ?? inventory?.message ?? "réponse invalide"}`);
        return hardExplicitFiles.slice(0, 10);
      }

      const allFiles: string[] = inventory.files;

      // Résoudre les fichiers mentionnés via fuzzy matching dans l'inventaire
      const resolvedMentioned = mentionedFiles
        .map((mentioned) => this.fuzzyResolveFile(mentioned, allFiles))
        .filter(Boolean) as string[];

      // Combiner : fichiers explicites + fichiers résolus + sélection structurante
      const priorityFiles = [...new Set([...hardExplicitFiles, ...resolvedMentioned])];

      if (priorityFiles.length >= 10) {
        const selected = priorityFiles.slice(0, 10);
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
      };
      log.info(`[${task.id.slice(0, 8)}] Contexte projet découvert: ${selectedFiles.length}/${inventory.count} fichier(s) sélectionné(s)`);
      return selectedFiles;
    } catch (error) {
      log.warn(`[${task.id.slice(0, 8)}] Échec de découverte du contexte: ${(error as Error).message}`);
      return hardExplicitFiles.slice(0, 10);
    }
  }

  /** Résout un nom de fichier partiel ou casé différemment dans l'inventaire. */
  private fuzzyResolveFile(mentioned: string, allFiles: string[]): string | null {
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
  private extractMentionedFiles(task: AgentTask): string[] {
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

  /** Conserve les fichiers d'entrée utiles sans dépasser le budget de contexte. */
  private selectProjectFiles(files: string[], _task: AgentTask, resolvedMentioned: string[] = []): string[] {
    const preferredFiles = [
      ...resolvedMentioned,
      "package.json",
      "tsconfig.json",
      "README.md",
      "server-bootstrap.ts",
      "server.ts",
      "server/agents/AgentExecutor.ts",
      "server/agents/AgentOrchestrator.ts",
      "server/skills/agents.ts",
    ];
    const preferredRank = new Map(preferredFiles.map((file, index) => [file.replace(/\\/g, "/"), index]));
    const normalizedFiles = [...new Set(files.map((file) => file.replace(/\\/g, "/"))) ]
      .filter((file) => !file.startsWith(".git/") && !file.startsWith(".jarvis/") && !file.includes("/node_modules/"));

    return normalizedFiles
      .sort((left, right) => {
        const leftRank = preferredRank.get(left) ?? preferredFiles.length + 999;
        const rightRank = preferredRank.get(right) ?? preferredFiles.length + 999;
        return leftRank - rightRank || left.localeCompare(right);
      })
      .slice(0, 10);
  }

  private async readContextFiles(files: string[]): Promise<string[]> {
    const fileContents: string[] = [];
    for (const [index, file] of files.slice(0, 10).entries()) {
      try {
        // Le premier fichier est le fichier principal résolu par la tâche :
        // injecter son contenu complet évite que le modèle travaille sur une
        // simple fenêtre startLine/endLine ou sur les 50 premières lignes.
        const content = await this.skillHandler!("read_project_file", {
          path: file,
          ...(index === 0 ? { full: true } : {}),
        });
        if (content && typeof content === "object" && content.content) {
          fileContents.push(`--- ${file} ---\n${content.content}`);
        }
      } catch (err) {
        log.debug(`Échec lecture: ${file} — ${(err as Error).message}`);
      }
    }
    log.debug(`Fichiers lus: ${fileContents.length}/${files.length}; principal=${files[0] ?? "aucun"}`);
    return fileContents;
  }

  private incrementRunning(role: string): void {
    this.runningCount.set(role, (this.runningCount.get(role) ?? 0) + 1);
  }

  private decrementRunning(role: string): void {
    const current = this.runningCount.get(role) ?? 1;
    this.runningCount.set(role, Math.max(0, current - 1));
  }
}

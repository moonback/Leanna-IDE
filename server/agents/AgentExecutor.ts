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
import { randomUUID, createHash } from "crypto";
import type { AgentTask } from "./types.js";
import { getAgentDefinition, getAgentDefinitionOrThrow, hasAgent } from "./roles.js";
import { PromptBuilder } from "./PromptBuilder.js";
import { GeneratedFileWriter } from "./GeneratedFileWriter.js";
import { ResultParser } from "./ResultParser.js";
import { DelegationParser, type ParsedDelegation } from "./DelegationParser.js";
import { ProgressNotifier } from "./ProgressNotifier.js";
import { agentMessageBus } from "./AgentMessageBus.js";
import type { TaskRequestPayload } from "./AgentCommunication.js";
import { createLogger } from "../utils/logger.js";
import { WorkspaceState, type VerificationRecord, type VerificationIssue } from "./WorkspaceState.js";
import { AgentRepairLoop } from "./AgentRepairLoop.js";
// import { promptCache } from "../utils/promptCache.js"; // Prêt pour intégration future

const log = createLogger("AgentExecutor");

/** Handler externe pour exécuter les actions d'un agent */
export type SkillHandler<TArgs = unknown, TResult = unknown> = (name: string, args: TArgs) => Promise<TResult>;

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
  /** Snapshots des fichiers au tour précédent pour le diff incrémental */
  previousFileSnapshots: Map<string, string>;
  /** Fichiers nouvellement lus ou modifiés dans ce tour */
  newlyTouchedFiles: Set<string>;
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
  "agent_execute",
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
  
  /**
   * Limite de profondeur maximale pour les délégations (évite les cascades infinies)
   */
  private static readonly MAX_DELEGATION_DEPTH = 4;
  
  /**
   * Timeouts par outil (ms) - optimisé pour éviter les timeouts prématurés
   * Les outils LLM et d'analyse nécessitent plus de temps
   */
  private static readonly TOOL_TIMEOUTS: Record<string, number> = {
    // Outils de lecture rapide (10-15s)
    'list_project_files': 15_000,
    'read_project_file': 20_000,
    'read_file_outline': 15_000,
    
    // Outils de recherche (30-45s)
    'search_in_files': 45_000,
    'knowledge_semantic_search': 45_000,
    'knowledge_search_entities': 30_000,
    'knowledge_memory_search': 30_000,
    'knowledge_memory_add': 30_000,
    
    // Outils d'analyse complexe (60-90s)
    'analyze_project_file': 90_000,
    'knowledge_build_context': 90_000,
    'knowledge_impact_analyze': 90_000,
    'knowledge_graph_query': 60_000,
    
    // Outils de vérification (45-60s)
    'verify_file': 60_000,
    'verify_typecheck': 120_000,
    'verify_lint': 120_000,
    'verify_full': 180_000,
    
    // Outils d'écriture (30-60s)
    'write_project_file': 60_000,
    'apply_patch': 60_000,
    'patch_project_file': 60_000,
    'modify_project_file': 60_000,
    'create_project_directory': 30_000,
    'rename_project_file': 30_000,
    'delete_project_file': 30_000,
    
    // Outils de raisonnement LLM (90-180s)
    'reasoning_think': 180_000,
    'agent_execute': 180_000,
    
    // Timeout par défaut pour les outils inconnus
    'default': 120_000,
  };
  
  /**
   * Map pour suivre les chaînes de délégation actives et détecter les cycles
   * Clé: parentTaskId, Valeur: Set des rôles déjà rencontrés dans cette chaîne
   */
  private delegationChains: Map<string, Set<string>> = new Map();

  constructor(notifier: ProgressNotifier) {
    this.notifier = notifier;
    this.fileWriter = new GeneratedFileWriter(null);
  }

  /**
   * Appelle un outil avec un timeout spécifique basé sur le type d'outil.
   * Gère automatiquement les timeouts et les erreurs.
   */
  private async callToolWithTimeout(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<any> {
    const timeoutMs = AgentExecutor.TOOL_TIMEOUTS[toolName] ?? 
                     AgentExecutor.TOOL_TIMEOUTS['default'];
    
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Outil timeout après ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const handler = this.skillHandler!;
      const toolPromise = handler(toolName, args);
      
      // Course entre le tool et le timeout
      return await Promise.race([toolPromise, timeoutPromise]);
    } catch (error) {
      // Si l'erreur vient du timeout, ajouter des infos contextuelles
      if ((error as Error).message.includes('timeout')) {
        throw new Error(`[${toolName}] ${(error as Error).message}`);
      }
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
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
    const taskShortId = task.id.slice(0, 8);
    const role = task.role;

    // Vérifier si l'agent existe (statique ou dynamique)
    if (!hasAgent(role)) {
      log.error(`[task:${taskShortId}] Agent "${role}" non trouvé (statique ou dynamique)`);
      task.status = "failed";
      task.result = {
        success: false,
        summary: `Agent "${role}" introuvable`,
        error: `Agent "${role}" non enregistré. Utilisez l'Agent Builder pour créer et enregistrer cet agent d'abord.`,
        durationMs: 0,
      };
      this.notifier.notify(task, "failed");
      return;
    }

    const agent = getAgentDefinitionOrThrow(role);
    
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

    log.info(`[task:${taskShortId}] 🟡 [${agent.name}] Rôle: ${task.role} | Titre: "${task.title}" | Fichiers contexte: ${task.context.files.length}`);

    try {
      // ── Étape 1: Découverte puis lecture bornée du contexte ──
      log.debug(`[task:${taskShortId}] [${agent.name}] 📂 Étape 1/5 — Résolution des fichiers de contexte...`);
      const contextFiles = await this.resolveContextFiles(task, agent.capabilities);
      const fileContents = await this.readContextFiles(contextFiles);
      log.debug(`[task:${taskShortId}] [${agent.name}] 📂 Contexte résolu — ${contextFiles.length} fichier(s) chargé(s): [${contextFiles.slice(0, 4).join(", ")}${contextFiles.length > 4 ? ` +${contextFiles.length - 4}` : ""}]`);

      // ── Étape 2: Construction du prompt ──
      log.debug(`[task:${taskShortId}] [${agent.name}] 📝 Étape 2/5 — Construction du prompt...`);
      const executionPrompt = this.promptBuilder.build(agent, task, fileContents);
      log.debug(`[task:${taskShortId}] [${agent.name}] 📝 Prompt construit — ${executionPrompt.length} caractères`);

      // ── Étape 3: Exécution directe par l'agent ──
      log.info(`[task:${taskShortId}] [${agent.name}] 🤖 Étape 3/5 — Exécution agent_execute (LLM)...`);
      const thinkResult = await this.callToolWithTimeout("agent_execute", {
        prompt: executionPrompt,
      });

      const initialResultText = this.resultParser.normalizeResult(thinkResult);
      log.debug(`[task:${taskShortId}] [${agent.name}] 🤖 Réponse initiale: ${initialResultText.length} chars`);
      const toolExecution = await this.executeToolLoop(agent, executionPrompt, initialResultText);
      const resultText = toolExecution.resultText;
      log.info(`[task:${taskShortId}] [${agent.name}] 🔧 Boucle outils terminée — ${toolExecution.toolsExecuted.length} outil(s) exécuté(s), ${toolExecution.filesRead.length} fichier(s) lu(s), ${toolExecution.filesModified.length} fichier(s) modifié(s), ${toolExecution.errors.length} erreur(s)`);

      // ── Étape 4: Matérialisation et vérification des modifications ──
      log.debug(`[task:${taskShortId}] [${agent.name}] 💾 Étape 4/5 — Écriture et vérification des fichiers...`);
      const generatedWriteResult = await this.fileWriter.writeFromAgentOutput(task, resultText);
      if (generatedWriteResult.written.length > 0) {
        log.debug(`[task:${taskShortId}] [${agent.name}] 💾 Fichiers écrits par FileWriter: [${generatedWriteResult.written.join(", ")}]`);
      }
      if (generatedWriteResult.errors.length > 0) {
        log.warn(`[task:${taskShortId}] [${agent.name}] 💾 Erreurs d'écriture FileWriter: ${generatedWriteResult.errors.map(e => `${e.path}: ${e.error}`).join(" | ")}`);
      }
      const generatedRegistration = await this.registerGeneratedWrites(generatedWriteResult.written, toolExecution);
      const writeResult = {
        written: [...new Set([...toolExecution.filesModified, ...generatedRegistration.verified])],
        errors: [...toolExecution.errors.map((error) => ({ path: "tool-call", error })), ...generatedWriteResult.errors, ...generatedRegistration.errors],
      };
      const durationMs = Date.now() - startTime;
      const evidence = this.collectEvidence(task, fileContents, writeResult, resultText, toolExecution);
      const incompleteReason = this.getIncompleteReason(task, resultText, evidence);
      const success = incompleteReason === null;

      // Extraire les opérations de mémoire projet des observations
      const memoryOperations = this.extractMemoryOperations(toolExecution.observations);

      log.debug(`[task:${taskShortId}] [${agent.name}] 🔍 Étape 5/5 — Évaluation des preuves d'exécution...`);
      log.debug(`[task:${taskShortId}] [${agent.name}] 🔍 Fichiers écrits+vérifiés: [${writeResult.written.join(", ") || "aucun"}] | Erreurs: ${writeResult.errors.length} | Vérification: ${success ? "PASS ✅" : "FAIL ❌"}`);

      // Un texte non exceptionnel ne suffit jamais : completed nécessite des preuves
      // observables collectées par l'exécuteur, pas seulement déclarée par le modèle.
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
        ...(memoryOperations.length > 0 && { knowledgeMemoryOperations: memoryOperations }),
      };

      if (!success) {
        log.warn(`[task:${taskShortId}] ⚠️ [${agent.name}] Résultat incomplet après ${(durationMs / 1000).toFixed(1)}s — Cause: ${incompleteReason}`);
        if (toolExecution.errors.length > 0) {
          log.warn(`[task:${taskShortId}] [${agent.name}] Erreurs outils: ${toolExecution.errors.slice(0, 3).join(" | ")}`);
        }
        this.notifier.notify(task, "failed");
        return;
      }

      if (memoryOperations.length > 0) {
        log.info(`[task:${taskShortId}] [${agent.name}] 🧠 ${memoryOperations.length} entrée(s) mémoire projet enregistrée(s)`);
      }

      // ── Étape 5: Les délégations ne partent qu'après une exécution vérifiée ──
      const subTaskIds = await this.dispatchDelegations(task, resultText);
      if (subTaskIds.length > 0) {
        task.result.delegatedSubTasks = subTaskIds;
        log.info(`[task:${taskShortId}] [${agent.name}] 🔀 ${subTaskIds.length} sous-tâche(s) déléguée(s): [${subTaskIds.map(id => id.slice(0, 8)).join(", ")}]`);
      }

      log.info(`[task:${taskShortId}] ✅ [${agent.name}] Terminé en ${(durationMs / 1000).toFixed(1)}s — ${writeResult.written.length} fichier(s) modifié(s) — ${task.result.summary}`);
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

      log.error(`[task:${taskShortId}] ❌ [${agent.name}] Échec après ${(durationMs / 1000).toFixed(1)}s`);
      log.error(`[task:${taskShortId}] [${agent.name}] Erreur: ${(error as Error).message}`);
      if ((error as Error).stack) {
        log.debug(`[task:${taskShortId}] [${agent.name}] Stack: ${(error as Error).stack?.split("\n").slice(0, 4).join(" | ")}`);
      }
      this.notifier.notify(task, "failed");
    } finally {
      this.decrementRunning(task.role);
      log.debug(`[task:${taskShortId}] [${agent.name}] Concurrence: ${this.getRunningCount(task.role)} tâche(s) en cours pour ce rôle`);
    }
  }

    // ─── Helpers internes ───────────────────────────────────────────────────
  private static readonly MAX_TOOL_TURNS = 10;
  /** Taille maximale d’une observation cumulée envoyée au modèle suivant. */
  private static readonly MAX_OBSERVATION_CHARS = 80_000;
  /** Limite de sécurité par snapshot, supérieure aux composants UI usuels. */
  private static readonly MAX_FILE_CONTEXT_CHARS = 50_000;
  /** Limite maximale de fichiers dans le contexte incrémental */
  private static readonly MAX_FILES_IN_CONTEXT = 10;

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
      workspace: new WorkspaceState(async (path: string) => {
        const result = await this.callToolWithTimeout("read_project_file", { path, full: true });
        if (result?.error || result?.status === "failed" || typeof result?.content !== "string") {
          throw new Error(this.formatToolFailure(result));
        }
        return result.content;
      }),
      fileSnapshots: new Map(),
      previousFileSnapshots: new Map(),
      newlyTouchedFiles: new Set(),
    };

    for (let turn = 0; turn < AgentExecutor.MAX_TOOL_TURNS; turn++) {
      const calls = this.extractToolCalls(state.resultText);
      if (calls.length === 0) {
        if (turn === 0) {
          log.debug(`[${agent.name}] Aucun appel d'outil détecté — réponse directe sans outil`);
        }
        break;
      }

      log.info(`[${agent.name}] 🔧 Tour ${turn + 1}/${AgentExecutor.MAX_TOOL_TURNS} — ${calls.length} appel(s) d'outil: [${calls.map(c => c.name).join(", ")}]`);

      // Forcer la synthèse uniquement au tout dernier tour
      const isLastAllowedTurn = turn >= AgentExecutor.MAX_TOOL_TURNS - 1;

      // Sauvegarder l'état précédent pour le diff incrémental
      const filesBeforeTurn = new Map(state.fileSnapshots);
      const newlyTouchedBeforeTurn = new Set(state.newlyTouchedFiles);

      const observationCountBefore = state.observations.length;
      await this.executeRequestedTools(agent, calls, state);
      const observations = state.observations
        .slice(observationCountBefore)
        .join("\n")
        .slice(-AgentExecutor.MAX_OBSERVATION_CHARS);

      // Identifier les fichiers nouvellement lus ou modifiés dans ce tour
      const currentFiles = new Set([...state.filesRead, ...state.filesModified]);
      const newlyTouchedThisTurn = new Set(
        [...currentFiles].filter(f => 
          !newlyTouchedBeforeTurn.has(f) || 
          (state.fileSnapshots.get(f) !== filesBeforeTurn.get(f))
        )
      );
      
      // Mettre à jour les fichiers nouvellement touchés
      newlyTouchedThisTurn.forEach(f => state.newlyTouchedFiles.add(f));

      // Construire le contexte des fichiers lus avec DIFF INCréMENTAL
      const limitedNewlyTouched = new Set([...newlyTouchedThisTurn].slice(0, AgentExecutor.MAX_FILES_IN_CONTEXT));
      const fileContextSection = this.buildIncrementalFileContext(
        state.fileSnapshots,
        limitedNewlyTouched
      );

      // Log pour le suivi des optimisations
      if (turn > 0 && newlyTouchedThisTurn.size > 0) {
        const totalFiles = state.fileSnapshots.size;
        const savings = totalFiles - newlyTouchedThisTurn.size;
        if (savings > 0) {
          log.info(`[${agent.name}] Tour ${turn + 1}: Optimisation diff incrémental - ${newlyTouchedThisTurn.size}/${totalFiles} fichiers envoyés en entier (économie: ~${savings} fichiers)`);
        }
      }

      // ── Compter les lectures répétées sans écriture ──────────────────────
      const readsSinceWrite = state.filesRead.length - state.filesModified.length;
      const stallNote = (readsSinceWrite >= 1 && state.filesModified.length === 0)
        ? `\n💡 Tu as lu ${readsSinceWrite} fichier(s). Si cette tâche requiert une modification de code, émets MAINTENANT un modify_project_file, patch_project_file ou write_project_file.`
        : "";

      const synthesisInstruction = isLastAllowedTurn
        ? "⚠️ C'est ton dernier tour d'appels d'outils. Tu DOIS maintenant produire le résultat final. Ne demande plus d'appels d'outils."
        : `Poursuis la tâche avec ces observations. Les appels bash/shell et les chemins /workspace ne sont pas disponibles.\nUtilise les skills structurés autorisés pour appliquer les changements (modify_project_file / patch_project_file / write_project_file) puis verify_file.\nPour apply_patch, fournis un diff unifié complet avec les lignes \`---\`, \`+++\` et \`@@\`.\nUne fois les actions exécutées et vérifiées, rends le résultat final avec la section ## Résultats vérifiés.\nNe renvoie jamais un plan seul ni un JSON tool_calls sans résultat final.${stallNote}`;

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
      const followUp = await this.callToolWithTimeout("agent_execute", {
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

  /**
   * Construit le contexte des fichiers avec diff incrémental.
   * Seuls les fichiers nouvellement lus ou modifiés sont envoyés en entier.
   * Les autres sont référencés avec leur hash SHA-256 pour vérification.
   */
  private buildIncrementalFileContext(
    currentSnapshots: Map<string, string>,
    newlyTouchedFiles: Set<string>
  ): string {
    if (currentSnapshots.size === 0) {
      return "";
    }

    const parts: string[] = [
      "",
      "## Fichiers en mémoire (état courant autoritaire pour apply_patch)",
    ];

    // Fichiers nouvellement lus ou modifiés - envoyer le contenu complet
    const newOrModifiedFiles: string[] = [];
    newlyTouchedFiles.forEach(filePath => {
      const content = currentSnapshots.get(filePath);
      if (content) {
        const truncated = content.length > AgentExecutor.MAX_FILE_CONTEXT_CHARS
          ? content.slice(0, AgentExecutor.MAX_FILE_CONTEXT_CHARS) + `
... [tronqué par sécurité — ${content.split("\n").length} lignes au total. Relis la section manquante avec read_project_file(full:true) ou startLine/endLine]`
          : content;
        newOrModifiedFiles.push(`### ${filePath} (NOUVEAU/MODIFIÉ)
\`\`\`
${truncated}
\`\`\``);
      }
    });

    // Fichiers existants mais non modifiés - juste référencer avec hash
    const unchangedFiles: string[] = [];
    currentSnapshots.forEach((content, filePath) => {
      if (!newlyTouchedFiles.has(filePath)) {
        const hash = this.computeContentHash(content);
        unchangedFiles.push(`### ${filePath} (inchangé - SHA-256: ${hash.slice(0, 16)}...)`);
      }
    });

    if (newOrModifiedFiles.length > 0) {
      parts.push("### Fichiers nouvellement lus ou modifiés :");
      parts.push(...newOrModifiedFiles);
    }

    if (unchangedFiles.length > 0) {
      parts.push("");
      parts.push("### Fichiers inchangés (référence par hash) :");
      parts.push(...unchangedFiles);
    }

    parts.push("");
    
    // Ajouter une note explicative pour le modèle
    if (unchangedFiles.length > 0 && newlyTouchedFiles.size > 0) {
      parts.push(
        `✨ **Optimisation active** : Seuls les fichiers modifiés sont inclus en entier. ` +
        `Les fichiers inchangés sont référencés par leur hash. ` +
        `Utilise read_project_file pour relire un fichier spécifique si nécessaire.`
      );
      parts.push("");
    }

    return parts.join("\n");
  }

  /**
   * Calcul un hash simple pour le contenu (pour référence)
   */
  private computeContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
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
  private formatToolObservation(toolName: string, result: unknown): string {
    const serialized = JSON.stringify(result) ?? String(result);
    const limit = ["read_project_file", "read_file_outline"].includes(toolName)
      ? AgentExecutor.MAX_FILE_CONTEXT_CHARS
      : 8_000;
    const suffix = serialized.length > limit
      ? `\n... [observation tronquée à ${limit} caractères]`
      : "";
    return `- ${toolName}: succès — ${serialized.slice(0, limit)}${suffix}`;
  }

  private formatToolFailure(result: unknown): string {
    if (!result) return "outil sans résultat";
    const resultObj = result as Record<string, unknown>;
    const phases = [resultObj.typecheck ?? resultObj.tsc, resultObj.lint, resultObj.test].filter(Boolean);
    const details = phases.flatMap((phase: unknown) => {
      const phaseObj = phase as Record<string, unknown>;
      return [
        phaseObj.output,
        phaseObj.stdout,
        phaseObj.stderr,
        phaseObj.errors,
        phaseObj.violations,
      ].flatMap((value: unknown) => {
        if (Array.isArray(value)) {
          return value.map((item: unknown) => {
            if (typeof item === "string") return item;
            const itemObj = item as Record<string, unknown>;
            return itemObj?.message ?? JSON.stringify(item);
          });
        }
        return value ? [String(value)] : [];
      });
    });
    const issues = Array.isArray(resultObj.allIssues)
      ? (resultObj.allIssues as Array<Record<string, unknown>>).map((issue) => 
          `${issue.file ?? "global"}${issue.line ? `:${issue.line}` : ""} — ${issue.message ?? JSON.stringify(issue)}`)
      : [];
    const streams = [
      resultObj.stdout,
      resultObj.stderr,
      resultObj.message,
      resultObj.error,
      ...details,
      ...issues
    ]
      .filter(Boolean)
      .join("\n");
    return streams.slice(0, 5000) || `outil en échec (code ${(resultObj as { exitCode?: string }).exitCode ?? "inconnu"})`;
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
      const verification = await this.callToolWithTimeout("verify_file", { path: filePath });
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
      ? issues as VerificationIssue[]
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
      const isWriteCall = requestedPath && ["write_project_file", "apply_patch", "patch_project_file", "modify_project_file"].includes(call.name);
      const pathKey = requestedPath?.replace(/\\/g, "/").replace(/^\.\//, "");

      // ── Validations préventives pour éviter les erreurs courantes ──────────────────
      
      // 1. Vérifier que search_in_files a un chemin valide
      if (call.name === "search_in_files" && requestedPath) {
        // Vérification simple : le chemin ne doit pas contenir de caractères problématiques
        // et ne doit pas être visiblement invalide
        const invalidPaths = ["node_modules", ".git", ".Leanna/sandbox/components", ".Leanna/sandbox/src"];
        if (invalidPaths.some(p => requestedPath.includes(p))) {
          state.observations.push(`- search_in_files: Le chemin "${requestedPath}" pointe vers un répertoire invalide ou inexistant. Essaye un chemin valide comme "server/" ou "src/".`);
          log.warn(`[${agent.name}] search_in_files ignoré: chemin invalide "${requestedPath}"`);
          continue;
        }
        
        // Vérifier que le chemin n'est pas vide ou juste des espaces
        if (!requestedPath.trim() || requestedPath === ".") {
          // C'est OK, recherche à la racine
        } else if (!/^[a-zA-Z0-9_\\\/\-\.]+$/.test(requestedPath.replace(/\\/g, "/"))) {
          state.observations.push(`- search_in_files: Le chemin "${requestedPath}" contient des caractères invalides.`);
          log.warn(`[${agent.name}] search_in_files ignoré: caractères invalides dans "${requestedPath}"`);
          continue;
        }
      }
      
      // 2. Vérifier que read_file_outline pointe vers un fichier (pas un répertoire)
      if (call.name === "read_file_outline" && requestedPath) {
        // Un fichier doit avoir une extension
        const fileExtensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss", ".html", ".vue", ".py", ".rs", ".go", ".yaml", ".yml"];
        const hasExtension = fileExtensions.some(ext => requestedPath.endsWith(ext));
        
        if (!hasExtension) {
          // Cela ressemble à un répertoire
          state.observations.push(`- read_file_outline: "${requestedPath}" semble être un répertoire. Utilise list_project_files pour lister son contenu, ou read_project_file pour lire un fichier spécifique.`);
          log.warn(`[${agent.name}] read_file_outline ignoré: "${requestedPath}" semble être un répertoire (pas d'extension)`);
          continue;
        }
      }
      
      // 3. Vérifier que modify_project_file a un chemin valide
      if (call.name === "modify_project_file" && requestedPath) {
        const fileExtensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss", ".html", ".vue", ".py", ".rs", ".go", ".yaml", ".yml", ".txt", ".tsv", ".csv"];
        const hasExtension = fileExtensions.some(ext => requestedPath.endsWith(ext));
        
        if (!hasExtension) {
          state.observations.push(`- modify_project_file: "${requestedPath}" semble être un répertoire. Utilise un chemin de fichier valide avec une extension.`);
          log.warn(`[${agent.name}] modify_project_file ignoré: "${requestedPath}" semble être un répertoire`);
          continue;
        }
      }

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
        const argSummary = JSON.stringify(call.parameters).slice(0, 150);
        log.debug(`[${agent.name}] ⚙️  ${call.name}(${argSummary})`);
        const toolStart = Date.now();
        const result = await this.callToolWithTimeout(call.name, call.parameters);
        const toolMs = Date.now() - toolStart;
        log.debug(`[${agent.name}] ⚙️  ${call.name} → ${result?.status ?? (result?.ok === false ? "failed" : "ok")} (${toolMs}ms)`);
        state.toolsExecuted.push(call.name);
        if (isWriteCall && requestedPath) state.touchedFiles.add(requestedPath);
        if (result?.error || result?.status === "failed") {
          const error = this.formatToolFailure(result);
          if (isWriteCall && requestedPath) {
            await this.refreshFileSnapshot(requestedPath, state, "après le refus d'écriture");
            const instruction = this.repairInstruction(state, requestedPath, result?.allIssues, JSON.stringify(call.parameters));
            state.observations.push(`- ${call.name} ${requestedPath}: échec — ${error}\n${instruction}`);
          } else {
            // Pour les outils non-écriture (read, list, search, verify d'exploration),
            // l'échec est une observation de travail transmise au modèle pour qu'il s'ajuste.
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

          const verification = await this.callToolWithTimeout("verify_file", { path: requestedPath });
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
      ...(writeResult.written.length > 0 ? ["write_project_file/modify_project_file/patch_project_file puis verify_file"] : []),
    ])];
    const findings = this.extractFindings(resultText);
    const completion = toolExecution.workspace.completionReport(writeResult.written);
    const writeRequired = ["writer", "formatter", "proofreader", "translator", "coder", "refactor", "debugger"].includes(task.role)
      // Une sous-tâche explicitement orientée lecture/analyse n'exige pas d'écriture.
      // On détecte cela par l'absence totale de mot-clé d'écriture dans le titre/description
      // ET par la présence de mots-clés d'analyse.
      // Note: summarizer est exclu car il produit des résumés, pas des fichiers modificateurs
      && !this.isAnalysisOnlyTask(task);
    const readEvidenceRequired = ["researcher", "planner"].includes(task.role);
    const planningOnly = this.isPlanningOnly(resultText);
    const declaredFailure = this.resultParser.detectFailure(resultText);
    const errors = [
      ...writeResult.errors.map((error) => `${error.path}: ${error.error}`),
      ...completion.errors,
      ...(declaredFailure ? [`Le rapport final déclare un échec : ${declaredFailure}`] : []),
      ...(planningOnly ? ["La sortie décrit un plan sans résultat d'exécution."] : []),
      ...(writeRequired && writeResult.written.length === 0 ? ["Aucun fichier confirmé par write_project_file, modify_project_file ou patch_project_file puis verify_file."] : []),
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
      /##\s*(?:Résultats vérifiés|Findings|Constats|Détails|Details|Synthèse|Synthese|Propositions?|Recommandations?|Analyse|Audit)\s*\n([\s\S]*?)(?=\n##|$)/i
    )?.[1] ?? "";
    const findings = section
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)]|#{1,4})\s*/, "").trim())
      .filter((line) => line.length >= 12)
      .filter((line) => !/^(?:je vais|je dois|il faut|je commencerai|i will|i need to)/i.test(line))
      .slice(0, 20);

    if (findings.length > 0) return findings;

    // Si aucune section spécifique n'a matché, extraire les lignes informatives du résultat
    return resultText
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)]|#{1,4})\s*/, "").trim())
      .filter((line) => line.length >= 15)
      .filter((line) => !/^(?:je vais|je dois|il faut|je commencerai|i will|i need to)/i.test(line))
      .filter((line) => !line.startsWith("{") && !line.startsWith("<|tool_call>"))
      .slice(0, 20);
  }

  /**
   * Extrait les opérations knowledge_memory_add des observations d'outils.
   * Retourne un tableau d'opérations réussies avec leur fact_id et détails.
   */
  private extractMemoryOperations(observations: string[]): Array<{
    tool: string;
    fact_id: string;
    message: string;
    timestamp: string;
  }> {
    const operations: Array<{ tool: string; fact_id: string; message: string; timestamp: string }> = [];
    
    // Pattern plus robuste qui gère les variations d'espaces et d'ordre des clés
    const memoryAddPattern = /- knowledge_memory_add: succès — \{[^}]*"status"\s*:\s*"success"[^}]*"fact_id"\s*:\s*"([^"]+)"[^}]*"message"\s*:\s*"([^"]+)"[^}]*\}/g;
    
    for (const obs of observations) {
      let match: RegExpExecArray | null;
      while ((match = memoryAddPattern.exec(obs)) !== null) {
        operations.push({
          tool: "knowledge_memory_add",
          fact_id: match[1],
          message: match[2],
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    return operations;
  }

  /**
   * Détecte si une tâche est purement analytique/lecture/rédactionnelle et ne requiert donc pas d'écriture de fichier de code.
   * Utilisé pour assouplir le vérificateur writeRequired.
   */
  private isAnalysisOnlyTask(task: AgentTask): boolean {
    const text = `${task.title} ${task.description} ${task.context.instructions ?? ""}`.toLowerCase();
    // Si le titre/description mentionne explicitement une modification/écriture de code ou contenu
    const writingSignal = /\b(?:modifier|écriture|écrire|amélio|refactor|implément|créer|créa|ajust|corriger|correct|optimis|rédig|fix|update|write|patch|modify|create|improve|write_project_file|apply_patch|patch_project_file|modify_project_file)\b/i;
    if (writingSignal.test(text)) return false;
    // Mots-clés indiquant une tâche d'analyse pure, proposition, synthèse, rapport, recommandation, audit
    const analysisSignal = /\b(?:analys|inspect|audit|review|check|read|lire|analyser|examin|rapport|report|résumé|summary|checkpoint\s+git|identifier|propos|proposition|suggestion|recommand|conseil|avis)\b/i;
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
    resultText: string,
    depth: number = 0
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
    if (!agent) {
      log.error(`[dispatchDelegations] Agent "${parentTask.role}" introuvable`);
      return [];
    }
    log.info(
      `🔀 [${agent.name}] ${delegations.length} délégation(s) détectée(s) à profondeur ${depth} — dispatch en cours...`
    );

    const subTaskIds: string[] = [];
    const nextDepth = depth + 1;

    try {
      // Lancer toutes les délégations en parallèle (fire-and-forget)
      const dispatches = delegations.map((delegation: ParsedDelegation) =>
        this.sendDelegation(parentTask, delegation, nextDepth).then((taskId) => {
          if (taskId) subTaskIds.push(taskId);
        })
      );

      await Promise.allSettled(dispatches);

      log.info(
        `[${agent.name}] ${subTaskIds.length}/${delegations.length} délégation(s) envoyée(s) sur le bus (profondeur: ${nextDepth})`
      );

      return subTaskIds;
    } finally {
      // Nettoyer la chaîne seulement une fois tous les dispatches de ce parent terminés
      this.delegationChains.delete(parentTask.id);
    }
  }

  /**
   * Envoie une délégation unique sur le bus de messages.
   * Retourne l'ID de la sous-tâche créée, ou null en cas d'erreur.
   * 
   * Implémente :
   * - Détection de cycle : empêche A -> B -> A
   * - Limite de profondeur : max 4 niveaux de délégation
   */
  private async sendDelegation(
    parentTask: AgentTask,
    delegation: ParsedDelegation,
    depth: number = 0
  ): Promise<string | null> {
    const taskId = randomUUID();
    const agent = getAgentDefinition(parentTask.role);
    if (!agent) {
      log.error(`[sendDelegation] Agent "${parentTask.role}" introuvable`);
      return null;
    }
    
    // Vérifier la limite de profondeur
    if (depth >= AgentExecutor.MAX_DELEGATION_DEPTH) {
      log.warn(
        `[${agent.name}] Délégation rejetée : profondeur maximale atteinte (${AgentExecutor.MAX_DELEGATION_DEPTH}) - ` +
        `chaîne: ${this.formatDelegationChain(parentTask.id)}`
      );
      return null;
    }
    
    // Vérifier les cycles dans la chaîne de délégation
    const chain = this.getDelegationChain(parentTask.id);
    if (chain.has(delegation.targetRole)) {
      log.warn(
        `[${agent.name}] Délégation rejetée : cycle détecté - ${delegation.targetRole} est déjà dans la chaîne: ` +
        `${Array.from(chain).join(' -> ')} -> ${delegation.targetRole}`
      );
      return null;
    }
    
    // Enregistrer cette délégation dans la chaîne
    this.addToDelegationChain(parentTask.id, delegation.targetRole);

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
   * Récupère la chaîne de délégation pour une tâche
   */
  private getDelegationChain(taskId: string): Set<string> {
    let chain = this.delegationChains.get(taskId);
    if (!chain) {
      chain = new Set<string>();
      this.delegationChains.set(taskId, chain);
    }
    return chain;
  }

  /**
   * Ajoute un rôle à la chaîne de délégation
   */
  private addToDelegationChain(taskId: string, role: string): void {
    let chain = this.delegationChains.get(taskId);
    if (!chain) {
      chain = new Set<string>();
      this.delegationChains.set(taskId, chain);
    }
    chain.add(role);
  }

  /**
   * Formate la chaîne de délégation pour le log
   */
  private formatDelegationChain(taskId: string): string {
    const chain = this.delegationChains.get(taskId);
    return chain ? Array.from(chain).join(' -> ') : taskId;
  }

  /**
   * Résout un contexte explicite, ou découvre une sélection bornée et stable du
   * dépôt pour les audits. La découverte est réservée aux agents autorisés à
   * lister le projet et ne modifie jamais les fichiers.
   */
  private async resolveContextFiles(task: AgentTask, capabilities: string[]): Promise<string[]> {
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
      const inventory = await this.callToolWithTimeout("list_project_files", { path: ".", recursive: true });
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
      };
      log.info(`[${task.id.slice(0, 8)}] Contexte projet découvert: ${selectedFiles.length}/${inventory.count} fichier(s) sélectionné(s)`);
      return selectedFiles as string[];
    } catch (error) {
      log.warn(`[${task.id.slice(0, 8)}] Échec de découverte du contexte: ${(error as Error).message}`);
      return hardExplicitFiles.slice(0, 10) as string[];
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
      .filter((file) => !file.startsWith(".git/") && !file.startsWith(".Leanna/") && !file.includes("/node_modules/"));

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
        const content = await this.callToolWithTimeout("read_project_file", {
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

/**
 * core/JevSafetyGate.ts — adaptateur reliant le jugement de risque Jev
 * (server/utils/jevGating.ts) au point de passage unique des outils
 * (`ToolRegistry`), via l'interface `SafetyGate`.
 *
 * Même patron que `LedgerGuard` (idempotence) : le ToolRegistry reste ignorant
 * de Jev ; cet adaptateur construit un `AgentActionContext` à partir du tool
 * call, appelle `gateAgentAction`, puis traduit le verdict pour le registry.
 *
 * Modes (LEANNA_SAFETY_GATE) :
 *   - "off"     (défaut) : aucun jugement (le gate n'est même pas branché).
 *   - "enforce" : une action jugée `review` ou `block` est REFUSÉE.
 *   - "audit"   : on journalise le verdict mais on laisse toujours passer.
 *
 * Le contexte ambiant (missionId/taskId) est réglé par l'orchestrateur autour
 * d'une exécution, car `ToolRegistry.call` ne le fournit pas directement.
 */

import type { SafetyGate } from "../runtime/ToolRegistry.js";
import type { ToolPermission } from "../runtime/types.js";
import { gateAgentAction, type GateAction } from "../utils/jevGating.js";

export type SafetyGateMode = "off" | "audit" | "enforce";

export interface JevSafetyGateContext {
  missionId?: string;
  taskId?: string;
}

/** Décrit ce qu'un outil fait, pour donner à Jev un état lisible. */
function summarize(
  tool: string,
  args: Record<string, unknown>,
  permissions: ToolPermission[] | undefined,
): { target: string; summary: string; facts: Record<string, string | number | boolean> } {
  const path = (args.path ?? args.filePath ?? args.file ?? args.target) as string | undefined;
  const command = (args.command ?? args.cmd ?? args.script) as string | undefined;
  const url = (args.url ?? args.endpoint) as string | undefined;
  const target = String(path ?? command ?? url ?? "");

  const perms = (permissions ?? []).join(",");
  const recursive = args.recursive === true || args.force === true;

  // Résumé en langage naturel : c'est le seul texte que Jev lit.
  const parts = [`Outil "${tool}"`];
  if (path) parts.push(`sur le fichier/chemin "${path}"`);
  if (command) parts.push(`exécute la commande shell : ${command}`);
  if (url) parts.push(`contacte l'URL externe : ${url}`);
  if (recursive) parts.push("(opération récursive/forcée)");
  if (perms) parts.push(`permissions requises : ${perms}`);

  return {
    target,
    summary: parts.join(" "),
    facts: {
      tool,
      permissions: perms,
      recursive,
      has_path: Boolean(path),
      is_shell: Boolean(command),
      is_network: Boolean(url),
    },
  };
}

export class JevSafetyGate implements SafetyGate {
  private ctx: JevSafetyGateContext = {};

  constructor(
    private readonly mode: SafetyGateMode,
    private readonly opts: { apiKey?: string; model?: string } = {},
  ) {}

  /** Règle le contexte ambiant (missionId/taskId) pour la télémétrie et les spans. */
  setContext(ctx: JevSafetyGateContext): void {
    this.ctx = { ...ctx };
  }

  /** Efface le contexte ambiant (fin de mission/étape). */
  clearContext(): void {
    this.ctx = {};
  }

  async evaluate(
    tool: string,
    args: Record<string, unknown>,
    permissions: ToolPermission[] | undefined,
    _agentId: string | undefined,
  ): Promise<{ decision: "allow" } | { decision: "block"; reason: string }> {
    // "off" ne devrait jamais être branché, mais on garde une porte de sortie.
    if (this.mode === "off") return { decision: "allow" };

    const { target, summary, facts } = summarize(tool, args, permissions);
    const decision = await gateAgentAction(
      { tool, target, summary, facts },
      {
        apiKey: this.opts.apiKey,
        model: this.opts.model,
        missionId: this.ctx.missionId,
        taskId: this.ctx.taskId,
      },
    );

    const label = `${tool} → ${decision.action}` + (decision.reasons.length ? ` (${decision.reasons.join("; ")})` : "");

    if (this.mode === "audit") {
      // On observe sans jamais bloquer.
      if (decision.action !== "allow") {
        console.warn(`[JevSafetyGate:AUDIT] ${label}`);
      }
      return { decision: "allow" };
    }

    // enforce : allow passe, review ET block sont refusés (fail-closed).
    return mapVerdict(decision.action, decision.reasons, label);
  }
}

function mapVerdict(
  action: GateAction,
  reasons: string[],
  label: string,
): { decision: "allow" } | { decision: "block"; reason: string } {
  if (action === "allow") return { decision: "allow" };
  console.warn(`[JevSafetyGate:ENFORCE] bloqué — ${label}`);
  return { decision: "block", reason: reasons.join("; ") || "action jugée risquée" };
}

/** Lit le mode depuis l'environnement. */
export function safetyGateModeFromEnv(env: NodeJS.ProcessEnv = process.env): SafetyGateMode {
  const raw = (env.LEANNA_SAFETY_GATE ?? "off").toLowerCase().trim();
  return raw === "enforce" || raw === "audit" ? raw : "off";
}

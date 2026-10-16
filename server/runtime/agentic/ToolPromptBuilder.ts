/**
 * ToolPromptBuilder — Donne RÉELLEMENT ses outils à l'agent.
 *
 * L'ancien exécuteur envoyait un prompt libre et *devinait* les appels d'outils
 * dans le texte de sortie. Ici, on construit un prompt qui expose explicitement
 * au modèle la liste des outils qu'il a le droit d'appeler — dérivée des
 * `capabilities` déclarées de l'agent et filtrée sur ce que le `ToolRegistry`
 * connaît réellement. C'est le pont manquant entre « capacité déclarée » et
 * « outil exécutable ».
 */

import type { ToolRegistry } from "../ToolRegistry.js";
import { guardUntrustedContent } from "../../utils/promptInjectionGuard.js";
import type { ToolDeclaration } from "../types.js";
import type { AgentBudget, BudgetUsage, Observation } from "./types.js";

/** Sérialise une déclaration d'outil pour le modèle, de façon compacte. */
function renderTool(decl: ToolDeclaration): string {
  const params = decl.parameters && Object.keys(decl.parameters).length > 0
    ? JSON.stringify(decl.parameters)
    : "{}";
  return `- ${decl.name}: ${decl.description}\n  params: ${params}`;
}

/**
 * Résout les outils réellement disponibles pour un agent.
 * Intersection entre les capabilities déclarées et le registre.
 * Si aucune capability n'est déclarée, l'agent n'obtient AUCUN outil (fail-safe).
 */
export function resolveAgentTools(
  capabilities: readonly string[],
  registry: ToolRegistry
): ToolDeclaration[] {
  const resolved: ToolDeclaration[] = [];
  for (const name of capabilities) {
    const def = registry.getDefinition(name);
    if (def) resolved.push(def.declaration);
  }
  return resolved;
}

/** Bloc « outils disponibles » injecté dans le prompt système. */
export function buildToolSection(tools: ToolDeclaration[]): string {
  if (tools.length === 0) {
    return "OUTILS DISPONIBLES : aucun. Tu ne peux produire qu'une réponse finale textuelle.";
  }
  return [
    "OUTILS DISPONIBLES (tu peux les appeler) :",
    tools.map(renderTool).join("\n"),
    "",
    "PROTOCOLE D'APPEL D'OUTIL — impératif :",
    "- Pour agir, réponds avec un objet JSON strict (une ligne « Pensée : … » peut le précéder) :",
    '  {"tool_calls": [{"name": "<outil>", "parameters": { ... }}]}',
    "- Regroupe les appels indépendants dans le même tableau tool_calls (6 max par tour).",
    "- Respecte exactement les noms de paramètres déclarés. N'invente jamais un outil hors de la liste.",
    "- Quand la tâche est terminée et vérifiée, ne renvoie AUCUN tool_calls :",
    "  rends le rapport final <result status=…><summary>…</summary><deliverable>…</deliverable><notes>…</notes></result>.",
  ].join("\n");
}

/**
 * Résumé compact du budget restant + phase courante, pour que le modèle
 * s'auto-régule et respecte la règle d'arrêt (pas 80 % d'exploration).
 * Les quotas affichés sont ABSOLUS par phase (source de vérité).
 */
export function buildBudgetSection(budget: AgentBudget, usage: BudgetUsage, phase?: string): string {
  const cost = budget.maxCost === Infinity ? "∞" : String(budget.maxCost);
  const lines = [
    "BUDGET DE MISSION (quotas absolus par phase, réserves étanches) :",
    phase ? `- phase courante: ${phase.toUpperCase()}` : "",
    `- itérations: ${usage.iterations}/${budget.maxIterations}`,
    `- total outils: ${usage.toolCalls}/${budget.maxToolCalls}`,
    `  · exploration: ${usage.readCalls}/${budget.maxRead}`,
    `  · écriture (réservé): ${usage.writeCalls}/${budget.maxWrite}`,
    `  · vérification (réservé): ${usage.verifyCalls}/${budget.maxVerify}`,
    `  · récupération (réservé): ${usage.recoveryCalls}/${budget.maxRecovery}`,
    `- fichiers lus: ${usage.filesRead}/${budget.maxFilesRead} | modifiés: ${usage.filesModified}`,
    `- coût estimé: ${Math.round(usage.cost)}/${cost}`,
    "",
    "RÈGLE D'ARRÊT : les appels d'écriture et de vérification sont RÉSERVÉS et ne peuvent",
    "pas être consommés par l'exploration. Dès le quota d'exploration atteint, PASSE À",
    "L'ACTION (écriture), puis VÉRIFIE (verify_file / verify_typecheck).",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Fidélité du rendu des résultats d'outils dans l'historique.
 *
 * Les tours RÉCENTS sont rendus quasi intégralement : c'est là que se trouve le
 * contenu de fichier lu ou le diagnostic de vérification sur lequel l'agent va
 * agir. L'ancien rendu tronquait TOUT résultat à 500 caractères : un fichier lu
 * n'était visible qu'en partie (le `searchText` d'un modify devenait introuvable)
 * et les `parsedErrors` d'un typecheck étaient coupés derrière `stdout`.
 */
const RECENT_TURNS_FULL_FIDELITY = 2;
const RECENT_RESULT_CHARS = 8_000;
const OLD_RESULT_CHARS = 400;

/** Clés rendues en premier : statut, erreur et diagnostic structuré d'abord. */
const PRIORITY_KEYS = [
  "status", "ok", "success", "error", "message", "path", "exitCode",
  "parsedErrors", "issues", "errors", "summary",
];
/** Sorties brutes redondantes dès qu'un diagnostic structuré est présent. */
const RAW_OUTPUT_KEYS = new Set(["stdout", "stderr", "output"]);

/**
 * Rend l'historique des observations sous une forme dense mais informative,
 * en bornant la taille pour ne pas exploser le contexte. Le tour le plus récent
 * est toujours conservé ; les plus anciens sont abandonnés en premier.
 */
export function buildObservationHistory(
  observations: readonly Observation[],
  maxChars: number
): string {
  if (observations.length === 0) return "";
  const parts: string[] = [];
  let total = 0;
  // Du plus récent au plus ancien : le budget profite d'abord aux tours récents.
  for (let i = observations.length - 1; i >= 0; i--) {
    const obs = observations[i];
    const recent = observations.length - 1 - i < RECENT_TURNS_FULL_FIDELITY;
    const resultChars = recent ? RECENT_RESULT_CHARS : OLD_RESULT_CHARS;
    const toolLines = obs.toolOutcomes.map((o) => {
      // Résultats et erreurs d'outils = données non fiables (fichiers, web,
      // issues…) : neutralisés avant d'entrer dans le prompt (AUDIT-006).
      const source = `tool:${o.invocation.name}`;
      const status = o.success
        ? (o.cached ? "OK (cache)" : "OK")
        : `ERREUR: ${guardUntrustedContent(o.error ?? "inconnue", source).text}`;
      const preview = guardUntrustedContent(renderResultForModel(o.result, resultChars), source).text;
      return `  • ${o.invocation.name}(${renderParams(o.invocation.parameters)}) → ${status}${preview ? `\n${indent(preview)}` : ""}`;
    });
    const block = [
      `— Tour ${obs.iteration} —`,
      obs.reasoning ? `raisonnement: ${truncate(obs.reasoning, recent ? 1_500 : 600)}` : "",
      toolLines.length ? `actions:\n${toolLines.join("\n")}` : "(aucune action)",
    ]
      .filter(Boolean)
      .join("\n");

    if (parts.length === 0) {
      // Le tour le plus récent est toujours présent (tronqué si nécessaire).
      const kept = truncate(block, maxChars);
      parts.push(kept);
      total = kept.length;
      continue;
    }
    if (total + block.length + 2 > maxChars) {
      parts.unshift(`(… ${i + 1} tour(s) plus ancien(s) omis pour tenir dans le contexte)`);
      break;
    }
    parts.unshift(block);
    total += block.length + 2;
  }
  return `HISTORIQUE DES TOURS PRÉCÉDENTS :\n${parts.join("\n\n")}`;
}

/**
 * Rendu d'un résultat d'outil pour le modèle :
 *  - le contenu de fichier (`content`) est rendu en texte brut, pas en JSON
 *    échappé (lisible, et ~30 % de jetons en moins sur du code) ;
 *  - statut / erreurs / diagnostics structurés passent avant le reste ;
 *  - stdout/stderr bruts sont omis quand un diagnostic structuré existe.
 */
export function renderResultForModel(result: unknown, maxChars: number): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return truncate(result, maxChars);
  if (typeof result !== "object" || Array.isArray(result)) {
    return truncate(safeStringify(result), maxChars);
  }

  const obj = result as Record<string, unknown>;
  const hasStructuredDiagnostics = ["parsedErrors", "issues", "errors"].some((k) => {
    const v = obj[k];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });

  const ordered: Record<string, unknown> = {};
  for (const key of PRIORITY_KEYS) {
    if (key in obj) ordered[key] = obj[key];
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key in ordered || key === "content") continue;
    if (hasStructuredDiagnostics && RAW_OUTPUT_KEYS.has(key)) continue;
    ordered[key] = value;
  }

  const meta = Object.keys(ordered).length > 0 ? safeStringify(ordered) : "";
  if (typeof obj.content !== "string") return truncate(meta, maxChars);

  const head = meta ? `${truncate(meta, Math.min(600, maxChars))}\n` : "";
  return `${head}--- contenu ---\n${truncate(obj.content, Math.max(0, maxChars - head.length))}`;
}

/** Paramètres d'appel compacts : les longs contenus écrits ne sont pas re-cités. */
function renderParams(params: Record<string, unknown>): string {
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    compact[key] = typeof value === "string" && value.length > 200
      ? `${value.slice(0, 200)}… [${value.length} car.]`
      : value;
  }
  return safeStringify(compact);
}

function indent(text: string): string {
  return text.split("\n").map((l) => `    ${l}`).join("\n");
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [tronqué ${text.length - max} car.]`;
}

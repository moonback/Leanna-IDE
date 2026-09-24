/**
 * Réconciliation des compteurs de démarrage.
 *
 * Le système compte des populations DIFFÉRENTES sous le même mot « agent » /
 * « outil ». Ce module rend ces distinctions explicites au démarrage, au lieu
 * de les laisser implicites (ce qui donnait l'impression d'une incohérence
 * entre 15 / 7 / 204~212 / 33).
 *
 * Il signale aussi deux asymétries réelles :
 *   1. capabilities déclarées sur un rôle mais absentes du ToolRegistry
 *      (« visible dans le mapping mais non exécutable ») ;
 *   2. rôles de délégation qui ne sont PAS des plugins runtime
 *      (« agent enregistré mais non activé comme plugin runtime »).
 *
 * Purement observationnel : aucune mutation d'état, aucun effet de bord.
 */

import type { AgentRuntime } from "./AgentRuntime.js";
import { listAgentDefinitions } from "../agents/roles.js";
import { defaultAgents } from "./agents/index.js";

export interface ReconciliationReport {
  delegationAgents: number;
  runtimeAgents: number;
  executableTools: number;
  mappedCapabilities: number;
  /** Capabilities déclarées par un rôle mais introuvables dans le ToolRegistry. */
  orphanCapabilities: string[];
  /** Rôles de délégation sans plugin runtime correspondant. */
  delegationOnlyRoles: string[];
  /** Outils exécutables non attribués à un rôle dans le mapping UI. */
  unmappedExecutableTools: number;
}

/**
 * Construit et logge le rapport de réconciliation à partir du runtime démarré.
 * Doit être appelée après `runtime.start()` ET après le chargement des custom
 * skills (sinon le total d'outils exécutables est sous-évalué).
 */
export function reconcileAndLogCounts(runtime: AgentRuntime): ReconciliationReport {
  // (A) Flotte de délégation : rôles définis dans roles.ts (statiques + dynamiques).
  const delegationDefs = listAgentDefinitions();
  const delegationRoleNames = new Set(delegationDefs.map((d) => d.role));

  // (B) Flotte runtime : plugins enregistrés dans AgentRuntime.
  const runtimeAgentIds = new Set(defaultAgents.map((a) => a.metadata.id));

  // (C) Outils réellement exécutables : source de vérité = ToolRegistry.
  const executableToolNames = new Set(
    runtime.tools.getDeclarations().map((d) => d.name)
  );

  // (D) Capabilities distinctes déclarées par tous les rôles (= base du mapping UI).
  const mappedCapabilities = new Set<string>();
  for (const def of delegationDefs) {
    for (const cap of def.capabilities) mappedCapabilities.add(cap);
  }

  // Asymétrie 1 : capability déclarée mais aucun outil exécutable ne matche.
  const orphanCapabilities = [...mappedCapabilities]
    .filter((cap) => !executableToolNames.has(cap))
    .sort();

  // Asymétrie 2 : rôle de délégation sans plugin runtime homonyme.
  const delegationOnlyRoles = [...delegationRoleNames]
    .filter((role) => !runtimeAgentIds.has(role))
    .sort();

  // Asymétrie 3 : outils exécutables non attribués à un rôle dans le mapping.
  const unmappedExecutableTools = [...executableToolNames].filter(
    (tool) => !mappedCapabilities.has(tool)
  ).length;

  const report: ReconciliationReport = {
    delegationAgents: delegationDefs.length,
    runtimeAgents: runtime.listAgents().length,
    executableTools: runtime.tools.size,
    mappedCapabilities: mappedCapabilities.size,
    orphanCapabilities,
    delegationOnlyRoles,
    unmappedExecutableTools,
  };

  // ── Log lisible : les 4 populations, explicitement nommées ──────────────────
  console.log(
    "[Reconcile] Populations distinctes au démarrage :\n" +
    `  • Agents de délégation (roles.ts)      : ${report.delegationAgents}\n` +
    `  • Agents runtime (AgentRuntime plugins) : ${report.runtimeAgents}\n` +
    `  • Outils exécutables (ToolRegistry)     : ${report.executableTools}\n` +
    `  • Capabilities mappées UI (roles.ts)    : ${report.mappedCapabilities}`
  );

  if (report.orphanCapabilities.length > 0) {
    console.warn(
      `[Reconcile] ⚠️ ${report.orphanCapabilities.length} capability(ies) déclarée(s) mais NON exécutable(s) ` +
      `(visible mapping, absente du ToolRegistry) : ${report.orphanCapabilities.join(", ")}`
    );
  }

  if (report.delegationOnlyRoles.length > 0) {
    console.warn(
      `[Reconcile] ⚠️ ${report.delegationOnlyRoles.length} rôle(s) de délégation SANS plugin runtime ` +
      `(exécutables via orchestrateur, pas via AgentRuntime.submit) : ${report.delegationOnlyRoles.join(", ")}`
    );
  }

  if (report.unmappedExecutableTools > 0) {
    console.warn(
      `[Reconcile] ⚠️ ${report.unmappedExecutableTools} outil(s) exécutable(s) sans attribution d'agent dans ` +
      `le mapping UI (fallback "writer" côté renderer).`
    );
  }

  return report;
}

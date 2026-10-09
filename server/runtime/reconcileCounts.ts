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
import { getToolCategory } from "../agents/toolAgentMapper.js";
import { defaultAgents } from "./agents/index.js";
import { buildToolInventory, formatSourceBreakdown, type ToolInventory } from "./ToolInventory.js";

export interface ReconciliationReport {
  delegationAgents: number;
  runtimeAgents: number;
  executableTools: number;
  mappedCapabilities: number;
  /** Capabilities déclarées par un rôle mais introuvables dans le ToolRegistry. */
  orphanCapabilities: string[];
  /** Rôles de délégation sans plugin runtime correspondant. */
  delegationOnlyRoles: string[];
  /**
   * Outils exécutables réellement sans attribution après TOUTES les couches
   * (explicite → capability → catégorie). Ceux-là seuls retombent sur `system`.
   */
  unmappedExecutableTools: number;
  /** Outils attribués via l'heuristique de catégorie (probable, pas certain). */
  categoryAttributedTools: number;
  /** Outils attribués via une capability de rôle. */
  capabilityAttributedTools: number;
  /** Outils attribués explicitement (ToolRegistry / socle sensible). */
  explicitlyAttributedTools: number;
  /**
   * Liste NOMINATIVE des outils orphelins (source `unattributed`), avec la
   * catégorie sémantique éventuellement détectée mais non concluante. Permet de
   * savoir EXACTEMENT quels outils retombent sur « system », pour les traiter.
   */
  unattributedTools: { tool: string; detectedCategory?: string }[];
  /**
   * Inventaire canonique dérivé du ToolRegistry : source de vérité unique dont
   * TOUS les compteurs d'outils ci-dessus sont extraits. Expose la ventilation
   * par provenance (builtin/mcp/custom), qui explique mécaniquement les écarts
   * entre les snapshots de compteurs pris à des instants différents du boot.
   */
  inventory: ToolInventory;
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

  // (C) Inventaire canonique : SOURCE DE VÉRITÉ UNIQUE. Tous les compteurs
  // d'outils ci-dessous en sont dérivés, au lieu de re-parcourir le registre
  // avec des logiques parallèles (cause historique des écarts inexpliqués).
  const inventory = buildToolInventory(runtime.tools);
  const executableToolNames = new Set(inventory.records.map((r) => r.id));

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

  // Asymétrie 3 : attribution réelle des outils exécutables, LUE depuis
  // l'inventaire (qui a déjà résolu la cascade explicit → capability → category
  // → unattributed pour chaque outil). Un seul parcours, une seule vérité.
  const explicitlyAttributedTools = inventory.summary.byAttribution.explicit;
  const capabilityAttributedTools = inventory.summary.byAttribution.capability;
  const categoryAttributedTools = inventory.summary.byAttribution.category;
  const unmappedExecutableTools = inventory.summary.byAttribution.unattributed;
  const unattributedTools = inventory.records
    .filter((r) => r.attributionSource === "unattributed")
    .map((r) => {
      const detectedCategory = getToolCategory(r.id);
      return detectedCategory ? { tool: r.id, detectedCategory } : { tool: r.id };
    })
    .sort((a, b) => a.tool.localeCompare(b.tool));

  const report: ReconciliationReport = {
    delegationAgents: delegationDefs.length,
    runtimeAgents: runtime.listAgents().length,
    executableTools: inventory.summary.total,
    mappedCapabilities: mappedCapabilities.size,
    orphanCapabilities,
    delegationOnlyRoles,
    unmappedExecutableTools,
    categoryAttributedTools,
    capabilityAttributedTools,
    explicitlyAttributedTools,
    unattributedTools,
    inventory,
  };

  // ── Log lisible : les 4 populations, explicitement nommées ──────────────────
  console.log(
    "[Reconcile] Populations distinctes au démarrage :\n" +
    `  • Agents de délégation (roles.ts)      : ${report.delegationAgents}\n` +
    `  • Agents runtime (AgentRuntime plugins) : ${report.runtimeAgents}\n` +
    `  • Outils exécutables (ToolRegistry)     : ${report.executableTools} (${formatSourceBreakdown(inventory.summary)})\n` +
    `  • Capabilities mappées UI (roles.ts)    : ${report.mappedCapabilities}`
  );

  // ── Ventilation canonique par provenance ────────────────────────────────────
  // C'est CE log qui dissipe l'écart « 225 → 229 » : le premier chiffre était un
  // snapshot des outils builtin pris avant l'enregistrement MCP/custom ; le
  // total final est builtin + mcp + custom, désormais explicite.
  console.log(
    "[Reconcile] Inventaire canonique des outils (par provenance) :\n" +
    `  • builtin : ${inventory.summary.bySource.builtin}\n` +
    `  • mcp     : ${inventory.summary.bySource.mcp}\n` +
    `  • custom  : ${inventory.summary.bySource.custom}\n` +
    `  • unknown : ${inventory.summary.bySource.unknown}\n` +
    `  → total exécutable : ${inventory.summary.total} ` +
    `(dont ${inventory.summary.sideEffecting} à effet de bord)`
  );
  if (inventory.summary.bySource.unknown > 0) {
    console.warn(
      `[Reconcile] ⚠️ ${inventory.summary.bySource.unknown} outil(s) de provenance « unknown » ` +
      `(enregistrés sans source explicite). À tagguer à la source d'enregistrement.`
    );
  }

  // ── Attribution réelle des outils (cascade explicit → capability → category) ─
  console.log(
    "[Reconcile] Attribution des outils exécutables :\n" +
    `  • Explicite (ToolRegistry / socle sensible) : ${report.explicitlyAttributedTools}\n` +
    `  • Capability de rôle (roles.ts)             : ${report.capabilityAttributedTools}\n` +
    `  • Catégorie sémantique (heuristique)        : ${report.categoryAttributedTools}\n` +
    `  • Non attribué → rôle « system »            : ${report.unmappedExecutableTools}`
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

  if (report.categoryAttributedTools > 0) {
    console.log(
      `[Reconcile] ℹ️ ${report.categoryAttributedTools} outil(s) attribué(s) par catégorie sémantique ` +
      `→ ENSEMBLE d'agents (affiché « Plusieurs agents », jamais un propriétaire unique). ` +
      `Précisable via une attribution explicite (ToolRegistry) au besoin.`
    );
  }

  if (report.unmappedExecutableTools > 0) {
    // Liste NOMINATIVE : chaque orphelin, avec la catégorie éventuellement
    // détectée par mot-clé mais qui n'a PAS suffi (rare — normalement une
    // catégorie détectée bascule en 'category'). « aucune catégorie » = le nom
    // ne contient aucun mot-clé connu → candidat idéal pour, au choix, ajouter
    // un mot-clé dans TOOL_CATEGORIES ou déclarer une attribution explicite.
    const lines = report.unattributedTools
      .map((u) => `      - ${u.tool}${u.detectedCategory ? ` (catégorie détectée: ${u.detectedCategory})` : " (aucune catégorie)"}`)
      .join("\n");
    console.warn(
      `[Reconcile] ⚠️ ${report.unmappedExecutableTools} outil(s) exécutable(s) sans attribution ` +
      `(ni explicite, ni capability, ni catégorie) — affichés « Exécution système » (rôle "system"). ` +
      `Statut NEUTRE : sans impact sur les permissions (cf. PermissionPolicy), seulement sur l'attribution UI.\n` +
      `    Pour les rattacher : ajouter un mot-clé dans TOOL_CATEGORIES (bascule → catégorie) ` +
      `ou déclarer une attribution explicite (bascule → explicite). Liste :\n${lines}`
    );
  }

  return report;
}

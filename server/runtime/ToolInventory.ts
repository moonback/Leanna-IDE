/**
 * ToolInventory — Inventaire canonique des outils.
 *
 * ── Pourquoi ce module existe ────────────────────────────────────────────────
 * Les logs de démarrage affichaient des compteurs d'outils en apparence
 * incohérents :
 *   [SkillManagerV2] 225 outil(s) ... enregistrés depuis 28 skill(s)
 *   [Bootstrap] ✓ Mission System initialisé (201 skills disponibles)
 *   [Bootstrap] ✅ Initialisation complète: 229 outils, 20 agents
 *
 * Ces trois nombres mesurent des POPULATIONS DIFFÉRENTES à des INSTANTS
 * DIFFÉRENTS, mais rien dans les logs ne le disait :
 *   • 225 = snapshot des outils `builtin` au moment du log (figé, pris AVANT
 *           l'enregistrement des outils MCP et custom) ;
 *   • 229 = état FINAL vivant du ToolRegistry (builtin + mcp + custom) ;
 *   •  201 = outils AUTORISÉS en mission autonome (229 moins les outils
 *           `browser_*` pilotés par la webview, sauf `browser_web_search`).
 *
 * L'inventaire canonique résout cela à la racine : il n'existe qu'UNE source de
 * vérité (le ToolRegistry), et tout compteur en est DÉRIVÉ. Chaque outil porte
 * un identifiant stable, un propriétaire, une source d'enregistrement, un état
 * d'activation et un niveau d'autorisation. Les écarts ne sont plus mystérieux :
 * ils se lisent dans la ventilation par source.
 *
 * Purement observationnel : aucune mutation du registre, aucun effet de bord.
 */

import type { ToolRegistry } from "./ToolRegistry.js";
import type { ToolDefinition, ToolPermission, ToolSource } from "./types.js";
import { normalizePermissions } from "./types.js";
import { resolveToolAttribution, getAgentsForTool } from "../agents/toolAgentMapper.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Niveau d'autorisation dérivé des permissions déclarées de l'outil. */
export type ToolAuthorizationLevel =
  | "read-only" // aucune permission à effet de bord
  | "write" // écrit des fichiers / ressources, mais ni exec ni réseau
  | "network" // accès réseau sortant
  | "exec" // exécution de commandes / processus
  | "dangerous"; // opération destructrice marquée explicitement

/**
 * Enregistrement canonique d'un outil. C'est l'unité de l'inventaire : une
 * ligne par outil réellement présent dans le ToolRegistry.
 */
export interface ToolInventoryRecord {
  /** Identifiant stable = nom unique de l'outil dans le registre. */
  id: string;
  /** Nom exposé au LLM (identique à `id` ; conservé pour lisibilité). */
  name: string;
  /** Catégorie (nom de la skill d'origine, le plus souvent). */
  category?: string;
  /** Propriétaire logique : skill ou id de serveur MCP ayant enregistré l'outil. */
  owner: string;
  /** Provenance de l'enregistrement. */
  source: ToolSource;
  /** Horodatage d'enregistrement (epoch ms), si connu. */
  registeredAt?: number;
  /** Toujours `true` : un outil présent dans le registre est exécutable. */
  enabled: boolean;
  /** Permissions canoniques déclarées (normalisées, dédoublonnées). */
  permissions: ToolPermission[];
  /** Niveau d'autorisation dérivé des permissions. */
  authorization: ToolAuthorizationLevel;
  /** A-t-il un effet de bord (write/exec/network/dangerous) ? */
  hasSideEffect: boolean;
  /** Agent affiché responsable (cascade d'attribution déterministe). */
  attributedAgent: string;
  /** Origine de l'attribution d'agent. */
  attributionSource: "explicit" | "capability" | "category" | "unattributed";
  /** Ensemble des agents éligibles (pour les outils multi-agents). */
  eligibleAgents: string[];
  /** Serveur MCP d'origine, le cas échéant. */
  mcpServerId?: string;
}

/** Totaux dérivés de l'inventaire, ventilés par axe. */
export interface ToolInventorySummary {
  /** Nombre total d'outils exécutables (= ToolRegistry.size). */
  total: number;
  /** Ventilation par provenance. */
  bySource: Record<ToolSource, number>;
  /** Ventilation par niveau d'autorisation. */
  byAuthorization: Record<ToolAuthorizationLevel, number>;
  /** Ventilation par origine d'attribution d'agent. */
  byAttribution: Record<ToolInventoryRecord["attributionSource"], number>;
  /** Nombre d'outils à effet de bord. */
  sideEffecting: number;
}

export interface ToolInventory {
  records: ToolInventoryRecord[];
  summary: ToolInventorySummary;
  /** Instant de capture (epoch ms). */
  capturedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Construction
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Déduit le niveau d'autorisation le plus élevé à partir des permissions.
 * L'ordre de priorité reflète le risque croissant.
 */
export function deriveAuthorizationLevel(
  permissions: readonly ToolPermission[] | undefined
): ToolAuthorizationLevel {
  const set = new Set(normalizePermissions(permissions));
  if (set.has("dangerous")) return "dangerous";
  if (set.has("exec")) return "exec";
  if (set.has("network")) return "network";
  if (set.has("write")) return "write";
  return "read-only";
}

function hasSideEffect(permissions: readonly ToolPermission[] | undefined): boolean {
  const set = new Set(normalizePermissions(permissions));
  return set.has("write") || set.has("exec") || set.has("network") || set.has("dangerous");
}

function toRecord(def: ToolDefinition): ToolInventoryRecord {
  const name = def.declaration.name;
  const permissions = normalizePermissions(def.permissions);
  const attribution = resolveToolAttribution(name);
  const mcpServerId = (def.declaration as { _mcpServerId?: string })._mcpServerId;

  return {
    id: name,
    name,
    category: def.category,
    owner: def.owner ?? def.category ?? "unknown",
    source: def.source ?? (mcpServerId ? "mcp" : "unknown"),
    registeredAt: def.registeredAt,
    enabled: true,
    permissions,
    authorization: deriveAuthorizationLevel(permissions),
    hasSideEffect: hasSideEffect(permissions),
    attributedAgent: attribution.role,
    attributionSource: attribution.source,
    eligibleAgents: getAgentsForTool(name),
    mcpServerId,
  };
}

function emptySourceCounts(): Record<ToolSource, number> {
  return { builtin: 0, mcp: 0, custom: 0, unknown: 0 };
}

function emptyAuthCounts(): Record<ToolAuthorizationLevel, number> {
  return { "read-only": 0, write: 0, network: 0, exec: 0, dangerous: 0 };
}

function emptyAttributionCounts(): Record<ToolInventoryRecord["attributionSource"], number> {
  return { explicit: 0, capability: 0, category: 0, unattributed: 0 };
}

/**
 * Construit l'inventaire canonique à partir du ToolRegistry.
 *
 * Doit être appelé APRÈS l'enregistrement de toutes les skills (builtin, mcp,
 * custom) pour refléter l'état final. Appelé plus tôt, il reflète fidèlement
 * l'état partiel de ce moment — ce qui reste correct, mais sous-évalue le total.
 */
export function buildToolInventory(registry: ToolRegistry): ToolInventory {
  const records = registry
    .getDefinitions()
    .map(toRecord)
    .sort((a, b) => a.name.localeCompare(b.name));

  const bySource = emptySourceCounts();
  const byAuthorization = emptyAuthCounts();
  const byAttribution = emptyAttributionCounts();
  let sideEffecting = 0;

  for (const r of records) {
    bySource[r.source]++;
    byAuthorization[r.authorization]++;
    byAttribution[r.attributionSource]++;
    if (r.hasSideEffect) sideEffecting++;
  }

  return {
    records,
    summary: {
      total: records.length,
      bySource,
      byAuthorization,
      byAttribution,
      sideEffecting,
    },
    capturedAt: Date.now(),
  };
}

/**
 * Formate la ventilation par source en une ligne lisible, p. ex. :
 *   « 225 builtin + 2 mcp + 2 custom ».
 * Omet les sources à zéro pour rester concis.
 */
export function formatSourceBreakdown(summary: ToolInventorySummary): string {
  const order: ToolSource[] = ["builtin", "mcp", "custom", "unknown"];
  const parts = order
    .filter((s) => summary.bySource[s] > 0)
    .map((s) => `${summary.bySource[s]} ${s}`);
  return parts.join(" + ") || "0";
}

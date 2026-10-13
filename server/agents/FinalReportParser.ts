/**
 * FinalReportParser — Lecture du contrat de sortie XML des agents.
 *
 * Le prompt d'agent (roles.ts) impose un rapport final de la forme :
 *
 *   <result status="success|partial|failed|needs_input" files_modified="a.ts,b.ts">
 *     <summary>…</summary>
 *     <deliverable>…</deliverable>
 *     <notes>…</notes>
 *   </result>
 *
 * Jusqu'ici ce contrat n'était lu par AUCUN consommateur : le runtime agentique
 * relançait un appel LLM supplémentaire pour re-synthétiser la mission en JSON,
 * et le parseur legacy ne cherchait que des titres Markdown. Ce module rend le
 * contrat exploitable (fonctions pures, sans dépendance d'exécution).
 */

import { DelegationParser } from "./DelegationParser.js";
import type { AgentRole } from "./types.js";
import type { ProposedDelegation } from "../runtime/agentic/types.js";

export type FinalReportStatus = "success" | "partial" | "failed" | "needs_input";

export interface FinalReport {
  status?: FinalReportStatus;
  summary: string;
  deliverable: string;
  notes: string;
  filesModified: string[];
}

const STATUSES: readonly FinalReportStatus[] = ["success", "partial", "failed", "needs_input"];

/** Contenu d'une balise enfant, ou "" si absente. */
function tag(body: string, name: string): string {
  const match = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return match ? match[1].trim() : "";
}

/** Valeur d'un attribut de la balise ouvrante `<result …>`. */
function attr(openTag: string, name: string): string | undefined {
  const match = openTag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1].trim() : undefined;
}

/**
 * Extrait le DERNIER bloc `<result>` d'un texte (le rapport final suit
 * d'éventuels brouillons). Retourne `null` si aucun bloc exploitable
 * (balise absente ou `<summary>` vide).
 */
export function parseFinalReport(text: string): FinalReport | null {
  if (!text || !text.includes("<result")) return null;
  const blocks = [...text.matchAll(/<result\b([^>]*)>([\s\S]*?)<\/result>/gi)];
  const last = blocks[blocks.length - 1];
  if (!last) return null;

  const [, openTag, body] = last;
  const summary = tag(body, "summary");
  if (!summary) return null;

  const rawStatus = attr(openTag, "status")?.toLowerCase();
  const status = STATUSES.find((s) => s === rawStatus);
  const files = (attr(openTag, "files_modified") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  return {
    status,
    summary,
    deliverable: tag(body, "deliverable"),
    notes: tag(body, "notes"),
    filesModified: files,
  };
}

/** Lignes de liste (`- …`, `* …`, `1. …`) d'une section de notes. */
export function noteItems(notes: string): string[] {
  return notes
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^([-*•]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

const delegationParser = new DelegationParser();

/**
 * Délégations proposées par l'agent (blocs `## Délégation`). Le runtime
 * agentique ne les exécute PAS automatiquement (pas de délégation non
 * sollicitée) : elles remontent à l'utilisateur, qui peut les lancer en un clic.
 */
export function proposedDelegations(text: string, fromRole: AgentRole): ProposedDelegation[] {
  if (!text || !/##\s*d[ée]l[ée]g/i.test(text)) return [];
  const parsed = delegationParser.parse(text, fromRole);
  return [
    ...parsed.delegations.map((d) => ({ role: d.targetRole, reason: d.reason, files: d.files })),
    ...parsed.openDelegations.map((d) => ({ reason: d.reason, files: d.files })),
  ];
}

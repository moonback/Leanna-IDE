/**
 * Contexte de sources pour la génération (documents, podcast, comparaison, insights).
 *
 * Auparavant chaque source n'apportait que ses 5 premiers chunks : sur un long
 * PDF, la génération ne voyait que les premières pages. Ici, chaque source reçoit
 * une part égale d'un budget de caractères, remplie de passages répartis
 * uniformément sur tout le document (début, milieu, fin), dans l'ordre.
 */

import type { Source } from "./types.js";

export interface SourcesContextOptions {
  /** Budget total en caractères pour l'ensemble des sources */
  budgetChars?: number;
  /** En-tête de section d'une source (défaut : "## Titre") */
  heading?: (source: Source) => string;
  /** Ajouter les mots-clés de la source sous le résumé */
  includeKeywords?: boolean;
  /** Libellé du bloc d'extraits */
  excerptsLabel?: string;
  /** Séparateur entre deux sources */
  separator?: string;
}

/** ≈ 12k tokens : laisse de la marge aux prompts et à la réponse. */
export const DEFAULT_CONTEXT_BUDGET = 48_000;
/** Rapports longs (16k tokens de sortie) : on peut leur donner plus de matière. */
export const REPORT_CONTEXT_BUDGET = 80_000;

/**
 * Choisit `count` indices répartis uniformément dans [0, length), triés,
 * en incluant toujours le premier et le dernier.
 */
export function spreadIndices(length: number, count: number): number[] {
  if (length <= 0 || count <= 0) return [];
  if (count >= length) return Array.from({ length }, (_, i) => i);
  if (count === 1) return [0];
  const indices = new Set<number>();
  for (let i = 0; i < count; i++) {
    indices.add(Math.round((i * (length - 1)) / (count - 1)));
  }
  return [...indices].sort((a, b) => a - b);
}

export function buildSourcesContext(sources: Source[], options: SourcesContextOptions = {}): string {
  const {
    budgetChars = DEFAULT_CONTEXT_BUDGET,
    heading = (s: Source) => `## ${s.title}`,
    includeKeywords = false,
    excerptsLabel = "Extraits clés :",
    separator = "\n\n---\n\n",
  } = options;

  if (sources.length === 0) return "";
  const perSource = Math.max(1_500, Math.floor(budgetChars / sources.length));

  return sources
    .map(source => {
      const header = [
        heading(source),
        source.summary ? source.summary : "",
        includeKeywords && source.keywords.length > 0 ? `Mots-clés : ${source.keywords.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const remaining = perSource - header.length;
      const chunks = source.chunks.filter(c => c.content.trim().length > 0);
      if (remaining <= 0 || chunks.length === 0) return header;

      // Estimer combien de passages tiennent, puis les répartir sur tout le document.
      const avgLength = chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length;
      const fitCount = Math.max(1, Math.floor(remaining / (avgLength + 2)));
      const picked: string[] = [];
      let used = 0;
      for (const index of spreadIndices(chunks.length, fitCount)) {
        const content = chunks[index].content.trim();
        if (used + content.length > remaining) {
          if (picked.length === 0) picked.push(content.slice(0, remaining));
          break;
        }
        picked.push(content);
        used += content.length + 2;
      }

      return `${header}\n\n${excerptsLabel}\n${picked.join("\n\n")}`;
    })
    .join(separator);
}

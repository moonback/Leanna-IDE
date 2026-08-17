/**
 * RAGEngine — Retrieval-Augmented Generation pour les notebooks
 *
 * Moteur de recherche sémantique local (TF-IDF) sur les chunks des sources.
 * Fournit le contexte groundé pour le chat Q&A avec citations.
 */

import type { Source, SourceChunk, RAGSearchOptions, RAGSearchResult } from "./types";

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_MAX_CHUNKS = 10;
const DEFAULT_MIN_RELEVANCE = 0.1;

// ═══════════════════════════════════════════════════════════════════════════════

export class RAGEngine {

  /**
   * Recherche les chunks les plus pertinents pour une query dans un ensemble de sources.
   */
  search(query: string, sources: Source[], options: RAGSearchOptions = {}): RAGSearchResult[] {
    const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
    const minRelevance = options.minRelevance ?? DEFAULT_MIN_RELEVANCE;

    // Filtrer par source IDs si spécifié
    const filteredSources = options.sourceIds
      ? sources.filter(s => options.sourceIds!.includes(s.id))
      : sources;

    if (filteredSources.length === 0) return [];

    // Tokeniser la query
    const queryTokens = this.tokenize(query.toLowerCase());
    if (queryTokens.length === 0) return [];

    // Calculer IDF global sur l'ensemble des chunks
    const allChunks: { chunk: SourceChunk; source: Source }[] = [];
    for (const source of filteredSources) {
      for (const chunk of source.chunks) {
        allChunks.push({ chunk, source });
      }
    }

    const totalDocs = allChunks.length;
    if (totalDocs === 0) return [];

    // Calculer le document frequency pour chaque terme de la query
    const docFreq = new Map<string, number>();
    for (const token of queryTokens) {
      let count = 0;
      for (const { chunk } of allChunks) {
        if (chunk.content.toLowerCase().includes(token)) {
          count++;
        }
      }
      docFreq.set(token, count);
    }

    // Scorer chaque chunk
    const results: RAGSearchResult[] = [];

    for (const { chunk, source } of allChunks) {
      const score = this.scoreChunk(chunk, queryTokens, docFreq, totalDocs, query);
      if (score >= minRelevance) {
        results.push({ chunk, source, relevance: score });
      }
    }

    // Trier par pertinence décroissante
    results.sort((a, b) => b.relevance - a.relevance);

    // Limiter le nombre de résultats
    return results.slice(0, maxChunks);
  }

  /**
   * Construit le contexte textuel pour le LLM à partir des résultats RAG.
   * Inclut les citations formatées pour extraction ultérieure.
   */
  buildContext(results: RAGSearchResult[]): string {
    if (results.length === 0) {
      return "Aucun contenu pertinent trouvé dans les sources.";
    }

    const sections: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const { chunk, source, relevance } = results[i];
      sections.push(
        `[SOURCE ${i + 1}: "${source.title}" | Pertinence: ${(relevance * 100).toFixed(0)}%]\n` +
        `${chunk.content}\n` +
        `[/SOURCE ${i + 1}]`
      );
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * Extrait les citations depuis la réponse du LLM.
   * Cherche les références [SOURCE N] dans la réponse.
   */
  extractCitations(
    response: string,
    ragResults: RAGSearchResult[]
  ): { sourceId: string; sourceTitle: string; chunkId: string; excerpt: string; relevance: number }[] {
    const citations: { sourceId: string; sourceTitle: string; chunkId: string; excerpt: string; relevance: number }[] = [];
    const cited = new Set<string>();

    // Chercher les références explicites [SOURCE N] ou [N]
    const refPattern = /\[(?:SOURCE\s*)?(\d+)\]/gi;
    let match: RegExpExecArray | null;

    while ((match = refPattern.exec(response)) !== null) {
      const index = parseInt(match[1]) - 1;
      if (index >= 0 && index < ragResults.length) {
        const result = ragResults[index];
        if (!cited.has(result.chunk.id)) {
          cited.add(result.chunk.id);
          citations.push({
            sourceId: result.source.id,
            sourceTitle: result.source.title,
            chunkId: result.chunk.id,
            excerpt: result.chunk.content.slice(0, 200),
            relevance: result.relevance,
          });
        }
      }
    }

    // Si aucune citation explicite trouvée, citer les top résultats utilisés
    if (citations.length === 0 && ragResults.length > 0) {
      for (const result of ragResults.slice(0, 3)) {
        if (result.relevance >= 0.3) {
          citations.push({
            sourceId: result.source.id,
            sourceTitle: result.source.title,
            chunkId: result.chunk.id,
            excerpt: result.chunk.content.slice(0, 200),
            relevance: result.relevance,
          });
        }
      }
    }

    return citations;
  }

  // ─── Scoring TF-IDF ──────────────────────────────────────────────────────

  private scoreChunk(
    chunk: SourceChunk,
    queryTokens: string[],
    docFreq: Map<string, number>,
    totalDocs: number,
    originalQuery: string
  ): number {
    const contentLower = chunk.content.toLowerCase();
    const contentTokens = this.tokenize(contentLower);

    if (contentTokens.length === 0) return 0;

    let score = 0;
    let matchedTerms = 0;

    // TF-IDF scoring
    for (const token of queryTokens) {
      // Term Frequency (normalisée)
      const tf = contentTokens.filter(t => t === token).length / contentTokens.length;
      if (tf === 0) continue;

      // Inverse Document Frequency
      const df = docFreq.get(token) || 1;
      const idf = Math.log(1 + totalDocs / df);

      score += tf * idf;
      matchedTerms++;
    }

    // Bonus: correspondance exacte de la phrase
    if (originalQuery.length >= 4 && contentLower.includes(originalQuery.toLowerCase())) {
      score += 0.5;
    }

    // Bonus: couverture de la query (% de termes trouvés)
    const coverage = matchedTerms / queryTokens.length;
    score += coverage * 0.3;

    // Bonus: proximité des termes (termes proches dans le texte)
    if (matchedTerms >= 2) {
      const proximityBonus = this.computeProximityBonus(contentLower, queryTokens);
      score += proximityBonus;
    }

    // Normaliser entre 0 et 1
    return Math.min(score, 1.0);
  }

  /**
   * Bonus de proximité : les termes de la query sont-ils proches dans le chunk ?
   */
  private computeProximityBonus(content: string, queryTokens: string[]): number {
    const positions: number[] = [];

    for (const token of queryTokens) {
      const idx = content.indexOf(token);
      if (idx >= 0) positions.push(idx);
    }

    if (positions.length < 2) return 0;

    positions.sort((a, b) => a - b);
    const span = positions[positions.length - 1] - positions[0];
    const maxSpan = 500; // Si les termes sont dans un fenêtre de 500 chars

    if (span <= maxSpan) {
      return 0.2 * (1 - span / maxSpan);
    }

    return 0;
  }

  // ─── Tokenisation ────────────────────────────────────────────────────────

  private tokenize(text: string): string[] {
    return text
      .split(/[^a-zà-ÿ0-9]+/)
      .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
  }
}

// ─── Stop Words FR/EN ────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  // Français
  "le", "la", "les", "de", "du", "des", "un", "une", "et", "en", "au", "aux",
  "ce", "ces", "son", "sa", "ses", "il", "elle", "on", "nous", "vous", "ils",
  "elles", "se", "ne", "pas", "que", "qui", "ou", "mais", "donc", "car",
  "dans", "sur", "par", "pour", "avec", "sans", "sous", "entre",
  "cette", "mon", "ton", "leur", "nos", "vos", "leurs",
  "est", "sont", "été", "avoir", "être", "fait", "peut", "plus",
  // Anglais
  "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would",
  "shall", "should", "may", "might", "can", "could",
  "and", "or", "but", "not", "no", "if", "then", "else",
  "an", "to", "of", "in", "on", "at", "by", "for", "with",
  "from", "up", "out", "off", "over", "under", "again",
  "this", "that", "these", "those", "it", "its",
  "he", "she", "they", "we", "you", "me", "him", "her", "us", "them",
]);

// Singleton
export const ragEngine = new RAGEngine();

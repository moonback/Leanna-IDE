/**
 * RAGEngine — Retrieval-Augmented Generation pour les notebooks
 *
 * Moteur de recherche HYBRIDE :
 *   1. Recherche sémantique via Gemini Embeddings (similarité cosinus)
 *   2. Recherche lexicale TF-IDF (correspondance exacte de termes)
 *   3. Fusion Reciprocal Rank Fusion (RRF) des deux scores
 *
 * La combinaison hybride garantit de bons résultats même quand :
 * - Les termes sont différents mais le sens est proche (embeddings)
 * - La correspondance exacte est importante (TF-IDF)
 */

import { createLogger } from "../utils/logger";
import { embeddingStore } from "./EmbeddingStore";
import type { Source, SourceChunk, RAGSearchOptions, RAGSearchResult } from "./types";

const log = createLogger("RAGEngine");

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_MAX_CHUNKS = 10;
const DEFAULT_MIN_RELEVANCE = 0.1;

/** Poids de la recherche sémantique dans le score final */
const SEMANTIC_WEIGHT = 0.65;
/** Poids de la recherche lexicale dans le score final */
const LEXICAL_WEIGHT = 0.35;

/** Constante k pour le Reciprocal Rank Fusion */
const RRF_K = 60;

// ═══════════════════════════════════════════════════════════════════════════════

export class RAGEngine {

  /**
   * Recherche hybride : embeddings + TF-IDF avec fusion RRF.
   * Fallback automatique sur TF-IDF seul si les embeddings ne sont pas disponibles.
   */
  async searchHybrid(query: string, sources: Source[], options: RAGSearchOptions = {}): Promise<RAGSearchResult[]> {
    const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
    const minRelevance = options.minRelevance ?? DEFAULT_MIN_RELEVANCE;

    const filteredSources = options.sourceIds
      ? sources.filter(s => options.sourceIds!.includes(s.id))
      : sources;

    if (filteredSources.length === 0) return [];

    // Collecter tous les chunks
    const chunkMap = new Map<string, { chunk: SourceChunk; source: Source }>();
    for (const source of filteredSources) {
      for (const chunk of source.chunks) {
        chunkMap.set(chunk.id, { chunk, source });
      }
    }

    if (chunkMap.size === 0) return [];

    // 1. Recherche sémantique via embeddings
    let semanticResults: Map<string, number> = new Map();
    try {
      const embeddingResults = await embeddingStore.search(query, {
        sourceIds: options.sourceIds,
        maxResults: maxChunks * 3, // Récupérer plus pour la fusion
        minSimilarity: 0.2,
      });

      for (const result of embeddingResults) {
        if (chunkMap.has(result.chunkId)) {
          semanticResults.set(result.chunkId, result.similarity);
        }
      }
    } catch (e: any) {
      log.warn(`Embeddings search fallback: ${e.message}`);
      // Continue avec TF-IDF seul
    }

    // 2. Recherche lexicale TF-IDF
    const lexicalResults = this.searchTFIDF(query, filteredSources, maxChunks * 3);

    // 3. Fusion des résultats
    const fusedScores = new Map<string, number>();

    if (semanticResults.size > 0) {
      // Mode hybride : Reciprocal Rank Fusion
      const semanticRanked = Array.from(semanticResults.entries())
        .sort((a, b) => b[1] - a[1]);
      const lexicalRanked = lexicalResults
        .sort((a, b) => b.relevance - a.relevance);

      // RRF pour les résultats sémantiques
      for (let rank = 0; rank < semanticRanked.length; rank++) {
        const [chunkId, similarity] = semanticRanked[rank];
        const rrfScore = SEMANTIC_WEIGHT / (RRF_K + rank + 1);
        // Bonus pour les scores très élevés
        const similarityBonus = similarity > 0.7 ? 0.1 : similarity > 0.5 ? 0.05 : 0;
        fusedScores.set(chunkId, (fusedScores.get(chunkId) || 0) + rrfScore + similarityBonus);
      }

      // RRF pour les résultats lexicaux
      for (let rank = 0; rank < lexicalRanked.length; rank++) {
        const { chunk } = lexicalRanked[rank];
        const rrfScore = LEXICAL_WEIGHT / (RRF_K + rank + 1);
        fusedScores.set(chunk.id, (fusedScores.get(chunk.id) || 0) + rrfScore);
      }
    } else {
      // Mode TF-IDF seul (fallback)
      for (const result of lexicalResults) {
        fusedScores.set(result.chunk.id, result.relevance);
      }
    }

    // 4. Construire les résultats finaux
    const results: RAGSearchResult[] = [];
    for (const [chunkId, score] of fusedScores) {
      if (score < minRelevance) continue;
      const entry = chunkMap.get(chunkId);
      if (!entry) continue;
      results.push({
        chunk: entry.chunk,
        source: entry.source,
        relevance: Math.min(score, 1.0),
      });
    }

    // Trier et limiter
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, maxChunks);
  }

  /**
   * Recherche synchrone TF-IDF (pas d'embeddings).
   * Utilisé comme fallback et comme composante de la recherche hybride.
   */
  search(query: string, sources: Source[], options: RAGSearchOptions = {}): RAGSearchResult[] {
    const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
    const minRelevance = options.minRelevance ?? DEFAULT_MIN_RELEVANCE;

    const filteredSources = options.sourceIds
      ? sources.filter(s => options.sourceIds!.includes(s.id))
      : sources;

    if (filteredSources.length === 0) return [];

    const results = this.searchTFIDF(query, filteredSources, maxChunks * 2);

    return results
      .filter(r => r.relevance >= minRelevance)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxChunks);
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

  // ─── TF-IDF interne ──────────────────────────────────────────────────────

  private searchTFIDF(query: string, sources: Source[], maxResults: number): RAGSearchResult[] {
    const queryTokens = this.tokenize(query.toLowerCase());
    if (queryTokens.length === 0) return [];

    // Collecter tous les chunks
    const allChunks: { chunk: SourceChunk; source: Source }[] = [];
    for (const source of sources) {
      for (const chunk of source.chunks) {
        allChunks.push({ chunk, source });
      }
    }

    const totalDocs = allChunks.length;
    if (totalDocs === 0) return [];

    // Document frequency
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
      if (score > 0) {
        results.push({ chunk, source, relevance: score });
      }
    }

    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, maxResults);
  }

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

    for (const token of queryTokens) {
      const tf = contentTokens.filter(t => t === token).length / contentTokens.length;
      if (tf === 0) continue;

      const df = docFreq.get(token) || 1;
      const idf = Math.log(1 + totalDocs / df);

      score += tf * idf;
      matchedTerms++;
    }

    // Bonus: correspondance exacte de la phrase
    if (originalQuery.length >= 4 && contentLower.includes(originalQuery.toLowerCase())) {
      score += 0.5;
    }

    // Bonus: couverture de la query
    const coverage = matchedTerms / queryTokens.length;
    score += coverage * 0.3;

    // Bonus: proximité des termes
    if (matchedTerms >= 2) {
      score += this.computeProximityBonus(contentLower, queryTokens);
    }

    return Math.min(score, 1.0);
  }

  private computeProximityBonus(content: string, queryTokens: string[]): number {
    const positions: number[] = [];
    for (const token of queryTokens) {
      const idx = content.indexOf(token);
      if (idx >= 0) positions.push(idx);
    }

    if (positions.length < 2) return 0;
    positions.sort((a, b) => a - b);
    const span = positions[positions.length - 1] - positions[0];
    const maxSpan = 500;

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
  "le", "la", "les", "de", "du", "des", "un", "une", "et", "en", "au", "aux",
  "ce", "ces", "son", "sa", "ses", "il", "elle", "on", "nous", "vous", "ils",
  "elles", "se", "ne", "pas", "que", "qui", "ou", "mais", "donc", "car",
  "dans", "sur", "par", "pour", "avec", "sans", "sous", "entre",
  "cette", "mon", "ton", "leur", "nos", "vos", "leurs",
  "est", "sont", "été", "avoir", "être", "fait", "peut", "plus",
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

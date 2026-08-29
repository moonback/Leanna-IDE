/**
 * EmbeddingStore — Stockage et recherche vectorielle via Gemini Embeddings
 *
 * Utilise le modèle text-embedding-004 de Google pour vectoriser les chunks
 * et effectuer une recherche par similarité cosinus.
 *
 * Architecture :
 *   1. À l'ingestion d'une source, chaque chunk est vectorisé
 *   2. Les vecteurs sont stockés en mémoire + persistés sur disque
 *   3. À la recherche, la query est vectorisée et comparée par cosinus
 *   4. Le RAGEngine combine le score embeddings + TF-IDF (hybride)
 */

import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { withGeminiRetry } from "../utils/geminiKeyPool.js";
import { SELF_ROOT } from "../utils/selfRoot.js";

const log = createLogger("EmbeddingStore");

// ─── Configuration ──────────────────────────────────────────────────────────

/** Modèle d'embedding Gemini (gemini-embedding-001 remplace text-embedding-004 sur v1beta) */
const EMBEDDING_MODEL = "gemini-embedding-001";

/** Dimensionalité des vecteurs (256 = bon compromis performance/qualité) */
const EMBEDDING_DIMENSIONS = 256;

/** Nombre maximum de textes par batch (limite API Gemini) */
const BATCH_SIZE = 100;

/** Délai entre les batches pour respecter les rate limits */
const BATCH_DELAY_MS = 500;

// ─── Persistence ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(
  process.env.Leanna_CONFIG_PATH || process.env.ELECTRON_APP_PATH || SELF_ROOT || process.cwd(),
  ".Leanna",
  "notebooks",
  "embeddings"
);

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface StoredEmbedding {
  chunkId: string;
  sourceId: string;
  notebookId: string;
  vector: number[];
}

interface EmbeddingIndex {
  version: number;
  model: string;
  dimensions: number;
  entries: StoredEmbedding[];
}

// ═══════════════════════════════════════════════════════════════════════════════

export class EmbeddingStore {
  /** Index en mémoire : chunkId → vecteur */
  private vectors: Map<string, StoredEmbedding> = new Map();
  /** Cache des embeddings de queries récentes */
  private queryCache: Map<string, number[]> = new Map();
  private readonly queryCacheMaxSize = 100;

  /** Limite mémoire : nombre max de vecteurs en RAM (0 = illimité) */
  private maxVectorsInMemory: number;
  /** Notebooks chargés en mémoire (pour eviction LRU) */
  private loadedNotebooks: Map<string, { accessedAt: number; vectorCount: number }> = new Map();

  constructor(options?: { maxVectorsInMemory?: number }) {
    this.maxVectorsInMemory = options?.maxVectorsInMemory ?? 50_000; // ~50K vecteurs × 256 dims × 4B ≈ 50MB
    this.loadIndex();
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  private getIndexPath(notebookId: string): string {
    return path.join(DATA_DIR, `${notebookId}.json`);
  }

  private loadIndex(): void {
    ensureDataDir();
    try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
      let skippedLegacy = 0;
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
          const index: EmbeddingIndex = JSON.parse(raw);
          // Accepter les embeddings du modèle actuel ET avec la bonne dimensionalité
          if (index.dimensions === EMBEDDING_DIMENSIONS) {
            if (index.model === EMBEDDING_MODEL) {
              const notebookId = file.replace(".json", "");
              let count = 0;
              for (const entry of index.entries) {
                this.vectors.set(entry.chunkId, entry);
                count++;
              }
              // Tracker le notebook chargé pour le LRU
              this.loadedNotebooks.set(notebookId, {
                accessedAt: Date.now(),
                vectorCount: count,
              });
            } else {
              // Ancien modèle (ex: text-embedding-004) — ignorer, sera réindexé
              skippedLegacy++;
            }
          }
        } catch { /* skip corrupted files */ }
      }

      // Vérifier la limite mémoire au chargement initial
      this.enforceMemoryLimit();

      log.info(`✅ ${this.vectors.size} embeddings chargés depuis le disque${skippedLegacy > 0 ? ` (${skippedLegacy} fichier(s) legacy ignorés, réindexation nécessaire)` : ''}`);
    } catch (e: any) {
      log.warn(`Impossible de charger les embeddings: ${e.message}`);
    }
  }

  /**
   * Éviction LRU des notebooks les moins récemment accédés
   * quand la mémoire dépasse le seuil configuré.
   */
  private enforceMemoryLimit(): void {
    if (this.maxVectorsInMemory <= 0) return; // Illimité
    if (this.vectors.size <= this.maxVectorsInMemory) return;

    // Trier les notebooks par dernier accès (plus ancien en premier)
    const sorted = [...this.loadedNotebooks.entries()]
      .sort((a, b) => a[1].accessedAt - b[1].accessedAt);

    let evicted = 0;
    for (const [notebookId, _meta] of sorted) {
      if (this.vectors.size <= this.maxVectorsInMemory * 0.8) break; // Libérer 20% supplémentaires

      // Éviction : supprimer les vecteurs de ce notebook de la RAM
      const toDelete: string[] = [];
      for (const [chunkId, entry] of this.vectors) {
        if (entry.notebookId === notebookId) {
          toDelete.push(chunkId);
        }
      }
      for (const id of toDelete) {
        this.vectors.delete(id);
      }

      this.loadedNotebooks.delete(notebookId);
      evicted += toDelete.length;
      log.debug(`♻️ Éviction mémoire: notebook ${notebookId.slice(0, 8)} (${toDelete.length} vecteurs)`);
    }

    if (evicted > 0) {
      log.info(`♻️ Mémoire libérée: ${evicted} vecteurs évincés (reste: ${this.vectors.size})`);
    }
  }

  /**
   * Charge les embeddings d'un notebook en mémoire (lazy loading).
   * Appelé automatiquement lors d'une recherche si le notebook n'est pas en RAM.
   */
  private ensureNotebookLoaded(notebookId: string): void {
    if (this.loadedNotebooks.has(notebookId)) {
      // Mettre à jour le timestamp d'accès (LRU)
      const meta = this.loadedNotebooks.get(notebookId)!;
      meta.accessedAt = Date.now();
      return;
    }

    // Charger depuis le disque
    const filePath = this.getIndexPath(notebookId);
    if (!fs.existsSync(filePath)) return;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const index: EmbeddingIndex = JSON.parse(raw);

      if (index.dimensions !== EMBEDDING_DIMENSIONS || index.model !== EMBEDDING_MODEL) return;

      let count = 0;
      for (const entry of index.entries) {
        if (!this.vectors.has(entry.chunkId)) {
          this.vectors.set(entry.chunkId, entry);
          count++;
        }
      }

      this.loadedNotebooks.set(notebookId, {
        accessedAt: Date.now(),
        vectorCount: count,
      });

      // Vérifier la limite mémoire après chargement
      this.enforceMemoryLimit();

      log.debug(`📥 Notebook ${notebookId.slice(0, 8)} chargé en mémoire (${count} vecteurs)`);
    } catch (e: any) {
      log.warn(`Erreur chargement notebook ${notebookId}: ${e.message}`);
    }
  }

  /**
   * Retourne les statistiques mémoire du store.
   */
  getMemoryStats(): {
    vectorsInMemory: number;
    maxVectors: number;
    usagePercent: number;
    loadedNotebooks: number;
    estimatedMemoryMB: number;
  } {
    const estimatedBytes = this.vectors.size * EMBEDDING_DIMENSIONS * 4; // 4 bytes per float32
    return {
      vectorsInMemory: this.vectors.size,
      maxVectors: this.maxVectorsInMemory,
      usagePercent: this.maxVectorsInMemory > 0 ? (this.vectors.size / this.maxVectorsInMemory) * 100 : 0,
      loadedNotebooks: this.loadedNotebooks.size,
      estimatedMemoryMB: Math.round(estimatedBytes / (1024 * 1024) * 100) / 100,
    };
  }

  private persistNotebook(notebookId: string): void {
    ensureDataDir();
    const entries: StoredEmbedding[] = [];
    for (const entry of this.vectors.values()) {
      if (entry.notebookId === notebookId) {
        entries.push(entry);
      }
    }

    const index: EmbeddingIndex = {
      version: 1,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      entries,
    };

    const filePath = this.getIndexPath(notebookId);
    fs.writeFileSync(filePath, JSON.stringify(index), "utf-8");
  }

  // ─── Génération d'embeddings ─────────────────────────────────────────────

  /**
   * Vectorise un ensemble de textes via l'API Gemini embeddings.
   * Gère le batching automatique pour les grands ensembles.
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const allVectors: number[][] = [];

    // Traiter par batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      try {
        const response = await withGeminiRetry(async (ai) => {
          return ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: batch,
            config: {
              outputDimensionality: EMBEDDING_DIMENSIONS,
            },
          });
        });

        if (response.embeddings) {
          for (const embedding of response.embeddings) {
            allVectors.push(embedding.values || []);
          }
        } else {
          // Fallback : vecteurs vides si pas de réponse
          for (let j = 0; j < batch.length; j++) {
            allVectors.push([]);
          }
        }
      } catch (e: any) {
        log.error(`Erreur embedding batch ${i}-${i + batch.length}: ${e.message}`);
        // Vecteurs vides en cas d'erreur
        for (let j = 0; j < batch.length; j++) {
          allVectors.push([]);
        }
      }

      // Délai entre les batches
      if (i + BATCH_SIZE < texts.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    return allVectors;
  }

  /**
   * Vectorise un seul texte (query) avec cache.
   */
  async embedQuery(query: string): Promise<number[]> {
    // Vérifier le cache
    const cached = this.queryCache.get(query);
    if (cached) return cached;

    const vectors = await this.embedTexts([query]);
    const vector = vectors[0] || [];

    // Stocker dans le cache (LRU simple)
    if (this.queryCache.size >= this.queryCacheMaxSize) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey !== undefined) this.queryCache.delete(firstKey);
    }
    this.queryCache.set(query, vector);

    return vector;
  }

  // ─── Indexation de chunks ────────────────────────────────────────────────

  /**
   * Indexe les chunks d'une source (calcule et stocke les embeddings).
   * Appelé après l'ingestion d'une nouvelle source.
   */
  async indexChunks(
    chunks: { id: string; content: string }[],
    sourceId: string,
    notebookId: string
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    log.info(`🔢 Vectorisation de ${chunks.length} chunks (source: ${sourceId})`);

    // Extraire les textes à vectoriser
    const texts = chunks.map(c => c.content.slice(0, 2048)); // Limite Gemini ~2048 tokens

    // Générer les embeddings
    const vectors = await this.embedTexts(texts);

    // Stocker les résultats
    let indexed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const vector = vectors[i];
      if (vector && vector.length > 0) {
        const entry: StoredEmbedding = {
          chunkId: chunks[i].id,
          sourceId,
          notebookId,
          vector,
        };
        this.vectors.set(chunks[i].id, entry);
        indexed++;
      }
    }

    // Persister sur disque
    this.persistNotebook(notebookId);

    log.info(`✅ ${indexed}/${chunks.length} chunks vectorisés avec succès`);
    return indexed;
  }

  /**
   * Supprime tous les embeddings d'une source.
   */
  removeSource(sourceId: string, notebookId: string): void {
    const toDelete: string[] = [];
    for (const [chunkId, entry] of this.vectors) {
      if (entry.sourceId === sourceId) {
        toDelete.push(chunkId);
      }
    }
    for (const id of toDelete) {
      this.vectors.delete(id);
    }
    this.persistNotebook(notebookId);
  }

  /**
   * Supprime tous les embeddings d'un notebook.
   */
  removeNotebook(notebookId: string): void {
    const toDelete: string[] = [];
    for (const [chunkId, entry] of this.vectors) {
      if (entry.notebookId === notebookId) {
        toDelete.push(chunkId);
      }
    }
    for (const id of toDelete) {
      this.vectors.delete(id);
    }
    // Supprimer le fichier
    const filePath = this.getIndexPath(notebookId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // ─── Recherche par similarité ────────────────────────────────────────────

  /**
   * Recherche les chunks les plus similaires à un vecteur query.
   * Retourne les résultats triés par similarité cosinus décroissante.
   */
  searchByVector(
    queryVector: number[],
    options: {
      notebookId?: string;
      sourceIds?: string[];
      maxResults?: number;
      minSimilarity?: number;
    } = {}
  ): { chunkId: string; sourceId: string; similarity: number }[] {
    const maxResults = options.maxResults ?? 10;
    const minSimilarity = options.minSimilarity ?? 0.3;

    if (queryVector.length === 0) return [];

    // Lazy load : s'assurer que le notebook est en mémoire
    if (options.notebookId) {
      this.ensureNotebookLoaded(options.notebookId);
    }

    const results: { chunkId: string; sourceId: string; similarity: number }[] = [];

    for (const [chunkId, entry] of this.vectors) {
      // Filtrer par notebook
      if (options.notebookId && entry.notebookId !== options.notebookId) continue;
      // Filtrer par sources
      if (options.sourceIds && !options.sourceIds.includes(entry.sourceId)) continue;

      if (entry.vector.length === 0) continue;

      const similarity = this.cosineSimilarity(queryVector, entry.vector);
      if (similarity >= minSimilarity) {
        results.push({ chunkId, sourceId: entry.sourceId, similarity });
      }
    }

    // Trier par similarité décroissante
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, maxResults);
  }

  /**
   * Recherche sémantique complète : vectorise la query puis cherche.
   */
  async search(
    query: string,
    options: {
      notebookId?: string;
      sourceIds?: string[];
      maxResults?: number;
      minSimilarity?: number;
    } = {}
  ): Promise<{ chunkId: string; sourceId: string; similarity: number }[]> {
    const queryVector = await this.embedQuery(query);
    if (queryVector.length === 0) return [];
    return this.searchByVector(queryVector, options);
  }

  // ─── Vérification de disponibilité ───────────────────────────────────────

  /**
   * Vérifie si un chunk a déjà été vectorisé.
   */
  hasEmbedding(chunkId: string): boolean {
    return this.vectors.has(chunkId);
  }

  /**
   * Retourne le nombre total d'embeddings stockés.
   */
  get size(): number {
    return this.vectors.size;
  }

  /**
   * Retourne les stats par notebook.
   */
  getStats(notebookId?: string): { total: number; bySource: Map<string, number> } {
    const bySource = new Map<string, number>();
    let total = 0;

    for (const entry of this.vectors.values()) {
      if (notebookId && entry.notebookId !== notebookId) continue;
      total++;
      bySource.set(entry.sourceId, (bySource.get(entry.sourceId) || 0) + 1);
    }

    return { total, bySource };
  }

  // ─── Similarité Cosinus ──────────────────────────────────────────────────

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}

// Singleton
export const embeddingStore = new EmbeddingStore();

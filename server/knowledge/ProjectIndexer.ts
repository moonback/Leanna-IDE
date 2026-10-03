/**
 * ProjectIndexer — Indexeur intelligent du projet
 *
 * Responsabilité unique : scanner tous les fichiers du projet,
 * extraire les entités de code (classes, fonctions, interfaces, etc.),
 * et alimenter le KnowledgeGraph.
 *
 * Utilise les parsers disponibles (extractFileOutline depuis codebaseHelpers)
 * pour une extraction légère et rapide, sans dépendance à un parser TypeScript complet.
 *
 * Architecture :
 *   ProjectIndexer.scanAll()
 *     ├── walkDirectory() → liste tous les fichiers
 *     ├── parseFile() → pour chaque fichier, extrait les entités
 *     └── knowledgeGraph.update() → alimente le graphe
 *
 *   ProjectIndexer.watchFile(filePath)
 *     └── parseFile() → knowledgeGraph.updateFile()
 */

import fs from "fs";
import path from "path";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { createLogger } from "../utils/logger.js";
import { knowledgeGraph } from "./KnowledgeGraph.js";
import type { CodeEntity, FileNode } from "./types.js";
import { extractFileOutline } from "../skills/codebaseHelpers.js";
import type { OutlineEntry } from "../skills/codebaseHelpers.js";
import { isSandboxActive, getSandboxRoot } from "../utils/sandbox.js";
import { fileWatcher } from "./FileWatcher.js";
import type { FileChangeEvent } from "./FileWatcher.js";
import { relationExtractor } from "./RelationExtractor.js";
import { astParser } from "./ASTParser.js";
import { astCallGraph } from "./ASTCallGraph.js";
import type { ASTFileResult } from "./types.js";

const log = createLogger("ProjectIndexer");

// ─── Configuration ──────────────────────────────────────────────────────────

/** Répertoires exclus du scan */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "release",
  "coverage",
  ".vscode",
  ".idea",
  ".Leanna",
  "assets",
  "public",
]);

/** Fichiers exclus du scan */
const EXCLUDED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "thumbs.db",
  ".gitignore",
  ".env",
  ".env.local",
  ".gemini-keys.json",
  ".npmrc",
  // Fichiers de persistance du Knowledge System — exclus pour éviter l'auto-indexation
  // (sinon le scan crée des copies parasites de 1-2 MB dans server/knowledge/)
  ".project-knowledge.json",
  ".project-memory.json",
]);

/** Extensions de fichiers analysables */
const ANALYZABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
]);

/** Taille maximale d'un fichier pour l'analyse (500 KB) */
const MAX_FILE_SIZE = 500_000;

/**
 * Seuil pour le CAS B (mise à jour incrémentale vs scan complet).
 * Si le ratio fichiers modifiés / total dépasse ce seuil, on bascule sur un
 * scan complet (CAS C) plutôt qu'une mise à jour incrémentale.
 * Exemple : 0.4 → au-delà de 40 % de changements (ex. git checkout) on scanne tout.
 * Un minimum absolu de 60 fichiers est conservé pour les petits projets.
 */
const INCREMENTAL_THRESHOLD_RATIO = 0.4;
const INCREMENTAL_THRESHOLD_MIN = 60;

// ═══════════════════════════════════════════════════════════════════════════════
// ProjectIndexer
// ═══════════════════════════════════════════════════════════════════════════════

/** Résultat d'un scan complet/différentiel du projet. */
export interface ScanAllResult {
  totalFiles: number;
  totalEntities: number;
  durationMs: number;
  cached?: boolean;
}

/** Options passées à scanAll. */
export interface ScanAllOptions {
  force?: boolean;
  onProgress?: (p: {
    phase: 'incremental' | 'parse' | 'ast' | 'relations' | 'done';
    current: number;
    total: number;
    file?: string;
  }) => void;
}

export class ProjectIndexer {
  private customProjectRoot?: string;

  // ── Coalescing des scans concurrents ──────────────────────────────────────
  // Plusieurs déclencheurs non coordonnés appellent scanAll() en rafale à
  // l'activation d'un projet (démarrage serveur + activation SELF_ROOT +
  // rechargement sandbox). Sans garde, chacun relance une passe complète qui
  // recalcule les mêmes relations (d'où les logs "Relations extraites"
  // identiques répétés). On sérialise : si un scan tourne déjà, les appelants
  // suivants réutilisent la MÊME promesse au lieu d'en lancer un nouveau.
  private inFlight: Promise<ScanAllResult> | null = null;
  // Une demande arrivée pendant un scan en cours programme UN re-scan unique à
  // la fin (pour ne pas perdre des changements survenus entre-temps).
  private pendingRescan = false;

  constructor(projectRoot?: string) {
    this.customProjectRoot = projectRoot;
  }

  /**
   * Retourne la racine du workspace ACTIF : sandbox si le mode est activé,
   * sinon la racine configurée (SELF_ROOT par défaut).
   */
  protected getActiveProjectRoot(): string {
    if (isSandboxActive()) {
      return getSandboxRoot();
    }
    return this.customProjectRoot || SELF_ROOT;
  }

  /**
   * Scanne tous les fichiers du projet et met à jour le KnowledgeGraph.
   * Si le projet n'a subi aucune modification (fichiers, mtime, taille),
   * le cache existant est réutilisé instantanément sans ré-indexation lourde.
   *
   * COALESCING : si un scan est déjà en cours, cet appel n'en lance PAS un
   * second — il attend et renvoie le résultat du scan courant (sauf `force`,
   * voir plus bas). Une demande arrivée pendant un scan programme un unique
   * re-scan à la fin, pour ne rien manquer. Cela supprime les passes complètes
   * redondantes provoquées par les déclencheurs multiples (démarrage +
   * activation projet + sandbox) sans retarder le premier index.
   *
   * @param options.force Force la ré-indexation complète même si le cache est à
   *   jour. Un `force` attend la fin d'un éventuel scan en cours puis relance
   *   un vrai scan (il n'est jamais fusionné avec un scan « cache »).
   */
  async scanAll(options: ScanAllOptions = {}): Promise<ScanAllResult> {
    // Bug 8 : utiliser while (pas if) pour que deux scanAll({force:true})
    // simultanés attendent tous les deux la fin du scan courant avant de
    // re-vérifier — sinon les deux passent le if, tous deux créent un nouveau
    // run et se lancent en parallèle.
    while (this.inFlight) {
      if (!options.force) {
        // Simple demande de rafraîchissement : on réutilise le scan courant.
        log.debug("⏳ scanAll déjà en cours — appel coalescé (réutilise le scan actif).");
        return this.inFlight;
      }
      // force: on attend la fin du scan courant, puis on re-vérifie la garde.
      log.debug("⏳ scanAll(force) en attente de la fin du scan en cours…");
      try { await this.inFlight; } catch { /* on relance quand même */ }
    }

    const run = this._scanAllImpl(options).finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;

    const result = await run;

    // Un ou plusieurs appels sont arrivés pendant ce scan : on relance UNE fois
    // (sans force) pour intégrer d'éventuels changements survenus entre-temps.
    if (this.pendingRescan) {
      this.pendingRescan = false;
      log.debug("🔁 Re-scan unique déclenché par des demandes arrivées pendant le scan.");
      return this.scanAll();
    }

    return result;
  }

  /**
   * Marque qu'un re-scan est souhaité. Utilisé par les déclencheurs qui savent
   * qu'un scan tourne peut-être déjà (activation projet en rafale) : au lieu de
   * lancer un scanAll concurrent, ils peuvent appeler scanAll() qui, grâce au
   * coalescing, se contentera d'un re-scan final unique si nécessaire.
   */
  requestRescan(): void {
    if (this.inFlight) this.pendingRescan = true;
  }

  /** Implémentation réelle (non coalescée). Ne pas appeler directement. */
  private async _scanAllImpl(options: ScanAllOptions = {}): Promise<ScanAllResult> {
    const startTime = Date.now();
    const root = this.getActiveProjectRoot();
    const force = options.force ?? false;

    // 1. Lister tous les fichiers sur disque (opération rapide < 50ms)
    const files: string[] = [];
    await this.walkDirectory(root, files, root);

    // 2. Vérification différentielle intelligente contre le cache existant
    if (!force && knowledgeGraph.isInitialized()) {
      const cachedFiles = knowledgeGraph.getAllFiles();
      if (cachedFiles.length > 0) {
        const cachedMap = new Map(cachedFiles.map((f) => [f.path, f]));
        const diskFilesSet = new Set(files);

        const addedFiles: string[] = [];
        const modifiedFiles: string[] = [];
        const deletedFiles: string[] = [];

        // Détecter ajouts et modifications
        for (const relPath of files) {
          const cached = cachedMap.get(relPath);
          if (!cached) {
            addedFiles.push(relPath);
            continue;
          }

          const absPath = path.join(root, relPath);
          try {
            const stat = fs.statSync(absPath);
            const cachedMtimeMs = Date.parse(cached.lastModified);
            // Vérifier taille et date de modification (marge 1.5s pour précision FS)
            if (stat.size !== cached.size || Math.abs(stat.mtimeMs - cachedMtimeMs) > 1500) {
              modifiedFiles.push(relPath);
            }
          } catch {
            modifiedFiles.push(relPath);
          }
        }

        // Détecter suppressions
        for (const cached of cachedFiles) {
          if (!diskFilesSet.has(cached.path)) {
            deletedFiles.push(cached.path);
          }
        }

        // ── CAS A : Aucun changement sur le projet ──────────────────────────────
        if (addedFiles.length === 0 && modifiedFiles.length === 0 && deletedFiles.length === 0) {
          const stats = knowledgeGraph.getStats();
          const durationMs = Date.now() - startTime;
          log.info(
            `⚡ Projet inchangé — utilisation du cache existant (${cachedFiles.length} fichiers, ${stats.totalEntities} entités) (${durationMs}ms)`
          );

          // Construire le Call-Graph AST en arrière-plan sans bloquer le démarrage.
          // Perf 6 : ne parser que les fichiers absents de l'astIndex en mémoire —
          // évite de tout reparser si scanAll() est rappelé alors que l'index
          // est déjà chaud (ex. rechargement sandbox).
          // Le watcher met à jour l'astIndex au fil de l'eau ; les seuls fichiers
          // absents sont ceux jamais vus depuis le démarrage du process.
          const missingFromAst = files.filter(f => !knowledgeGraph.getASTResult(f));
          if (missingFromAst.length > 0) {
            this.buildASTIndex(missingFromAst).catch((err) => {
              log.warn(`⚠️ Échec initialisation AST en arrière-plan: ${(err as Error).message}`);
            });
          }

          return {
            totalFiles: cachedFiles.length,
            totalEntities: stats.totalEntities,
            durationMs,
            cached: true,
          };
        }

        // ── CAS B : Changements légers / partiels (mise à jour incrémentale) ─────
        const totalChanges = addedFiles.length + modifiedFiles.length + deletedFiles.length;
        // Basculer sur scan complet si les changements dépassent 40 % du projet
        // (ex. git checkout, grosse refacto) — seuil minimum absolu : 60 fichiers.
        const incrementalLimit = Math.max(
          INCREMENTAL_THRESHOLD_MIN,
          Math.floor(files.length * INCREMENTAL_THRESHOLD_RATIO)
        );
        if (totalChanges <= incrementalLimit) {
          log.info(
            `⚡ Changements détectés (${addedFiles.length} ajout(s), ${modifiedFiles.length} modifié(s), ${deletedFiles.length} supprimé(s)) — mise à jour incrémentale...`
          );

          await astParser.init();

          // Supprimer les fichiers disparus (sans recalcul de relations à chaque
          // suppression : on diffère à la fin du batch).
          for (const delPath of deletedFiles) {
            knowledgeGraph.removeFile(delPath);
            astCallGraph.removeFile(delPath);
          }

          // Scanner et enrichir les fichiers ajoutés/modifiés. On DIFFÈRE le
          // recalcul complet des relations (skipRelationRefresh) pour ne le
          // faire qu'UNE fois après la boucle — sinon N fichiers = N passes de
          // ~2s (le vrai coût observé), au lieu d'une seule.
          const changedFiles = [...addedFiles, ...modifiedFiles];
          for (let i = 0; i < changedFiles.length; i++) {
            const changedPath = changedFiles[i];
            options.onProgress?.({ phase: 'incremental', current: i + 1, total: changedFiles.length, file: changedPath });
            await this.scanFile(changedPath, { skipRelationRefresh: true });
          }

          // Recalcul unique des relations pour tout le batch.
          if (changedFiles.length > 0 || deletedFiles.length > 0) {
            options.onProgress?.({ phase: 'relations', current: 0, total: changedFiles.length });
            this.refreshSemanticRelations();
          }

          const stats = knowledgeGraph.getStats();
          const durationMs = Date.now() - startTime;
          log.info(
            `✅ Mise à jour incrémentale terminée: ${stats.totalFiles} fichiers, ${stats.totalEntities} entités (${(durationMs / 1000).toFixed(1)}s)`
          );

          return {
            totalFiles: stats.totalFiles,
            totalEntities: stats.totalEntities,
            durationMs,
            cached: false,
          };
        }
      }
    }

    // ── CAS C : Scan complet (premier démarrage ou force: true) ───────────────
    log.info(`🔍 Scan complet du projet (root: ${root}, ${files.length} fichiers)...`);

    // Initialiser Tree-sitter
    await astParser.init();
    const astReady = astParser.isReady;
    if (astReady) {
      log.info("🌳 Tree-sitter prêt — enrichissement AST activé");
    }

    // Parser chaque fichier (regex) + enrichissement AST
    const parsedFiles: FileNode[] = [];
    const astResults = new Map<string, ASTFileResult>();
    // Cache du contenu brut — évite de relire chaque fichier une 2ᵉ fois dans
    // extractAllRelations() (Perf 3).
    const contentCache = new Map<string, string>();
    let totalEntities = 0;
    for (let i = 0; i < files.length; i++) {
      const relativePath = files[i];
      options.onProgress?.({ phase: 'parse', current: i + 1, total: files.length, file: relativePath });
      try {
        const absPath = path.join(root, relativePath);
        // Lire le contenu UNE seule fois et le partager avec parseFile + AST
        // (Perf 1/2 : _readContent est appelé ici, parseFile reçoit le contenu
        // directement sans relire le disque).
        const content = this._readContent(absPath);
        const fileNode = await this.parseFile(relativePath, content ?? undefined);
        if (!fileNode) continue;

        if (content) contentCache.set(relativePath, content);

        // Enrichissement AST si Tree-sitter disponible
        if (astReady && content && ANALYZABLE_EXTENSIONS.has(fileNode.extension)) {
          const astResult = await astParser.parseFile(content, relativePath, fileNode.extension);
          if (!astResult.usedFallback) {
            astResults.set(relativePath, astResult);
            knowledgeGraph.setASTResult(relativePath, astResult);
            this.enrichWithAST(fileNode, astResult);
          }
        }

        parsedFiles.push(fileNode);
        totalEntities += fileNode.entities.length;
      } catch (err) {
        log.debug(`⚠️ Échec parsing: ${relativePath} — ${(err as Error).message}`);
      }
    }

    // Alimenter le KnowledgeGraph
    knowledgeGraph.update(parsedFiles);

    // Extraire les relations sémantiques (regex) + relations AST (calls précis)
    options.onProgress?.({ phase: 'relations', current: 0, total: parsedFiles.length });
    const allRelations = this.extractAllRelations(parsedFiles, root, contentCache);

    // Relations d'appels inter-fichiers depuis l'AST
    if (astResults.size > 0) {
      const astCallRelations = relationExtractor.extractASTCallRelations(astResults, knowledgeGraph.getAllFiles());
      allRelations.push(...astCallRelations);
      log.info(`🌳 AST call-graph: ${astCallRelations.length} relations d'appels supplémentaires`);
    }

    knowledgeGraph.setRelations(allRelations);

    // Construire le graphe d'appels AST en mémoire
    if (astResults.size > 0) {
      for (const [, astResult] of astResults) {
        astCallGraph.updateFile(astResult, astResults);
      }
      const cgStats = astCallGraph.getStats();
      log.info(`📊 Call-graph AST: ${cgStats.totalNodes} fonctions, ${cgStats.totalEdges} appels (${cgStats.crossFileEdges} cross-file, ${cgStats.resolvedEdges} résolus)`);
    }

    // Persister le graphe de connaissances enrichi
    knowledgeGraph.save();

    const durationMs = Date.now() - startTime;
    log.info(`✅ Scan complet terminé: ${parsedFiles.length} fichiers, ${totalEntities} entités, ${allRelations.length} relations (${(durationMs / 1000).toFixed(1)}s)`);

    options.onProgress?.({ phase: 'done', current: parsedFiles.length, total: parsedFiles.length });

    return {
      totalFiles: parsedFiles.length,
      totalEntities,
      durationMs,
      cached: false,
    };
  }

  /** Lit le contenu d'un fichier de manière sécurisée (null si erreur/binaire). */
  private _readContent(absPath: string): string | null {
    try {
      return fs.readFileSync(absPath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * Scanne un seul fichier et met à jour le KnowledgeGraph.
   * Utile après une modification de fichier.
   */
  async scanFile(relativePath: string, options: { skipRelationRefresh?: boolean } = {}): Promise<FileNode | null> {
    try {
      const root = this.getActiveProjectRoot();
      const absPath = path.join(root, relativePath);
      const content = this._readContent(absPath);
      const fileNode = await this.parseFile(relativePath);

      if (fileNode) {
        // Enrichissement AST incrémental
        if (astParser.isReady && content && ANALYZABLE_EXTENSIONS.has(fileNode.extension)) {
          const astResult = await astParser.parseFile(content, relativePath, fileNode.extension);
          if (!astResult.usedFallback) {
            this.enrichWithAST(fileNode, astResult);
            const allAst = new Map([[relativePath, astResult]]);
            astCallGraph.updateFile(astResult, allAst);
          }
        }
        knowledgeGraph.updateFile(fileNode);
        // Le recalcul complet des relations est COÛTEUX (~2s sur ce projet).
        // Quand on scanne plusieurs fichiers d'affilée (mise à jour
        // incrémentale d'un batch), l'appelant le diffère et l'exécute UNE
        // seule fois à la fin via refreshSemanticRelations().
        if (!options.skipRelationRefresh) this.refreshSemanticRelations();
        return fileNode;
      } else {
        // Bug 7 : parseFile renvoie null si le fichier est trop gros, illisible
        // ou d'une extension non analysable. Il peut toutefois être déjà présent
        // dans le graphe (ex. il était valide avant de grossir). On le retire
        // pour éviter une entrée obsolète.
        if (knowledgeGraph.getFile(relativePath)) {
          log.debug(`🗑️ Fichier devenu non-indexable, retiré du graphe: ${relativePath}`);
          knowledgeGraph.removeFile(relativePath);
          astCallGraph.removeFile(relativePath);
          if (!options.skipRelationRefresh) this.refreshSemanticRelations();
        }
      }
    } catch (err) {
      log.warn(`⚠️ Échec scan fichier: ${relativePath} — ${(err as Error).message}`);
    }
    return null;
  }

  /**
   * Supprime un fichier du KnowledgeGraph.
   * @param options.skipRelationRefresh diffère le recalcul des relations (batch).
   */
  removeFile(relativePath: string, options: { skipRelationRefresh?: boolean } = {}): void {
    knowledgeGraph.removeFile(relativePath);
    if (!options.skipRelationRefresh) this.refreshSemanticRelations();
  }

  /**
   * Recalcule les relations sémantiques du graphe (exposé publiquement pour
   * permettre à un traitement par lot de ne l'appeler qu'UNE fois après avoir
   * scanné plusieurs fichiers avec `skipRelationRefresh: true`).
   */
  refreshRelations(): number {
    return this.refreshSemanticRelations();
  }

  /**
   * Construit ou reconstruit le graphe d'appels AST en mémoire (Tree-sitter)
   * pour les fichiers du projet.
   *
   * @param filesToProcess  Liste de chemins relatifs à (re)parser. Si omis,
   *   tous les fichiers du graphe sont traités et le call-graph est effacé puis
   *   reconstruit intégralement. Si fourni (sous-ensemble), le call-graph est
   *   mis à jour de façon incrémentale sans clear() — évite la collision avec
   *   le watcher qui utilise lui aussi updateFile().
   */
  async buildASTIndex(filesToProcess?: string[]): Promise<void> {
    await astParser.init();
    if (!astParser.isReady) {
      log.warn("🌳 Tree-sitter non disponible pour l'index AST");
      return;
    }
    const root = this.getActiveProjectRoot();
    const targetFiles = filesToProcess ?? knowledgeGraph.getAllFiles().map(f => f.path);
    // Rebuild complet seulement si on traite l'ensemble des fichiers connus.
    const isFullRebuild = !filesToProcess;
    const astResults = new Map<string, ASTFileResult>();

    for (const relPath of targetFiles) {
      const ext = path.extname(relPath);
      if (!ANALYZABLE_EXTENSIONS.has(ext)) continue;
      const absPath = path.join(root, relPath);
      const content = this._readContent(absPath);
      if (!content) continue;

      try {
        const astResult = await astParser.parseFile(content, relPath, ext);
        if (!astResult.usedFallback) {
          astResults.set(relPath, astResult);
          knowledgeGraph.setASTResult(relPath, astResult);
        }
      } catch (err) {
        log.debug(`⚠️ Échec parsing AST ${relPath}: ${(err as Error).message}`);
      }
    }

    if (astResults.size > 0) {
      if (isFullRebuild) {
        // Rebuild complet : on efface et reconstruit entièrement le call-graph.
        astCallGraph.clear();
      }
      // Mise à jour incrémentale (ou reconstruction complète après clear).
      // Perf 6 : pas de clear() sur un sous-ensemble pour ne pas entrer en
      // collision avec le watcher qui appelle updateFile() en parallèle.
      for (const [, astResult] of astResults) {
        astCallGraph.updateFile(astResult, astResults);
      }
      const cgStats = astCallGraph.getStats();
      log.info(`📊 Call-graph AST ${isFullRebuild ? "initialisé" : "mis à jour"}: ${cgStats.totalNodes} fonctions, ${cgStats.totalEdges} appels (${cgStats.crossFileEdges} cross-file, ${cgStats.resolvedEdges} résolus)`);
    }
  }

  // ─── Parsing d'un fichier ─────────────────────────────────────────────────

  /**
   * Parse un fichier et retourne un FileNode avec ses entités extraites.
   */
  /**
   * Parse un fichier et retourne un FileNode avec ses entités extraites.
   *
   * @param preloadedContent  Si fourni, le contenu est utilisé directement
   *   sans relire le disque (évite une lecture redondante quand l'appelant
   *   a déjà lu le fichier pour l'enrichissement AST).
   */
  private async parseFile(relativePath: string, preloadedContent?: string): Promise<FileNode | null> {
    const absolutePath = path.join(this.getActiveProjectRoot(), relativePath);

    // Vérifier que le fichier existe et récupérer ses métadonnées AVANT toute
    // lecture — rejette immédiatement les fichiers trop volumineux sans les charger.
    if (!fs.existsSync(absolutePath)) return null;

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) return null;

    // Ignorer les fichiers trop volumineux
    if (stats.size > MAX_FILE_SIZE) {
      log.debug(`⏭️ Fichier trop volumineux: ${relativePath} (${stats.size} octets)`);
      return null;
    }

    const ext = path.extname(relativePath).toLowerCase();
    const name = path.basename(relativePath);

    // Utiliser le contenu pré-chargé si disponible, sinon lire le disque.
    let content: string;
    if (preloadedContent !== undefined) {
      content = preloadedContent;
    } else {
      try {
        content = fs.readFileSync(absolutePath, "utf-8");
      } catch {
        return null; // Fichier binaire ou illisible
      }
    }

    const lines = content.split(/\r?\n/);

    // Extraire les entités selon le type de fichier
    const entities = this.extractEntities(relativePath, content, lines, ext);

    // Extraire les imports et exports
    const { imports, exports } = this.extractImportsExports(content, lines, ext);

    return {
      path: relativePath,
      name,
      extension: ext || ".txt",
      size: stats.size,
      lines: lines.length,
      lastModified: stats.mtime.toISOString(),
      entities,
      imports,
      exports,
      language: this.detectLanguage(ext),
    };
  }

  // ─── Extraction d'entités ─────────────────────────────────────────────────

  /**
   * Extrait les entités de code d'un fichier.
   * Utilise extractFileOutline pour le parsing (déjà existant dans codebaseHelpers).
   */
  private extractEntities(
    relativePath: string,
    content: string,
    lines: string[],
    ext: string
  ): CodeEntity[] {
    const entities: CodeEntity[] = [];

    // Utiliser extractFileOutline pour les fichiers TypeScript/JavaScript
    if (/^\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(ext)) {
      const outline = extractFileOutline(lines, ext);

      for (const entry of outline) {
        // Déterminer le type CodeEntityType depuis OutlineEntry
        const entityType = this.mapOutlineType(entry.type);
        const signature = entry.signature || lines[entry.line - 1]?.trimStart().slice(0, 200);

        // Détecter les modificateurs
        const modifiers: string[] = [];
        if (entry.type === "export" || this.isExportLine(lines[entry.line - 1])) {
          modifiers.push("export");
        }
        if (entry.type === "import") {
          modifiers.push("import");
        }
        if (
          entry.type === "function" &&
          lines[entry.line - 1]?.trimStart().startsWith("async")
        ) {
          modifiers.push("async");
        }

        // Extraire la description JSDoc si présente
        const description = this.extractJsDoc(lines, entry.line);

        // Extraire les dépendances (imports)
        const dependencies: string[] = [];
        if (entry.type === "import") {
          const importMatch = lines[entry.line - 1]?.match(/from\s+['"](.+)['"]/);
          if (importMatch) {
            dependencies.push(importMatch[1]);
          }
        }

        const entity: CodeEntity = {
          name: entry.name,
          type: entityType,
          filePath: relativePath,
          lineStart: entry.line,
          lineEnd: entry.endLine,
          signature,
          modifiers: modifiers.length > 0 ? modifiers : undefined,
          description: description || undefined,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
        };

        entities.push(entity);
      }

      // ── Extraction des routes/endpoints API ────────────────────────────────
      entities.push(...this.extractRouteEntities(relativePath, lines));

      // ── Extraction des variables d'environnement ───────────────────────────
      entities.push(...this.extractEnvVarEntities(relativePath, lines));

      // ── Extraction des tables de base de données ───────────────────────────
      entities.push(...this.extractDbTableEntities(relativePath, lines));

      // ── Extraction des cas de test ─────────────────────────────────────────
      entities.push(...this.extractTestEntities(relativePath, lines));

      // ── Extraction des symboles importés et exportés ───────────────────────
      entities.push(...this.extractSymbolEntities(relativePath, content, lines));
    }

    // Pour les fichiers Markdown : extraire les titres comme "entités"
    if (ext === ".md") {
      for (let i = 0; i < lines.length; i++) {
        const headingMatch = lines[i].match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          entities.push({
            name: headingMatch[2].trim(),
            type: "export",
            filePath: relativePath,
            lineStart: i + 1,
            signature: lines[i].trim().slice(0, 200),
          });
        }
      }
    }

    // Pour les fichiers JSON : extraire les clés racines
    if (ext === ".json") {
      try {
        const parsed = JSON.parse(content);
        this.extractJsonKeys(parsed, relativePath, entities, "");
      } catch {
        // Ignorer les JSON invalides
      }
    }

    return entities;
  }

  /**
   * Extrait les imports et exports d'un fichier.
   *
   * Travaille sur le contenu brut (pas ligne par ligne) pour capturer
   * correctement les imports Prettier multi-lignes du type :
   *   import {
   *     Foo,
   *     Bar,
   *   } from "mod"
   *
   * Les commentaires (bloc et ligne) sont supprimés avant l'analyse pour
   * éviter les faux positifs de require() / import() dans du texte inerte.
   */
  private extractImportsExports(
    content: string,
    _lines: string[],
    ext: string
  ): { imports: string[]; exports: string[] } {
    const imports: string[] = [];
    const exports: string[] = [];

    if (!/^\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(ext)) {
      return { imports, exports };
    }

    // Supprimer les commentaires pour éviter les faux positifs.
    // On remplace par des espaces pour conserver les numéros de position.
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))  // /* … */
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));        // // …

    // ── Imports ES module (static, multi-lignes) ──────────────────────────
    // Couvre : import Foo from "…"
    //          import { A, B } from "…"
    //          import {         ← multi-lignes (Prettier)
    //            A,
    //            B,
    //          } from "…"
    //          export { X } from "…"  (réexport)
    //          export * from "…"
    const staticImportRe = /\b(?:import|export)\b[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/gm;
    for (const m of stripped.matchAll(staticImportRe)) {
      imports.push(m[1]);
    }

    // Imports side-effect : import "./polyfill.js"
    const sideEffectRe = /\bimport\s+['"]([^'"]+)['"]/gm;
    for (const m of stripped.matchAll(sideEffectRe)) {
      imports.push(m[1]);
    }

    // Imports CommonJS — uniquement hors template literals / strings
    // (le stripping des commentaires est suffisant pour les cas courants)
    const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
    for (const m of stripped.matchAll(requireRe)) {
      imports.push(m[1]);
    }

    // Dynamic imports : import("…")  ← ex. lazy loading
    const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
    for (const m of stripped.matchAll(dynamicRe)) {
      imports.push(m[1]);
    }

    // ── Exports nommés ────────────────────────────────────────────────────
    // Inclut async, abstract, declare (ex. export async function foo,
    // export abstract class Bar, export declare const baz)
    const exportDeclRe =
      /^export\s+(?:default\s+)?(?:async\s+|abstract\s+|declare\s+)*(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/gm;
    for (const m of stripped.matchAll(exportDeclRe)) {
      exports.push(m[1]);
    }

    // Export { A, B as C }  [from "…"]
    const exportBraceRe = /^export\s+\{([^}]+)\}/gm;
    for (const m of stripped.matchAll(exportBraceRe)) {
      const names = m[1]
        .split(",")
        .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      exports.push(...names);
    }

    // Export * from "…"
    const exportStarRe = /^export\s+\*\s+from\s+['"]([^'"]+)['"]/gm;
    for (const m of stripped.matchAll(exportStarRe)) {
      exports.push(`* from ${m[1]}`);
    }

    // Export default (non déjà capturé par exportDeclRe)
    const exportDefaultRe = /^export\s+default\s+(?:(function|class)\s+(\w+))?/gm;
    for (const m of stripped.matchAll(exportDefaultRe)) {
      if (m[2]) {
        exports.push(`default:${m[2]}`);
      } else {
        exports.push("default");
      }
    }

    return { imports: [...new Set(imports)], exports: [...new Set(exports)] };
  }

  // ─── Entités structurelles ─────────────────────────────────────────────────

  /** Extrait les endpoints Express définis par le fichier. */
  private extractRouteEntities(filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const seen = new Set<string>();
    const routePattern = /\b(?:app|router)\.(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/i;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(routePattern);
      if (!match) continue;

      const method = match[1].toUpperCase();
      const routePath = match[2];
      const name = `${method} ${routePath}`;
      if (seen.has(name)) continue;
      seen.add(name);

      entities.push({
        name,
        type: "route",
        filePath,
        lineStart: i + 1,
        signature: lines[i].trim().slice(0, 200),
        metadata: { framework: "express", method, path: routePath },
      });
    }

    return entities;
  }

  /** Extrait les accès Node/Vite à des variables d'environnement, sans leur valeur. */
  private extractEnvVarEntities(filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const seen = new Set<string>();
    const patterns: { regex: RegExp; runtime: "node" | "vite" }[] = [
      { regex: /process\.env\.([A-Z_][A-Z0-9_]*)/g, runtime: "node" },
      { regex: /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, runtime: "node" },
      { regex: /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g, runtime: "vite" },
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const { regex, runtime } of patterns) {
        regex.lastIndex = 0;
        for (const match of lines[i].matchAll(regex)) {
          const name = match[1];
          if (seen.has(name)) continue;
          seen.add(name);
          entities.push({
            name,
            type: "env_var",
            filePath,
            lineStart: i + 1,
            signature: lines[i].trim().slice(0, 200),
            metadata: { runtime },
          });
        }
      }
    }

    return entities;
  }

  /** Extrait les tables SQL/Supabase référencées et leur mode d'accès. */
  private extractDbTableEntities(filePath: string, lines: string[]): CodeEntity[] {
    const tables = new Map<string, { line: number; access: Set<"read" | "write" | "schema"> }>();
    const addTable = (name: string, line: number, access: "read" | "write" | "schema") => {
      const current = tables.get(name) ?? { line, access: new Set<"read" | "write" | "schema">() };
      current.access.add(access);
      tables.set(name, current);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ── Supabase : supabase.from('table') ─────────────────────────────────
      // Bug 9 : exclure .storage.from() et tout autre appel chaîné qui n'est
      // pas directement sur le client Supabase (ex. supabase.storage.from(...),
      // sb.rpc(...).from(...), etc.).
      // On n'accepte que : supabase.from(…) / sb.from(…) / client.from(…)
      // i.e. un identifiant simple immédiatement suivi de .from(
      const supabase = line.match(
        /(?<!\.\s*\w+\s*)\b(?:supabase|sb|client)\s*\.from\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/i
      );
      if (supabase) {
        const isWrite = /\.(?:insert|update|upsert|delete)\s*\(/.test(
          `${line}\n${lines[i + 1] ?? ""}`
        );
        addTable(supabase[1], i + 1, isWrite ? "write" : "read");
      }

      // ── DDL ───────────────────────────────────────────────────────────────
      const create = line.match(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (create) addTable(create[1], i + 1, "schema");

      // ── DML — mots-clés obligatoirement EN MAJUSCULES ─────────────────────
      // Bug 9 : ne pas utiliser le flag /i pour SELECT/FROM/INSERT/UPDATE/DELETE
      // afin d'éviter les faux positifs sur du texte ordinaire en minuscules
      // (ex. "Select a file from disk", commentaires, messages d'interface).
      // Un vrai template SQL écrit par un développeur utilise des majuscules.

      // SELECT … FROM table  (sans flag i → majuscules requis)
      const select = line.match(/\bSELECT\b.*\bFROM\s+([A-Za-z_]\w*)\b/);
      if (select) addTable(select[1], i + 1, "read");

      // INSERT INTO table
      const insert = line.match(/\bINSERT\s+INTO\s+([A-Za-z_]\w*)/);
      if (insert) addTable(insert[1], i + 1, "write");

      // UPDATE table SET
      const update = line.match(/\bUPDATE\s+([A-Za-z_]\w*)\s+SET\b/);
      if (update) addTable(update[1], i + 1, "write");

      // DELETE FROM table
      const deleteFrom = line.match(/\bDELETE\s+FROM\s+([A-Za-z_]\w*)/);
      if (deleteFrom) addTable(deleteFrom[1], i + 1, "write");
    }

    return [...tables.entries()].map(([name, { line, access }]) => ({
      name,
      type: "db_table" as const,
      filePath,
      lineStart: line,
      signature: `Database table ${name}`,
      metadata: { access: [...access].sort() },
    }));
  }

  /** Extrait les suites et cas de test déclarés avec describe, it ou test. */
  private extractTestEntities(filePath: string, lines: string[]): CodeEntity[] {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(filePath) && !/(?:^|\/)tests?\//i.test(filePath)) {
      return [];
    }

    const entities: CodeEntity[] = [];
    const seen = new Set<string>();
    const testPattern = /\b(describe|it|test)\s*\(\s*['"`]([^'"`]+)['"`]/;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(testPattern);
      if (!match) continue;
      const [, kind, label] = match;
      const name = `${kind}: ${label}`;
      if (seen.has(name)) continue;
      seen.add(name);
      entities.push({
        name,
        type: "test",
        filePath,
        lineStart: i + 1,
        signature: lines[i].trim().slice(0, 200),
        metadata: { kind },
      });
    }
    return entities;
  }

  /**
   * Extrait des symboles nommés importés ou exportés, avec leur module d'origine.
   *
   * Travaille sur le contenu brut pour capturer les imports Prettier
   * multi-lignes, et supporte export async/abstract/declare.
   */
  private extractSymbolEntities(filePath: string, content: string, _lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const seen = new Set<string>();

    const addSymbol = (
      name: string,
      line: number,
      direction: "import" | "export",
      source?: string,
      exportedAs?: string
    ) => {
      const key = `${direction}:${name}:${source ?? ""}:${exportedAs ?? ""}`;
      if (!name || seen.has(key)) return;
      seen.add(key);
      entities.push({
        name,
        type: "symbol",
        filePath,
        lineStart: line,
        signature: `${direction} ${name}${source ? ` from ${source}` : ""}`,
        modifiers: [direction],
        metadata: { direction, source, exportedAs },
      });
    };

    // Supprimer les commentaires pour éviter les faux positifs.
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

    // Helper : numéro de ligne (1-indexed) de l'offset dans le contenu original
    const lineOf = (offset: number): number =>
      (content.slice(0, offset).match(/\n/g)?.length ?? 0) + 1;

    // ── Named imports : import [type] { Foo, Bar as B } from "mod"
    // Fonctionne aussi sur plusieurs lignes (Prettier).
    const namedImportRe =
      /\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/gm;
    for (const m of stripped.matchAll(namedImportRe)) {
      const line = lineOf(m.index!);
      for (const binding of m[1].split(",")) {
        const parts = binding.trim().split(/\s+as\s+/);
        const original = parts[0].trim();
        const local = (parts[1] ?? parts[0]).trim();
        if (original) addSymbol(local, line, "import", m[2], original);
      }
    }

    // ── Default imports : import Foo from "mod"
    // Exclut le cas import { … } en vérifiant l'absence de {
    const defaultImportRe =
      /\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[\s\S]*?\})?\s+from\s+['"]([^'"]+)['"]/gm;
    for (const m of stripped.matchAll(defaultImportRe)) {
      // Éviter de capturer "import" suivi d'un { (namedImportRe s'en charge)
      if (m[0].includes("{")) continue;
      addSymbol(m[1], lineOf(m.index!), "import", m[2], "default");
    }

    // ── Declaration exports : export [async|abstract|declare]* const/fn/class… Foo
    // Capture aussi export default function Foo / export default class Foo
    const exportDeclRe =
      /^export\s+(?:default\s+)?(?:async\s+|abstract\s+|declare\s+)*(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
    for (const m of stripped.matchAll(exportDeclRe)) {
      addSymbol(m[1], lineOf(m.index!), "export");
    }

    // ── Named exports : export { Foo, Bar as Baz } [from "mod"]
    const namedExportRe =
      /^export\s+\{([\s\S]*?)\}(?:\s+from\s+['"]([^'"]+)['"])?/gm;
    for (const m of stripped.matchAll(namedExportRe)) {
      const line = lineOf(m.index!);
      for (const binding of m[1].split(",")) {
        const parts = binding.trim().split(/\s+as\s+/);
        const original = parts[0].trim();
        const exported = (parts[1] ?? parts[0]).trim();
        if (exported) addSymbol(exported, line, "export", m[2], original);
      }
    }

    return entities;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Marche récursive dans le répertoire pour lister tous les fichiers.
   * @param baseRoot Racine de base utilisée pour calculer les chemins relatifs
   *                 (doit être la même racine qu'avec laquelle le walk a été démarré,
   *                  typiquement getActiveProjectRoot()).
   */
  private async walkDirectory(dir: string, files: string[], baseRoot: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Ignorer les répertoires exclus
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseRoot, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, files, baseRoot);
      } else if (entry.isFile()) {
        // Ignorer les fichiers exclus
        if (EXCLUDED_FILES.has(entry.name)) continue;

        const ext = path.extname(entry.name).toLowerCase();
        // Ignorer les extensions non analysables
        if (!ANALYZABLE_EXTENSIONS.has(ext)) continue;

        files.push(relativePath);
      }
    }
  }

  /**
   * Mappe le type OutlineEntry vers CodeEntityType.
   */
  private mapOutlineType(outlineType: OutlineEntry["type"]): CodeEntity["type"] {
    const mapping: Record<string, CodeEntity["type"]> = {
      function: "function",
      class: "class",
      interface: "interface",
      type: "type",
      export: "export",
      import: "import",
      variable: "variable",
      method: "method",
      component: "component",
    };
    return mapping[outlineType] || "export";
  }

  /**
   * Détecte si une ligne est un export.
   */
  private isExportLine(line: string | undefined): boolean {
    if (!line) return false;
    return line.trimStart().startsWith("export ");
  }

  /**
   * Extrait la description JSDoc au-dessus d'une ligne donnée.
   */
  private extractJsDoc(lines: string[], lineNumber: number): string | null {
    const jsDocLines: string[] = [];
    let i = lineNumber - 2; // ligne avant l'entité

    // Remonter les lignes de commentaires
    while (i >= 0) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("/**")) {
        jsDocLines.unshift(trimmed);
      } else if (trimmed.startsWith("//")) {
        jsDocLines.unshift(trimmed);
      } else if (trimmed === "") {
        // Ligne vide — continue (peut-être un padding)
      } else {
        break; // Ligne de code ou autre
      }
      i--;
    }

    if (jsDocLines.length === 0) return null;

    // Nettoyer les marqueurs JSDoc
    return jsDocLines
      .map((l) => l.replace(/^\/\*\*?\s*/, "").replace(/^\s*\*\s?/, "").replace(/\s*\*\/$/, "").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 500);
  }

  /**
   * Extrait les clés d'un objet JSON comme entités.
   */
  private extractJsonKeys(
    obj: any,
    filePath: string,
    entities: CodeEntity[],
    prefix: string
  ): void {
    if (typeof obj !== "object" || obj === null) return;

    for (const [key, value] of Object.entries(obj)) {
      const fullName = prefix ? `${prefix}.${key}` : key;

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        entities.push({
          name: fullName,
          type: "constant",
          filePath,
          lineStart: 0,
          signature: `{ ${Object.keys(value).join(", ")} }`,
        });
        // Ne pas récurser pour les gros objets
        if (Object.keys(value).length < 20) {
          this.extractJsonKeys(value, filePath, entities, fullName);
        }
      } else {
        const valueStr =
          typeof value === "string"
            ? `"${value.slice(0, 50)}"`
            : JSON.stringify(value);
        entities.push({
          name: fullName,
          type: "constant",
          filePath,
          lineStart: 0,
          signature: `${key}: ${valueStr}`,
        });
      }
    }
  }

  /**
   * Détecte le langage d'un fichier à partir de son extension.
   */
  private detectLanguage(
    ext: string
  ): FileNode["language"] {
    switch (ext) {
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        return "javascript";
      case ".json":
        return "json";
      case ".md":
        return "markdown";
      case ".css":
      case ".scss":
        return "css";
      case ".html":
        return "html";
      default:
        return "other";
    }
  }

  // ─── Extraction de relations ────────────────────────────────────────────────

  /**
   * Reconstruit les relations sur l'état courant après une indexation incrémentale.
   * Les relations (tests, appels, tables et imports) pouvant traverser les fichiers,
   * une reconstruction globale garantit l'absence de liens périmés.
   * Les relations d'appels AST sont ajoutées si le call-graph est disponible.
   */
  private refreshSemanticRelations(): number {
    const allFiles = knowledgeGraph.getAllFiles();
    const relations = this.extractAllRelations(allFiles, this.getActiveProjectRoot());

    // Ajouter les relations d'appels AST cross-file.
    // On récupère l'index AST déjà stocké (alimenté lors du scan complet et
    // de chaque scanFile) plutôt que de passer une Map vide qui rendrait
    // extractASTCallRelations() sans effet.
    if (astParser.isReady) {
      const astResults = knowledgeGraph.getAllASTResults();
      if (astResults.size > 0) {
        const astCallRelations = relationExtractor.extractASTCallRelations(
          astResults,
          allFiles
        );
        relations.push(...astCallRelations);
      }
    }

    knowledgeGraph.setRelations(relations);
    knowledgeGraph.save();
    return relations.length;
  }

  /**
   * Enrichit un FileNode avec les données de l'AST Tree-sitter :
   * - lineEnd précis pour chaque entité
   * - Signature enrichie avec paramètres et type de retour
   * - Modificateurs additionnels (isArrow, isAsync validé par l'AST)
   */
  private enrichWithAST(fileNode: FileNode, astResult: ASTFileResult): void {
    if (astResult.usedFallback || astResult.functions.length === 0) return;

    // Construire un index des fonctions AST par nom+ligne
    const astFnByName = new Map<string, typeof astResult.functions[number]>();
    for (const fn of astResult.functions) {
      astFnByName.set(fn.name, fn);
      if (fn.className) {
        astFnByName.set(`${fn.className}.${fn.name}`, fn);
      }
    }

    // Enrichir les entités de type function/method/component
    for (const entity of fileNode.entities) {
      if (!['function', 'method', 'component', 'class'].includes(entity.type)) continue;

      const astFn = astFnByName.get(entity.name) ??
        (entity.type === 'method' && astFnByName.get(entity.name));

      if (!astFn) continue;

      // lineEnd précis
      if (!entity.lineEnd || entity.lineEnd === entity.lineStart) {
        entity.lineEnd = astFn.lineEnd;
      }

      // Enrichir la signature avec les paramètres typés
      if (astFn.params.length > 0) {
        const paramStr = astFn.params
          .map(p => {
            const optional = p.optional ? '?' : '';
            return p.type ? `${p.name}${optional}: ${p.type}` : `${p.name}${optional}`;
          })
          .join(', ');
        const ret = astFn.returnType ? `: ${astFn.returnType}` : '';
        entity.signature = `${entity.name}(${paramStr})${ret}`;
      }

      // Modificateurs additionnels
      if (astFn.isAsync && !entity.modifiers?.includes('async')) {
        entity.modifiers = [...(entity.modifiers ?? []), 'async'];
      }
      if (astFn.isArrow && !entity.modifiers?.includes('arrow')) {
        entity.modifiers = [...(entity.modifiers ?? []), 'arrow'];
      }
    }
  }

  /**
   * Extrait toutes les relations sémantiques de tous les fichiers parsés.
   */
  private extractAllRelations(
    parsedFiles: FileNode[],
    root: string,
    contentCache?: Map<string, string>
  ): import("./types.js").EntityRelation[] {
    const allFiles: Record<string, FileNode> = {};
    for (const f of parsedFiles) allFiles[f.path] = f;

    const allRelations: import("./types.js").EntityRelation[] = [];

    for (const fileNode of parsedFiles) {
      // Ne traiter que les fichiers TypeScript/JavaScript
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(fileNode.extension)) continue;

      try {
        // Perf 3 : utiliser le contenu déjà en mémoire si disponible,
        // évite une 3ᵉ lecture disque par fichier après parseFile + enrichissement AST.
        const content = contentCache?.get(fileNode.path)
          ?? (() => {
            const absPath = path.join(root, fileNode.path);
            if (!fs.existsSync(absPath)) return null;
            return fs.readFileSync(absPath, "utf-8");
          })();
        if (!content) continue;
        const relations = relationExtractor.extractRelations(fileNode, content, allFiles);
        allRelations.push(...relations);
      } catch {
        // Ignorer les erreurs de lecture
      }
    }

    log.info(`🔗 Relations extraites: ${allRelations.length} (extends: ${allRelations.filter(r => r.relationType === "extends").length}, implements: ${allRelations.filter(r => r.relationType === "implements").length}, composes: ${allRelations.filter(r => r.relationType === "composes").length}, tests: ${allRelations.filter(r => r.relationType === "tests").length})`);
    return allRelations;
  }

  // ─── File Watcher Integration ─────────────────────────────────────────────

  // Désinscripteur du handler FileWatcher actif — évite les doublons lors
  // d'appels répétés à startWatching() (ex. changement de racine sandbox).
  private watcherUnsubscribe: (() => void) | null = null;

  /**
   * Démarre la surveillance des fichiers pour indexation incrémentale.
   * Chaque modification de fichier déclenche un re-scan individuel (~5-50ms).
   *
   * Appeler après le premier scanAll() pour maintenir le graphe à jour.
   *
   * Idempotent : plusieurs appels successifs n'enregistrent qu'UN seul handler.
   * Si la racine change (sandbox activé/désactivé), fileWatcher.start() redémarre
   * automatiquement le watcher sur la nouvelle racine.
   */
  startWatching(): boolean {
    // Désenregistrer l'éventuel handler précédent pour éviter les doublons.
    if (this.watcherUnsubscribe) {
      this.watcherUnsubscribe();
      this.watcherUnsubscribe = null;
    }

    const started = fileWatcher.start();
    if (!started) return false;

    this.watcherUnsubscribe = fileWatcher.onChange(async (events: FileChangeEvent[]) => {
      await this.handleFileChanges(events);
    });

    log.info("👁️ Indexation incrémentale activée via FileWatcher");
    return true;
  }

  /**
   * Arrête la surveillance des fichiers.
   */
  stopWatching(): void {
    // Désenregistrer le handler avant d'arrêter le watcher.
    if (this.watcherUnsubscribe) {
      this.watcherUnsubscribe();
      this.watcherUnsubscribe = null;
    }
    fileWatcher.stop();
    log.info("🛑 Indexation incrémentale désactivée");
  }

  /**
   * Gère un batch de changements de fichiers.
   */
  private async handleFileChanges(events: FileChangeEvent[]): Promise<void> {
    const t0 = Date.now();
    let indexed = 0;
    let removed = 0;
    let errors = 0;
    const astResultsBatch = new Map<string, ASTFileResult>();

    for (const event of events) {
      try {
        if (event.type === "deleted") {
          knowledgeGraph.removeFile(event.relativePath);
          astCallGraph.removeFile(event.relativePath);
          removed++;
        } else {
          // "created" ou "modified" → re-parse le fichier
          const root = this.getActiveProjectRoot();
          const absPath = path.join(root, event.relativePath);
          const content = this._readContent(absPath);
          const fileNode = await this.parseFile(event.relativePath);

          if (fileNode) {
            // Enrichissement AST incrémental
            if (astParser.isReady && content && ANALYZABLE_EXTENSIONS.has(fileNode.extension)) {
              const astResult = await astParser.parseFile(content, event.relativePath, fileNode.extension);
              if (!astResult.usedFallback) {
                this.enrichWithAST(fileNode, astResult);
                astResultsBatch.set(event.relativePath, astResult);
              }
            }
            knowledgeGraph.updateFile(fileNode);
            indexed++;
          } else {
            // Bug 7 : fichier devenu non-indexable (trop gros, illisible…).
            // On le retire du graphe s'il y était déjà présent.
            if (knowledgeGraph.getFile(event.relativePath)) {
              log.debug(`🗑️ Fichier devenu non-indexable, retiré du graphe: ${event.relativePath}`);
              knowledgeGraph.removeFile(event.relativePath);
              astCallGraph.removeFile(event.relativePath);
              removed++;
            }
          }
        }
      } catch (err) {
        log.debug(`⚠️ Erreur indexation incrémentale: ${event.relativePath} — ${(err as Error).message}`);
        errors++;
      }
    }

    if (indexed > 0 || removed > 0) {
      // Mise à jour du call-graph AST pour les fichiers modifiés
      for (const [, astResult] of astResultsBatch) {
        astCallGraph.updateFile(astResult, astResultsBatch);
      }

      const relationCount = this.refreshSemanticRelations();
      const duration = Date.now() - t0;
      log.info(`⚡ Indexation incrémentale: +${indexed} ré-indexé(s), -${removed} supprimé(s), ${relationCount} relations${errors > 0 ? `, ${errors} erreur(s)` : ""} (${duration}ms)`);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du ProjectIndexer */
export const projectIndexer = new ProjectIndexer();

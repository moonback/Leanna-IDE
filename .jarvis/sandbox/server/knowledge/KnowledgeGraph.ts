/**
 * KnowledgeGraph — Graphe permanent des connaissances du projet
 *
 * Stocke la structure complète du projet sous forme de graphe :
 * - Fichiers indexés (FileNode[])
 * - Entités extraites (classes, fonctions, interfaces, etc.)
 * - Graphe de dépendances (qui importe qui)
 * - Graphe inverse (qui dépend de qui)
 *
 * Le graphe est persisté dans ProjectKnowledge.json et mis à jour
 * automatiquement après chaque modification de fichier.
 *
 * Architecture :
 *   ProjectIndexer.scanAll() → KnowledgeGraph.update()
 *     ↓
 *   ProjectKnowledge.json (persistance disque)
 *     ↓
 *   Interrogé par : DependencyGraph, ImpactAnalyzer, SemanticSearch, etc.
 */

import fs from "fs";
import path from "path";
import { SELF_ROOT } from "../utils/selfRoot";
import { createLogger } from "../utils/logger";
import type {
  FileNode,
  CodeEntity,
  KnowledgeGraphState,
  KnowledgeStats,
  EntityRelation,
} from "./types";

const log = createLogger("KnowledgeGraph");

/** Chemin du fichier de persistance calculé dynamiquement depuis SELF_ROOT */
function getStorePath(): string {
  return path.join(SELF_ROOT, ".jarvis", "ProjectKnowledge.json");
}

// ═══════════════════════════════════════════════════════════════════════════════
// KnowledgeGraph
// ═══════════════════════════════════════════════════════════════════════════════

export class KnowledgeGraph {
  private state: KnowledgeGraphState;
  private dirty: boolean = false;
  private updateListeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.createEmptyState();
    // Charger immédiatement les données persistées pour éviter un état vide
    // entre le démarrage du serveur et la fin du premier scanAll().
    this.load();
  }

  onUpdate(listener: () => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  private emitUpdate(): void {
    for (const l of this.updateListeners) {
      try { l(); } catch (e) {
        log.error(`Listener KnowledgeGraph.onUpdate a échoué: ${(e as Error).message}`);
      }
    }
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  /**
   * Charge le graphe depuis le disque.
   */
  load(): void {
    try {
      const storePath = getStorePath();
      if (fs.existsSync(storePath)) {
        const raw = fs.readFileSync(storePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.files) {
          this.state = this.validateState(parsed);
          log.info(`📂 Graphe de connaissances chargé: ${Object.keys(this.state.files).length} fichiers`);
          return;
        }
      }
    } catch (err) {
      log.warn(`⚠️ Échec du chargement du KnowledgeGraph: ${(err as Error).message}`);
    }
    this.state = this.createEmptyState();
  }

  /**
   * Sauvegarde le graphe sur disque.
   */
  save(): void {
    if (!this.dirty) return;
    try {
      const storePath = getStorePath();
      const dir = path.dirname(storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(storePath, JSON.stringify(this.state, null, 2), "utf-8");
      this.dirty = false;
      log.info(`💾 Graphe sauvegardé: ${storePath}`);
    } catch (err) {
      log.error(`❌ Échec sauvegarde graphe: ${(err as Error).message}`);
    }
  }

  // ─── Mise à jour du graphe ───────────────────────────────────────────────

  /**
   * Met à jour le graphe avec les fichiers indexés.
   * Appelé par ProjectIndexer après un scan complet ou partiel.
   */
  update(files: FileNode[]): void {
    log.info(`🔄 Mise à jour du graphe avec ${files.length} fichier(s)`);

    // Un scan complet est une photographie autoritaire : supprimer aussi les
    // nœuds disparus pour éviter une mémoire structurelle obsolète.
    this.state.files = Object.fromEntries(files.map((file) => [file.path, file]));

    // Reconstruire l'index des entités
    this.rebuildEntityIndex();

    // Reconstruire le graphe de dépendances
    this.rebuildDependencyGraph();

    // Mettre à jour les stats
    this.state.stats = this.computeStats();

    // Marquer comme modifié
    this.state.lastIndexed = new Date().toISOString();
    this.dirty = true;

    // Sauvegarder automatiquement
    this.save();

    this.emitUpdate();

    log.info(`✅ Graphe mis à jour: ${this.state.stats.totalFiles} fichiers, ${this.state.stats.totalEntities} entités`);
  }

  /**
   * Supprime un fichier du graphe (quand un fichier est supprimé).
   */
  removeFile(filePath: string): void {
    delete this.state.files[filePath];
    this.rebuildEntityIndex();
    this.rebuildDependencyGraph();
    this.state.stats = this.computeStats();
    this.state.lastIndexed = new Date().toISOString();
    this.dirty = true;
    this.save();
    this.emitUpdate();
    log.info(`🗑️ Fichier retiré du graphe: ${filePath}`);
  }

  /**
   * Réindexe un seul fichier (après modification).
   */
  updateFile(file: FileNode): void {
    this.state.files[file.path] = file;
    this.rebuildEntityIndex();
    this.rebuildDependencyGraph();
    this.state.stats = this.computeStats();
    this.state.lastIndexed = new Date().toISOString();
    this.dirty = true;
    this.save();
    this.emitUpdate();
    log.info(`📝 Fichier mis à jour dans le graphe: ${file.path}`);
  }

  // ─── Requêtes ─────────────────────────────────────────────────────────────

  /** Retourne tous les fichiers indexés */
  getAllFiles(): FileNode[] {
    return Object.values(this.state.files);
  }

  /** Retourne un fichier par son chemin */
  getFile(filePath: string): FileNode | undefined {
    return this.state.files[filePath];
  }

  /** Retourne les entités correspondant à un nom */
  getEntities(name: string): CodeEntity[] {
    return this.state.entities[name] ?? [];
  }

  /** Retourne les dépendances d'un fichier (ce qu'il importe) */
  getDependencies(filePath: string): string[] {
    return this.state.dependencies[filePath] ?? [];
  }

  /** Retourne les dépendants d'un fichier (qui l'importe) */
  getDependents(filePath: string): string[] {
    return this.state.dependents[filePath] ?? [];
  }

  /** Retourne l'état complet (lecture seule) */
  getState(): Readonly<KnowledgeGraphState> {
    return this.state;
  }

  /** Retourne les statistiques */
  getStats(): KnowledgeStats {
    return this.state.stats;
  }

  /** Retourne la date du dernier indexage */
  getLastIndexed(): string {
    return this.state.lastIndexed;
  }

  /** Vérifie si le graphe a été initialisé (au moins un fichier indexé) */
  isInitialized(): boolean {
    return this.state.stats.totalFiles > 0;
  }

  // ─── Recherche ────────────────────────────────────────────────────────────

  /**
   * Recherche des entités par nom (recherche partielle insensible à la casse).
   */
  searchEntities(query: string): CodeEntity[] {
    const lower = query.toLowerCase();
    const results: CodeEntity[] = [];
    for (const [, entities] of Object.entries(this.state.entities)) {
      for (const entity of entities) {
        if (entity.name.toLowerCase().includes(lower)) {
          results.push(entity);
        }
      }
    }
    return results;
  }

  /**
   * Recherche des fichiers par nom ou chemin.
   */
  searchFiles(query: string): FileNode[] {
    const lower = query.toLowerCase();
    return Object.values(this.state.files).filter(
      (f) => f.path.toLowerCase().includes(lower) || f.name.toLowerCase().includes(lower)
    );
  }

  // ─── Relations sémantiques ────────────────────────────────────────────────

  /**
   * Retourne toutes les relations du graphe.
   */
  getRelations(): EntityRelation[] {
    return this.state.relations;
  }

  /**
   * Retourne les relations d'une entité (source ou cible).
   */
  getEntityRelations(entityName: string): EntityRelation[] {
    return this.state.relations.filter(
      r => r.source.name === entityName || r.target.name === entityName
    );
  }

  /**
   * Retourne les relations d'un type donné.
   */
  getRelationsByType(type: EntityRelation["relationType"]): EntityRelation[] {
    return this.state.relations.filter(r => r.relationType === type);
  }

  /**
   * Retourne les relations impliquant un fichier (source ou cible).
   */
  getFileRelations(filePath: string): EntityRelation[] {
    return this.state.relations.filter(
      r => r.source.filePath === filePath || r.target.filePath === filePath
    );
  }

  /**
   * Retourne les classes/entités qui étendent une classe donnée.
   */
  getSubclasses(className: string): EntityRelation[] {
    return this.state.relations.filter(
      r => r.relationType === "extends" && r.target.name === className
    );
  }

  /**
   * Retourne les classes qui implémentent une interface donnée.
   */
  getImplementors(interfaceName: string): EntityRelation[] {
    return this.state.relations.filter(
      r => r.relationType === "implements" && r.target.name === interfaceName
    );
  }

  /**
   * Met à jour les relations du graphe.
   * Appelé après l'extraction des relations par le RelationExtractor.
   */
  setRelations(relations: EntityRelation[]): void {
    this.state.relations = relations;
    this.dirty = true;
  }

  /**
   * Ajoute des relations au graphe (sans écraser les existantes).
   */
  addRelations(newRelations: EntityRelation[]): void {
    this.state.relations.push(...newRelations);
    this.dirty = true;
  }

  /**
   * Génère un résumé textuel compact du KnowledgeGraph pour injection dans le contexte LLM.
   * Optimisé pour consommer peu de tokens.
   */
  toContextSummary(): string {
    const { stats } = this.state;
    const lines: string[] = [];

    lines.push(`📊 PROJET: ${this.state.projectRoot}`);
    lines.push(`   Fichiers: ${stats.totalFiles} | Lignes: ${stats.totalLines}`);
    lines.push(`   Entités: ${stats.totalEntities} | Exports: ${stats.totalExports}`);
    lines.push(`   Dernier index: ${this.state.lastIndexed}`);

    // Top 5 extensions
    const topExts = Object.entries(stats.filesByExtension)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (topExts.length > 0) {
      lines.push(`   Extensions: ${topExts.map(([ext, count]) => `${ext}(${count})`).join(", ")}`);
    }

    // Top 5 types d'entités
    const topEntities = Object.entries(stats.entitiesByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (topEntities.length > 0) {
      lines.push(`   Entités: ${topEntities.map(([type, count]) => `${type}(${count})`).join(", ")}`);
    }

    const structuralTypes = ["route", "db_table", "env_var", "test", "symbol"];
    const structuralSummary = structuralTypes
      .map((type) => [type, stats.entitiesByType[type] ?? 0] as const)
      .filter(([, count]) => count > 0);
    if (structuralSummary.length > 0) {
      lines.push(`   Structure: ${structuralSummary.map(([type, count]) => `${type}(${count})`).join(", ")}`);
    }

    const relationCounts = new Map<string, number>();
    for (const relation of this.state.relations) {
      relationCounts.set(relation.relationType, (relationCounts.get(relation.relationType) ?? 0) + 1);
    }
    if (relationCounts.size > 0) {
      const summary = [...relationCounts.entries()]
        .sort(([, left], [, right]) => right - left)
        .slice(0, 6)
        .map(([type, count]) => `${type}(${count})`)
        .join(", ");
      lines.push(`   Relations: ${this.state.relations.length} | ${summary}`);
    }

    return lines.join("\n");
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  private createEmptyState(): KnowledgeGraphState {
    return {
      projectRoot: SELF_ROOT,
      files: {},
      entities: {},
      dependencies: {},
      dependents: {},
      relations: [],
      lastIndexed: "",
      stats: {
        totalFiles: 0,
        totalLines: 0,
        totalEntities: 0,
        totalExports: 0,
        totalImports: 0,
        averageFileSize: 0,
        filesByExtension: {},
        entitiesByType: {},
      },
    };
  }

  private validateState(parsed: any): KnowledgeGraphState {
    // Validation de base — on s'assure que les structures clés existent
    return {
      projectRoot: parsed.projectRoot || SELF_ROOT,
      files: parsed.files || {},
      entities: parsed.entities || {},
      dependencies: parsed.dependencies || {},
      dependents: parsed.dependents || {},
      relations: parsed.relations || [],
      lastIndexed: parsed.lastIndexed || "",
      stats: {
        totalFiles: parsed.stats?.totalFiles ?? 0,
        totalLines: parsed.stats?.totalLines ?? 0,
        totalEntities: parsed.stats?.totalEntities ?? 0,
        totalExports: parsed.stats?.totalExports ?? 0,
        totalImports: parsed.stats?.totalImports ?? 0,
        averageFileSize: parsed.stats?.averageFileSize ?? 0,
        filesByExtension: parsed.stats?.filesByExtension ?? {},
        entitiesByType: parsed.stats?.entitiesByType ?? {},
      },
    };
  }

  private rebuildEntityIndex(): void {
    const newIndex: Record<string, CodeEntity[]> = {};

    for (const file of Object.values(this.state.files)) {
      for (const entity of file.entities) {
        if (!newIndex[entity.name]) {
          newIndex[entity.name] = [];
        }
        newIndex[entity.name].push(entity);
      }
    }

    this.state.entities = newIndex;
  }

  private rebuildDependencyGraph(): void {
    const deps: Record<string, string[]> = {};
    const dependents: Record<string, string[]> = {};

    // Initialiser les ensembles vides
    for (const filePath of Object.keys(this.state.files)) {
      deps[filePath] = [];
    }

    // Remplir les dépendances
    for (const file of Object.values(this.state.files)) {
      deps[file.path] = file.imports;

      // Remplir les dépendants (graphe inverse)
      for (const imp of file.imports) {
        // Résoudre les imports relatifs en chemins absolus si possible
        const resolved = this.resolveImportPath(file.path, imp);
        if (resolved) {
          if (!dependents[resolved]) {
            dependents[resolved] = [];
          }
          if (!dependents[resolved].includes(file.path)) {
            dependents[resolved].push(file.path);
          }
        }
      }
    }

    this.state.dependencies = deps;
    this.state.dependents = dependents;
  }

  /**
   * Résout un chemin d'import relatif en chemin de fichier connu.
   * Exemple: "./types" → "server/knowledge/types.ts"
   */
  private resolveImportPath(sourceFile: string, importPath: string): string | null {
    // Ignorer les imports de packages node_modules
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      return null;
    }

    const sourceDir = path.dirname(sourceFile);
    const resolved = path.normalize(path.join(sourceDir, importPath));

    // Chercher le fichier avec différentes extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js"];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (this.state.files[candidate]) {
        return candidate;
      }
    }

    // Essayer le chemin tel quel (déjà résolu)
    if (this.state.files[resolved]) {
      return resolved;
    }

    return null;
  }

  private computeStats(): KnowledgeStats {
    const files = Object.values(this.state.files);
    const totalFiles = files.length;
    let totalLines = 0;
    let totalSize = 0;
    const filesByExtension: Record<string, number> = {};
    const entitiesByType: Record<string, number> = {};
    let totalExports = 0;
    let totalImports = 0;

    for (const file of files) {
      totalLines += file.lines;
      totalSize += file.size;

      // Compter par extension
      const ext = file.extension || "other";
      filesByExtension[ext] = (filesByExtension[ext] || 0) + 1;

      // Compter les entités par type
      for (const entity of file.entities) {
        entitiesByType[entity.type] = (entitiesByType[entity.type] || 0) + 1;
      }

      totalExports += file.exports.length;
      totalImports += file.imports.length;
    }

    const totalEntities = Object.values(entitiesByType).reduce((sum, count) => sum + count, 0);

    return {
      totalFiles,
      totalLines,
      totalEntities,
      totalExports,
      totalImports,
      averageFileSize: totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0,
      filesByExtension,
      entitiesByType,
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du KnowledgeGraph */
export const knowledgeGraph = new KnowledgeGraph();

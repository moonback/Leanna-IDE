/**
 * ArtifactManager — Gestion centralisée des artefacts
 * 
 * Ce composant gère le cycle de vie complet des artefacts produits par le système :
 * - Création et suivi des fichiers générés/modifiés
 * - Versioning avec historique complet
 * - Détection de doublons basée sur les hashs
 * - Gestion des références entre artefacts
 * - Intégration avec l'EventBus pour la notification
 * - Nettoyage et garbage collection
 * 
 * @example
 * // Initialisation
 * const artifactManager = new ArtifactManager(eventBus);
 * 
 * // Création d'un artefact
 * const artifact = await artifactManager.create({
 *   name: "output.json",
 *   path: "/tmp/output.json",
 *   type: "data",
 *   content: JSON.stringify({ result: "success" }),
 *   createdBy: "agent-123"
 * });
 * 
 * // Versioning
 * const newVersion = await artifactManager.version(
 *   artifact.id,
 *   updatedContent,
 *   "Mise à jour avec nouvelles données"
 * );
 * 
 * // Récupération
 * const retrieved = artifactManager.get(artifact.id);
 * const byPath = artifactManager.getByPath("/tmp/output.json");
 * 
 * // Abonnement aux événements
 * artifactManager.onArtifactCreated((artifact) => {
 *   console.log("Nouvel artefact:", artifact.name);
 * });
 */

import type {
  ID,
  Timestamp,
  Priority,
  FileType,
  FileStatus,
  Artifact,
  ArtifactVersion,
  ArtifactReference,
  ArtifactEventType,
  ArtifactEventData,
  TypedEvent,
} from "./types.js";
import type { EventBus } from "./EventBus.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types Internes
// ═══════════════════════════════════════════════════════════════════════════════

/** Options de création d'un artefact */
export interface CreateArtifactOptions {
  name: string;
  path: string;
  type: FileType;
  content?: string | Buffer | Uint8Array;
  size?: number;
  hash?: string; // SHA-256, si non fourni, sera calculé à partir du content
  createdBy: ID;
  metadata?: Record<string, unknown>;
  skipIfExists?: boolean; // Ne pas recréer si un artefact existe déjà à ce chemin
}

/** Options de mise à jour d'un artefact */
export interface UpdateArtifactOptions {
  id: ID;
  content?: string | Buffer | Uint8Array;
  name?: string;
  type?: FileType;
  metadata?: Record<string, unknown>;
  modifiedBy: ID;
}

/** Options de versioning d'un artefact */
export interface VersionArtifactOptions {
  artifactId: ID;
  content: string | Buffer | Uint8Array;
  description?: string;
  createdBy: ID;
  forceNewVersion?: boolean; // Créer une nouvelle version même si le hash est identique
}

/** Options de référence d'un artefact */
export interface ReferenceArtifactOptions {
  artifactId: ID;
  versionId?: ID;
  path: string;
  usedBy: ID;
}

/** Options d'export d'un artefact */
export interface ExportArtifactOptions {
  artifactId: ID;
  versionId?: ID;
  destinationPath: string;
  exportedBy: ID;
}

/** Options de nettoyage */
export interface CleanupOptions {
  maxAgeMs?: number; // Supprimer les artefacts non référencés depuis plus de X ms
  maxVersions?: number; // Garder maximum X versions par artefact
  keepLatest?: boolean; // Toujours garder la version la plus récente
  dryRun?: boolean; // Simuler sans supprimer
  onlyOrphaned?: boolean; // Ne supprimer que les artefacts sans références
}

/** Résultat d'une opération sur artefact */
export interface ArtifactOperationResult<T = Artifact> {
  success: boolean;
  artifact?: T;
  version?: ArtifactVersion;
  reference?: ArtifactReference;
  message: string;
  error?: string;
  warnings?: string[];
}

/** Callback pour les événements d'artefact */
export type ArtifactCreatedCallback = (artifact: Artifact) => void;
export type ArtifactModifiedCallback = (artifact: Artifact, previous: Artifact) => void;
export type ArtifactVersionedCallback = (artifact: Artifact, version: ArtifactVersion) => void;
export type ArtifactDeletedCallback = (artifactId: ID, artifact: Artifact) => void;
export type ArtifactReferencedCallback = (reference: ArtifactReference) => void;
export type ArtifactExportedCallback = (artifact: Artifact, destinationPath: string) => void;

/** Statistiques du ArtifactManager */
export interface ArtifactManagerStats {
  totalArtifacts: number;
  totalVersions: number;
  totalReferences: number;
  totalSize: number; // Octets
  byType: Record<FileType, number>;
  byStatus: Record<FileStatus, number>;
  orphanedArtifacts: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/** Configuration du ArtifactManager */
export interface ArtifactManagerConfig {
  // Chemin de stockage des artefacts (optionnel, par défaut: mémoire)
  storagePath?: string;
  
  // Activer la détection de doublons basée sur les hashs
  enableDeduplication: boolean;
  
  // Activer le versioning automatique
  enableAutoVersioning: boolean;
  
  // Nombre maximum de versions à conserver par défaut
  maxVersionsPerArtifact: number;
  
  // Âge maximum des artefacts orphelins avant suppression (en ms)
  maxOrphanAgeMs: number;
  
  //Priorité des événements émis
  eventPriority: Priority;
  
  // Source des événements
  eventSource: string;
}

/** Configuration par défaut */
export const DEFAULT_ARTIFACT_MANAGER_CONFIG: ArtifactManagerConfig = {
  enableDeduplication: true,
  enableAutoVersioning: true,
  maxVersionsPerArtifact: 10,
  maxOrphanAgeMs: 24 * 60 * 60 * 1000, // 24 heures
  eventPriority: "medium",
  eventSource: "core.ArtifactManager",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ArtifactManager
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ArtifactManager gère le cycle de vie complet des artefacts.
 * 
 * Un artefact représente un fichier ou une ressource produite par le système
 * (code généré, fichiers de configuration, données, etc.).
 */
export class ArtifactManager {
  // Stockage des artefacts
  private artifacts: Map<ID, Artifact> = new Map();
  
  // Stockage des versions par artefact
  private versions: Map<ID, ArtifactVersion[]> = new Map();
  
  // Stockage des références
  private references: Map<ID, ArtifactReference[]> = new Map();
  
  // Index par chemin pour une recherche rapide
  private pathIndex: Map<string, ID> = new Map();
  
  // Index par hash pour la détection de doublons
  private hashIndex: Map<string, ID> = new Map();
  
  // EventBus pour la notification
  private eventBus?: EventBus;
  
  // Configuration
  private config: ArtifactManagerConfig;
  
  // Callbacks locaux (si pas d'EventBus)
  private callbacks: {
    onCreated: ArtifactCreatedCallback[];
    onModified: ArtifactModifiedCallback[];
    onVersioned: ArtifactVersionedCallback[];
    onDeleted: ArtifactDeletedCallback[];
    onReferenced: ArtifactReferencedCallback[];
    onExported: ArtifactExportedCallback[];
  } = {
    onCreated: [],
    onModified: [],
    onVersioned: [],
    onDeleted: [],
    onReferenced: [],
    onExported: [],
  };
  
  // File watchers (pour l'intégration future)
  private fileWatchers: Map<string, () => void> = new Map();
  
  // Compteur d'IDs
  private nextId = 0;

  /**
   * Crée une nouvelle instance de ArtifactManager.
   * 
   * @param eventBus - EventBus optionnel pour l'intégration événementielle
   * @param config - Configuration personnalisée
   */
  constructor(eventBus?: EventBus, config: Partial<ArtifactManagerConfig> = {}) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_ARTIFACT_MANAGER_CONFIG, ...config };
    
    // Initialisation
    this.initialize();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Initialise le gestionnaire.
   */
  private initialize(): void {
    // Initialisation de l'index
    this.artifacts = new Map();
    this.versions = new Map();
    this.references = new Map();
    this.pathIndex = new Map();
    this.hashIndex = new Map();
    this.nextId = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ID Generation
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Génère un nouvel ID unique.
   */
  private generateId(): ID {
    return `artifact-${++this.nextId}-${Date.now()}`;
  }

  /**
   * Génère un ID de version unique.
   */
  private generateVersionId(artifactId: ID): ID {
    return `version-${artifactId}-${++this.nextId}-${Date.now()}`;
  }

  /**
   * Génère un ID de référence unique.
   */
  private generateReferenceId(): ID {
    return `ref-${++this.nextId}-${Date.now()}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Hash Utilities
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Calcule le hash SHA-256 d'un contenu.
   */
  private async computeHash(content: string | Buffer | Uint8Array): Promise<string> {
    try {
      // Implémentation avec l'API Web Crypto si disponible
      if (typeof crypto !== "undefined" && crypto.subtle) {
        const encoder = new TextEncoder();
        const data = typeof content === "string" 
          ? encoder.encode(content) 
          : (content instanceof Buffer ? content : new Uint8Array(content));
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      }
      
      // Fallback pour Node.js
      if (typeof require !== "undefined") {
        const { createHash } = await import("node:crypto");
        const data = typeof content === "string" 
          ? content 
          : (content instanceof Buffer ? content : Buffer.from(content));
        return createHash("sha256").update(data).digest("hex");
      }
      
      // Fallback basique (pour les tests)
      return this.simpleHash(content);
    } catch (error) {
      console.warn("[ArtifactManager] Impossible de calculer le hash SHA-256:", error);
      return this.simpleHash(content);
    }
  }

  /**
   * Hash simple pour fallback.
   */
  private simpleHash(content: string | Buffer | Uint8Array): string {
    const str = typeof content === "string" 
      ? content 
      : (content instanceof Buffer ? content.toString() : new TextDecoder().decode(content));
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `simple-${hash}-${str.length}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Event Emission
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Émet un événement via l'EventBus ou les callbacks locaux.
   */
  private emitEvent(
    type: ArtifactEventType,
    data: ArtifactEventData
  ): void {
    if (this.eventBus) {
      const event: TypedEvent<ArtifactEventType> = {
        type,
        data,
        timestamp: new Date().toISOString(),
        source: this.config.eventSource,
        priority: this.config.eventPriority,
      } as TypedEvent<ArtifactEventType>;
      this.eventBus.emit(event);
    }
    
    // Exécuter les callbacks locaux
    this.executeCallbacks(type, data);
  }

  /**
   * Exécute les callbacks pour un type d'événement.
   */
  private executeCallbacks(type: ArtifactEventType, data: ArtifactEventData): void {
    try {
      switch (type) {
        case "artifact:created":
          this.callbacks.onCreated.forEach(cb => {
            if (data.artifact) cb(data.artifact);
          });
          break;
        case "artifact:modified":
          this.callbacks.onModified.forEach(cb => {
            if (data.artifact) {
              const previous = this.artifacts.get(data.artifactId) || data.artifact;
              cb(data.artifact, previous);
            }
          });
          break;
        case "artifact:versioned":
          this.callbacks.onVersioned.forEach(cb => {
            if (data.artifact && data.version) {
              cb(data.artifact, data.version);
            }
          });
          break;
        case "artifact:deleted":
          this.callbacks.onDeleted.forEach(cb => {
            if (data.artifact) {
              cb(data.artifactId, data.artifact);
            }
          });
          break;
        case "artifact:referenced":
          this.callbacks.onReferenced.forEach(cb => {
            if (data.reference) cb(data.reference);
          });
          break;
        case "artifact:exported":
          this.callbacks.onExported.forEach(cb => {
            if (data.artifact) {
              cb(data.artifact, data.path);
            }
          });
          break;
      }
    } catch (error) {
      console.error("[ArtifactManager] Erreur dans les callbacks:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Create, Read, Update, Delete (CRUD)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Crée un nouvel artefact.
   * 
   * @param options - Options de création
   * @returns Résultat de l'opération
   */
  async create(options: CreateArtifactOptions): Promise<ArtifactOperationResult<Artifact>> {
    try {
      // Vérification que l'artefact n'existe pas déjà au même chemin (si skipIfExists)
      if (options.skipIfExists) {
        const existingAtPath = this.pathIndex.get(options.path);
        if (existingAtPath) {
          const existing = this.artifacts.get(existingAtPath);
          if (existing) {
            return {
              success: true,
              artifact: existing,
              message: `Artefact déjà existant au chemin ${options.path}`,
              warnings: ["skipIfExists est activé, artifact existant retourné"],
            };
          }
        }
      }

      // Calcul du hash si non fourni
      let contentHash = options.hash;
      if (!contentHash && options.content) {
        contentHash = await this.computeHash(options.content);
      }

      // Détection de doublons
      if (this.config.enableDeduplication && contentHash) {
        const existingWithHash = this.hashIndex.get(contentHash);
        if (existingWithHash) {
          const existing = this.artifacts.get(existingWithHash);
          if (existing) {
            // Mettre à jour les index si le chemin est différent
            if (existing.path !== options.path) {
              this.pathIndex.set(options.path, existing.id);
            }
            return {
              success: true,
              artifact: existing,
              message: "Artefact avec le même hash existe déjà (dédoublonnage)",
              warnings: [`Doublon détecté avec l'artefact ${existing.id}`],
            };
          }
        }
      }

      // Calcul de la taille si non fournie
      let size = options.size || 0;
      if (options.content) {
        size = typeof options.content === "string" 
          ? new Blob([options.content]).size 
          : (options.content instanceof Buffer 
            ? options.content.length 
            : options.content.length);
      }

      // Création de l'artefact
      const now = new Date().toISOString();
      const artifact: Artifact = {
        id: this.generateId(),
        name: options.name,
        path: options.path,
        type: options.type,
        status: "created",
        size,
        hash: contentHash || this.simpleHash(options.content || options.name),
        createdAt: now,
        modifiedAt: now,
        createdBy: options.createdBy,
        metadata: options.metadata || {},
      };

      // Stockage
      this.artifacts.set(artifact.id, artifact);
      this.pathIndex.set(artifact.path, artifact.id);
      
      if (artifact.hash) {
        this.hashIndex.set(artifact.hash, artifact.id);
      }

      // Création de la première version si auto-versioning est activé
      if (this.config.enableAutoVersioning && options.content) {
        await this.createVersion(artifact.id, options.content, options.createdBy, true);
      }

      // Émission de l'événement
      this.emitEvent("artifact:created", {
        artifactId: artifact.id,
        artifact,
        path: artifact.path,
        action: "create",
        timestamp: now,
      });

      return {
        success: true,
        artifact,
        message: `Artefact créé avec succès: ${artifact.id}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Erreur lors de la création de l'artefact",
        error: errorMessage,
      };
    }
  }

  /**
   * Crée une nouvelle version d'un artefact.
   * 
   * @param artifactId - ID de l'artefact
   * @param content - Nouveau contenu
   * @param createdBy - ID du créateur
   * @param isInitial - Si c'est la version initiale
   * @returns La version créée
   */
  private async createVersion(
    artifactId: ID,
    content: string | Buffer | Uint8Array,
    createdBy: ID,
    isInitial = false
  ): Promise<ArtifactVersion | null> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      return null;
    }

    // Calcul du hash du contenu
    const contentHash = await this.computeHash(content);
    const size = typeof content === "string" 
      ? new Blob([content]).size 
      : (content instanceof Buffer ? content.length : content.length);

    const now = new Date().toISOString();
    const version: ArtifactVersion = {
      id: this.generateVersionId(artifactId),
      artifactId,
      contentHash,
      timestamp: now,
      size,
      createdBy,
      description: isInitial ? "Version initiale" : undefined,
    };

    // Stockage de la version
    let artifactVersions = this.versions.get(artifactId);
    if (!artifactVersions) {
      artifactVersions = [];
      this.versions.set(artifactId, artifactVersions);
    }
    
    artifactVersions.push(version);
    
    // Limiter le nombre de versions
    if (artifactVersions.length > this.config.maxVersionsPerArtifact) {
      artifactVersions.shift();
    }

    // Mise à jour du hash principal si c'est la première version
    if (isInitial) {
      artifact.hash = contentHash;
      artifact.size = size;
      if (artifact.hash) {
        this.hashIndex.set(artifact.hash, artifact.id);
      }
    }

    return version;
  }

  /**
   * Met à jour un artefact existant.
   * 
   * @param options - Options de mise à jour
   * @returns Résultat de l'opération
   */
  async update(options: UpdateArtifactOptions): Promise<ArtifactOperationResult<Artifact>> {
    try {
      const artifact = this.artifacts.get(options.id);
      if (!artifact) {
        return {
          success: false,
          message: `Artefact non trouvé: ${options.id}`,
          error: "NOT_FOUND",
        };
      }

      const previousArtifact = { ...artifact };
      const now = new Date().toISOString();

      // Mise à jour des propriétés
      if (options.name) artifact.name = options.name;
      if (options.type) artifact.type = options.type;
      if (options.metadata) artifact.metadata = { ...artifact.metadata, ...options.metadata };
      
      artifact.modifiedAt = now;
      artifact.status = "modified";

      // Si le contenu est fourni, créer une nouvelle version
      if (options.content) {
        const contentHash = await this.computeHash(options.content);
        const size = typeof options.content === "string" 
          ? new Blob([options.content]).size 
          : (options.content instanceof Buffer ? options.content.length : options.content.length);

        artifact.hash = contentHash;
        artifact.size = size;
        
        if (artifact.hash) {
          this.hashIndex.set(artifact.hash, artifact.id);
        }

        // Créer une nouvelle version
        await this.createVersion(artifact.id, options.content, options.modifiedBy);
      }

      // Émission de l'événement
      this.emitEvent("artifact:modified", {
        artifactId: artifact.id,
        artifact,
        path: artifact.path,
        action: "modify",
        timestamp: now,
      });

      return {
        success: true,
        artifact,
        message: `Artefact mis à jour: ${artifact.id}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Erreur lors de la mise à jour de l'artefact",
        error: errorMessage,
      };
    }
  }

  /**
   * Crée une nouvelle version explicite d'un artefact.
   * 
   * @param options - Options de versioning
   * @returns Résultat de l'opération
   */
  async version(options: VersionArtifactOptions): Promise<ArtifactOperationResult<Artifact>> {
    try {
      const artifact = this.artifacts.get(options.artifactId);
      if (!artifact) {
        return {
          success: false,
          message: `Artefact non trouvé: ${options.artifactId}`,
          error: "NOT_FOUND",
        };
      }

      // Vérifier si le hash existe déjà (sauf si forceNewVersion)
      const contentHash = await this.computeHash(options.content);
      
      if (!options.forceNewVersion) {
        const existingVersions = this.versions.get(options.artifactId) || [];
        const lastVersion = existingVersions[existingVersions.length - 1];
        
        if (lastVersion && lastVersion.contentHash === contentHash) {
          return {
            success: true,
            artifact,
            version: lastVersion,
            message: "Contenu identique à la dernière version, aucune nouvelle version créée",
            warnings: ["Contenu inchangé"],
          };
        }
      }

      // Création de la version
      const version = await this.createVersion(
        options.artifactId,
        options.content,
        options.createdBy,
        false
      );

      if (!version) {
        return {
          success: false,
          message: "Erreur lors de la création de la version",
          error: "VERSION_CREATION_FAILED",
        };
      }

      // Mise à jour de l'artefact
      artifact.hash = version.contentHash;
      artifact.size = version.size;
      artifact.modifiedAt = version.timestamp;
      artifact.status = "modified";
      
      if (artifact.hash) {
        this.hashIndex.set(artifact.hash, artifact.id);
      }

      // Émission de l'événement
      this.emitEvent("artifact:versioned", {
        artifactId: artifact.id,
        artifact,
        versionId: version.id,
        version,
        path: artifact.path,
        action: "version",
        timestamp: version.timestamp,
      });

      return {
        success: true,
        artifact,
        version,
        message: `Nouvelle version créée: ${version.id}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Erreur lors du versioning de l'artefact",
        error: errorMessage,
      };
    }
  }

  /**
   * Récupère un artefact par son ID.
   * 
   * @param id - ID de l'artefact
   * @returns L'artefact ou undefined
   */
  get(id: ID): Artifact | undefined {
    return this.artifacts.get(id);
  }

  /**
   * Récupère un artefact par son chemin.
   * 
   * @param path - Chemin de l'artefact
   * @returns L'artefact ou undefined
   */
  getByPath(path: string): Artifact | undefined {
    const id = this.pathIndex.get(path);
    return id ? this.artifacts.get(id) : undefined;
  }

  /**
   * Récupère tous les artefacts.
   */
  getAll(): Artifact[] {
    return Array.from(this.artifacts.values());
  }

  /**
   * Récupère toutes les versions d'un artefact.
   * 
   * @param artifactId - ID de l'artefact
   * @returns Tableau de versions
   */
  getVersions(artifactId: ID): ArtifactVersion[] {
    return this.versions.get(artifactId) || [];
  }

  /**
   * Récupère une version spécifique d'un artefact.
   * 
   * @param versionId - ID de la version
   * @returns La version ou undefined
   */
  getVersion(versionId: ID): ArtifactVersion | undefined {
    const versionArrays = Array.from(this.versions.values());
    for (const versions of versionArrays) {
      const version = versions.find(v => v.id === versionId);
      if (version) return version;
    }
    return undefined;
  }

  /**
   * Supprime un artefact.
   * 
   * @param id - ID de l'artefact
   * @param deleteVersions - Supprimer également les versions
   * @returns Résultat de l'opération
   */
  delete(id: ID, deleteVersions = true): ArtifactOperationResult {
    try {
      const artifact = this.artifacts.get(id);
      if (!artifact) {
        return {
          success: false,
          message: `Artefact non trouvé: ${id}`,
          error: "NOT_FOUND",
        };
      }

      const now = new Date().toISOString();

      // Suppression des index
      this.pathIndex.delete(artifact.path);
      if (artifact.hash) {
        this.hashIndex.delete(artifact.hash);
      }

      // Suppression des versions si demandé
      if (deleteVersions) {
        this.versions.delete(id);
      }

      // Suppression de l'artefact
      this.artifacts.delete(id);

      // Suppression des références
      this.references.delete(id);

      // Émission de l'événement
      this.emitEvent("artifact:deleted", {
        artifactId: id,
        artifact,
        path: artifact.path,
        action: "delete",
        timestamp: now,
      });

      return {
        success: true,
        artifact,
        message: `Artefact supprimé: ${id}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Erreur lors de la suppression de l'artefact",
        error: errorMessage,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Reference Management
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Ajoute une référence à un artefact.
   * 
   * @param options - Options de référence
   * @returns Résultat de l'opération
   */
  addReference(options: ReferenceArtifactOptions): ArtifactOperationResult<ArtifactReference> {
    try {
      const artifact = this.artifacts.get(options.artifactId);
      if (!artifact) {
        return {
          success: false,
          message: `Artefact non trouvé: ${options.artifactId}`,
          error: "NOT_FOUND",
        };
      }

      // Vérification que la version existe si spécifiée
      if (options.versionId) {
        const version = this.getVersion(options.versionId);
        if (!version || version.artifactId !== options.artifactId) {
          return {
            success: false,
            message: `Version non trouvée: ${options.versionId}`,
            error: "VERSION_NOT_FOUND",
          };
        }
      }

      const now = new Date().toISOString();
      const reference: ArtifactReference = {
        artifactId: options.artifactId,
        versionId: options.versionId,
        path: options.path,
        usedAt: now,
        usedBy: options.usedBy,
      };

      // Stockage de la référence
      let artifactReferences = this.references.get(options.artifactId);
      if (!artifactReferences) {
        artifactReferences = [];
        this.references.set(options.artifactId, artifactReferences);
      }
      
      artifactReferences.push(reference);

      // Émission de l'événement
      this.emitEvent("artifact:referenced", {
        artifactId: options.artifactId,
        artifact,
        versionId: options.versionId,
        reference,
        path: options.path,
        action: "reference",
        timestamp: now,
      });

      return {
        success: true,
        reference,
        message: `Référence ajoutée: ${reference.path}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Erreur lors de l'ajout de la référence",
        error: errorMessage,
      };
    }
  }

  /**
   * Récupère toutes les références d'un artefact.
   * 
   * @param artifactId - ID de l'artefact
   * @returns Tableau de références
   */
  getReferences(artifactId: ID): ArtifactReference[] {
    return this.references.get(artifactId) || [];
  }

  /**
   * Supprime une référence.
   * 
   * @param artifactId - ID de l'artefact
   * @param referenceId - ID de la référence
   * @returns Résultat de l'opération
   */
  removeReference(artifactId: ID, referenceId: ID): ArtifactOperationResult {
    const references = this.references.get(artifactId);
    if (!references) {
      return {
        success: false,
        message: `Aucune référence trouvée pour l'artefact: ${artifactId}`,
        error: "NOT_FOUND",
      };
    }

    const index = references.findIndex(r => r.artifactId === artifactId);
    if (index === -1) {
      return {
        success: false,
        message: `Référence non trouvée: ${referenceId}`,
        error: "NOT_FOUND",
      };
    }

    const [removed] = references.splice(index, 1);
    
    return {
      success: true,
      reference: removed,
      message: `Référence supprimée: ${referenceId}`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Export Management
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Exporte un artefact vers un chemin de destination.
   * 
   * @param options - Options d'export
   * @returns Résultat de l'opération
   */
  async export(options: ExportArtifactOptions): Promise<ArtifactOperationResult> {
    try {
      const artifact = this.artifacts.get(options.artifactId);
      if (!artifact) {
        return {
          success: false,
          message: `Artefact non trouvé: ${options.artifactId}`,
          error: "NOT_FOUND",
        };
      }

      // Récupération de la version demandée
      let version: ArtifactVersion | undefined;
      if (options.versionId) {
        version = this.getVersion(options.versionId);
        if (!version || version.artifactId !== options.artifactId) {
          return {
            success: false,
            message: `Version non trouvée: ${options.versionId}`,
            error: "VERSION_NOT_FOUND",
          };
        }
      } else {
        // Utiliser la dernière version
        const versions = this.getVersions(options.artifactId);
        version = versions[versions.length - 1];
      }

      const now = new Date().toISOString();

      // Dans une implémentation réelle, on copierait le contenu physique du fichier
      // Pour l'instant, on simule l'export
      // TODO: Implémenter la copie physique du fichier
      
      // Émission de l'événement
      this.emitEvent("artifact:exported", {
        artifactId: options.artifactId,
        artifact,
        versionId: version?.id,
        version,
        path: options.destinationPath,
        action: "export",
        timestamp: now,
      });

      return {
        success: true,
        artifact,
        message: `Artefact exporté vers: ${options.destinationPath}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Erreur lors de l'export de l'artefact",
        error: errorMessage,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Query & Search Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Recherche des artefacts par critères.
   * 
   * @param query - Critères de recherche
   * @returns Tableau d'artefacts correspondants
   */
  search(query: {
    name?: string;
    type?: FileType;
    status?: FileStatus;
    createdBy?: ID;
    minSize?: number;
    maxSize?: number;
    pathPattern?: RegExp | string;
  }): Artifact[] {
    const results: Artifact[] = [];
    
    const artifactsArray = Array.from(this.artifacts.values());
    for (const artifact of artifactsArray) {
      // Filtre par nom
      if (query.name && !artifact.name.includes(query.name)) {
        continue;
      }

      // Filtre par type
      if (query.type && artifact.type !== query.type) {
        continue;
      }

      // Filtre par statut
      if (query.status && artifact.status !== query.status) {
        continue;
      }

      // Filtre par créateur
      if (query.createdBy && artifact.createdBy !== query.createdBy) {
        continue;
      }

      // Filtre par taille minimale
      if (query.minSize && artifact.size < query.minSize) {
        continue;
      }

      // Filtre par taille maximale
      if (query.maxSize && artifact.size > query.maxSize) {
        continue;
      }

      // Filtre par pattern de chemin
      if (query.pathPattern) {
        const pattern = typeof query.pathPattern === "string" 
          ? new RegExp(query.pathPattern) 
          : query.pathPattern;
        if (!pattern.test(artifact.path)) {
          continue;
        }
      }

      results.push(artifact);
    }

    return results;
  }

  /**
   * Récupère les artefacts orphelins (sans références).
   */
  getOrphanedArtifacts(): Artifact[] {
    const orphaned: Artifact[] = [];
    
    const artifactsArray = Array.from(this.artifacts.values());
    for (const artifact of artifactsArray) {
      const refs = this.references.get(artifact.id) || [];
      if (refs.length === 0) {
        orphaned.push(artifact);
      }
    }

    return orphaned;
  }

  /**
   * Récupère les artefacts avec des doublons (même hash).
   */
  getDuplicates(): Map<string, Artifact[]> {
    const hashToArtifacts = new Map<string, Artifact[]>();
    
    const artifactsArray = Array.from(this.artifacts.values());
    for (const artifact of artifactsArray) {
      if (artifact.hash) {
        const artifacts = hashToArtifacts.get(artifact.hash) || [];
        artifacts.push(artifact);
        hashToArtifacts.set(artifact.hash, artifacts);
      }
    }

    // Filtrer pour ne garder que les hashs avec plusieurs artefacts
    const entriesArray = Array.from(hashToArtifacts.entries());
    for (const [hash, artifacts] of entriesArray) {
      if (artifacts.length <= 1) {
        hashToArtifacts.delete(hash);
      }
    }

    return hashToArtifacts;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Cleanup & Garbage Collection
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Nettoie les artefacts selon les critères spécifiés.
   * 
   * @param options - Options de nettoyage
   * @returns Résultat du nettoyage
   */
  cleanup(options: CleanupOptions = {}): {
    success: boolean;
    deletedCount: number;
    keptCount: number;
    deletedArtifacts: Artifact[];
    warnings?: string[];
  } {
    const deleted: Artifact[] = [];
    const now = Date.now();
    const warnings: string[] = [];

    // Si dryRun, ne rien supprimer
    if (options.dryRun) {
      warnings.push("Mode dry-run: aucune suppression effectuée");
    }

    // Nettoyage des artefacts orphelins
    if (options.onlyOrphaned) {
      const orphaned = this.getOrphanedArtifacts();
      
      for (const artifact of orphaned) {
        // Vérifier l'âge
        if (options.maxAgeMs) {
          const createdAt = new Date(artifact.createdAt).getTime();
          if (now - createdAt < options.maxAgeMs) {
            continue; // Trop récent
          }
        }

        if (!options.dryRun) {
          this.delete(artifact.id);
        }
        deleted.push(artifact);
      }
    } else {
      // Nettoyage de tous les artefacts
      const artifactsEntries = Array.from(this.artifacts.entries());
      for (const [id, artifact] of artifactsEntries) {
        // Vérifier l'âge pour les orphelins
        const isOrphaned = this.getReferences(id).length === 0;
        
        if (isOrphaned && options.maxAgeMs) {
          const createdAt = new Date(artifact.createdAt).getTime();
          if (now - createdAt < options.maxAgeMs) {
            continue; // Trop récent
          }
        }

        // Limiter le nombre de versions
        if (options.maxVersions) {
          const versions = this.getVersions(id);
          if (versions.length > options.maxVersions) {
            const toDelete = Math.max(0, versions.length - options.maxVersions);
            
            if (!options.dryRun) {
              const artifactVersions = this.versions.get(id) || [];
              artifactVersions.splice(0, toDelete);
            }
            
            warnings.push(`Artefact ${id}: ${toDelete} versions supprimées`);
          }
        }

        // Ne supprimer que les orphelins si keepLatest est vrai
        if (isOrphaned && options.keepLatest !== false) {
          if (!options.dryRun) {
            // Garder la dernière version
            const versions = this.getVersions(id);
            if (versions.length > 1) {
              const artifactVersions = this.versions.get(id) || [];
              artifactVersions.splice(0, artifactVersions.length - 1);
            }
          }
          deleted.push(artifact);
        }
      }
    }

    // Supprimer les artefacts collectés
    if (!options.dryRun) {
      for (const artifact of deleted) {
        this.artifacts.delete(artifact.id);
        this.pathIndex.delete(artifact.path);
        if (artifact.hash) {
          this.hashIndex.delete(artifact.hash);
        }
        this.versions.delete(artifact.id);
        this.references.delete(artifact.id);
      }
    }

    return {
      success: true,
      deletedCount: deleted.length,
      keptCount: this.artifacts.size - deleted.length,
      deletedArtifacts: deleted,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Subscription Methods (Local Callbacks)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Abonne un callback à la création d'artefacts.
   * 
   * @param callback - Callback à appeler
   * @returns Fonction de désabonnement
   */
  onArtifactCreated(callback: ArtifactCreatedCallback): () => void {
    this.callbacks.onCreated.push(callback);
    return () => {
      const index = this.callbacks.onCreated.indexOf(callback);
      if (index !== -1) {
        this.callbacks.onCreated.splice(index, 1);
      }
    };
  }

  /**
   * Abonne un callback à la modification d'artefacts.
   * 
   * @param callback - Callback à appeler
   * @returns Fonction de désabonnement
   */
  onArtifactModified(callback: ArtifactModifiedCallback): () => void {
    this.callbacks.onModified.push(callback);
    return () => {
      const index = this.callbacks.onModified.indexOf(callback);
      if (index !== -1) {
        this.callbacks.onModified.splice(index, 1);
      }
    };
  }

  /**
   * Abonne un callback au versioning d'artefacts.
   * 
   * @param callback - Callback à appeler
   * @returns Fonction de désabonnement
   */
  onArtifactVersioned(callback: ArtifactVersionedCallback): () => void {
    this.callbacks.onVersioned.push(callback);
    return () => {
      const index = this.callbacks.onVersioned.indexOf(callback);
      if (index !== -1) {
        this.callbacks.onVersioned.splice(index, 1);
      }
    };
  }

  /**
   * Abonne un callback à la suppression dartefacts.
   * 
   * @param callback - Callback à appeler
   * @returns Fonction de désabonnement
   */
  onArtifactDeleted(callback: ArtifactDeletedCallback): () => void {
    this.callbacks.onDeleted.push(callback);
    return () => {
      const index = this.callbacks.onDeleted.indexOf(callback);
      if (index !== -1) {
        this.callbacks.onDeleted.splice(index, 1);
      }
    };
  }

  /**
   * Abonne un callback à l'ajout de références.
   * 
   * @param callback - Callback à appeler
   * @returns Fonction de désabonnement
   */
  onArtifactReferenced(callback: ArtifactReferencedCallback): () => void {
    this.callbacks.onReferenced.push(callback);
    return () => {
      const index = this.callbacks.onReferenced.indexOf(callback);
      if (index !== -1) {
        this.callbacks.onReferenced.splice(index, 1);
      }
    };
  }

  /**
   * Abonne un callback à l'export d'artefacts.
   * 
   * @param callback - Callback à appeler
   * @returns Fonction de désabonnement
   */
  onArtifactExported(callback: ArtifactExportedCallback): () => void {
    this.callbacks.onExported.push(callback);
    return () => {
      const index = this.callbacks.onExported.indexOf(callback);
      if (index !== -1) {
        this.callbacks.onExported.splice(index, 1);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EventBus Setter
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Définit l'EventBus pour l'intégration événementielle.
   * 
   * @param eventBus - Instance de l'EventBus
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Statistics & Metrics
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les statistiques du gestionnaire.
   */
  getStats(): ArtifactManagerStats {
    const byType: Record<FileType, number> = {
      code: 0,
      config: 0,
      document: 0,
      data: 0,
      media: 0,
      other: 0,
    };

    const byStatus: Record<FileStatus, number> = {
      unchanged: 0,
      read: 0,
      modified: 0,
      created: 0,
      deleted: 0,
    };

    let totalSize = 0;
    let totalVersions = 0;
    let totalReferences = 0;

    const artifactsArray = Array.from(this.artifacts.values());
    for (const artifact of artifactsArray) {
      // Compter par type
      byType[artifact.type] = (byType[artifact.type] || 0) + 1;
      
      // Compter par statut
      byStatus[artifact.status] = (byStatus[artifact.status] || 0) + 1;
      
      // Taille totale
      totalSize += artifact.size || 0;
    }

    const versionsArrays = Array.from(this.versions.values());
    for (const versions of versionsArrays) {
      totalVersions += versions.length;
    }

    const refsArrays = Array.from(this.references.values());
    for (const refs of refsArrays) {
      totalReferences += refs.length;
    }

    return {
      totalArtifacts: this.artifacts.size,
      totalVersions,
      totalReferences,
      totalSize,
      byType,
      byStatus,
      orphanedArtifacts: this.getOrphanedArtifacts().length,
    };
  }

  /**
   * Récupère les artefacts les plus récemment utilisés.
   * 
   * @param limit - Nombre maximum d'artefacts à retourner
   */
  getRecentlyUsed(limit = 10): Artifact[] {
    const allArtifacts = Array.from(this.artifacts.values());
    
    allArtifacts.sort((a, b) => {
      const aModified = new Date(a.modifiedAt || a.createdAt).getTime();
      const bModified = new Date(b.modifiedAt || b.createdAt).getTime();
      return bModified - aModified;
    });

    return allArtifacts.slice(0, limit);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Reset Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Réinitialise complètement le gestionnaire.
   */
  reset(): void {
    this.artifacts.clear();
    this.versions.clear();
    this.references.clear();
    this.pathIndex.clear();
    this.hashIndex.clear();
    this.nextId = 0;
    this.callbacks = {
      onCreated: [],
      onModified: [],
      onVersioned: [],
      onDeleted: [],
      onReferenced: [],
      onExported: [],
    };
  }

  /**
   * Efface tous les artefacts et leurs données associées.
   */
  clearAll(): void {
    this.reset();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crée une instance de ArtifactManager avec configuration par défaut.
 * 
 * @param eventBus - EventBus optionnel
 * @returns Nouvelle instance de ArtifactManager
 */
export function createArtifactManager(eventBus?: EventBus): ArtifactManager {
  return new ArtifactManager(eventBus);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

/** Instance singleton du ArtifactManager */
export const artifactManager = new ArtifactManager();

export default ArtifactManager;

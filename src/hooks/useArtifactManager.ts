/**
 * useArtifactManager - Hook React pour l'intégration avec ArtifactManager
 * 
 * Ce hook permet aux composants React de gérer les artefacts via l'ArtifactManager.
 * 
 * @example
 * // Création d'un artefact
 * const { createArtifact } = useArtifactManager();
 * const result = await createArtifact({
 *   name: "output.json",
 *   path: "/tmp/output.json",
 *   type: "data",
 *   content: JSON.stringify({ result: "success" }),
 *   createdBy: "agent-123"
 * });
 * 
 * @example
 * // Liste des artefacts
 * const { artifacts, loading, error } = useArtifactManager();
 * 
 * @example
 * // Abonnement aux événements d'artefacts
 * useArtifactManager((event) => {
 *   console.log("Événement artefact:", event.type);
 * });
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  ID,
  FileType,
  FileStatus,
  Artifact,
  ArtifactVersion,
  ArtifactReference,
} from "../../server/core/types";
import {
  ArtifactManager,
  artifactManager,
  createArtifactManager,
  type CreateArtifactOptions,
  type UpdateArtifactOptions,
  type VersionArtifactOptions,
  type ReferenceArtifactOptions,
  type CleanupOptions,
  type ArtifactOperationResult,
  type ArtifactManagerStats,
} from "../../server/core/ArtifactManager";
import { useEventBus } from "./useEventBus";

/**
 * Résultat du hook useArtifactManager
 */
export interface UseArtifactManagerResult {
  // État
  artifacts: Artifact[];
  loading: boolean;
  error: string | null;
  
  // Méthodes CRUD
  createArtifact: (options: CreateArtifactOptions) => Promise<ArtifactOperationResult<Artifact>>;
  updateArtifact: (options: UpdateArtifactOptions) => Promise<ArtifactOperationResult<Artifact>>;
  versionArtifact: (options: VersionArtifactOptions) => Promise<ArtifactOperationResult<Artifact>>;
  deleteArtifact: (id: ID, deleteVersions?: boolean) => ArtifactOperationResult;
  
  // Méthodes de récupération
  getArtifact: (id: ID) => Artifact | undefined;
  getArtifactByPath: (path: string) => Artifact | undefined;
  getAllArtifacts: () => Artifact[];
  getVersions: (artifactId: ID) => ArtifactVersion[];
  getVersion: (versionId: ID) => ArtifactVersion | undefined;
  
  // Méthodes de référence
  addReference: (options: ReferenceArtifactOptions) => ArtifactOperationResult<ArtifactReference>;
  getReferences: (artifactId: ID) => ArtifactReference[];
  removeReference: (artifactId: ID, referenceId: ID) => ArtifactOperationResult;
  
  // Méthodes de recherche
  searchArtifacts: (query: {
    name?: string;
    type?: FileType;
    status?: FileStatus;
    createdBy?: ID;
    minSize?: number;
    maxSize?: number;
    pathPattern?: RegExp | string;
  }) => Artifact[];
  
  getOrphanedArtifacts: () => Artifact[];
  getDuplicates: () => Map<string, Artifact[]>;
  getRecentlyUsed: (limit?: number) => Artifact[];
  
  // Méthodes de nettoyage
  cleanup: (options?: CleanupOptions) => {
    success: boolean;
    deletedCount: number;
    keptCount: number;
    deletedArtifacts: Artifact[];
    warnings?: string[];
  };
  
  // Statistiques
  getStats: () => ArtifactManagerStats;
  
  // Gestion du manager
  reset: () => void;
  clearAll: () => void;
  
  // Abonnements aux événements
  onArtifactCreated: (callback: (artifact: Artifact) => void) => () => void;
  onArtifactModified: (callback: (artifact: Artifact, previous: Artifact) => void) => () => void;
  onArtifactVersioned: (callback: (artifact: Artifact, version: ArtifactVersion) => void) => () => void;
  onArtifactDeleted: (callback: (artifactId: ID, artifact: Artifact) => void) => () => void;
  onArtifactReferenced: (callback: (reference: ArtifactReference) => void) => () => void;
}

/**
 * Hook React pour l'intégration avec ArtifactManager
 * 
 * @param initialManager - Instance optionnelle d'ArtifactManager
 * @param autoSubscribe - Si vrai, s'abonne automatiquement aux événements EventBus
 * @returns Objet avec toutes les méthodes d'ArtifactManager
 */
export function useArtifactManager(
  initialManager?: ArtifactManager,
  autoSubscribe: boolean = true
): UseArtifactManagerResult {
  const [manager] = useState<ArtifactManager>(
    () => initialManager || createArtifactManager()
  );
  
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const { on, off } = useEventBus();
  
  // Synchroniser avec EventBus si autoSubscribe est activé
  useEffect(() => {
    if (autoSubscribe) {
      const unsubs: (() => void)[] = [];
      
      // S'abonner aux événements d'artefacts
      unsubs.push(on("artifact:created", (event: any) => {
        setArtifacts(manager.getAll());
      }));
      
      unsubs.push(on("artifact:modified", (event: any) => {
        setArtifacts(manager.getAll());
      }));
      
      unsubs.push(on("artifact:versioned", (event: any) => {
        setArtifacts(manager.getAll());
      }));
      
      unsubs.push(on("artifact:deleted", (event: any) => {
        setArtifacts(manager.getAll());
      }));
      
      // Chargement initial
      setArtifacts(manager.getAll());
      
      return () => {
        unsubs.forEach(unsub => unsub());
      };
    }
  }, [manager, autoSubscribe, on]);

  // Créer des callbacks mémorisés
  const memoizedCallbacks = useMemo(() => ({
    createArtifact: async (options: CreateArtifactOptions) => {
      try {
        setLoading(true);
        setError(null);
        const result = await manager.create(options);
        setArtifacts(manager.getAll());
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return { success: false, message: "Error creating artifact", error: String(err) };
      } finally {
        setLoading(false);
      }
    },
    updateArtifact: async (options: UpdateArtifactOptions) => {
      try {
        setLoading(true);
        setError(null);
        const result = await manager.update(options);
        setArtifacts(manager.getAll());
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return { success: false, message: "Error updating artifact", error: String(err) };
      } finally {
        setLoading(false);
      }
    },
    versionArtifact: async (options: VersionArtifactOptions) => {
      try {
        setLoading(true);
        setError(null);
        const result = await manager.version(options);
        setArtifacts(manager.getAll());
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return { success: false, message: "Error versioning artifact", error: String(err) };
      } finally {
        setLoading(false);
      }
    },
    deleteArtifact: (id: ID, deleteVersions?: boolean) => {
      try {
        setLoading(true);
        setError(null);
        const result = manager.delete(id, deleteVersions);
        setArtifacts(manager.getAll());
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return { success: false, message: "Error deleting artifact", error: String(err) };
      } finally {
        setLoading(false);
      }
    },
  }), [manager]);

  // Méthodes de récupération mémorisées
  const getArtifact = useCallback((id: ID) => manager.get(id), [manager]);
  const getArtifactByPath = useCallback((path: string) => manager.getByPath(path), [manager]);
  const getAllArtifacts = useCallback(() => manager.getAll(), [manager]);
  const getVersions = useCallback((artifactId: ID) => manager.getVersions(artifactId), [manager]);
  const getVersion = useCallback((versionId: ID) => manager.getVersion(versionId), [manager]);

  // Méthodes de référence mémorisées
  const addReference = useCallback(
    (options: ReferenceArtifactOptions) => {
      const result = manager.addReference(options);
      setArtifacts(manager.getAll());
      return result;
    },
    [manager]
  );
  const getReferences = useCallback((artifactId: ID) => manager.getReferences(artifactId), [manager]);
  const removeReference = useCallback(
    (artifactId: ID, referenceId: ID) => {
      const result = manager.removeReference(artifactId, referenceId);
      setArtifacts(manager.getAll());
      return result;
    },
    [manager]
  );

  // Méthodes de recherche mémorisées
  const searchArtifacts = useCallback(
    (query: {
      name?: string;
      type?: FileType;
      status?: FileStatus;
      createdBy?: ID;
      minSize?: number;
      maxSize?: number;
      pathPattern?: RegExp | string;
    }) => manager.search(query),
    [manager]
  );
  const getOrphanedArtifacts = useCallback(() => manager.getOrphanedArtifacts(), [manager]);
  const getDuplicates = useCallback(() => manager.getDuplicates(), [manager]);
  const getRecentlyUsed = useCallback((limit?: number) => manager.getRecentlyUsed(limit), [manager]);

  // Méthodes de nettoyage mémorisées
  const cleanup = useCallback(
    (options?: CleanupOptions) => {
      const result = manager.cleanup(options);
      setArtifacts(manager.getAll());
      return result;
    },
    [manager]
  );

  // Statistiques mémorisées
  const getStats = useCallback(() => manager.getStats(), [manager]);

  // Méthodes de gestion mémorisées
  const reset = useCallback(() => {
    manager.reset();
    setArtifacts([]);
  }, [manager]);
  const clearAll = useCallback(() => {
    manager.clearAll();
    setArtifacts([]);
  }, [manager]);

  // Abonnements aux événements mémorisés
  const onArtifactCreated = useCallback(
    (callback: (artifact: Artifact) => void) => {
      return manager.onArtifactCreated(callback);
    },
    [manager]
  );
  const onArtifactModified = useCallback(
    (callback: (artifact: Artifact, previous: Artifact) => void) => {
      return manager.onArtifactModified(callback);
    },
    [manager]
  );
  const onArtifactVersioned = useCallback(
    (callback: (artifact: Artifact, version: ArtifactVersion) => void) => {
      return manager.onArtifactVersioned(callback);
    },
    [manager]
  );
  const onArtifactDeleted = useCallback(
    (callback: (artifactId: ID, artifact: Artifact) => void) => {
      return manager.onArtifactDeleted(callback);
    },
    [manager]
  );
  const onArtifactReferenced = useCallback(
    (callback: (reference: ArtifactReference) => void) => {
      return manager.onArtifactReferenced(callback);
    },
    [manager]
  );

  return {
    artifacts,
    loading,
    error,
    createArtifact: memoizedCallbacks.createArtifact,
    updateArtifact: memoizedCallbacks.updateArtifact,
    versionArtifact: memoizedCallbacks.versionArtifact,
    deleteArtifact: memoizedCallbacks.deleteArtifact,
    getArtifact,
    getArtifactByPath,
    getAllArtifacts,
    getVersions,
    getVersion,
    addReference,
    getReferences,
    removeReference,
    searchArtifacts,
    getOrphanedArtifacts,
    getDuplicates,
    getRecentlyUsed,
    cleanup,
    getStats,
    reset,
    clearAll,
    onArtifactCreated,
    onArtifactModified,
    onArtifactVersioned,
    onArtifactDeleted,
    onArtifactReferenced,
  };
}

/**
 * Hook spécialisé pour écouter les créations d'artefacts
 */
export function useArtifactCreated(callback: (artifact: Artifact) => void) {
  const { onArtifactCreated } = useArtifactManager();
  
  useEffect(() => {
    const unsub = onArtifactCreated(callback);
    return unsub;
  }, [onArtifactCreated, callback]);
}

/**
 * Hook spécialisé pour écouter les modifications d'artefacts
 */
export function useArtifactModified(callback: (artifact: Artifact, previous: Artifact) => void) {
  const { onArtifactModified } = useArtifactManager();
  
  useEffect(() => {
    const unsub = onArtifactModified(callback);
    return unsub;
  }, [onArtifactModified, callback]);
}

/**
 * Hook spécialisé pour écouter le versioning d'artefacts
 */
export function useArtifactVersioned(callback: (artifact: Artifact, version: ArtifactVersion) => void) {
  const { onArtifactVersioned } = useArtifactManager();
  
  useEffect(() => {
    const unsub = onArtifactVersioned(callback);
    return unsub;
  }, [onArtifactVersioned, callback]);
}

/**
 * Hook pour obtenir les statistiques des artefacts
 */
export function useArtifactStats() {
  const { getStats } = useArtifactManager();
  const [stats, setStats] = useState<ArtifactManagerStats>(getStats());
  
  const refresh = useCallback(() => {
    setStats(getStats());
  }, [getStats]);
  
  return { stats, refresh };
}

export default useArtifactManager;

/**
 * useVerificationManager - Hook React pour l'intégration avec VerificationManager
 * 
 * Ce hook permet aux composants React de gérer les vérifications via le VerificationManager.
 * 
 * @example
 * // Exécuter une vérification
 * const { verify } = useVerificationManager();
 * const result = await verify({
 *   type: "safety_check",
 *   targetId: "task-123",
 *   targetType: "task",
 *   targetData: { ... }
 * });
 * 
 * @example
 * // Obtenir les résultats de vérification
 * const { verifications, loading } = useVerificationManager();
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  ID,
  VerificationType,
  VerificationStatus,
  VerificationResult,
  VerificationCheck,
  VerificationContext,
  VerifierDefinition,
} from "../../server/core/types";
import {
  VerificationManager,
  createVerificationManager,
  type VerifyOptions,
  type VerifyBatchOptions,
  type VerificationStrategy,
} from "../../server/verification/VerificationManager";
import { useEventBus } from "./useEventBus";

/**
 * Résultat du hook useVerificationManager
 */
export interface UseVerificationManagerResult {
  // État
  verifications: VerificationResult[];
  loading: boolean;
  error: string | null;
  
  // Méthodes principales
  verify: (options: VerifyOptions) => Promise<VerificationResult[]>;
  verifyBatch: (options: VerifyBatchOptions) => Promise<VerificationResult[]>;
  
  // Méthodes de récupération
  getVerification: (id: ID) => VerificationResult | undefined;
  getVerificationsByTarget: (targetId: ID) => VerificationResult[];
  getVerificationsByType: (type: VerificationType) => VerificationResult[];
  getVerificationsByStatus: (status: VerificationStatus) => VerificationResult[];
  getAllVerifications: () => VerificationResult[];
  
  // Méthodes de gestion des vérificateurs
  registerVerifier: (verifier: VerifierDefinition) => void;
  unregisterVerifier: (name: string) => boolean;
  getVerifier: (name: string) => VerifierDefinition | undefined;
  getAllVerifiers: () => VerifierDefinition[];
  
  // Méthodes de configuration
  setStrategy: (strategy: VerificationStrategy) => void;
  getStrategy: () => VerificationStrategy;
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  
  // Statistiques
  getStats: () => {
    total: number;
    passed: number;
    failed: number;
    byType: Record<VerificationType, number>;
    byStatus: Record<VerificationStatus, number>;
    byTargetType: Record<string, number>;
  };
  
  // Nettoyage
  clearVerifications: () => void;
  clearVerification: (id: ID) => boolean;
  
  // Abonnements aux événements
  onVerificationScheduled: (callback: (verification: VerificationResult) => void) => () => void;
  onVerificationStarted: (callback: (verification: VerificationResult) => void) => () => void;
  onVerificationPassed: (callback: (verification: VerificationResult) => void) => () => void;
  onVerificationFailed: (callback: (verification: VerificationResult) => void) => () => void;
  onVerificationError: (callback: (verification: VerificationResult) => void) => () => void;
}

/**
 * Hook React pour l'intégration avec VerificationManager
 * 
 * @param initialManager - Instance optionnelle de VerificationManager
 * @param autoSubscribe - Si vrai, s'abonne automatiquement aux événements EventBus
 * @returns Objet avec toutes les méthodes de VerificationManager
 */
export function useVerificationManager(
  initialManager?: VerificationManager,
  autoSubscribe: boolean = true
): UseVerificationManagerResult {
  const [manager] = useState<VerificationManager>(
    () => initialManager || createVerificationManager()
  );
  
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const { on } = useEventBus();
  
  // Synchroniser avec EventBus si autoSubscribe est activé
  useEffect(() => {
    if (autoSubscribe) {
      const unsubs: (() => void)[] = [];
      
      unsubs.push(on("verification:scheduled", (event: any) => {
        setVerifications(manager.getAllVerifications());
      }));
      
      unsubs.push(on("verification:started", (event: any) => {
        setVerifications(manager.getAllVerifications());
      }));
      
      unsubs.push(on("verification:passed", (event: any) => {
        setVerifications(manager.getAllVerifications());
      }));
      
      unsubs.push(on("verification:failed", (event: any) => {
        setVerifications(manager.getAllVerifications());
      }));
      
      unsubs.push(on("verification:error", (event: any) => {
        setVerifications(manager.getAllVerifications());
      }));
      
      unsubs.push(on("verification:skipped", (event: any) => {
        setVerifications(manager.getAllVerifications());
      }));
      
      // Chargement initial
      setVerifications(manager.getAllVerifications());
      
      return () => {
        unsubs.forEach(unsub => unsub());
      };
    }
  }, [manager, autoSubscribe, on]);

  // Méthode verify mémorisée
  const verify = useCallback(async (options: VerifyOptions) => {
    try {
      setLoading(true);
      setError(null);
      const results = await manager.verify(options);
      setVerifications(manager.getAllVerifications());
      return results;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setLoading(false);
    }
  }, [manager]);

  // Méthode verifyBatch mémorisée
  const verifyBatch = useCallback(async (options: VerifyBatchOptions) => {
    try {
      setLoading(true);
      setError(null);
      const results = await manager.verifyBatch(options);
      setVerifications(manager.getAllVerifications());
      return results;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setLoading(false);
    }
  }, [manager]);

  // Méthodes de récupération mémorisées
  const getVerification = useCallback((id: ID) => manager.get(id), [manager]);
  const getVerificationsByTarget = useCallback(
    (targetId: ID) => manager.getVerificationsByTarget(targetId),
    [manager]
  );
  const getVerificationsByType = useCallback(
    (type: VerificationType) => manager.getVerificationsByType(type),
    [manager]
  );
  const getVerificationsByStatus = useCallback(
    (status: VerificationStatus) => manager.getVerificationsByStatus(status),
    [manager]
  );
  const getAllVerifications = useCallback(
    () => manager.getAllVerifications(),
    [manager]
  );

  // Méthodes de gestion des vérificateurs mémorisées
  const registerVerifier = useCallback(
    (verifier: VerifierDefinition) => {
      manager.registerVerifier(verifier);
    },
    [manager]
  );
  const unregisterVerifier = useCallback(
    (name: string) => manager.unregisterVerifier(name),
    [manager]
  );
  const getVerifier = useCallback(
    (name: string) => manager.getVerifier(name),
    [manager]
  );
  const getAllVerifiers = useCallback(
    () => manager.getAllVerifiers(),
    [manager]
  );

  // Méthodes de configuration mémorisées
  const setStrategy = useCallback(
    (strategy: VerificationStrategy) => {
      manager.setStrategy(strategy);
    },
    [manager]
  );
  const getStrategy = useCallback(
    () => manager.getStrategy(),
    [manager]
  );
  const setEnabled = useCallback(
    (enabled: boolean) => {
      manager.setEnabled(enabled);
    },
    [manager]
  );
  const isEnabled = useCallback(
    () => manager.isEnabled(),
    [manager]
  );

  // Statistiques mémorisées
  const getStats = useCallback(() => {
    const all = manager.getAllVerifications();
    const byType: Record<VerificationType, number> = {
      pre_action: 0,
      post_action: 0,
      pre_commit: 0,
      post_commit: 0,
      safety_check: 0,
      quality_check: 0,
      constraint: 0,
      custom: 0,
    };
    const byStatus: Record<VerificationStatus, number> = {
      pending: 0,
      running: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      error: 0,
    };
    const byTargetType: Record<string, number> = {};
    
    let passed = 0;
    let failed = 0;
    
    all.forEach(v => {
      byType[v.type] = (byType[v.type] || 0) + 1;
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      byTargetType[v.targetType] = (byTargetType[v.targetType] || 0) + 1;
      
      if (v.status === "passed") passed++;
      if (v.status === "failed") failed++;
    });
    
    return {
      total: all.length,
      passed,
      failed,
      byType,
      byStatus,
      byTargetType,
    };
  }, [manager]);

  // Méthodes de nettoyage mémorisées
  const clearVerifications = useCallback(() => {
    manager.clearVerifications();
    setVerifications([]);
  }, [manager]);
  const clearVerification = useCallback(
    (id: ID) => {
      const result = manager.clearVerification(id);
      if (result) {
        setVerifications(manager.getAllVerifications());
      }
      return result;
    },
    [manager]
  );

  // Abonnements aux événements mémorisés
  const onVerificationScheduled = useCallback(
    (callback: (verification: VerificationResult) => void) => {
      return manager.onVerificationScheduled(callback);
    },
    [manager]
  );
  const onVerificationStarted = useCallback(
    (callback: (verification: VerificationResult) => void) => {
      return manager.onVerificationStarted(callback);
    },
    [manager]
  );
  const onVerificationPassed = useCallback(
    (callback: (verification: VerificationResult) => void) => {
      return manager.onVerificationPassed(callback);
    },
    [manager]
  );
  const onVerificationFailed = useCallback(
    (callback: (verification: VerificationResult) => void) => {
      return manager.onVerificationFailed(callback);
    },
    [manager]
  );
  const onVerificationError = useCallback(
    (callback: (verification: VerificationResult) => void) => {
      return manager.onVerificationError(callback);
    },
    [manager]
  );

  return {
    verifications,
    loading,
    error,
    verify,
    verifyBatch,
    getVerification,
    getVerificationsByTarget,
    getVerificationsByType,
    getVerificationsByStatus,
    getAllVerifications,
    registerVerifier,
    unregisterVerifier,
    getVerifier,
    getAllVerifiers,
    setStrategy,
    getStrategy,
    setEnabled,
    isEnabled,
    getStats,
    clearVerifications,
    clearVerification,
    onVerificationScheduled,
    onVerificationStarted,
    onVerificationPassed,
    onVerificationFailed,
    onVerificationError,
  };
}

/**
 * Hook spécialisé pour écouter les vérifications planifiées
 */
export function useVerificationScheduled(callback: (verification: VerificationResult) => void) {
  const { onVerificationScheduled } = useVerificationManager();
  
  useEffect(() => {
    const unsub = onVerificationScheduled(callback);
    return unsub;
  }, [onVerificationScheduled, callback]);
}

/**
 * Hook spécialisé pour écouter les vérifications démarrées
 */
export function useVerificationStarted(callback: (verification: VerificationResult) => void) {
  const { onVerificationStarted } = useVerificationManager();
  
  useEffect(() => {
    const unsub = onVerificationStarted(callback);
    return unsub;
  }, [onVerificationStarted, callback]);
}

/**
 * Hook spécialisé pour écouter les vérifications réussies
 */
export function useVerificationPassed(callback: (verification: VerificationResult) => void) {
  const { onVerificationPassed } = useVerificationManager();
  
  useEffect(() => {
    const unsub = onVerificationPassed(callback);
    return unsub;
  }, [onVerificationPassed, callback]);
}

/**
 * Hook spécialisé pour écouter les vérifications échouées
 */
export function useVerificationFailed(callback: (verification: VerificationResult) => void) {
  const { onVerificationFailed } = useVerificationManager();
  
  useEffect(() => {
    const unsub = onVerificationFailed(callback);
    return unsub;
  }, [onVerificationFailed, callback]);
}

/**
 * Hook pour obtenir les statistiques de vérification
 */
export function useVerificationStats() {
  const { getStats } = useVerificationManager();
  const [stats, setStats] = useState<ReturnType<typeof getStats>>(getStats());
  
  const refresh = useCallback(() => {
    setStats(getStats());
  }, [getStats]);
  
  return { stats, refresh };
}

export default useVerificationManager;

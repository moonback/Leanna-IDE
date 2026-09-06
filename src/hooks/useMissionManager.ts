/**
 * useMissionManager — Hook pour gérer les missions
 * 
 * Ce hook fournit une interface pour interagir avec le système de gestion des missions.
 * Il gère :
 * - La récupération des missions
 * - La création de nouvelles missions
 * - La mise à jour des missions existantes
 * - La suppression des missions
 * - La gestion des objectifs
 * - Le suivi de l'exécution
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { 
  Mission, 
  MissionStatus,
  MissionConfig,
  Goal,
  GoalStatus,
  GoalPriority
} from "../../server/mission/types";
import { useLiveAPI } from "./useLiveAPI";

/**
 * État du gestionnaire de missions
 */
interface MissionManagerState {
  missions: Mission[];
  selectedMission: Mission | null;
  loading: boolean;
  error: Error | null;
  stats: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    avgDuration: number;
    successRate: number;
  };
}

/**
 * Options pour la création d'une mission
 */
export interface CreateMissionOptions {
  title: string;
  description?: string;
  config?: Partial<MissionConfig>;
}

/**
 * Options pour la mise à jour d'une mission
 */
export interface UpdateMissionOptions {
  title?: string;
  description?: string;
  status?: MissionStatus;
  config?: Partial<MissionConfig>;
}

/**
 * Résultat du hook
 */
export interface UseMissionManagerResult {
  // État
  missions: Mission[];
  selectedMission: Mission | null;
  loading: boolean;
  error: Error | null;
  stats: MissionManagerState["stats"];
  
  // Actions
  createMission: (options: CreateMissionOptions) => Promise<Mission>;
  updateMission: (missionId: string, options: UpdateMissionOptions) => Promise<Mission>;
  deleteMission: (missionId: string) => Promise<void>;
  selectMission: (mission: Mission | null) => void;
  
  // Gestion des objectifs
  createGoal: (missionId: string, goal: Partial<Goal>) => Promise<Goal>;
  updateGoal: (missionId: string, goalId: string, updates: Partial<Goal>) => Promise<Goal>;
  deleteGoal: (missionId: string, goalId: string) => Promise<void>;
  
  // Gestion de l'exécution
  startMission: (missionId: string) => Promise<void>;
  pauseMission: (missionId: string) => Promise<void>;
  resumeMission: (missionId: string) => Promise<void>;
  cancelMission: (missionId: string) => Promise<void>;
  
  // Rafraîchissement
  refresh: () => Promise<void>;
  
  // Abonnements aux événements
  subscribe: (callback: (missions: Mission[]) => void) => () => void;
}

/**
 * Hook pour gérer les missions
 */
export function useMissionManager(): UseMissionManagerResult {
  const [state, setState] = useState<MissionManagerState>({
    missions: [],
    selectedMission: null,
    loading: true,
    error: null,
    stats: {
      total: 0,
      active: 0,
      completed: 0,
      failed: 0,
      avgDuration: 0,
      successRate: 0,
    },
  });

  const liveAPI = useLiveAPI();
  const subscribers = useRef<Set<(missions: Mission[]) => void>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Charger les missions
  const loadMissions = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Créer un nouveau contrôleur d'annulation
      abortControllerRef.current = new AbortController();
      
      // TODO: Remplacer par l'appel API réel quand le backend sera disponible
      // const response = await fetch('/api/missions', {
      //   signal: abortControllerRef.current.signal,
      // });
      // const data = await response.json();
      
      // Pour l'instant, on utilise des données vides
      const missions: Mission[] = [];
      
      setState(prev => ({
        ...prev,
        missions: missions,
        loading: false,
      }));
      
      // Notifier les abonnés
      subscribers.current.forEach(callback => callback(missions));
      
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error,
        }));
      }
    }
  }, []);

  // Calculer les statistiques
  const calculateStats = useCallback((missions: Mission[]) => {
    const total = missions.length;
    const active = missions.filter(m => m.status === "in_progress" || m.status === "pending").length;
    const completed = missions.filter(m => m.status === "completed").length;
    const failed = missions.filter(m => m.status === "failed").length;
    
    const avgDuration = missions.reduce((sum, m) => {
      if (m.completedAt) {
        return sum + (new Date(m.completedAt).getTime() - new Date(m.createdAt).getTime());
      }
      return sum;
    }, 0) / (completed || 1);
    
    return {
      total,
      active,
      completed,
      failed,
      avgDuration: completed > 0 ? avgDuration : 0,
      successRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }, []);

  // Mettre à jour les statistiques quand les missions changent
  useEffect(() => {
    setState(prev => ({
      ...prev,
      stats: calculateStats(state.missions),
    }));
  }, [state.missions, calculateStats]);

  // Charger les missions au montage
  useEffect(() => {
    loadMissions();
    
    return () => {
      // Annuler la requête en cours
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadMissions]);

  // Créer une nouvelle mission
  const createMission = useCallback(async (options: CreateMissionOptions): Promise<Mission> => {
    try {
      // TODO: Remplacer par l'appel API réel
      // const response = await fetch('/api/missions', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(options),
      // });
      // const newMission = await response.json();
      
      const newMission: Mission = {
        id: Date.now().toString(),
        title: options.title,
        description: options.description || "",
        status: "pending",
        goals: [],
        createdAt: new Date().toISOString(),
        config: {
          maxAttempts: 3,
          enableReflection: true,
          ...options.config,
        },
        progress: 0,
      };
      
      setState(prev => ({
        ...prev,
        missions: [newMission, ...prev.missions],
      }));
      
      return newMission;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, []);

  // Mettre à jour une mission
  const updateMission = useCallback(async (
    missionId: string,
    options: UpdateMissionOptions
  ): Promise<Mission> => {
    try {
      // TODO: Remplacer par l'appel API réel
      // const response = await fetch(`/api/missions/${missionId}`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(options),
      // });
      // const updatedMission = await response.json();
      
      setState(prev => ({
        ...prev,
        missions: prev.missions.map(mission =>
          mission.id === missionId ? { ...mission, ...options } : mission
        ),
        selectedMission: 
          prev.selectedMission?.id === missionId 
            ? { ...prev.selectedMission, ...options } 
            : prev.selectedMission,
      }));
      
      return state.missions.find(m => m.id === missionId)!;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, []);

  // Supprimer une mission
  const deleteMission = useCallback(async (missionId: string): Promise<void> => {
    try {
      // TODO: Remplacer par l'appel API réel
      // await fetch(`/api/missions/${missionId}`, {
      //   method: 'DELETE',
      // });
      
      setState(prev => ({
        ...prev,
        missions: prev.missions.filter(mission => mission.id !== missionId),
        selectedMission: 
          prev.selectedMission?.id === missionId ? null : prev.selectedMission,
      }));
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, []);

  // Sélectionner une mission
  const selectMission = useCallback((mission: Mission | null) => {
    setState(prev => ({ ...prev, selectedMission: mission }));
  }, []);

  // Créer un objectif
  const createGoal = useCallback(async (
    missionId: string,
    goalData: Partial<Goal>
  ): Promise<Goal> => {
    try {
      // TODO: Remplacer par l'appel API réel
      const newGoal: Goal = {
        id: `${missionId}-${Date.now()}`,
        parentId: goalData.parentId || null,
        title: goalData.title || "Nouvel objectif",
        description: goalData.description || "",
        successCriteria: goalData.successCriteria || [],
        priority: goalData.priority || "medium",
        status: goalData.status || "pending",
        plannedActions: goalData.plannedActions || [],
        attempts: 0,
        maxAttempts: goalData.maxAttempts || 3,
        createdAt: new Date().toISOString(),
        progress: 0,
      };
      
      setState(prev => ({
        ...prev,
        missions: prev.missions.map(mission =>
          mission.id === missionId 
            ? { ...mission, goals: [...(mission.goals || []), newGoal] } 
            : mission
        ),
      }));
      
      return newGoal;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, []);

  // Mettre à jour un objectif
  const updateGoal = useCallback(async (
    missionId: string,
    goalId: string,
    updates: Partial<Goal>
  ): Promise<Goal> => {
    try {
      setState(prev => ({
        ...prev,
        missions: prev.missions.map(mission =>
          mission.id === missionId
            ? {
                ...mission,
                goals: mission.goals?.map(goal =>
                  goal.id === goalId ? { ...goal, ...updates } : goal
                ) || [],
              }
            : mission
        ),
      }));
      
      return state.missions
        .find(m => m.id === missionId)
        ?.goals?.find(g => g.id === goalId)!;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, []);

  // Supprimer un objectif
  const deleteGoal = useCallback(async (
    missionId: string,
    goalId: string
  ): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        missions: prev.missions.map(mission =>
          mission.id === missionId
            ? {
                ...mission,
                goals: mission.goals?.filter(goal => goal.id !== goalId) || [],
              }
            : mission
        ),
      }));
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, []);

  // Démarrer une mission
  const startMission = useCallback(async (missionId: string): Promise<void> => {
    try {
      await updateMission(missionId, { status: "in_progress" });
      
      // Envoyer un message via WebSocket si connecté
      if (liveAPI.connected) {
        liveAPI.sendTextMessage(`[mission:start] Démarrage de la mission: ${missionId}`);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, [updateMission, liveAPI]);

  // Mettre en pause une mission
  const pauseMission = useCallback(async (missionId: string): Promise<void> => {
    try {
      await updateMission(missionId, { status: "pending" });
      
      if (liveAPI.connected) {
        liveAPI.sendTextMessage(`[mission:pause] Pause de la mission: ${missionId}`);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, [updateMission, liveAPI]);

  // Reprendre une mission
  const resumeMission = useCallback(async (missionId: string): Promise<void> => {
    try {
      await updateMission(missionId, { status: "in_progress" });
      
      if (liveAPI.connected) {
        liveAPI.sendTextMessage(`[mission:resume] Reprise de la mission: ${missionId}`);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, [updateMission, liveAPI]);

  // Annuler une mission
  const cancelMission = useCallback(async (missionId: string): Promise<void> => {
    try {
      await updateMission(missionId, { status: "cancelled" });
      
      if (liveAPI.connected) {
        liveAPI.sendTextMessage(`[mission:cancel] Annulation de la mission: ${missionId}`);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, error: errorObj }));
      throw error;
    }
  }, [updateMission, liveAPI]);

  // Rafraîchir les données
  const refresh = useCallback(async () => {
    await loadMissions();
  }, [loadMissions]);

  // S'abonner aux changements
  const subscribe = useCallback((callback: (missions: Mission[]) => void) => {
    subscribers.current.add(callback);
    
    // Retourner la fonction de désabonnement
    return () => {
      subscribers.current.delete(callback);
    };
  }, []);

  return {
    missions: state.missions,
    selectedMission: state.selectedMission,
    loading: state.loading,
    error: state.error,
    stats: state.stats,
    
    createMission,
    updateMission,
    deleteMission,
    selectMission,
    
    createGoal,
    updateGoal,
    deleteGoal,
    
    startMission,
    pauseMission,
    resumeMission,
    cancelMission,
    
    refresh,
    subscribe,
  };
}

export default useMissionManager;

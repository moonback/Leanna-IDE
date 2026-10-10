/**
 * RoleReliability — Fiabilité (« note ») par rôle d'agent
 *
 * Alimente la `confidence` des bids du contract-net avec un signal réel et
 * durable : le taux de succès RÉCENT de chaque rôle, tiré de `StrategyMemory`
 * (clés `agent_role:<rôle>`). Remplace le `0.5` en dur de l'agent et le
 * `successRate` global du bus, qui ne distinguait pas les rôles.
 *
 * Aucun nouveau store : on réutilise `StrategyMemory` (persistance atomique,
 * élagage LRU, mode éphémère pour les tests). Tout accès est best-effort : une
 * erreur d'E/S ou un store corrompu retombe sur la valeur neutre et ne bloque
 * jamais une enchère.
 */
import { strategyMemory, type StrategyMemory } from "../knowledge/StrategyMemory.js";
import { getContractNetConfig } from "./contractNetConfig.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("RoleReliability");

/** Préfixe des clés de rôle dans StrategyMemory (distinct des skills/outils). */
export const ROLE_KEY_PREFIX = "agent_role:";

/** Confiance neutre : pas assez de preuves pour juger le rôle. */
export const NEUTRAL_CONFIDENCE = 0.5;
const MIN_CONFIDENCE = 0.05;
const MAX_CONFIDENCE = 0.95;

export interface RoleRating {
  role: string;
  /** Confiance utilisée dans les bids (0.05..0.95, 0.5 si preuves insuffisantes). */
  confidence: number;
  /** Nombre total de tâches enregistrées pour ce rôle. */
  totalCalls: number;
  /** Taux de succès sur la fenêtre récente (null si aucune donnée). */
  recentSuccessRate: number | null;
  /** True si `totalCalls` atteint le seuil de preuve (la note n'est plus neutre). */
  reliable: boolean;
}

export class RoleReliability {
  constructor(
    private readonly memory: StrategyMemory = strategyMemory,
    private readonly minEvidence: () => number = () => getContractNetConfig().minEvidence
  ) {}

  /** Enregistre l'issue d'une tâche exécutée par ce rôle. Best-effort. */
  record(role: string, success: boolean, durationMs: number): void {
    if (!role) return;
    try {
      this.memory.recordSkillOutcome(ROLE_KEY_PREFIX + role, success, durationMs);
    } catch (err) {
      log.warn(`Enregistrement de la note de [${role}] impossible: ${(err as Error).message}`);
    }
  }

  /** Note détaillée d'un rôle. */
  getRating(role: string): RoleRating {
    try {
      const stats = this.memory.getSkillStats(ROLE_KEY_PREFIX + role);
      if (!stats) {
        return { role, confidence: NEUTRAL_CONFIDENCE, totalCalls: 0, recentSuccessRate: null, reliable: false };
      }

      const reliable = stats.totalCalls >= this.minEvidence();
      if (!reliable) {
        return {
          role,
          confidence: NEUTRAL_CONFIDENCE,
          totalCalls: stats.totalCalls,
          recentSuccessRate: stats.recentSuccessRate,
          reliable: false,
        };
      }

      // Lissage de Laplace sur la fenêtre récente (≤ 10 issues) : un rôle à 1/1
      // ne passe pas à 1.0, un rôle à 0/3 ne tombe pas à 0.0.
      const n = Math.min(stats.totalCalls, 10);
      const smoothed = (stats.recentSuccessRate * n + 1) / (n + 2);
      return {
        role,
        confidence: Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, smoothed)),
        totalCalls: stats.totalCalls,
        recentSuccessRate: stats.recentSuccessRate,
        reliable: true,
      };
    } catch (err) {
      log.warn(`Lecture de la note de [${role}] impossible: ${(err as Error).message}`);
      return { role, confidence: NEUTRAL_CONFIDENCE, totalCalls: 0, recentSuccessRate: null, reliable: false };
    }
  }

  /** Confiance (0..1) d'un rôle pour le scoring des bids. */
  getConfidence(role: string): number {
    return this.getRating(role).confidence;
  }

  /** Notes de tous les rôles connus (observabilité). */
  listRatings(): RoleRating[] {
    try {
      return this.memory
        .getAllStats()
        .filter((s) => s.skillName.startsWith(ROLE_KEY_PREFIX))
        .map((s) => this.getRating(s.skillName.slice(ROLE_KEY_PREFIX.length)));
    } catch (err) {
      log.warn(`Liste des notes impossible: ${(err as Error).message}`);
      return [];
    }
  }
}

/** Singleton partagé, adossé au `strategyMemory` durable. */
export const roleReliability = new RoleReliability();

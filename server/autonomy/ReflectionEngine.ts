/**
 * ReflectionEngine — Post-mission : réflexion, apprentissage, mise à jour mémoire
 *
 * Appelé après chaque mission terminée (succès ou échec).
 * Responsabilités :
 *   1. Extraire les leçons via LearningEngine
 *   2. Mettre à jour la ProjectMemory avec les résultats
 *   3. Réévaluer l'objectif parent (GoalEvaluator)
 *   4. Mettre à jour le statut de l'objectif si satisfait
 *   5. Émettre un résumé de réflexion loggé et broadcasté
 */

import { createLogger } from "../utils/logger.js";
import { LearningEngine } from "../knowledge/LearningEngine.js";
import { projectMemory } from "../knowledge/ProjectMemory.js";
import { goalManager } from "./GoalManager.js";
import { goalEvaluator } from "./GoalEvaluator.js";
import type { Mission } from "./types.js";

const log = createLogger("ReflectionEngine");

// ─── Configuration ────────────────────────────────────────────────────────────

/** Durée maximale d'une réflexion complète (ms) */
const REFLECTION_TIMEOUT_MS = 60_000;

// ═══════════════════════════════════════════════════════════════════════════════
// REFLECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReflectionResult {
  missionId: string;
  goalId: string;
  success: boolean;
  lessonsLearned: string[];
  goalSatisfied: boolean;
  goalScore: number;
  summary: string;
  reflectedAt: string;
}

export type ReflectionBroadcaster = (event: object) => void;

export class ReflectionEngine {
  private learningEngine = new LearningEngine();
  private broadcaster: ReflectionBroadcaster | null = null;

  // ─── Configuration ────────────────────────────────────────────────────────

  setBroadcaster(broadcaster: ReflectionBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  // ─── Point d'entrée principal ─────────────────────────────────────────────

  /**
   * Réfléchit sur une mission terminée.
   * Appelé par MissionManager.onCompletion().
   */
  async reflect(mission: Mission): Promise<ReflectionResult> {
    log.info(`🪞 Réflexion sur mission "${mission.title}" [${mission.status}]…`);

    const start = Date.now();
    const reflectedAt = new Date().toISOString();

    try {
      return await withTimeout(
        this._doReflect(mission, reflectedAt),
        REFLECTION_TIMEOUT_MS
      );
    } catch (err) {
      log.error(`Réflexion "${mission.title}" timeout ou erreur: ${(err as Error).message}`);

      return {
        missionId: mission.id,
        goalId: mission.goalId,
        success: false,
        lessonsLearned: [],
        goalSatisfied: false,
        goalScore: 0,
        summary: `Réflexion interrompue: ${(err as Error).message}`,
        reflectedAt,
      };
    } finally {
      log.debug(`Réflexion terminée en ${Date.now() - start}ms`);
    }
  }

  // ─── Logique interne ──────────────────────────────────────────────────────

  private async _doReflect(mission: Mission, reflectedAt: string): Promise<ReflectionResult> {
    const result = mission.result;

    // ── 1. LearningEngine — extraire les leçons ────────────────────────────
    const lessons = this._extractLessons(mission);

    try {
      this.learningEngine.learnFromMission({
        missionId: mission.id,
        missionTitle: mission.title,
        overallSuccess: result?.success ?? false,
        summary: result?.summary,
        touchedFiles: result?.filesModified ?? mission.files,
        actions: this._buildActions(mission),
        errors: result?.error
          ? [{ message: result.error, action: "mission_execution" }]
          : [],
        decisions: [],
        explicitLessons: lessons,
      });

      log.debug(`LearningEngine: leçons extraites pour "${mission.title}"`);
    } catch (err) {
      log.warn(`LearningEngine erreur: ${(err as Error).message}`);
    }

    // ── 2. ProjectMemory — persister le résultat ────────────────────────────
    try {
      this._persistToMemory(mission, lessons);
    } catch (err) {
      log.warn(`ProjectMemory erreur: ${(err as Error).message}`);
    }

    // ── 3. GoalEvaluator — réévaluer l'objectif ────────────────────────────
    let goalSatisfied = false;
    let goalScore = 0;

    const goal = goalManager.get(mission.goalId);
    if (goal) {
      try {
        const evaluation = await goalEvaluator.evaluate(goal);
        goalSatisfied = evaluation.satisfied;
        goalScore = evaluation.score;

        // Mettre à jour la date d'évaluation
        goalManager.touchEvaluatedAt(goal.id);
        goalManager.save();

        // Si l'objectif est "once" et satisfait → le compléter
        if (goal.cadence === "once" && goalSatisfied) {
          goalManager.setStatus(goal.id, "completed");
          log.info(`🎯 Objectif "${goal.title}" complété — marqué comme terminé`);
        }

        log.debug(
          `GoalEvaluator: "${goal.title}" → ${goalSatisfied ? "✅ satisfait" : "⚠️ non satisfait"} ` +
            `(score: ${(goalScore * 100).toFixed(0)}%)`
        );
      } catch (err) {
        log.warn(`GoalEvaluator erreur: ${(err as Error).message}`);
      }
    }

    // ── 4. Mettre à jour la mission avec les leçons apprises ──────────────
    mission.lessonsLearned = lessons;

    // ── 5. Construire le résumé de réflexion ─────────────────────────────
    const summary = this._buildSummary(mission, lessons, goalSatisfied, goalScore);
    log.info(`🪞 ${summary}`);

    // ── 6. Broadcaster le résultat ────────────────────────────────────────
    const reflectionResult: ReflectionResult = {
      missionId: mission.id,
      goalId: mission.goalId,
      success: result?.success ?? false,
      lessonsLearned: lessons,
      goalSatisfied,
      goalScore,
      summary,
      reflectedAt,
    };

    this._broadcast(reflectionResult);

    return reflectionResult;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _extractLessons(mission: Mission): string[] {
    const lessons: string[] = [];
    const result = mission.result;

    if (!result) return lessons;

    if (result.success) {
      lessons.push(`Mission "${mission.title}" réussie en ${Math.round((mission.durationMs ?? 0) / 1000)}s.`);
      if (result.filesModified && result.filesModified.length > 0) {
        lessons.push(`${result.filesModified.length} fichier(s) modifié(s): ${result.filesModified.slice(0, 3).join(", ")}.`);
      }
    } else {
      lessons.push(`Mission "${mission.title}" échouée.`);
      if (result.error) {
        lessons.push(`Cause: ${result.error.slice(0, 200)}`);
      }
    }

    if (result.suggestions && result.suggestions.length > 0) {
      lessons.push(...result.suggestions.slice(0, 3));
    }

    return lessons;
  }

  private _buildActions(mission: Mission): Array<{
    actionId: string;
    actionName: string;
    success: boolean;
    durationMs?: number;
    errorMessage?: string;
    files?: string[];
  }> {
    return [
      {
        actionId: mission.id,
        actionName: `mission:${mission.title}`,
        success: mission.result?.success ?? false,
        durationMs: mission.durationMs,
        errorMessage: mission.result?.error,
        files: mission.files,
      },
    ];
  }

  private _persistToMemory(mission: Mission, lessons: string[]): void {
    if (!mission.result?.success) return;

    // Sauvegarder le résultat de la mission en mémoire projet
    const content = [
      `Mission "${mission.title}" réussie.`,
      ...lessons.slice(0, 2),
    ].join(" ");

    projectMemory.addFact({
      type: "episodic",
      category: "architecture",
      content,
      importance: 2,
      source: "autonomous_core",
      tags: ["mission", "autonomous", mission.goalId],
    });
  }

  private _buildSummary(
    mission: Mission,
    lessons: string[],
    goalSatisfied: boolean,
    goalScore: number
  ): string {
    const status = mission.status === "completed" ? "✅ réussie" : "❌ échouée";
    const duration = mission.durationMs
      ? ` en ${(mission.durationMs / 1000).toFixed(1)}s`
      : "";
    const goalLine = goalSatisfied
      ? `Objectif satisfait (${(goalScore * 100).toFixed(0)}%).`
      : `Objectif non encore satisfait (${(goalScore * 100).toFixed(0)}%).`;

    return `Mission "${mission.title}" ${status}${duration}. ${goalLine} ${lessons.length} leçon(s) apprises.`;
  }

  private _broadcast(reflection: ReflectionResult): void {
    if (!this.broadcaster) return;
    try {
      this.broadcaster({
        type: "autonomous_core_event",
        event: "reflection_completed",
        ...reflection,
      });
    } catch {
      // Non bloquant
    }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Reflection timeout après ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du ReflectionEngine. */
export const reflectionEngine = new ReflectionEngine();

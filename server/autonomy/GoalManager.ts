/**
 * GoalManager — Gestion des objectifs persistants de Leanna
 *
 * Stocke les objectifs sur disque (JSON) avec persistance Supabase optionnelle.
 * Gère la file de priorité, les cadences et l'état de chaque objectif.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import type {
  Goal,
  GoalCreateInput,
  GoalStatus,
  GoalPriority,
  GoalCadence,
} from "./types.js";

const log = createLogger("GoalManager");

// ─── Configuration ────────────────────────────────────────────────────────────

const GOALS_FILENAME = ".leanna-goals.json";

function getGoalsPath(): string {
  return path.join(SELF_ROOT, ".Leanna", GOALS_FILENAME);
}

// Poids de priorité pour le tri
const PRIORITY_WEIGHTS: Record<GoalPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// GOAL MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export class GoalManager {
  private goals: Map<string, Goal> = new Map();
  private loaded = false;

  // ─── Initialisation ────────────────────────────────────────────────────────

  /**
   * Charge les objectifs depuis le disque.
   * Appel idempotent — ne recharge pas si déjà chargé sauf si force=true.
   */
  load(force = false): void {
    if (this.loaded && !force) return;

    const goalsPath = getGoalsPath();

    if (!fs.existsSync(goalsPath)) {
      log.debug(`Aucun fichier d'objectifs trouvé (${goalsPath}) — démarrage vierge`);
      this.loaded = true;
      return;
    }

    try {
      const raw = fs.readFileSync(goalsPath, "utf-8");
      const data = JSON.parse(raw) as Goal[];
      this.goals.clear();
      for (const goal of data) {
        this.goals.set(goal.id, goal);
      }
      log.info(`✅ ${this.goals.size} objectif(s) chargé(s) depuis ${goalsPath}`);
    } catch (err) {
      log.error(`Impossible de lire les objectifs: ${(err as Error).message}`);
    }

    this.loaded = true;
  }

  /**
   * Persiste les objectifs sur disque.
   */
  save(): void {
    const goalsPath = getGoalsPath();

    try {
      const dir = path.dirname(goalsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = Array.from(this.goals.values());
      fs.writeFileSync(goalsPath, JSON.stringify(data, null, 2), "utf-8");
      log.debug(`💾 ${data.length} objectif(s) sauvegardé(s)`);
    } catch (err) {
      log.error(`Impossible de sauvegarder les objectifs: ${(err as Error).message}`);
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  /**
   * Crée un nouvel objectif.
   */
  create(input: GoalCreateInput): Goal {
    this.load();

    const now = new Date().toISOString();
    const goal: Goal = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      priority: input.priority ?? "medium",
      status: "active",
      cadence: input.cadence ?? "continuous",
      schedule: input.schedule,
      constraints: {
        noBreakingChanges: true,
        requireTests: true,
        requireTypeCheck: true,
        maxAutonomyLevel: 6,
        maxConcurrentMissions: 2,
        ...input.constraints,
      },
      checks: input.checks ?? [],
      successCriteria: input.successCriteria ?? [],
      tags: input.tags ?? [],
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.goals.set(goal.id, goal);
    this.save();

    log.info(`🎯 Objectif créé: "${goal.title}" [${goal.priority}] [${goal.cadence}]`);
    return goal;
  }

  /**
   * Récupère un objectif par son ID.
   */
  get(id: string): Goal | undefined {
    this.load();
    return this.goals.get(id);
  }

  /**
   * Met à jour un objectif existant.
   */
  update(id: string, updates: Partial<Omit<Goal, "id" | "createdAt">>): Goal | null {
    this.load();

    const goal = this.goals.get(id);
    if (!goal) {
      log.warn(`update: objectif "${id}" introuvable`);
      return null;
    }

    const updated: Goal = {
      ...goal,
      ...updates,
      id: goal.id,
      createdAt: goal.createdAt,
      updatedAt: new Date().toISOString(),
    };

    this.goals.set(id, updated);
    this.save();
    return updated;
  }

  /**
   * Change le statut d'un objectif.
   */
  setStatus(id: string, status: GoalStatus): boolean {
    const updates: Partial<Goal> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (status === "completed") {
      updates.completedAt = new Date().toISOString();
    }
    const result = this.update(id, updates);
    if (result) {
      log.info(`🎯 Objectif "${result.title}" → statut: ${status}`);
    }
    return result !== null;
  }

  /**
   * Marque la date de la dernière évaluation.
   */
  touchEvaluatedAt(id: string): void {
    const goal = this.goals.get(id);
    if (!goal) return;
    goal.lastEvaluatedAt = new Date().toISOString();
    goal.updatedAt = goal.lastEvaluatedAt;
    // Pas de save() à chaque touch — batché via save() depuis le caller
  }

  /**
   * Marque la date du dernier déclenchement de mission.
   */
  touchMissionAt(id: string): void {
    const goal = this.goals.get(id);
    if (!goal) return;
    goal.lastMissionAt = new Date().toISOString();
    goal.updatedAt = goal.lastMissionAt;
  }

  /**
   * Supprime un objectif.
   */
  delete(id: string): boolean {
    this.load();
    const existed = this.goals.delete(id);
    if (existed) {
      this.save();
      log.info(`🗑️ Objectif "${id}" supprimé`);
    }
    return existed;
  }

  // ─── Requêtes ────────────────────────────────────────────────────────────

  /**
   * Retourne tous les objectifs, triés par priorité décroissante.
   */
  list(filters?: {
    status?: GoalStatus | GoalStatus[];
    cadence?: GoalCadence;
    tag?: string;
  }): Goal[] {
    this.load();

    let results = Array.from(this.goals.values());

    if (filters?.status) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      results = results.filter((g) => statuses.includes(g.status));
    }

    if (filters?.cadence) {
      results = results.filter((g) => g.cadence === filters.cadence);
    }

    if (filters?.tag) {
      results = results.filter((g) => g.tags.includes(filters.tag!));
    }

    // Tri : priorité décroissante, puis date de création
    return results.sort((a, b) => {
      const diff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  /**
   * Retourne les objectifs actifs par ordre de priorité.
   */
  getActiveGoals(): Goal[] {
    return this.list({ status: "active" });
  }

  /**
   * Retourne les objectifs qui doivent être déclenchés maintenant.
   * Prend en compte la cadence et la dernière exécution.
   */
  getDueGoals(): Goal[] {
    const active = this.getActiveGoals();
    const now = Date.now();

    return active.filter((goal) => {
      switch (goal.cadence) {
        case "continuous":
          // Toujours dû — le décideur filtrera selon le contexte
          return true;

        case "once":
          // Dû une seule fois (jamais déclenché)
          return !goal.lastMissionAt;

        case "on_change":
          // Géré par la PerceptionLoop — toujours éligible
          return true;

        case "scheduled": {
          if (!goal.schedule) return false;
          // Interpréter schedule comme un délai en ms ou un cron simplifié
          const delayMs = this._parseScheduleDelayMs(goal.schedule);
          if (delayMs === null) return false;
          const lastRun = goal.lastMissionAt
            ? new Date(goal.lastMissionAt).getTime()
            : 0;
          return now - lastRun >= delayMs;
        }

        default:
          return false;
      }
    });
  }

  get size(): number {
    this.load();
    return this.goals.size;
  }

  // ─── Préconfigurations ───────────────────────────────────────────────────

  /**
   * Crée l'objectif "maintain-project" par défaut s'il n'existe pas déjà.
   */
  ensureDefaultGoals(): void {
    this.load();

    const existing = Array.from(this.goals.values()).find(
      (g) => g.tags.includes("default") && g.status === "active"
    );

    if (existing) return;

    this.create({
      title: "Maintenir le projet en bon état",
      description:
        "Leanna surveille en continu la qualité du projet : TypeScript, tests, sécurité, dépendances et architecture.",
      priority: "medium",
      cadence: "continuous",
      constraints: {
        noBreakingChanges: true,
        requireTests: true,
        requireTypeCheck: true,
        maxAutonomyLevel: 5,
        maxConcurrentMissions: 1,
      },
      checks: [
        { type: "typescript", label: "TypeScript valide" },
        { type: "tests", label: "Tests passent" },
        { type: "security", label: "Aucune vulnérabilité critique" },
        { type: "dependencies", label: "Dépendances à jour" },
        { type: "git_status", label: "Pas de fichiers oubliés" },
      ],
      successCriteria: [
        "Aucune erreur TypeScript",
        "Tests passent sans régression",
        "Aucune vulnérabilité de sécurité critique",
      ],
      tags: ["default", "maintenance"],
    });

    log.info("🎯 Objectif par défaut 'maintain-project' créé");
  }

  // ─── Interne ──────────────────────────────────────────────────────────────

  /**
   * Parse une expression de schedule en délai ms.
   * Formats supportés :
   *   "5m" / "30m" / "1h" / "6h" / "24h" / "7d"
   *   Nombre brut (ms)
   */
  private _parseScheduleDelayMs(schedule: string): number | null {
    const trimmed = schedule.trim();

    // Nombre brut
    const rawMs = Number(trimmed);
    if (!isNaN(rawMs) && rawMs > 0) return rawMs;

    // Expression lisible
    const match = trimmed.match(/^(\d+(?:\.\d+)?)(m|h|d)$/i);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case "m": return value * 60 * 1000;
      case "h": return value * 60 * 60 * 1000;
      case "d": return value * 24 * 60 * 60 * 1000;
      default: return null;
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du GoalManager. */
export const goalManager = new GoalManager();

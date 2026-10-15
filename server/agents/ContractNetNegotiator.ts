/**
 * ContractNetNegotiator — Négociation de tâches par appel d'offres (contract-net)
 *
 * Ajoute un protocole de négociation asynchrone PAR-DESSUS `AgentMessageBus`,
 * sans remplacer le chemin de délégation « push » existant (DelegationDispatcher
 * / DelegationManager) ni modifier `AgentCommunication.ts`.
 *
 * Modèle (contract-net protocol) :
 *   1. ANNONCE   : l'initiateur diffuse un appel d'offres (call_for_proposals)
 *                  décrivant la sous-tâche + les capacités requises.
 *   2. BIDS      : chaque agent candidat répond avec une offre scorée
 *                  (skillMatch, confidence, loadPenalty).
 *   3. ATTRIBUTION : à la fermeture de la fenêtre d'enchères, le meilleur bid
 *                  éligible remporte le marché ; un `task_request` ciblé est
 *                  publié sur le bus (réutilise le pipeline d'exécution existant).
 *
 * Le gagnant est l'agent avec la MEILLEURE correspondance de compétences.
 * Un bid dont `skillMatch === 0` est disqualifié : un agent sans aucune des
 * capacités requises ne peut pas remporter le marché.
 */
import { randomUUID } from "crypto";
import type { AgentRole } from "./types.js";
import { STATIC_AGENT_ROLES } from "./types.js";
import type { AgentMessage, TaskRequestPayload } from "./AgentCommunication.js";
import { AgentMessageBus, agentMessageBus } from "./AgentMessageBus.js";
import { getAgentDefinition } from "./roles.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("ContractNetNegotiator");

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Description de la tâche mise aux enchères. */
export interface NegotiationTask {
  taskId: string;
  title: string;
  description: string;
  /** Capacités requises pour exécuter la tâche (matchées contre `capabilities`). */
  requiredCapabilities: string[];
  files?: string[];
  instructions?: string;
  priority?: "low" | "medium" | "high" | "critical";
  /** Critères de succès vérifiables — passés à l'agent gagnant. */
  successCriteria?: string[];
  /** Contexte additionnel (métadonnées libres, parentId, etc.). */
  context?: Record<string, unknown>;
  /** Résumé des étapes précédentes (chaînage). */
  previousResults?: Array<{
    summary: string;
    filesModified?: string[];
    success: boolean;
  }>;
}

/** Offre soumise par un agent candidat. */
export interface Bid {
  /** Rôle de l'agent qui propose ses services. */
  role: AgentRole;
  /** Part des capacités requises couvertes par l'agent (0..1). */
  skillMatch: number;
  /** Confiance de l'agent / fiabilité historique (0..1). */
  confidence: number;
  /** Pénalité de charge actuelle (0..1, plus haut = plus chargé). */
  loadPenalty: number;
  /** Métadonnées libres optionnelles. */
  metadata?: Record<string, unknown>;
}

/** Bid enrichi d'un score calculé par le négociateur. */
export interface ScoredBid extends Bid {
  score: number;
  eligible: boolean;
  /**
   * Spécificité (0..1) : part des capacités de l'agent effectivement dédiées
   * aux capacités requises = couvertes_requises / total_capacités_agent.
   * Un spécialiste focalisé (ratio élevé) l'emporte sur un généraliste (ratio
   * faible) à score égal — c'est le premier critère de départage.
   */
  specificity: number;
}

/** Résultat d'une négociation. */
export interface NegotiationOutcome {
  taskId: string;
  /** Rôle gagnant, ou null si aucune offre éligible. */
  winner: AgentRole | null;
  winningScore: number | null;
  /** Tous les bids reçus, scorés et triés (meilleur en premier). */
  bids: ScoredBid[];
  /** True si un task_request a été publié vers le gagnant. */
  awarded: boolean;
}

/** Pondérations du score. */
export interface ScoringWeights {
  skill: number;
  confidence: number;
  load: number;
}

export interface NegotiatorOptions {
  /** Durée de la fenêtre d'enchères en ms (défaut 500). */
  biddingWindowMs?: number;
  /** Pondérations du score. */
  weights?: Partial<ScoringWeights>;
  /** Initiateur par défaut des appels d'offres. */
  initiator?: AgentRole;
}

const DEFAULT_WEIGHTS: ScoringWeights = { skill: 0.6, confidence: 0.25, load: 0.15 };

/**
 * Initiateur neutre par défaut des appels d'offres.
 *
 * Ce n'est PAS un rôle d'agent enregistré : aucun agent n'y est abonné, donc
 * le bus ne l'exclut d'aucun broadcast. Conséquence : TOUS les agents (y compris
 * `architect`) reçoivent l'appel d'offres et peuvent concourir, sans biais lié
 * à l'identité de l'émetteur.
 */
export const NEGOTIATION_INITIATOR = "orchestrator" as AgentRole;

// ═══════════════════════════════════════════════════════════════════════════════
// ContractNetNegotiator
// ═══════════════════════════════════════════════════════════════════════════════

export class ContractNetNegotiator {
  private readonly bus: AgentMessageBus;
  private readonly biddingWindowMs: number;
  private readonly weights: ScoringWeights;
  private readonly initiator: AgentRole;

  /** Enchères ouvertes : taskId → bids reçus. */
  private openCalls: Map<string, Bid[]> = new Map();

  constructor(bus: AgentMessageBus = agentMessageBus, options: NegotiatorOptions = {}) {
    this.bus = bus;
    this.biddingWindowMs = options.biddingWindowMs ?? 500;
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.initiator = options.initiator ?? NEGOTIATION_INITIATOR;
  }

  // ─── API publique ──────────────────────────────────────────────────────────

  /**
   * Lance une négociation complète : annonce → collecte des bids → attribution.
   * Retourne l'issue (gagnant, bids scorés). Publie un `task_request` ciblé si
   * un gagnant éligible est trouvé.
   */
  async negotiate(
    task: NegotiationTask,
    from: AgentRole = this.initiator
  ): Promise<NegotiationOutcome> {
    const shortId = task.taskId.slice(0, 8);
    const negotiationStart = Date.now();
    this.openCalls.set(task.taskId, []);

    // ── Trace : OUVERTURE de la négociation ──
    log.info(
      `🔔 [contract-net] Négociation OUVERTE ${shortId} — "${task.title}"\n` +
        `   ├─ initiateur       : [${from}]\n` +
        `   ├─ capacités req.   : ${task.requiredCapabilities.join(", ") || "—"}\n` +
        `   ├─ fenêtre d'enchère: ${this.biddingWindowMs}ms\n` +
        `   ├─ priorité         : ${task.priority ?? "medium"}\n` +
        `   ├─ fichiers         : ${task.files?.join(", ") || "—"}\n` +
        `   ├─ critères succès  : ${task.successCriteria?.join(" | ") || "—"}\n` +
        `   └─ pondérations     : skill=${this.weights.skill}, conf=${this.weights.confidence}, load=${this.weights.load}`
    );

    await this.announce(task, from);
    await this.wait(this.biddingWindowMs);

    const rawBids = this.openCalls.get(task.taskId) ?? [];
    this.openCalls.delete(task.taskId);

    const scored = this.scoreBids(rawBids, task.requiredCapabilities).sort((a, b) =>
      this.compareBids(a, b)
    );
    const best = scored.find((b) => b.eligible) ?? null;

    // ── Trace : CLÔTURE + classement complet des offres ──
    const windowMs = Date.now() - negotiationStart;
    log.info(
      `📊 [contract-net] Enchère CLÔTURÉE ${shortId} — ${rawBids.length} offre(s) reçue(s) en ${windowMs}ms\n` +
        this.formatLeaderboard(scored)
    );

    if (!best) {
      log.warn(
        `🪧 [contract-net] AUCUN gagnant ${shortId} — "${task.title}" — ` +
          `${rawBids.length} bid(s) reçu(s), tous disqualifiés (skillMatch=0 ou aucune offre)`
      );
      return { taskId: task.taskId, winner: null, winningScore: null, bids: scored, awarded: false };
    }

    const runnerUp = scored.filter((b) => b.eligible && b.role !== best.role)[0];
    const scoreMargin = runnerUp ? best.score - runnerUp.score : null;
    // Écart de score négligeable → le départage s'est joué sur skillMatch puis
    // sur l'ordre de rôle stable (critère déterministe). On l'explicite.
    const tieOnScore = runnerUp !== undefined && scoreMargin !== null && scoreMargin < 1e-9;
    const tieOnSkill = tieOnScore && Math.abs(best.skillMatch - runnerUp!.skillMatch) < 1e-9;
    const marginLabel =
      scoreMargin === null
        ? "n/a (candidat unique)"
        : !tieOnScore
          ? scoreMargin.toFixed(3)
          : tieOnSkill
            ? `égalité score+skill → départagé par ordre de rôle stable ` +
              `([${best.role}] prioritaire sur [${runnerUp!.role}])`
            : `égalité de score → départagé par skillMatch ` +
              `(${best.skillMatch.toFixed(2)} vs ${runnerUp!.skillMatch.toFixed(2)})`;

    log.info(
      `🏆 [contract-net] GAGNANT ${shortId} → [${best.role}] pour "${task.title}"\n` +
        `   ├─ score gagnant : ${best.score.toFixed(3)} ` +
        `(skill=${best.skillMatch.toFixed(2)}, conf=${best.confidence.toFixed(2)}, load=${best.loadPenalty.toFixed(2)}, ` +
        `spéc=${best.specificity.toFixed(2)})\n` +
        `   ├─ dauphin       : ${runnerUp ? `[${runnerUp.role}] ${runnerUp.score.toFixed(3)}` : "aucun"}\n` +
        `   ├─ départage     : ${marginLabel}\n` +
        `   └─ offres totales: ${scored.length} (${scored.filter((b) => b.eligible).length} éligible(s))`
    );

    const awarded = await this.award(task, best.role, from);

    log.info(
      `${awarded ? "✅" : "⚠️"} [contract-net] Enchère ${shortId} CLÔTURÉE → gagnant [${best.role}] ` +
        `(task_request ${awarded ? "émis — l'agent exécute en arrière-plan" : "NON émis"})`
    );

    return {
      taskId: task.taskId,
      winner: best.role,
      winningScore: best.score,
      bids: scored,
      awarded,
    };
  }

  /** Rend le classement complet des offres (gagnant → perdants) pour la trace. */
  private formatLeaderboard(scored: readonly ScoredBid[]): string {
    if (scored.length === 0) return "   └─ (aucune offre)";
    return scored
      .map((b, i) => {
        const rank = i + 1;
        const branch = rank === scored.length ? "└─" : "├─";
        const medal = b.eligible ? (rank === 1 ? "🥇" : `#${rank}`) : "⛔";
        return (
          `   ${branch} ${medal} [${b.role}] score=${b.score.toFixed(3)} ` +
          `(skill=${b.skillMatch.toFixed(2)}, conf=${b.confidence.toFixed(2)}, load=${b.loadPenalty.toFixed(2)}, ` +
          `spéc=${b.specificity.toFixed(2)}) ` +
          `${b.eligible ? "éligible" : "DISQUALIFIÉ (skillMatch=0)"}`
        );
      })
      .join("\n");
  }

  /**
   * Enregistre un bid pour une enchère ouverte. Appelé par les agents candidats
   * (ou par `collectBid` via le bus). Ignoré si l'enchère est fermée.
   */
  submitBid(taskId: string, bid: Bid): boolean {
    const bids = this.openCalls.get(taskId);
    if (!bids) {
      log.warn(
        `📭 [contract-net] Bid REJETÉ de [${bid.role}] pour ${taskId.slice(0, 8)} — ` +
          `enchère fermée ou inconnue (arrivé hors fenêtre ?)`
      );
      return false;
    }
    bids.push(bid);
    log.info(
      `📨 [contract-net] Bid #${bids.length} reçu de [${bid.role}] pour ${taskId.slice(0, 8)} — ` +
        `skill=${bid.skillMatch.toFixed(2)}, conf=${bid.confidence.toFixed(2)}, load=${bid.loadPenalty.toFixed(2)}` +
        `${bid.skillMatch <= 0 ? " ⛔ (sera disqualifié)" : ""}`
    );
    return true;
  }

  /** Indique si une enchère est actuellement ouverte pour ce taskId. */
  hasOpenCall(taskId: string): boolean {
    return this.openCalls.has(taskId);
  }

  /**
   * Score pondéré d'un bid (mêmes poids que l'enchère). Exposé pour que
   * l'Agent Lead classe des candidats sans ouvrir d'enchère sur le bus.
   */
  scoreBid(bid: Bid): number {
    return (
      this.weights.skill * clamp01(bid.skillMatch) +
      this.weights.confidence * clamp01(bid.confidence) -
      this.weights.load * clamp01(bid.loadPenalty)
    );
  }

  /**
   * Calcule la part de capacités requises couvertes par un ensemble de capacités.
   * Exposé pour que les agents construisent leur bid depuis leurs propres skills.
   */
  skillMatchFor(capabilities: string[], requiredCapabilities: string[]): number {
    return this.computeSkillMatch(capabilities, requiredCapabilities);
  }

  /**
   * Construit automatiquement le bid d'un agent pour une tâche, à partir de sa
   * définition (capacités) et des métriques runtime du bus (charge + fiabilité).
   * Retourne null si l'agent est introuvable.
   */
  buildAutoBid(role: AgentRole, task: NegotiationTask): Bid | null {
    const definition = getAgentDefinition(role);
    if (!definition) return null;

    const skillMatch = this.computeSkillMatch(definition.capabilities, task.requiredCapabilities);
    const confidence = this.estimateConfidence(role);
    const loadPenalty = this.estimateLoadPenalty(role);

    return { role, skillMatch, confidence, loadPenalty };
  }

  /**
   * Fait participer un ensemble de rôles à l'enchère en construisant et soumettant
   * leur bid automatique. Pratique pour câbler des agents sans handler dédié.
   */
  autoBidFor(roles: AgentRole[], task: NegotiationTask): void {
    for (const role of roles) {
      const bid = this.buildAutoBid(role, task);
      if (bid) this.submitBid(task.taskId, bid);
    }
  }

  // ─── Étapes internes ─────────────────────────────────────────────────────

  /** Diffuse l'appel d'offres sur le bus (broadcast non bloquant). */
  private async announce(task: NegotiationTask, from: AgentRole): Promise<void> {
    await this.bus.broadcast(from, "call_for_proposals", {
      negotiation: true,
      taskId: task.taskId,
      title: task.title,
      description: task.description,
      requiredCapabilities: task.requiredCapabilities,
      files: task.files ?? [],
      instructions: task.instructions,
      priority: task.priority ?? "medium",
    });
    log.info(
      `📣 [contract-net] Appel d'offres DIFFUSÉ ${task.taskId.slice(0, 8)} par [${from}] : "${task.title}" ` +
        `— capacités requises: ${task.requiredCapabilities.join(", ") || "—"} — en attente des bids...`
    );
  }

  /** Publie le task_request ciblé vers le gagnant. */
  private async award(
    task: NegotiationTask,
    winner: AgentRole,
    from: AgentRole
  ): Promise<boolean> {
    const message: AgentMessage = {
      id: randomUUID(),
      type: "task_request",
      from,
      to: winner,
      priority: task.priority ?? "medium",
      timestamp: new Date().toISOString(),
      payload: {
        type: "task_request",
        taskId: task.taskId,
        title: task.title,
        description: task.description,
        files: task.files ?? [],
        instructions: task.instructions,
        context: {
          successCriteria: task.successCriteria,
          previousResults: task.previousResults,
          ...(task.context ?? {}),
        },
      } satisfies TaskRequestPayload,
      metadata: {
        negotiated: true,
        awardedTo: winner,
        // ── CORRECTIF CRITIQUE ──
        // Sans ce flag, l'agent gagnant exécute en one-shot (executor.execute)
        // au lieu de la boucle autonome (retry/verify/no-progress guard), d'où
        // les tâches "qui ne modifient rien".
        autonomous: true,
        // Traçabilité : initiateur de la négociation (broadcast neutre).
        negotiationInitiator: from,
      },
    };

    // IMPORTANT — publication FIRE-AND-FORGET.
    // `bus.publish()` livre le message de façon synchrone au handler du gagnant
    // (handleTaskRequest → boucle autonome), qui est `await`-é tout au long de
    // l'exécution. Si on l'attendait ici, `negotiate()` ne rendrait la main
    // qu'après la fin complète du travail de l'agent (plusieurs minutes), et le
    // log d'attribution ne sortirait qu'À LA FIN — donnant l'impression trompeuse
    // qu'un gagnant est désigné APRÈS l'exploitation de l'agent.
    // On loggue donc l'émission AVANT la livraison, et on ne bloque pas dessus :
    // l'enchère se clôt immédiatement, l'agent gagnant exécute en arrière-plan
    // (même sémantique que les délégations ciblées).
    log.info(
      `📤 [contract-net] task_request ${message.id.slice(0, 8)} émis ${task.taskId.slice(0, 8)} ` +
        `[${from}] → [${winner}] (mode autonome, priorité ${task.priority ?? "medium"}) — exécution en arrière-plan`
    );

    void this.bus.publish(message).catch((err) => {
      log.error(
        `❌ [contract-net] Échec livraison task_request ${task.taskId.slice(0, 8)} vers [${winner}]: ${(err as Error).message}`
      );
    });

    // L'attribution (= émission du task_request) a réussi du point de vue de
    // l'enchère ; le succès/échec de l'EXÉCUTION du gagnant est un évènement
    // distinct, tracé par AutonomousLoop / AgentRuntimeExecutor.
    return true;
  }

  // ─── Scoring ───────────────────────────────────────────────────────────────

  /** Score tous les bids. Un bid avec skillMatch === 0 est inéligible. */
  private scoreBids(bids: Bid[], requiredCapabilities: readonly string[]): ScoredBid[] {
    return bids.map((bid) => ({
      ...bid,
      skillMatch: clamp01(bid.skillMatch),
      confidence: clamp01(bid.confidence),
      loadPenalty: clamp01(bid.loadPenalty),
      score: this.scoreBid(bid),
      eligible: clamp01(bid.skillMatch) > 0,
      specificity: this.computeSpecificity(bid.role, requiredCapabilities),
    }));
  }

  /** Part des capacités requises couvertes par l'agent (0..1). */
  private computeSkillMatch(capabilities: string[], required: string[]): number {
    if (required.length === 0) return 0;
    const owned = new Set(capabilities);
    const covered = required.filter((cap) => owned.has(cap)).length;
    return covered / required.length;
  }

  /**
   * Spécificité d'un agent pour les capacités requises :
   * couvertes_requises / total_capacités_agent (0..1).
   *
   * Mesure à quel point l'agent est FOCALISÉ sur ce que la tâche demande, par
   * opposition à un généraliste qui couvre les mêmes capacités « noyées » parmi
   * beaucoup d'autres. Sert de premier critère de départage à score égal.
   */
  private computeSpecificity(role: AgentRole, required: readonly string[]): number {
    const definition = getAgentDefinition(role);
    if (!definition || definition.capabilities.length === 0 || required.length === 0) return 0;
    const owned = new Set(definition.capabilities);
    const coveredRequired = required.filter((cap) => owned.has(cap)).length;
    return coveredRequired / definition.capabilities.length;
  }

  /**
   * Ordre de priorité stable des rôles STATIQUES (dernier recours de départage).
   * Garantit un gagnant DÉTERMINISTE même quand score ET spécificité sont égaux,
   * en éliminant la dépendance à l'ordre d'arrivée des bids / au tri instable.
   * Les rôles dynamiques (hors liste) sont départagés alphabétiquement après.
   */
  private roleOrder(role: AgentRole): number {
    const idx = STATIC_AGENT_ROLES.indexOf(role as (typeof STATIC_AGENT_ROLES)[number]);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  }

  /**
   * Comparateur de départage total et déterministe entre deux offres scorées :
   *   1. score composite décroissant (critère principal) ;
   *   2. skillMatch décroissant (couverture brute des capacités requises) ;
   *   3. ordre de priorité de rôle stable (STATIC_AGENT_ROLES) ;
   *   4. ordre alphabétique du rôle (filet de sécurité pour rôles dynamiques).
   *
   * NOTE sur la spécificité : `couvertes_requises / total_capacités` récompense
   * mécaniquement l'agent au plus PETIT jeu de capacités, ce qui peut router une
   * tâche d'ACTION (écriture/vérif) vers un agent qui n'a pas les outils pour
   * l'exécuter (ex. researcher sans write_project_file battant tester). On ne
   * l'utilise donc PAS pour départager : elle reste purement diagnostique dans
   * la trace. À skillMatch égal, l'ordre de rôle stable (coder < refactor <
   * debugger < reviewer < tester < … < researcher) tranche de façon prévisible.
   * Un epsilon absorbe le bruit flottant sur les critères continus.
   */
  private compareBids(a: ScoredBid, b: ScoredBid): number {
    const EPS = 1e-9;
    if (Math.abs(a.score - b.score) > EPS) return b.score - a.score;
    if (Math.abs(a.skillMatch - b.skillMatch) > EPS) return b.skillMatch - a.skillMatch;
    const orderDelta = this.roleOrder(a.role) - this.roleOrder(b.role);
    if (orderDelta !== 0) return orderDelta;
    return String(a.role).localeCompare(String(b.role));
  }

  /**
   * Estime la fiabilité d'un rôle à partir du taux de succès observé sur le bus.
   * Valeur neutre (0.5) en l'absence de données — pas de dépendance fantôme.
   */
  private estimateConfidence(role: AgentRole): number {
    const metrics = this.bus.getMetrics();
    const sent = metrics.byAgentRole[role];
    if (!sent || metrics.totalMessages === 0) return 0.5;
    // successRate est global au bus ; on l'utilise comme proxy de fiabilité
    // tant qu'aucune métrique par-rôle n'est disponible.
    return clamp01(metrics.successRate);
  }

  /** Estime la charge normalisée d'un rôle à partir de getAgentLoad(). */
  private estimateLoadPenalty(role: AgentRole): number {
    const load = this.bus.getAgentLoad();
    const entry = load[role];
    if (!entry) return 0;
    // Normalisation douce : 1 tâche active ≈ 0.25 de pénalité, plafonné à 1.
    return clamp01(entry.activeMessages * 0.25);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const contractNetNegotiator = new ContractNetNegotiator();

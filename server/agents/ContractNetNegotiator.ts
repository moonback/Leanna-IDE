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
import type { AgentMessage, TaskRequestPayload } from "./AgentCommunication.js";
import { AgentMessageBus, agentMessageBus } from "./AgentMessageBus.js";
import { getAgentDefinition, listAgentRoles } from "./roles.js";
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
  /**
   * Repli déterministe : fournisseur paresseux des rôles candidats qui
   * enchérissent AUTOMATIQUEMENT lorsque, à la fin de la fenêtre d'enchères,
   * aucun bid vivant n'est arrivé.
   *
   * En production, rien ne garantit qu'une flotte d'`AutonomousAgent` soit
   * abonnée au bus pour répondre aux `call_for_proposals` ; sans répondeur,
   * `negotiate()` renverrait toujours `winner: null`. Ce repli fait concourir
   * les rôles enregistrés via `autoBidFor` (bids dérivés de leurs capacités +
   * métriques runtime), de sorte que la négociation produise un gagnant éligible
   * dès qu'un rôle couvre les capacités requises — **sans** jamais écraser des
   * bids vivants (il n'intervient que si l'enchère est restée vide).
   *
   * `undefined` (défaut) = pas de repli : comportement strictement inchangé,
   * la négociation dépend uniquement des agents abonnés.
   */
  fallbackBidders?: () => AgentRole[];
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
  private readonly fallbackBidders?: () => AgentRole[];

  /** Enchères ouvertes : taskId → bids reçus. */
  private openCalls: Map<string, Bid[]> = new Map();

  constructor(bus: AgentMessageBus = agentMessageBus, options: NegotiatorOptions = {}) {
    this.bus = bus;
    this.biddingWindowMs = options.biddingWindowMs ?? 500;
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.initiator = options.initiator ?? NEGOTIATION_INITIATOR;
    this.fallbackBidders = options.fallbackBidders;
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
    const t0 = Date.now();

    // Guard (#2) : une enchère déjà ouverte sur ce taskId rendrait le second
    // appel destructeur — `openCalls.set(taskId, [])` écraserait la liste de bids
    // du premier. On refuse explicitement les taskId concurrents en doublon.
    if (this.openCalls.has(task.taskId)) {
      throw new Error(
        `Négociation déjà ouverte pour la tâche ${shortId} — utilisez un taskId unique.`
      );
    }

    log.info(
      `🔔 Négociation ouverte "${task.title}" (${shortId}) par [${from}] — ` +
        `capacités requises: [${task.requiredCapabilities.join(", ") || "—"}], ` +
        `fenêtre ${this.biddingWindowMs}ms`
    );
    this.openCalls.set(task.taskId, []);

    try {
      await this.announce(task, from);
      await this.wait(this.biddingWindowMs);

      const liveBidCount = this.openCalls.get(task.taskId)?.length ?? 0;

      // Repli déterministe : si aucun agent vivant n'a enchéri pendant la fenêtre,
      // faire concourir les rôles enregistrés (bids dérivés de leurs capacités).
      // L'enchère est encore ouverte ici, donc `autoBidFor` → `submitBid` est accepté.
      // On n'écrase jamais des bids vivants : le repli ne se déclenche QUE sur une
      // enchère restée vide.
      let usedFallback = false;
      if (liveBidCount === 0 && this.fallbackBidders) {
        const roles = this.fallbackBidders().filter((role) => role !== from);
        if (roles.length > 0) {
          usedFallback = true;
          log.info(
            `🤖 Aucun ench\u00e9risseur vivant pour "${task.title}" (${shortId}) — ` +
              `repli automatique sur ${roles.length} r\u00f4le(s) enregistr\u00e9(s) : [${roles.join(", ")}]`
          );
          this.autoBidFor(roles, task);
        } else {
          log.debug(`Repli configuré mais aucun rôle candidat (hors initiateur) pour ${shortId}`);
        }
      } else if (liveBidCount > 0) {
        log.info(`🙋 ${liveBidCount} offre(s) vivante(s) reçue(s) pour "${task.title}" (${shortId}) — pas de repli`);
      }

      const rawBids = this.openCalls.get(task.taskId) ?? [];

      const scored = this.scoreBids(rawBids).sort((a, b) => b.score - a.score);

      // Classement complet (DEBUG) pour vérifier POURQUOI un rôle gagne/perd.
      if (scored.length > 0) {
        const ranking = scored
          .map(
            (b, i) =>
              `${i + 1}. ${b.role} score=${b.score.toFixed(3)} ` +
              `(skill=${b.skillMatch.toFixed(2)} conf=${b.confidence.toFixed(2)} load=${b.loadPenalty.toFixed(2)}` +
              `${b.eligible ? "" : " INÉLIGIBLE"})`
          )
          .join(" | ");
        log.debug(`📊 Classement ${shortId} [${usedFallback ? "repli" : "vivant"}] : ${ranking}`);
      }

      const best = scored.find((b) => b.eligible) ?? null;

      if (!best) {
        log.warn(
          `🪧 Aucune offre éligible pour la tâche "${task.title}" (${shortId}) — ` +
            `${rawBids.length} bid(s) reçu(s), tous disqualifiés (${Date.now() - t0}ms)`
        );
        return { taskId: task.taskId, winner: null, winningScore: null, bids: scored, awarded: false };
      }

      const awarded = await this.award(task, best.role, from);

      log.info(
        `🏆 Marché attribué à [${best.role}] pour "${task.title}" ` +
          `(score ${best.score.toFixed(3)}, ${scored.length} bid(s), ` +
          `source=${usedFallback ? "repli" : "vivant"}, award=${awarded ? "ok" : "ÉCHEC"}, ${Date.now() - t0}ms)`
      );

      return {
        taskId: task.taskId,
        winner: best.role,
        winningScore: best.score,
        bids: scored,
        awarded,
      };
    } finally {
      // Cleanup TOUJOURS (#1) : une exception dans announce/wait/scoring laissait
      // auparavant l'entrée `openCalls` en place (fuite mémoire + blocage du guard
      // ci-dessus sur une future enchère au même taskId). `rawBids` est déjà extrait
      // avant tout usage, donc déplacer le delete ici est sans effet de bord.
      this.openCalls.delete(task.taskId);
    }
  }

  /**
   * Enregistre un bid pour une enchère ouverte. Appelé par les agents candidats
   * (ou par `collectBid` via le bus). Ignoré si l'enchère est fermée.
   */
  submitBid(taskId: string, bid: Bid): boolean {
    const bids = this.openCalls.get(taskId);
    if (!bids) {
      log.debug(`Bid ignoré : enchère ${taskId.slice(0, 8)} fermée ou inconnue`);
      return false;
    }
    bids.push(bid);
    log.debug(
      `📨 Bid reçu de [${bid.role}] pour ${taskId.slice(0, 8)} ` +
        `(skill ${bid.skillMatch.toFixed(2)}, conf ${bid.confidence.toFixed(2)}, load ${bid.loadPenalty.toFixed(2)})`
    );
    return true;
  }

  /** Indique si une enchère est actuellement ouverte pour ce taskId. */
  hasOpenCall(taskId: string): boolean {
    return this.openCalls.has(taskId);
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
      `📣 Appel d'offres diffusé par [${from}] : "${task.title}" ` +
        `(capacités requises: ${task.requiredCapabilities.join(", ") || "—"})`
    );
  }

  /** Publie le task_request ciblé vers le gagnant. */
  private async award(
    task: NegotiationTask,
    winner: AgentRole,
    from: AgentRole
  ): Promise<boolean> {
    // Garde-fou (#3) : un agent ne peut pas remporter sa propre enchère
    // (auto-attribution biaisée). En pratique l'initiateur n'est pas abonné à son
    // propre broadcast et le repli filtre déjà `role !== from`, mais on protège
    // explicitement le contrat contre un futur chemin d'émission.
    if (winner === from) {
      log.error(
        `Auto-attribution refusée : [${from}] ne peut pas remporter sa propre enchère (${task.taskId.slice(0, 8)}).`
      );
      return false;
    }

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
      } satisfies TaskRequestPayload,
      metadata: { negotiated: true, awardedTo: winner },
    };

    try {
      await this.bus.publish(message);
      return true;
    } catch (err) {
      log.error(`Échec publication task_request vers [${winner}]: ${(err as Error).message}`);
      return false;
    }
  }

  // ─── Scoring ───────────────────────────────────────────────────────────────

  /** Score tous les bids. Un bid avec skillMatch === 0 est inéligible. */
  private scoreBids(bids: Bid[]): ScoredBid[] {
    return bids.map((bid) => {
      const clampedSkill = clamp01(bid.skillMatch);
      const clampedConf = clamp01(bid.confidence);
      const clampedLoad = clamp01(bid.loadPenalty);

      const score =
        this.weights.skill * clampedSkill +
        this.weights.confidence * clampedConf -
        this.weights.load * clampedLoad;

      return {
        ...bid,
        skillMatch: clampedSkill,
        confidence: clampedConf,
        loadPenalty: clampedLoad,
        score,
        eligible: clampedSkill > 0,
      };
    });
  }

  /** Part des capacités requises couvertes par l'agent (0..1). */
  private computeSkillMatch(capabilities: string[], required: string[]): number {
    if (required.length === 0) return 0;
    const owned = new Set(capabilities);
    const covered = required.filter((cap) => owned.has(cap)).length;
    return covered / required.length;
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

/**
 * Singleton de production : branché sur le bus singleton, avec un **repli
 * déterministe** sur l'ensemble des rôles enregistrés (statiques + dynamiques).
 *
 * Ainsi, même en l'absence d'une flotte d'`AutonomousAgent` abonnée au bus, une
 * négociation produit toujours un gagnant éligible dès qu'un rôle couvre les
 * capacités requises — ce qui rend le contract-net exploitable « en production »
 * pour attribuer dynamiquement une tâche au meilleur agent. Les bids vivants,
 * quand il y en a, priment toujours (le repli n'agit que sur une enchère vide).
 */
export const contractNetNegotiator = new ContractNetNegotiator(agentMessageBus, {
  fallbackBidders: () => listAgentRoles() as AgentRole[],
});

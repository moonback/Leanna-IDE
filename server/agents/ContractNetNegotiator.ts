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
import { getAgentDefinition } from "./roles.js";
import { getContractNetConfig } from "./contractNetConfig.js";
import { roleReliability, type RoleReliability } from "./RoleReliability.js";
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
  /**
   * Rôle préféré (ex. `agentRole` choisi par le Brain). Il garde la tâche si son
   * bid éligible est à moins de `switchMargin` du meilleur score.
   */
  preferredRole?: AgentRole;
  /** Marge de préférence (défaut : `CONTRACT_NET_SWITCH_MARGIN`, 0.10). */
  switchMargin?: number;
}

/** Options d'une négociation. */
export interface NegotiateOptions {
  /**
   * `true` (défaut) : publie un `task_request` ciblé vers le gagnant.
   * `false` (mode SÉLECTION) : l'enchère choisit seulement l'agent ; l'appelant
   * exécute la tâche lui-même (suivi de statut, annulation, budget conservés).
   */
  award?: boolean;
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
  /**
   * Candidats éligibles, gagnant en tête puis par score décroissant. Permet à
   * l'appelant de passer au candidat suivant (ex. gagnant sans capacité libre).
   */
  ranked: ScoredBid[];
  /** True si le rôle préféré a conservé la tâche grâce à la marge de préférence. */
  preferredKept: boolean;
  /** True si l'enchère s'est fermée avant la fin de la fenêtre (tous ont répondu). */
  closedEarly: boolean;
  /** Durée réelle de l'enchère (annonce → attribution), en ms. */
  durationMs: number;
}

/** Métriques cumulées du négociateur (observabilité). */
export interface NegotiatorStats {
  auctions: number;
  withWinner: number;
  noWinner: number;
  closedEarly: number;
  preferredKept: number;
  /** Enchères où le gagnant diffère du rôle préféré. */
  switched: number;
  /** Replis sur le rôle statique signalés par l'appelant (`recordFallback`). */
  fallbacks: number;
  totalDurationMs: number;
  avgDurationMs: number;
  winsByRole: Record<string, number>;
}

/** État interne d'une enchère ouverte. */
interface OpenCall {
  bids: Bid[];
  /** Rôles ayant répondu (bid ou refus) — sert à la clôture anticipée. */
  responded: Set<AgentRole>;
  /** Réveille `negotiate` quand une réponse arrive (clôture anticipée). */
  notify?: () => void;
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
  /** Source de la fiabilité par rôle (défaut : singleton adossé à StrategyMemory). */
  reliability?: RoleReliability;
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
  /** Fenêtre imposée (tests/options). Sinon lue paresseusement depuis l'environnement. */
  private readonly windowOverrideMs: number | undefined;
  private readonly weights: ScoringWeights;
  private readonly initiator: AgentRole;
  private readonly reliability: RoleReliability;

  /** Enchères ouvertes : taskId → état (bids + rôles ayant répondu). */
  private openCalls: Map<string, OpenCall> = new Map();

  /** Fournit les rôles en ligne attendus à une enchère (clôture anticipée). */
  private expectedBiddersProvider: (() => AgentRole[]) | null = null;

  private stats: Omit<NegotiatorStats, "avgDurationMs"> = emptyStats();

  constructor(bus: AgentMessageBus = agentMessageBus, options: NegotiatorOptions = {}) {
    this.bus = bus;
    this.windowOverrideMs = options.biddingWindowMs;
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.initiator = options.initiator ?? NEGOTIATION_INITIATOR;
    this.reliability = options.reliability ?? roleReliability;
  }

  /** Plafond de la fenêtre d'enchères (ms) : option explicite, sinon `CONTRACT_NET_BIDDING_WINDOW_MS`. */
  private get biddingWindowMs(): number {
    return this.windowOverrideMs ?? getContractNetConfig().biddingWindowMs;
  }

  // ─── API publique ──────────────────────────────────────────────────────────

  /**
   * Déclare la source des rôles en ligne attendus à chaque enchère. Activée par
   * `AgentRegistry`, elle permet la CLÔTURE ANTICIPÉE : dès que chaque rôle
   * attendu a répondu (bid ou refus), l'enchère se ferme sans attendre la
   * fenêtre, qui ne sert plus que de plafond.
   */
  setExpectedBiddersProvider(provider: (() => AgentRole[]) | null): void {
    this.expectedBiddersProvider = provider;
  }

  /**
   * Lance une négociation complète : annonce → collecte des bids → attribution.
   * Retourne l'issue (gagnant, bids scorés). Par défaut publie un `task_request`
   * ciblé vers le gagnant ; avec `{ award: false }` (mode SÉLECTION) elle choisit
   * seulement l'agent et laisse l'appelant exécuter la tâche.
   */
  async negotiate(
    task: NegotiationTask,
    from: AgentRole = this.initiator,
    options: NegotiateOptions = {}
  ): Promise<NegotiationOutcome> {
    const startedAt = Date.now();
    const shouldAward = options.award !== false;

    // L'enchère est ouverte de façon SYNCHRONE : un submitBid() émis juste après
    // l'appel (sans await) est ainsi toujours pris en compte.
    const call: OpenCall = { bids: [], responded: new Set() };
    this.openCalls.set(task.taskId, call);

    let closedEarly = false;
    let rawBids: Bid[];
    try {
      await this.announce(task, from);
      closedEarly = await this.collect(call, from);
    } finally {
      rawBids = call.bids;
      this.openCalls.delete(task.taskId);
    }

    const scored = this.scoreBids(rawBids).sort((a, b) => b.score - a.score);
    const eligible = scored.filter((b) => b.eligible);
    const { winner, preferredKept } = this.pickWinner(eligible, task);

    if (!winner) {
      log.warn(
        `🪧 Aucune offre éligible pour la tâche "${task.title}" (${task.taskId.slice(0, 8)}) — ` +
          `${rawBids.length} bid(s) reçu(s), tous disqualifiés`
      );
      const durationMs = Date.now() - startedAt;
      this.recordAuction({ winner: null, task, closedEarly, preferredKept: false, durationMs });
      return {
        taskId: task.taskId,
        winner: null,
        winningScore: null,
        bids: scored,
        awarded: false,
        ranked: [],
        preferredKept: false,
        closedEarly,
        durationMs,
      };
    }

    // Gagnant en tête, puis les autres éligibles par score décroissant.
    const ranked = [winner, ...eligible.filter((b) => b !== winner)];
    const awarded = shouldAward ? await this.award(task, winner.role, from) : false;
    const durationMs = Date.now() - startedAt;
    this.recordAuction({ winner: winner.role, task, closedEarly, preferredKept, durationMs });

    log.info(
      `🏆 Marché ${shouldAward ? "attribué" : "sélectionné"} : [${winner.role}] pour "${task.title}" ` +
        `(score ${winner.score.toFixed(3)}, ${scored.length} bid(s), ${durationMs}ms` +
        `${closedEarly ? ", clôture anticipée" : ""}${preferredKept ? ", rôle préféré conservé" : ""})`
    );

    return {
      taskId: task.taskId,
      winner: winner.role,
      winningScore: winner.score,
      bids: scored,
      awarded,
      ranked,
      preferredKept,
      closedEarly,
      durationMs,
    };
  }

  /**
   * Enregistre un bid pour une enchère ouverte. Appelé par les agents candidats
   * (ou par `collectBid` via le bus). Ignoré si l'enchère est fermée.
   */
  submitBid(taskId: string, bid: Bid): boolean {
    const call = this.openCalls.get(taskId);
    if (!call) {
      log.debug(`Bid ignoré : enchère ${taskId.slice(0, 8)} fermée ou inconnue`);
      return false;
    }

    // Dédup par rôle : un même rôle peut re-soumettre (retry, re-broadcast).
    // On conserve le bid au skillMatch le plus élevé pour éviter les doublons
    // dans `ranked`/`bids`, des statistiques gonflées, et surtout qu'un second
    // bid inéligible (skillMatch 0) ne masque un premier bid éligible.
    const existingIdx = call.bids.findIndex((b) => b.role === bid.role);
    if (existingIdx !== -1) {
      if (bid.skillMatch > call.bids[existingIdx].skillMatch) {
        call.bids[existingIdx] = bid;
      }
      call.responded.add(bid.role);
      call.notify?.();
      return true;
    }

    call.bids.push(bid);
    call.responded.add(bid.role);
    log.debug(
      `📨 Bid reçu de [${bid.role}] pour ${taskId.slice(0, 8)} ` +
        `(skill ${bid.skillMatch.toFixed(2)}, conf ${bid.confidence.toFixed(2)}, load ${bid.loadPenalty.toFixed(2)})`
    );
    call.notify?.();
    return true;
  }

  /**
   * Refus explicite d'un agent qui ne peut / ne veut pas enchérir (ex. aucune
   * capacité requise). Ne crée pas de bid, mais compte comme réponse pour la
   * clôture anticipée. Ignoré si l'enchère est fermée.
   */
  declineBid(taskId: string, role: AgentRole): boolean {
    const call = this.openCalls.get(taskId);
    if (!call) return false;
    call.responded.add(role);
    call.notify?.();
    return true;
  }

  /** Indique si une enchère est actuellement ouverte pour ce taskId. */
  hasOpenCall(taskId: string): boolean {
    return this.openCalls.has(taskId);
  }

  /**
   * True si un fournisseur de rôles est branché ET qu'aucun agent n'est en ligne :
   * il est alors inutile de lancer une enchère (personne n'enchérirait et l'on
   * attendrait la fenêtre complète pour rien).
   */
  hasNoOnlineBidders(from: AgentRole = this.initiator): boolean {
    if (!this.expectedBiddersProvider) return false;
    try {
      // On exclut l'initiateur : le bus ne lui diffuse pas l'appel d'offres, il
      // ne pourrait donc pas enchérir. Sans ce filtre, un `negotiate(task, X)`
      // où `X` est le seul agent en ligne attendrait stérilement toute la fenêtre.
      return this.expectedBiddersProvider().filter((role) => role !== from).length === 0;
    } catch {
      return false;
    }
  }

  /** Signale qu'un appelant a dû se replier sur le rôle statique (métriques). */
  recordFallback(): void {
    this.stats.fallbacks++;
  }

  /** Métriques cumulées depuis le démarrage (ou le dernier `resetStats`). */
  getStats(): NegotiatorStats {
    const { auctions, totalDurationMs } = this.stats;
    return {
      ...this.stats,
      winsByRole: { ...this.stats.winsByRole },
      avgDurationMs: auctions > 0 ? totalDurationMs / auctions : 0,
    };
  }

  resetStats(): void {
    this.stats = emptyStats();
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

  /**
   * Attend les réponses de l'enchère. Retourne `true` si elle s'est fermée AVANT
   * la fin de la fenêtre parce que tous les rôles attendus ont répondu.
   *
   * Sans fournisseur de rôles attendus (ou liste vide), on garde le comportement
   * historique : attente de la fenêtre complète.
   */
  private async collect(call: OpenCall, from: AgentRole): Promise<boolean> {
    const allResponded = (): boolean => {
      const expected = this.expectedRoles(from);
      return expected.length > 0 && expected.every((role) => call.responded.has(role));
    };

    // `broadcast` attend les handlers des agents : leurs bids sont souvent déjà là.
    if (allResponded()) return true;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (early: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        call.notify = undefined;
        resolve(early);
      };
      const timer = setTimeout(() => finish(false), this.biddingWindowMs);
      call.notify = () => {
        if (allResponded()) finish(true);
      };
    });
  }

  /** Rôles en ligne attendus (hors initiateur, que le bus exclut du broadcast). */
  private expectedRoles(from: AgentRole): AgentRole[] {
    if (!this.expectedBiddersProvider) return [];
    try {
      return this.expectedBiddersProvider().filter((role) => role !== from);
    } catch (err) {
      log.warn(`Fournisseur de rôles attendus en erreur: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Choisit le gagnant parmi les bids éligibles (triés par score décroissant).
   * Le rôle préféré garde la tâche si son écart au meilleur score est <= marge.
   */
  private pickWinner(
    eligible: ScoredBid[],
    task: NegotiationTask
  ): { winner: ScoredBid | null; preferredKept: boolean } {
    const best = eligible[0] ?? null;
    if (!best) return { winner: null, preferredKept: false };

    if (task.preferredRole && best.role !== task.preferredRole) {
      // `eligible` ne contient QUE des bids éligibles, et `submitBid` déduplique
      // par rôle : impossible de retomber ici sur un bid `skillMatch: 0` du rôle
      // préféré qui aurait doublé un bid éligible.
      const preferred = eligible.find((b) => b.role === task.preferredRole);
      const margin = task.switchMargin ?? getContractNetConfig().switchMargin;
      // Epsilon : évite qu'un écart de 0.1 « flottant » (0.10000000000000009) casse la marge.
      if (preferred && best.score - preferred.score <= margin + 1e-9) {
        return { winner: preferred, preferredKept: true };
      }
    }
    return { winner: best, preferredKept: false };
  }

  private recordAuction(info: {
    winner: AgentRole | null;
    task: NegotiationTask;
    closedEarly: boolean;
    preferredKept: boolean;
    durationMs: number;
  }): void {
    const s = this.stats;
    s.auctions++;
    s.totalDurationMs += info.durationMs;
    if (info.closedEarly) s.closedEarly++;
    if (!info.winner) {
      s.noWinner++;
      return;
    }
    s.withWinner++;
    s.winsByRole[info.winner] = (s.winsByRole[info.winner] ?? 0) + 1;
    if (info.preferredKept) s.preferredKept++;
    if (info.task.preferredRole && info.winner !== info.task.preferredRole) s.switched++;
  }

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

  /**
   * Part des capacités requises couvertes par l'agent (0..1).
   * Aucune capacité requise = contrainte vide → tout le monde couvre
   * trivialement la tâche (retour 1). Sinon tous les bids seraient inéligibles
   * (skillMatch 0) et l'enchère n'aurait jamais de gagnant.
   */
  private computeSkillMatch(capabilities: string[], required: string[]): number {
    if (required.length === 0) return 1;
    const owned = new Set(capabilities);
    const covered = required.filter((cap) => owned.has(cap)).length;
    return covered / required.length;
  }

  /**
   * Confiance d'un rôle (0..1) : taux de succès RÉCENT propre à ce rôle, tiré de
   * `StrategyMemory` via `RoleReliability`. Neutre (0.5) sous le seuil de preuve.
   * Utilisée par `buildAutoBid` et par `AutonomousAgent.autoBidOnCall`.
   */
  confidenceFor(role: AgentRole): number {
    return clamp01(this.reliability.getConfidence(role));
  }

  private estimateConfidence(role: AgentRole): number {
    return this.confidenceFor(role);
  }

  /** Estime la charge normalisée d'un rôle à partir de getAgentLoad(). */
  private estimateLoadPenalty(role: AgentRole): number {
    const load = this.bus.getAgentLoad();
    const entry = load[role];
    if (!entry) return 0;
    // Normalisation douce : 1 tâche active ≈ 0.25 de pénalité, plafonné à 1.
    return clamp01(entry.activeMessages * 0.25);
  }

}

function emptyStats(): Omit<NegotiatorStats, "avgDurationMs"> {
  return {
    auctions: 0,
    withWinner: 0,
    noWinner: 0,
    closedEarly: 0,
    preferredKept: 0,
    switched: 0,
    fallbacks: 0,
    totalDurationMs: 0,
    winsByRole: {},
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const contractNetNegotiator = new ContractNetNegotiator();

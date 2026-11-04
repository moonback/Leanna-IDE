/**
 * core/LeannaSupervisor.ts — P0.6 : autorité unique de mission.
 *
 * L'audit (§19) considère cela comme P0 : il manque une AUTORITÉ SUPÉRIEURE qui
 * possède la décision « quelle est la prochaine action ? ». Aujourd'hui la
 * réponse dépend du chemin emprunté (mission Executor vs runtime agentique).
 *
 * `LeannaSupervisor` est cette autorité. Il ne remplace pas les moteurs : il les
 * PILOTE via une fonction d'exécution injectée (`MissionRunner`) — ce qui pose la
 * couture vers un runtime canonique (P0.1) sans fusion risquée immédiate. Le
 * Supervisor orchestre le cycle transactionnel complet en combinant les briques
 * P0 :
 *
 *   MissionStateMachine (état durable)
 *   CheckpointManager   (snapshot/rollback)
 *   ExecutionLedger     (idempotence — via le runner)
 *   EvidenceEngine      (preuve, prime sur la narration)
 *
 * Cycle gouverné :
 *   CREATED → PLANNING → READY → RUNNING → (SNAPSHOT) → VERIFYING
 *     → preuve OK   → COMMITTING → COMPLETED
 *     → preuve FAIL → RECOVERING → (ROLLBACK) → retry / replan / ESCALATE
 *
 * Décisions possibles (audit §19, §17) : continue | retry | repair | replan |
 * pause | escalate | complete.
 */

import {
  MissionStateMachine,
  type MissionLifecycleState,
} from "./MissionStateMachine.js";
import { DurableMissionStore } from "./DurableMissionStore.js";
import { CheckpointManager } from "./CheckpointManager.js";
import { EvidenceEngine, type EvidenceInput, type EvidenceBundle } from "./EvidenceEngine.js";

/** Décision de récupération à quatre niveaux (audit §17). */
export type RecoveryDecision = "retry" | "repair" | "replan" | "escalate";

/** Ce que le runner remonte au Supervisor après une tentative d'exécution. */
export interface RunnerOutcome {
  /** L'exécution a-t-elle abouti du point de vue du runner ? */
  success: boolean;
  /**
   * Fichiers effectivement touchés par le runner (informationnel : le snapshot
   * de rollback est pris AVANT l'exécution à partir de `plannedFiles`).
   */
  touchedFiles?: string[];
  /** Preuves observées (tests, typecheck, lint, changes…) à sceller. */
  evidence?: Omit<EvidenceInput, "missionId" | "goal">;
  /** Décision de récupération suggérée en cas d'échec (sinon le Supervisor décide). */
  suggestedRecovery?: RecoveryDecision;
  /** Message d'erreur éventuel. */
  error?: string;
}

/** Fonction d'exécution d'une mission (le moteur réel — agentique/mission). */
export type MissionRunner = (ctx: {
  missionId: string;
  goal: string;
  attempt: number;
  /** Signal d'annulation déclenché sur timeout runner (ou annulation externe). */
  signal?: AbortSignal;
  beforeToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<void>;
}) => Promise<RunnerOutcome>;

/**
 * Hooks optionnels de gouvernance humaine/temporelle (audit, point 5 : le
 * Supervisor n'utilisait jamais `PAUSED` ni `WAITING_APPROVAL`).
 *
 * Tous sont facultatifs : absents, le comportement est identique à avant.
 */
export interface SupervisorGovernanceHooks {
  /**
   * Appelé avant chaque tentative. S'il retourne `true`, la mission passe en
   * `WAITING_APPROVAL` puis `awaitApproval` est attendu. Un refus (false)
   * escalade la mission.
   */
  needsApproval?: (ctx: { missionId: string; goal: string; attempt: number }) => boolean | Promise<boolean>;
  /** Attend la décision humaine. `true` = approuvé → RUNNING ; `false` = refusé → ESCALATED. */
  awaitApproval?: (ctx: { missionId: string; goal: string; attempt: number }) => Promise<boolean>;
  /**
   * Appelé avant chaque tentative. S'il retourne `true`, la mission passe en
   * `PAUSED` puis `awaitResume` est attendu avant de reprendre.
   */
  shouldPause?: (ctx: { missionId: string; goal: string; attempt: number }) => boolean | Promise<boolean>;
  /** Attend la reprise après une pause (se résout quand l'utilisateur reprend). */
  awaitResume?: (ctx: { missionId: string; goal: string; attempt: number }) => Promise<void>;
}

export interface SupervisorConfig {
  /** Nombre max de tentatives avant escalade obligatoire (défaut: 3). */
  maxAttempts: number;
  /** Store d'état (défaut: local .Leanna). */
  missionStore: DurableMissionStore;
  /** Gestionnaire de checkpoints (défaut: local .Leanna). */
  checkpoints: CheckpointManager;
  /** Moteur de preuve (défaut: local .Leanna). */
  evidence: EvidenceEngine;
  /**
   * Durée max d'une tentative du runner (ms). 0 = illimité (défaut).
   * Un dépassement est traité comme une tentative échouée (rollback + récup).
   */
  runnerTimeoutMs: number;
}

/** Résultat final d'une mission gouvernée. */
export interface SupervisedResult {
  missionId: string;
  finalState: MissionLifecycleState;
  attempts: number;
  evidence?: EvidenceBundle;
  /** True when every file changed by a failed attempt was restored. */
  rollbackComplete?: boolean;
  /** Files still differing from the pre-attempt snapshot after rollback retries. */
  residualFiles?: string[];
}

export class LeannaSupervisor {
  private readonly maxAttempts: number;
  private readonly store: DurableMissionStore;
  private readonly checkpoints: CheckpointManager;
  private readonly evidence: EvidenceEngine;
  private readonly runnerTimeoutMs: number;

  constructor(config: Partial<SupervisorConfig> = {}) {
    this.maxAttempts = config.maxAttempts ?? 3;
    this.store = config.missionStore ?? new DurableMissionStore();
    this.checkpoints = config.checkpoints ?? new CheckpointManager();
    this.evidence = config.evidence ?? new EvidenceEngine();
    this.runnerTimeoutMs = config.runnerTimeoutMs ?? 0;
  }

  /** Persiste une transition et renvoie l'état atteint. */
  private advance(
    machine: MissionStateMachine,
    to: MissionLifecycleState,
    reason?: string
  ): MissionLifecycleState {
    const state = machine.transition(to, reason);
    this.store.save(machine);
    return state;
  }

  /**
   * Exécute une mission de bout en bout sous gouvernance. Le `runner` est le
   * moteur réel ; le Supervisor décide de l'état, des snapshots/rollbacks, de la
   * preuve et de la récupération.
   */
  async runMission(params: {
    missionId: string;
    goal: string;
    runner: MissionRunner;
    /**
     * Fichiers susceptibles d'être modifiés, connus AVANT l'exécution. Ils sont
     * snapshottés avant que le runner n'agisse, ce qui permet un rollback fidèle
     * à l'état antérieur. Fortement recommandé pour toute mission à effet de bord.
     */
    plannedFiles?: string[];
    /** Hooks optionnels de gouvernance (pause / approbation humaine). */
    hooks?: SupervisorGovernanceHooks;
    /** Resolve relative tool paths to the exact workspace targets used by writers. */
    resolveWriteTargets?: (toolName: string, args: Record<string, unknown>) => string[];
  }): Promise<SupervisedResult> {
    const { missionId, goal, runner } = params;
    const hooks = params.hooks ?? {};

    // ── Rechargement d'état (audit, point 5) ────────────────────────────────
    // Si une machine a déjà été persistée pour cette mission (reprise après
    // crash/redémarrage), on la restaure au lieu d'en recréer une neuve.
    const machine = this.loadOrCreate(missionId);

    // Déjà terminale : rien à relancer, on renvoie l'état final tel quel.
    if (machine.isTerminal()) {
      return { missionId, finalState: machine.current, attempts: 0 };
    }

    // Ramener la machine à READY depuis n'importe quel état repris, par des
    // transitions légales (une reprise peut arriver en RUNNING/VERIFYING/… après
    // un crash). On ne refait PLANNING que si on n'y est pas déjà passé.
    this.ensureReady(machine);

    let attempt = 0;
    let lastEvidence: EvidenceBundle | undefined;
    let rollbackResidualFiles: string[] = [];

    while (attempt < this.maxAttempts) {
      attempt++;

      // Entrer dans l'état RUNNING : c'est depuis RUNNING que la machine peut
      // légalement basculer vers WAITING_APPROVAL ou PAUSED (ces états sont des
      // sous-états d'une mission en vol, cf. table de transitions).
      this.advance(machine, "RUNNING", `attempt ${attempt}`);

      // ── Gouvernance humaine (audit, point 5 : PAUSED / WAITING_APPROVAL) ───
      // Approbation requise avant d'agir ?
      if (hooks.needsApproval && (await hooks.needsApproval({ missionId, goal, attempt }))) {
        this.advance(machine, "WAITING_APPROVAL", "approval required");
        const approved = hooks.awaitApproval
          ? await hooks.awaitApproval({ missionId, goal, attempt })
          : false;
        if (!approved) {
          this.safeAdvance(machine, "ESCALATED", "approval refused");
          return { missionId, finalState: machine.current, attempts: attempt, evidence: lastEvidence, rollbackComplete: rollbackResidualFiles.length === 0, residualFiles: rollbackResidualFiles };
        }
        // Approuvé → repartir vers RUNNING (WAITING_APPROVAL → RUNNING est légal).
        this.advance(machine, "RUNNING", `attempt ${attempt} (approved)`);
      } else if (hooks.shouldPause && (await hooks.shouldPause({ missionId, goal, attempt }))) {
        // Pause demandée avant d'agir ?
        this.advance(machine, "PAUSED", "paused before attempt");
        if (hooks.awaitResume) await hooks.awaitResume({ missionId, goal, attempt });
        // PAUSED → READY → RUNNING (transitions légales).
        this.advance(machine, "READY", "resumed");
        this.advance(machine, "RUNNING", `attempt ${attempt} (resumed)`);
      }

      // PREPARE + SNAPSHOT : on capture l'état AVANT que le runner n'agisse, afin
      // qu'un rollback restaure réellement l'état antérieur (et non un état déjà
      // modifié par cette tentative). Les moteurs qui découvrent les fichiers en
      // cours de route peuvent en déclarer d'autres au tour suivant ; le
      // checkpoint couvre au moins les fichiers annoncés via `plannedFiles`.
      const checkpoint = this.checkpoints.snapshot(params.plannedFiles ?? [], {
        missionId,
        label: `attempt-${attempt}`,
      });

      // Exécution bornée par un timeout optionnel. Un dépassement ou une
      // exception sont traités comme une tentative échouée.
      const beforeToolCall = async (toolName: string, args: Record<string, unknown>) => {
        const targets = params.resolveWriteTargets?.(toolName, args) ?? [];
        if (toolName === "rename_project_file" && targets.length >= 2) {
          this.checkpoints.captureRename(checkpoint.id, targets[0], targets[1]);
          return;
        }
        for (const target of targets) {
          this.checkpoints.capturePath(checkpoint.id, target);
        }
      };
      const outcome = await this.runAttempt(runner, { missionId, goal, attempt, beforeToolCall });

      // VERIFY : la PREUVE prime sur ce que le runner "dit".
      this.advance(machine, "VERIFYING", "evaluate evidence");

      // ── try/finally (audit, point 5) ──────────────────────────────────────
      // Un échec de evidence.record / commit / rollback ne doit JAMAIS laisser
      // la machine coincée dans un état transitoire (VERIFYING/COMMITTING/
      // RECOVERING). On capture toute exception pour basculer proprement en
      // FAILED et persister.
      try {
        const bundle = this.evidence.record({
          missionId,
          goal,
          ...(outcome.evidence ?? {}),
        });
        lastEvidence = bundle;

        const proven = bundle.passed && outcome.success;

        if (proven) {
          // COMMIT : on fige le checkpoint (rollback désormais interdit).
          this.advance(machine, "COMMITTING", "evidence establishes success");
          this.checkpoints.commit(checkpoint.id);
          this.advance(machine, "COMPLETED", "committed");
          return { missionId, finalState: machine.current, attempts: attempt, evidence: bundle };
        }

        // ÉCHEC → RECOVER. On annule les effets de cette tentative (rollback des
        // fichiers déclarés) avant de décider de la suite.
        this.advance(machine, "RECOVERING", outcome.error ?? "evidence failed");
        this.checkpoints.rollback(checkpoint.id);
        rollbackResidualFiles = this.checkpoints.changedFiles(checkpoint.id);
        if (rollbackResidualFiles.length > 0) {
          throw new Error(`Rollback incomplet : ${rollbackResidualFiles.join(", ")}`);
        }

        const decision = this.decideRecovery(outcome, attempt);

        if (decision === "escalate" || attempt >= this.maxAttempts) {
          this.advance(machine, "ESCALATED", `recovery=${decision}, attempts=${attempt}`);
          return { missionId, finalState: machine.current, attempts: attempt, evidence: bundle, rollbackComplete: true, residualFiles: [] };
        }

        // retry / repair / replan → on ramène la machine à READY, d'où le prochain
        // tour de boucle transitera légalement vers RUNNING. Un replan matérialise
        // le changement de stratégie en repassant explicitement par PLANNING.
        if (decision === "replan") {
          this.advance(machine, "PLANNING", "replan after failure");
          this.advance(machine, "READY", "new plan ready");
        } else {
          this.advance(machine, "READY", `recovery=${decision}, ready to retry`);
        }
      } catch (err) {
        // Rollback best-effort pour ne pas laisser d'effets de bord orphelins.
        try {
          this.checkpoints.rollback(checkpoint.id);
        } catch {
          /* Une nouvelle tentative peut encore restaurer les fichiers restants. */
        }
        try {
          rollbackResidualFiles = this.checkpoints.changedFiles(checkpoint.id);
        } catch {
          rollbackResidualFiles = ["<état du checkpoint indisponible>"];
        }
        // Transition de secours vers FAILED (toujours légale depuis les états
        // transitoires), avec persistance garantie.
        this.safeAdvance(machine, "FAILED", `supervisor error: ${(err as Error).message}`);
        return { missionId, finalState: machine.current, attempts: attempt, evidence: lastEvidence, rollbackComplete: rollbackResidualFiles.length === 0, residualFiles: rollbackResidualFiles };
      }
    }

    // Sécurité : sortie de boucle sans succès → escalade.
    if (!machine.isTerminal()) {
      this.safeAdvance(machine, "ESCALATED", "max attempts exhausted");
    }
    return { missionId, finalState: machine.current, attempts: attempt, evidence: lastEvidence };
  }

  /**
   * Restaure la machine persistée pour `missionId`, ou en crée une neuve
   * (persistée immédiatement). (Audit, point 5 : le Supervisor créait toujours
   * une machine neuve et ne rechargeait jamais l'état sauvegardé.)
   */
  private loadOrCreate(missionId: string): MissionStateMachine {
    const restored = this.store.load(missionId);
    if (restored) return restored;
    const machine = new MissionStateMachine(missionId);
    this.store.save(machine);
    return machine;
  }

  /**
   * Amène une machine (fraîche ou reprise) jusqu'à `READY` par des transitions
   * légales, quel que soit l'état d'entrée après une reprise.
   */
  private ensureReady(machine: MissionStateMachine): void {
    const guard = new Set<MissionLifecycleState>();
    while (machine.current !== "READY" && !machine.isTerminal()) {
      const from = machine.current;
      if (guard.has(from)) break; // garde-fou anti-boucle
      guard.add(from);

      switch (from) {
        case "CREATED":
          this.advance(machine, "PLANNING", "understand goal");
          break;
        case "PLANNING":
          this.advance(machine, "READY", "plan ready");
          break;
        case "RUNNING":
        case "VERIFYING":
          // Reprise en plein vol : repasser par RECOVERING puis READY.
          this.safeAdvance(machine, "RECOVERING", "resume after interruption");
          this.advance(machine, "READY", "recovered to ready");
          break;
        case "RECOVERING":
          this.advance(machine, "READY", "recovered to ready");
          break;
        case "WAITING_APPROVAL":
        case "PAUSED":
          this.advance(machine, "READY", "resume to ready");
          break;
        case "COMMITTING":
          // Reprise en plein commit : on retente proprement.
          this.safeAdvance(machine, "RECOVERING", "resume mid-commit");
          this.advance(machine, "READY", "recovered to ready");
          break;
        default:
          return;
      }
    }
  }

  /**
   * Exécute une tentative du runner avec un timeout optionnel. Un dépassement
   * déclenche un `AbortSignal` (transmis au runner) et renvoie un échec. Une
   * exception du runner est aussi convertie en échec (jamais propagée).
   */
  private async runAttempt(
    runner: MissionRunner,
    ctx: { missionId: string; goal: string; attempt: number; beforeToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<void> }
  ): Promise<RunnerOutcome> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (this.runnerTimeoutMs > 0) {
        const timeout = new Promise<RunnerOutcome>((resolve) => {
          timer = setTimeout(() => {
            try { controller.abort(new Error("runner timeout")); } catch { /* best-effort */ }
            resolve({ success: false, error: `runner timeout after ${this.runnerTimeoutMs}ms` });
          }, this.runnerTimeoutMs);
          if (typeof timer.unref === "function") timer.unref();
        });
        return await Promise.race([
          runner({ ...ctx, signal: controller.signal }),
          timeout,
        ]);
      }
      return await runner({ ...ctx, signal: controller.signal });
    } catch (err) {
      return { success: false, error: (err as Error).message };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Transition « de secours » : tente `machine.transition`, mais n'échoue
   * jamais si la cible est illégale depuis l'état courant (on persiste quand
   * même l'état actuel). Utilisé pour les basculements d'erreur FAILED/ESCALATED
   * qui doivent toujours aboutir.
   */
  private safeAdvance(
    machine: MissionStateMachine,
    to: MissionLifecycleState,
    reason?: string
  ): void {
    try {
      if (machine.canTransition(to)) {
        machine.transition(to, reason);
      }
    } finally {
      try { this.store.save(machine); } catch { /* persistance best-effort */ }
    }
  }

  /**
   * Décision de récupération à quatre niveaux (audit §17). Respecte la
   * suggestion du runner si fournie, sinon applique une escalade progressive :
   * les premières tentatives réessaient/réparent, la dernière escalade.
   */
  private decideRecovery(outcome: RunnerOutcome, attempt: number): RecoveryDecision {
    if (outcome.suggestedRecovery) return outcome.suggestedRecovery;
    if (attempt >= this.maxAttempts) return "escalate";
    if (attempt === 1) return "retry";
    return "replan";
  }
}

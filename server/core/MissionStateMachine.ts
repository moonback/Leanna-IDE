/**
 * core/MissionStateMachine.ts — P0.2 : machine à états durable de mission.
 *
 * L'audit (§21 P0.2) exige un état de mission persistant et RICHE :
 *   CREATED → PLANNING → READY → RUNNING → VERIFYING → RECOVERING →
 *   WAITING_APPROVAL → PAUSED → COMMITTING → COMPLETED / FAILED /
 *   ESCALATED / CANCELLED
 *
 * Le champ `MissionState.status` existant (server/mission/types.ts) réutilise
 * `GoalStatus` (6 valeurs). On NE le modifie PAS : cette machine est une couche
 * ADDITIVE, séparée, avec ses propres états et des transitions VALIDÉES (toute
 * transition illégale lève une erreur). Un mapping optionnel vers `GoalStatus`
 * est fourni pour l'affichage/compatibilité.
 */

/** États durables du cycle de vie d'une mission (audit §21 P0.2). */
export type MissionLifecycleState =
  | "CREATED"
  | "PLANNING"
  | "READY"
  | "RUNNING"
  | "VERIFYING"
  | "RECOVERING"
  | "RECOVERY_REQUIRED"
  | "WAITING_APPROVAL"
  | "PAUSED"
  | "COMMITTING"
  | "COMPLETED"
  | "FAILED"
  | "ESCALATED"
  | "CANCELLED";

/** États terminaux : aucune transition sortante autorisée. */
export const TERMINAL_STATES: ReadonlySet<MissionLifecycleState> = new Set([
  "COMPLETED",
  "FAILED",
  "ESCALATED",
  "CANCELLED",
]);

/**
 * Transitions autorisées. Toute paire absente est illégale.
 * `CANCELLED` est atteignable depuis tout état non terminal (annulation user).
 */
const TRANSITIONS: Readonly<Record<MissionLifecycleState, readonly MissionLifecycleState[]>> = {
  CREATED: ["PLANNING", "CANCELLED", "RECOVERY_REQUIRED"],
  PLANNING: ["READY", "FAILED", "ESCALATED", "CANCELLED", "RECOVERY_REQUIRED"],
  READY: ["RUNNING", "PAUSED", "CANCELLED", "RECOVERY_REQUIRED"],
  RUNNING: ["VERIFYING", "RECOVERING", "WAITING_APPROVAL", "PAUSED", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"],
  VERIFYING: ["COMMITTING", "RECOVERING", "RUNNING", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"],
  RECOVERING: ["RUNNING", "READY", "PLANNING", "RECOVERY_REQUIRED", "ESCALATED", "FAILED", "CANCELLED"],
  RECOVERY_REQUIRED: ["RECOVERING", "ESCALATED", "CANCELLED"],
  WAITING_APPROVAL: ["RUNNING", "PAUSED", "ESCALATED", "CANCELLED", "RECOVERY_REQUIRED"],
  PAUSED: ["RUNNING", "READY", "CANCELLED", "RECOVERY_REQUIRED"],
  COMMITTING: ["COMPLETED", "RECOVERING", "RECOVERY_REQUIRED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  ESCALATED: [],
  CANCELLED: [],
};

/** Une transition enregistrée (piste d'audit du cycle de vie). */
export interface MissionTransition {
  from: MissionLifecycleState;
  to: MissionLifecycleState;
  at: string;
  reason?: string;
}

/** Snapshot sérialisable de l'état durable d'une mission. */
export interface MissionAttemptContext {
  attempt: number;
  checkpointId: string;
  phase: "prepared" | "executing" | "verifying" | "committing" | "rolling_back";
  updatedAt: string;
}

export interface MissionLifecycleSnapshot {
  missionId: string;
  state: MissionLifecycleState;
  createdAt: string;
  updatedAt: string;
  history: MissionTransition[];
  activeAttempt?: MissionAttemptContext;
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: MissionLifecycleState,
    readonly to: MissionLifecycleState
  ) {
    super(`Transition illégale : ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/** Mapping optionnel vers le GoalStatus legacy (affichage/compat uniquement). */
export function toGoalStatus(
  state: MissionLifecycleState
): "pending" | "in_progress" | "blocked" | "completed" | "failed" | "cancelled" {
  switch (state) {
    case "CREATED":
    case "PLANNING":
    case "READY":
      return "pending";
    case "RUNNING":
    case "VERIFYING":
    case "RECOVERING":
    case "COMMITTING":
      return "in_progress";
    case "RECOVERY_REQUIRED":
    case "WAITING_APPROVAL":
    case "PAUSED":
    case "ESCALATED":
      return "blocked";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
  }
}

/**
 * Machine à états d'une seule mission. Réentrante et pure (aucune I/O) : la
 * persistance est assurée par `DurableMissionStore`, qui appelle `snapshot()`
 * après chaque transition.
 */
export class MissionStateMachine {
  private state: MissionLifecycleState;
  private readonly history: MissionTransition[];
  private readonly createdAt: string;
  private updatedAt: string;
  private activeAttempt?: MissionAttemptContext;

  constructor(
    readonly missionId: string,
    initial: MissionLifecycleState = "CREATED",
    restored?: Pick<MissionLifecycleSnapshot, "createdAt" | "updatedAt" | "history" | "activeAttempt">
  ) {
    this.state = initial;
    this.history = restored?.history ? [...restored.history] : [];
    this.createdAt = restored?.createdAt ?? new Date().toISOString();
    this.updatedAt = restored?.updatedAt ?? this.createdAt;
    this.activeAttempt = restored?.activeAttempt ? { ...restored.activeAttempt } : undefined;
  }

  /** Restaure une machine depuis un snapshot durable (reprise après crash). */
  static fromSnapshot(snapshot: MissionLifecycleSnapshot): MissionStateMachine {
    return new MissionStateMachine(snapshot.missionId, snapshot.state, {
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      history: snapshot.history,
      activeAttempt: snapshot.activeAttempt,
    });
  }

  get current(): MissionLifecycleState {
    return this.state;
  }

  isTerminal(): boolean {
    return TERMINAL_STATES.has(this.state);
  }

  /** Indique si une transition est autorisée sans lever d'erreur. */
  canTransition(to: MissionLifecycleState): boolean {
    return TRANSITIONS[this.state].includes(to);
  }

  /**
   * Applique une transition. Lève `IllegalTransitionError` si elle n'est pas
   * autorisée (un état terminal n'a aucune sortie). Retourne le nouvel état.
   */
  transition(to: MissionLifecycleState, reason?: string): MissionLifecycleState {
    if (!this.canTransition(to)) {
      throw new IllegalTransitionError(this.state, to);
    }
    const at = new Date().toISOString();
    this.history.push({ from: this.state, to, at, reason });
    this.state = to;
    this.updatedAt = at;
    return this.state;
  }

  /** Persiste le contexte transactionnel courant sans transition métier. */
  setActiveAttempt(context?: MissionAttemptContext): void {
    this.activeAttempt = context ? { ...context, updatedAt: new Date().toISOString() } : undefined;
    this.updatedAt = new Date().toISOString();
  }

  get currentAttempt(): MissionAttemptContext | undefined {
    return this.activeAttempt ? { ...this.activeAttempt } : undefined;
  }

  /** Produit un snapshot sérialisable de l'état courant. */
  snapshot(): MissionLifecycleSnapshot {
    return {
      missionId: this.missionId,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      history: [...this.history],
      ...(this.activeAttempt ? { activeAttempt: { ...this.activeAttempt } } : {}),
    };
  }
}

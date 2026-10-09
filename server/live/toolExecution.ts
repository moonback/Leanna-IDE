/**
 * toolExecution — Exécution non bloquante des tool calls de la session Gemini Live.
 *
 * Objectif : un outil lent ne doit plus geler la voix de Leanna.
 *
 * Trois modes de livraison (variable d'env LEANNA_LIVE_TOOL_MODE) :
 *   - blocking    : exécution parallèle, mais la voix attend tous les résultats
 *                   (comportement « ancien », avec en plus parallélisme + annulation).
 *   - ack (défaut): après un délai (LEANNA_LIVE_TOOL_ACK_MS, 1500 ms), si un outil
 *                   long tourne encore, on bascule la session en « arrière-plan » :
 *                   on renvoie un ack `status:"running"` au modèle pour qu'il reprenne
 *                   la parole, et le vrai résultat arrive plus tard en texte.
 *   - nonblocking : les outils longs sont déclarés `behavior: NON_BLOCKING` côté
 *                   Gemini (le modèle gère nativement l'asynchronisme).
 *
 * Ce module est volontairement sans dépendance au reste du handler : il expose
 * des primitives pures (course avec abort/deadline, sommeil annulable, tracker
 * d'appels) et des helpers de décision, testables isolément.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToolDeliveryMode = 'blocking' | 'ack' | 'nonblocking';

/** Scheduling renseigné à la racine et dans la réponse d'un functionResponse. */
export interface ToolScheduling {
  scheduling: 'INTERRUPT' | 'WHEN_IDLE' | 'SILENT';
}

/** Un appel d'outil suivi par le tracker (pour annulation / fermeture). */
export interface TrackedToolCall {
  id: string;
  name: string;
  controller: AbortController;
  startedAt: number;
}

// ─── Erreur d'annulation ──────────────────────────────────────────────────────

/**
 * Jetée (ou résolue en valeur de rejet) quand un appel d'outil est annulé via
 * son AbortSignal — soit par Gemini (toolCallCancellation), soit à la fermeture
 * de la connexion client / session Gemini.
 */
export class ToolCancelledError extends Error {
  readonly reason: string;
  constructor(reason = 'cancelled') {
    super(`Tool cancelled: ${reason}`);
    this.name = 'ToolCancelledError';
    this.reason = reason;
  }
}

// ─── Catalogue des outils ─────────────────────────────────────────────────────

/**
 * Outils potentiellement longs. En mode `ack`, ce sont eux qui peuvent basculer
 * en arrière-plan ; en mode `nonblocking`, ce sont eux qu'on déclare NON_BLOCKING.
 * Les autres outils (rapides) ne basculent jamais : on attend toujours leur
 * résultat, car la bascule n'apporterait que de la latence de coordination.
 */
export const LONG_RUNNING_TOOLS = new Set<string>([
  'generate_codebase_markdown',
  'security_audit',
  'graphify_update',
  'graphify_reindex',
  'knowledge_reindex',
  'knowledge_build_context',
  'knowledge_impact_analyze',
  'mission_create',
  'agent_delegate',
  'agent_orchestrate',
  'agent_negotiate',
  'project_scaffold',
  'run_project_command',
  'browser_research',
  'browser_summarize_page',
  'create_rich_document',
  'generate_image',
]);

/**
 * Outils lents EXCLUS du retry automatique : un échec après une longue exécution
 * ne doit pas être ré-exécuté (coût prohibitif, et l'erreur est rarement
 * transiente à ce stade). Les outils rapides conservent leur retry habituel.
 */
export const SLOW_TOOLS_NO_RETRY = new Set<string>([
  'generate_codebase_markdown',
  'security_audit',
  'graphify_update',
  'graphify_reindex',
  'knowledge_reindex',
  'mission_create',
  'agent_delegate',
  'agent_orchestrate',
  'project_scaffold',
  'run_project_command',
  'browser_research',
]);

// ─── Lecture de la configuration (env) ────────────────────────────────────────

/** Mode de livraison des tool calls. Valeur invalide → `ack` (défaut sûr). */
export function getToolDeliveryMode(): ToolDeliveryMode {
  const raw = (process.env.LEANNA_LIVE_TOOL_MODE ?? '').trim().toLowerCase();
  if (raw === 'blocking' || raw === 'ack' || raw === 'nonblocking') return raw;
  return 'ack';
}

/** Délai (ms) avant bascule en arrière-plan en mode `ack`. Défaut 1500 ms. */
export function getAckAfterMs(): number {
  const raw = Number(process.env.LEANNA_LIVE_TOOL_ACK_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 1500;
}

// ─── Primitives de course (abort / deadline) ──────────────────────────────────

/**
 * Course entre une promesse de travail et l'annulation portée par `signal`.
 * Rejette avec `ToolCancelledError` dès que le signal est abort, sans attendre
 * la fin du travail (qui continue en arrière-plan, hors de notre contrôle).
 */
export function raceWithAbort<T>(work: Promise<T>, signal: AbortSignal, reason = 'aborted'): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new ToolCancelledError(reason));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(new ToolCancelledError(reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/** Sentinelle résolue par `raceWithDeadline` quand le délai expire avant le travail. */
export const DEADLINE_REACHED = Symbol('deadline_reached');

/**
 * Course entre une promesse de travail et un délai `ms`.
 * - Si le travail finit avant : `{ timedOut: false, value }`.
 * - Si le délai expire avant : `{ timedOut: true }` — le travail continue en
 *   arrière-plan (il n'est PAS annulé ici ; c'est au tracker de décider).
 * Un `signal` optionnel permet de nettoyer le timer si l'appel est annulé.
 */
export function raceWithDeadline<T>(
  work: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true });
    }, ms);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new ToolCancelledError('aborted'));
    };
    if (signal) {
      if (signal.aborted) {
        settled = true;
        clearTimeout(timer);
        reject(new ToolCancelledError('aborted'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve({ timedOut: false, value });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * `setTimeout` annulable : rejette avec `ToolCancelledError` si `signal` est
 * abort pendant l'attente. Utilisé pour le backoff entre retries, afin qu'un
 * retry en attente soit interrompu immédiatement à l'annulation.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ToolCancelledError('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ToolCancelledError('aborted'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── Tracker d'appels d'outils ─────────────────────────────────────────────────

/**
 * Suit les appels d'outils en cours pour une connexion, afin de pouvoir les
 * annuler (Gemini `toolCallCancellation`) ou les stopper en masse à la fermeture
 * de la session. Chaque appel reçoit un AbortController dont le signal est passé
 * au contexte de l'outil (`context.signal`) ; les handlers qui le lisent peuvent
 * interrompre réellement leur travail.
 */
export class ToolCallTracker {
  private readonly calls = new Map<string, TrackedToolCall>();
  private closed = false;
  private closeReason: string | null = null;

  /** Enregistre un nouvel appel et renvoie son AbortController. */
  register(id: string, name: string): AbortController {
    const controller = new AbortController();
    // Si le tracker est déjà fermé, l'appel naît annulé.
    if (this.closed) {
      controller.abort();
      return controller;
    }
    this.calls.set(id, { id, name, controller, startedAt: Date.now() });
    return controller;
  }

  /** Retire un appel terminé (succès, erreur ou annulation). */
  complete(id: string): void {
    this.calls.delete(id);
  }

  /** Vrai si l'appel est encore suivi (ni terminé ni annulé). */
  has(id: string): boolean {
    return this.calls.has(id);
  }

  /** Nombre d'appels actuellement en cours. */
  get size(): number {
    return this.calls.size;
  }

  /**
   * Annule les appels dont l'id figure dans `ids`. Renvoie la liste des ids
   * réellement annulés (ceux qui étaient encore en cours).
   */
  cancel(ids: string[], reason = 'gemini_cancellation'): string[] {
    const cancelled: string[] = [];
    for (const id of ids) {
      const call = this.calls.get(id);
      if (call) {
        call.controller.abort();
        this.calls.delete(id);
        cancelled.push(id);
      }
    }
    void reason;
    return cancelled;
  }

  /** Annule TOUS les appels en cours et scelle le tracker (fermeture). */
  close(reason = 'closed'): string[] {
    this.closed = true;
    this.closeReason = reason;
    const ids = [...this.calls.keys()];
    for (const call of this.calls.values()) {
      call.controller.abort();
    }
    this.calls.clear();
    return ids;
  }

  isClosed(): boolean {
    return this.closed;
  }

  getCloseReason(): string | null {
    return this.closeReason;
  }
}

// ─── Résumé des résultats pour notification en arrière-plan ─────────────────────

/**
 * Borne un résultat d'outil de fond avant de l'annoncer au modèle en texte.
 * Les gros résultats (ex. generate_codebase_markdown) sont tronqués à
 * `maxChars` (défaut 4000) avec un marqueur explicite. Toujours une string.
 */
export function summarizeForNotify(result: unknown, maxChars = 4000): string {
  let text: string;
  try {
    text = typeof result === 'string' ? result : JSON.stringify(result);
  } catch {
    text = String(result);
  }
  if (text.length <= maxChars) return text;
  return (
    text.slice(0, maxChars) +
    `\n\n[…résultat tronqué : ${text.length} caractères réduits à ${maxChars}. ` +
    `Annonce l'essentiel ; propose de détailler si besoin.]`
  );
}

// ─── Ack (bascule en arrière-plan) ──────────────────────────────────────────────

/**
 * Construit la réponse `status:"running"` renvoyée au modèle quand un appel
 * bascule en arrière-plan (mode `ack`). Le modèle doit l'interpréter comme
 * « l'outil continue, je reprends la parole et j'annoncerai le résultat plus
 * tard » (cf. instruction système).
 */
export function buildAckResponse(call: { id: string; name: string }): {
  id: string;
  name: string;
  response: Record<string, unknown>;
} {
  return {
    id: call.id,
    name: call.name,
    response: {
      status: 'running',
      background: true,
      message:
        `L'outil "${call.name}" continue en arrière-plan. ` +
        `Dis en une phrase que tu t'en occupes puis poursuis la conversation ; ` +
        `n'invente jamais le résultat. Il arrivera dans un message [BACKGROUND TASK UPDATE].`,
    },
  };
}

// ─── Scheduling (position du champ selon la version de @google/genai) ──────────

/**
 * Renseigne le champ `scheduling` à la racine ET dans `response`, pour couvrir
 * les variantes de @google/genai (certaines versions le lisent à la racine du
 * functionResponse, d'autres dans la payload de réponse).
 */
export function withScheduling<T extends { response?: Record<string, unknown> }>(
  functionResponse: T,
  scheduling: ToolScheduling['scheduling'],
): T & ToolScheduling & { response: Record<string, unknown> } {
  const response = { ...(functionResponse.response ?? {}), scheduling };
  return { ...functionResponse, scheduling, response };
}

// ─── Déclarations d'outils : comportement NON_BLOCKING (mode nonblocking) ───────

/**
 * Applique le comportement NON_BLOCKING aux déclarations d'outils longs, en mode
 * `nonblocking` uniquement. En modes `ack` (défaut) et `blocking`, les
 * déclarations sont renvoyées INTACTES.
 *
 * Le champ `behavior: 'NON_BLOCKING'` est ajouté sur chaque déclaration d'outil
 * figurant dans `LONG_RUNNING_TOOLS`. Si gemini-3.8-live rejette ce champ au
 * setup, il suffit de repasser en mode `ack`.
 */
export function applyToolBehavior(
  declarations: any[],
  mode: ToolDeliveryMode,
): any[] {
  if (mode !== 'nonblocking') return declarations;
  return declarations.map((d) => {
    if (!d || typeof d.name !== 'string') return d;
    if (!LONG_RUNNING_TOOLS.has(d.name)) return d;
    return { ...d, behavior: 'NON_BLOCKING' };
  });
}

/**
 * postEditValidator.ts — Validation automatique post-édition.
 *
 * Après une série de modifications par l'IA (debounce 2s), lance automatiquement
 * `tsc --noEmit` et notifie les clients du résultat.
 * Permet de détecter rapidement si une modification a cassé le build.
 */

import { validateBuild } from "./checkpoint.js";
import { supervisor } from "../autonomy/Supervisor.js";

// ── State ───────────────────────────────────────────────────────────────────

type NotifyFn = (data: any) => void;
const subscribers = new Set<NotifyFn>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let validationRunning = false;
let lastResult: (ValidationResult & { timestamp: number }) | null = null;

const DEBOUNCE_MS = 2500; // 2.5 secondes sans écriture → validation

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Enregistre un subscriber pour les notifications de validation.
 */
export function subscribeToValidation(notify: NotifyFn): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/**
 * Appelé après chaque écriture de fichier. Arme le debounce.
 * Si `enabled` est false (toggle dans safeguards), ne fait rien.
 */
export function scheduleValidation(enabled = true, validationSupervisor = supervisor): void {
  if (!enabled) return;
  if (validationRunning) return; // ne pas interrompre une validation en cours

  // Reset le timer
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    await runValidation(validationSupervisor);
  }, DEBOUNCE_MS);
}

/** Résultat enrichi d'une validation : build + directive corrective du Superviseur. */
export interface ValidationResult {
  valid: boolean;
  errors?: string;
  /** True si le Superviseur juge qu'une correction est nécessaire. */
  needsCorrection?: boolean;
  /**
   * Directive corrective structurée produite par le Superviseur
   * (anti-boucle / pivot / escalade). Toujours fournie en cas d'échec de build,
   * que l'injecteur de session soit câblé ou non — ainsi la boucle agentique
   * peut la consommer même hors session Gemini Live.
   */
  directive?: string;
}

/**
 * Force une validation immédiate (utile pour le bouton UI).
 */
export async function runValidation(validationSupervisor = supervisor): Promise<ValidationResult> {
  if (validationRunning) {
    return lastResult || { valid: true };
  }

  validationRunning = true;
  notifyAll({ type: 'build-status', status: 'running' });

  try {
    const result = await validateBuild();

    const evaluation = await validationSupervisor.evaluateBuildResult(result);
    // L'injection vers une session Gemini Live reste best-effort (no-op si aucun
    // injecteur n'est câblé — cas du runtime agentique pur).
    if (evaluation.needsCorrection && evaluation.directive) {
      validationSupervisor.injectDirective(evaluation.directive);
    }

    const enriched: ValidationResult = {
      ...result,
      needsCorrection: evaluation.needsCorrection,
      directive: evaluation.directive,
    };
    lastResult = { ...enriched, timestamp: Date.now() };

    notifyAll({
      type: 'build-status',
      status: result.valid ? 'pass' : 'fail',
      errors: result.errors,
      timestamp: Date.now(),
    });

    if (result.valid) {
      console.log('[PostEdit] ✓ Build valide après modifications');
    } else {
      console.warn('[PostEdit] ✗ Build échoué:', result.errors?.slice(0, 200));
    }

    return enriched;
  } catch (e: any) {
    const result: ValidationResult = { valid: false, errors: e.message };
    lastResult = { ...result, timestamp: Date.now() };
    notifyAll({ type: 'build-status', status: 'fail', errors: e.message });
    return result;
  } finally {
    validationRunning = false;
  }
}

/**
 * Retourne le dernier résultat de validation connu.
 */
export function getLastValidationResult() {
  return lastResult;
}

// ── Internal ────────────────────────────────────────────────────────────────

function notifyAll(data: any) {
  for (const notify of subscribers) {
    try { notify(data); } catch { /* ignore */ }
  }
  // Also dispatch as a window event for the StatusBar (via WebSocket → client)
  // This is handled by the server sending the event to all connected WS clients
}

/**
 * Calibration du bruit ambiant et porte « parole » pour la veille automatique.
 *
 * Échelle commune : la moyenne du spectre de l'analyser d'entrée (0–255),
 * c'est-à-dire la même mesure que `vadThreshold` et que `getInputAmplitude()*100`.
 */

export interface NoiseProfile {
  /** Niveau moyen du bruit ambiant mesuré. */
  floor: number;
  /** 95e centile du bruit ambiant (pics habituels de la pièce). */
  p95: number;
  /** Seuil au-dessus duquel un son peut compter comme de la parole. */
  threshold: number;
  /** Horodatage de la calibration (ms epoch). */
  calibratedAt: number;
}

/** Durée par défaut de la mesure du bruit ambiant (ms). */
export const DEFAULT_CALIBRATION_MS = 3000;
/** Nombre minimal d'échantillons pour une calibration fiable (~1 s à 30 i/s). */
export const MIN_CALIBRATION_SAMPLES = 30;
/** Au-delà, la pièce est trop bruyante : le seuil ne filtrerait plus rien d'utile. */
export const MAX_ACTIVITY_THRESHOLD = 80;
/** Marge ajoutée au-dessus des pics ambiants. */
const THRESHOLD_MARGIN = 8;
const THRESHOLD_RATIO = 1.25;

export type NoiseCalibrationErrorCode = 'not-enough-samples' | 'too-noisy' | 'unavailable';

export class NoiseCalibrationError extends Error {
  readonly code: NoiseCalibrationErrorCode;
  constructor(code: NoiseCalibrationErrorCode, message: string) {
    super(message);
    this.name = 'NoiseCalibrationError';
    this.code = code;
  }
}

/**
 * Calcule le profil de bruit à partir d'échantillons de silence.
 * Le seuil ne descend jamais sous `minThreshold` (le réglage VAD du profil).
 */
export function computeNoiseProfile(samples: number[], minThreshold: number, now = Date.now()): NoiseProfile {
  const clean = samples.filter(Number.isFinite);
  if (clean.length < MIN_CALIBRATION_SAMPLES) {
    throw new NoiseCalibrationError(
      'not-enough-samples',
      'Pas assez de mesures (fenêtre masquée ou micro inactif). Réessayez en gardant la fenêtre visible.',
    );
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const floor = clean.reduce((a, b) => a + b, 0) / clean.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const threshold = Math.max(minThreshold, p95 * THRESHOLD_RATIO + THRESHOLD_MARGIN);
  if (threshold > MAX_ACTIVITY_THRESHOLD) {
    throw new NoiseCalibrationError(
      'too-noisy',
      'Environnement trop bruyant pour distinguer la parole. Réduisez le bruit puis recalibrez.',
    );
  }
  return { floor, p95, threshold, calibratedAt: now };
}

export interface SpeechGateOptions {
  /** Durée continue au-dessus du seuil pour considérer qu'on parle (ms). */
  sustainMs?: number;
  /** Creux tolérés sous le seuil sans réinitialiser (syllabes, respiration). */
  gapToleranceMs?: number;
}

/**
 * Porte « parole » : un son ne compte comme activité que s'il reste au-dessus
 * du seuil pendant `sustainMs`. Les bruits brefs (clic, porte, toux) et le
 * bruit de fond stable sous le seuil sont ignorés.
 */
export function createSpeechGate({ sustainMs = 300, gapToleranceMs = 150 }: SpeechGateOptions = {}) {
  let aboveSince: number | null = null;
  let lastAbove = 0;
  return {
    /** Renvoie true si l'échantillon courant correspond à de la parole soutenue. */
    update(level: number, threshold: number, now: number): boolean {
      if (level > threshold) {
        if (aboveSince === null || now - lastAbove > gapToleranceMs) aboveSince = now;
        lastAbove = now;
        return now - aboveSince >= sustainMs;
      }
      if (aboveSince !== null && now - lastAbove > gapToleranceMs) aboveSince = null;
      return false;
    },
    reset() {
      aboveSince = null;
      lastAbove = 0;
    },
  };
}

const STORAGE_KEY = 'leanna-noise-profile';

export function loadNoiseProfile(): NoiseProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as NoiseProfile;
    return Number.isFinite(p?.threshold) ? p : null;
  } catch {
    return null;
  }
}

export function saveNoiseProfile(profile: NoiseProfile | null): void {
  try {
    if (profile) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* stockage indisponible : la calibration reste valable pour la session */
  }
}

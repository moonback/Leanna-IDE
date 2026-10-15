/**
 * quality.ts — choix du niveau de qualité de la scène 3D (plan §3.3).
 *
 *   high   : 4 000 particules, DPR ≤ 2, 60 fps actif
 *   medium : 1 500 particules, DPR ≤ 1,5
 *   low    : 400 particules, DPR 1, 30 fps max
 *   off    : pas de WebGL → fond CSS (AmbientBackdrop)
 *
 * Fonctions pures : la détection matérielle est faite par l'appelant
 * (detectCapabilities) pour rester testable.
 */

export type QualityTier = 'high' | 'medium' | 'low' | 'off';

/** Réglage utilisateur « Intensité visuelle » (Paramètres → Apparence). */
export type SceneIntensity = 'off' | 'sober' | 'standard' | 'cinematic';

export interface TierSettings {
  particles: number;
  maxDpr: number;
  /** Fréquence d'image au repos (aucune activité d'agent). */
  idleFps: number;
  /** Fréquence d'image pendant l'activité. */
  activeFps: number;
}

export const TIER_SETTINGS: Record<Exclude<QualityTier, 'off'>, TierSettings> = {
  high:   { particles: 4000, maxDpr: 2,   idleFps: 30, activeFps: 60 },
  medium: { particles: 1500, maxDpr: 1.5, idleFps: 24, activeFps: 45 },
  low:    { particles: 400,  maxDpr: 1,   idleFps: 15, activeFps: 30 },
};

export interface Capabilities {
  webgl2: boolean;
  /** Renderer GPU non masqué (WEBGL_debug_renderer_info), si disponible. */
  gpu?: string;
  cores: number;
  /** navigator.deviceMemory en Go (Chromium), si disponible. */
  memoryGB?: number;
  devicePixelRatio: number;
}

export interface TierInput {
  capabilities: Capabilities;
  intensity: SceneIntensity;
  reducedMotion: boolean;
  highContrast: boolean;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;
const INTEGRATED_GPU = /intel|uhd|iris|mali|adreno|powervr|apple m\d? ?gpu/i;

/** Niveau matériel maximal, indépendamment des préférences. */
export function hardwareTier(c: Capabilities): QualityTier {
  if (!c.webgl2) return 'off';
  if (c.gpu && SOFTWARE_GPU.test(c.gpu)) return 'off';
  if (c.cores <= 2 || (c.memoryGB !== undefined && c.memoryGB <= 2)) return 'low';
  if (c.gpu && INTEGRATED_GPU.test(c.gpu)) return 'medium';
  if (c.cores <= 4 || (c.memoryGB !== undefined && c.memoryGB <= 4)) return 'medium';
  return 'high';
}

const ORDER: QualityTier[] = ['off', 'low', 'medium', 'high'];
/** Le plus bas des deux niveaux. */
export const minTier = (a: QualityTier, b: QualityTier): QualityTier =>
  ORDER[Math.min(ORDER.indexOf(a), ORDER.indexOf(b))];

/** Plafond imposé par le réglage d'intensité. */
const INTENSITY_CAP: Record<SceneIntensity, QualityTier> = {
  off: 'off',
  sober: 'low',
  standard: 'medium',
  cinematic: 'high',
};

export function pickTier({ capabilities, intensity, reducedMotion, highContrast }: TierInput): QualityTier {
  if (highContrast) return 'off';
  let tier = minTier(hardwareTier(capabilities), INTENSITY_CAP[intensity]);
  // Mouvement réduit : la scène reste (fond statique lent) mais au plus bas niveau.
  if (reducedMotion) tier = minTier(tier, 'low');
  return tier;
}

/** Dégradation d'un cran si la fréquence mesurée est trop basse. */
export function downgradeForFps(tier: QualityTier, measuredFps: number): QualityTier {
  if (tier === 'off') return 'off';
  const target = TIER_SETTINGS[tier].idleFps;
  if (measuredFps >= target * 0.8) return tier;
  return ORDER[ORDER.indexOf(tier) - 1];
}

/** Détection navigateur (non testée unitairement : dépend du GPU réel). */
export function detectCapabilities(): Capabilities {
  let webgl2 = false;
  let gpu: string | undefined;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
      webgl2 = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* pas de WebGL */ }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    webgl2,
    gpu,
    cores: nav.hardwareConcurrency || 4,
    memoryGB: nav.deviceMemory,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

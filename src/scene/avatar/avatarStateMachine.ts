/**
 * avatarStateMachine — logique pure de l'avatar Leanna (phase 4).
 *
 * Reprend les 9 humeurs de la mascotte SVG (views/orb/Mascot.tsx) et ajoute
 * 3 humeurs liées aux missions : `point` (désigne une action), `alert`
 * (erreur) et `present` (fin de mission). Pour chaque humeur :
 *   - des poids d'expressions VRM (presets standard VRM 1.0) ;
 *   - une posture (inclinaison de tête, balancement, bras).
 *
 * Aucune dépendance à three.js : testable et partagé avec le repli 2D.
 */
import { moodFromStatus, type MascotMood } from '../../views/orb/Mascot.js';
import type { OrbStatus } from '../../hooks/useOrbState.js';

export type AvatarMood = MascotMood | 'point' | 'alert' | 'present';

export const AVATAR_MOODS: readonly AvatarMood[] = [
  'sleep', 'search', 'idle', 'listen', 'talk', 'think', 'muted', 'happy', 'celebrate', 'point', 'alert', 'present',
];

/** Presets d'expressions VRM 1.0 utilisés (les autres restent à 0). */
export type VrmExpression = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised' | 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'blink';

export type ExpressionWeights = Partial<Record<VrmExpression, number>>;

export interface AvatarSignals {
  status: OrbStatus;
  muted: boolean;
  hovered: boolean;
  /** Une tâche d'agent vient de réussir. */
  celebrate: boolean;
  /** Une tâche ou une mission vient d'échouer. */
  alert: boolean;
  /** Une mission vient de se terminer avec succès. */
  present: boolean;
  /** L'avatar doit désigner une action (pods du cockpit, phase 5). */
  pointing: boolean;
}

/**
 * Priorité : alerte > présentation > désignation > humeur de la voix.
 * Une erreur doit toujours se voir, même pendant que Leanna parle.
 */
export function moodFromSignals(s: AvatarSignals): AvatarMood {
  if (s.alert) return 'alert';
  if (s.present) return 'present';
  if (s.pointing) return 'point';
  return moodFromStatus(s.status, s.muted, s.hovered, s.celebrate);
}

export const MOOD_EXPRESSIONS: Record<AvatarMood, ExpressionWeights> = {
  sleep:     { relaxed: 0.7, blink: 1 },
  search:    { surprised: 0.25 },
  idle:      { relaxed: 0.25, happy: 0.1 },
  listen:    { happy: 0.2, relaxed: 0.15 },
  talk:      { happy: 0.25 },
  think:     { relaxed: 0.2, ou: 0.15 },
  muted:     { sad: 0.25 },
  happy:     { happy: 0.75 },
  celebrate: { happy: 1 },
  point:     { happy: 0.4 },
  alert:     { surprised: 0.55, angry: 0.15 },
  present:   { happy: 0.65, relaxed: 0.2 },
};

export interface AvatarPose {
  /** Inclinaison avant/arrière de la tête (rad, + = baisse). */
  headPitch: number;
  /** Inclinaison latérale de la tête (rad). */
  headRoll: number;
  /** Amplitude du balancement du buste (rad). */
  sway: number;
  /** Bras droit levé vers l'avant (0–1) : geste de désignation. */
  rightArmRaise: number;
  /** Les deux bras légèrement levés (0–1) : fête. */
  armsUp: number;
}

const BASE_POSE: AvatarPose = { headPitch: 0, headRoll: 0, sway: 0.02, rightArmRaise: 0, armsUp: 0 };

export const MOOD_POSES: Record<AvatarMood, AvatarPose> = {
  sleep:     { ...BASE_POSE, headPitch: 0.28, headRoll: 0.12, sway: 0.008 },
  search:    { ...BASE_POSE, headRoll: -0.08, sway: 0.03 },
  idle:      BASE_POSE,
  listen:    { ...BASE_POSE, headRoll: 0.1 },
  talk:      { ...BASE_POSE, sway: 0.03 },
  think:     { ...BASE_POSE, headPitch: -0.12, headRoll: -0.14 },
  muted:     { ...BASE_POSE, headPitch: 0.1 },
  happy:     { ...BASE_POSE, headRoll: 0.06, sway: 0.035 },
  celebrate: { ...BASE_POSE, headPitch: -0.08, sway: 0.06, armsUp: 1 },
  point:     { ...BASE_POSE, headRoll: -0.06, rightArmRaise: 1 },
  alert:     { ...BASE_POSE, headPitch: -0.05, sway: 0.01 },
  present:   { ...BASE_POSE, headRoll: 0.08, rightArmRaise: 0.45 },
};

/** Bulle de dialogue par défaut pour chaque humeur. */
export const MOOD_MESSAGES: Record<AvatarMood, string> = {
  sleep:     'En veille. Clique sur moi pour me réveiller.',
  search:    'Connexion en cours…',
  idle:      'Je suis Leanna ! Prête à accomplir tes missions.',
  listen:    'Je t’écoute…',
  talk:      'Je te réponds…',
  think:     'Je réfléchis…',
  muted:     'Micro coupé.',
  happy:     'Oui ? Que puis-je faire pour toi ?',
  celebrate: 'Tâche terminée !',
  point:     'C’est par ici.',
  alert:     'Un problème est survenu. Regarde les erreurs.',
  present:   'Mission accomplie, voici le résultat.',
};

/** Durées d'affichage des humeurs déclenchées par un événement (ms). */
export const EVENT_MOOD_MS = { celebrate: 2500, alert: 4000, present: 3500 } as const;

/**
 * Lip-sync à partir de l'amplitude de sortie (0–1) : ouverture de bouche
 * proportionnelle, voyelle qui varie lentement pour éviter l'effet « poupée ».
 */
export function lipSync(amp: number, t: number): ExpressionWeights {
  const open = Math.min(1, Math.max(0, (amp - 0.02) * 4));
  if (open <= 0) return {};
  const v = (Math.sin(t * 9.1) + Math.sin(t * 5.3 + 1.7)) * 0.25 + 0.5; // 0–1
  return {
    aa: open * (0.55 + 0.45 * v),
    oh: open * 0.4 * (1 - v),
    ee: open * 0.25 * v,
  };
}

/** Prochain clignement dans 2,5–6 s (rand injectable pour les tests). */
export function nextBlinkDelay(rand: () => number = Math.random): number {
  return 2500 + rand() * 3500;
}

/** Courbe d'un clignement de 150 ms : 0 → 1 → 0. */
export function blinkWeight(msSinceStart: number): number {
  const DURATION = 150;
  if (msSinceStart < 0 || msSinceStart > DURATION) return 0;
  return Math.sin((msSinceStart / DURATION) * Math.PI);
}

/** Amortissement exponentiel indépendant de la cadence. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/**
 * Combine humeur, lip-sync et clignement en poids finaux bornés à [0, 1].
 * Le lip-sync remplace les voyelles de l'humeur ; le clignement s'ajoute.
 */
export function combineExpressions(mood: AvatarMood, lips: ExpressionWeights, blink: number): ExpressionWeights {
  const out: ExpressionWeights = { ...MOOD_EXPRESSIONS[mood] };
  for (const [k, v] of Object.entries(lips) as [VrmExpression, number][]) out[k] = v;
  out.blink = Math.min(1, (out.blink ?? 0) + blink);
  for (const k of Object.keys(out) as VrmExpression[]) out[k] = Math.min(1, Math.max(0, out[k] ?? 0));
  return out;
}

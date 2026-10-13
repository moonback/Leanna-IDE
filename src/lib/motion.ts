/**
 * motion.ts — Presets d'animation partagés (motion/react).
 *
 * Miroir JS des tokens CSS de src/styles/motion-pro.css. Utiliser ces
 * presets plutôt que des valeurs littérales pour garder un rythme unique
 * dans toute l'app :
 *
 *   import { spring, pageVariants } from '@/src/lib/motion';
 *   <motion.div transition={spring.snappy} ... />
 *
 * Règles (UI/UX Pro Max §7) :
 *  - décélération à l'arrivée, accélération au départ ;
 *  - sortie ≈ 65 % de la durée d'entrée ;
 *  - uniquement transform / opacity (jamais de filter résiduel) ;
 *  - MotionConfig reducedMotion="user" (main.tsx) coupe les transforms
 *    quand l'OS demande une motion réduite.
 */
import type { Transition, Variants } from 'motion/react';

/** Courbes cubic-bezier (identiques aux variables CSS --ease-*) */
export const ease = {
  outExpo: [0.16, 1, 0.3, 1] as const,
  outQuart: [0.25, 1, 0.5, 1] as const,
  inQuart: [0.5, 0, 0.75, 0] as const,
  standard: [0.4, 0, 0.2, 1] as const,
};

/** Durées en secondes (identiques aux variables CSS --dur-*) */
export const duration = {
  instant: 0.09,
  fast: 0.14,
  base: 0.22,
  slow: 0.36,
  exit: 0.15,
};

/** Ressorts — à préférer pour tout ce qui suit une action directe de l'utilisateur. */
export const spring = {
  /** Micro-feedback (boutons, toggles, pastilles) */
  snappy: { type: 'spring', stiffness: 520, damping: 34, mass: 0.6 } satisfies Transition,
  /** Panneaux, modales, cartes */
  smooth: { type: 'spring', stiffness: 320, damping: 32, mass: 0.9 } satisfies Transition,
  /** Indicateurs partagés (layoutId) */
  layout: { type: 'spring', stiffness: 420, damping: 38 } satisfies Transition,
};

/**
 * Transition de page : montée à l'entrée, sortie plus courte vers le haut.
 * ⚠ Pas de `filter` ici : un filtre résiduel (même blur(0px)) sur un wrapper
 * crée un containing block et casse tous les menus `position: fixed` des vues.
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.995 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: duration.slow, ease: ease.outExpo },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: duration.exit, ease: ease.inQuart },
  },
};

/** Modale : apparition « depuis l'écran » avec un ressort doux. */
export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring.smooth },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: { duration: duration.exit, ease: ease.inQuart },
  },
};

/** Conteneur + enfants en cascade (listes, grilles de cartes). */
export const staggerContainer = (stagger = 0.04, delayChildren = 0.02): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren } },
});

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.outExpo } },
};

import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import {
  VISUAL_STATE_META,
  type AgentVisualState,
} from './visualState.js';
import { spriteFor } from './sprites.js';

/**
 * AgentVisualizer — Personnage pixel-art animé reflétant l'état de l'agent.
 *
 * Rend une spritesheet (frames horizontales) animée via CSS `steps()`. Pour un
 * état mono-frame (`frames === 1`), aucune animation n'est appliquée : l'image
 * s'affiche statiquement. Respecte `prefers-reduced-motion` (via la classe CSS
 * `.agent-sprite--animated`, neutralisée par la media query dans index.css, et
 * via `useReducedMotion` ici pour ne pas marquer l'élément comme animé).
 *
 * Purement présentationnel : reçoit `visualState` en prop, n'ouvre aucune
 * connexion. Le câblage temps réel est fait par le composant parent
 * (ex: FloatingOrb via useAgentStatus).
 */

export interface AgentVisualizerProps {
  /** État visuel à afficher. */
  visualState: AgentVisualState;
  /** Taille (px) du personnage carré. Défaut 48. */
  size?: number;
  /**
   * Libellé accessible. Défaut : le label FR de l'état. Fusionné dans
   * l'aria-label (« Leanna : <label> »).
   */
  label?: string;
  /** Classe CSS additionnelle. */
  className?: string;
}

export function AgentVisualizer({
  visualState,
  size = 48,
  label,
  className,
}: AgentVisualizerProps) {
  const reduceMotion = useReducedMotion();
  const meta = VISUAL_STATE_META[visualState];
  const sprite = spriteFor(visualState);

  const frames = Math.max(1, meta.frames);
  const animated = frames > 1 && !reduceMotion;
  const stateLabel = label ?? meta.label;

  const style: CSSProperties & Record<string, string | number> = {
    width: size,
    height: size,
    backgroundImage: `url(${sprite})`,
    // Variables CSS consommées par .agent-sprite / .agent-sprite--animated.
    '--agent-frames': frames,
    '--agent-duration': `${meta.durationMs}ms`,
  };

  const classes = [
    'agent-sprite',
    animated ? 'agent-sprite--animated' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="img"
      aria-label={`Leanna : ${stateLabel}`}
      data-visual-state={visualState}
      className={classes}
      style={style}
    />
  );
}

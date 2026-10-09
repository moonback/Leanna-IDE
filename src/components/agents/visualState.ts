/**
 * visualState — Source de vérité unique des états visuels de l'agent pixel-art.
 *
 * Les 5 états visuels sont une projection « lisible pour l'humain » des 8 états
 * sémantiques de `useAgentStatus` (AgentState). Ils pilotent l'animation du
 * personnage pixel-art rendu par `AgentVisualizer`.
 *
 * Mapping (voir PLAN_ACTION_INTEGRATION.md) :
 *   - IDLE      ← idle / completed / sleeping (repos)
 *   - THINKING  ← thinking / planning (réflexion / planification)
 *   - EDITING   ← executing avec un skill d'écriture (write|edit|create|modify)
 *   - SEARCHING ← executing avec un skill de recherche (search|read|grep|find…) / verifying
 *   - WAITING   ← waiting / blocked (attente d'input / anomalie)
 *
 * La fonction `toVisualState` est PURE : aucune dépendance React/DOM, ce qui la
 * rend trivialement testable et réutilisable côté serveur si besoin.
 */

import type { AgentState } from '../../hooks/useAgentStatus.js';

export type AgentVisualState = 'IDLE' | 'THINKING' | 'EDITING' | 'SEARCHING' | 'WAITING';

/** Toutes les valeurs possibles, pratique pour itérer dans les tests/stories. */
export const AGENT_VISUAL_STATES: readonly AgentVisualState[] = [
  'IDLE',
  'THINKING',
  'EDITING',
  'SEARCHING',
  'WAITING',
] as const;

export interface VisualStateMeta {
  /** Libellé lisible en français (affiché en aria-label / titre). */
  label: string;
  /**
   * Nombre de frames horizontales attendues dans la spritesheet de l'état.
   * `1` = image statique (pas d'animation de frames). Le composant tolère les
   * deux cas : avec 1 frame il n'applique aucune animation `steps()`.
   */
  frames: number;
  /** Durée d'un cycle d'animation complet, en millisecondes. */
  durationMs: number;
}

/**
 * Métadonnées par état. Les comptes de frames sont volontairement conservateurs
 * (les assets actuels sont des PNG mono-frame `char_*.png`, donc `frames: 1`).
 * Quand de vraies spritesheets multi-frames seront fournies, il suffira
 * d'augmenter `frames` ici — le composant s'adapte automatiquement.
 */
export const VISUAL_STATE_META: Record<AgentVisualState, VisualStateMeta> = {
  IDLE:      { label: 'Au repos',      frames: 1, durationMs: 1200 },
  THINKING:  { label: 'Réflexion',     frames: 1, durationMs: 900 },
  EDITING:   { label: 'Édition',       frames: 1, durationMs: 600 },
  SEARCHING: { label: 'Recherche',     frames: 1, durationMs: 800 },
  WAITING:   { label: 'En attente',    frames: 1, durationMs: 1000 },
};

/** Détecte un skill d'écriture/édition de fichiers. */
const EDIT_SKILL_RE = /write|edit|create|modify|append|replace|refactor/i;
/** Détecte un skill de recherche/lecture/consultation. */
const SEARCH_SKILL_RE = /search|read|grep|find|lecture|lookup|scan|inspect|browse/i;

/**
 * Convertit un `AgentState` (8 états sémantiques) en `AgentVisualState`
 * (5 états visuels). `skillHint` permet d'affiner la distinction EDITING vs
 * SEARCHING lorsque l'état sémantique est `executing`/`verifying`.
 *
 * Fonction pure, sans effet de bord. Tout état inconnu retombe sur IDLE.
 */
export function toVisualState(
  agentState: AgentState | string | undefined,
  skillHint?: string,
): AgentVisualState {
  const hint = skillHint ?? '';

  switch (agentState) {
    case 'idle':
    case 'completed':
    case 'sleeping':
      return 'IDLE';

    case 'thinking':
    case 'planning':
      return 'THINKING';

    case 'executing': {
      // Un skill de recherche prime, sinon on considère que l'agent édite.
      if (SEARCH_SKILL_RE.test(hint)) return 'SEARCHING';
      if (EDIT_SKILL_RE.test(hint)) return 'EDITING';
      return 'EDITING';
    }

    case 'verifying':
      return 'SEARCHING';

    case 'waiting':
    case 'blocked':
      return 'WAITING';

    default:
      return 'IDLE';
  }
}

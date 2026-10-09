/**
 * sprites — Chargement des assets pixel-art des états de l'agent.
 *
 * Format attendu d'une spritesheet :
 *   - Un PNG par état visuel.
 *   - Les frames d'animation sont disposées HORIZONTALEMENT, côte à côte, de
 *     largeur égale (frame carrée recommandée). Le nombre de frames est déclaré
 *     par état dans `VISUAL_STATE_META.frames` (voir visualState.ts).
 *   - Une spritesheet mono-frame (`frames: 1`) est parfaitement valide : le
 *     composant l'affiche alors en image statique, sans animation `steps()`.
 *
 * Assets actuels : les PNG `assets/sprites/characters/char_*.png` sont des
 * images uniques réutilisées comme assets définitifs (décision utilisateur).
 * Mapping (PLAN_ACTION_INTEGRATION.md) :
 *   IDLE → char_0, THINKING → char_1, EDITING → char_2,
 *   SEARCHING → char_3, WAITING → char_4, (char_5 = fallback).
 *
 * Les imports passent par le bundler Vite (pattern du projet, cf.
 * UnifiedSidebar.tsx). `src/vite-env.d.ts` déclare déjà le module `*.png`.
 */

import type { AgentVisualState } from './visualState.js';

// @ts-ignore - Asset géré par le bundler
import charIdle from '../../../assets/sprites/characters/char_0.png';
// @ts-ignore - Asset géré par le bundler
import charThinking from '../../../assets/sprites/characters/char_1.png';
// @ts-ignore - Asset géré par le bundler
import charEditing from '../../../assets/sprites/characters/char_2.png';
// @ts-ignore - Asset géré par le bundler
import charSearching from '../../../assets/sprites/characters/char_3.png';
// @ts-ignore - Asset géré par le bundler
import charWaiting from '../../../assets/sprites/characters/char_4.png';
// @ts-ignore - Asset géré par le bundler
import charFallback from '../../../assets/sprites/characters/char_5.png';

/** URL (résolue par le bundler) de la spritesheet pour chaque état visuel. */
export const SPRITE_BY_STATE: Record<AgentVisualState, string> = {
  IDLE: charIdle,
  THINKING: charThinking,
  EDITING: charEditing,
  SEARCHING: charSearching,
  WAITING: charWaiting,
};

/** Sprite de repli si un état n'a pas (encore) d'asset dédié. */
export const FALLBACK_SPRITE: string = charFallback;

/** Retourne l'URL de sprite d'un état, avec repli propre. */
export function spriteFor(state: AgentVisualState): string {
  return SPRITE_BY_STATE[state] ?? FALLBACK_SPRITE;
}

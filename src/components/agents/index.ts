/**
 * Barrel du module de visualisation pixel-art des agents.
 */
export { AgentVisualizer, type AgentVisualizerProps } from './AgentVisualizer.js';
export {
  toVisualState,
  AGENT_VISUAL_STATES,
  VISUAL_STATE_META,
  type AgentVisualState,
  type VisualStateMeta,
} from './visualState.js';
export { SPRITE_BY_STATE, FALLBACK_SPRITE, spriteFor } from './sprites.js';

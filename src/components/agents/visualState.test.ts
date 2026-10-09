import { describe, it, expect } from 'vitest';
import {
  toVisualState,
  AGENT_VISUAL_STATES,
  VISUAL_STATE_META,
  type AgentVisualState,
} from './visualState.js';

describe('toVisualState', () => {
  it('mappe les états de repos vers IDLE', () => {
    expect(toVisualState('idle')).toBe('IDLE');
    expect(toVisualState('completed')).toBe('IDLE');
    expect(toVisualState('sleeping')).toBe('IDLE');
  });

  it('mappe réflexion/planification vers THINKING', () => {
    expect(toVisualState('thinking')).toBe('THINKING');
    expect(toVisualState('planning')).toBe('THINKING');
  });

  it('mappe executing + skill d’écriture vers EDITING', () => {
    expect(toVisualState('executing', 'write_file')).toBe('EDITING');
    expect(toVisualState('executing', 'edit')).toBe('EDITING');
    expect(toVisualState('executing', 'create_component')).toBe('EDITING');
    expect(toVisualState('executing', 'modify config')).toBe('EDITING');
  });

  it('mappe executing + skill de recherche vers SEARCHING', () => {
    expect(toVisualState('executing', 'search_codebase')).toBe('SEARCHING');
    expect(toVisualState('executing', 'read_file')).toBe('SEARCHING');
    expect(toVisualState('executing', 'grep')).toBe('SEARCHING');
    expect(toVisualState('executing', 'find references')).toBe('SEARCHING');
  });

  it('la recherche prime sur l’édition en cas d’ambiguïté', () => {
    // "read" (search) présent même si "create" aussi → SEARCHING gagne.
    expect(toVisualState('executing', 'read-and-create')).toBe('SEARCHING');
  });

  it('executing sans indice de skill retombe sur EDITING', () => {
    expect(toVisualState('executing')).toBe('EDITING');
    expect(toVisualState('executing', '')).toBe('EDITING');
    expect(toVisualState('executing', 'unknown_tool')).toBe('EDITING');
  });

  it('mappe verifying vers SEARCHING', () => {
    expect(toVisualState('verifying')).toBe('SEARCHING');
  });

  it('mappe waiting/blocked vers WAITING', () => {
    expect(toVisualState('waiting')).toBe('WAITING');
    expect(toVisualState('blocked')).toBe('WAITING');
  });

  it('retombe sur IDLE pour un état inconnu ou undefined', () => {
    expect(toVisualState(undefined)).toBe('IDLE');
    expect(toVisualState('weird_state')).toBe('IDLE');
    expect(toVisualState('')).toBe('IDLE');
  });

  it('produit toujours un état visuel déclaré dans les métadonnées', () => {
    const inputs = ['idle', 'thinking', 'planning', 'executing', 'verifying', 'blocked', 'waiting', 'completed', 'xyz'];
    for (const input of inputs) {
      const vs = toVisualState(input);
      expect(AGENT_VISUAL_STATES).toContain(vs);
      expect(VISUAL_STATE_META[vs]).toBeDefined();
    }
  });
});

describe('VISUAL_STATE_META', () => {
  it('déclare des métadonnées cohérentes pour chaque état visuel', () => {
    for (const state of AGENT_VISUAL_STATES) {
      const meta = VISUAL_STATE_META[state as AgentVisualState];
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.frames).toBeGreaterThanOrEqual(1);
      expect(meta.durationMs).toBeGreaterThan(0);
    }
  });
});

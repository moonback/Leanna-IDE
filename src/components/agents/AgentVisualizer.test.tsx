import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgentVisualizer } from './AgentVisualizer.js';
import { AGENT_VISUAL_STATES, VISUAL_STATE_META } from './visualState.js';

// On contrôle useReducedMotion pour tester les deux branches (animé / statique).
const reduceMotionMock = vi.fn<[], boolean>(() => false);
vi.mock('motion/react', () => ({
  useReducedMotion: () => reduceMotionMock(),
}));

// Les PNG importés par sprites.ts sont résolus en URL par le bundler ; sous
// vitest on stube le module pour éviter la dépendance aux assets binaires.
vi.mock('./sprites.js', () => ({
  spriteFor: (state: string) => `sprite://${state}.png`,
  SPRITE_BY_STATE: {},
  FALLBACK_SPRITE: 'sprite://fallback.png',
}));

beforeEach(() => {
  reduceMotionMock.mockReturnValue(false);
});

describe('AgentVisualizer', () => {
  it('rend chaque état visuel avec un aria-label en français', () => {
    for (const state of AGENT_VISUAL_STATES) {
      const { unmount } = render(<AgentVisualizer visualState={state} />);
      const el = screen.getByRole('img');
      expect(el).toHaveAttribute('data-visual-state', state);
      expect(el.getAttribute('aria-label')).toContain(VISUAL_STATE_META[state].label);
      unmount();
    }
  });

  it('applique le sprite correspondant à l’état', () => {
    render(<AgentVisualizer visualState="EDITING" />);
    const el = screen.getByRole('img');
    expect(el.style.backgroundImage).toContain('sprite://EDITING.png');
  });

  it('respecte la taille demandée', () => {
    render(<AgentVisualizer visualState="IDLE" size={72} />);
    const el = screen.getByRole('img');
    expect(el.style.width).toBe('72px');
    expect(el.style.height).toBe('72px');
  });

  it('n’anime pas un état mono-frame (classe animated absente)', () => {
    // Les métadonnées actuelles sont toutes mono-frame → jamais animé.
    render(<AgentVisualizer visualState="THINKING" />);
    const el = screen.getByRole('img');
    expect(el.className).toContain('agent-sprite');
    expect(el.className).not.toContain('agent-sprite--animated');
  });

  it('n’anime jamais en reduced-motion', () => {
    reduceMotionMock.mockReturnValue(true);
    render(<AgentVisualizer visualState="SEARCHING" />);
    const el = screen.getByRole('img');
    expect(el.className).not.toContain('agent-sprite--animated');
    cleanup();
  });

  it('utilise un label personnalisé quand fourni', () => {
    render(<AgentVisualizer visualState="WAITING" label="Attente d’approbation" />);
    const el = screen.getByRole('img');
    expect(el.getAttribute('aria-label')).toContain('Attente d’approbation');
  });
});

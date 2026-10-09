import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AgentStatus } from '../hooks/useAgentStatus.js';

// Mock des hooks de données pour isoler l'intégration visuelle du FloatingOrb.
const agentStatusMock = vi.fn<[], AgentStatus>();
vi.mock('../hooks/useAgentStatus.js', () => ({
  useAgentStatus: () => agentStatusMock(),
}));

vi.mock('../hooks/useOrbState.js', () => ({
  useOrbState: () => ({
    connectionStatus: 'idle',
    isConnected: false,
    isConnecting: false,
    status: 'idle',
    inputLevel: 0,
    outputLevel: 0,
    amp: 0,
    isSpeaking: false,
    isListening: false,
    isBusy: false,
    accentColor: '#0ea5e9',
    statusLabel: 'PRÊT',
    toggleConnection: () => {},
    muted: false,
    wake: () => {},
  }),
}));

vi.mock('../context/UserProfileContext.js', () => ({
  useProfile: () => ({
    profile: { textProvider: 'gemini', openrouterModel: '', floatingOrb: true },
  }),
}));

import { FloatingOrb } from './FloatingOrb.js';

function makeStatus(visualState: AgentStatus['visualState']): AgentStatus {
  return {
    state: 'idle',
    label: 'Au repos',
    reason: 'Autonomie en veille',
    color: 'var(--color-success)',
    active: false,
    connected: true,
    visualState,
  };
}

describe('FloatingOrb', () => {
  it('affiche le personnage pixel-art pour l’état visuel courant', () => {
    agentStatusMock.mockReturnValue(makeStatus('IDLE'));
    render(<FloatingOrb />);
    const sprite = screen.getByRole('img');
    expect(sprite).toHaveAttribute('data-visual-state', 'IDLE');
  });

  it('reflète un changement d’état visuel (EDITING)', () => {
    agentStatusMock.mockReturnValue(makeStatus('EDITING'));
    render(<FloatingOrb />);
    expect(screen.getByRole('img')).toHaveAttribute('data-visual-state', 'EDITING');
  });
});

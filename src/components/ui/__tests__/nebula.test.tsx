import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlowCard } from '../GlowCard.js';
import { RingGauge } from '../RingGauge.js';
import { ProgressBeam } from '../ProgressBeam.js';
import { AgentChip } from '../AgentChip.js';
import { HoloButton } from '../HoloButton.js';
import { agentColor, agentFamily } from '../agentColors.js';

describe('agentColors', () => {
  it('regroupe les rôles par famille', () => {
    expect(agentFamily('architect')).toBe('design');
    expect(agentFamily('coder')).toBe('build');
    expect(agentFamily('tester')).toBe('quality');
    expect(agentFamily('performance')).toBe('perf');
    expect(agentFamily('security')).toBe('security');
    expect(agentFamily('writer')).toBe('knowledge');
  });

  it('retombe sur knowledge pour un agent personnalisé', () => {
    expect(agentColor('mon-agent-custom')).toBe('var(--nb-agent-knowledge)');
  });
});

describe('RingGauge', () => {
  it('borne la valeur et expose un meter accessible', () => {
    render(<RingGauge label="CPU" value={140} />);
    const meter = screen.getByRole('meter', { name: 'CPU' });
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '100%');
  });

  it('gère NaN et un texte personnalisé', () => {
    render(<RingGauge label="RAM" value={Number.NaN} display="1,2 Go" />);
    const meter = screen.getByRole('meter', { name: 'RAM' });
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(meter).toHaveAttribute('aria-valuetext', '1,2 Go');
  });
});

describe('ProgressBeam', () => {
  it('arrondit et borne le pourcentage', () => {
    render(<ProgressBeam label="Refonte" value={77.6} running />);
    const bar = screen.getByRole('progressbar', { name: 'Refonte' });
    expect(bar).toHaveAttribute('aria-valuenow', '78');
    expect(bar).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('78%')).toBeInTheDocument();
  });

  it('borne les valeurs négatives', () => {
    render(<ProgressBeam label="Audit" value={-5} hideLabel />);
    expect(screen.getByRole('progressbar', { name: 'Audit' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});

describe('AgentChip', () => {
  it("annonce l'état en texte et colore selon la famille", () => {
    const { container } = render(<AgentChip agentRole="tester" label="Testeur" status="running" />);
    expect(screen.getByText(/en cours/)).toBeInTheDocument();
    const chip = container.querySelector('.nb-chip') as HTMLElement;
    expect(chip.dataset.status).toBe('active');
    expect(chip.style.getPropertyValue('--nb-chip-color')).toBe('var(--nb-agent-quality)');
  });

  it("passe en couleur d'erreur quelle que soit la famille", () => {
    const { container } = render(<AgentChip agentRole="coder" label="Développeur" status="error" />);
    const chip = container.querySelector('.nb-chip') as HTMLElement;
    expect(chip.style.getPropertyValue('--nb-chip-color')).toBe('var(--color-error)');
    expect(screen.getByText(/en erreur/)).toBeInTheDocument();
  });
});

describe('GlowCard', () => {
  it('reste un simple conteneur sans onClick', () => {
    render(<GlowCard>Contenu</GlowCard>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('devient un bouton activable au clavier avec onClick', async () => {
    const onClick = vi.fn();
    render(<GlowCard onClick={onClick} active>Mission</GlowCard>);
    const card = screen.getByRole('button', { name: 'Mission' });
    expect(card).toHaveAttribute('data-active', 'true');
    card.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe('HoloButton', () => {
  it('est un bouton de type button avec aria-pressed', async () => {
    const onClick = vi.fn();
    render(<HoloButton pressed onClick={onClick}>Exécuter</HoloButton>);
    const btn = screen.getByRole('button', { name: 'Exécuter' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

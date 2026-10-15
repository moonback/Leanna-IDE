import { screen, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/helpers.js';
import {
  hardwareTier, pickTier, downgradeForFps, minTier, type Capabilities,
} from '../quality.js';
import { sceneBus, installSceneBridge } from '../sceneBus.js';
import {
  getScenePrefs, setScenePref, reloadScenePrefs, isFocusShortcut, SCENE_PREFS_KEY,
} from '../scenePrefs.js';
import { computeSceneActive } from '../useSceneVisibility.js';
import { SceneLayer } from '../SceneLayer.js';

// three.js ne tourne pas sous jsdom : on remplace le canvas par un témoin.
vi.mock('../SceneHost.js', () => ({
  default: (p: { tier: string; active: boolean }) => <div data-testid="scene-host" data-tier={p.tier} data-active={String(p.active)} />,
}));

const DESKTOP: Capabilities = { webgl2: true, gpu: 'NVIDIA GeForce RTX 3060', cores: 12, memoryGB: 8, devicePixelRatio: 1 };

describe('quality', () => {
  it('hardwareTier', () => {
    expect(hardwareTier(DESKTOP)).toBe('high');
    expect(hardwareTier({ ...DESKTOP, gpu: 'ANGLE (Intel, Intel(R) HD Graphics 530)' })).toBe('medium');
    expect(hardwareTier({ ...DESKTOP, gpu: 'Google SwiftShader' })).toBe('off');
    expect(hardwareTier({ ...DESKTOP, webgl2: false })).toBe('off');
    expect(hardwareTier({ ...DESKTOP, cores: 2 })).toBe('low');
  });

  it('pickTier applique intensité, mouvement réduit et high-contrast', () => {
    const base = { capabilities: DESKTOP, reducedMotion: false, highContrast: false };
    expect(pickTier({ ...base, intensity: 'cinematic' })).toBe('high');
    expect(pickTier({ ...base, intensity: 'standard' })).toBe('medium');
    expect(pickTier({ ...base, intensity: 'sober' })).toBe('low');
    expect(pickTier({ ...base, intensity: 'off' })).toBe('off');
    expect(pickTier({ ...base, intensity: 'cinematic', reducedMotion: true })).toBe('low');
    expect(pickTier({ ...base, intensity: 'cinematic', highContrast: true })).toBe('off');
  });

  it('downgradeForFps descend d\'un cran sous 80 % de la cadence de repos', () => {
    expect(downgradeForFps('high', 29)).toBe('high');
    expect(downgradeForFps('high', 20)).toBe('medium');
    expect(downgradeForFps('low', 5)).toBe('off');
    expect(minTier('high', 'low')).toBe('low');
  });
});

describe('sceneBus', () => {
  beforeEach(() => sceneBus.reset());

  it("l'énergie suit les agents actifs et les impulsions amorties", () => {
    expect(sceneBus.energy(0)).toBe(0);
    sceneBus.setActiveAgents(3);
    const withAgents = sceneBus.energy(0);
    expect(withAgents).toBeGreaterThan(0.3);
    sceneBus.pulse('mission', 1000);
    expect(sceneBus.energy(1000)).toBeGreaterThan(withAgents);
    // Après 10 demi-vies, l'impulsion est négligeable.
    expect(sceneBus.energy(1000 + 16_000)).toBeCloseTo(withAgents, 2);
  });

  it('installSceneBridge traduit les événements window en impulsions', () => {
    const kinds: string[] = [];
    sceneBus.onPulse(k => kinds.push(k));
    const uninstall = installSceneBridge();
    window.dispatchEvent(new CustomEvent('Leanna-tool-start', { detail: { tool: 'x' } }));
    window.dispatchEvent(new CustomEvent('Leanna-agent-event', { detail: { status: 'failed' } }));
    window.dispatchEvent(new CustomEvent('Leanna-mission-event', { detail: { event: 'goal_started' } }));
    uninstall();
    window.dispatchEvent(new CustomEvent('Leanna-tool-start', { detail: { tool: 'x' } }));
    expect(kinds).toEqual(['tool', 'error', 'mission']);
  });
});

describe('scenePrefs et visibilité', () => {
  beforeEach(() => {
    localStorage.clear();
    reloadScenePrefs();
  });

  it('persiste et ignore un stockage invalide', () => {
    setScenePref('intensity', 'cinematic');
    setScenePref('focus', true);
    expect(JSON.parse(localStorage.getItem(SCENE_PREFS_KEY)!)).toEqual({ intensity: 'cinematic', focus: true });
    expect(document.documentElement.getAttribute('data-focus')).toBe('on');
    localStorage.setItem(SCENE_PREFS_KEY, JSON.stringify({ intensity: 'ultra', focus: 'oui' }));
    reloadScenePrefs();
    expect(getScenePrefs()).toEqual({ intensity: 'standard', focus: false });
  });

  it('raccourci Focus = Ctrl+Alt+F (pas Ctrl+Shift+F, réservé à la recherche)', () => {
    const k = (o: Partial<KeyboardEvent>) => ({ code: 'KeyF', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
    expect(isFocusShortcut(k({ ctrlKey: true, altKey: true }))).toBe(true);
    expect(isFocusShortcut(k({ metaKey: true, altKey: true }))).toBe(true);
    expect(isFocusShortcut(k({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isFocusShortcut(k({ ctrlKey: true, altKey: true, code: 'KeyG' }))).toBe(false);
  });

  it('computeSceneActive', () => {
    expect(computeSceneActive({ hidden: false, focused: true, focusMode: false })).toBe(true);
    expect(computeSceneActive({ hidden: true, focused: true, focusMode: false })).toBe(false);
    expect(computeSceneActive({ hidden: false, focused: false, focusMode: false })).toBe(false);
    expect(computeSceneActive({ hidden: false, focused: true, focusMode: true })).toBe(false);
  });
});

describe('SceneLayer', () => {
  beforeEach(() => {
    localStorage.clear();
    reloadScenePrefs();
    sceneBus.reset();
  });

  it('charge la scène WebGL au niveau calculé', async () => {
    renderWithProviders(<SceneLayer activeAgents={0} capabilities={DESKTOP} />);
    expect(await screen.findByTestId('scene-host')).toHaveAttribute('data-tier', 'medium');
  });

  it('retombe sur le décor CSS sans WebGL', () => {
    const { container } = renderWithProviders(<SceneLayer activeAgents={0} capabilities={{ ...DESKTOP, webgl2: false }} />);
    expect(container.querySelector('.lea-ambient')).not.toBeNull();
    expect(screen.queryByTestId('scene-host')).toBeNull();
  });

  it('Ctrl+Alt+F bascule le mode Focus (aucun décor)', async () => {
    const { container } = renderWithProviders(<SceneLayer activeAgents={2} capabilities={DESKTOP} />);
    await screen.findByTestId('scene-host');
    act(() => { fireEvent.keyDown(window, { code: 'KeyF', key: 'f', ctrlKey: true, altKey: true }); });
    expect(getScenePrefs().focus).toBe(true);
    expect(screen.queryByTestId('scene-host')).toBeNull();
    expect(container.querySelector('.lea-ambient')).toBeNull();
    act(() => { fireEvent.keyDown(window, { code: 'KeyF', key: 'f', ctrlKey: true, altKey: true }); });
    expect(await screen.findByTestId('scene-host')).toBeInTheDocument();
  });

  it("transmet le nombre d'agents actifs à la scène", () => {
    renderWithProviders(<SceneLayer activeAgents={4} capabilities={DESKTOP} />);
    expect(sceneBus.energy(0)).toBeGreaterThan(0.5);
  });
});

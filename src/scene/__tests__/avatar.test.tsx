import { screen, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/helpers.js';
import { LiveAPIContext, type LiveAPIContextValue } from '../../context/LiveAPIContext.js';
import {
  AVATAR_MOODS, MOOD_EXPRESSIONS, MOOD_POSES, MOOD_MESSAGES, moodFromSignals, lipSync,
  blinkWeight, nextBlinkDelay, damp, combineExpressions, type AvatarSignals,
} from '../avatar/avatarStateMachine.js';
import { avatarBus, isGlbBuffer } from '../avatar/avatarBus.js';
import { AvatarStage } from '../avatar/AvatarStage.js';
import { reloadScenePrefs, setScenePref } from '../scenePrefs.js';

const SIGNALS: AvatarSignals = {
  status: 'online', muted: false, hovered: false, celebrate: false, alert: false, present: false, pointing: false,
};

describe('avatarStateMachine', () => {
  it('définit expressions, posture et message pour les 12 humeurs', () => {
    expect(AVATAR_MOODS).toHaveLength(12);
    for (const m of AVATAR_MOODS) {
      expect(MOOD_EXPRESSIONS[m]).toBeDefined();
      expect(MOOD_POSES[m]).toBeDefined();
      expect(MOOD_MESSAGES[m].length).toBeGreaterThan(0);
    }
  });

  it('priorité : alerte > présentation > désignation > voix', () => {
    expect(moodFromSignals({ ...SIGNALS, status: 'speaking' })).toBe('talk');
    expect(moodFromSignals({ ...SIGNALS, status: 'speaking', pointing: true })).toBe('point');
    expect(moodFromSignals({ ...SIGNALS, pointing: true, present: true })).toBe('present');
    expect(moodFromSignals({ ...SIGNALS, present: true, alert: true })).toBe('alert');
    expect(moodFromSignals({ ...SIGNALS, status: 'idle' })).toBe('sleep');
    expect(moodFromSignals({ ...SIGNALS, status: 'busy' })).toBe('think');
  });

  it('lip-sync : bouche fermée en silence, ouverte avec la voix', () => {
    expect(lipSync(0, 1)).toEqual({});
    const w = lipSync(0.3, 1);
    expect(w.aa).toBeGreaterThan(0.5);
    expect(w.aa).toBeLessThanOrEqual(1);
  });

  it('clignements', () => {
    expect(blinkWeight(-1)).toBe(0);
    expect(blinkWeight(75)).toBeCloseTo(1);
    expect(blinkWeight(200)).toBe(0);
    expect(nextBlinkDelay(() => 0)).toBe(2500);
    expect(nextBlinkDelay(() => 1)).toBe(6000);
  });

  it('damp converge vers la cible', () => {
    expect(damp(0, 1, 10, 0)).toBe(0);
    expect(damp(0, 1, 10, 1)).toBeGreaterThan(0.99);
  });

  it('combineExpressions : le lip-sync remplace les voyelles, tout est borné', () => {
    const w = combineExpressions('think', { aa: 0.8 }, 0.5);
    expect(w.ou).toBeCloseTo(0.15);
    expect(w.aa).toBe(0.8);
    expect(w.blink).toBe(0.5);
    expect(combineExpressions('sleep', {}, 1).blink).toBe(1);
  });
});

describe('avatarBus', () => {
  beforeEach(() => avatarBus.reset());

  it('reconnaît un glTF binaire', () => {
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(isGlbBuffer(glb)).toBe(true);
    expect(isGlbBuffer(new TextEncoder().encode('<!doctype html><html>').buffer)).toBe(false);
    expect(isGlbBuffer(new ArrayBuffer(4))).toBe(false);
  });

  it("borne l'amplitude et le regard", () => {
    avatarBus.setAmpSource(() => 4);
    expect(avatarBus.amp()).toBe(1);
    avatarBus.setAmpSource(() => Number.NaN);
    expect(avatarBus.amp()).toBe(0);
    avatarBus.setGaze(-3, 0.5);
    expect(avatarBus.gaze).toEqual({ x: -1, y: 0.5 });
  });
});

function fakeLive(overrides: Partial<LiveAPIContextValue> = {}): LiveAPIContextValue {
  return {
    status: 'idle', isBusy: false, muted: false,
    connect: vi.fn(), disconnect: vi.fn(),
    getOutputAmplitude: () => 0, getInputAmplitude: () => 0,
    ...overrides,
  } as unknown as LiveAPIContextValue;
}

describe('AvatarStage', () => {
  beforeEach(() => {
    avatarBus.reset();
    localStorage.clear();
    reloadScenePrefs();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  function renderStage(live = fakeLive(), props = {}) {
    return renderWithProviders(
      <LiveAPIContext.Provider value={live}>
        <AvatarStage {...props} />
      </LiveAPIContext.Provider>,
    );
  }

  it('sans canvas WebGL : mascotte 2D, aucune ancre publiée', () => {
    const { container } = renderStage();
    expect(container.querySelector('.nb-avatar-stage')).toHaveAttribute('data-mode', '2d');
    expect(container.querySelector('.nb-avatar-stage__anchor')).toBeNull();
    expect(avatarBus.anchor).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('En veille');
  });

  it('avec canvas : ancre publiée, retirée au démontage ; repli si le VRM manque', () => {
    act(() => avatarBus.setSceneRunning(true));
    const { container, unmount } = renderStage();
    expect(container.querySelector('.nb-avatar-stage__anchor')).not.toBeNull();
    expect(avatarBus.anchor).not.toBeNull();

    act(() => avatarBus.setLoadStatus('missing'));
    expect(container.querySelector('.nb-avatar-stage__anchor')).toBeNull();
    expect(avatarBus.anchor).toBeNull();
    unmount();
  });

  it('mode Focus : repli 2D même si le canvas tourne', () => {
    act(() => avatarBus.setSceneRunning(true));
    setScenePref('focus', true);
    const { container } = renderStage();
    expect(container.querySelector('.nb-avatar-stage__anchor')).toBeNull();
  });

  it('humeurs événementielles : alerte puis retour', () => {
    const { container } = renderStage(fakeLive({ status: 'connected' } as Partial<LiveAPIContextValue>));
    act(() => { vi.advanceTimersByTime(150); });
    expect(container.querySelector('.nb-avatar-stage')).toHaveAttribute('data-mood', 'idle');
    act(() => {
      window.dispatchEvent(new CustomEvent('Leanna-mission-event', { detail: { event: 'mission_failed' } }));
    });
    expect(container.querySelector('.nb-avatar-stage')).toHaveAttribute('data-mood', 'alert');
    expect(avatarBus.mood).toBe('alert');
    act(() => { vi.advanceTimersByTime(4100); });
    expect(container.querySelector('.nb-avatar-stage')).toHaveAttribute('data-mood', 'idle');
  });

  it("la voix qui parle passe l'avatar en « talk » et alimente le lip-sync", () => {
    let out = 0;
    const { container } = renderStage(fakeLive({ status: 'connected', getOutputAmplitude: () => out } as Partial<LiveAPIContextValue>));
    out = 0.4;
    act(() => { vi.advanceTimersByTime(150); });
    expect(container.querySelector('.nb-avatar-stage')).toHaveAttribute('data-mood', 'talk');
    expect(avatarBus.amp()).toBeCloseTo(0.4);
  });

  it("un clic sur l'ancre connecte la présence vocale", () => {
    act(() => avatarBus.setSceneRunning(true));
    const live = fakeLive();
    renderStage(live);
    fireEvent.click(screen.getByRole('button', { name: /connecter la présence vocale/ }));
    expect(live.connect).toHaveBeenCalledWith([], 'full');
  });
});

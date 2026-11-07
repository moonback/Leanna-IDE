import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudio } from './useAudio.js';
import { startWakeWordListener } from '../lib/wakeWord.js';

const stop = vi.fn();
vi.mock('../lib/wakeWord.js', () => ({
  DEFAULT_WAKE_STRICTNESS: { minConfidence: 0.8, minDurationSec: 0.3, maxWordIndex: 1 },
  preloadWakeModel: vi.fn(async () => ({})),
  startWakeWordListener: vi.fn(async () => ({ feed: vi.fn(), stop })),
}));

describe('useAudio — réveil vocal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const sleepNow = () => {
    const hook = renderHook(() =>
      useAudio({ onAudioData: () => {}, autoMuteEnabled: true, autoMuteTimeout: 5 }),
    );
    act(() => { vi.advanceTimersByTime(6000); });
    return hook;
  };

  it("n'écoute le nom qu'en veille et libère le détecteur au réveil", async () => {
    const { result } = sleepNow();
    expect(result.current.asleep).toBe(true);
    expect(startWakeWordListener).toHaveBeenCalledTimes(1);
    await act(async () => {}); // laisse la promesse du listener se résoudre
    act(() => result.current.wake());
    expect(result.current.asleep).toBe(false);
    expect(stop).toHaveBeenCalled();
  });

  it('une reconnexion GoAway garde la veille, une déconnexion la lève', () => {
    const { result } = sleepNow();
    act(() => result.current.cleanupAudio(true));
    expect(result.current.muted).toBe(true);
    expect(result.current.asleep).toBe(true);
    act(() => result.current.cleanupAudio());
    expect(result.current.muted).toBe(false);
    expect(result.current.asleep).toBe(false);
  });

  it('un mute manuel ne lance pas la détection', () => {
    vi.mocked(startWakeWordListener).mockClear();
    const { result } = renderHook(() => useAudio({ onAudioData: () => {} }));
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    expect(startWakeWordListener).not.toHaveBeenCalled();
  });
});

// Veille automatique : N s SANS activité → muted. Toute activité repousse l'échéance.
describe('useAudio — veille sur inactivité', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it("l'activité repousse la veille, puis N s de silence l'endorment", () => {
    const { result } = renderHook(() =>
      useAudio({ onAudioData: () => {}, autoMuteEnabled: true, autoMuteTimeout: 5 }),
    );
    advance(4000);
    act(() => result.current.markActivity());
    advance(4000); // 8 s depuis le début, 4 s depuis l'activité
    expect(result.current.muted).toBe(false);
    advance(2000); // 6 s sans activité
    expect(result.current.muted).toBe(true);
  });

  it('ne s’endort pas pendant un outil en cours (isBusy)', () => {
    const { result, rerender } = renderHook(
      ({ isBusy }) => useAudio({ onAudioData: () => {}, autoMuteEnabled: true, autoMuteTimeout: 5, isBusy }),
      { initialProps: { isBusy: true } },
    );
    advance(20000);
    expect(result.current.muted).toBe(false);
    rerender({ isBusy: false });
    advance(6000);
    expect(result.current.muted).toBe(true);
  });

  it('wake() réveille et relance le délai complet', () => {
    const { result } = renderHook(() =>
      useAudio({ onAudioData: () => {}, autoMuteEnabled: true, autoMuteTimeout: 5 }),
    );
    advance(6000);
    expect(result.current.muted).toBe(true);
    act(() => result.current.wake());
    advance(4000);
    expect(result.current.muted).toBe(false);
  });
});

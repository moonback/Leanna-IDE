import { renderHook, act } from '@testing-library/react';
import {
  DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS_KEY,
  getFeatureFlags, setFeatureFlag, reloadFeatureFlags, useFeatureFlag,
} from '../featureFlags.js';

describe('featureFlags', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    reloadFeatureFlags();
  });

  it('uiV3 est désactivé par défaut', () => {
    expect(DEFAULT_FEATURE_FLAGS.uiV3).toBe(false);
    expect(getFeatureFlags().uiV3).toBe(false);
    expect(document.documentElement.getAttribute('data-ui')).toBe('classic');
  });

  it('persiste le flag et le reflète sur <html>', () => {
    setFeatureFlag('uiV3', true);
    expect(getFeatureFlags().uiV3).toBe(true);
    expect(JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY)!)).toEqual({ uiV3: true });
    expect(document.documentElement.getAttribute('data-ui')).toBe('v3');
  });

  it('ignore un stockage corrompu', () => {
    localStorage.setItem(FEATURE_FLAGS_KEY, '{oops');
    reloadFeatureFlags();
    expect(getFeatureFlags().uiV3).toBe(false);
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify({ uiV3: 'yes' }));
    reloadFeatureFlags();
    expect(getFeatureFlags().uiV3).toBe(false);
  });

  it("l'URL ?ui=v3 / ?ui=classic surcharge la valeur persistée", () => {
    window.history.replaceState(null, '', '/?ui=v3');
    reloadFeatureFlags();
    expect(getFeatureFlags().uiV3).toBe(true);

    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify({ uiV3: true }));
    window.history.replaceState(null, '', '/?ui=classic');
    reloadFeatureFlags();
    expect(getFeatureFlags().uiV3).toBe(false);
  });

  it('useFeatureFlag se met à jour après setFeatureFlag', () => {
    const { result } = renderHook(() => useFeatureFlag('uiV3'));
    expect(result.current).toBe(false);
    act(() => setFeatureFlag('uiV3', true));
    expect(result.current).toBe(true);
  });
});

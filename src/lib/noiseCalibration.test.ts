import { describe, expect, it } from 'vitest';
import {
  computeNoiseProfile, createSpeechGate, NoiseCalibrationError,
  MAX_ACTIVITY_THRESHOLD, MIN_CALIBRATION_SAMPLES,
} from './noiseCalibration.js';

const steady = (value: number, n = 90) => Array.from({ length: n }, () => value);

describe('computeNoiseProfile', () => {
  it('place le seuil au-dessus des pics ambiants, jamais sous le seuil VAD', () => {
    const p = computeNoiseProfile([...steady(20, 85), 30, 30, 30, 30, 30], 35);
    expect(p.floor).toBeGreaterThan(20);
    expect(p.threshold).toBeGreaterThan(p.p95);
    expect(p.threshold).toBeGreaterThanOrEqual(35);
  });

  it('pièce calme : garde le seuil VAD comme plancher', () => {
    expect(computeNoiseProfile(steady(2), 35).threshold).toBe(35);
  });

  it('refuse une mesure vide ou trop courte', () => {
    expect(() => computeNoiseProfile([], 35)).toThrow(NoiseCalibrationError);
    expect(() => computeNoiseProfile(steady(10, MIN_CALIBRATION_SAMPLES - 1), 35)).toThrow(/Pas assez/);
  });

  it('signale une pièce trop bruyante au lieu de borner en silence', () => {
    expect(() => computeNoiseProfile(steady(MAX_ACTIVITY_THRESHOLD), 35)).toThrow(/trop bruyant/);
  });
});

describe('createSpeechGate', () => {
  /** Joue une suite de niveaux à 30 i/s, renvoie true si une activité a été détectée. */
  const run = (levels: number[], threshold = 40) => {
    const gate = createSpeechGate({ sustainMs: 300, gapToleranceMs: 150 });
    return levels.some((lvl, i) => gate.update(lvl, threshold, i * 33));
  };

  it('ignore un bruit de fond stable sous le seuil', () => {
    expect(run(steady(30, 300))).toBe(false);
  });

  it('ignore des pics brefs (clics, porte)', () => {
    const clicks = Array.from({ length: 300 }, (_, i) => (i % 30 < 3 ? 90 : 10));
    expect(run(clicks)).toBe(false);
  });

  it('détecte une parole soutenue au-dessus du seuil', () => {
    expect(run([...steady(10, 10), ...steady(60, 15)])).toBe(true);
  });

  it('tolère de courts creux entre syllabes', () => {
    // 6 i haut, 2 i bas (~66 ms), répété : parole hachée mais continue.
    const syllables = Array.from({ length: 40 }, (_, i) => (i % 8 < 6 ? 60 : 20));
    expect(run(syllables)).toBe(true);
  });
});

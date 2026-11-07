import { describe, expect, it } from 'vitest';
import { containsWakeWord, isWakeResult } from './wakeWord.js';

const w = (word: string, conf = 0.95, start = 0, end = 0.5) => ({ word, conf, start, end });

describe('isWakeResult — filtre des faux réveils', () => {
  it('réveille sur un nom confiant, assez long, en début de phrase', () => {
    expect(isWakeResult({ text: 'léna', result: [w('léna')] })).toBe(true);
    expect(isWakeResult({ text: '[unk] lina [unk]', result: [w('[unk]'), w('lina', 0.9, 0.4, 0.9), w('[unk]')] })).toBe(true);
  });

  it('ignore un mot peu confiant (mot ordinaire ramené vers la grammaire)', () => {
    expect(isWakeResult({ text: 'léa', result: [w('léa', 0.45)] })).toBe(false);
  });

  it('ignore un mot trop bref (« là » → « léa »)', () => {
    expect(isWakeResult({ text: 'léa', result: [w('léa', 0.95, 1, 1.12)] })).toBe(false);
  });

  it("ignore le nom au milieu d'une phrase", () => {
    const r = { text: '[unk] [unk] lena [unk]', result: [w('[unk]'), w('[unk]'), w('lena'), w('[unk]')] };
    expect(isWakeResult(r)).toBe(false);
  });

  it("repli texte sans détail par mot : seulement en début d'énoncé", () => {
    expect(isWakeResult({ text: 'lena ouvre' })).toBe(true);
    expect(isWakeResult({ text: '[unk] [unk] lena' })).toBe(false);
    expect(isWakeResult(undefined)).toBe(false);
  });
});

describe('containsWakeWord', () => {
  it.each(['leanna', 'Léna', 'lina ouvre le fichier', 'euh liana', '[unk] lena'])('reconnaît « %s »', (t) => {
    expect(containsWakeWord(t)).toBe(true);
  });

  it.each(['', '[unk]', 'bonjour', 'carolina', 'linaire', 'léandre'])('ignore « %s »', (t) => {
    expect(containsWakeWord(t)).toBe(false);
  });
});

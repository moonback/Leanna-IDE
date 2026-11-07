import { describe, expect, it } from 'vitest';
import { containsWakeWord } from './wakeWord.js';

describe('containsWakeWord', () => {
  it.each(['leanna', 'Léna', 'lina ouvre le fichier', 'euh liana', '[unk] lena'])('reconnaît « %s »', (t) => {
    expect(containsWakeWord(t)).toBe(true);
  });

  it.each(['', '[unk]', 'bonjour', 'carolina', 'linaire', 'léandre'])('ignore « %s »', (t) => {
    expect(containsWakeWord(t)).toBe(false);
  });
});

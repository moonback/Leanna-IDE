import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWav, parseDialogue, BYTES_PER_SECOND } from './podcastAudio.js';

test('buildWav : en-tête 44 octets, tailles cohérentes, silence entre segments', () => {
  const a = Buffer.alloc(100, 1);
  const b = Buffer.alloc(50, 2);
  const wav = buildWav([a, b]);
  const gap = Math.round(BYTES_PER_SECOND * 0.3);
  const dataLength = 100 + gap + 50;
  assert.equal(wav.length, 44 + dataLength);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 36 + dataLength);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), dataLength);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav[44 + 100], 0);
});

test('parseDialogue : noms configurés, repli Alex/Sam, lignes vides ignorées', () => {
  const lines = parseDialogue('Leanna: Bonjour.\n\nNoah: Salut.\nSam: Ancien.\nNarration libre', 'Leanna', 'Noah');
  assert.deepEqual(lines, [
    { speaker: 'host', text: 'Bonjour.' },
    { speaker: 'cohost', text: 'Salut.' },
    { speaker: 'cohost', text: 'Ancien.' },
    { speaker: 'host', text: 'Narration libre' },
  ]);
});

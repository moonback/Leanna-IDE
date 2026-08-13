import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from './crypto';

test('crypto: encrypt and decrypt returns original text', () => {
  const plainText = 'sk-or-v1-abcdef1234567890';
  const encrypted = encrypt(plainText);
  
  assert.notEqual(encrypted, plainText);
  assert.match(encrypted, /^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
  
  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, plainText);
});

test('crypto: decrypt falls back to original text on non-encrypted string', () => {
  const plainText = 'plain-text-secret';
  const decrypted = decrypt(plainText);
  assert.equal(decrypted, plainText);
});

test('crypto: decrypt falls back to original text on invalid encrypted format', () => {
  const invalidFormat = 'nothexbut32charslongstringhere12:abc';
  const decrypted = decrypt(invalidFormat);
  assert.equal(decrypted, invalidFormat);
});

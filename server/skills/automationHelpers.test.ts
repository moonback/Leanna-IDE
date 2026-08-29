import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeUrl, parseIntervalToMs } from './automationHelpers.js';

test('automationHelpers: assertSafeUrl', () => {
  // Safe URLs
  assert.deepEqual(assertSafeUrl('http://example.com'), { ok: true, url: 'http://example.com/' });
  assert.deepEqual(assertSafeUrl('https://google.com/search?q=test'), { ok: true, url: 'https://google.com/search?q=test' });

  // Unsafe schemas
  const ftpRes = assertSafeUrl('ftp://example.com');
  assert.equal(ftpRes.ok, false);
  if (!ftpRes.ok) {
    assert.match(ftpRes.error, /Schéma d'URL non autorisé/);
  }

  // Blocked hosts
  const blockRes1 = assertSafeUrl('http://169.254.169.254');
  assert.equal(blockRes1.ok, false);
  if (!blockRes1.ok) {
    assert.match(blockRes1.error, /Hôte non autorisé/);
  }

  const blockRes2 = assertSafeUrl('https://metadata.google.internal/some/path');
  assert.equal(blockRes2.ok, false);
  if (!blockRes2.ok) {
    assert.match(blockRes2.error, /Hôte non autorisé/);
  }

  // Invalid URLs
  const invalidRes = assertSafeUrl('not-a-url');
  assert.equal(invalidRes.ok, false);
  if (!invalidRes.ok) {
    assert.match(invalidRes.error, /URL invalide/);
  }
});

test('automationHelpers: parseIntervalToMs', () => {
  // Explicit numerical inputs
  assert.equal(parseIntervalToMs({ intervalSeconds: 45 }), 45 * 1000);
  assert.equal(parseIntervalToMs({ intervalMinutes: 10 }), 10 * 60 * 1000);
  assert.equal(parseIntervalToMs({ intervalHours: 3 }), 3 * 3600 * 1000);

  // String expression inputs
  assert.equal(parseIntervalToMs({ interval: '30s' }), 30 * 1000);
  assert.equal(parseIntervalToMs({ interval: '5m' }), 5 * 60 * 1000);
  assert.equal(parseIntervalToMs({ interval: '12h' }), 12 * 3600 * 1000);
  assert.equal(parseIntervalToMs({ interval: '10 mins' }), 10 * 60 * 1000);
  assert.equal(parseIntervalToMs({ interval: '2 hours' }), 2 * 3600 * 1000);

  // Fallbacks / invalid inputs
  assert.equal(parseIntervalToMs({}), null);
  assert.equal(parseIntervalToMs({ interval: 'invalid-expression' }), null);
  assert.equal(parseIntervalToMs({ intervalSeconds: -5 }), null);
});

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Leanna-keys-test-'));
process.env.Leanna_CONFIG_PATH = tmpConfigDir;

// Import dynamique après avoir configuré Leanna_CONFIG_PATH
const {
  addGeminiKey,
  removeGeminiKey,
  toggleGeminiKey,
  updateGeminiKeyLabel,
  getGeminiKeys,
  getNextGeminiKey,
  withGeminiRetry,
} = await import('./geminiKeyPool.js');

const keyOf = (ai: any): string => ai.apiKey ?? ai.apiClient?.clientOptions?.apiKey;

after(() => {
  try {
    fs.rmSync(tmpConfigDir, { recursive: true, force: true });
  } catch {
    // Ignore error
  }
});

test('geminiKeyPool: key management operations in isolated temp store', async () => {
  const initialKeys = getGeminiKeys();
  const testKey = `AIzaSyTestKey_${Date.now()}`;

  await addGeminiKey(testKey, 'Test Key Label');
  const keysAfterAdd = getGeminiKeys();
  assert.equal(keysAfterAdd.length, initialKeys.length + 1);

  const addedIndex = keysAfterAdd.findIndex(k => k.label === 'Test Key Label');
  assert.ok(addedIndex >= 0);
  assert.equal(keysAfterAdd[addedIndex].preview.startsWith('AIzaSy'), true);

  await updateGeminiKeyLabel(addedIndex, 'Updated Label');
  const keysAfterUpdate = getGeminiKeys();
  assert.equal(keysAfterUpdate[addedIndex].label, 'Updated Label');

  const disabledState = await toggleGeminiKey(addedIndex);
  assert.equal(disabledState, false); // false = not enabled (disabled)
  assert.equal(getGeminiKeys()[addedIndex].disabled, true);

  await toggleGeminiKey(addedIndex); // re-enable

  await removeGeminiKey(addedIndex);
  assert.equal(getGeminiKeys().length, initialKeys.length);
});

test('geminiKeyPool: rejects duplicate keys in isolated temp store', async () => {
  const key = `AIzaSyDuplicate_${Date.now()}`;
  await addGeminiKey(key, 'Dup Key');
  await assert.rejects(async () => {
    await addGeminiKey(key, 'Dup Key 2');
  }, /déjà/);

  const keys = getGeminiKeys();
  const idx = keys.findIndex(k => k.label === 'Dup Key');
  if (idx >= 0) await removeGeminiKey(idx);
});

test('geminiKeyPool: une clé refusée en 401 est exclue pour la capacité embed uniquement', async () => {
  const badKey = `AQ.BadToken_${Date.now()}`;
  const goodKey = `AIzaSyGood_${Date.now()}`;
  await addGeminiKey(badKey, 'Bad');
  await addGeminiKey(goodKey, 'Good');

  const used: string[] = [];
  const embed = () => withGeminiRetry(async (ai) => {
    const key = keyOf(ai);
    used.push(key);
    if (key === badKey) {
      throw Object.assign(new Error('{"error":{"code":401,"details":[{"reason":"ACCESS_TOKEN_TYPE_UNSUPPORTED"}]}}'), { status: 401 });
    }
    return 'ok';
  }, undefined, 5_000, { capability: 'embed' });

  // Quel que soit le point de départ du round-robin, l'appel aboutit.
  for (let i = 0; i < 3; i++) assert.equal(await embed(), 'ok');
  assert.equal(used.filter(k => k === badKey).length, 1, 'la clé fautive n\'est essayée qu\'une fois');

  for (let i = 0; i < 4; i++) assert.notEqual(getNextGeminiKey('embed'), badKey);
  // Hors embeddings, la clé reste dans la rotation.
  const generic = [getNextGeminiKey(), getNextGeminiKey()];
  assert.ok(generic.includes(badKey));

  const all = getGeminiKeys();
  await removeGeminiKey(all.findIndex(k => k.label === 'Good'));
  await removeGeminiKey(getGeminiKeys().findIndex(k => k.label === 'Bad'));
});

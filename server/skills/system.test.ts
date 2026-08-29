import test from 'node:test';
import assert from 'node:assert/strict';
import { systemSkill } from './system.js';

test('systemSkill: metadata', () => {
  assert.equal(systemSkill.name, 'system');
  const declNames = systemSkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes('system_info'));
  assert.ok(declNames.includes('system_execute_command'));
});

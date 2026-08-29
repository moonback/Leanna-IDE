import test from 'node:test';
import assert from 'node:assert/strict';
import { githubSkill } from './github';

test('githubSkill: metadata', () => {
  assert.equal(githubSkill.name, 'github');
  const declNames = githubSkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes('get_github_user'));
  assert.ok(declNames.includes('get_github_repo'));
});

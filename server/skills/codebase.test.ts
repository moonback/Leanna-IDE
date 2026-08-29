import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisPrompt } from './codebase.js';

test('buildAnalysisPrompt creates a concise analysis prompt for the codebase markdown', () => {
  const codebaseMarkdown = '# Codebase\n\n## Structure\n- src/\n';
  const prompt = buildAnalysisPrompt(codebaseMarkdown);

  assert.match(prompt, /Analyse ce codebase/i);
  assert.match(prompt, /Redige un resume executif/i);
  assert.match(prompt, /Risques/i);
  assert.match(prompt, /Prochaines etapes/i);
});

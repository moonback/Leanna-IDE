import { describe, expect, it } from 'vitest';
import { languageExtension } from './CodeMirrorDiffEditor.js';

describe('CodeMirror inline diff language support', () => {
  it.each([
    ['typescript', 'TypeScript'],
    ['ts', 'TypeScript alias'],
    ['tsx', 'TSX'],
    ['mts', 'ES modules TypeScript'],
    ['cts', 'CommonJS TypeScript'],
    ['javascript', 'JavaScript'],
    ['js', 'JavaScript alias'],
    ['jsx', 'JSX'],
    ['mjs', 'ES modules JavaScript'],
    ['cjs', 'CommonJS JavaScript'],
    ['json', 'JSON'],
    ['jsonc', 'JSON with comments'],
    ['css', 'CSS'],
    ['html', 'HTML'],
    ['htm', 'HTML alias'],
    ['xml', 'XML'],
    ['svg', 'SVG'],
    ['markdown', 'Markdown'],
    ['python', 'Python'],
    ['yaml', 'YAML'],
    ['yml', 'YAML alias'],
    ['sql', 'SQL'],
  ])('provides a language extension for %s (%s)', (language) => {
    expect(languageExtension(language)).not.toEqual([]);
  });

  it('normalizes whitespace and letter case before resolving aliases', () => {
    expect(languageExtension(' TSX ')).not.toEqual([]);
    expect(languageExtension('JSONC')).not.toEqual([]);
  });

  it('falls back to plain text for unsupported languages', () => {
    expect(languageExtension('plaintext')).toEqual([]);
    expect(languageExtension('unknown-language')).toEqual([]);
  });
});

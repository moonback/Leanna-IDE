import { describe, it, expect } from 'vitest';
import { buildProactiveSuggestions } from './proactiveSuggestions.js';

const user = (text: string) => ({ role: 'user' as const, text });
const assistant = (text: string) => ({ role: 'assistant' as const, text });

describe('buildProactiveSuggestions', () => {
  it('propose des amorces quand la conversation est vide', () => {
    const set = buildProactiveSuggestions({ transcript: [], activity: [] });
    expect(set.title).toBe('Suggestions');
    expect(set.items).toHaveLength(4);
    expect(set.items.every(i => i.kind === 'start')).toBe(true);
  });

  it("place le diagnostic d'un outil en échec en premier", () => {
    const set = buildProactiveSuggestions({
      transcript: [user('Lance les tests'), assistant('Les tests échouent ?')],
      activity: [{ tool: 'run_tests', label: 'Tests', status: 'error', detail: '2 échecs' }],
    });
    expect(set.title).toBe('Prochaines étapes');
    expect(set.items[0].kind).toBe('fix');
    expect(set.items[0].prompt).toContain('2 échecs');
  });

  it('offre des réponses rapides quand Leanna pose une question', () => {
    const set = buildProactiveSuggestions({
      transcript: [user('Refactore ça'), assistant('C\'est fait. Je lance les tests ?')],
      activity: [],
    });
    expect(set.items.map(i => i.id)).toEqual(expect.arrayContaining(['reply-yes', 'reply-no']));
  });

  it('propose de vérifier les fichiers modifiés tant que rien n\'a été vérifié', () => {
    const set = buildProactiveSuggestions({
      transcript: [user('Corrige le bug'), assistant('Corrigé.')],
      activity: [{ tool: 'modify_project_file', label: 'Modifier src/app.ts', status: 'done' }],
    });
    const verify = set.items.find(i => i.id === 'verify');
    expect(verify?.prompt).toContain('app.ts');
  });

  it('ne repropose pas la vérification si elle a déjà tourné', () => {
    const set = buildProactiveSuggestions({
      transcript: [user('Corrige le bug'), assistant('Corrigé et vérifié.')],
      activity: [
        { tool: 'modify_project_file', label: 'Modifier src/app.ts', status: 'done' },
        { tool: 'verify_typecheck', label: 'Typecheck', status: 'done' },
      ],
    });
    expect(set.items.some(i => i.id === 'verify')).toBe(false);
    expect(set.items.some(i => i.id === 'commit')).toBe(true);
  });

  it('plafonne à 4 suggestions sans doublon', () => {
    const set = buildProactiveSuggestions({
      transcript: [user('x'), assistant('On continue ?')],
      activity: [
        { tool: 'run_tests', label: 'Tests', status: 'error' },
        { tool: 'write_project_file', label: 'Écrire a.ts', status: 'done' },
      ],
    });
    expect(set.items.length).toBeLessThanOrEqual(4);
    expect(new Set(set.items.map(i => i.id)).size).toBe(set.items.length);
  });
});

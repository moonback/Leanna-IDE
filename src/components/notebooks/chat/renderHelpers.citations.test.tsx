import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildCitationRefMap, renderMessageContent } from './renderHelpers.js';
import type { Citation } from './types.js';

const cit = (id: string, ref?: number): Citation => ({
  sourceId: `src-${id}`, sourceTitle: `Titre ${id}`, chunkId: `chunk-${id}`, excerpt: 'x', relevance: 0.8, ref,
});

describe('buildCitationRefMap', () => {
  it('reproduit l’ordre de première apparition sans champ ref', () => {
    const map = buildCitationRefMap('a [SOURCE 2] [SOURCE 3] b [SOURCE 2] c [SOURCE 1]', [cit('a'), cit('b'), cit('c')]);
    expect(map.get(2)?.chunkId).toBe('chunk-a');
    expect(map.get(3)?.chunkId).toBe('chunk-b');
    expect(map.get(1)?.chunkId).toBe('chunk-c');
  });

  it('utilise le champ ref quand il est présent', () => {
    const map = buildCitationRefMap('[SOURCE 4]', [cit('a', 4)]);
    expect(map.get(4)?.chunkId).toBe('chunk-a');
  });
});

describe('renderMessageContent — marqueurs [SOURCE N]', () => {
  it('rend un bouton cliquable pour une citation connue', () => {
    const onClick = vi.fn();
    const c = cit('a', 1);
    render(renderMessageContent('Texte **gras** [SOURCE 1] et [SOURCE 9]', { byRef: new Map([[1, c]]), onClick }));
    fireEvent.click(screen.getByRole('button', { name: /Afficher la source 1/ }));
    expect(onClick).toHaveBeenCalledWith(c, expect.anything());
    expect(screen.queryByRole('button', { name: /source 9/i })).toBeNull();
    expect(screen.getByText(/\[SOURCE 9\]/)).toBeTruthy();
  });
});

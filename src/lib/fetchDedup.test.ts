import { describe, expect, it } from 'vitest';
import { dedupKeyFor } from './fetchDedup';

const ORIGIN = 'http://127.0.0.1:4000';

describe('dedupKeyFor', () => {
  it('déduplique les GET /api sans signal', () => {
    expect(dedupKeyFor('/api/health', undefined, ORIGIN)).toBe('/api/health');
    expect(dedupKeyFor(`${ORIGIN}/api/x`, { method: 'GET' }, ORIGIN)).toBe(`${ORIGIN}/api/x`);
    expect(dedupKeyFor(new URL(`${ORIGIN}/api/y`), undefined, ORIGIN)).toBe(`${ORIGIN}/api/y`);
  });

  it('ne déduplique ni les mutations ni les URL hors /api', () => {
    expect(dedupKeyFor('/api/x', { method: 'POST' }, ORIGIN)).toBeNull();
    expect(dedupKeyFor('/assets/logo.png', undefined, ORIGIN)).toBeNull();
  });

  it("ne partage jamais une requête annulable (régression AbortError partagée)", () => {
    const controller = new AbortController();
    expect(dedupKeyFor('/api/tokens/optimization', { signal: controller.signal }, ORIGIN)).toBeNull();
    expect(dedupKeyFor(new Request(`${ORIGIN}/api/x`), undefined, ORIGIN)).toBeNull();
  });
});

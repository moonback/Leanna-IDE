import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCodeMapImpact, __clearImpactCache } from './useCodeMapImpact.js';
import { jsonResponse } from '../test/helpers.js';

const report = (name: string) => ({
  targets: [{ id: name, name, kind: 'file', filePath: name, exported: false }],
  unresolved: [], ambiguous: [], impacted: [], impactedFiles: [], testsToRun: [], untestedFiles: [],
  risk: 'low', riskScore: 0, warnings: [], maxDepthReached: false, truncated: false, summary: name,
});

function mockFetch(impl: (body: { targets: string[]; depth: number }) => Response | Promise<Response>) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => impl(JSON.parse(String(init?.body))));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

async function flush(ms = 300) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  __clearImpactCache();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useCodeMapImpact', () => {
  it('ne fait rien sans cible', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ status: 'success', report: report('x') }));
    const { result } = renderHook(() => useCodeMapImpact(null, 3));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ report: null, loading: false, error: null });
  });

  it('attend 300 ms puis envoie targets et depth', async () => {
    const fetchMock = mockFetch((b) => jsonResponse({ status: 'success', report: report(b.targets[0]) }));
    const { result } = renderHook(() => useCodeMapImpact('src/a.ts', 2));
    expect(result.current.loading).toBe(true);
    await flush(299);
    expect(fetchMock).not.toHaveBeenCalled();
    await flush(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/knowledge/code-map/impact');
    expect(JSON.parse(String(init?.body))).toEqual({ targets: ['src/a.ts'], depth: 2 });
    expect(result.current.report?.summary).toBe('src/a.ts');
    expect(result.current.loading).toBe(false);
  });

  it('une seule requête après des changements rapides', async () => {
    const fetchMock = mockFetch((b) => jsonResponse({ status: 'success', report: report(b.targets[0]) }));
    const { result, rerender } = renderHook(({ t }) => useCodeMapImpact(t, 3), { initialProps: { t: 'a.ts' } });
    await flush(100);
    rerender({ t: 'b.ts' });
    await flush(100);
    rerender({ t: 'c.ts' });
    await flush(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.report?.summary).toBe('c.ts');
  });

  it('ignore une réponse arrivée pour une cible périmée', async () => {
    let releaseA: (r: Response) => void = () => {};
    mockFetch((b) => b.targets[0] === 'a.ts'
      ? new Promise<Response>((resolve) => { releaseA = resolve; })
      : jsonResponse({ status: 'success', report: report('b.ts') }));
    const { result, rerender } = renderHook(({ t }) => useCodeMapImpact(t, 3), { initialProps: { t: 'a.ts' } });
    await flush();
    rerender({ t: 'b.ts' });
    await flush();
    await act(async () => { releaseA(jsonResponse({ status: 'success', report: report('a.ts') })); });
    expect(result.current.report?.summary).toBe('b.ts');
  });

  it('réutilise le cache, et refresh le contourne', async () => {
    const fetchMock = mockFetch((b) => jsonResponse({ status: 'success', report: report(b.targets[0]) }));
    const { result, rerender } = renderHook(({ t }) => useCodeMapImpact(t, 3), { initialProps: { t: 'a.ts' } });
    await flush();
    rerender({ t: 'b.ts' });
    await flush();
    rerender({ t: 'a.ts' });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.report?.summary).toBe('a.ts');
    act(() => result.current.refresh());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('expose le message d’erreur du serveur', async () => {
    mockFetch(() => jsonResponse({ error: 'Carte indisponible' }, { ok: false, status: 500 }));
    const { result } = renderHook(() => useCodeMapImpact('a.ts', 3));
    await flush();
    expect(result.current).toMatchObject({ report: null, loading: false, error: 'Carte indisponible' });
  });

  it('traite un 200 sans status success comme une erreur', async () => {
    mockFetch(() => jsonResponse({ status: 'error' }));
    const { result } = renderHook(() => useCodeMapImpact('a.ts', 3));
    await flush();
    expect(result.current.error).toBe('Réponse inattendue du serveur (200)');
  });

  it('survit à un corps non JSON', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) as unknown as Response);
    const { result } = renderHook(() => useCodeMapImpact('a.ts', 3));
    await flush();
    expect(result.current.error).toBe('Réponse inattendue du serveur (200)');
  });
});

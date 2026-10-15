/**
 * useCodeMapImpact — rapport d'impact de la cartographie du code pour une cible
 * (`fichier` ou `fichier#Symbole`). Délai d'attente, annulation des requêtes
 * périmées et petit cache LRU partagé entre les montages du panneau.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeMapImpactReport } from '../types/codeMap.js';

const CACHE_MAX = 20;
const cache = new Map<string, CodeMapImpactReport>();

function cacheGet(key: string): CodeMapImpactReport | undefined {
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); }
  return hit;
}

function cacheSet(key: string, value: CodeMapImpactReport): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/** Réservé aux tests. */
export function __clearImpactCache(): void {
  cache.clear();
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return { 'Content-Type': 'application/json', ...(token ? { 'x-Leanna-token': token } : {}) };
}

export interface CodeMapImpactState {
  report: CodeMapImpactReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCodeMapImpact(target: string | null, depth: number, debounceMs = 300): CodeMapImpactState {
  const [report, setReport] = useState<CodeMapImpactReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!target) {
      setReport(null);
      setLoading(false);
      setError(null);
      return;
    }
    const key = `${target}|${depth}`;
    const force = forceRef.current;
    forceRef.current = false;

    const cached = force ? undefined : cacheGet(key);
    if (cached) {
      setReport(cached);
      setLoading(false);
      setError(null);
      return;
    }

    // L'ancien rapport reste affiché (atténué) pendant le chargement.
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/knowledge/code-map/impact', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ targets: [target], depth }),
          signal: controller.signal,
        });
        const body = await res.json().catch(() => null) as { status?: string; report?: CodeMapImpactReport; error?: string } | null;
        if (controller.signal.aborted) return;
        if (!res.ok || body?.status !== 'success' || !body.report) {
          setReport(null);
          setError(body?.error ?? `Réponse inattendue du serveur (${res.status})`);
        } else {
          cacheSet(key, body.report);
          setReport(body.report);
        }
        setLoading(false);
      } catch (e) {
        if (controller.signal.aborted) return;
        setReport(null);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [target, depth, debounceMs, nonce]);

  return { report, loading, error, refresh };
}

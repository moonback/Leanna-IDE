/**
 * Clé de déduplication des requêtes GET /api concurrentes (intercepteur fetch
 * global de main.tsx). Renvoie null quand la requête ne doit pas être partagée.
 *
 * Une requête porteuse d'un AbortSignal n'est jamais dédupliquée : son
 * annulation rejetterait aussi la promesse partagée avec les autres appelants.
 * Cas typique : en StrictMode, un effet monte (fetch A), son cleanup annule A,
 * puis le remontage relance la même URL (fetch B) → B recevait l'AbortError de
 * A et les données ne se chargeaient jamais.
 */
export function dedupKeyFor(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): string | null {
  if (init && init.method && init.method !== 'GET') return null;
  if (init?.signal) return null;
  // Un objet Request porte toujours son propre signal : on ne le partage pas.
  if (typeof input !== 'string' && !(input instanceof URL)) return null;
  const url = typeof input === 'string' ? input : input.href;
  const isApi = url.startsWith('/api/') || url.startsWith(origin + '/api/');
  if (!isApi) return null;
  return url;
}

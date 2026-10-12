/**
 * ConnectionBanner — informe l'utilisateur quand le backend ou le réseau est
 * indisponible, au lieu de laisser des panneaux vides / des erreurs 503 muettes.
 *
 * Constat d'audit : main.tsx a un circuit-breaker qui renvoie un 503 synthétique
 * (« Redémarrez le backend avec npm run dev ») mais cette information n'atteint
 * jamais l'interface : l'utilisateur voit juste des listes vides.
 *
 * Montage (main.tsx → Layout, juste au-dessus de <GlobalAgentStatusBar />) :
 *   <ConnectionBanner />
 *
 * Sondage léger : GET /api/health toutes les 15 s, seulement fenêtre visible,
 * toutes les 3 s tant que le banner est affiché (reprise rapide).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RefreshCw, WifiOff, ServerCrash } from 'lucide-react';

type Status = 'ok' | 'offline' | 'backend-down';

const POLL_OK_MS = 15_000;
const POLL_DOWN_MS = 3_000;
const FAILS_BEFORE_BANNER = 2; // évite le clignotement sur un échec isolé

export function ConnectionBanner() {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<Status>('ok');
  const [checking, setChecking] = useState(false);
  const failsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  const check = useCallback(async () => {
    if (!aliveRef.current) return;
    setChecking(true);
    let next: Status = 'ok';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      next = 'offline';
    } else {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(to);
        if (!res.ok) next = 'backend-down';
      } catch {
        next = 'backend-down';
      }
    }
    if (!aliveRef.current) return;
    setChecking(false);
    if (next === 'ok') {
      failsRef.current = 0;
      setStatus('ok');
    } else {
      failsRef.current += 1;
      if (failsRef.current >= FAILS_BEFORE_BANNER || next === 'offline') setStatus(next);
    }
  }, []);

  // Boucle de sondage adaptative
  useEffect(() => {
    aliveRef.current = true;
    const loop = () => {
      const delay = failsRef.current > 0 ? POLL_DOWN_MS : POLL_OK_MS;
      timerRef.current = setTimeout(async () => {
        if (document.visibilityState === 'visible') await check();
        loop();
      }, delay);
    };
    void check();
    loop();
    const onNet = () => { failsRef.current = 0; void check(); };
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, [check]);

  const down = status !== 'ok';
  const Icon = status === 'offline' ? WifiOff : ServerCrash;
  const message = status === 'offline'
    ? 'Vous êtes hors ligne. Les actions nécessitant le réseau sont suspendues.'
    : 'Le service Leanna ne répond pas. Vos données locales sont conservées.';

  return (
    <AnimatePresence initial={false}>
      {down && (
        <motion.div
          role="status" aria-live="polite"
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 overflow-hidden"
          style={{ zIndex: 'var(--z-sticky)' }}
        >
          <div
            className="flex items-center gap-3 border-b px-4 py-2 text-sm"
            style={{
              borderColor: 'var(--border-base)',
              background: 'color-mix(in srgb, var(--color-warning, #f59e0b) 14%, var(--bg-base))',
              color: 'var(--text-primary)',
            }}
          >
            <Icon aria-hidden="true" className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--color-warning, #f59e0b)' }} />
            <span className="min-w-0 flex-1 truncate">{message}</span>
            {status === 'backend-down' && (
              <code className="hidden rounded px-1.5 py-0.5 text-xs md:inline"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                npm run dev
              </code>
            )}
            <button
              type="button" onClick={() => { failsRef.current = 0; void check(); }} disabled={checking}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
              Réessayer
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ConnectionBanner;

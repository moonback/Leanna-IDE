/**
 * RouteProgress — fine barre d'accent en haut de la fenêtre à chaque
 * changement de vue. Donne un retour immédiat pendant le chargement lazy
 * des vues (Suspense) et la transition de page.
 *
 * Aucun impact fonctionnel : pointer-events none, aria-hidden.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export function RouteProgress() {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const [runId, setRunId] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    // Pas de barre au tout premier rendu (le splash Electron s'en charge).
    if (first.current) { first.current = false; return; }
    setRunId((n) => n + 1);
  }, [pathname]);

  if (reduceMotion) return null;

  return (
    <AnimatePresence>
      {runId > 0 && (
        <motion.div
          key={runId}
          className="lea-route-progress"
          aria-hidden="true"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{
            scaleX: [0, 0.65, 0.9, 1],
            opacity: [1, 1, 1, 0],
          }}
          transition={{ duration: 0.75, times: [0, 0.35, 0.7, 1], ease: [0.16, 1, 0.3, 1] }}
        />
      )}
    </AnimatePresence>
  );
}

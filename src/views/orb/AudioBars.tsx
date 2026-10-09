import { useMemo } from 'react';
import { motion } from 'motion/react';

/**
 * Visualiseur audio minimaliste — barres symétriques réactives au niveau sonore.
 * Reste discret au repos (faible opacité) et respecte prefers-reduced-motion.
 */
export function AudioBars({ level, color, active, reduceMotion }: {
  level: number; color: string; active: boolean; reduceMotion: boolean;
}) {
  const weights = useMemo(() => [0.35, 0.55, 0.78, 0.95, 1, 0.95, 0.78, 0.55, 0.35], []);
  return (
    <div className="flex items-end justify-center gap-[3px]" style={{ height: 22 }} aria-hidden>
      {weights.map((w, i) => {
        const target = active ? Math.max(0.1, Math.min(1, level * w * 2.4)) : 0.1;
        return (
          <motion.span
            key={i}
            className="w-[3px] rounded-full"
            style={{ backgroundColor: color, transformOrigin: 'bottom', opacity: active ? 0.85 : 0.3 }}
            animate={reduceMotion ? { height: 5 } : { height: 4 + target * 18 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          />
        );
      })}
    </div>
  );
}

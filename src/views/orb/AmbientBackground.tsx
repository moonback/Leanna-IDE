import { motion } from 'motion/react';

/**
 * Fond d'ambiance animé : halos colorés qui dérivent lentement (teinte = état
 * de la mascotte) et trame de points discrète. Purement décoratif.
 */
export function AmbientBackground({ accentColor, amp, active, reduceMotion }: {
  accentColor: string; amp: number; active: boolean; reduceMotion: boolean;
}) {
  const blobs = [
    { size: '62vmax', left: '-18%', top: '-22%', drift: [0, 40, -20, 0], dur: 22, alt: false },
    { size: '52vmax', left: '55%', top: '40%', drift: [0, -50, 30, 0], dur: 26, alt: true },
    { size: '40vmax', left: '10%', top: '60%', drift: [0, 30, 50, 0], dur: 30, alt: false },
  ];
  const strength = (active ? 18 : 10) + Math.round(Math.min(1, amp * 2) * 14);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {blobs.map((b, i) => (
        <motion.div key={i} className="absolute rounded-full"
          style={{
            width: b.size, height: b.size, left: b.left, top: b.top, filter: 'blur(70px)',
            background: `radial-gradient(circle, color-mix(in srgb, ${b.alt ? 'var(--color-accent-alt)' : accentColor} ${strength}%, transparent), transparent 65%)`,
            transition: 'background 600ms ease',
          }}
          animate={reduceMotion ? undefined : { x: b.drift, y: [...b.drift].reverse() }}
          transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <div className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(color-mix(in srgb, var(--text-primary) 9%, transparent) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }} />
    </div>
  );
}

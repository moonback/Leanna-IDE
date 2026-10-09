import { motion } from 'motion/react';
import { MicOff } from 'lucide-react';

/**
 * Orbe central réactif à l'audio. Design minimaliste : une sphère en dégradé,
 * un fin anneau orbital, et deux ondes de pulsation discrètes quand actif.
 * La lueur et l'échelle suivent l'amplitude audio.
 */
export function Orb({ amp, accentColor, status, muted, onClick, reduceMotion }: {
  amp: number; accentColor: string; status: string; muted: boolean; onClick: () => void; reduceMotion: boolean;
}) {
  const scale = 1 + Math.min(0.16, amp * 0.55);
  const glow = 0.28 + Math.min(0.45, amp * 1.1);
  const pulsing = status === 'online' || status === 'listening' || status === 'speaking' || status === 'busy';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="group relative flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-base)]"
      style={{ width: 216, height: 216, cursor: 'pointer' }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      aria-label={status === 'idle' ? 'Connecter la présence vocale' : 'Déconnecter la présence vocale'}
    >
      {/* Anneau orbital statique */}
      <span className="absolute inset-4 rounded-full" style={{ border: `1px solid color-mix(in srgb, ${accentColor} 20%, transparent)` }} aria-hidden />

      {/* Ondes de pulsation */}
      {!reduceMotion && pulsing && (
        <>
          <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.14 }}
            animate={{ scale: [1, 1.28, 1], opacity: [0.14, 0, 0.14] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }} />
          <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.09 }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.09, 0, 0.09] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut', delay: 0.8 }} />
        </>
      )}

      <motion.span
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 160, height: 160,
          background: `radial-gradient(circle at 34% 28%, color-mix(in srgb, ${accentColor} 90%, white), ${accentColor} 56%, color-mix(in srgb, ${accentColor} 44%, black))`,
          boxShadow: `0 0 ${40 + amp * 110}px color-mix(in srgb, ${accentColor} ${Math.round(glow * 100)}%, transparent), inset 0 2px 22px color-mix(in srgb, white 26%, transparent), inset 0 -8px 22px color-mix(in srgb, black 20%, transparent)`,
        }}
        animate={reduceMotion ? undefined : { scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        {/* Reflet lumineux */}
        <span className="absolute rounded-full" style={{ width: 60, height: 60, top: 26, left: 36, background: 'radial-gradient(circle, color-mix(in srgb, white 55%, transparent), transparent 70%)' }} aria-hidden />
        {muted && (
          <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full shadow-md"
            style={{ backgroundColor: 'var(--color-warning)', color: 'var(--bg-base)', border: '2px solid var(--bg-base)' }} title="Micro coupé">
            <MicOff className="h-4 w-4" />
          </span>
        )}
      </motion.span>
    </motion.button>
  );
}

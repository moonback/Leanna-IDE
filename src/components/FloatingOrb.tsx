import { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { useProfile } from '../context/UserProfileContext.js';
import { useOrbState } from '../hooks/useOrbState.js';

/**
 * Floating draggable orb — visible across non-hub views.
 * Shows connection status + audio activity. Click to connect/disconnect.
 * Drag to reposition anywhere on screen.
 *
 * Compact self-contained sphere (48px) rendered with design tokens — no
 * external OrbCore dependency.
 */
export function FloatingOrb() {
  const orb = useOrbState();
  const { profile } = useProfile();

  const constraintRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('Leanna_orb_position');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { x: 0, y: 0 };
  });

  const { isConnected, isConnecting, statusLabel, toggleConnection } = orb;

  // Save position when drag ends
  const handleDragEnd = useCallback((_: any, info: any) => {
    const newPos = { x: info.offset.x + position.x, y: info.offset.y + position.y };
    setPosition(newPos);
    localStorage.setItem('Leanna_orb_position', JSON.stringify(newPos));
  }, [position]);

  return (
    <>
      {/* Invisible full-screen constraint boundary */}
      <div
        ref={constraintRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 'var(--z-orb-constraint)' as any }}
        aria-hidden
      />

      {/* Floating orb */}
      <motion.div
        layoutId="Leanna-orb"
        drag
        dragMomentum={false}
        dragElastic={0.05}
        dragConstraints={constraintRef}
        whileDrag={{ scale: 1.08, cursor: 'grabbing' }}
        onDragEnd={handleDragEnd}
        onClick={toggleConnection}
        className="fixed pointer-events-auto select-none"
        style={{ zIndex: 'var(--z-orb)' as any, bottom: 24, right: 24, cursor: isConnecting ? 'wait' : 'grab' }}
        title={`Leanna — ${statusLabel}. Cliquer pour ${isConnected ? 'déconnecter' : 'connecter'}. Glisser pour déplacer.`}
        role="button"
        aria-label={`Leanna ${statusLabel}`}
        tabIndex={0}
      >
        {/* Orb body — compact sphere using design tokens */}
        <motion.div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 48,
            height: 48,
            background:
              'radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--accent-primary) 90%, white), var(--accent-primary) 56%, color-mix(in srgb, var(--accent-primary) 44%, black))',
            boxShadow:
              '0 0 20px color-mix(in srgb, var(--accent-primary) 40%, transparent), inset 0 1px 8px color-mix(in srgb, white 26%, transparent), inset 0 -4px 10px color-mix(in srgb, black 20%, transparent)',
          }}
          animate={isConnected || isConnecting ? { scale: [1, 1.06, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden
        >
          {/* Highlight reflection */}
          <span
            className="absolute rounded-full"
            style={{
              width: 18,
              height: 18,
              top: 8,
              left: 11,
              background: 'radial-gradient(circle, color-mix(in srgb, white 55%, transparent), transparent 70%)',
            }}
            aria-hidden
          />
        </motion.div>

        {/* Status dot */}
        <motion.div
          className="absolute -bottom-0.5 -right-0.5 rounded-full"
          style={{
            width: 12,
            height: 12,
            backgroundColor: isConnected
              ? 'var(--color-success)'
              : isConnecting
              ? 'var(--color-warning)'
              : 'var(--text-muted)',
            border: '2px solid var(--bg-base)',
          }}
          animate={isConnected || isConnecting ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        {/* Provider badge */}
        <div
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-mono font-bold uppercase tracking-wide select-none pointer-events-none"
          style={{
            backgroundColor: profile.textProvider === 'openrouter' ? 'var(--accent-secondary)' : 'var(--color-success)',
            color: 'var(--bg-base)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {profile.textProvider === 'openrouter' ? (profile.openrouterModel?.split('/').pop() || 'OR') : 'Gemini'}
        </div>
      </motion.div>
    </>
  );
}

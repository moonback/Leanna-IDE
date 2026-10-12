import { memo } from 'react';
import { motion } from 'motion/react';

export interface BreathingDotsProps {
  color: string;
  reduceMotion: boolean;
  size?: number;
}

/** Trois points animés (respiration) utilisés comme indicateur d'activité. */
export const BreathingDots = memo(function BreathingDots({
  color,
  reduceMotion,
  size = 6,
}: BreathingDotsProps) {
  const dot = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    backgroundColor: color,
  };

  if (reduceMotion) {
    return (
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map(i => <div key={i} style={{ ...dot, opacity: 0.5 }} />)}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={dot}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
});

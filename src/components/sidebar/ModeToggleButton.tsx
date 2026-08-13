/**
 * ModeToggleButton — Toggle visuel Agent/Chat mode.
 * Extrait pour réduire la taille de la sidebar principale.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface ModeToggleButtonProps {
  mode: 'full' | 'ask';
  onToggle: () => void;
}

export function ModeToggleButton({ mode, onToggle }: ModeToggleButtonProps) {
  const [hovered, setHovered] = useState(false);
  const isFull = mode === 'full';

  return (
    <div
      className="relative w-full h-[44px] flex items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={onToggle}
        className="w-[36px] h-[20px] rounded-full relative flex items-center overflow-hidden flex-shrink-0"
        style={{
          backgroundColor: isFull
            ? 'color-mix(in srgb, #fbbf24 18%, transparent)'
            : 'color-mix(in srgb, #60a5fa 18%, transparent)',
          border: `1px solid ${isFull ? '#fbbf2450' : '#60a5fa50'}`,
          boxShadow: isFull
            ? '0 0 8px #fbbf2430'
            : '0 0 8px #60a5fa30',
          transition: 'background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
        }}
        title={`Mode actuel : ${isFull ? '⚡ Agent' : '💬 Chat'} — clic pour basculer`}
        aria-label={`Basculer le mode : ${isFull ? 'Agent' : 'Chat'}`}
      >
        {/* Track labels */}
        <span
          className="absolute left-[4px] text-[6px] font-bold uppercase tracking-wide pointer-events-none select-none"
          style={{
            color: isFull ? '#fbbf24' : 'transparent',
            transition: 'color 0.2s ease',
          }}
          aria-hidden="true"
        >
          ⚡
        </span>
        <span
          className="absolute right-[4px] text-[6px] font-bold uppercase tracking-wide pointer-events-none select-none"
          style={{
            color: !isFull ? '#60a5fa' : 'transparent',
            transition: 'color 0.2s ease',
          }}
          aria-hidden="true"
        >
          💬
        </span>

        {/* Thumb */}
        <motion.div
          className="w-[14px] h-[14px] rounded-full absolute top-[2px]"
          animate={{ left: isFull ? '2px' : '20px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            backgroundColor: isFull ? '#fbbf24' : '#60a5fa',
            boxShadow: isFull ? '0 0 8px #fbbf2480' : '0 0 8px #60a5fa80',
          }}
        />
      </motion.button>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, x: -6, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute left-full ml-2.5 pointer-events-none z-[200] whitespace-nowrap"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
            role="tooltip"
          >
            <div
              className="absolute top-1/2 -left-[4px] -translate-y-1/2"
              style={{
                width: 0, height: 0,
                borderTop: '4px solid transparent',
                borderBottom: '4px solid transparent',
                borderRight: '4px solid var(--border-strong)',
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-1/2 -left-[2px] -translate-y-1/2"
              style={{
                width: 0, height: 0,
                borderTop: '3px solid transparent',
                borderBottom: '3px solid transparent',
                borderRight: '3px solid var(--bg-ctrl)',
              }}
              aria-hidden="true"
            />
            <div
              className="px-2.5 py-1.5 rounded-lg"
              style={{
                backgroundColor: 'var(--bg-ctrl)',
                border: '1px solid var(--border-strong)',
                boxShadow: 'var(--shadow-md)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Mode : <span style={{ color: isFull ? '#fbbf24' : '#60a5fa' }}>{isFull ? '⚡ Agent' : '💬 Chat'}</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

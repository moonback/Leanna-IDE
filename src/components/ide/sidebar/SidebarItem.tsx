import { useRef, useState } from 'react';
import { ChevronRight, Brain, MessageCirclePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { LucideIcon } from 'lucide-react';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SidebarItemProps {
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  title: string;
  /** Color of a small dot indicator */
  dot?: string;
  /** Show a small chevron indicating a submenu */
  hasSubmenu?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SidebarItem({ icon: Icon, active, onClick, title, dot, hasSubmenu }: SidebarItemProps) {
  const [hovered, setHovered] = useState(false);
  const [ripple, setRipple] = useState(false);
  const rippleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = () => {
    setRipple(true);
    if (rippleRef.current) clearTimeout(rippleRef.current);
    rippleRef.current = setTimeout(() => setRipple(false), 400);
    onClick();
  };

  return (
    <div
      className="relative w-full h-[44px] flex items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Active indicator bar — glowing left edge */}
      {active && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute left-0 rounded-r"
          style={{
            width: '3px',
            height: '22px',
            backgroundColor: 'var(--accent-primary)',
            boxShadow: '0 0 10px var(--accent-primary), 0 0 20px var(--accent-glow)',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      )}

      {/* Hover background glow */}
      <AnimatePresence>
        {hovered && !active && (
          <motion.div
            className="absolute inset-y-[4px] inset-x-[6px] rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ backgroundColor: 'var(--ctrl-hover)' }}
          />
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={handleClick}
        whileTap={{ scale: 0.92 }}
        className="w-[36px] h-[36px] flex items-center justify-center rounded-[12px] relative overflow-hidden"
        style={{
          backgroundColor: active ? 'var(--bg-panel)' : 'transparent',
          border: active ? '1px solid var(--accent-primary)' : '1px solid transparent',
          boxShadow: active
            ? '0 0 0 1px rgba(56,189,248,0.12), 0 8px 20px rgba(56,189,248,0.08)'
            : 'none',
          transition: 'background-color 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        }}
        aria-label={title}
        aria-current={active ? 'page' : undefined}
        aria-pressed={active}
      >
        {/* Ripple effect on click */}
        <AnimatePresence>
          {ripple && (
            <motion.div
              className="absolute inset-0 rounded-[14px] pointer-events-none"
              initial={{ opacity: 0.35, scale: 0.5 }}
              animate={{ opacity: 0, scale: 2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              style={{ backgroundColor: 'var(--accent-primary)' }}
            />
          )}
        </AnimatePresence>

        <motion.div
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={active ? { duration: 0.28, ease: 'easeOut' } : { duration: 0.2 }}
        >
          <Icon
            size={17}
            style={{
              color: active
                ? 'var(--accent-primary)'
                : hovered
                  ? 'var(--ctrl-icon-hover)'
                  : 'var(--ctrl-icon)',
              filter: active
                ? 'drop-shadow(0 0 5px var(--accent-glow))'
                : hovered
                  ? 'drop-shadow(0 0 3px var(--accent-glow))'
                  : 'none',
              transition: 'color 0.15s ease, filter 0.2s ease',
            }}
          />
        </motion.div>

        {/* Dot indicator */}
        {dot && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute top-[5px] right-[5px] w-[6px] h-[6px] rounded-full"
            style={{
              backgroundColor: dot,
              boxShadow: `0 0 6px ${dot}80`,
            }}
          />
        )}

        {/* Submenu chevron */}
        {hasSubmenu && (
          <div className="absolute bottom-[3px] right-[3px]">
            <ChevronRight
              size={8}
              style={{
                color: active ? 'var(--accent-primary)' : 'var(--text-dimmed)',
                opacity: hovered || active ? 1 : 0.5,
                transition: 'opacity 0.15s ease',
              }}
            />
          </div>
        )}
      </motion.button>
    </div>
  );
}

// ─── Status Indicator ─────────────────────────────────────────────────────────

interface SidebarStatusIndicatorProps {
  connected: boolean;
  working: boolean;
  muted: boolean;
  onClick: () => void;
  onContextMenu: () => void;
  onMuteToggle: () => void;
}

export function SidebarStatusIndicator({
  connected,
  working,
  muted,
  onClick,
  onContextMenu,
  onMuteToggle,
}: SidebarStatusIndicatorProps) {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (!connected) onClick();
    else onMuteToggle();
  };

  // ── Connected state — compact, informative ──
  if (connected) {
    return (
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.9 }}
        className="flex items-center justify-center w-[42px] h-[42px] rounded-[14px] relative overflow-hidden"
        style={{
          backgroundColor: 'var(--nav-active-bg)',
          border: '1px solid var(--accent-primary)',
          boxShadow: '0 0 0 1px rgba(56,189,248,0.18), 0 0 16px rgba(56,189,248,0.08)',
          cursor: 'pointer',
          transition: 'background-color 0.25s ease, box-shadow 0.3s ease',
        }}
        type="button"
        aria-label={muted ? 'Reactiver le micro' : 'Couper le micro'}
        aria-pressed={true}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(); }}
      >
        {/* Pulsing ring */}
        <motion.div
          className="absolute inset-0 rounded-[14px] pointer-events-none"
          style={{ border: '1px solid var(--accent-primary)' }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.15, 0.45, 0.15] }}
          transition={{ duration: working ? 1.4 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Icon */}
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Brain
            size={18}
            style={{
              color: 'var(--accent-primary)',
              filter: hovered
                ? 'drop-shadow(0 0 8px var(--accent-glow))'
                : 'drop-shadow(0 0 4px var(--accent-glow))',
              transition: 'filter 0.2s ease',
            }}
          />
        </motion.div>

        {/* Status dot */}
        <div className="absolute top-[4px] right-[4px]">
          <motion.div
            className="absolute inset-0 w-[7px] h-[7px] rounded-full"
            style={{ backgroundColor: muted ? '#f59e0b' : working ? 'var(--accent-primary)' : '#10b981' }}
            animate={{ scale: [1, 2.5, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: working ? 1 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div
            className="w-[7px] h-[7px] rounded-full relative"
            style={{
              backgroundColor: muted ? '#f59e0b' : working ? 'var(--accent-primary)' : '#10b981',
              boxShadow: `0 0 6px ${muted ? '#f59e0b80' : working ? 'var(--accent-glow)' : '#10b98180'}`,
            }}
          />
        </div>
      </motion.button>
    );
  }

  // ── Disconnected state — bouton d'activation premium ──
  return (
    <motion.button
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      className="flex items-center justify-center w-[42px] h-[42px] rounded-[16px] relative overflow-hidden"
      style={{
        background: hovered
          ? 'linear-gradient(135deg, rgba(56,189,248,0.22) 0%, rgba(168,85,247,0.18) 50%, rgba(56,189,248,0.22) 100%)'
          : 'linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(168,85,247,0.08) 50%, rgba(56,189,248,0.12) 100%)',
        border: '1.5px solid',
        borderColor: hovered ? 'rgba(56,189,248,0.6)' : 'rgba(56,189,248,0.35)',
        boxShadow: hovered
          ? '0 0 20px rgba(56,189,248,0.25), 0 0 40px rgba(168,85,247,0.12), inset 0 1px 0 rgba(255,255,255,0.1)'
          : '0 0 12px rgba(56,189,248,0.12), 0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
        cursor: 'pointer',
        transition: 'background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
      }}
      type="button"
      aria-label="Activer l'agent IA"
      aria-pressed={false}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(); }}
    >
      {/* Animated gradient sweep */}
      <motion.div
        className="absolute inset-0 rounded-[16px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.15) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
        animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
      />

      {/* Outer breathing ring — invitation pulse */}
      <motion.div
        className="absolute inset-[-3px] rounded-[18px] pointer-events-none"
        style={{
          border: '1.5px solid rgba(56,189,248,0.3)',
          background: 'transparent',
        }}
        animate={{
          scale: [1, 1.12, 1],
          opacity: [0.3, 0.7, 0.3],
          borderColor: [
            'rgba(56,189,248,0.3)',
            'rgba(168,85,247,0.5)',
            'rgba(56,189,248,0.3)',
          ],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Second ring — staggered for depth */}
      <motion.div
        className="absolute inset-[-6px] rounded-[20px] pointer-events-none"
        style={{
          border: '1px solid rgba(56,189,248,0.15)',
          background: 'transparent',
        }}
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.15, 0.4, 0.15],
        }}
        transition={{ duration: 2.5, delay: 0.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Icon with gentle float */}
      <motion.div
        animate={{
          y: [0, -1.5, 0],
          scale: [1, 1.06, 1],
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <MessageCirclePlus
          size={19}
          style={{
            color: hovered ? '#38bdf8' : 'var(--accent-primary)',
            filter: hovered
              ? 'drop-shadow(0 0 10px rgba(56,189,248,0.7)) drop-shadow(0 0 20px rgba(168,85,247,0.3))'
              : 'drop-shadow(0 0 5px var(--accent-glow))',
            transition: 'color 0.2s ease, filter 0.3s ease',
          }}
        />
      </motion.div>

      {/* Animated "+" badge — invitation to connect */}
      <motion.div
        className="absolute bottom-[2px] right-[2px] w-[11px] h-[11px] rounded-full flex items-center justify-center"
        style={{
          background: hovered
            ? 'linear-gradient(135deg, #38bdf8, #a855f7)'
            : 'var(--accent-primary)',
          boxShadow: hovered
            ? '0 0 8px rgba(56,189,248,0.6), 0 0 16px rgba(168,85,247,0.3)'
            : '0 0 6px rgba(56,189,248,0.4)',
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.85, 1, 0.85],
        }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="text-[7px] font-black text-white leading-none select-none" aria-hidden="true">+</span>
      </motion.div>

      {/* Hover sparkle particles */}
      <AnimatePresence>
        {hovered && (
          <>
            <motion.div
              className="absolute w-[3px] h-[3px] rounded-full pointer-events-none"
              style={{ backgroundColor: '#38bdf8', top: '6px', left: '8px' }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0], y: [-2, -8] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute w-[2px] h-[2px] rounded-full pointer-events-none"
              style={{ backgroundColor: '#a855f7', top: '10px', right: '7px' }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.8, 0], y: [-1, -6] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute w-[2px] h-[2px] rounded-full pointer-events-none"
              style={{ backgroundColor: '#38bdf8', bottom: '8px', left: '6px' }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 0.8, 0], scale: [0, 1.3, 0], y: [0, -5] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.25, ease: 'easeOut' }}
            />
          </>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';

// ─── FlyoutMenu Container ────────────────────────────────────────────────────

interface FlyoutMenuProps {
  children: React.ReactNode;
  align?: 'center' | 'bottom';
}

export function FlyoutMenu({ children, align = 'center' }: FlyoutMenuProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -12, scale: 0.92 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute left-full ml-2 flex flex-col z-50 overflow-hidden"
      style={{
        ...(align === 'bottom' ? { bottom: 0 } : { top: '50%', transform: 'translateY(-50%)' }),
        minWidth: '220px',
        backgroundColor: 'var(--bg-ctrl)',
        border: '1px solid var(--border-strong)',
        borderRadius: '16px',
        boxShadow: '0 18px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.12)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
      }}
    >
      {children}
    </motion.div>
  );
}

// ─── FlyoutHeader ────────────────────────────────────────────────────────────

export function FlyoutHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-4 pt-3 pb-2.5 flex items-center justify-between select-none"
      style={{ borderBottom: '1px solid var(--border-base)' }}
    >
      <span
        className="text-[9.5px] font-bold uppercase tracking-[0.15em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {children}
      </span>
    </div>
  );
}

// ─── FlyoutItem ──────────────────────────────────────────────────────────────

interface FlyoutItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
  mono?: boolean;
  /** Optional color dot indicator (e.g. '#0ea5e9') */
  dot?: string;
}

export function FlyoutItem({ icon: Icon, label, active, onClick, danger, mono, dot }: FlyoutItemProps) {
  return (
    <button
      className={`group flex items-center gap-3 px-3 py-2 text-left w-full transition duration-[250ms] ${mono ? 'font-mono text-[11px]' : 'text-[11.5px]'}`}
      style={{
        color: danger ? 'var(--color-error)' : active ? 'var(--text-primary)' : 'var(--text-secondary)',
        backgroundColor: active ? 'var(--nav-active-bg)' : 'transparent',
        margin: '0.25rem 0.25rem',
        width: 'calc(100% - 0.5rem)',
        borderRadius: '12px',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {/* Icon badge */}
      <div
        className="w-[26px] h-[26px] rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-100"
        style={{
          backgroundColor: danger
            ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
            : active
              ? 'var(--accent-subtle)'
              : 'var(--bg-input)',
        }}
      >
        <Icon
          size={13}
          style={{
            color: danger
              ? 'var(--color-error)'
              : active
                ? 'var(--accent-primary)'
                : 'var(--text-muted)',
            filter: active ? 'drop-shadow(0 0 4px var(--accent-glow))' : 'none',
            transition: 'filter 0.25s ease',
          }}
        />
      </div>

      <span className="flex-1 truncate font-medium">{label}</span>

      {dot && (
        <span
          className="ml-1 h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dot, boxShadow: `0 0 5px ${dot}80` }}
        />
      )}

      {active && !dot && (
        <div
          className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{
            backgroundColor: 'var(--accent-primary)',
            boxShadow: '0 0 8px var(--accent-glow)',
          }}
        />
      )}
    </button>
  );
}

// ─── FlyoutSeparator ─────────────────────────────────────────────────────────

export function FlyoutSeparator() {
  return (
    <div className="my-1 mx-4 h-px" style={{ backgroundColor: 'var(--border-base)', opacity: 0.6 }} />
  );
}

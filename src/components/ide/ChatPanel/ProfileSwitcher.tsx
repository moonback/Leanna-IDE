import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Shield, Wrench, Eye, Blocks, Gauge, GraduationCap,
  ChevronDown, Check,
} from 'lucide-react';
import {
  BEHAVIOR_PROFILES, DEFAULT_PROFILE_ID, getProfile, type ProfileIcon,
} from './behaviorProfiles.js';

// ─── Sélecteur de profil de comportement (feature #7) ────────────────────────
//
// Pastille compacte dans l'en-tête du chat : affiche le profil actif et déroule
// la liste des profils. La sélection applique la surcouche de prompt système
// correspondante (via le parent) ; « Standard » réinitialise au comportement
// d'origine. Désactivé hors connexion (l'override agit sur la session en cours).

const ICONS: Record<ProfileIcon, React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>> = {
  sparkles: Sparkles,
  shield: Shield,
  wrench: Wrench,
  eye: Eye,
  blocks: Blocks,
  gauge: Gauge,
  graduation: GraduationCap,
};

export interface ProfileSwitcherProps {
  /** Identifiant du profil actif. */
  activeId: string;
  /** Session connectée ? (l'override s'applique à la conversation en cours). */
  connected: boolean;
  reduceMotion?: boolean;
  /** Applique un profil (le parent déclenche l'override / le reset). */
  onSelect: (id: string) => void;
}

export function ProfileSwitcher({
  activeId, connected, reduceMotion = false, onSelect,
}: ProfileSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = getProfile(activeId);
  const ActiveIcon = ICONS[active.icon];
  const isDefault = active.id === DEFAULT_PROFILE_ID;

  // Fermeture au clic extérieur + touche Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: string) => { onSelect(id); setOpen(false); };

  return (
    <div className="relative min-w-0 flex-shrink" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 h-5.5 pl-1.5 pr-1 rounded-full text-[11px] font-medium transition-colors max-w-full min-w-0"
        style={{
          color: isDefault ? 'var(--text-muted)' : 'var(--accent-primary)',
          backgroundColor: isDefault
            ? 'color-mix(in srgb, var(--text-muted) 10%, transparent)'
            : 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
          border: `1px solid ${isDefault ? 'var(--border-base)' : 'color-mix(in srgb, var(--accent-primary) 35%, transparent)'}`,
        }}
        title={`Profil de comportement : ${active.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ActiveIcon size={11} className="flex-shrink-0" />
        <span className="max-w-[76px] sm:max-w-[92px] truncate">{active.label}</span>
        <ChevronDown size={10} className="flex-shrink-0" style={{ opacity: 0.7 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.13 }}
            className="absolute left-0 top-full mt-1.5 w-60 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden z-50 shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-base)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
            }}
          >
            <div className="px-3 pt-2 pb-1">
              <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                Profil de comportement
              </span>
            </div>

            {!connected && (
              <p className="px-3 pb-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                Connecte la session pour changer de profil.
              </p>
            )}

            <div className="max-h-[320px] overflow-y-auto custom-scrollbar pb-1">
              {BEHAVIOR_PROFILES.map((p) => {
                const Icon = ICONS[p.icon];
                const isActive = p.id === activeId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => pick(p.id)}
                    disabled={!connected && p.id !== DEFAULT_PROFILE_ID}
                    className="flex items-start gap-2.5 w-full px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        backgroundColor: isActive
                          ? 'color-mix(in srgb, var(--accent-primary) 16%, transparent)'
                          : 'var(--bg-active)',
                      }}
                    >
                      <Icon size={13} style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {p.label}
                        </span>
                        {isActive && <Check size={12} style={{ color: 'var(--accent-primary)' }} />}
                      </span>
                      <span className="block text-xs leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {p.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

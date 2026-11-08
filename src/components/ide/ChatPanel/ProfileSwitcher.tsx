import {
  Sparkles, Shield, Wrench, Eye, Blocks, Gauge, GraduationCap,
  ChevronRight, Check,
} from 'lucide-react';
import { Modal } from '../../ui/Modal.js';
import {
  BEHAVIOR_PROFILES, DEFAULT_PROFILE_ID, getProfile, type ProfileIcon,
} from './behaviorProfiles.js';

// ─── Sélecteur de profil de comportement (feature #7) ────────────────────────
//
// Déclenché depuis le menu « Plus d'options » du ChatPanel : l'entrée
// `ProfileMenuSection` ouvre une modale (`ProfileModal`) listant les profils.
// La sélection applique la surcouche de prompt système correspondante (via le
// parent) ; « Standard » réinitialise au comportement d'origine. La liste est
// désactivée hors connexion (l'override agit sur la session en cours).

const ICONS: Record<ProfileIcon, React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>> = {
  sparkles: Sparkles,
  shield: Shield,
  wrench: Wrench,
  eye: Eye,
  blocks: Blocks,
  gauge: Gauge,
  graduation: GraduationCap,
};

// ─── Entrée de menu « Comportement » ─────────────────────────────────────────

export interface ProfileMenuSectionProps {
  /** Identifiant du profil actif (affiché en libellé secondaire). */
  activeId: string;
  /** Ouvre la modale de sélection (le parent ferme aussi le menu). */
  onOpenModal: () => void;
}

/** Ligne du menu « Plus d'options » : ouvre la modale des profils au clic. */
export function ProfileMenuSection({ activeId, onOpenModal }: ProfileMenuSectionProps) {
  const active = getProfile(activeId);
  const ActiveIcon = ICONS[active.icon];

  return (
    <button
      type="button"
      onClick={onOpenModal}
      className="flex items-center gap-3 w-full px-3 py-2 text-sm transition-colors text-left hover:bg-[var(--bg-hover)]"
      style={{ color: 'var(--text-primary)' }}
      title={`Profil de comportement : ${active.label}`}
    >
      <ActiveIcon size={13} style={{ color: 'var(--accent-primary)' }} />
      <span className="flex-1">Comportement</span>
      <span className="text-xs truncate max-w-[80px]" style={{ color: 'var(--text-dimmed)' }}>
        {active.label}
      </span>
      <ChevronRight size={13} style={{ color: 'var(--text-dimmed)' }} />
    </button>
  );
}

// ─── Modale de sélection de profil ───────────────────────────────────────────

export interface ProfileModalProps {
  /** Modale ouverte ? */
  open: boolean;
  /** Identifiant du profil actif. */
  activeId: string;
  /** Session connectée ? (l'override s'applique à la conversation en cours). */
  connected: boolean;
  /** Ferme la modale. */
  onClose: () => void;
  /** Applique un profil (le parent déclenche l'override / le reset). */
  onSelect: (id: string) => void;
}

/** Modale listant les profils de comportement. */
export function ProfileModal({
  open, activeId, connected, onClose, onSelect,
}: ProfileModalProps) {
  // Sélection : applique le profil puis ferme la modale.
  const pick = (id: string) => { onSelect(id); onClose(); };

  return (
    // zIndex explicite : le ChatPanel est un panneau flottant au-dessus des
    // paliers standard ; on force la modale encore au-dessus.
    <Modal open={open} onClose={onClose} title="Profil de comportement" size="sm" zIndex={10000}>
      <Modal.Body noPadding>
        {!connected && (
          <p className="px-5 py-3 text-xs" style={{ color: 'var(--text-dimmed)' }}>
            Connecte la session pour changer de profil.
          </p>
        )}

        <div className="py-1">
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
                className="flex items-start gap-3 w-full px-5 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    backgroundColor: isActive
                      ? 'color-mix(in srgb, var(--accent-primary) 16%, transparent)'
                      : 'var(--bg-active)',
                  }}
                >
                  <Icon size={14} style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {p.label}
                    </span>
                    {isActive && <Check size={13} style={{ color: 'var(--accent-primary)' }} />}
                  </span>
                  <span className="block text-xs leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {p.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Modal.Body>
    </Modal>
  );
}

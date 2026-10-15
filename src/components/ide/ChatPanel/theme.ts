// ─── Design tokens du ChatPanel ────────────────────────────────────────────────
// Constantes de style partagées par tous les sous-composants du chat.
// Centralisées ici pour garantir la cohérence visuelle et faciliter le thème.

export const RADII = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
} as const;

export const TRANSITIONS = {
  fast:   { duration: 0.12, ease: 'ease' },
  normal: { duration: 0.2,  ease: 'ease' },
  slow:   { duration: 0.3,  ease: [0.22, 1, 0.36, 1] },
  spring: { type: 'spring', bounce: 0.2, duration: 0.4 } as const,
};

export const BUBBLE_STYLES = {
  // Assistant : surface calme, presque « document » — le contenu prime.
  assistant: {
    bg:           'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
    border:       'color-mix(in srgb, var(--border-base) 85%, transparent)',
    borderRadius: `4px ${RADII.lg} ${RADII.lg} ${RADII.lg}`,
    shadow:       '0 1px 2px rgba(0,0,0,0.16), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
  },
  // Utilisateur : teinte d'accent pleine, lisible dans tous les thèmes.
  user: {
    bg:           'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 26%, var(--bg-secondary)), color-mix(in srgb, var(--accent-primary) 14%, var(--bg-secondary)))',
    border:       'color-mix(in srgb, var(--accent-primary) 34%, transparent)',
    borderRadius: `${RADII.lg} 4px ${RADII.lg} ${RADII.lg}`,
    shadow:       '0 6px 18px -10px color-mix(in srgb, var(--accent-primary) 65%, transparent)',
  },
} as const;

// Bornes du redimensionnement et du drag du panneau.
export const MIN_WIDTH = 280;
export const MAX_WIDTH = 860;
export const DRAG_HYSTERESIS = 6;
export const EDGE_MARGIN = 8;

// Limite de caractères du champ de saisie.
export const CHAR_LIMIT = 2000;

// Clés localStorage (préfixées pour éviter les collisions).
export const STORAGE_KEYS = {
  docked:    'Leanna_chat_docked',
  showInput: 'Leanna_chat_show_input',
  width:     'Leanna_chat_width',
  pinned:    'Leanna_chat_pinned',
  profile:   'Leanna_chat_profile',
} as const;

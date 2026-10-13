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
  assistant: {
    bg:           'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
    border:       'var(--border-base)',
    borderRadius: `4px ${RADII.lg} ${RADII.lg} ${RADII.lg}`,
    shadow:       '0 2px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.03)',
  },
  user: {
    bg:           'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 22%, transparent), color-mix(in srgb, var(--accent-primary) 12%, transparent))',
    border:       'color-mix(in srgb, var(--accent-primary) 38%, transparent)',
    borderRadius: `${RADII.lg} 4px ${RADII.lg} ${RADII.lg}`,
    shadow:       '0 2px 12px color-mix(in srgb, var(--accent-primary) 18%, transparent)',
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
} as const;

/**
 * Mappe un score numérique vers un token de couleur sémantique.
 *
 * Helper pur partagé par les tableaux de bord de santé (MissionControlView,
 * SystemHealthDashboard, AuditPanel), qui en avaient chacun une copie.
 *
 * Les seuils sont paramétrables :
 *  - `good`    : au-dessus → succès (vert)
 *  - `info`    : optionnel, entre `info` et `good` → info (bleu)
 *  - `warn`    : entre `warn` et le palier supérieur → avertissement (orange)
 *  - en dessous de `warn` → erreur (rouge)
 */
export interface ScoreThresholds {
  good: number;
  warn: number;
  info?: number;
}

const DEFAULT_THRESHOLDS: ScoreThresholds = { good: 80, warn: 50 };

export function scoreColor(n: number, thresholds: ScoreThresholds = DEFAULT_THRESHOLDS): string {
  const { good, warn, info } = thresholds;
  if (n >= good) return 'var(--color-success)';
  if (typeof info === 'number' && n >= info) return 'var(--color-info)';
  if (n >= warn) return 'var(--color-warning)';
  return 'var(--color-error)';
}

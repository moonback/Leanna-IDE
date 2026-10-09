import type { ReactNode } from 'react';

/** Micro-statistique inline (icône + valeur) utilisée dans les en-têtes et cartes. */
export function StatPill({ icon, value, label, color }: {
  icon: ReactNode; value: number | string; label: string; color: string;
}) {
  return (
    <span className="flex items-center gap-1 text-xs font-medium tabular-nums" style={{ color }} title={label}>
      {icon}{value}
    </span>
  );
}

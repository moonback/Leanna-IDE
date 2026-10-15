/**
 * ProgressBeam — barre de progression lumineuse (missions, tâches).
 *
 * `running` ajoute un balayage lumineux (coupé en reduced-motion et en
 * high-contrast). Exposée comme un `progressbar` accessible.
 *
 *   <ProgressBeam label="Refonte interface" value={78} running color="var(--nb-green)" />
 */
import React from 'react';
import { clsx } from 'clsx';

export interface ProgressBeamProps {
  label: string;
  /** Pourcentage 0–100. */
  value: number;
  running?: boolean;
  color?: string;
  /** Masquer le libellé visuel (il reste annoncé aux lecteurs d'écran). */
  hideLabel?: boolean;
  className?: string;
}

export function ProgressBeam({ label, value, running = false, color = 'var(--nb-violet)', hideLabel = false, className }: ProgressBeamProps) {
  const pct = Number.isFinite(value) ? Math.round(Math.min(Math.max(value, 0), 100)) : 0;
  return (
    <div
      className={clsx('nb-beam', className)}
      style={{ '--nb-beam-color': color } as React.CSSProperties}
      data-running={running || undefined}
    >
      {!hideLabel && (
        <div className="nb-beam__head" aria-hidden="true">
          <span className="truncate">{label}</span>
          <span className="nb-beam__pct">{pct}%</span>
        </div>
      )}
      <div
        className="nb-beam__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-busy={running || undefined}
      >
        <div className="nb-beam__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

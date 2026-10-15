/**
 * RingGauge — jauge circulaire néon (CPU, RAM, tokens…).
 *
 * `value` est borné à [0, max]. Le pourcentage est affiché au centre, sauf si
 * `display` fournit un texte (ex. « 1,2 Go »). Exposé aux lecteurs d'écran
 * comme un `meter`.
 *
 *   <RingGauge label="CPU" value={12} color="var(--nb-green)" />
 */
import React from 'react';
import { clsx } from 'clsx';

export interface RingGaugeProps {
  label: string;
  value: number;
  max?: number;
  /** Texte central à la place du pourcentage. */
  display?: string;
  /** Couleur (token CSS). Défaut : violet Nebula. */
  color?: string;
  /** Diamètre en px. */
  size?: number;
  /** Épaisseur du trait en px. */
  thickness?: number;
  className?: string;
}

export function RingGauge({
  label, value, max = 100, display, color = 'var(--nb-violet)', size = 84, thickness = 6, className,
}: RingGaugeProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const pct = Math.round((clamped / safeMax) * 100);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const text = display ?? `${pct}%`;

  return (
    <div
      className={clsx('nb-ring', className)}
      style={{ '--nb-ring-color': color } as React.CSSProperties}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      aria-valuetext={text}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="nb-ring__svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle className="nb-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} />
          <circle
            className="nb-ring__value"
            cx={size / 2} cy={size / 2} r={r} fill="none"
            strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / safeMax)}
          />
        </svg>
        <div className="nb-ring__center" aria-hidden="true">
          <span className="nb-ring__label">{label}</span>
          <span className="nb-ring__number" style={{ fontSize: Math.max(12, Math.round(size / 5.2)) }}>{text}</span>
        </div>
      </div>
    </div>
  );
}

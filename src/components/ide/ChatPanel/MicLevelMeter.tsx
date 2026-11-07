import { memo, useEffect, useRef } from 'react';
import { Mic, MicOff, Moon, SlidersHorizontal } from 'lucide-react';

export interface MicLevelMeterProps {
  /** Lecture instantanée du niveau micro (0–1), sans re-render React. */
  getLevel?: () => number;
  /** Seuil d'activité vocale (0–1, même échelle que getLevel). */
  getThreshold?: () => number;
  muted: boolean;
  asleep: boolean;
  reduceMotion: boolean;
  /** Mesure du bruit ambiant en cours. */
  calibrating?: boolean;
  /** Un profil de bruit ambiant est enregistré. */
  calibrated?: boolean;
  /** Ouvre la modale de calibration (bouton masqué si absent). */
  onOpenCalibration?: () => void;
  /** Bordure basse de séparation (désactivée quand le vumètre est encadré ailleurs). */
  framed?: boolean;
  /** Nombre de barres de l'historique défilant. */
  bars?: number;
}

/** Intervalle minimal entre deux échantillons (~30 i/s). */
const SAMPLE_MS = 33;

/**
 * Bandeau affichant en temps réel le son capté par le micro.
 *
 * Historique défilant de barres (la plus récente à droite) alimenté par
 * `getLevel()` dans une boucle requestAnimationFrame. Les barres sont mises à
 * jour directement dans le DOM pour éviter ~30 re-renders par seconde du
 * ChatPanel. La ligne pointillée matérialise le seuil « parole » : seuls les
 * sons soutenus au-dessus repoussent la mise en veille.
 */
export const MicLevelMeter = memo(function MicLevelMeter({
  getLevel,
  getThreshold,
  muted,
  asleep,
  reduceMotion,
  calibrating = false,
  calibrated = false,
  onOpenCalibration,
  framed = true,
  bars = 32,
}: MicLevelMeterProps) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const labelRef = useRef<HTMLSpanElement>(null);
  const thresholdRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<number[]>(new Array(bars).fill(0));

  const inactive = muted || asleep || !getLevel;

  useEffect(() => {
    historyRef.current = new Array(bars).fill(0);
    const paint = (threshold: number) => {
      const history = historyRef.current;
      for (let i = 0; i < bars; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        const v = history[i];
        el.style.transform = `scaleY(${Math.max(0.06, v)})`;
        el.style.opacity = v > threshold ? '1' : '0.4';
      }
      if (thresholdRef.current) {
        thresholdRef.current.style.bottom = `${Math.min(1, threshold) * 100}%`;
      }
    };

    if (inactive) {
      paint(getThreshold?.() ?? 1);
      return;
    }

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < SAMPLE_MS) return;
      last = now;
      const raw = getLevel!();
      const level = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
      const threshold = getThreshold?.() ?? 1;
      const history = historyRef.current;
      if (reduceMotion) {
        // Pas de défilement : toutes les barres suivent le niveau courant.
        history.fill(level);
      } else {
        history.shift();
        history.push(level);
      }
      paint(threshold);
      if (labelRef.current) {
        labelRef.current.textContent = level > threshold ? 'Parole' : 'Bruit ambiant';
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getLevel, getThreshold, inactive, reduceMotion, bars]);

  const Icon = muted ? MicOff : asleep ? Moon : Mic;
  const color = muted ? 'var(--color-error)' : asleep ? 'var(--text-dimmed)' : 'var(--accent-primary)';
  const staticLabel = muted
    ? 'Micro coupé'
    : asleep
      ? 'En veille — dites « Leanna »'
      : calibrating
        ? 'Silence… mesure du bruit'
        : null;

  return (
    <div
      className="lea-mic-meter flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
      style={framed ? { borderBottom: '1px solid var(--border-base)' } : undefined}
      role="status"
      aria-label="Niveau du micro"
    >
      <Icon size={13} style={{ color, flexShrink: 0 }} aria-hidden />
      <div className="relative flex items-end flex-1 min-w-0" style={{ height: 18, gap: 2 }} aria-hidden>
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            ref={el => { barsRef.current[i] = el; }}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 2,
              backgroundColor: calibrating ? 'var(--color-warning)' : color,
              transform: 'scaleY(0.06)',
              transformOrigin: 'bottom',
              opacity: 0.4,
              transition: reduceMotion ? undefined : 'transform 60ms linear',
            }}
          />
        ))}
        {getThreshold && !muted && !asleep && (
          <div
            ref={thresholdRef}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ borderTop: '1px dashed var(--text-muted)', opacity: 0.8 }}
            title="Seuil parole : au-dessous, le son ne repousse pas la veille"
          />
        )}
      </div>
      <span
        className="text-[10px] whitespace-nowrap"
        style={{ color: 'var(--text-muted)', minWidth: 72, textAlign: 'right' }}
      >
        {staticLabel ?? <span ref={labelRef}>Bruit ambiant</span>}
      </span>
      {onOpenCalibration && (
        <button
          type="button"
          onClick={onOpenCalibration}
          className="flex items-center p-1 rounded transition-colors"
          style={{ color: calibrated ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          title={calibrated ? 'Calibration du bruit ambiant (active)' : 'Calibrer le bruit ambiant'}
          aria-label="Ouvrir la calibration du bruit ambiant"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal size={12} aria-hidden />
        </button>
      )}
    </div>
  );
});

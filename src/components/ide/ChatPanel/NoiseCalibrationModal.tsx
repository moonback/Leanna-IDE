import { useEffect, useState } from 'react';
import { SlidersHorizontal, RotateCcw, CheckCheck, AlertTriangle } from 'lucide-react';
import { Modal } from '../../ui/Modal.js';
import { Button } from '../../ui/Button.js';
import { MicLevelMeter } from './MicLevelMeter.js';
import { DEFAULT_CALIBRATION_MS, type NoiseProfile } from '../../../lib/noiseCalibration.js';

export interface NoiseCalibrationModalProps {
  open: boolean;
  onClose: () => void;
  getLevel?: () => number;
  getThreshold?: () => number;
  muted: boolean;
  asleep: boolean;
  reduceMotion: boolean;
  calibrating: boolean;
  noiseProfile: NoiseProfile | null;
  calibrateNoise: (durationMs?: number) => Promise<NoiseProfile>;
  resetNoiseCalibration: () => void;
}

/** Au-dessus du ChatPanel (9990, ou 99999 en plein écran). */
const MODAL_Z = 100000;

type Feedback = { kind: 'success' | 'error'; message: string } | null;

/**
 * Modale de calibration du bruit ambiant : l'utilisateur reste silencieux
 * pendant la mesure, puis le seuil « parole » est placé au-dessus du bruit de
 * la pièce. Seuls les sons soutenus au-dessus de ce seuil repoussent la veille.
 */
export function NoiseCalibrationModal({
  open, onClose, getLevel, getThreshold, muted, asleep, reduceMotion,
  calibrating, noiseProfile, calibrateNoise, resetNoiseCalibration,
}: NoiseCalibrationModalProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [progress, setProgress] = useState(0);

  // Efface le retour précédent à chaque ouverture.
  useEffect(() => { if (open) setFeedback(null); }, [open]);

  // Barre de progression pendant la mesure.
  useEffect(() => {
    if (!calibrating) { setProgress(0); return; }
    const start = performance.now();
    const id = setInterval(() => {
      setProgress(Math.min(1, (performance.now() - start) / DEFAULT_CALIBRATION_MS));
    }, 100);
    return () => clearInterval(id);
  }, [calibrating]);

  const unavailable = muted || asleep;

  const handleCalibrate = async () => {
    setFeedback(null);
    try {
      const p = await calibrateNoise(DEFAULT_CALIBRATION_MS);
      setFeedback({
        kind: 'success',
        message: `Calibré : bruit de fond ${Math.round(p.floor)}, seuil parole ${Math.round(p.threshold)}.`,
      });
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la calibration.' });
    }
  };

  const handleReset = () => {
    resetNoiseCalibration();
    setFeedback({ kind: 'success', message: 'Calibration réinitialisée : seuil par défaut du profil.' });
  };

  const seconds = Math.round(DEFAULT_CALIBRATION_MS / 1000);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Calibrer le bruit ambiant"
      size="sm"
      zIndex={MODAL_Z}
      hideClose={calibrating}
      disableEscape={calibrating}
      disableBackdropClick={calibrating}
    >
      <Modal.Body className="flex flex-col gap-4">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Restez silencieux pendant {seconds} secondes : Leanna mesure le bruit de la pièce
          (ventilateur, clavier, rue…) et place le seuil « parole » au-dessus. Ensuite, seule
          votre voix repousse la mise en veille.
        </p>

        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-base)', backgroundColor: 'var(--bg-input)' }}>
          <MicLevelMeter
            getLevel={getLevel}
            getThreshold={getThreshold}
            muted={muted}
            asleep={asleep}
            reduceMotion={reduceMotion}
            calibrating={calibrating}
            framed={false}
          />
          <div className="h-1" style={{ backgroundColor: 'var(--border-base)' }} aria-hidden>
            <div
              className="h-full"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: 'var(--color-warning)',
                transition: reduceMotion ? undefined : 'width 100ms linear',
              }}
            />
          </div>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
          La ligne pointillée est le seuil : les barres au-dessus comptent comme de la parole.
        </p>

        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {noiseProfile ? (
            <>
              Calibration actuelle : bruit de fond <strong>{Math.round(noiseProfile.floor)}</strong>,
              seuil parole <strong>{Math.round(noiseProfile.threshold)}</strong>
              {' '}— {new Date(noiseProfile.calibratedAt).toLocaleString('fr-FR')}
            </>
          ) : (
            'Aucune calibration : le seuil par défaut du profil est utilisé.'
          )}
        </div>

        {unavailable && (
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-warning)' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" aria-hidden />
            {muted && !asleep ? 'Micro coupé : réactivez-le pour calibrer.' : 'Leanna est en veille : réveillez-la pour calibrer.'}
          </div>
        )}

        {feedback && (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            className="flex items-start gap-2 text-xs"
            style={{ color: feedback.kind === 'error' ? 'var(--color-error)' : 'var(--color-success)' }}
          >
            {feedback.kind === 'error'
              ? <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" aria-hidden />
              : <CheckCheck size={13} className="mt-0.5 flex-shrink-0" aria-hidden />}
            {feedback.message}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer align="between">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<RotateCcw size={13} />}
          onClick={handleReset}
          disabled={!noiseProfile || calibrating}
        >
          Réinitialiser
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={calibrating}>
            Fermer
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<SlidersHorizontal size={13} />}
            onClick={() => { void handleCalibrate(); }}
            loading={calibrating}
            disabled={unavailable || calibrating}
          >
            {calibrating ? 'Mesure…' : noiseProfile ? 'Recalibrer' : 'Lancer la mesure'}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

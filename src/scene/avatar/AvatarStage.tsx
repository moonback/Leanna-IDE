/**
 * AvatarStage — emplacement DOM de l'avatar Leanna.
 *
 *   - Ancre : son rectangle est transmis à avatarBus ; le modèle VRM est
 *     dessiné à cet endroit par le canvas WebGL unique (AvatarLayer).
 *   - Repli : si le VRM est absent, en erreur, ou si aucun canvas WebGL ne
 *     tourne (niveau off, mode Focus, hors shell v3), la mascotte SVG prend
 *     la place.
 *   - Bulle : texte DOM (lisible, annoncé aux lecteurs d'écran), jamais en 3D.
 *   - Clic / Entrée : connecte ou déconnecte la présence vocale, comme l'orbe.
 *
 * L'amplitude de la voix est lue par le canvas à chaque image via
 * avatarBus.setAmpSource : aucun re-rendu React par image. Le DOM ne
 * rafraîchit l'humeur qu'à 10 Hz.
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { LiveAPIContext } from '../../context/LiveAPIContext.js';
import { Mascot } from '../../views/orb/Mascot.js';
import type { OrbStatus } from '../../hooks/useOrbState.js';
import { useScenePrefs } from '../scenePrefs.js';
import { avatarBus, useAvatarLoadStatus, useSceneRunning } from './avatarBus.js';
import {
  EVENT_MOOD_MS, MOOD_MESSAGES, moodFromSignals, type AvatarMood,
} from './avatarStateMachine.js';

const SAMPLE_MS = 100;

/** État vocal échantillonné à 10 Hz (même seuils que useOrbState). */
function useVoiceSignals() {
  const live = useContext(LiveAPIContext);
  // Toujours la dernière valeur du contexte, lue par l'intervalle et le canvas.
  const liveRef = useRef(live);
  liveRef.current = live;
  const available = live !== null;
  const [sample, setSample] = useState<{ status: OrbStatus; amp: number }>({ status: 'idle', amp: 0 });

  useEffect(() => {
    if (!available) return;
    const amps = () => {
      const l = liveRef.current;
      if (!l || l.status !== 'connected') return { out: 0, inp: 0 };
      return { out: l.getOutputAmplitude?.() ?? 0, inp: l.getInputAmplitude?.() ?? 0 };
    };
    avatarBus.setAmpSource(() => amps().out);
    const id = setInterval(() => {
      const l = liveRef.current;
      if (!l) return;
      const { out, inp } = amps();
      const connected = l.status === 'connected';
      const status: OrbStatus = l.isBusy ? 'busy'
        : connected && out > 0.035 ? 'speaking'
        : connected && inp > 0.025 ? 'listening'
        : connected ? 'online'
        : l.status === 'connecting' ? 'connecting'
        : 'idle';
      setSample(prev => (prev.status === status && Math.abs(prev.amp - out) < 0.02 ? prev : { status, amp: out }));
    }, SAMPLE_MS);
    return () => {
      clearInterval(id);
      avatarBus.setAmpSource(null);
    };
  }, [available]);

  const toggle = () => {
    const l = liveRef.current;
    if (!l) return;
    if (l.status === 'connected') l.disconnect();
    else if (l.status !== 'connecting') l.connect([], 'full');
  };

  return { ...sample, muted: live?.muted ?? false, toggle, available };
}

/** Humeurs déclenchées par les événements agents et missions (durée limitée). */
function useEventMoods() {
  const [flags, setFlags] = useState({ celebrate: false, alert: false, present: false });
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const flash = (key: keyof typeof flags) => {
      setFlags(f => ({ ...f, [key]: true }));
      timers.push(setTimeout(() => setFlags(f => ({ ...f, [key]: false })), EVENT_MOOD_MS[key]));
    };
    const onAgent = (e: Event) => {
      const status = (e as CustomEvent).detail?.status;
      if (status === 'completed') flash('celebrate');
      else if (status === 'failed') flash('alert');
    };
    const onMission = (e: Event) => {
      const ev = (e as CustomEvent).detail?.event;
      if (ev === 'mission_completed') flash('present');
      else if (ev === 'mission_failed') flash('alert');
    };
    window.addEventListener('Leanna-agent-event', onAgent);
    window.addEventListener('Leanna-mission-event', onMission);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('Leanna-agent-event', onAgent);
      window.removeEventListener('Leanna-mission-event', onMission);
    };
  }, []);
  return flags;
}

export interface AvatarStageProps {
  /** Hauteur de la zone en px (la largeur suit, ratio 3:4). */
  height?: number;
  /** Texte de bulle imposé (sinon : message de l'humeur). */
  message?: string;
  /** L'avatar désigne une action (pods du cockpit). */
  pointing?: boolean;
  /** Forcer une humeur (vitrine /dev/ui, tests). */
  moodOverride?: AvatarMood;
}

export function AvatarStage({ height = 360, message, pointing = false, moodOverride }: AvatarStageProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const voice = useVoiceSignals();
  const events = useEventMoods();
  const { focus } = useScenePrefs();
  const loadStatus = useAvatarLoadStatus();
  const sceneRunning = useSceneRunning();
  const reduceMotion = useReducedMotion() ?? false;

  const mood = moodOverride ?? moodFromSignals({
    status: voice.status, muted: voice.muted, hovered, pointing, ...events,
  });
  const use3d = sceneRunning && !focus && loadStatus !== 'missing' && loadStatus !== 'error';
  const showing3d = use3d && loadStatus === 'ready';

  useEffect(() => { avatarBus.setMood(mood); }, [mood]);

  // Ancrage : publie le rectangle de la zone tant que la 3D est utilisée.
  useEffect(() => {
    const el = anchorRef.current;
    if (!el || !use3d) return;
    const publish = () => {
      const r = el.getBoundingClientRect();
      const offscreen = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
      avatarBus.setAnchor(offscreen ? null : { left: r.left, top: r.top, width: r.width, height: r.height });
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener('resize', publish);
    window.addEventListener('scroll', publish, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
      window.removeEventListener('scroll', publish, true);
      avatarBus.setAnchor(null);
    };
  }, [use3d]);

  // Regard : position du curseur relative au centre de la zone.
  useEffect(() => {
    if (!use3d || reduceMotion) return;
    const onMove = (e: PointerEvent) => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      avatarBus.setGaze(
        (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2),
        (e.clientY - (r.top + r.height * 0.3)) / (window.innerHeight / 2),
      );
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [use3d, reduceMotion]);

  const bubble = message ?? MOOD_MESSAGES[mood];
  const label = voice.status === 'idle' ? 'Leanna : connecter la présence vocale' : 'Leanna : déconnecter la présence vocale';

  return (
    <div className="nb-avatar-stage" style={{ height }} data-mood={mood} data-mode={showing3d ? '3d' : '2d'}>
      <p className="nb-avatar-stage__bubble nb-glass-3" role="status" aria-live="polite">{bubble}</p>
      {use3d ? (
        <button
          ref={anchorRef}
          type="button"
          className="nb-avatar-stage__anchor"
          aria-label={label}
          disabled={!voice.available}
          onClick={voice.toggle}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          {loadStatus === 'loading' && <span className="nb-avatar-stage__loading">Chargement de Leanna…</span>}
        </button>
      ) : (
        <div className="nb-avatar-stage__fallback">
          <Mascot
            amp={voice.amp}
            accentColor="var(--nb-violet)"
            status={voice.status}
            muted={voice.muted}
            celebrate={mood === 'celebrate' || mood === 'present'}
            onClick={voice.toggle}
            reduceMotion={reduceMotion}
          />
        </div>
      )}
    </div>
  );
}

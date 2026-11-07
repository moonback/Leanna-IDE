import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MicOff } from 'lucide-react';
import type { OrbStatus } from '../../hooks/useOrbState.js';

/**
 * Mascotte Leanna — petit robot expressif rendu en SVG.
 *
 * - Les yeux suivent le curseur et clignent aléatoirement.
 * - La bouche s'ouvre au rythme de la voix (amplitude de sortie).
 * - L'humeur dépend de l'état live : dort (déconnecté), cherche (connexion),
 *   écoute, parle, réfléchit (busy), micro coupé, joie (survol) et fête
 *   (`celebrate`, ex. quand un agent termine une tâche).
 * - Un visualiseur radial entoure la mascotte pendant la session.
 */

export type MascotMood = 'sleep' | 'search' | 'idle' | 'listen' | 'talk' | 'think' | 'muted' | 'happy' | 'celebrate';

export function moodFromStatus(status: OrbStatus, muted: boolean, hovered: boolean, celebrate: boolean): MascotMood {
  if (status === 'idle') return hovered ? 'happy' : 'sleep';
  if (status === 'connecting') return 'search';
  if (status === 'sleeping') return 'sleep';
  if (celebrate) return 'celebrate';
  if (status === 'speaking') return 'talk';
  if (status === 'busy') return 'think';
  if (muted) return 'muted';
  if (status === 'listening') return 'listen';
  return hovered ? 'happy' : 'idle';
}

const RAYS = 44;
const C = 120; // centre du viewBox 240×240

function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t1 = setTimeout(() => {
        setClosed(true);
        t2 = setTimeout(() => { setClosed(false); schedule(); }, 130);
      }, 2200 + Math.random() * 3600);
    };
    schedule();
    return () => { clearTimeout(t1); clearTimeout(t2); setClosed(false); };
  }, [enabled]);
  return closed;
}

/** Position normalisée (-1..1) du curseur par rapport au centre de l'élément. */
function useLookAt(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) { setLook({ x: 0, y: 0 }); return; }
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width * 1.4);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height * 1.4);
        setLook({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
      });
    };
    const onLeave = () => setLook({ x: 0, y: 0 });
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, enabled]);
  return look;
}

function Eye({ cx, cy, mood, blink, look, amp }: {
  cx: number; cy: number; mood: MascotMood; blink: boolean; look: { x: number; y: number }; amp: number;
}) {
  const stroke = { stroke: 'white', strokeWidth: 4, strokeLinecap: 'round' as const, fill: 'none' };

  if (mood === 'sleep') return <path d={`M ${cx - 8} ${cy} Q ${cx} ${cy + 7} ${cx + 8} ${cy}`} {...stroke} opacity={0.85} />;
  if (mood === 'happy' || (mood === 'talk' && amp > 0.22)) {
    return <path d={`M ${cx - 8} ${cy + 3} Q ${cx} ${cy - 8} ${cx + 8} ${cy + 3}`} {...stroke} />;
  }
  if (mood === 'celebrate') {
    const s = 9;
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? s : s * 0.45;
      return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
    }).join(' ');
    return (
      <motion.polygon points={pts} fill="#fde68a" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        animate={{ rotate: [0, 18, -18, 0], scale: [1, 1.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
    );
  }

  let dx = look.x * 5;
  let dy = look.y * 4;
  let w = 13;
  let h = 19;
  if (mood === 'think') { dx = 4; dy = -5; h = 15; }
  if (mood === 'listen') { w = 15; h = 22; }
  if (mood === 'muted') { h = 13; dy = Math.max(dy, 1); }

  return (
    <motion.g animate={{ x: dx, y: dy }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
      <motion.rect
        x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w / 2} fill="white"
        style={{ transformBox: 'fill-box', transformOrigin: 'center', filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.7))' }}
        animate={mood === 'search' ? { x: [-5, 5, 5, -5, -5], scaleY: 1 } : { scaleY: blink ? 0.1 : 1, x: 0 }}
        transition={mood === 'search' ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.08 }}
      />
      <circle cx={cx + w / 5} cy={cy - h / 4} r={2} fill="rgba(10,12,24,0.55)" />
    </motion.g>
  );
}

function Mouth({ mood, amp }: { mood: MascotMood; amp: number }) {
  const y = 132;
  const line = { stroke: 'white', strokeWidth: 3.5, strokeLinecap: 'round' as const, fill: 'none' };
  switch (mood) {
    case 'talk':
      return (
        <motion.ellipse cx={C} cy={y} rx={8} fill="#ffb4c6"
          animate={{ ry: 1.8 + Math.min(1, amp * 2.6) * 8, rx: 7 + Math.min(1, amp * 2) * 3 }}
          transition={{ type: 'spring', stiffness: 520, damping: 22 }} />
      );
    case 'sleep':
      return <ellipse cx={C} cy={y} rx={3.2} ry={2.4} fill="white" opacity={0.7} />;
    case 'listen':
    case 'search':
      return <ellipse cx={C} cy={y} rx={4} ry={4.5} fill="white" opacity={0.9} />;
    case 'think':
      return <path d={`M ${C - 6} ${y + 1} Q ${C} ${y - 2} ${C + 6} ${y + 2}`} {...line} />;
    case 'muted':
      return (
        <g>
          <path d={`M ${C - 9} ${y} L ${C + 9} ${y}`} {...line} />
          {[-5, 0, 5].map(o => <path key={o} d={`M ${C + o} ${y - 3} L ${C + o} ${y + 3}`} stroke="white" strokeWidth={1.6} strokeLinecap="round" />)}
        </g>
      );
    case 'celebrate':
      return <path d={`M ${C - 10} ${y - 3} Q ${C} ${y + 12} ${C + 10} ${y - 3} Z`} fill="#ffb4c6" stroke="white" strokeWidth={2} strokeLinejoin="round" />;
    case 'happy':
      return <path d={`M ${C - 9} ${y - 2} Q ${C} ${y + 8} ${C + 9} ${y - 2}`} {...line} />;
    default:
      return <path d={`M ${C - 7} ${y - 1} Q ${C} ${y + 5} ${C + 7} ${y - 1}`} {...line} />;
  }
}

export function Mascot({ amp, accentColor, status, muted, celebrate, onClick, reduceMotion }: {
  amp: number; accentColor: string; status: OrbStatus; muted: boolean; celebrate: boolean;
  onClick: () => void; reduceMotion: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const mood = moodFromStatus(status, muted, hovered, celebrate);
  const blink = useBlink(!reduceMotion && mood !== 'sleep' && mood !== 'celebrate');
  const look = useLookAt(ref, !reduceMotion && mood !== 'sleep' && mood !== 'search');
  const connected = status !== 'idle' && status !== 'connecting';
  const t = typeof performance !== 'undefined' ? performance.now() : 0;
  const tilt = mood === 'listen' ? -6 : mood === 'think' ? 5 : mood === 'sleep' ? 4 : 0;
  const squash = Math.min(0.08, amp * 0.2);

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="relative aspect-square rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-base)]"
      style={{ width: 'clamp(180px, min(64vw, 40vh), 300px)', cursor: 'pointer' }}
      whileHover={reduceMotion ? undefined : { scale: 1.03 }}
      whileTap={reduceMotion ? undefined : { scale: 0.95 }}
      aria-label={status === 'idle' ? 'Réveiller la mascotte et connecter la présence vocale' : 'Déconnecter la présence vocale'}
      title={status === 'idle' ? 'Clique pour me réveiller' : 'Clique pour terminer la session'}
    >
      <svg viewBox="0 0 240 240" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="mascot-body" cx="36%" cy="30%" r="75%">
            <stop offset="0%" style={{ stopColor: `color-mix(in srgb, ${accentColor} 55%, white)` }} />
            <stop offset="55%" style={{ stopColor: accentColor }} />
            <stop offset="100%" style={{ stopColor: `color-mix(in srgb, ${accentColor} 45%, black)` }} />
          </radialGradient>
          <radialGradient id="mascot-halo" cx="50%" cy="50%" r="50%">
            <stop offset="40%" style={{ stopColor: accentColor, stopOpacity: 0.35 }} />
            <stop offset="100%" style={{ stopColor: accentColor, stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id="mascot-visor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b0e1c" stopOpacity={0.92} />
            <stop offset="100%" stopColor="#151a33" stopOpacity={0.92} />
          </linearGradient>
        </defs>

        {/* Halo lumineux */}
        <motion.circle cx={C} cy={C} r={112} fill="url(#mascot-halo)"
          animate={reduceMotion ? undefined : { scale: 0.85 + Math.min(0.3, amp * 0.9), opacity: connected ? 0.9 : 0.45 }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} />

        {/* Visualiseur radial */}
        {connected && (
          <g opacity={0.75}>
            {Array.from({ length: RAYS }, (_, i) => {
              const a = (i / RAYS) * Math.PI * 2;
              const wave = reduceMotion ? 0.5 : 0.55 + 0.45 * Math.sin(t * 0.006 + i * 0.85);
              const len = 3 + Math.min(1, amp * 2.2) * 20 * wave;
              const r0 = 100;
              return (
                <line key={i}
                  x1={C + Math.cos(a) * r0} y1={C + Math.sin(a) * r0}
                  x2={C + Math.cos(a) * (r0 + len)} y2={C + Math.sin(a) * (r0 + len)}
                  strokeWidth={3} strokeLinecap="round" style={{ stroke: accentColor }} opacity={0.35 + wave * 0.5} />
              );
            })}
          </g>
        )}

        {/* Particules en orbite */}
        {!reduceMotion && connected && (
          <motion.g style={{ transformBox: 'view-box', transformOrigin: '120px 120px' }}
            animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
            {[0, 1, 2, 3, 4].map(i => {
              const a = (i / 5) * Math.PI * 2;
              return <circle key={i} cx={C + Math.cos(a) * 88} cy={C + Math.sin(a) * 88} r={i % 2 ? 2 : 3} style={{ fill: accentColor }} opacity={0.7} />;
            })}
          </motion.g>
        )}

        {/* Ombre au sol */}
        <motion.ellipse cx={C} cy={204} rx={44} ry={6} fill="black" opacity={0.25}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={reduceMotion ? undefined : { scaleX: [1, 0.86, 1], opacity: [0.25, 0.15, 0.25] }}
          transition={{ duration: mood === 'sleep' ? 4.5 : 3, repeat: Infinity, ease: 'easeInOut' }} />

        {/* Corps flottant */}
        <motion.g
          animate={reduceMotion ? undefined : {
            y: mood === 'celebrate' ? [0, -16, 0] : [0, -7, 0],
          }}
          transition={{ duration: mood === 'celebrate' ? 0.6 : mood === 'sleep' ? 4.5 : 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.g style={{ transformBox: 'view-box', transformOrigin: '120px 180px' }}
            animate={{ rotate: reduceMotion ? 0 : tilt, scaleY: 1 + squash, scaleX: 1 - squash / 2 }}
            transition={{ type: 'spring', stiffness: 180, damping: 14 }}>

            {/* Antenne */}
            <path d="M 120 58 Q 116 44 124 32" stroke="url(#mascot-body)" strokeWidth={4} strokeLinecap="round" fill="none" />
            <motion.circle cx={124} cy={29} r={6} style={{ fill: accentColor, filter: `drop-shadow(0 0 6px ${accentColor})`, transformBox: 'fill-box', transformOrigin: 'center' }}
              animate={reduceMotion ? undefined : mood === 'listen' || mood === 'search'
                ? { scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }
                : { scale: 1 + Math.min(0.6, amp * 2) }}
              transition={mood === 'listen' || mood === 'search' ? { duration: 0.9, repeat: Infinity } : { type: 'spring', stiffness: 300, damping: 15 }} />

            {/* Mains */}
            {[{ x: 50, side: -1 }, { x: 190, side: 1 }].map(({ x, side }) => (
              <motion.circle key={x} cx={x} cy={138} r={11} fill="url(#mascot-body)"
                animate={reduceMotion ? undefined : mood === 'celebrate'
                  ? { y: [0, -26, 0], x: [0, side * 4, 0] }
                  : mood === 'talk' ? { y: [0, -4 - amp * 12, 0] } : { y: [0, -3, 0] }}
                transition={{ duration: mood === 'celebrate' ? 0.5 : 2.2, repeat: Infinity, ease: 'easeInOut', delay: side > 0 ? 0.25 : 0 }} />
            ))}

            {/* Corps */}
            <circle cx={C} cy={120} r={64} fill="url(#mascot-body)" />
            <ellipse cx={94} cy={82} rx={18} ry={9} fill="white" opacity={0.32} transform="rotate(-28 94 82)" />

            {/* Visière / visage */}
            <rect x={74} y={86} width={92} height={64} rx={30} fill="url(#mascot-visor)"
              style={{ stroke: `color-mix(in srgb, ${accentColor} 40%, transparent)` }} strokeWidth={1.5} />

            <Eye cx={102} cy={112} mood={mood} blink={blink} look={look} amp={amp} />
            <Eye cx={138} cy={112} mood={mood} blink={blink} look={look} amp={amp} />

            {/* Joues */}
            <ellipse cx={88} cy={130} rx={7} ry={4} fill="#ff8fab" opacity={mood === 'happy' || mood === 'celebrate' ? 0.6 : 0.3} />
            <ellipse cx={152} cy={130} rx={7} ry={4} fill="#ff8fab" opacity={mood === 'happy' || mood === 'celebrate' ? 0.6 : 0.3} />

            <Mouth mood={mood} amp={amp} />
          </motion.g>
        </motion.g>

        {/* Zzz quand elle dort */}
        {mood === 'sleep' && !reduceMotion && [0, 1, 2].map(i => (
          <motion.text key={i} x={168} y={62} fontSize={14 + i * 4} fontWeight={700} style={{ fill: accentColor }}
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ opacity: [0, 0.9, 0], x: [0, 10 + i * 6], y: [0, -30 - i * 8] }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: 'easeOut' }}>z</motion.text>
        ))}

        {/* Bulles de réflexion */}
        {mood === 'think' && [0, 1, 2].map(i => (
          <motion.circle key={i} cx={170 + i * 12} cy={58 - i * 12} r={3 + i * 1.5} fill="white"
            animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }} />
        ))}
      </svg>

      {/* Éclats de fête */}
      <AnimatePresence>
        {mood === 'celebrate' && !reduceMotion && (
          <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return (
                <motion.span key={i} className="absolute left-1/2 top-1/2 text-base"
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{ x: Math.cos(a) * 140, y: Math.sin(a) * 140, scale: 1.2, opacity: 0, rotate: 180 }}
                  transition={{ duration: 1.3, ease: 'easeOut', delay: (i % 3) * 0.08 }}>
                  {i % 2 ? '✦' : '✨'}
                </motion.span>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {muted && connected && (
        <span className="absolute bottom-[14%] right-[16%] flex h-9 w-9 items-center justify-center rounded-full shadow-md"
          style={{ backgroundColor: 'var(--color-warning)', color: 'var(--bg-base)', border: '2px solid var(--bg-base)' }} title="Micro coupé">
          <MicOff className="h-4 w-4" />
        </span>
      )}
    </motion.button>
  );
}

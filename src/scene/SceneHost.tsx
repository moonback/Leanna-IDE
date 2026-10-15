/**
 * SceneHost — LE canvas WebGL unique de l'application (plan §3.3, règle 1).
 * Chargé à la demande (chunk séparé) par SceneLayer.
 *
 * Boucle de rendu : `frameloop="demand"` + un métronome qui appelle
 * invalidate() à la fréquence du niveau de qualité (plus lente au repos,
 * plus rapide pendant l'activité des agents). Quand `active` est faux
 * (fenêtre masquée, mode Focus), le métronome s'arrête : 0 frame rendue.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { NebulaBackground, readPalette, type NebulaPalette } from './layers/NebulaBackground.js';
import { TIER_SETTINGS, type QualityTier } from './quality.js';
import { sceneBus } from './sceneBus.js';
import { runRenderPasses } from './renderPasses.js';
import { avatarBus } from './avatar/avatarBus.js';
import { AvatarLayer } from './avatar/AvatarLayer.js';

export interface SceneHostProps {
  tier: Exclude<QualityTier, 'off'>;
  active: boolean;
  /** Mouvement réduit : une image fixe, rafraîchie seulement au redimensionnement. */
  reducedMotion: boolean;
  onContextLost: () => void;
  /** FPS mesuré sur les premières secondes (pour dégrader le niveau). */
  onFpsMeasured?: (fps: number) => void;
}

const MEASURE_MS = 3000;
const ACTIVE_ENERGY = 0.08;

function Metronome({ tier, active, reducedMotion, onFpsMeasured }: Omit<SceneHostProps, 'onContextLost'>) {
  const invalidate = useThree(s => s.invalidate);
  const settings = TIER_SETTINGS[tier];
  const measured = useRef(false);
  // Images réellement rendues (et non demandées) : un GPU lent en rend moins.
  const rendered = useRef(0);
  useFrame(() => { rendered.current += 1; });

  useEffect(() => {
    // Toujours au moins une image : en pause, la scène est figée, pas vide.
    invalidate();
    if (!active || reducedMotion) return; // image fixe

    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = performance.now();
    const renderedAtStart = rendered.current;
    const tick = () => {
      // Cadence rapide pendant l'activité, ou si l'avatar est à l'écran
      // (clignements et lip-sync doivent rester fluides).
      const animated = sceneBus.energy() > ACTIVE_ENERGY || (avatarBus.isVisible() && avatarBus.loadStatus === 'ready');
      const fps = animated ? settings.activeFps : settings.idleFps;
      invalidate();
      if (!measured.current && performance.now() - startedAt >= MEASURE_MS) {
        measured.current = true;
        onFpsMeasured?.((rendered.current - renderedAtStart) / ((performance.now() - startedAt) / 1000));
      }
      timer = setTimeout(tick, 1000 / fps);
    };
    tick();
    // Une impulsion réveille immédiatement la cadence rapide.
    const off = sceneBus.onPulse(() => invalidate());
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [active, reducedMotion, invalidate, settings, onFpsMeasured]);

  return null;
}

/**
 * Rend la scène principale puis les passes supplémentaires (avatar).
 * Priorité 1 : R3F désactive alors son rendu automatique.
 */
function CompositeRenderer() {
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    runRenderPasses(gl);
  }, 1);
  return null;
}

/** Vrai dès qu'une ancre d'avatar a existé : le modèle n'est chargé qu'à ce moment, une seule fois. */
function useAvatarWanted(): boolean {
  const hasAnchor = useSyncExternalStore(avatarBus.onAnchorChange, () => avatarBus.anchor !== null, () => false);
  const [wanted, setWanted] = useState(hasAnchor);
  useEffect(() => { if (hasAnchor) setWanted(true); }, [hasAnchor]);
  return wanted || hasAnchor;
}

function usePalette(): NebulaPalette {
  const [palette, setPalette] = useState<NebulaPalette>(readPalette);
  useEffect(() => {
    // Le thème change via l'attribut data-theme de <html>.
    const obs = new MutationObserver(() => setPalette(readPalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-ui'] });
    return () => obs.disconnect();
  }, []);
  return palette;
}

export default function SceneHost({ tier, active, reducedMotion, onContextLost, onFpsMeasured }: SceneHostProps) {
  const settings = TIER_SETTINGS[tier];
  const palette = usePalette();
  const avatarWanted = useAvatarWanted();

  // Signale aux AvatarStage qu'un canvas peut dessiner l'avatar.
  useEffect(() => {
    avatarBus.setSceneRunning(true);
    return () => avatarBus.setSceneRunning(false);
  }, []);

  return (
    <div className="nb-scene" aria-hidden="true" data-tier={tier} data-active={active}>
      <Canvas
        flat
        frameloop="demand"
        dpr={[1, settings.maxDpr]}
        camera={{ position: [0, 0, 0], fov: 60, near: 0.1, far: 50 }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: tier === 'high' ? 'high-performance' : 'low-power',
          preserveDrawingBuffer: false,
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onContextLost();
          }, { once: true });
        }}
      >
        <Metronome tier={tier} active={active} reducedMotion={reducedMotion} onFpsMeasured={onFpsMeasured} />
        <NebulaBackground
          particles={reducedMotion ? Math.min(settings.particles, 400) : settings.particles}
          palette={palette}
          frozen={reducedMotion}
        />
        {avatarWanted && <AvatarLayer />}
        <CompositeRenderer />
      </Canvas>
    </div>
  );
}

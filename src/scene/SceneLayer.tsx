/**
 * SceneLayer — décide s'il faut une scène 3D, à quel niveau, et la charge à
 * la demande. Reste dans le bundle principal (léger) : three.js et R3F ne
 * sont téléchargés que si le niveau retenu n'est pas « off ».
 *
 *   off (matériel, réglage, high-contrast, perte de contexte) → AmbientBackdrop CSS
 *   mode Focus (Ctrl+Alt+F)                                   → aucun décor
 *   sinon                                                     → SceneHost (WebGL)
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AmbientBackdrop } from '../components/ui/AmbientBackdrop.js';
import { useToast } from '../components/ui/Toast.js';
import { useProfile } from '../context/UserProfileContext.js';
import { detectCapabilities, downgradeForFps, minTier, pickTier, type Capabilities, type QualityTier } from './quality.js';
import { getScenePrefs, isFocusShortcut, setScenePref, useScenePrefs } from './scenePrefs.js';
import { useSceneVisibility } from './useSceneVisibility.js';
import { installSceneBridge, sceneBus } from './sceneBus.js';

const SceneHost = lazy(() => import('./SceneHost.js'));

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface SceneLayerProps {
  /** Nombre de tâches d'agents en cours (énergie de fond de la scène). */
  activeAgents: number;
  /** Détection injectable (tests). */
  capabilities?: Capabilities;
}

export function SceneLayer({ activeAgents, capabilities }: SceneLayerProps) {
  const prefs = useScenePrefs();
  const { profile } = useProfile();
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const active = useSceneVisibility(prefs.focus);
  const [caps] = useState<Capabilities>(() => capabilities ?? detectCapabilities());
  // Plafond d'exécution : abaissé par une mesure de FPS ou une perte de contexte.
  const [runtimeCap, setRuntimeCap] = useState<QualityTier>('high');

  const tier = minTier(
    pickTier({ capabilities: caps, intensity: prefs.intensity, reducedMotion, highContrast: profile.theme === 'high-contrast' }),
    runtimeCap,
  );

  useEffect(() => installSceneBridge(), []);
  useEffect(() => { sceneBus.setActiveAgents(activeAgents); }, [activeAgents]);

  // Mode Focus : Ctrl+Alt+F partout dans l'app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isFocusShortcut(e)) return;
      e.preventDefault();
      const next = !getScenePrefs().focus;
      setScenePref('focus', next);
      toast.info(next ? 'Mode Focus activé : décor 3D coupé (Ctrl+Alt+F pour revenir)' : 'Mode Focus désactivé');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast]);

  const onContextLost = useCallback(() => {
    setRuntimeCap('off');
    toast.warning('Le rendu 3D a été interrompu par le GPU : passage au décor simplifié.');
  }, [toast]);

  const onFpsMeasured = useCallback((fps: number) => {
    setRuntimeCap(prev => downgradeForFps(minTier(prev, tier), fps));
  }, [tier]);

  if (prefs.focus) return null;
  if (tier === 'off') return <AmbientBackdrop />;

  return (
    <Suspense fallback={null}>
      <SceneHost
        tier={tier}
        active={active}
        reducedMotion={reducedMotion}
        onContextLost={onContextLost}
        onFpsMeasured={onFpsMeasured}
      />
    </Suspense>
  );
}

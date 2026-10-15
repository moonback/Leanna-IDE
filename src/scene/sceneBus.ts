/**
 * sceneBus — pont entre l'activité réelle de l'app et la scène 3D.
 *
 * La scène lit cet état HORS de React (refs mutables dans useFrame) : aucun
 * re-rendu React par frame. Les événements window existants sont traduits
 * en deux signaux :
 *   - `activeAgents` : nombre de tâches d'agents en cours (niveau de fond) ;
 *   - impulsions (`pulse`) : un outil ou une mission vient de bouger.
 *
 * `energy()` combine les deux en une valeur 0–1 que la nébuleuse utilise
 * pour sa vitesse, sa luminosité et sa densité de particules.
 */

export type ScenePulseKind = 'tool' | 'agent' | 'mission' | 'error';

type Listener = (kind: ScenePulseKind) => void;

const PULSE_WEIGHT: Record<ScenePulseKind, number> = {
  tool: 0.12,
  agent: 0.25,
  mission: 0.35,
  error: 0.3,
};
/** Demi-vie de l'énergie d'impulsion, en secondes. */
const PULSE_HALF_LIFE_S = 1.6;

const state = {
  activeAgents: 0,
  pulse: 0,
  lastPulseAt: 0,
  lastKind: 'tool' as ScenePulseKind,
};
const listeners = new Set<Listener>();

export const sceneBus = {
  setActiveAgents(n: number): void {
    state.activeAgents = Math.max(0, n | 0);
  },

  pulse(kind: ScenePulseKind, now = performance.now()): void {
    state.pulse = Math.min(1, decayedPulse(now) + PULSE_WEIGHT[kind]);
    state.lastPulseAt = now;
    state.lastKind = kind;
    listeners.forEach(l => l(kind));
  },

  /** Énergie 0–1 : fond (agents actifs) + impulsions récentes amorties. */
  energy(now = performance.now()): number {
    const base = 1 - Math.exp(-state.activeAgents / 2.5); // 0 → 0 ; 2 → 0,55 ; 5 → 0,86
    return Math.min(1, base * 0.7 + decayedPulse(now) * 0.6);
  },

  lastKind(): ScenePulseKind {
    return state.lastKind;
  },

  /** Être prévenu d'une impulsion (ex. réveiller une boucle de rendu en pause). */
  onPulse(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /** Réinitialisation (tests). */
  reset(): void {
    state.activeAgents = 0;
    state.pulse = 0;
    state.lastPulseAt = 0;
    listeners.clear();
  },
};

function decayedPulse(now: number): number {
  if (state.pulse <= 0) return 0;
  const dt = Math.max(0, now - state.lastPulseAt) / 1000;
  return state.pulse * Math.pow(0.5, dt / PULSE_HALF_LIFE_S);
}

/**
 * Traduit les événements window de l'app en impulsions. Retourne la
 * fonction de désinstallation.
 */
export function installSceneBridge(): () => void {
  const onTool = () => sceneBus.pulse('tool');
  const onAgent = (e: Event) => {
    const status = (e as CustomEvent).detail?.status;
    sceneBus.pulse(status === 'failed' ? 'error' : 'agent');
  };
  const onMission = (e: Event) => {
    const ev = (e as CustomEvent).detail?.event as string | undefined;
    sceneBus.pulse(ev === 'mission_failed' ? 'error' : 'mission');
  };
  window.addEventListener('Leanna-tool-start', onTool);
  window.addEventListener('Leanna-agent-event', onAgent);
  window.addEventListener('Leanna-mission-event', onMission);
  return () => {
    window.removeEventListener('Leanna-tool-start', onTool);
    window.removeEventListener('Leanna-agent-event', onAgent);
    window.removeEventListener('Leanna-mission-event', onMission);
  };
}

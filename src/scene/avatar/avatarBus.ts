/**
 * avatarBus — état partagé entre le DOM (AvatarStage) et le canvas WebGL
 * (AvatarLayer), lu dans la boucle de rendu sans re-rendu React.
 *
 *   DOM → canvas : humeur, rectangle d'ancrage, regard, source d'amplitude
 *   canvas → DOM : état de chargement du modèle VRM (repli 2D si absent)
 */
import { useSyncExternalStore } from 'react';
import type { AvatarMood } from './avatarStateMachine.js';

export type AvatarLoadStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

export interface AnchorRect { left: number; top: number; width: number; height: number }

const state = {
  mood: 'idle' as AvatarMood,
  anchor: null as AnchorRect | null,
  /** Regard normalisé (-1..1) par rapport au centre de l'ancre. */
  gaze: { x: 0, y: 0 },
  getAmp: (() => 0) as () => number,
  loadStatus: 'idle' as AvatarLoadStatus,
  loadError: '' as string,
  /** Un canvas WebGL (SceneHost) est monté et peut dessiner l'avatar. */
  sceneRunning: false,
};

type Listener = () => void;
const loadListeners = new Set<Listener>();
const anchorListeners = new Set<Listener>();

export const avatarBus = {
  get mood(): AvatarMood { return state.mood; },
  setMood(m: AvatarMood): void { state.mood = m; },

  get anchor(): AnchorRect | null { return state.anchor; },
  setAnchor(r: AnchorRect | null): void {
    state.anchor = r;
    anchorListeners.forEach(l => l());
  },
  onAnchorChange(l: Listener): () => void {
    anchorListeners.add(l);
    return () => { anchorListeners.delete(l); };
  },

  get gaze(): { x: number; y: number } { return state.gaze; },
  setGaze(x: number, y: number): void {
    state.gaze.x = Math.max(-1, Math.min(1, x));
    state.gaze.y = Math.max(-1, Math.min(1, y));
  },

  amp(): number {
    const v = state.getAmp();
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  },
  setAmpSource(fn: (() => number) | null): void { state.getAmp = fn ?? (() => 0); },

  /** L'avatar doit-il être animé (une ancre visible existe) ? */
  isVisible(): boolean {
    return state.anchor !== null && state.anchor.width > 0 && state.anchor.height > 0;
  },

  get loadStatus(): AvatarLoadStatus { return state.loadStatus; },
  get loadError(): string { return state.loadError; },
  setLoadStatus(s: AvatarLoadStatus, error = ''): void {
    state.loadStatus = s;
    state.loadError = error;
    loadListeners.forEach(l => l());
  },

  get sceneRunning(): boolean { return state.sceneRunning; },
  setSceneRunning(v: boolean): void {
    state.sceneRunning = v;
    loadListeners.forEach(l => l());
  },

  reset(): void {
    state.mood = 'idle';
    state.anchor = null;
    state.gaze = { x: 0, y: 0 };
    state.getAmp = () => 0;
    state.loadStatus = 'idle';
    state.loadError = '';
    state.sceneRunning = false;
    loadListeners.clear();
    anchorListeners.clear();
  },
};

function subscribeLoad(l: Listener): () => void {
  loadListeners.add(l);
  return () => { loadListeners.delete(l); };
}

export function useAvatarLoadStatus(): AvatarLoadStatus {
  return useSyncExternalStore(subscribeLoad, () => state.loadStatus, () => 'idle' as AvatarLoadStatus);
}

export function useSceneRunning(): boolean {
  return useSyncExternalStore(subscribeLoad, () => state.sceneRunning, () => false);
}

/**
 * URL du modèle : VITE_LEANNA_AVATAR_URL, sinon public/avatar/leanna.vrm.
 * Le fichier est une création originale fournie par l'équipe (cf. plan §5) :
 * il n'est pas versionné tant que sa licence n'est pas réglée.
 */
export const AVATAR_URL: string =
  (import.meta.env?.VITE_LEANNA_AVATAR_URL as string | undefined) || '/avatar/leanna.vrm';

/** Un VRM est un glTF binaire : il commence par la signature « glTF ». */
export function isGlbBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const b = new Uint8Array(buf, 0, 4);
  return b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46;
}

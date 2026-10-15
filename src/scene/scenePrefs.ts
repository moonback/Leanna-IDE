/**
 * scenePrefs — préférences de la scène 3D, globales et persistées :
 *   - intensity : Off / Sobre / Standard / Cinématique (Paramètres → Apparence)
 *   - focus     : mode Focus (Ctrl+Alt+F) qui coupe toute la 3D
 *
 * Même modèle que featureFlags.ts : store hors React + useSyncExternalStore.
 * Le mode Focus est aussi reflété sur <html data-focus="on"> pour le CSS.
 */
import { useSyncExternalStore } from 'react';
import type { SceneIntensity } from './quality.js';

export interface ScenePrefs {
  intensity: SceneIntensity;
  focus: boolean;
}

export const DEFAULT_SCENE_PREFS: ScenePrefs = { intensity: 'standard', focus: false };
export const SCENE_PREFS_KEY = 'Leanna_scene_prefs';

const INTENSITIES: readonly SceneIntensity[] = ['off', 'sober', 'standard', 'cinematic'];

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): ScenePrefs {
  try {
    const raw = localStorage.getItem(SCENE_PREFS_KEY);
    if (!raw) return DEFAULT_SCENE_PREFS;
    const p = JSON.parse(raw) as Partial<ScenePrefs>;
    return {
      intensity: INTENSITIES.includes(p.intensity as SceneIntensity) ? (p.intensity as SceneIntensity) : DEFAULT_SCENE_PREFS.intensity,
      focus: typeof p.focus === 'boolean' ? p.focus : DEFAULT_SCENE_PREFS.focus,
    };
  } catch {
    return DEFAULT_SCENE_PREFS;
  }
}

let snapshot: ScenePrefs = read();

function apply(): void {
  try {
    document.documentElement.setAttribute('data-focus', snapshot.focus ? 'on' : 'off');
  } catch { /* hors navigateur */ }
}

export function getScenePrefs(): ScenePrefs {
  return snapshot;
}

export function setScenePref<K extends keyof ScenePrefs>(key: K, value: ScenePrefs[K]): void {
  snapshot = { ...snapshot, [key]: value };
  try {
    localStorage.setItem(SCENE_PREFS_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.error('Failed to save scene prefs:', e);
  }
  apply();
  listeners.forEach(l => l());
}

export function reloadScenePrefs(): void {
  snapshot = read();
  apply();
  listeners.forEach(l => l());
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useScenePrefs(): ScenePrefs {
  return useSyncExternalStore(subscribe, () => snapshot, () => DEFAULT_SCENE_PREFS);
}

/**
 * Raccourci global Ctrl+Alt+F (⌘+⌥+F) pour basculer le mode Focus.
 * Ctrl+Shift+F est déjà la recherche globale de l'IDE. On teste `code`
 * (touche physique) car Ctrl+Alt modifie `key` sur certains claviers.
 */
export function isFocusShortcut(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  return (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyF';
}

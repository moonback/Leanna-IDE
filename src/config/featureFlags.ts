/**
 * featureFlags.ts — interrupteurs d'interface globaux (hors React et dans React).
 *
 * Pourquoi pas `useIdeSettings` : ce hook est un état local à IdeView, alors que
 * la refonte v3 (docs/PLAN_REFONTE_UI_IMMERSIVE.md) doit être lue par le shell
 * entier (main.tsx, sidebar, toutes les vues) et avant le premier rendu.
 *
 * Priorité de résolution d'un flag :
 *   1. paramètre d'URL `?ui=v3` / `?ui=classic` (session courante, non persisté)
 *   2. valeur persistée dans localStorage (`Leanna_feature_flags`)
 *   3. valeur par défaut ci-dessous
 *
 * Le flag `uiV3` est aussi reflété sur `<html data-ui="v3|classic">` pour que
 * les feuilles de style v3 puissent être cantonnées via `:root[data-ui="v3"]`.
 */
import { useSyncExternalStore } from 'react';

export interface FeatureFlags {
  /** Refonte « Leanna Cockpit » (shell, design system Nebula, scène 3D). */
  uiV3: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  uiV3: false,
};

export const FEATURE_FLAGS_KEY = 'Leanna_feature_flags';

type Listener = () => void;
const listeners = new Set<Listener>();

function readUrlOverrides(): Partial<FeatureFlags> {
  try {
    const ui = new URLSearchParams(window.location.search).get('ui');
    if (ui === 'v3') return { uiV3: true };
    if (ui === 'classic') return { uiV3: false };
  } catch { /* hors navigateur */ }
  return {};
}

function readStored(): Partial<FeatureFlags> {
  try {
    const raw = localStorage.getItem(FEATURE_FLAGS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<FeatureFlags> = {};
    const p = parsed as Record<string, unknown>;
    if (typeof p.uiV3 === 'boolean') out.uiV3 = p.uiV3;
    return out;
  } catch {
    return {};
  }
}

function resolve(): FeatureFlags {
  return { ...DEFAULT_FEATURE_FLAGS, ...readStored(), ...readUrlOverrides() };
}

let snapshot: FeatureFlags = resolve();

function applyToDocument(flags: FeatureFlags): void {
  try {
    document.documentElement.setAttribute('data-ui', flags.uiV3 ? 'v3' : 'classic');
  } catch { /* hors navigateur */ }
}

export function getFeatureFlags(): FeatureFlags {
  return snapshot;
}

export function setFeatureFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  const stored = { ...readStored(), [key]: value };
  try {
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(stored));
  } catch (e) {
    console.error('Failed to save feature flags:', e);
  }
  // Un choix explicite l'emporte sur un éventuel override d'URL de la session.
  snapshot = { ...snapshot, [key]: value };
  applyToDocument(snapshot);
  listeners.forEach(l => l());
}

/** Relit le stockage (tests, ou modification depuis un autre onglet). */
export function reloadFeatureFlags(): void {
  snapshot = resolve();
  applyToDocument(snapshot);
  listeners.forEach(l => l());
}

/** À appeler une fois avant le premier rendu (évite un flash classic → v3). */
export function initFeatureFlags(): void {
  reloadFeatureFlags();
  try {
    window.addEventListener('storage', e => {
      if (e.key === FEATURE_FLAGS_KEY) reloadFeatureFlags();
    });
  } catch { /* hors navigateur */ }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useFeatureFlag<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  return useSyncExternalStore(subscribe, () => snapshot[key], () => DEFAULT_FEATURE_FLAGS[key]);
}

/**
 * renderPasses — passes de rendu supplémentaires dessinées après la scène
 * principale (ex. l'avatar dans le rectangle de son ancre DOM).
 *
 * SceneHost rend lui-même la scène (useFrame de priorité 1) puis appelle
 * chaque passe enregistrée, dans l'ordre d'enregistrement.
 */
import type { WebGLRenderer } from 'three';

export type RenderPass = (renderer: WebGLRenderer) => void;

const passes = new Set<RenderPass>();

export function registerRenderPass(pass: RenderPass): () => void {
  passes.add(pass);
  return () => { passes.delete(pass); };
}

export function runRenderPasses(renderer: WebGLRenderer): void {
  passes.forEach(p => p(renderer));
}

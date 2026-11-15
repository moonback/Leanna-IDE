/**
 * Signale à l'overlay central (ProjectOpeningOverlay) qu'une ouverture de
 * projet démarre / se termine. À appeler autour de POST /api/self-root/change.
 */
export function beginProjectOpening(label?: string): void {
  window.dispatchEvent(new CustomEvent('Leanna-project-opening', { detail: { label, at: Date.now() } }));
}

export function endProjectOpening(ok: boolean, error?: string): void {
  window.dispatchEvent(new CustomEvent('Leanna-project-opened', { detail: { ok, error } }));
}

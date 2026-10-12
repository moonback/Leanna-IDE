// ─── Utilitaires du ChatPanel ────────────────────────────────────────────────

/** Place le curseur d'un textarea à une position donnée (après rendu). */
export function setCursorPosition(textarea: HTMLTextAreaElement, pos: number): void {
  requestAnimationFrame(() => {
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
  });
}

/** Lit une valeur JSON depuis localStorage avec repli silencieux. */
export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw != null ? JSON.parse(raw) : null;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Écrit une valeur JSON dans localStorage sans jamais lever d'exception. */
export function writeJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota dépassé / mode privé : on ignore */
  }
}

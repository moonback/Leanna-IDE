/**
 * ideRemoteBridge — Pont d'actions entre la fenêtre « Présence vocale » (orb)
 * et la fenêtre IDE principale (processus renderer distincts sous Electron).
 *
 * Problème : la fenêtre orb possède sa PROPRE session live. Quand l'assistant y
 * déclenche une action destinée à l'IDE (ouvrir un fichier, naviguer, piloter
 * le navigateur intégré…), `useLiveAPI` émet un CustomEvent sur le `window` de
 * la fenêtre orb — invisible pour l'IDE.
 *
 * Solution : dans la fenêtre orb, on intercepte une liste blanche d'événements
 * et on les relaie via IPC (electronAPI.forwardToIde). Le main les renvoie à la
 * fenêtre IDE, qui les REJOUE localement (electronAPI.onRemoteEvent) pour que
 * tout le code existant de l'IDE réagisse sans modification.
 */

interface ElectronBridgeAPI {
  forwardToIde?: (name: string, detail: unknown, focusIde?: boolean) => Promise<unknown>;
  onRemoteEvent?: (cb: (payload: { name: string; detail: unknown }) => void) => () => void;
}

function getElectronAPI(): ElectronBridgeAPI | undefined {
  return (window as unknown as { electronAPI?: ElectronBridgeAPI }).electronAPI;
}

/**
 * Événements relayés depuis la fenêtre orb vers l'IDE. On ne relaie QUE les
 * actions qui pilotent l'IDE / le navigateur — pas les événements purement
 * locaux à la session (tokens, transcript, etc.).
 */
export const FORWARDED_IDE_EVENTS: string[] = [
  // Actions IDE génériques (navigation, ouverture de fichier, open-ide…)
  'Leanna-action',
  'Leanna-open-file',
  'Leanna-file-changed',
  'Leanna-open-missions',
  'Leanna-toggle-missions',
  'Leanna-open-agents-panel',
  'Leanna-toggle-agents-panel',
  'Leanna-open-sandbox-diff',
  'Leanna-open-rich-document',
  'Leanna-save-rich-document-result',
  // Pilotage du navigateur intégré
  'Leanna-browser-scroll',
  'Leanna-browser-control',
  'Leanna-browser-read-request',
  'Leanna-browser-click',
  'Leanna-browser-type',
  'Leanna-browser-snapshot',
  'Leanna-browser-inspect',
  'Leanna-browser-get-links',
  'Leanna-browser-mouse-move',
  'Leanna-browser-accessibility-snapshot',
  'Leanna-browser-click-by-role',
  'Leanna-browser-type-by-label',
  'Leanna-browser-wait-for',
  'Leanna-browser-get-element-text',
  'Leanna-browser-get-element-attribute',
  'Leanna-browser-fill-form',
  'Leanna-browser-select-option',
  'Leanna-browser-get-console',
  'Leanna-browser-capture',
  'Leanna-browser-new-tab',
];

/**
 * Événements dont l'arrivée doit ramener l'IDE au premier plan (ils ouvrent du
 * contenu visible). Les actions « silencieuses » (lecture navigateur, etc.) ne
 * volent pas le focus.
 */
const FOCUS_IDE_EVENTS = new Set<string>([
  'Leanna-action',
  'Leanna-open-file',
  'Leanna-open-missions',
  'Leanna-open-agents-panel',
  'Leanna-open-sandbox-diff',
  'Leanna-open-rich-document',
]);

/** Vrai si on tourne dans Electron avec le pont IPC disponible. */
export function isRemoteBridgeAvailable(): boolean {
  const api = getElectronAPI();
  return Boolean(api?.forwardToIde && api?.onRemoteEvent);
}

/**
 * Installe le FORWARDER (fenêtre orb). Écoute la liste blanche et relaie chaque
 * événement vers l'IDE. Renvoie une fonction de nettoyage.
 */
export function installIdeRemoteForwarder(): () => void {
  const api = getElectronAPI();
  if (!api?.forwardToIde) return () => {};

  const handlers: Array<[string, EventListener]> = [];

  for (const name of FORWARDED_IDE_EVENTS) {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent).detail ?? null;
      const focusIde = FOCUS_IDE_EVENTS.has(name);
      void api.forwardToIde!(name, detail, focusIde);
    };
    window.addEventListener(name, handler);
    handlers.push([name, handler]);
  }

  return () => {
    for (const [name, handler] of handlers) window.removeEventListener(name, handler);
  };
}

/**
 * Installe le RÉCEPTEUR (fenêtre IDE). Rejoue localement chaque action relayée
 * depuis la fenêtre orb. Renvoie une fonction de nettoyage.
 */
export function installIdeRemoteReceiver(): () => void {
  const api = getElectronAPI();
  if (!api?.onRemoteEvent) return () => {};

  return api.onRemoteEvent(({ name, detail }) => {
    if (typeof name !== 'string') return;
    // Sécurité : ne rejouer que des événements connus de la liste blanche.
    if (!FORWARDED_IDE_EVENTS.includes(name)) return;
    window.dispatchEvent(new CustomEvent(name, { detail }));
  });
}

const { contextBridge, ipcRenderer } = require('electron');

// Expose uniquement les IPC handlers nécessaires au renderer
// nodeIntegration est désactivé — le renderer ne peut pas appeler require() directement
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) =>
    ipcRenderer.invoke('electron/open-external', url),

  selectFolder: () =>
    ipcRenderer.invoke('electron/select-folder'),

  getScreenSources: () =>
    ipcRenderer.invoke('electron/get-screen-sources'),

  quit: () =>
    ipcRenderer.invoke('electron/quit'),

  // Ouvre la fenêtre dédiée « Présence vocale » (orb + live vocal) sur /orb-live.
  openOrbWindow: () =>
    ipcRenderer.invoke('electron/open-orb-window'),

  // Relaie une action de la fenêtre orb vers la fenêtre IDE principale.
  //   name   : nom de l'événement (ex: 'Leanna-action')
  //   detail : charge utile de l'événement
  //   focusIde : ramène l'IDE au premier plan si true
  forwardToIde: (name, detail, focusIde) =>
    ipcRenderer.invoke('electron/forward-to-ide', { name, detail, focusIde }),

  // S'abonne aux actions relayées depuis une autre fenêtre (reçues par l'IDE).
  // Retourne une fonction de désabonnement.
  onRemoteEvent: (callback) => {
    const listener = (_event, payload) => {
      try { callback(payload); } catch (_) { /* noop */ }
    };
    ipcRenderer.on('leanna-remote-event', listener);
    return () => ipcRenderer.removeListener('leanna-remote-event', listener);
  },

  // Clone un dépôt git distant dans un dossier local.
  // repoUrl  : URL HTTPS ou SSH du dépôt (ex: https://github.com/user/repo.git)
  // targetDir: dossier parent optionnel (défaut: ~/Documents/Leanna-Projects)
  // Retourne : { success: boolean, path?: string, repoName?: string, error?: string }
  gitClone: (repoUrl, targetDir) =>
    ipcRenderer.invoke('electron/git-clone', repoUrl, targetDir),

  // ── Extensions Chromium du navigateur intégré ───────────────────────────────
  // partition : la partition de session du profil actif (ex: persist:browser-default)
  // Retournent toutes : { success: boolean, ... , error?: string }

  // Liste les extensions chargées pour une partition.
  browserExtensionsList: (partition) =>
    ipcRenderer.invoke('electron/browser-extensions-list', partition),

  // Charge une extension décompressée. Si extPath est omis, ouvre un sélecteur de dossier.
  browserExtensionsLoad: (partition, extPath) =>
    ipcRenderer.invoke('electron/browser-extensions-load', partition, extPath),

  // Retire une extension par son identifiant.
  browserExtensionsRemove: (partition, extensionId) =>
    ipcRenderer.invoke('electron/browser-extensions-remove', partition, extensionId),
});

// ── Relais main → renderer : ouverture d'URL (popup/target=_blank refusé) ─────
// Le main refuse les popups (setWindowOpenHandler) et renvoie l'URL ici ; on la
// rediffuse en CustomEvent pour que le navigateur intégré l'ouvre dans un onglet.
ipcRenderer.on('browser-open-url', (_event, url) => {
  try {
    window.dispatchEvent(new CustomEvent('Leanna-browser-open-url', { detail: { url } }));
  } catch { /* noop */ }
});

const { app, BrowserWindow, systemPreferences, Notification, ipcMain, shell, dialog, desktopCapturer, nativeTheme } = require('electron');
nativeTheme.themeSource = 'dark';

const fs = require('fs');
const path = require('path');

const DEBUG = process.env.ELECTRON_DEBUG === '1';
const isPackaged = app.isPackaged;

function getWindowIcon() {
  const iconName = nativeTheme.shouldUseDarkColors ? 'icon-sombre.png' : 'icon-light.png';
  return path.join(__dirname, '../assets/images', iconName);
}

// --- Logging vers fichier, visible même sans terminal ---
const logPath = path.join(app.getPath('userData'), 'Leanna-debug.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(logPath, line + '\n'); } catch (_) {}
}

process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err.stack || err.message);
  dialog.showErrorBox('Erreur Leanna ', String(err.stack || err));
});

process.on('unhandledRejection', (err) => {
  log('UNHANDLED REJECTION:', err && err.stack ? err.stack : String(err));
});

log('App starting. isPackaged =', isPackaged, 'appPath =', app.getAppPath());

function startBackendServer() {
  try {
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_APP_PATH = app.getAppPath();
    // Dossier persistant pour les fichiers de config (.env, .gemini-keys.json, etc.)
    const configDir = app.getPath('userData');
    process.env.Leanna_CONFIG_PATH = configDir;
    log('Config directory:', configDir);

    // Initialiser le fichier .env utilisateur dans userData à partir du template .env.example si absent
    const destEnv = path.join(configDir, '.env');
    const exampleEnv = path.join(app.getAppPath(), '.env.example');
    if (!fs.existsSync(destEnv) && fs.existsSync(exampleEnv)) {
      try {
        fs.copyFileSync(exampleEnv, destEnv);
        log('Initialized user .env from .env.example in userData');
      } catch (e) {
        log('Failed to initialize .env from .env.example:', e.message);
      }
    }

    const serverPath = path.join(app.getAppPath(), 'dist', 'server.cjs');
    log('Loading server from:', serverPath, 'exists:', fs.existsSync(serverPath));
    require(serverPath);
    log('Server module required successfully');
  } catch (err) {
    log('SERVER START FAILED:', err.stack || err.message);
    dialog.showErrorBox('Erreur démarrage serveur', String(err.stack || err));
  }
}

// ── Splash Screen ───────────────────────────────────────────────────────────

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 680,
    height: 420,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: getWindowIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  return splash;
}

// ── Main Window ─────────────────────────────────────────────────────────────

function createWindow(splash, splashMinEnd) {
  const win = new BrowserWindow({
    width: DEBUG ? 1600 : 1200,
    height: 900,
    show: false, // Caché jusqu'à ce que le contenu soit prêt
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
    },
    autoHideMenuBar: !DEBUG,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    icon: getWindowIcon(),
  });

  win.maximize();

  const port = process.env.VITE_SERVER_PORT || 4000;
  const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${port}`;
  log('Loading URL:', startUrl);
  win.loadURL(startUrl);

  // Afficher la fenêtre principale une fois le contenu chargé
  win.webContents.on('did-finish-load', () => {
    // Compléter la barre de progression sur le splash
    if (splash && !splash.isDestroyed()) {
      splash.webContents.executeJavaScript('if (typeof window.markComplete === "function") window.markComplete();').catch(() => {});
    }

    // Attendre la fin du cycle splash (minimum 4.5 secondes)
    const remaining = Math.max(400, (splashMinEnd || 0) - Date.now());
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) {
        splash.close();
      }
      win.maximize();
      win.show();
      win.focus();
    }, remaining);
  });

  // Logger les messages de la console renderer dans le fichier de log
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    log(`[Renderer L${level}] ${message} (${sourceId}:${line})`);
  });

  // Raccourci F12 ou Ctrl+Shift+I pour ouvrir/fermer les DevTools
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Ouvrir les DevTools automatiquement en mode debug
  if (DEBUG) {
    win.webContents.openDevTools({ mode: 'right' });
    console.log('[Electron] Mode debug activé — DevTools ouverts');
  }

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    log('FAILED TO LOAD:', errorCode, errorDescription);
    // Réessayer après 1.5s si le serveur n'est pas encore prêt
    if (errorCode === -102 || errorCode === -6 || errorCode === -105) {
      setTimeout(() => {
        log('Retrying load...');
        win.loadURL(startUrl);
      }, 1500);
    }
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    log('RENDER PROCESS GONE:', JSON.stringify(details));
  });

  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone');
    systemPreferences.askForMediaAccess('camera');
  }

  return win;
}

app.whenReady().then(() => {
  const splash = createSplashWindow();
  const splashMinEnd = Date.now() + 5000; // splash visible au moins 5 secondes

  // Démarrer le serveur backend en mode packagé
  if (isPackaged) {
    startBackendServer();
  }

  createWindow(splash, splashMinEnd);

  // --- IPC Handlers (inchangé) ---

  ipcMain.handle('electron/folder-contents', async function (_event, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    return entries.map(function (entry) {
      return {
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(folderPath, entry.name),
      };
    });
  });

  ipcMain.handle('electron/create-file', async function (_event, folderPath, fileName) {
    const targetPath = path.join(folderPath, fileName);
    await fs.promises.writeFile(targetPath, '', { flag: 'wx' });
    return targetPath;
  });

  ipcMain.handle('electron/create-folder', async function (_event, folderPath, folderName) {
    const targetPath = path.join(folderPath, folderName);
    await fs.promises.mkdir(targetPath, { recursive: false });
    return targetPath;
  });

  ipcMain.handle('electron/delete-path', async function (_event, targetPath) {
    await fs.promises.rm(targetPath, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle('electron/open-path', async function (_event, targetPath) {
    await shell.openPath(targetPath);
    return true;
  });

  ipcMain.handle('electron/open-external', async function (_event, url) {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('electron/get-project-root', async function () {
    // IDE : retourne toujours le dossier de l'app elle-même
    return process.env.ELECTRON_APP_PATH || app.getAppPath();
  });

  ipcMain.handle('electron/select-folder', async function () {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choisir le workspace',
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('electron/quit', function () {
    app.quit();
  });

  ipcMain.handle('electron/get-screen-sources', async function () {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map(function (source) {
      return {
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
      };
    });
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(null, 0);
    }
  });

  if (Notification.isSupported()) {
    new Notification({ title: 'Leanna ', body: 'Système local connecté et prêt.' }).show();
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Le serveur Express est chargé dans le même process (require(serverPath)).
// On utilise process.__LeannaShutdown (exposé par server.ts) pour déclencher
// l'arrêt propre des timers, sessions Gemini et WebSocket avant de quitter.
// Cela évite les MaxListenersExceededWarning et sessions zombies après
// plusieurs redémarrages en développement.

let isShuttingDown = false;

app.on('before-quit', function (event) {
  if (isShuttingDown) return; // Éviter les appels multiples
  const shutdown = process.__LeannaShutdown;
  if (typeof shutdown !== 'function') return; // dev mode : server.ts non chargé ici

  isShuttingDown = true;
  event.preventDefault();
  log('[Lifecycle] before-quit : déclenchement du graceful shutdown...');

  shutdown('before-quit').then(function () {
    log('[Lifecycle] Shutdown complet, fermeture Electron.');
  }).catch(function (err) {
    log('[Lifecycle] Erreur shutdown:', err && err.message ? err.message : String(err));
  }).finally(function () {
    // Tuer tous les processus enfants restants sur Windows
    killChildProcesses();
    app.exit(0);
  });

  // Sécurité : forcer la fermeture après 5s si le shutdown n'aboutit pas
  setTimeout(function () {
    log('[Lifecycle] Timeout shutdown (5s), forçage fermeture.');
    killChildProcesses();
    app.exit(0);
  }, 5000);
});

// Sur Windows, app.exit() ne tue pas toujours les child processes (MCP, etc.)
// On utilise taskkill pour nettoyer l'arbre de processus.
function killChildProcesses() {
  if (process.platform !== 'win32') return;
  try {
    const { execSync } = require('child_process');
    const pid = process.pid;
    log('[Lifecycle] Nettoyage processus enfants (PID parent:', pid, ')...');
    // /T = kill process tree, /F = force
    execSync('taskkill /PID ' + pid + ' /T /F', {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch (_) {
    // Erreur attendue : taskkill échoue quand le process est déjà en train de mourir
  }
}


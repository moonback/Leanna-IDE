/**
 * BrowserTabView — un onglet = une <webview> Electron persistante.
 *
 * Chaque onglet garde sa propre webview montée (masquée via CSS quand il n'est
 * pas actif), son propre tampon console/réseau, et son propre cycle dom-ready /
 * URL en attente. Le composant remonte à ses parents (via `onState`) les
 * changements d'URL/titre/chargement/navigation, et expose l'élément <webview>
 * actif au parent via `onActiveWebview` pour que les 27 outils IPC existants
 * continuent de piloter l'onglet actif sans modification.
 */

import { useEffect, useRef, useState } from 'react';
import type {
  WebviewElement,
  WebviewFailLoadEvent,
  WebviewFaviconEvent,
  WebviewNavigateEvent,
  WebviewTitleEvent,
} from './browserTypes.js';

export interface ConsoleEntry {
  level: string;
  message: string;
  source?: string;
  line?: number;
  ts: number;
}

/** Patch d'état d'onglet remonté au parent. */
export interface TabStatePatch {
  url?: string;
  title?: string;
  loading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  loadError?: string | null;
  faviconUrl?: string | null;
}

export interface BrowserTabHandle {
  loadURL(url: string): void;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  /** L'élément <webview> natif (ou null si pas encore prêt). */
  getWebview(): WebviewElement | null;
  /** Lecture du tampon console/réseau de cet onglet. */
  getConsole(): ConsoleEntry[];
}

interface BrowserTabViewProps {
  tabId: string;
  active: boolean;
  partition: string;
  /** URL initiale chargée au montage de la webview. */
  initialUrl: string;
  /** Remonte un patch d'état au parent (seulement pour cet onglet). */
  onState: (tabId: string, patch: TabStatePatch) => void;
  /** Enregistre le handle impératif de l'onglet auprès du parent. */
  onRegister: (tabId: string, handle: BrowserTabHandle | null) => void;
  /** Appelé quand l'onglet actif a une nouvelle webview prête (pour webviewRef). */
  onActiveWebview?: (wv: WebviewElement | null) => void;
}

const MAX_CONSOLE_ENTRIES = 300;

/**
 * Electron rejects webview.loadURL() with ERR_ABORTED when a newer navigation
 * supersedes the current one. This is an expected lifecycle event, not a
 * renderer-level unhandled rejection. Keep genuine failures observable.
 */
function loadUrlSafely(webview: WebviewElement, url: string): void {
  try {
    void Promise.resolve(webview.loadURL(url)).catch((error: unknown) => {
      const candidate = error as { code?: string; errno?: number; message?: string };
      if (candidate?.code === 'ERR_ABORTED' || candidate?.errno === -3 ||
          /ERR_ABORTED|-3/i.test(candidate?.message ?? '')) {
        return;
      }
      console.warn('[BrowserTabView] Échec loadURL:', url, error);
    });
  } catch (error) {
    const candidate = error as { code?: string; errno?: number; message?: string };
    if (candidate?.code === 'ERR_ABORTED' || candidate?.errno === -3 ||
        /ERR_ABORTED|-3/i.test(candidate?.message ?? '')) return;
    console.warn('[BrowserTabView] Échec synchrone loadURL:', url, error);
  }
}

export function BrowserTabView({
  tabId,
  active,
  partition,
  initialUrl,
  onState,
  onRegister,
  onActiveWebview,
}: BrowserTabViewProps) {
  const webviewRef = useRef<WebviewElement>(null);
  // Figé au montage : le parent passe tab.url (mis à jour à chaque did-navigate) ;
  // réécrire l'attribut src relancerait un loadURL qui avorte la navigation en cours (ERR_ABORTED -3).
  const [initialSrc] = useState(initialUrl);
  const domReadyRef = useRef(false);
  const pendingUrlRef = useRef<string | null>(null);
  const consoleBufferRef = useRef<ConsoleEntry[]>([]);

  // Refs stables vers les callbacks parent : l'effet d'abonnement tourne avec
  // [partition] et ne doit pas se réabonner à chaque changement de callback.
  const onStateRef = useRef(onState);
  const onRegisterRef = useRef(onRegister);
  const onActiveWebviewRef = useRef(onActiveWebview);
  const activeRef = useRef(active);
  useEffect(() => { onStateRef.current = onState; }, [onState]);
  useEffect(() => { onRegisterRef.current = onRegister; }, [onRegister]);
  useEffect(() => { onActiveWebviewRef.current = onActiveWebview; }, [onActiveWebview]);
  useEffect(() => { activeRef.current = active; }, [active]);

  // ── Événements natifs de la webview (par onglet) ────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const pushConsole = (entry: Omit<ConsoleEntry, 'ts'>) => {
      const buf = consoleBufferRef.current;
      buf.push({ ...entry, ts: Date.now() });
      if (buf.length > MAX_CONSOLE_ENTRIES) buf.splice(0, buf.length - MAX_CONSOLE_ENTRIES);
    };

    const handle: BrowserTabHandle = {
      loadURL: (url: string) => {
        if (domReadyRef.current) loadUrlSafely(wv, url);
        else pendingUrlRef.current = url;
      },
      reload: () => wv.reload(),
      stop: () => wv.stop(),
      goBack: () => wv.goBack(),
      goForward: () => wv.goForward(),
      getWebview: () => webviewRef.current,
      getConsole: () => consoleBufferRef.current.slice(),
    };
    onRegisterRef.current(tabId, handle);

    const diagnostic = (level: string, message: string, source?: string) => {
      pushConsole({ level, message: message.slice(0, 4000), source: source ?? 'Leanna browser diagnostics' });
      const method = level === 'error' || level === 'network' ? 'error' : level === 'warn' ? 'warn' : 'info';
      console[method]('[BrowserTabView]', { tabId, url: (() => { try { return wv.getURL(); } catch { return ''; } })(), message });
    };

    const onDomReady = () => {
      domReadyRef.current = true;
      diagnostic('info', 'dom-ready: renderer DOM prêt');
      if (pendingUrlRef.current) {
        loadUrlSafely(wv, pendingUrlRef.current);
        pendingUrlRef.current = null;
      }
    };
    const onLoadStart = () => { diagnostic('info', 'did-start-loading'); onStateRef.current(tabId, { loading: true, loadError: null }); };
    const onLoadStop = () => {
      const url = wv.getURL();
      diagnostic('info', `did-stop-loading: ${url} | title=${wv.getTitle?.() ?? ''}`);
      onStateRef.current(tabId, {
        loading: false,
        url,
        title: wv.getTitle?.() ?? '',
        canGoBack: wv.canGoBack(),
        canGoForward: wv.canGoForward(),
      });
      window.dispatchEvent(new CustomEvent('Leanna-browser-navigated', { detail: { url } }));
    };
    const onTitleUpdate = (e: Event) => {
      const title = (e as WebviewTitleEvent).title;
      onStateRef.current(tabId, { title });
      window.dispatchEvent(new CustomEvent('Leanna-browser-title-updated', { detail: { title, url: wv.getURL() } }));
    };
    const onConsoleMessage = (e: Event) => {
      const ev = e as unknown as { level: number; message: string; line: number; sourceId: string };
      const level = ev.level === 3 ? 'error' : ev.level === 2 ? 'warn' : ev.level === 1 ? 'info' : 'log';
      diagnostic(level, `${String(ev.message ?? '')} (line=${ev.line ?? '?'} source=${ev.sourceId ?? '?'})`, ev.sourceId);
    };
    const onFailLoad = (e: Event) => {
      const ev = e as WebviewFailLoadEvent;
      if (ev.isMainFrame === false) {
        if (ev.errorCode !== -3) diagnostic('network', `Échec sous-ressource: code=${ev.errorCode} (${ev.errorDescription}) url=${ev.validatedURL ?? ''}`);
        return;
      }
      if (ev.errorCode === -3) {
        onStateRef.current(tabId, { loading: false });
        return;
      }
      diagnostic('network', `Échec frame principale: code=${ev.errorCode} (${ev.errorDescription}) url=${ev.validatedURL ?? ''}`);
      onStateRef.current(tabId, { loading: false, loadError: `Impossible de charger cette page (${ev.errorDescription})` });
    };
    const onNavigate = (e: Event) => {
      const ev = e as WebviewNavigateEvent;
      if (ev.isMainFrame !== false && e.type === 'did-navigate') {
        consoleBufferRef.current = [];
        // Nouvelle page : réinitialiser le favicon jusqu'à ce que la page en fournisse un.
        onStateRef.current(tabId, { faviconUrl: null });
      }
      onStateRef.current(tabId, {
        url: ev.url,
        canGoBack: wv.canGoBack(),
        canGoForward: wv.canGoForward(),
      });
    };
    const onFaviconUpdate = (e: Event) => {
      const favicons = (e as WebviewFaviconEvent).favicons;
      if (Array.isArray(favicons) && favicons[0]) {
        onStateRef.current(tabId, { faviconUrl: favicons[0] });
      }
    };

    wv.addEventListener('dom-ready', onDomReady);
    const onFrameFinish = (event: Event) => { const ev = event as Event & { isMainFrame?: boolean }; if (ev.isMainFrame !== false) diagnostic('info', 'did-frame-finish-load'); };
    const onRedirect = (event: Event) => { const ev = event as Event & { url?: string; isMainFrame?: boolean }; diagnostic('info', `did-redirect-navigation: ${ev.url ?? 'URL inconnue'} mainFrame=${ev.isMainFrame !== false}`); };

    wv.addEventListener('did-start-loading', onLoadStart);
    wv.addEventListener('did-frame-finish-load', onFrameFinish);
    wv.addEventListener('did-redirect-navigation', onRedirect);
    wv.addEventListener('did-stop-loading', onLoadStop);
    wv.addEventListener('page-title-updated', onTitleUpdate);
    wv.addEventListener('did-fail-load', onFailLoad);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    wv.addEventListener('console-message', onConsoleMessage);
    wv.addEventListener('page-favicon-updated', onFaviconUpdate);

    // Si cet onglet est actif au montage, exposer immédiatement sa webview.
    if (activeRef.current) onActiveWebviewRef.current?.(wv);

    return () => {
      domReadyRef.current = false;
      onRegisterRef.current(tabId, null);
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('did-start-loading', onLoadStart);
      wv.removeEventListener('did-frame-finish-load', onFrameFinish);
      wv.removeEventListener('did-redirect-navigation', onRedirect);
      wv.removeEventListener('did-stop-loading', onLoadStop);
      wv.removeEventListener('page-title-updated', onTitleUpdate);
      wv.removeEventListener('did-fail-load', onFailLoad);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      wv.removeEventListener('console-message', onConsoleMessage);
      wv.removeEventListener('page-favicon-updated', onFaviconUpdate);
    };
    // partition : un changement de profil remonte la <webview> ; on réabonne.
  }, [tabId, partition]);

  // Quand cet onglet devient actif, exposer sa webview au parent (webviewRef).
  useEffect(() => {
    if (active) onActiveWebviewRef.current?.(webviewRef.current);
  }, [active]);

  return (
    <webview
      // key gérée par le parent (tabId+partition). ref natif pour cet onglet.
      ref={webviewRef}
      src={initialSrc}
      partition={partition}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // Onglet inactif : masqué mais TOUJOURS monté (reste chargé).
        visibility: active ? 'visible' : 'hidden',
        zIndex: active ? 1 : 0,
      }}
    />
  );
}

/**
 * BrowserPanel — Navigateur web intégré via Electron <webview>.
 * Contrôlable depuis l'extérieur (prop `url`) pour permettre à Leanna
 * de piloter la navigation. Émet des CustomEvents pour notifier le reste
 * de l'application des changements d'URL/titre/contenu.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  X,
  Home,
  Globe,
  Lock,
  AlertTriangle,
  Loader2,
  Bot,
} from 'lucide-react';

// ─── Types webview (Electron-specific, non exposés par le tsconfig) ───────────

interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): void;
  reload(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
  getTitle(): string;
  executeJavaScript(code: string): Promise<unknown>;
}

interface WebviewTitleEvent extends Event {
  title: string;
  explicitSet: boolean;
}

interface WebviewFailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
}

interface WebviewNavigateEvent extends Event {
  url: string;
  httpResponseCode: number;
  httpStatusText: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface BrowserPanelProps {
  onClose: () => void;
  /** URL courante contrôlée depuis l'extérieur (ex: par Leanna via skill) */
  url?: string;
  /** URL d'accueil par défaut */
  defaultUrl?: string;
  /** Prend toute la largeur disponible (zone principale). Défaut : false */
  fullWidth?: boolean;
  /** Largeur fixe en mode panneau latéral. Ignoré si fullWidth=true. */
  width?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const BROWSER_HOME_URL = 'https://www.google.com/webhp?igu=1';

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return BROWSER_HOME_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed) && !trimmed.includes(' ')) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function isHttps(url: string): boolean {
  return url.startsWith('https://');
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function BrowserPanel({
  onClose,
  url: controlledUrl,
  defaultUrl = BROWSER_HOME_URL,
  fullWidth = false,
  width = '520px',
}: BrowserPanelProps) {
  const webviewRef = useRef<WebviewElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputValue, setInputValue] = useState(defaultUrl);
  const [currentUrl, setCurrentUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [pageTitle, setPageTitle] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Indicateur visuel quand Leanna pilote la navigation */
  const [assistantNavActive, setAssistantNavActive] = useState(false);

  // ── Navigation interne ──────────────────────────────────────────────────────

  const navigateTo = useCallback((raw: string) => {
    const url = normalizeUrl(raw);
    setLoadError(null);
    setInputValue(url);
    webviewRef.current?.loadURL(url);
  }, []);

  // ── Navigation contrôlée depuis l'extérieur (Leanna) ───────────────────────

  useEffect(() => {
    if (!controlledUrl) return;
    const normalized = normalizeUrl(controlledUrl);
    if (normalized === currentUrl) return;
    setAssistantNavActive(true);
    navigateTo(normalized);
    const timer = setTimeout(() => setAssistantNavActive(false), 3000);
    return () => clearTimeout(timer);
  }, [controlledUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers clavier barre d'adresse ───────────────────────────────────────

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        navigateTo(inputValue);
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setInputValue(currentUrl);
        inputRef.current?.blur();
      }
    },
    [inputValue, currentUrl, navigateTo],
  );

  const handleGoBack = useCallback(() => webviewRef.current?.goBack(), []);
  const handleGoForward = useCallback(() => webviewRef.current?.goForward(), []);
  const handleRefresh = useCallback(() => {
    setLoadError(null);
    webviewRef.current?.reload();
  }, []);
  const handleHome = useCallback(() => navigateTo(BROWSER_HOME_URL), [navigateTo]);

  // ── Événements webview ──────────────────────────────────────────────────────

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onLoadStart = () => {
      setLoading(true);
      setLoadError(null);
    };

    const onLoadStop = () => {
      setLoading(false);
      const url = wv.getURL();
      setCurrentUrl(url);
      setInputValue(url);
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());

      // Notifier l'app (utilisé par le skill pour confirmer la navigation)
      window.dispatchEvent(new CustomEvent('jarvis-browser-navigated', {
        detail: { url },
      }));
    };

    const onTitleUpdate = (e: Event) => {
      const title = (e as WebviewTitleEvent).title;
      setPageTitle(title);
      window.dispatchEvent(new CustomEvent('jarvis-browser-title-updated', {
        detail: { title, url: wv.getURL() },
      }));
    };

    const onFailLoad = (e: Event) => {
      const ev = e as WebviewFailLoadEvent;
      if (ev.errorCode === -3) return; // ERR_ABORTED — annulation normale
      setLoading(false);
      setLoadError(`Impossible de charger cette page (${ev.errorDescription})`);
      window.dispatchEvent(new CustomEvent('jarvis-browser-load-error', {
        detail: { url: ev.validatedURL, error: ev.errorDescription },
      }));
    };

    const onNavigate = (e: Event) => {
      const ev = e as WebviewNavigateEvent;
      setCurrentUrl(ev.url);
      setInputValue(ev.url);
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
    };

    wv.addEventListener('did-start-loading', onLoadStart);
    wv.addEventListener('did-stop-loading', onLoadStop);
    wv.addEventListener('page-title-updated', onTitleUpdate);
    wv.addEventListener('did-fail-load', onFailLoad);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);

    return () => {
      wv.removeEventListener('did-start-loading', onLoadStart);
      wv.removeEventListener('did-stop-loading', onLoadStop);
      wv.removeEventListener('page-title-updated', onTitleUpdate);
      wv.removeEventListener('did-fail-load', onFailLoad);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
    };
  }, []);

  // ── Écoute des commandes directes via CustomEvent (fallback / scroll) ───────

  useEffect(() => {
    const handleNav = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.url) return;
      setAssistantNavActive(true);
      navigateTo(detail.url);
      setTimeout(() => setAssistantNavActive(false), 3000);
    };

    const handleScroll = (e: Event) => {
      const detail = (e as CustomEvent).detail as { direction: string; amount: number };
      const wv = webviewRef.current;
      if (!wv) return;

      let js = '';
      if (detail.direction === 'top') {
        js = 'window.scrollTo({ top: 0, behavior: "smooth" })';
      } else if (detail.direction === 'bottom') {
        js = 'window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })';
      } else if (detail.direction === 'up') {
        js = `window.scrollBy({ top: -${detail.amount ?? 300}, behavior: "smooth" })`;
      } else {
        js = `window.scrollBy({ top: ${detail.amount ?? 300}, behavior: "smooth" })`;
      }
      wv.executeJavaScript(js).catch(() => {/* ignore */});
    };

    const handleBrowserControl = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: string };
      const wv = webviewRef.current;
      if (!wv) return;
      if (detail.type === 'browser-back') {
        wv.goBack();
      } else if (detail.type === 'browser-forward') {
        wv.goForward();
      } else if (detail.type === 'browser-reload') {
        setLoadError(null);
        wv.reload();
      }
    };

    // ── Canal retour : Leanna demande le contenu de la page ──────────────
    const handleReadRequest = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; selector: string | null };
      const wv = webviewRef.current;
      if (!wv) return;

      const extractScript = detail.selector
        ? `(function(){
            var el = document.querySelector(${JSON.stringify(detail.selector)});
            return el ? el.innerText.substring(0, 8000) : '[sélecteur introuvable: ${detail.selector}]';
          })()`
        : `(function(){
            var title = document.title;
            var url = location.href;
            var clone = document.body.cloneNode(true);
            ['script','style','nav','footer','header','aside'].forEach(function(tag){
              Array.from(clone.querySelectorAll(tag)).forEach(function(el){ el.remove(); });
            });
            var text = clone.innerText
              .replace(/[ \\t]{2,}/g, ' ')
              .replace(/\\n{3,}/g, '\\n\\n')
              .substring(0, 8000);
            return JSON.stringify({ title: title, url: url, text: text });
          })()`;

      try {
        const raw = await wv.executeJavaScript(extractScript);
        const token = localStorage.getItem('jarvis_api_token') || '';
        await fetch('/api/browser/content-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-jarvis-token': token } : {}),
          },
          body: JSON.stringify({ requestId: detail.requestId, result: raw, error: null }),
        });
      } catch (err: any) {
        const token = localStorage.getItem('jarvis_api_token') || '';
        await fetch('/api/browser/content-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-jarvis-token': token } : {}),
          },
          body: JSON.stringify({ requestId: detail.requestId, result: null, error: err?.message ?? 'Erreur JS dans la webview' }),
        }).catch(() => {/* silent */});
      }
    };

    // ── Helper générique : POST résultat d'action webview → backend
    const postActionResult = async (requestId: string, result: any, error: string | null = null) => {
      try {
        const token = localStorage.getItem('jarvis_api_token') || '';
        await fetch('/api/browser/action-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-jarvis-token': token } : {}),
          },
          body: JSON.stringify({ requestId, result, error }),
        });
      } catch {/* silent */}
    };

    // ── Clic sur un élément
    const handleClick = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; selector: string };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      try {
        const clickScript = `(function(){
          var el = document.querySelector(${JSON.stringify(detail.selector)});
          if (!el) return JSON.stringify({ error: 'Sélecteur introuvable: ${detail.selector.replace(/'/g, "\\'")}' });
          var evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          el.dispatchEvent(evt);
          return JSON.stringify({ ok: true });
        })()`;
        const raw = await wv.executeJavaScript(clickScript);
        let parsed: any = {};
        try { parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch {}
        if (parsed?.error) {
          await postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        setTimeout(async () => {
          try {
            const content = await wv.executeJavaScript(`document.body.innerText.substring(0, 3000)`);
            postActionResult(detail.requestId, { content });
          } catch {
            postActionResult(detail.requestId, {});
          }
        }, 1200);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur clic');
      }
    };

    // ── Saisie dans un champ
    const handleType = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string; selector: string; text: string; pressEnter?: boolean;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      try {
        const typeScript = `(function(){
          var el = document.querySelector(${JSON.stringify(detail.selector)});
          if (!el) return JSON.stringify({ error: 'Sélecteur introuvable' });
          el.focus();
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            el.value = ${JSON.stringify(detail.text)};
          } else {
            el.setAttribute('contenteditable', 'true');
            el.innerText = ${JSON.stringify(detail.text)};
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return JSON.stringify({ ok: true });
        })()`;
        const raw = await wv.executeJavaScript(typeScript);
        let parsed: any = {};
        try { parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch {}
        if (parsed?.error) {
          await postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        if (detail.pressEnter) {
          setTimeout(async () => {
            try {
              await wv.executeJavaScript(`
                (function(){
                  var el = document.querySelector(${JSON.stringify(detail.selector)});
                  if (el) {
                    var ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
                    el.dispatchEvent(ev);
                    ev = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true });
                    el.dispatchEvent(ev);
                  }
                })();
              `);
            } catch {/* ignore */}
            postActionResult(detail.requestId, { ok: true });
          }, 300);
        } else {
          postActionResult(detail.requestId, { ok: true });
        }
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur saisie');
      }
    };

    // ── Snapshot des éléments interactifs
    const handleSnapshot = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const snapshotScript = `(function(){
        var bestSelector = function(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
          if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
          var name = el.name;
          if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
          var placeholder = el.placeholder;
          if (placeholder) return el.tagName.toLowerCase() + '[placeholder="' + CSS.escape(placeholder) + '"]';
          var ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
          var role = el.getAttribute('role');
          if (role) return '[role="' + role + '"]';
          return el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0, 2).join('.') : '');
        };
        var inputs = Array.from(document.querySelectorAll(
          'input:not([type="hidden"]), textarea, select, [role="textbox"], [role="combobox"], [role="searchbox"]'
        )).slice(0, 20).map(function(el) {
          return {
            selector: bestSelector(el),
            tag: el.tagName.toLowerCase(),
            type: el.type || el.getAttribute('role') || '',
            placeholder: el.placeholder || el.getAttribute('aria-placeholder') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            name: el.name || '',
            visible: el.offsetParent !== null
          };
        });
        var buttons = Array.from(document.querySelectorAll(
          'button, input[type="submit"], input[type="button"], a[href], [role="button"]'
        )).filter(function(el) { return el.offsetParent !== null; }).slice(0, 15).map(function(el) {
          return {
            selector: bestSelector(el),
            text: (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().substring(0, 80),
            ariaLabel: el.getAttribute('aria-label') || ''
          };
        });
        return JSON.stringify({ url: location.href, title: document.title, inputs: inputs, buttons: buttons });
      })()`;
      try {
        const raw = await wv.executeJavaScript(snapshotScript);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : raw;
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur snapshot');
      }
    };

    // ── Inspection d'éléments spécifiques
    const handleInspect = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; inspectType: 'buttons' | 'inputs' | 'links' | 'all' };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const inspectScript = `(function(){
        var bestSelector = function(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
          if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
          var name = el.name;
          if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
          var placeholder = el.placeholder;
          if (placeholder) return el.tagName.toLowerCase() + '[placeholder="' + CSS.escape(placeholder) + '"]';
          var ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
          return el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0, 2).join('.') : '');
        };
        var results = {};
        if (type === 'buttons' || type === 'all') {
          results.buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')).map(function(btn) { return { selector: bestSelector(btn), text: (btn.innerText || btn.value || '').trim().substring(0, 80), ariaLabel: btn.getAttribute('aria-label') || '' }; }).slice(0, 12);
        }
        if (type === 'inputs' || type === 'all') {
          results.inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(function(input) { return { selector: bestSelector(input), type: input.type || 'textarea', placeholder: input.placeholder || '', ariaLabel: input.getAttribute('aria-label') || '', name: input.name || '' }; }).slice(0, 12);
        }
        if (type === 'links' || type === 'all') {
          results.links = Array.from(document.querySelectorAll('a[href]')).map(function(link) { return { selector: bestSelector(link), text: (link.innerText || '').trim().substring(0, 80), href: link.href || '' }; }).slice(0, 12);
        }
        return JSON.stringify(results);
      })('${detail.inspectType || 'all'}')`;
      try {
        const raw = await wv.executeJavaScript(inspectScript);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur inspect');
      }
    };

    window.addEventListener('jarvis-browser-navigate', handleNav);
    window.addEventListener('jarvis-browser-scroll', handleScroll);
    window.addEventListener('jarvis-browser-control', handleBrowserControl);
    window.addEventListener('jarvis-browser-read-request', handleReadRequest as EventListener);
    window.addEventListener('jarvis-browser-click', handleClick as EventListener);
    window.addEventListener('jarvis-browser-type', handleType as EventListener);
    window.addEventListener('jarvis-browser-snapshot', handleSnapshot as EventListener);
    window.addEventListener('jarvis-browser-inspect', handleInspect as EventListener);
    return () => {
      window.removeEventListener('jarvis-browser-navigate', handleNav);
      window.removeEventListener('jarvis-browser-scroll', handleScroll);
      window.removeEventListener('jarvis-browser-control', handleBrowserControl);
      window.removeEventListener('jarvis-browser-read-request', handleReadRequest as EventListener);
      window.removeEventListener('jarvis-browser-click', handleClick as EventListener);
      window.removeEventListener('jarvis-browser-type', handleType as EventListener);
      window.removeEventListener('jarvis-browser-snapshot', handleSnapshot as EventListener);
      window.removeEventListener('jarvis-browser-inspect', handleInspect as EventListener);
    };
  }, [navigateTo]);  // ── Render ──────────────────────────────────────────────────────────────────

  const secure = isHttps(currentUrl);

  return (
    <div
      className={`flex flex-col min-h-0 ${fullWidth ? 'flex-1 min-w-0' : 'border-l'}`}
      style={fullWidth ? {
        borderColor: 'var(--border-base)',
        backgroundColor: 'var(--bg-panel)',
      } : {
        width,
        minWidth: width,
        maxWidth: width,
        borderColor: 'var(--border-base)',
        backgroundColor: 'var(--bg-panel)',
      }}
    >
      {/* ── Toolbar ── */}
      <div
        className="flex flex-col gap-1.5 px-2 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-base)' }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Globe size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span
              className="text-[11px] font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
              title={pageTitle || 'Navigateur'}
            >
              {pageTitle || 'Navigateur'}
            </span>
            {/* Badge Leanna pilote */}
            {assistantNavActive && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: 'rgba(139,92,246,0.15)',
                  color: '#a78bfa',
                  border: '1px solid rgba(139,92,246,0.3)',
                }}
              >
                <Bot size={10} />
                Leanna
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition flex-shrink-0"
            title="Fermer le navigateur"
            aria-label="Fermer le navigateur"
          >
            <X size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Nav buttons + URL bar */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={!canGoBack}
            className="p-1.5 rounded transition hover:bg-white/10 disabled:opacity-30"
            title="Page précédente"
            aria-label="Page précédente"
          >
            <ArrowLeft size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          <button
            type="button"
            onClick={handleGoForward}
            disabled={!canGoForward}
            className="p-1.5 rounded transition hover:bg-white/10 disabled:opacity-30"
            title="Page suivante"
            aria-label="Page suivante"
          >
            <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 rounded transition hover:bg-white/10"
            title={loading ? 'Arrêter' : 'Actualiser'}
            aria-label={loading ? 'Arrêter le chargement' : 'Actualiser'}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>

          <button
            type="button"
            onClick={handleHome}
            className="p-1.5 rounded transition hover:bg-white/10"
            title="Page d'accueil"
            aria-label="Page d'accueil"
          >
            <Home size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          {/* URL bar */}
          <div
            className="flex flex-1 items-center gap-1 min-w-0 rounded-lg px-2 py-1"
            style={{
              backgroundColor: 'var(--bg-input, var(--bg-secondary))',
              border: `1px solid ${assistantNavActive ? 'rgba(139,92,246,0.5)' : 'var(--border-base)'}`,
              transition: 'border-color 0.2s',
            }}
          >
            {secure ? (
              <Lock size={11} style={{ color: '#4ade80', flexShrink: 0 }} aria-label="Connexion sécurisée" />
            ) : (
              <AlertTriangle size={11} style={{ color: '#f59e0b', flexShrink: 0 }} aria-label="Connexion non sécurisée" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onFocus={e => e.target.select()}
              className="flex-1 bg-transparent outline-none text-[11px] min-w-0"
              style={{ color: 'var(--text-primary)' }}
              placeholder="Entrez une URL ou une recherche…"
              aria-label="Barre d'adresse"
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {loadError && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-[11px] flex-shrink-0"
          style={{
            backgroundColor: 'rgba(239,68,68,0.1)',
            borderBottom: '1px solid rgba(239,68,68,0.25)',
            color: '#f87171',
          }}
        >
          <AlertTriangle size={12} />
          <span className="flex-1 truncate">{loadError}</span>
        </div>
      )}

      {/* ── Webview ── */}
      <div className="flex-1 min-h-0 relative">
        {/* @ts-ignore — webview is an Electron-specific HTML tag */}
        <webview
          ref={webviewRef}
          src={defaultUrl}
          style={{ width: '100%', height: '100%', display: 'flex' }}
          webpreferences="contextIsolation=yes, javascript=yes"
          allowpopups="false"
        />
      </div>
    </div>
  );
}

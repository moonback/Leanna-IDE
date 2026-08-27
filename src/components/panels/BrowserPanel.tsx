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

  /** true dès que le <webview> a émis dom-ready — loadURL ne peut être appelé qu'après */
  const domReadyRef = useRef(false);
  /** URL en attente si elle arrive avant que dom-ready soit émis */
  const pendingUrlRef = useRef<string | null>(null);

  // ── Navigation interne ──────────────────────────────────────────────────────

  const navigateTo = useCallback((raw: string) => {
    const url = normalizeUrl(raw);
    setLoadError(null);
    setInputValue(url);
    if (domReadyRef.current) {
      webviewRef.current?.loadURL(url);
    } else {
      // Le webview n'est pas encore prêt — on met l'URL en attente
      pendingUrlRef.current = url;
    }
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

    // Les attributs spécifiques Electron qui ne sont pas dans React's WebViewHTMLAttributes
    // doivent être settés directement sur l'élément natif (évite le warning
    // "Received false for a non-boolean attribute allowpopups" + erreur TS2322).
    try {
      (wv as any).setAttribute?.('allowpopups', 'false');
      (wv as any).setAttribute?.('webpreferences', 'contextIsolation=yes, javascript=yes');
    } catch { /* noop */ }

    const onDomReady = () => {
      domReadyRef.current = true;
      // Charger l'URL mise en attente si elle existe
      if (pendingUrlRef.current) {
        wv.loadURL(pendingUrlRef.current);
        pendingUrlRef.current = null;
      }
    };

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
      if (ev.errorCode === -3) {
        // ERR_ABORTED — annulation normale (navigation remplacée avant fin de chargement, destroy, etc.)
        setLoading(false);
        return;
      }
      setLoading(false);
      setLoadError(`Impossible de charger cette page (${ev.errorDescription})`);
    };

    const onNavigate = (e: Event) => {
      const ev = e as WebviewNavigateEvent;
      setCurrentUrl(ev.url);
      setInputValue(ev.url);
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
    };

    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('did-start-loading', onLoadStart);
    wv.addEventListener('did-stop-loading', onLoadStop);
    wv.addEventListener('page-title-updated', onTitleUpdate);
    wv.addEventListener('did-fail-load', onFailLoad);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);

    return () => {
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('did-start-loading', onLoadStart);
      domReadyRef.current = false;
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

    // ── Curseur simulé : injection + animation dans la webview ──────────────
    // Injecte (une seule fois) un curseur SVG flottant dans la page,
    // puis l'anime vers la position d'un élément cible avant une action.
    const CURSOR_INJECT_SCRIPT = `(function(){
      if (document.getElementById('__jarvis_cursor')) return;
      var cur = document.createElement('div');
      cur.id = '__jarvis_cursor';
      cur.style.cssText = [
        'position:fixed',
        'top:0','left:0',
        'width:22px','height:22px',
        'pointer-events:none',
        'z-index:2147483647',
        'transition:top 0.25s cubic-bezier(.4,0,.2,1),left 0.25s cubic-bezier(.4,0,.2,1)',
        'will-change:top,left',
        'display:block',
      ].join(';');
      cur.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">'
        + '<filter id="cs"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-opacity="0.4"/></filter>'
        + '<polygon points="4,2 4,18 8,14 11,20 13,19 10,13 16,13" fill="white" stroke="#333" stroke-width="1" filter="url(#cs)"/>'
        + '</svg>';
      document.body.appendChild(cur);
    })()`;

    const moveCursorToElement = async (wv: WebviewElement, selector: string): Promise<void> => {
      try {
        // Injecter le curseur si absent
        await wv.executeJavaScript(CURSOR_INJECT_SCRIPT);
        // Déplacer vers le centre de l'élément cible
        const moveScript = `(function(){
          var el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return;
          var r = el.getBoundingClientRect();
          var cur = document.getElementById('__jarvis_cursor');
          if (!cur) return;
          cur.style.left = (r.left + r.width / 2 - 4) + 'px';
          cur.style.top  = (r.top  + r.height / 2 - 2) + 'px';
        })()`;
        await wv.executeJavaScript(moveScript);
        // Laisser l'animation CSS se jouer (250 ms transition + 100 ms pause)
        await new Promise<void>((r) => setTimeout(r, 380));
        // Effet ripple au clic
        const rippleScript = `(function(){
          var el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return;
          var r = el.getBoundingClientRect();
          var rip = document.createElement('div');
          rip.style.cssText = [
            'position:fixed',
            'pointer-events:none',
            'z-index:2147483646',
            'border-radius:50%',
            'border:2px solid rgba(139,92,246,0.8)',
            'width:8px','height:8px',
            'left:' + (r.left + r.width/2 - 4) + 'px',
            'top:' + (r.top + r.height/2 - 4) + 'px',
            'transition:all 0.35s ease-out',
            'opacity:1',
          ].join(';');
          document.body.appendChild(rip);
          requestAnimationFrame(function(){
            rip.style.width  = '36px';
            rip.style.height = '36px';
            rip.style.left   = (r.left + r.width/2 - 18) + 'px';
            rip.style.top    = (r.top + r.height/2 - 18) + 'px';
            rip.style.opacity = '0';
          });
          setTimeout(function(){ rip.remove(); }, 400);
        })()`;
        await wv.executeJavaScript(rippleScript);
      } catch {/* ne bloque pas l'action si l'animation échoue */}
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
        // Animer le curseur vers la cible avant le clic
        await moveCursorToElement(wv, detail.selector);

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
        // Animer le curseur vers le champ avant la saisie
        await moveCursorToElement(wv, detail.selector);

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

    // ── Extraction des liens de la page
    const handleGetLinks = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; selector: string | null };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const selectorExpr = detail.selector
        ? JSON.stringify(detail.selector + ' a[href]')
        : '"a[href]"';
      const getLinksScript = `(function(){
        try {
          var seen = {};
          var links = Array.from(document.querySelectorAll(${selectorExpr}))
            .map(function(a) {
              var href = a.getAttribute('href');
              if (!href || href === '#' || href.startsWith('javascript:')) return null;
              try { href = new URL(href, location.href).href; } catch(e) { return null; }
              if (seen[href]) return null;
              seen[href] = true;
              return { text: (a.innerText || a.getAttribute('aria-label') || '').trim().substring(0, 200), href: href };
            })
            .filter(Boolean);
          return JSON.stringify(links);
        } catch(e) {
          return JSON.stringify({ error: e.message });
        }
      })()`;
      try {
        const raw = await wv.executeJavaScript(getLinksScript);
        let parsed: any;
        try {
          parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          parsed = [];
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) {
          await postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        await postActionResult(detail.requestId, Array.isArray(parsed) ? parsed : []);
      } catch (err: any) {
        await postActionResult(detail.requestId, null, err?.message ?? 'Erreur extraction liens');
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

    // ── Déplacement explicite du curseur simulé vers des coordonnées (x, y)
    const handleMouseMove = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number };
      const wv = webviewRef.current;
      if (!wv) return;
      const lx = (Number(detail.x) || 0) - 4;
      const ly = (Number(detail.y) || 0) - 2;
      try {
        await wv.executeJavaScript(CURSOR_INJECT_SCRIPT);
        await wv.executeJavaScript(
          `(function(x,y){ var cur=document.getElementById('__jarvis_cursor'); if(cur){cur.style.left=x+'px';cur.style.top=y+'px';} })(${lx},${ly})`
        );
      } catch {/* silent */}
    };

    window.addEventListener('jarvis-browser-navigate', handleNav);
    window.addEventListener('jarvis-browser-scroll', handleScroll);
    window.addEventListener('jarvis-browser-control', handleBrowserControl);
    window.addEventListener('jarvis-browser-read-request', handleReadRequest as EventListener);
    window.addEventListener('jarvis-browser-click', handleClick as EventListener);
    window.addEventListener('jarvis-browser-type', handleType as EventListener);
    window.addEventListener('jarvis-browser-get-links', handleGetLinks as EventListener);
    window.addEventListener('jarvis-browser-snapshot', handleSnapshot as EventListener);
    window.addEventListener('jarvis-browser-inspect', handleInspect as EventListener);
    window.addEventListener('jarvis-browser-mouse-move', handleMouseMove as EventListener);
    return () => {
      window.removeEventListener('jarvis-browser-navigate', handleNav);
      window.removeEventListener('jarvis-browser-scroll', handleScroll);
      window.removeEventListener('jarvis-browser-control', handleBrowserControl);
      window.removeEventListener('jarvis-browser-read-request', handleReadRequest as EventListener);
      window.removeEventListener('jarvis-browser-click', handleClick as EventListener);
      window.removeEventListener('jarvis-browser-type', handleType as EventListener);
      window.removeEventListener('jarvis-browser-get-links', handleGetLinks as EventListener);
      window.removeEventListener('jarvis-browser-snapshot', handleSnapshot as EventListener);
      window.removeEventListener('jarvis-browser-inspect', handleInspect as EventListener);
      window.removeEventListener('jarvis-browser-mouse-move', handleMouseMove as EventListener);
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
        {/*
          Les attributs Electron-spécifiques (allowpopups, webpreferences) ne sont
          pas passés en props JSX pour éviter :
            TS2322: Type 'string | false' not assignable to boolean | undefined
            Warning React: Received false for a non-boolean attribute allowpopups
          Ils sont settés via setAttribute() directement sur l'élément dans useEffect.
        */}
        <webview
          ref={webviewRef}
          src={defaultUrl}
          style={{ width: '100%', height: '100%', display: 'flex' }}
        />
      </div>
    </div>
  );
}

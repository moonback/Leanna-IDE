import puppeteer, { Browser, Page } from 'puppeteer';
import { assertSafeUrl, addAllowedDomain } from "./automationHelpers";

addAllowedDomain('duckduckgo.com');
addAllowedDomain('html.duckduckgo.com');

let browser: Browser | null = null;
let page: Page | null = null;
/** Stores the last captured selectors so automation_type/click can validate against them. */
let lastSnapshotSelectors: Set<string> = new Set();

const NAV_TIMEOUT_MS = 15000;

async function ensurePage(): Promise<Page> {
    if (!browser || !browser.connected) {
        const isProd = process.env.NODE_ENV === 'production';
        const launchArgs = isProd
            ? ['--disable-dev-shm-usage', '--disable-gpu']
            : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
        browser = await puppeteer.launch({
            args: launchArgs,
            headless: true
        });
        page = null;
    }
    if (!page || page.isClosed()) {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    }
    return page;
}

async function waitBriefly(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
}

/** Captures interactive elements from the current page and returns them as structured data. */
async function captureSnapshot(p: Page) {
    await waitBriefly(1500); // let SPAs finish rendering

    // Passed as a string so the tsx/esbuild bundler never transforms it
    // (avoids __name() injection which crashes in the browser context).
    const snapshot = await p.evaluate(`(function() {
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
            return el.tagName.toLowerCase() + (el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
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
            'button, input[type="submit"], input[type="button"], [role="button"]'
        )).filter(function(el) { return el.offsetParent !== null; }).slice(0, 15).map(function(el) {
            return {
                selector: bestSelector(el),
                text: (el.innerText || el.value || '').trim().substring(0, 80),
                ariaLabel: el.getAttribute('aria-label') || ''
            };
        });
        return { url: location.href, title: document.title, inputs: inputs, buttons: buttons };
    })()`);

    const snap = snapshot as { url: string; title: string; inputs: any[]; buttons: any[] };

    // Record all known selectors so we can reject invented ones at interaction time
    lastSnapshotSelectors = new Set([
        ...snap.inputs.map((i: any) => i.selector),
        ...snap.buttons.map((b: any) => b.selector),
    ]);

    return snap;
}

/**
 * Validates that `selector` was present in the last snapshot.
 * If not, re-runs the snapshot and returns an error object the caller should return.
 * Returns null if the selector is valid.
 */
async function validateSelector(selector: string, p: Page): Promise<object | null> {
    if (lastSnapshotSelectors.has(selector)) return null;

    // Selector not in snapshot — re-capture (page may have loaded more content) then reject
    console.log(`[Automation] Sélecteur non reconnu "${selector}" — re-snapshot en cours`);
    const snapshot = await captureSnapshot(p);

    // Check again after re-snapshot (dynamic SPA may have added it)
    if (lastSnapshotSelectors.has(selector)) return null;

    return {
        error: `Selector "${selector}" was not found in the page snapshot. You MUST use one of the selectors listed below. Do NOT invent or guess selectors.`,
        availableSelectors: { inputs: snapshot.inputs, buttons: snapshot.buttons },
        hint: `Pick the correct selector from the list above and retry.`,
    };
}

async function extractResultsFromDuckDuckGo(p: Page): Promise<Array<{ title: string; snippet: string; url: string }>> {
    return p.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.result'));
        return items.map(item => {
            const titleEl = item.querySelector('.result__title');
            const snippetEl = item.querySelector('.result__snippet');
            const urlEl = item.querySelector('.result__url');
            return {
                title: titleEl ? (titleEl as HTMLElement).innerText : '',
                snippet: snippetEl ? (snippetEl as HTMLElement).innerText : '',
                url: urlEl ? (urlEl as HTMLElement).innerText : ''
            };
        });
    });
}

// ─── Browser handlers ──────────────────────────────────────────────────────────

export async function handleNavigate(validated: { url: string }) {
    const check = assertSafeUrl(validated.url);
    if (!check.ok) return { error: (check as { ok: false; error: string }).error };

    console.log(`[Automation] Navigation vers: ${check.url}`);
    const p = await ensurePage();
    await p.goto(check.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    lastSnapshotSelectors = new Set(); // reset: new page, selectors unknown
    const title = await p.title();
    const content = await p.evaluate(() => document.body.innerText.substring(0, 3000));

    // Capture real selectors immediately so the model doesn't have to guess
    const interactiveElements = await captureSnapshot(p);

    return {
        status: "success",
        title,
        content,
        interactiveElements,
        note: "Use ONLY the selectors from interactiveElements above. Never invent selectors."
    };
}

export async function handleClick(validated: { selector: string }) {
    console.log(`[Automation] Clic sur: ${validated.selector}`);
    if (!page) return { error: "Aucune page ouverte. Utilisez automation_navigate d'abord." };

    // Guard: reject selectors not present in the last snapshot
    const clickValidation = await validateSelector(validated.selector, page);
    if (clickValidation) return clickValidation;

    try {
        await page.waitForSelector(validated.selector, { timeout: 8000 });
        await page.click(validated.selector);
        await waitBriefly(2000);

        const content = await page.evaluate(() => document.body.innerText.substring(0, 3000));
        return { status: "success", content };
    } catch (e: any) {
        return { error: `Impossible de trouver l'élément: ${validated.selector}. Erreur: ${e.message}` };
    }
}

export async function handleType(validated: { selector: string; text: string; pressEnter?: boolean }) {
    console.log(`[Automation] Saisie dans: ${validated.selector}`);
    if (!page) return { error: "Aucune page ouverte." };

    // Guard: reject selectors not present in the last snapshot
    const typeValidation = await validateSelector(validated.selector, page);
    if (typeValidation) return typeValidation;

    await page.waitForSelector(validated.selector, { timeout: 5000 });
    await page.type(validated.selector, validated.text, { delay: 50 });
    if (validated.pressEnter) {
        await page.keyboard.press('Enter');
        await waitBriefly(2000);
    }
    return { status: "success" };
}

export async function handleExtract(validated: { selector: string }) {
    console.log(`[Automation] Extraction...`);
    if (!page) return { error: "Aucune page ouverte." };
    try {
        await page.waitForSelector(validated.selector, { timeout: 3000 });
        const content = await page.$eval(validated.selector, el => (el as HTMLElement).innerText.substring(0, 5000));
        return { status: "success", content };
    } catch {
        return { error: `Sélecteur introuvable: ${validated.selector}` };
    }
}

export async function handleMusicSearch(validated: { query: string }) {
    console.log(`[Automation] Recherche musicale web: ${validated.query}`);
    const p = await ensurePage();

    const musicQuery = `${validated.query} music artist songs albums discography`;
    await p.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(musicQuery)}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS
    });

    const results = (await extractResultsFromDuckDuckGo(p)).slice(0, 6);

    const musicSources = ['apple.com/music', 'youtube.com', 'discogs.com', 'allmusic.com', 'last.fm'];
    const filteredResults = results.filter(r =>
        musicSources.some(source => r.url.toLowerCase().includes(source)) ||
        r.title.toLowerCase().includes('music') ||
        r.snippet.toLowerCase().includes('album') ||
        r.snippet.toLowerCase().includes('song')
    );

    return {
        status: "success",
        message: `Recherche web musicale pour "${validated.query}"`,
        results: filteredResults.length > 0 ? filteredResults : results.slice(0, 4),
        note: filteredResults.length > 0 ? "Résultats filtrés pour sources musicales" : "Résultats généraux"
    };
}

export async function handleSearch(validated: { query: string }) {
    console.log(`[Automation] Recherche: ${validated.query}`);
    const p = await ensurePage();

    await p.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(validated.query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS
    });

    const results = (await extractResultsFromDuckDuckGo(p)).slice(0, 5);
    return { status: "success", results };
}

export async function handleSnapshot() {
    console.log(`[Automation] Snapshot des éléments interactifs...`);
    if (!page) return { error: "Aucune page ouverte. Utilisez automation_navigate d'abord." };

    const snapshot = await captureSnapshot(page);
    return {
        status: "success",
        snapshot,
        note: "Use ONLY the selectors listed above. Never invent or guess selectors."
    };
}

export async function handleInspect(validated: { type: 'buttons' | 'inputs' | 'links' | 'all' }) {
    console.log(`[Automation] Inspection de la page...`);
    if (!page) return { error: "Aucune page ouverte." };

    // Passed as string to avoid tsx __name() injection crashing in browser
    const elements = await page.evaluate(`(function(type) {
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
            return el.tagName.toLowerCase() + (el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
        };
        var results = {};
        if (type === 'buttons' || type === 'all') {
            results.buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).map(function(btn) {
                return { selector: bestSelector(btn), text: (btn.innerText || btn.value || '').trim(), ariaLabel: btn.getAttribute('aria-label') || '', testId: btn.getAttribute('data-testid') || '' };
            }).slice(0, 10);
        }
        if (type === 'inputs' || type === 'all') {
            results.inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(function(input) {
                return { selector: bestSelector(input), type: input.type || 'textarea', placeholder: input.placeholder || '', ariaLabel: input.getAttribute('aria-label') || '', name: input.name || '', testId: input.getAttribute('data-testid') || '' };
            }).slice(0, 10);
        }
        if (type === 'links' || type === 'all') {
            results.links = Array.from(document.querySelectorAll('a[href]')).map(function(link) {
                return { selector: bestSelector(link), text: (link.innerText || '').trim(), href: link.href || '' };
            }).slice(0, 10);
        }
        return results;
    })('${validated.type}')`);

    return { status: "success", elements };
}

export async function handleClose() {
    console.log(`[Automation] Fermeture du navigateur.`);
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
    }
    return { status: "success", message: "Navigateur fermé" };
}

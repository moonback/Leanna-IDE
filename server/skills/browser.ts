/**
 * browserSkill — Skill qui permet à Leanna de contrôler le navigateur
 * intégré (BrowserPanel / Electron webview) visible dans l'interface.
 *
 * Contrairement à automationBrowser (Puppeteer headless), ces outils
 * pilotent le navigateur visible par l'utilisateur via des événements
 * IPC (emitIdeAction → CustomEvent → BrowserPanel).
 *
 * v2 — ajout de :
 *   - browser_get_links       : extraction des liens de la page
 *   - browser_open_link       : ouvrir un lien par texte / fragment d'URL
 *   - browser_research        : recherche + lecture automatique de N sources
 *   - browser_search          : moteur configurable (google/bing/duckduckgo/wikipedia)
 *   - lecture avec retry       : évite les pages lues "vides" faute d'avoir fini de charger
 *   - troncature de contenu   : évite de saturer le contexte du modèle
 *
 * NOTE IMPORTANTE : browser_get_links (et donc browser_open_link / browser_research)
 * introduit un NOUVEL événement IPC "browser-get-links". Ce fichier ne peut piloter
 * que le canal serveur ; il faut aussi ajouter le handler correspondant côté
 * BrowserPanel.tsx (client) pour que l'extraction fonctionne réellement.
 * Voir le commentaire "CLIENT REQUIS" plus bas pour le contrat exact attendu.
 */

import { Skill, validateArgs } from "./base";
import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Schémas explicitement interdits : évite qu'un prompt malveillant ou une
// URL mal formée fasse exécuter du JS, charger un fichier local, ou
// afficher du contenu data: arbitraire dans le webview visible par l'user.
const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript|about):/i;

// Domaines à exclure des résultats de recherche quand on extrait des liens
// "à visiter" (pages de moteurs de recherche, trackers, etc.)
const NON_CONTENT_DOMAINS = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "webcache.googleusercontent.com",
  "translate.google.",
  "accounts.google.",
  "policies.google.",
  "support.google.",
];

const MAX_CONTENT_LENGTH = 15_000; // caractères — évite de saturer le contexte du modèle

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed) return "https://www.google.com";

  if (BLOCKED_SCHEMES.test(trimmed)) {
    throw new Error(`Schéma d'URL non autorisé : ${trimmed.slice(0, 20)}...`);
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed) && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function buildSearchUrl(engine: string, query: string): string {
  const q = encodeURIComponent(query);
  switch (engine) {
    case "bing":
      return `https://www.bing.com/search?q=${q}`;
    case "duckduckgo":
      return `https://duckduckgo.com/html/?q=${q}`;
    case "wikipedia":
      return `https://fr.wikipedia.org/w/index.php?search=${q}`;
    case "google":
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CONTENT_LENGTH) return { content, truncated: false };
  return {
    content: content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[...contenu tronqué...]",
    truncated: true,
  };
}

function isContentDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !NON_CONTENT_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

// Petit wrapper pour garantir qu'on ne renvoie jamais "success" si l'IPC
// n'est pas disponible (context.emitIdeAction manquant), et pour uniformiser
// la forme des erreurs renvoyées au modèle.
function withEmit<T>(
  emit: ((action: any) => void) | undefined,
  fn: (emit: (action: any) => void) => T
): T | { status: "error"; message: string } {
  if (!emit) {
    return {
      status: "error",
      message:
        "Le panneau navigateur n'est pas disponible dans ce contexte (emitIdeAction manquant).",
    };
  }
  try {
    return fn(emit);
  } catch (err: any) {
    return {
      status: "error",
      message: err?.message ?? "Erreur inconnue lors de l'appel au navigateur intégré.",
    };
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const navigateSchema = z.object({
  url: z.string().min(1, "URL requise"),
});

const searchEngineEnum = z.enum(["google", "bing", "duckduckgo", "wikipedia"]);

const searchSchema = z.object({
  query: z.string().min(1, "Requête de recherche requise"),
  engine: searchEngineEnum.optional().default("google"),
});

const scrollSchema = z.object({
  direction: z.enum(["down", "up", "top", "bottom"]).default("down"),
  amount: z.number().int().positive().max(5000, "amount trop élevé (max 5000px)").default(300),
});

const emptySchema = z.object({});

const readContentSchema = z.object({
  selector: z.string().optional(),
});

const clickSchema = z.object({
  selector: z.string().min(1, "Sélecteur CSS requis"),
});

const typeSchema = z.object({
  selector: z.string().min(1, "Sélecteur CSS requis"),
  text: z.string(),
  pressEnter: z.boolean().optional().default(false),
});

const inspectSchema = z.object({
  type: z.enum(["buttons", "inputs", "links", "all"]).default("all"),
});

const summarizePageSchema = z.object({
  url: z.string().min(1, "URL requise"),
  selector: z.string().optional(),
});

const getLinksSchema = z.object({
  selector: z.string().optional(),
  limit: z.number().int().positive().max(200).default(50),
});

const openLinkSchema = z
  .object({
    text: z.string().optional(),
    urlContains: z.string().optional(),
  })
  .refine((d) => !!(d.text?.trim() || d.urlContains?.trim()), {
    message: "Fournis au moins 'text' (texte visible du lien) ou 'urlContains' (fragment d'URL).",
  });

const researchSchema = z.object({
  query: z.string().min(1, "Requête de recherche requise"),
  engine: searchEngineEnum.optional().default("google"),
  maxSources: z.number().int().positive().max(5).default(3),
});

// ─── Skill ────────────────────────────────────────────────────────────────────

export const browserSkill: Skill = {
  name: "browser",

  declarations: [
    {
      name: "browser_navigate",
      description:
        "Ouvre le navigateur intégré et navigue vers une URL. Le navigateur s'affiche dans l'interface et l'utilisateur peut voir la page en temps réel. Utilise cet outil pour montrer un site web à l'utilisateur.",
      parameters: {
        type: "OBJECT",
        properties: {
          url: {
            type: "STRING",
            description: "L'URL à visiter (ex: https://example.com). Peut être une URL complète ou un domaine.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "browser_open",
      description:
        "Ouvre (affiche) le panneau navigateur intégré sans changer l'URL courante. Utile pour révéler le navigateur s'il est caché.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    {
      name: "browser_search",
      description:
        "Effectue une recherche dans le navigateur intégré visible par l'utilisateur, sur le moteur de ton choix. Ouvre le navigateur et affiche les résultats.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Le terme ou la question à rechercher",
          },
          engine: {
            type: "STRING",
            description: "Moteur de recherche : 'google' (défaut), 'bing', 'duckduckgo', ou 'wikipedia'.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "browser_close",
      description: "Ferme (cache) le panneau navigateur intégré.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    {
      name: "browser_scroll",
      description: "Fait défiler la page affichée dans le navigateur intégré.",
      parameters: {
        type: "OBJECT",
        properties: {
          direction: {
            type: "STRING",
            description:
              "Direction du défilement : 'down', 'up', 'top' (retour en haut), 'bottom' (aller en bas). Défaut : 'down'.",
          },
          amount: {
            type: "NUMBER",
            description: "Nombre de pixels à défiler (ignoré pour 'top' et 'bottom', max 5000). Défaut : 300.",
          },
        },
      },
    },
    {
      name: "browser_back",
      description: "Revient à la page précédente dans l'historique du navigateur intégré.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    {
      name: "browser_forward",
      description: "Avance à la page suivante dans l'historique du navigateur intégré.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    {
      name: "browser_reload",
      description: "Recharge la page actuellement affichée dans le navigateur intégré.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    {
      name: "browser_read_content",
      description:
        "Lit et retourne le contenu textuel de la page actuellement affichée dans le navigateur intégré. Utilise cet outil pour analyser une page web, extraire des informations, lire un article, ou comprendre ce qui est affiché. Tu peux cibler un sélecteur CSS précis pour n'extraire qu'une partie de la page (ex: 'article', 'main', '#content').",
      parameters: {
        type: "OBJECT",
        properties: {
          selector: {
            type: "STRING",
            description:
              "Optionnel. Sélecteur CSS pour n'extraire qu'une partie de la page (ex: 'article', 'main', '.content', '#results'). Si omis, extrait tout le contenu visible de la page.",
          },
        },
      },
    },
    {
      name: "browser_get_links",
      description:
        "Extrait la liste des liens (texte visible + URL) présents sur la page actuellement affichée. Utilise cet outil pour découvrir vers quelles pages naviguer ensuite (résultats de recherche, articles liés, navigation d'un site), avant d'utiliser browser_open_link ou browser_navigate.",
      parameters: {
        type: "OBJECT",
        properties: {
          selector: {
            type: "STRING",
            description:
              "Optionnel. Limite l'extraction aux liens contenus dans ce sélecteur CSS (ex: '#search', 'article', 'nav'). Si omis, extrait tous les liens visibles de la page.",
          },
          limit: {
            type: "NUMBER",
            description: "Nombre maximum de liens à retourner (défaut 50, max 200).",
          },
        },
      },
    },
    {
      name: "browser_open_link",
      description:
        "Ouvre un lien présent sur la page actuellement affichée, identifié par son texte visible (ex: 'En savoir plus', le titre d'un résultat de recherche) et/ou un fragment de son URL. Récupère automatiquement les liens de la page et navigue vers le premier qui correspond. Utile pour cliquer sur un résultat de recherche ou suivre un lien d'article sans avoir besoin d'un sélecteur CSS exact.",
      parameters: {
        type: "OBJECT",
        properties: {
          text: {
            type: "STRING",
            description: "Texte (ou fragment de texte, insensible à la casse) du lien à ouvrir.",
          },
          urlContains: {
            type: "STRING",
            description: "Fragment que l'URL du lien doit contenir (ex: 'wikipedia.org', '/article/').",
          },
        },
      },
    },
    {
      name: "browser_click",
      description:
        "Clique sur un élément (bouton, lien, etc.) dans la page actuellement affichée dans le navigateur intégré. Utilise OBLIGATOIREMENT un sélecteur CSS renvoyé par browser_snapshot ou browser_inspect. N'invente PAS de sélecteurs.",
      parameters: {
        type: "OBJECT",
        properties: {
          selector: {
            type: "STRING",
            description:
              "Sélecteur CSS de l'élément à cliquer (ex: 'button#submit', '.search-btn', 'a.login'). Doit provenir de browser_snapshot ou browser_inspect.",
          },
        },
        required: ["selector"],
      },
    },
    {
      name: "browser_type",
      description:
        "Saisit du texte dans un champ de saisie (input, textarea) de la page affichée dans le navigateur intégré. Utilise OBLIGATOIREMENT un sélecteur CSS renvoyé par browser_snapshot ou browser_inspect.",
      parameters: {
        type: "OBJECT",
        properties: {
          selector: {
            type: "STRING",
            description: "Sélecteur CSS du champ de saisie (ex: 'input[name=\"q\"]', 'textarea#message', '#email').",
          },
          text: {
            type: "STRING",
            description: "Le texte à saisir dans le champ.",
          },
          pressEnter: {
            type: "BOOLEAN",
            description: "Si true, appuie automatiquement sur Entrée après la saisie (pour valider un formulaire). Défaut : false.",
          },
        },
        required: ["selector", "text"],
      },
    },
    {
      name: "browser_snapshot",
      description:
        "Récupère la liste des éléments interactifs (champs de saisie, boutons) cliquables actuellement visibles sur la page. Retourne les sélecteurs CSS VALIDES à utiliser avec browser_click et browser_type. APPELLE CET OUTIL SYSTEMATIQUEMENT avant d'utiliser browser_click ou browser_type pour connaître les bons sélecteurs.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    {
      name: "browser_summarize_page",
      description:
        "OUTIL PRINCIPAL pour la navigation web. Navigue vers une URL ET lit immédiatement son contenu en une seule étape. Utilise cet outil pour répondre aux questions nécessitant de consulter un site web, lire un article, vérifier des informations en ligne. Le navigateur s'ouvre et l'utilisateur peut voir la page pendant que tu extrais le contenu.",
      parameters: {
        type: "OBJECT",
        properties: {
          url: {
            type: "STRING",
            description: "L'URL à visiter et lire (ex: https://example.com). Peut être une URL complète ou un domaine.",
          },
          selector: {
            type: "STRING",
            description:
              "Optionnel. Sélecteur CSS pour n'extraire qu'une partie de la page (ex: 'article', 'main', '.content'). Si omis, extrait tout le contenu visible.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "browser_research",
      description:
        "OUTIL DE RECHERCHE APPROFONDIE. Effectue une recherche web, puis visite et lit automatiquement les pages de résultats les plus pertinentes (jusqu'à maxSources), et retourne le contenu de chacune. Utilise cet outil quand l'utilisateur demande de faire une recherche, de comparer des sources, ou d'enquêter sur un sujet — au lieu d'enchaîner manuellement browser_search + browser_navigate + browser_read_content plusieurs fois. Synthétise ensuite toi-même les résultats dans ta réponse, en citant tes sources.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Le sujet ou la question à rechercher.",
          },
          engine: {
            type: "STRING",
            description: "Moteur de recherche à utiliser : 'google' (défaut), 'bing', 'duckduckgo', ou 'wikipedia'.",
          },
          maxSources: {
            type: "NUMBER",
            description: "Nombre maximum de pages de résultats à visiter et lire (défaut 3, max 5).",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "browser_inspect",
      description:
        "Inspecte un type d'éléments de la page (boutons, champs, liens, ou tous) et retourne leur sélecteur CSS, texte/placeholder/URL. Utile pour identifier les éléments précis à utiliser avec browser_click ou browser_type.",
      parameters: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            description: "Type d'éléments à inspecter : 'buttons', 'inputs', 'links', ou 'all'. Défaut : 'all'.",
          },
        },
      },
    },
  ],

  inputSchemas: {
    browser_navigate: navigateSchema,
    browser_open: emptySchema,
    browser_search: searchSchema,
    browser_close: emptySchema,
    browser_scroll: scrollSchema,
    browser_back: emptySchema,
    browser_forward: emptySchema,
    browser_reload: emptySchema,
    browser_read_content: readContentSchema,
    browser_get_links: getLinksSchema,
    browser_open_link: openLinkSchema,
    browser_click: clickSchema,
    browser_type: typeSchema,
    browser_snapshot: emptySchema,
    browser_inspect: inspectSchema,
    browser_summarize_page: summarizePageSchema,
    browser_research: researchSchema,
  },

  handleToolCall: async (name: string, args: any, context?: any) => {
    const emit = context?.emitIdeAction as ((action: any) => void) | undefined;

    // Helper générique pour les actions async (click/type/snapshot/inspect/get-links)
    // qui utilisent le registre browserActionPending de server.ts.
    const runBrowserAction = async <T = any>(action: any, timeoutMs = 15_000): Promise<T | string> => {
      const pending = context?.browserActionPending as Map<string, {
        resolve: (value: any) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }> | undefined;
      if (!pending) return "[ERREUR] browserActionPending non disponible dans le contexte.";
      if (!emit) return "[ERREUR] emitIdeAction non disponible.";

      const requestId = `ba_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`Timeout (${(timeoutMs / 1000).toFixed(0)}s) — navigateur non disponible ou en chargement.`));
        }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        emit({ requestId, ...action });
      }).catch((err: Error) => `[ERREUR ACTION] ${err.message}`);
    };

    // ── browser_navigate ──────────────────────────────────────────────────────
    if (name === "browser_navigate") {
      const { url } = validateArgs(browserSkill.inputSchemas!["browser_navigate"], args);

      return withEmit(emit, (fire) => {
        const normalized = normalizeUrl(url); // peut throw → capté par withEmit
        fire({ type: "open-browser" });
        fire({ type: "browser-navigate", url: normalized });
        return {
          status: "success",
          url: normalized,
          message: `Le navigateur intégré navigue vers : ${normalized}`,
        };
      });
    }

    // ── browser_open ──────────────────────────────────────────────────────────
    if (name === "browser_open") {
      validateArgs(browserSkill.inputSchemas!["browser_open"], args);
      return withEmit(emit, (fire) => {
        fire({ type: "open-browser" });
        return { status: "success", message: "Le panneau navigateur est maintenant visible." };
      });
    }

    // ── browser_search ────────────────────────────────────────────────────────
    if (name === "browser_search") {
      const { query, engine } = validateArgs(browserSkill.inputSchemas!["browser_search"], args);
      const searchUrl = buildSearchUrl(engine, query);

      return withEmit(emit, (fire) => {
        fire({ type: "open-browser" });
        fire({ type: "browser-navigate", url: searchUrl });
        return {
          status: "success",
          url: searchUrl,
          query,
          engine,
          message: `Recherche "${query}" en cours sur ${engine} dans le navigateur.`,
        };
      });
    }

    // ── browser_close ─────────────────────────────────────────────────────────
    if (name === "browser_close") {
      validateArgs(browserSkill.inputSchemas!["browser_close"], args);
      return withEmit(emit, (fire) => {
        fire({ type: "close-browser" });
        return { status: "success", message: "Le panneau navigateur est fermé." };
      });
    }

    // ── browser_scroll ────────────────────────────────────────────────────────
    if (name === "browser_scroll") {
      const { direction, amount } = validateArgs(browserSkill.inputSchemas!["browser_scroll"], args);
      return withEmit(emit, (fire) => {
        fire({ type: "browser-scroll", direction, amount });
        return {
          status: "success",
          direction,
          amount,
          message: `Défilement ${direction} de ${amount}px dans le navigateur.`,
        };
      });
    }

    // ── browser_back ──────────────────────────────────────────────────────────
    if (name === "browser_back") {
      validateArgs(browserSkill.inputSchemas!["browser_back"], args);
      return withEmit(emit, (fire) => {
        fire({ type: "browser-back" });
        return { status: "success", message: "Retour à la page précédente." };
      });
    }

    // ── browser_forward ───────────────────────────────────────────────────────
    if (name === "browser_forward") {
      validateArgs(browserSkill.inputSchemas!["browser_forward"], args);
      return withEmit(emit, (fire) => {
        fire({ type: "browser-forward" });
        return { status: "success", message: "Avance à la page suivante." };
      });
    }

    // ── browser_reload ────────────────────────────────────────────────────────
    if (name === "browser_reload") {
      validateArgs(browserSkill.inputSchemas!["browser_reload"], args);
      return withEmit(emit, (fire) => {
        fire({ type: "browser-reload" });
        return { status: "success", message: "Page rechargée." };
      });
    }

    // ── Helper interne : lire le contenu de la page courante ─────────────────
    // Utilisé par browser_read_content, browser_summarize_page ET browser_research.
    const readPageContent = async (selector?: string | null): Promise<{
      status: "success" | "error";
      url?: string;
      title?: string;
      content?: string;
      contentLength?: number;
      message: string;
    }> => {
      if (!emit) {
        return { status: "error", message: "Le navigateur n'est pas disponible dans ce contexte." };
      }

      const pending = context?.browserReadPending as Map<string, {
        resolve: (text: string) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }> | undefined;

      if (!pending) {
        return { status: "error", message: "browserReadPending non disponible dans le contexte." };
      }

      const requestId = `br_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Timeout plus long pour laisser le temps à la page de charger
      const TIMEOUT_MS = 18_000;

      const text = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("Timeout (18s) : la webview n'a pas répondu. Le navigateur est peut-être fermé ou la page met trop de temps à charger."));
        }, TIMEOUT_MS);
        pending.set(requestId, { resolve, reject, timer });
        emit({ type: "browser-read-request", requestId, selector: selector ?? null });
      }).catch((err: Error) => `[ERREUR LECTURE] ${err.message}`);

      // Tenter de parser si le script a retourné un JSON {title, url, text}
      let parsed: { title?: string; url?: string; text?: string } | null = null;
      if (typeof text === "string" && text.startsWith("{") && text.includes('"text"')) {
        try { parsed = JSON.parse(text); } catch { /* pas du JSON */ }
      }

      if (parsed) {
        const { content, truncated } = truncateContent(parsed.text ?? "");
        return {
          status: "success",
          url: parsed.url ?? "",
          title: parsed.title ?? "",
          content,
          contentLength: content.length,
          message: `Contenu extrait de "${parsed.title ?? parsed.url ?? "la page"}" (${content.length} caractères${truncated ? ", tronqué" : ""}).`,
        };
      }

      // Réponse en texte brut (pas de JSON)
      if (typeof text === "string" && text.startsWith("[ERREUR")) {
        return { status: "error", message: text };
      }

      const { content, truncated } = truncateContent(text);
      return {
        status: "success",
        content,
        contentLength: content.length,
        message: `Contenu extrait (${content.length} caractères${truncated ? ", tronqué" : ""}).`,
      };
    };

    // Variante avec retry : relit la page si le premier essai renvoie un
    // contenu quasi vide (souvent signe que la page n'a pas fini de charger
    // au moment de la lecture). Évite de dépendre d'un seul délai fixe.
    const readPageContentWithRetry = async (
      selector?: string | null,
      attempts = 3,
      delayMs = 1500
    ): Promise<Awaited<ReturnType<typeof readPageContent>>> => {
      let last = await readPageContent(selector);
      let tries = 1;
      while (
        tries < attempts &&
        (last.status === "error" || (last.content ?? "").trim().length < 40)
      ) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
        last = await readPageContent(selector);
        tries += 1;
      }
      return last;
    };

    // ── browser_summarize_page ────────────────────────────────────────────────
    // Combine browser_navigate + browser_read_content (avec retry) en une seule étape.
    if (name === "browser_summarize_page") {
      const { url, selector } = validateArgs(browserSkill.inputSchemas!["browser_summarize_page"], args);

      if (!emit) {
        return {
          status: "error",
          message: "Le panneau navigateur n'est pas disponible dans ce contexte (emitIdeAction manquant).",
        };
      }

      let normalized: string;
      try {
        normalized = normalizeUrl(url);
      } catch (err: any) {
        return { status: "error", message: err.message };
      }

      // 1. Ouvrir le navigateur et naviguer
      emit({ type: "open-browser" });
      emit({ type: "browser-navigate", url: normalized });

      // 2. Laisser un court délai initial avant la première lecture
      await new Promise<void>((r) => setTimeout(r, 2000));

      // 3. Lire le contenu, avec retry si la page n'a pas fini de charger
      const result = await readPageContentWithRetry(selector ?? null);

      if (result.status === "error") {
        return {
          status: "error",
          url: normalized,
          message: `Navigation vers ${normalized} réussie mais lecture impossible : ${result.message}. Réessaie avec browser_read_content après quelques secondes.`,
        };
      }

      return {
        status: "success",
        url: result.url || normalized,
        title: result.title ?? "",
        content: result.content ?? "",
        contentLength: result.contentLength ?? 0,
        message: `Page "${result.title || normalized}" chargée et lue (${result.contentLength ?? 0} caractères).`,
      };
    }

    // ── browser_read_content ──────────────────────────────────────────────────
    // Canal retour : le skill envoie un browser-read-request via emitIdeAction
    // → useLiveAPI dispatche jarvis-browser-read-request
    // → BrowserPanel exécute executeJavaScript et POST /api/browser/content-result
    // → la promesse ici est résolue avec le texte extrait
    if (name === "browser_read_content") {
      const { selector } = validateArgs(browserSkill.inputSchemas!["browser_read_content"], args);
      const result = await readPageContentWithRetry(selector ?? null, 2, 1200);

      if (result.status === "error") {
        return result;
      }

      return {
        status: "success",
        url: result.url ?? "",
        title: result.title ?? "",
        content: result.content ?? "",
        contentLength: result.contentLength ?? 0,
        message: result.message,
      };
    }

    // ── browser_get_links ─────────────────────────────────────────────────────
    // CLIENT REQUIS : BrowserPanel.tsx doit gérer un nouveau cas d'action
    // { type: "browser-get-links", requestId, selector } et répondre via
    // POST /api/browser/action-result avec { requestId, result: links }
    // où links = Array<{ text: string; href: string }> (URLs résolues en absolu,
    // via `new URL(a.getAttribute('href'), location.href).href`, dédupliquées).
    // Voir le snippet fourni séparément pour l'implémentation exacte.
    if (name === "browser_get_links") {
      const { selector, limit } = validateArgs(browserSkill.inputSchemas!["browser_get_links"], args);
      const raw = await runBrowserAction({ type: "browser-get-links", selector: selector ?? null }, 12_000);
      if (typeof raw === "string") {
        return { status: "error", message: raw };
      }
      const links = (Array.isArray(raw) ? raw : raw?.links ?? []) as Array<{ text?: string; href?: string }>;
      const cleaned = links
        .filter((l) => l?.href)
        .slice(0, limit)
        .map((l) => ({ text: (l.text ?? "").trim().slice(0, 200), href: l.href! }));

      return {
        status: "success",
        count: cleaned.length,
        links: cleaned,
        message: `${cleaned.length} lien(s) extrait(s) de la page.`,
      };
    }

    // ── browser_open_link ─────────────────────────────────────────────────────
    // Récupère les liens de la page courante puis navigue vers le premier qui
    // correspond au texte et/ou au fragment d'URL demandé.
    if (name === "browser_open_link") {
      const { text, urlContains } = validateArgs(browserSkill.inputSchemas!["browser_open_link"], args);

      const raw = await runBrowserAction({ type: "browser-get-links", selector: null }, 12_000);
      if (typeof raw === "string") {
        return { status: "error", message: raw };
      }
      const links = (Array.isArray(raw) ? raw : raw?.links ?? []) as Array<{ text?: string; href?: string }>;

      const wantedText = text?.trim().toLowerCase();
      const wantedUrl = urlContains?.trim().toLowerCase();

      const match = links.find((l) => {
        const linkText = (l.text ?? "").toLowerCase();
        const linkHref = (l.href ?? "").toLowerCase();
        const textOk = wantedText ? linkText.includes(wantedText) : true;
        const urlOk = wantedUrl ? linkHref.includes(wantedUrl) : true;
        return !!l.href && textOk && urlOk;
      });

      if (!match) {
        return {
          status: "error",
          message: `Aucun lien correspondant trouvé sur la page (text="${text ?? ""}", urlContains="${urlContains ?? ""}"). Utilise browser_get_links pour voir les liens disponibles.`,
        };
      }

      return withEmit(emit, (fire) => {
        const normalized = normalizeUrl(match.href!);
        fire({ type: "open-browser" });
        fire({ type: "browser-navigate", url: normalized });
        return {
          status: "success",
          url: normalized,
          matchedText: match.text ?? "",
          message: `Ouverture du lien "${match.text || normalized}".`,
        };
      });
    }

    // ── browser_research ──────────────────────────────────────────────────────
    // Enchaîne : recherche → extraction des liens de résultats → lecture des
    // N meilleures sources (hors pages de moteur de recherche / trackers).
    if (name === "browser_research") {
      if (!emit) {
        return { status: "error", message: "Le panneau navigateur n'est pas disponible dans ce contexte." };
      }

      const { query, engine, maxSources } = validateArgs(browserSkill.inputSchemas!["browser_research"], args);
      const searchUrl = buildSearchUrl(engine, query);

      // 1. Lancer la recherche
      emit({ type: "open-browser" });
      emit({ type: "browser-navigate", url: searchUrl });
      await new Promise<void>((r) => setTimeout(r, 2000));

      // 2. Extraire les liens de la page de résultats
      const rawLinks = await runBrowserAction({ type: "browser-get-links", selector: null }, 12_000);
      if (typeof rawLinks === "string") {
        return {
          status: "error",
          message: `Recherche lancée sur ${engine} mais extraction des liens impossible : ${rawLinks}`,
        };
      }
      const links = (Array.isArray(rawLinks) ? rawLinks : rawLinks?.links ?? []) as Array<{ text?: string; href?: string }>;

      // 3. Filtrer : garder des URLs http(s) valides, hors domaines "non-contenu",
      //    et dédupliquer par domaine pour diversifier les sources.
      const seenDomains = new Set<string>();
      const candidates: string[] = [];
      for (const l of links) {
        if (!l.href) continue;
        if (!/^https?:\/\//i.test(l.href)) continue;
        if (!isContentDomain(l.href)) continue;
        let domain: string;
        try { domain = new URL(l.href).hostname; } catch { continue; }
        if (seenDomains.has(domain)) continue;
        seenDomains.add(domain);
        candidates.push(l.href);
        if (candidates.length >= maxSources) break;
      }

      if (candidates.length === 0) {
        return {
          status: "error",
          searchUrl,
          message: `Recherche effectuée sur ${engine} mais aucune source exploitable détectée. Consulte manuellement avec browser_read_content ou browser_get_links.`,
        };
      }

      // 4. Visiter et lire chaque source
      const sources: Array<{ url: string; title: string; content: string; contentLength: number }> = [];
      const errors: Array<{ url: string; message: string }> = [];

      for (const url of candidates) {
        emit({ type: "browser-navigate", url });
        await new Promise<void>((r) => setTimeout(r, 2000));
        const result = await readPageContentWithRetry(null, 2, 1200);
        if (result.status === "success") {
          sources.push({
            url: result.url || url,
            title: result.title ?? "",
            content: result.content ?? "",
            contentLength: result.contentLength ?? 0,
          });
        } else {
          errors.push({ url, message: result.message });
        }
      }

      return {
        status: sources.length > 0 ? "success" : "error",
        query,
        engine,
        searchUrl,
        sourcesRead: sources.length,
        sources,
        errors: errors.length ? errors : undefined,
        message:
          sources.length > 0
            ? `${sources.length} source(s) lue(s) pour "${query}". Synthétise la réponse à partir de leur contenu en citant tes sources (URL/titre).`
            : `Aucune source n'a pu être lue pour "${query}".`,
      };
    }

    // ── browser_click ─────────────────────────────────────────────────────────
    if (name === "browser_click") {
      const { selector } = validateArgs(browserSkill.inputSchemas!["browser_click"], args);
      const raw = await runBrowserAction({ type: "browser-click", selector }, 10_000);
      if (typeof raw === "string") {
        return { status: "error", message: raw };
      }
      return {
        status: "success",
        selector,
        message: `Clic effectué sur : ${selector}`,
        pageContent: raw?.content ?? "",
      };
    }

    // ── browser_type ──────────────────────────────────────────────────────────
    if (name === "browser_type") {
      const { selector, text, pressEnter } = validateArgs(browserSkill.inputSchemas!["browser_type"], args);
      const raw = await runBrowserAction({ type: "browser-type", selector, text, pressEnter }, 15_000);
      if (typeof raw === "string") {
        return { status: "error", message: raw };
      }
      return {
        status: "success",
        selector,
        pressEnter,
        message: `Saisie de ${text.length} caractère(s) dans ${selector}${pressEnter ? " + Entrée" : ""}.`,
      };
    }

    // ── browser_snapshot ─────────────────────────────────────────────────────
    if (name === "browser_snapshot") {
      validateArgs(browserSkill.inputSchemas!["browser_snapshot"], args);
      const raw = await runBrowserAction({ type: "browser-snapshot" }, 12_000);
      if (typeof raw === "string") {
        return { status: "error", message: raw };
      }
      const snap = raw as { url?: string; title?: string; inputs?: any[]; buttons?: any[] };
      return {
        status: "success",
        url: snap.url ?? "",
        title: snap.title ?? "",
        inputs: snap.inputs ?? [],
        buttons: snap.buttons ?? [],
        note: "Utilise UNIQUEMENT les sélecteurs listés ci-dessus pour browser_click / browser_type. N'invente PAS de sélecteurs.",
      };
    }

    // ── browser_inspect ──────────────────────────────────────────────────────
    if (name === "browser_inspect") {
      const { type } = validateArgs(browserSkill.inputSchemas!["browser_inspect"], args);
      const raw = await runBrowserAction({ type: "browser-inspect", inspectType: type }, 12_000);
      if (typeof raw === "string") {
        return { status: "error", message: raw };
      }
      return {
        status: "success",
        type,
        elements: raw ?? {},
        note: "Utilise UNIQUEMENT ces sélecteurs pour browser_click / browser_type.",
      };
    }

    return { status: "error", message: `Outil inconnu : ${name}` };
  },
};
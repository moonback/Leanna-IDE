/**
 * browserSkill — Skill qui permet à Leanna de contrôler le navigateur
 * intégré (BrowserPanel / Electron webview) visible dans l'interface.
 *
 * Contrairement à automationBrowser (Puppeteer headless), ces outils
 * pilotent le navigateur visible par l'utilisateur via des événements
 * IPC (emitIdeAction → CustomEvent → BrowserPanel).
 */

import { Skill, validateArgs } from "./base";
import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Schémas explicitement interdits : évite qu'un prompt malveillant ou une
// URL mal formée fasse exécuter du JS, charger un fichier local, ou
// afficher du contenu data: arbitraire dans le webview visible par l'user.
const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript|about):/i;

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

const searchSchema = z.object({
  query: z.string().min(1, "Requête de recherche requise"),
});

const scrollSchema = z.object({
  direction: z.enum(["down", "up", "top", "bottom"]).default("down"),
  amount: z.number().int().positive().max(5000, "amount trop élevé (max 5000px)").default(300),
});

const emptySchema = z.object({});

const readContentSchema = z.object({
  selector: z.string().optional(),
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
        "Effectue une recherche Google dans le navigateur intégré visible par l'utilisateur. Ouvre le navigateur et affiche les résultats.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Le terme ou la question à rechercher sur Google",
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
  },

  handleToolCall: async (name: string, args: any, context?: any) => {
    const emit = context?.emitIdeAction as ((action: any) => void) | undefined;

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
      const { query } = validateArgs(browserSkill.inputSchemas!["browser_search"], args);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      return withEmit(emit, (fire) => {
        fire({ type: "open-browser" });
        fire({ type: "browser-navigate", url: searchUrl });
        return {
          status: "success",
          url: searchUrl,
          query,
          message: `Recherche Google en cours dans le navigateur : "${query}"`,
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

    // ── browser_read_content ──────────────────────────────────────────────────
    // Canal retour : le skill envoie un browser-read-request via emitIdeAction
    // → useLiveAPI dispatche jarvis-browser-read-request
    // → BrowserPanel exécute executeJavaScript et POST /api/browser/content-result
    // → la promesse ici est résolue avec le texte extrait
    if (name === "browser_read_content") {
      const { selector } = validateArgs(browserSkill.inputSchemas!["browser_read_content"], args);

      if (!emit) {
        return {
          status: "error",
          message: "Le navigateur n'est pas disponible dans ce contexte.",
        };
      }

      // Récupérer le registre des promesses depuis le contexte injecté par server.ts
      const pending = context?.browserReadPending as Map<string, {
        resolve: (text: string) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }> | undefined;

      if (!pending) {
        return {
          status: "error",
          message: "browserReadPending non disponible dans le contexte — vérifier l'injection dans server.ts.",
        };
      }

      const requestId = `br_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const TIMEOUT_MS = 12_000;

      const text = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("Timeout : la webview n'a pas répondu dans les délais (12s). Le navigateur est peut-être fermé ou en cours de chargement."));
        }, TIMEOUT_MS);

        pending.set(requestId, { resolve, reject, timer });

        // Déclencher la lecture côté frontend
        emit({ type: "browser-read-request", requestId, selector: selector ?? null });
      }).catch((err: Error) => {
        // Retourner l'erreur comme string pour que Leanna puisse la lire
        return `[ERREUR LECTURE] ${err.message}`;
      });

      // Tenter de parser si le script a retourné un JSON {title, url, text}
      let parsed: { title?: string; url?: string; text?: string } | null = null;
      if (typeof text === "string" && text.startsWith("{") && text.includes('"text"')) {
        try { parsed = JSON.parse(text); } catch { /* pas du JSON */ }
      }

      if (parsed) {
        return {
          status: "success",
          url: parsed.url ?? "",
          title: parsed.title ?? "",
          content: parsed.text ?? "",
          contentLength: (parsed.text ?? "").length,
          message: `Contenu extrait de "${parsed.title ?? parsed.url ?? "la page"}" (${(parsed.text ?? "").length} caractères).`,
        };
      }

      return {
        status: "success",
        content: text,
        contentLength: text.length,
        message: `Contenu extrait (${text.length} caractères).`,
      };
    }

    return { status: "error", message: `Outil inconnu : ${name}` };
  },
};
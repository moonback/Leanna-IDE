/**
 * Image Generation Utilities
 *
 * Fournit la fonction generateImage pour créer des images via l'API OpenRouter.
 * Utilisée par ContentGenerator pour générer des infographies.
 */

import { createLogger } from "./logger.js";
import { reserveModelCallBudget, recordModelCallUsage, recordModelCallFailure } from "./textGeneration.js";

const log = createLogger("imageGeneration");

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration OpenRouter
// ═══════════════════════════════════════════════════════════════════════════════

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux-1.1-pro";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ImageGenerationOptions {
  model?: string;
  style?: string;
  resolution?: string;
  aspectRatio?: string;
  quality?: string;
  /** Signal d'annulation : interrompt la requête HTTP si la tâche est annulée. */
  signal?: AbortSignal;
}

export interface ImageGenerationResult {
  imageBase64: string;
  mediaType: string;
  model: string;
  cost: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Génération d'image
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Génère une image via l'API OpenRouter Image Generation.
 * Retourne les données de l'image encodées en base64 avec les métadonnées.
 * Importée par ContentGenerator via `import("../utils/imageGeneration")`.
 *
 * @param prompt - Le prompt de génération d'image
 * @param options - Options de génération (modèle, style, résolution, etc.)
 * @returns Promise<ImageGenerationResult | null> - Résultat ou null en cas d'erreur
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult | null> {
  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_FREE_API_KEY;

  if (!apiKey) {
    log.error("generateImage: aucune clé API OpenRouter disponible (OPENROUTER_API_KEY manquante).");
    return null;
  }

  const model = options.model || DEFAULT_IMAGE_MODEL;

  // Construction du prompt complet avec les indications de style/qualité
  const styleHint = options.style ? ` Style: ${options.style}.` : "";
  const qualityHint = options.quality === "high" ? " Ultra high quality, detailed." : "";
  const fullPrompt = `${prompt}${styleHint}${qualityHint}`.trim();

  if (options.signal?.aborted) {
    log.warn("generateImage: annulé avant l'appel réseau (kill-switch).");
    return null;
  }

  // Budget de mission : une image n'est pas facturée en tokens, seule la règle
  // « budget déjà dépassé » s'applique. Cette fonction ne lève jamais : refus → null.
  let releaseBudget: () => void;
  try {
    releaseBudget = reserveModelCallBudget(model, fullPrompt.length, "image");
  } catch (e: any) {
    log.warn(`generateImage: ${e.message}`);
    return null;
  }

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://Leanna.local",
        "X-Title": process.env.OPENROUTER_TITLE || "Leanna",
      },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        n: 1,
        response_format: "b64_json",
        ...(options.aspectRatio ? { size: options.aspectRatio } : {}),
      }),
      // Kill-switch temps-réel : abort la requête HTTP OpenRouter à l'annulation.
      signal: options.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      log.error(`generateImage: OpenRouter HTTP ${response.status} — ${errText.slice(0, 300)}`);
      recordModelCallFailure("openrouter", model, new Error(`OpenRouter HTTP ${response.status}`));
      return null;
    }

    const data: any = await response.json();
    // Requête traitée : comptabilisée même si la réponse est inexploitable.
    recordModelCallUsage({
      provider: "openrouter",
      model: data?.model || model,
      rawUsage: data?.usage ? { ...data.usage, cost: data.usage.cost ?? data.usage.total_cost } : undefined,
      promptCharCount: fullPrompt.length,
      outputText: "",
      toolName: "generate_image",
      kind: "image",
      units: Array.isArray(data?.data) ? data.data.length : 0,
      unit: "images",
    });
    const b64 = data?.data?.[0]?.b64_json as string | undefined;
    if (!b64) {
      log.error("generateImage: réponse OpenRouter sans b64_json.");
      return null;
    }

    return {
      imageBase64: b64,
      mediaType: "image/png",
      model: data.model || model,
      cost: data.usage?.total_cost ?? 0,
    };
  } catch (e: any) {
    if (e?.name === "AbortError" || options.signal?.aborted) {
      log.warn("generateImage: requête OpenRouter interrompue par le kill-switch (annulation).");
      return null;
    }
    log.error(`generateImage: erreur réseau — ${e.message}`);
    recordModelCallFailure("openrouter", model, e);
    return null;
  } finally {
    releaseBudget();
  }
}

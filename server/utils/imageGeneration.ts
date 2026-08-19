/**
 * imageGeneration.ts — Génération d'images via OpenRouter Image API.
 *
 * Utilise le endpoint /api/v1/images pour générer des infographies, diagrammes,
 * et illustrations à partir de prompts textuels.
 *
 * Modèle par défaut : google/gemini-2.5-flash-image (gratuit/peu coûteux)
 * Fallback : black-forest-labs/flux-schnell (rapide, léger)
 *
 * Usage :
 *   import { generateImage } from './utils/imageGeneration';
 *   const result = await generateImage("Une infographie sur l'IA", { style: "infographic" });
 *   // result.imageBase64 = base64 PNG
 */

import { createLogger } from "./logger";

const log = createLogger("ImageGen");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImageGenerationOptions {
  /** Modèle OpenRouter (défaut: google/gemini-2.5-flash-image) */
  model?: string;
  /** Résolution: "1K" | "2K" (défaut: "1K") */
  resolution?: "512" | "1K" | "2K";
  /** Aspect ratio (défaut: "16:9" pour infographies) */
  aspectRatio?: string;
  /** Qualité (défaut: "medium") */
  quality?: "low" | "medium" | "high";
  /** Format de sortie (défaut: "png") */
  outputFormat?: "png" | "jpeg" | "webp";
  /** Style d'infographie pour enrichir le prompt */
  style?: "infographic" | "diagram" | "illustration" | "chart" | "custom";
}

export interface ImageGenerationResult {
  /** Image encodée en base64 */
  imageBase64: string;
  /** Type MIME de l'image */
  mediaType: string;
  /** Modèle utilisé */
  model: string;
  /** Coût en USD (si disponible) */
  cost?: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_MODEL = "google/gemini-2.5-flash-image";
const FALLBACK_MODELS = [
  "google/gemini-2.5-flash-image",
  "bytedance-seed/seedream-4.5",
];

// ─── Prompt Enhancement ─────────────────────────────────────────────────────

/**
 * Enrichit le prompt utilisateur avec des instructions de style pour l'infographie.
 */
function buildInfographicPrompt(userPrompt: string, style: string): string {
  const styleInstructions: Record<string, string> = {
    infographic: `Create a professional infographic with the following characteristics:
- Clean, modern flat design with a cohesive color palette
- Clear visual hierarchy with sections, icons, and data visualizations
- Use large bold headers, concise bullet points, and relevant icons
- Include visual elements like charts, arrows, and icons to illustrate concepts
- White or light background for readability
- Professional typography

Topic/Content: ${userPrompt}`,

    diagram: `Create a clear, professional diagram:
- Use clean lines and geometric shapes
- Label all elements clearly
- Use a consistent color scheme
- Show relationships with arrows or connecting lines
- Minimal clutter, maximum clarity

Content: ${userPrompt}`,

    illustration: `Create a professional illustration:
- Modern, clean art style
- Relevant visual metaphors
- Balanced composition
- Professional color palette

Subject: ${userPrompt}`,

    chart: `Create a professional data visualization/chart:
- Clear axis labels and legend
- Professional color palette
- Easy to read at a glance
- Clean design without unnecessary decoration

Data/Topic: ${userPrompt}`,

    custom: userPrompt,
  };

  return styleInstructions[style] || styleInstructions.infographic;
}

// ─── API Call ───────────────────────────────────────────────────────────────

function getOpenRouterKey(): string | null {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPENROUTER_FREE_API_KEY?.trim() ||
    null
  );
}

/**
 * Génère une image via l'API OpenRouter Images.
 * Retourne l'image en base64 ou null en cas d'échec.
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult | null> {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    log.error("Aucune clé OpenRouter disponible pour la génération d'images.");
    return null;
  }

  const style = options.style || "infographic";
  const enhancedPrompt = buildInfographicPrompt(prompt, style);
  const model = options.model || DEFAULT_MODEL;
  const resolution = options.resolution || "1K";
  const aspectRatio = options.aspectRatio || "16:9";
  const quality = options.quality || "medium";
  const outputFormat = options.outputFormat || "png";

  // Essayer le modèle principal puis les fallbacks
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];

  for (const currentModel of modelsToTry) {
    try {
      const result = await callImageAPI(apiKey, currentModel, enhancedPrompt, {
        resolution,
        aspectRatio,
        quality,
        outputFormat,
      });
      if (result) return result;
    } catch (err) {
      log.warn(`[${currentModel}] Échec: ${(err as Error).message}`);
      continue;
    }
  }

  log.error(`Tous les modèles de génération d'images ont échoué pour: "${prompt.slice(0, 80)}..."`);
  return null;
}

async function callImageAPI(
  apiKey: string,
  model: string,
  prompt: string,
  params: { resolution: string; aspectRatio: string; quality: string; outputFormat: string }
): Promise<ImageGenerationResult | null> {
  const start = Date.now();

  const body: Record<string, any> = {
    model,
    prompt,
    n: 1,
    resolution: params.resolution,
    aspect_ratio: params.aspectRatio,
    quality: params.quality,
    output_format: params.outputFormat,
  };

  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://jarvis-os.local",
      "X-Title": process.env.OPENROUTER_TITLE || "Jarvis-OS",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter Image API ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0 || !data.data[0].b64_json) {
    log.warn(`[${model}] Pas d'image dans la réponse`);
    return null;
  }

  const imageData = data.data[0];
  const cost = data.usage?.cost;

  log.info(`[${model}] Image générée en ${Date.now() - start}ms (${params.resolution}, ${params.aspectRatio})${cost ? ` — $${cost.toFixed(4)}` : ""}`);

  return {
    imageBase64: imageData.b64_json,
    mediaType: imageData.media_type || `image/${params.outputFormat}`,
    model,
    cost,
  };
}

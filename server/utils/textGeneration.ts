/**
 * textGeneration.ts — Unified text generation helper.
 * Routes AI text generation calls to either Gemini or OpenRouter
 * based on the user's profile setting (textProvider).
 *
 * Usage:
 *   import { generateText, setTextGenerationProfile } from './utils/textGeneration';
 *   const result = await generateText({ prompt: "...", systemPrompt: "..." });
 */

import { withGeminiRetry } from "./geminiKeyPool";

// ── Profile interface (minimal subset needed here) ──────────────────────────

interface TextGenProfile {
  textProvider?: 'gemini' | 'openrouter';
  openrouterModel?: string;
  openrouterApiKey?: string;
}

let _profile: TextGenProfile = {};

/**
 * Called by server.ts at startup and whenever the profile is updated.
 */
export function setTextGenerationProfile(profile: TextGenProfile): void {
  _profile = profile;
}

/**
 * Get the currently active provider.
 */
export function getActiveProvider(): 'gemini' | 'openrouter' {
  return _profile.textProvider || 'gemini';
}

// ── Options for generateText ────────────────────────────────────────────────

export interface GenerateTextOptions {
  /** The user prompt / content */
  prompt: string;
  /** Optional system prompt (used only with OpenRouter, Gemini uses it as part of contents) */
  systemPrompt?: string;
  /** Temperature (default 0.5) */
  temperature?: number;
  /** Max tokens for OpenRouter (default 8192 — suffisant pour les sorties agents complètes) */
  maxTokens?: number;
  /** Limite de sortie explicite pour Gemini; propagée aussi à OpenRouter si maxTokens absent. */
  maxOutputTokens?: number;
  /** Gemini model override (default gemini-2.5-flash) */
  geminiModel?: string;
  /** OpenRouter model override (uses profile setting if not provided) */
  openrouterModel?: string;
  /** Gemini thinking budget override; use 0 when an agent needs visible output immediately. */
  thinkingBudget?: number;
  /** For Gemini: if you need to pass multimodal parts directly */
  geminiParts?: any[];
}

export interface GenerateTextResult {
  text: string;
  provider: 'gemini' | 'openrouter';
  model: string;
}

/**
 * Generate text using the configured provider (Gemini or OpenRouter).
 * Automatically respects the user's profile textProvider setting.
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
  const provider = _profile.textProvider || 'gemini';

  if (provider === 'openrouter') {
    return generateWithOpenRouter(options);
  }
  return generateWithGemini(options);
}

// ── Gemini implementation ───────────────────────────────────────────────────

async function generateWithGemini(options: GenerateTextOptions): Promise<GenerateTextResult> {
  const model = options.geminiModel || 'gemini-2.5-flash';

  // Build parts — if custom geminiParts provided, use those; otherwise text-only
  const parts = options.geminiParts
    ? options.geminiParts
    : [{ text: options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt }];

  // Timeout de 120s pour éviter que l'AgentExecutor se bloque indéfiniment
  // sur un appel Gemini suspendu (réseau lent, modèle surchargé).
  const GEMINI_TIMEOUT_MS = 120_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini timeout après ${GEMINI_TIMEOUT_MS / 1000}s`)), GEMINI_TIMEOUT_MS)
  );

  const response = await Promise.race([
    withGeminiRetry((ai) =>
      ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          temperature: options.temperature ?? 0.5,
          ...(options.maxOutputTokens !== undefined
            ? { maxOutputTokens: options.maxOutputTokens }
            : {}),
          ...(options.thinkingBudget !== undefined
            ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
            : {}),
        },
      })
    ),
    timeoutPromise,
  ]);

  const rawResponse = response as {
    text?: string;
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  const visibleParts = (rawResponse.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean);
  const text = rawResponse.text?.trim() || visibleParts.join("\n");

  if (!text) {
    const finishReasons = (rawResponse.candidates ?? [])
      .map((candidate) => candidate.finishReason ?? "unknown")
      .join(", ");
    console.warn(`[TextGen] Gemini n'a renvoyé aucun texte visible (finish: ${finishReasons || "aucun"}).`);
  }

  return {
    text,
    provider: 'gemini',
    model,
  };
}

// ── OpenRouter implementation ───────────────────────────────────────────────

async function generateWithOpenRouter(options: GenerateTextOptions): Promise<GenerateTextResult> {
  const orKey = _profile.openrouterApiKey?.trim()
    || process.env.OPENROUTER_API_KEY
    || process.env.OPENROUTER_FREE_API_KEY;

  if (!orKey) {
    // Fallback to Gemini if no OpenRouter key available
    console.warn('[TextGen] OpenRouter configuré mais aucune clé disponible, fallback Gemini');
    return generateWithGemini(options);
  }

  const model = options.openrouterModel || _profile.openrouterModel || 'google/gemini-2.5-flash';

  const messages: any[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  const controller = new AbortController();
  // 120s au lieu de 60s : les agents font des sorties longues (code complet, analyses, délégations)
  // qui peuvent nécessiter plus d'une minute sur des modèles OpenRouter sous charge.
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://jarvis-os.local',
        'X-Title': process.env.OPENROUTER_TITLE || 'Jarvis-OS',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.5,
        max_tokens: options.maxTokens ?? options.maxOutputTokens ?? 8192,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      const error = new Error(`OpenRouter ${response.status}: ${errText.slice(0, 300)}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return { text, provider: 'openrouter', model };
  } catch (e: any) {
    clearTimeout(timeoutId);
    // On network error, fallback to Gemini
    if (e.name === 'AbortError' || e.message?.includes('fetch')) {
      console.warn(`[TextGen] OpenRouter error (${e.message}), fallback Gemini`);
      return generateWithGemini(options);
    }
    throw e;
  }
}

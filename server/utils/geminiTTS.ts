/**
 * geminiTTS.ts — Génération audio TTS via OpenRouter (endpoint /api/v1/audio/speech).
 * 
 * Utilise le modèle hexgrad/kokoro-82m par défaut pour une voix naturelle.
 * Supporte le français (voix ff_siwis) et l'anglais (multiples voix).
 * L'audio retourné est au format PCM 24kHz 16-bit mono (compatible avec le flux audio existant).
 * 
 * Fallback : si aucune clé OpenRouter n'est disponible, tente Gemini TTS.
 * 
 * Usage :
 *   import { generateSpeech } from './utils/geminiTTS';
 *   const base64Audio = await generateSpeech("Bonjour !", { voiceName: "ff_siwis" });
 */

import { createLogger } from "./logger";

const log = createLogger("OpenRouterTTS");

export interface TTSOptions {
  /** Nom de la voix (ex: ff_siwis, af_jessica, am_adam) */
  voiceName?: string;
  /** Modèle TTS OpenRouter (défaut: hexgrad/kokoro-82m) */
  model?: string;
}

/**
 * Récupère la clé OpenRouter depuis les variables d'environnement.
 */
function getOpenRouterKey(): string | null {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPENROUTER_FREE_API_KEY?.trim() ||
    null
  );
}

/**
 * Génère de l'audio à partir de texte via l'API OpenRouter TTS.
 * Utilise Kokoro 82M par défaut (voix naturelle, multilingue).
 * Retourne l'audio en base64 (PCM 24kHz 16-bit mono), prêt à être envoyé au client.
 * Retourne null en cas d'erreur (non bloquant).
 */
export async function generateSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<string | null> {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    log.warn("Aucune clé OpenRouter disponible pour TTS, tentative Gemini fallback...");
    return generateSpeechGeminiFallback(text, options);
  }

  const model = options.model || "hexgrad/kokoro-82m";
  const voice = options.voiceName || "ff_siwis";

  try {
    const body: Record<string, any> = {
      model,
      input: text,
      voice,
      response_format: "pcm",
    };

    const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://jarvis-os.local",
        "X-Title": process.env.OPENROUTER_TITLE || "Jarvis-OS",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.error(`OpenRouter TTS erreur ${response.status}: ${errText.slice(0, 200)}`);
      // Fallback vers le modèle gratuit si kokoro échoue
      if (model === "hexgrad/kokoro-82m") {
        log.info("Tentative fallback vers fish-audio/s2.1-pro-free:free...");
        return generateSpeech(text, { ...options, model: "fish-audio/s2.1-pro-free:free", voiceName: undefined });
      }
      return null;
    }

    // La réponse est un stream audio brut (PCM)
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      log.warn(`Pas de données audio retournées pour: "${text.slice(0, 50)}..."`);
      return null;
    }

    // Convertir en base64
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");

    log.debug(`Audio TTS généré (${model}, ${voice}): "${text.slice(0, 50)}..." → ${Math.round(buffer.length / 1024)}KB`);
    return base64Audio;
  } catch (err) {
    log.error(`Erreur TTS OpenRouter: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Fallback Gemini TTS si OpenRouter n'est pas disponible.
 * Utilise l'ancien système Gemini comme backup.
 */
async function generateSpeechGeminiFallback(
  text: string,
  options: TTSOptions
): Promise<string | null> {
  try {
    const { withGeminiRetry } = await import("./geminiKeyPool");

    const voiceName = options.voiceName || "Aoede";
    const model = "gemini-2.5-flash-preview-tts";

    const response = await withGeminiRetry((ai) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        } as any,
      })
    );

    const audioData = getInlineAudioData(response);
    if (!audioData) {
      log.warn(`[Fallback Gemini] Pas de données audio pour: "${text.slice(0, 50)}..."`);
      return null;
    }

    log.debug(`[Fallback Gemini] Audio généré (${voiceName}): "${text.slice(0, 50)}..." → ${Math.round(audioData.length / 1024)}KB`);
    return audioData;
  } catch (err) {
    log.error(`[Fallback Gemini] Erreur TTS: ${(err as Error).message}`);
    return null;
  }
}

function getInlineAudioData(response: unknown): string | null {
  if (typeof response !== "object" || response === null) return null;
  const candidates = (response as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const candidate = candidates[0];
  if (typeof candidate !== "object" || candidate === null) return null;
  const content = (candidate as Record<string, unknown>).content;
  if (typeof content !== "object" || content === null) return null;
  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const part = parts[0];
  if (typeof part !== "object" || part === null) return null;
  const inlineData = (part as Record<string, unknown>).inlineData;
  if (typeof inlineData !== "object" || inlineData === null) return null;
  const data = (inlineData as Record<string, unknown>).data;
  return typeof data === "string" ? data : null;
}

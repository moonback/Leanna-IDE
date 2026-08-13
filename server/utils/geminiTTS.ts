/**
 * geminiTTS.ts — Génération audio TTS via l'API Gemini (non-live).
 * 
 * Utilise le modèle gemini-3.1-flash-tts-preview pour convertir du texte en audio PCM.
 * L'audio retourné est au format PCM 24kHz 16-bit mono (même format que le flux Gemini Live).
 * 
 * Usage :
 *   import { generateSpeech } from './utils/geminiTTS';
 *   const base64Audio = await generateSpeech("Bonjour !", { voiceName: "Aoede" });
 *   // Envoyer au client comme un chunk audio standard
 */

import { withGeminiRetry } from "./geminiKeyPool";
import { createLogger } from "./logger";

const log = createLogger("GeminiTTS");

export interface TTSOptions {
  /** Nom de la voix Gemini (défaut: Aoede) */
  voiceName?: string;
  /** Modèle TTS (défaut: gemini-3.1-flash-tts-preview) */
  model?: string;
}

/**
 * Génère de l'audio à partir de texte via l'API Gemini TTS.
 * Retourne l'audio en base64 (PCM 24kHz 16-bit mono), prêt à être envoyé au client.
 * Retourne null en cas d'erreur (non bloquant).
 */
export async function generateSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<string | null> {
  const voiceName = options.voiceName || "Aoede";
  const model = options.model || "gemini-3.1-flash-tts-preview";

  try {
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

    const audioData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      log.warn(`Pas de données audio retournées pour: "${text.slice(0, 50)}..."`);
      return null;
    }

    log.debug(`Audio TTS généré (${voiceName}): "${text.slice(0, 50)}..." → ${Math.round(audioData.length / 1024)}KB`);
    return audioData;
  } catch (err) {
    log.error(`Erreur TTS: ${(err as Error).message}`);
    return null;
  }
}

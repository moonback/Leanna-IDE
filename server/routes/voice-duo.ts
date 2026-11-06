/**
 * Voice Duo — orchestration bornée de deux assistants vocaux.
 *
 * Chaque tour est généré séparément avec une identité et un prompt distincts.
 * La réponse contient les segments audio séparés afin que le client puisse
 * interrompre immédiatement la lecture lors d'une nouvelle prise de parole.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ProfileConfig } from "../prompts/systemInstruction.js";
import { generateText } from "../utils/textGeneration.js";
import { generateSpeech } from "../utils/geminiTTS.js";

const MessageSchema = z.object({
  speaker: z.enum(["user", "leanna", "roxane"]),
  text: z.string().min(1).max(4_000),
});
const RequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  history: z.array(MessageSchema).max(20).default([]),
  maxTurns: z.number().int().min(1).max(4).default(2),
  includeAudio: z.boolean().default(true),
  language: z.enum(["fr", "en", "es", "de", "pt"]).optional(),
});

type Speaker = "leanna" | "roxane";
interface DialogueMessage { speaker: Speaker; name: string; text: string; audio?: string | null; }

const DEFAULT_ROXANE_PROMPT =
  "Tu es Roxane, une seconde intelligence artificielle indépendante. Tu apportes un regard différent, identifies les angles morts, questionnes les hypothèses et proposes des alternatives concrètes. Tu peux être en désaccord avec Leanna, mais reste constructive, précise et naturelle. Ne répète pas simplement ce qui a déjà été dit.";

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const clean = value.trim().replace(/[\r\n<>]/g, "").slice(0, 40);
  return clean || fallback;
}

export function createVoiceDuoRouter(getProfile: () => ProfileConfig): Router {
  const router = Router();

  router.post("/turn", async (req: Request, res: Response) => {
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Requête invalide.", details: parsed.error.flatten() });
      return;
    }

    const startedAt = Date.now();
    const { message, history, maxTurns, includeAudio, language } = parsed.data;
    const profile = getProfile();
    const leannaName = safeName(profile.aiName, "Leanna");
    const roxaneName = safeName(profile.duoName, "Roxane");
    const leannaVoice = safeName(profile.aiVoice, "Aoede");
    const roxaneVoice = safeName((profile as ProfileConfig & { duoVoice?: string }).duoVoice, "Kore");
    const lang = language || profile.language || "fr";
    const usefulHistory = history.length && history[history.length - 1].speaker === "user" && history[history.length - 1].text === message ? history.slice(0, -1) : history;
    const transcript = usefulHistory.map(item => ({
      role: item.speaker === "user" ? "Utilisateur" : item.speaker === "leanna" ? leannaName : roxaneName,
      content: item.text,
    }));

    const dialogue: DialogueMessage[] = [];
    let previousSpeaker: Speaker = "roxane";

    try {
      for (let index = 0; index < maxTurns; index++) {
        const speaker: Speaker = previousSpeaker === "roxane" ? "leanna" : "roxane";
        const name = speaker === "leanna" ? leannaName : roxaneName;
        const voice = speaker === "leanna" ? leannaVoice : roxaneVoice;
        const otherName = speaker === "leanna" ? roxaneName : leannaName;
        const systemPrompt = speaker === "leanna"
          ? `Tu es ${name}, l'assistante principale. Tu échanges librement avec ${otherName} et l'utilisateur. Tu peux défendre ton analyse, répondre aux objections et poser des questions. Ne prétends pas être humaine. Réponds en ${lang}. Fais une réponse orale naturelle, concise (2 à 5 phrases). Ne décris jamais de raisonnement interne privé.`
          : `Tu es ${name}, une seconde IA avec une personnalité et un regard indépendants. ${DEFAULT_ROXANE_PROMPT} Tu dialogues avec ${otherName} et l'utilisateur. Réponds en ${lang}, dans un style oral naturel et concis (2 à 5 phrases). Ne décris jamais de raisonnement interne privé.`;

        const context = transcript.map(item => `${item.role}: ${item.content}`).join("\n");
        const prompt = index === 0
          ? `L'utilisateur vient de dire : ${message}\n\nHistorique utile :\n${context || "(début de conversation)"}\n\nPrends la parole maintenant.`
          : `Conversation en cours :\n${context}\n\nC'est à ton tour. Réponds au dernier intervenant en ajoutant un point de vue utile. Ne crée pas de désaccord artificiel et ne répète pas les idées déjà exprimées.`;

        const generated = await generateText({
          prompt,
          systemPrompt,
          temperature: speaker === "roxane" ? 0.85 : 0.7,
          maxOutputTokens: 450,
          untrustedPrompt: true,
          untrustedSource: "voice-duo-conversation",
        });
        const text = generated.text?.trim();
        if (!text) throw new Error(`Réponse vide du modèle pour ${name}.`);

        const entry: DialogueMessage = { speaker, name, text };
        if (includeAudio) {
          try {
            entry.audio = await generateSpeech(text, { voiceName: voice, provider: "auto" });
          } catch (audioError) {
            console.warn(`[VoiceDuo] TTS indisponible pour ${speaker}:`, audioError);
            entry.audio = null;
          }
        }
        dialogue.push(entry);
        transcript.push({ role: name, content: text });
        previousSpeaker = speaker;
      }

      console.info("[VoiceDuo] Dialogue généré", {
        turns: dialogue.length,
        audio: includeAudio,
        durationMs: Date.now() - startedAt,
      });
      res.json({ messages: dialogue, durationMs: Date.now() - startedAt });
    } catch (error) {
      console.error("[VoiceDuo] Échec du dialogue", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(502).json({ error: "Impossible de générer le dialogue vocal.", details: error instanceof Error ? error.message : "Erreur inconnue." });
    }
  });

  return router;
}

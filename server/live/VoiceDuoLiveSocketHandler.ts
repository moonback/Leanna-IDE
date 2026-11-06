import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import type { ProfileConfig } from "../prompts/systemInstruction.js";
import { recordModelCallUsage } from "../utils/textGeneration.js";

type Speaker = "leanna" | "roxane";
type LiveSession = Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>;
interface TranscriptItem { speaker: Speaker | "user"; text: string }
export interface VoiceDuoLiveDeps {
  getCurrentProfile: () => ProfileConfig;
  createGeminiAI: () => GoogleGenAI;
  activeGeminiSessions: Set<unknown>;
}
const MODEL = "gemini-3.8-live";
const MAX_AUTONOMOUS_TURNS = 4;

function safeName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/[\r\n<>]/g, "").slice(0, 40) : fallback;
}

/** Deux sessions Live distinctes, avec un arbitre de tours et un flux audio client unique. */
export function attachVoiceDuoLiveWebSocket(wss: WebSocketServer, deps: VoiceDuoLiveDeps): void {
  wss.on("connection", async (client: WebSocket) => {
    const profile = deps.getCurrentProfile();
    const names: Record<Speaker, string> = {
      leanna: safeName(profile.aiName, "Leanna"),
      roxane: safeName(profile.duoName, "Roxane"),
    };
    const voices: Record<Speaker, string> = {
      leanna: safeName(profile.aiVoice, "Aoede"),
      roxane: safeName(profile.duoVoice, "Kore"),
    };
    const language = profile.language || "fr";
    const sessions = new Map<Speaker, LiveSession>();
    const history: TranscriptItem[] = [];
    let activeSpeaker: Speaker = "leanna";
    let chainId = 0;
    let autonomousTurns = 0;
    let chainActive = false;
    let advancing = false;
    let suppressOutputUntilUserText = false;
    let closed = false;
    const startedAt = Date.now();

    const send = (value: unknown) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(JSON.stringify(value)); } catch { /* socket fermé */ }
      }
    };
    const other = (speaker: Speaker): Speaker => speaker === "leanna" ? "roxane" : "leanna";
    const append = (speaker: TranscriptItem["speaker"], text: string) => {
      const clean = text.trim().slice(0, 3500);
      if (!clean) return;
      const last = history[history.length - 1];
      if (last?.speaker === speaker) last.text = (last.text + " " + clean).slice(-5000);
      else history.push({ speaker, text: clean });
      while (history.length > 24) history.shift();
    };
    const promptFor = (speaker: Speaker) => [
      speaker === "leanna"
        ? `Tu es ${names.leanna}, l'assistante principale de l'utilisateur.`
        : `Tu es ${names.roxane}, une IA indépendante de ${names.leanna}, avec un regard critique et complémentaire.`,
      `Tu échanges en direct avec l'utilisateur et ${names[other(speaker)]}.`,
      "Mode libre : rebondis naturellement sur les propos, peux contredire avec des arguments, demander des précisions et proposer des alternatives.",
      "Ne répète pas les idées déjà exprimées, ne crée pas de désaccord artificiel et ne révèle jamais de raisonnement interne privé.",
      "Adresse-toi prioritairement à l'utilisateur. Tu es une IA, ne prétends jamais être humaine.",
      `Réponds en ${language}, avec un style oral naturel et concis.`,
    ].join("\n");

    const nextTurn = async (from: Speaker, text: string, expectedChain: number) => {
      if (closed || !chainActive || expectedChain !== chainId) return;
      if (autonomousTurns >= MAX_AUTONOMOUS_TURNS) {
        chainActive = false;
        advancing = false;
        send({ type: "listening", reason: "turn_limit" });
        return;
      }
      const next = other(from);
      const target = sessions.get(next);
      if (!target) return;
      activeSpeaker = next;
      autonomousTurns += 1;
      advancing = false;
      const shared = history.slice(-12).map(item =>
        `${item.speaker === "user" ? "Utilisateur" : names[item.speaker]} : ${item.text}`
      ).join("\n");
      send({ type: "speaker", speaker: next, name: names[next], state: "thinking", turn: autonomousTurns });
      try {
        target.sendClientContent({
          turns: [{
            role: "user",
            parts: [{ text:
              `${names[from]} vient de dire : « ${text.slice(0, 1800)} »\n\n` +
              `Contexte partagé :\n${shared}\n\n` +
              "Réponds à cette intervention en apportant un point de vue utile. Tu peux être en désaccord, nuancer ou poser une question. Réponse orale naturelle, concise."
            }],
          }],
          turnComplete: true,
        });
      } catch (error) {
        chainActive = false;
        send({ type: "error", message: `Transmission du tour à ${names[next]} impossible.` });
        console.error("[VoiceDuoLive] next turn failed", { speaker: next, error });
      }
    };

    const connectSpeaker = async (speaker: Speaker): Promise<LiveSession> => {
      return deps.createGeminiAI().live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          temperature: speaker === "roxane" ? 0.8 : (profile.temperature ?? 0.65),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[speaker] } } },
          systemInstruction: { parts: [{ text: promptFor(speaker) }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;
            if (message.usageMetadata) {
              recordModelCallUsage({
                provider: "gemini", model: MODEL, rawUsage: message.usageMetadata,
                promptCharCount: 0, outputText: "", toolName: `voice_duo_${speaker}`, kind: "live",
              });
            }
            const content = message.serverContent;
            if (content?.interrupted) {
              // Invalider le tour autonome en cours : la voix de l’utilisateur
              // reprend la priorité et aucun ancien tour ne doit repartir.
              chainId += 1;
              chainActive = false;
              advancing = false;
              suppressOutputUntilUserText = true;
              send({ type: "interrupted", speaker });
            }
            const inputText = (content as any)?.inputTranscription?.text;
            if (typeof inputText === "string" && inputText.trim()) {
              append("user", inputText);
              suppressOutputUntilUserText = false;
              chainId += 1;
              chainActive = true;
              autonomousTurns = 0;
              advancing = false;
              activeSpeaker = speaker;
              send({ type: "user_text", text: inputText });
            }
            const outputText = (content as any)?.outputTranscription?.text;
            if (typeof outputText === "string" && outputText.trim()) {
              append(speaker, outputText);
              send({ type: "transcript", speaker, name: names[speaker], text: outputText });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data && !suppressOutputUntilUserText && activeSpeaker === speaker && client.readyState === WebSocket.OPEN) {
                try { client.send(Buffer.from(part.inlineData.data, "base64"), { binary: true }); }
                catch { /* client disconnected */ }
              }
              if (part.text) send({ type: "text", speaker, name: names[speaker], text: part.text });
            }
            if (content?.turnComplete) {
              send({ type: "turn_complete", speaker });
              const last = [...history].reverse().find(item => item.speaker === speaker);
              if (chainActive && !advancing && last?.text) {
                advancing = true;
                void nextTurn(speaker, last.text, chainId);
              } else if (!chainActive) {
                send({ type: "listening", speaker });
              }
            }
          },
          onerror: (error: unknown) => {
            console.error(`[VoiceDuoLive][${speaker}] Gemini error`, error);
            send({ type: "session_error", speaker, message: `Erreur de session ${names[speaker]}.` });
            client.close(1011, `Gemini Live error: ${speaker}`);
          },
          onclose: (event: unknown) => {
            if (!closed) {
              console.warn(`[VoiceDuoLive][${speaker}] Session closed`, event);
              send({ type: "session_closed", speaker });
              client.close(1011, `Gemini Live closed: ${speaker}`);
            }
          },
        },
      });
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      chainId += 1;
      for (const session of sessions.values()) {
        try { session.close(); } catch { /* ignore */ }
        deps.activeGeminiSessions.delete(session);
      }
      sessions.clear();
      console.info("[VoiceDuoLive] Dual session closed", { durationMs: Date.now() - startedAt, turns: history.length });
    };
    client.on("close", cleanup);
    client.on("error", cleanup);

    send({ type: "connecting", model: MODEL, speakers: names });
    try {
      const leanna = await connectSpeaker("leanna");
      if (closed) { try { leanna.close(); } catch { /* ignore */ } return; }
      sessions.set("leanna", leanna);
      deps.activeGeminiSessions.add(leanna);
      const roxane = await connectSpeaker("roxane");
      if (closed) { try { roxane.close(); } catch { /* ignore */ } return; }
      sessions.set("roxane", roxane);
      deps.activeGeminiSessions.add(roxane);
      send({ type: "ready", model: MODEL, sessions: [
        { speaker: "leanna", name: names.leanna, voice: voices.leanna },
        { speaker: "roxane", name: names.roxane, voice: voices.roxane },
      ] });
      console.info("[VoiceDuoLive] Two independent Gemini Live sessions ready", { durationMs: Date.now() - startedAt });
    } catch (error) {
      console.error("[VoiceDuoLive] Initialization failed", error);
      send({ type: "error", message: "Impossible de démarrer les deux sessions Gemini Live." });
      for (const session of sessions.values()) {
        try { session.close(); } catch { /* ignore */ }
        deps.activeGeminiSessions.delete(session);
      }
      client.close(1011, "Gemini Live initialization failed");
      return;
    }

    client.on("message", (data: Buffer, isBinary: boolean) => {
      if (closed) return;
      if (isBinary) {
        const target = sessions.get(activeSpeaker);
        if (!target) return;
        try {
          target.sendRealtimeInput({ audio: { data: data.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
        } catch (error) {
          console.warn("[VoiceDuoLive] Audio input failed", { speaker: activeSpeaker, error });
        }
        return;
      }
      try {
        const msg = JSON.parse(data.toString()) as { type?: string; text?: string };
        if (msg.type === "text" && typeof msg.text === "string" && msg.text.trim()) {
          chainId += 1;
          chainActive = true;
          suppressOutputUntilUserText = false;
          autonomousTurns = 0;
          advancing = false;
          append("user", msg.text);
          activeSpeaker = "leanna";
          sessions.get("leanna")?.sendClientContent({
            turns: [{ role: "user", parts: [{ text: msg.text.trim().slice(0, 4000) }] }],
            turnComplete: true,
          });
        } else if (msg.type === "reset") {
          // Une session Live conserve son contexte fournisseur : un reset réel
          // exige de fermer les deux sessions et d'en ouvrir de nouvelles.
          client.close(1000, "Conversation reset");
        } else if (msg.type === "interrupt") {
          // Le barge-in effectif est déclenché par l'audio micro envoyé en continu
          // à la session active ; ce message coupe la lecture côté client.
          send({ type: "interrupt_ack", speaker: activeSpeaker });
        }
      } catch (error) {
        console.warn("[VoiceDuoLive] Invalid client message", error);
      }
    });


  });
}

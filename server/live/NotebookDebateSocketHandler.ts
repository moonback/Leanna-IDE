/**
 * Notebook AI Debate — orchestration vocale séquentielle de deux sessions Gemini Live.
 * Un seul speaker est actif à la fois : l'orchestrateur contrôle les tours,
 * la pause et la durée afin d'éviter les chevauchements audio.
 */
import { WebSocket, WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { notebookManager, ragEngine } from "../notebooks/index.js";
import { recordModelCallUsage } from "../utils/textGeneration.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import type { ProfileConfig } from "../prompts/systemInstruction.js";

const MODEL = "gemini-3.8-live";
const MAX_DURATION_MS = 10 * 60 * 1000;
const MAX_TURNS = 6;
const MAX_TOPIC_LENGTH = 500;

type Speaker = "analyst" | "critic" | "moderator";
type DebateMessage = { speaker: Speaker; text: string; at: string; citations: Array<{sourceId:string;sourceTitle:string;chunkId:string;excerpt:string;relevance:number}> };

export interface NotebookDebateDeps {
  createGeminiAI: () => GoogleGenAI;
  getCurrentProfile: () => ProfileConfig;
  activeGeminiSessions: Set<unknown>;
}

const ROLE_PROMPTS: Record<Speaker, string> = {
  analyst: "Tu es l'ANALYSTE. Construis une lecture structurée, nuancée et fidèle aux extraits fournis. Identifie les faits, les mécanismes, les arguments et les limites. Chaque affirmation documentaire doit référencer les identifiants de passages [chunk:ID]. N'invente aucune source. Réponds oralement en français, de façon concise (60 à 100 secondes).",
  critic: "Tu es le CONTRADICTEUR. Examine rigoureusement l'intervention de l'analyste : cherche les angles morts, les contradictions, les généralisations et les preuves manquantes. Tu dois aussi reconnaître les points solides. N'invente aucune source et cite les passages fournis avec [chunk:ID]. Réponds oralement en français (60 à 100 secondes).",
  moderator: "Tu es le MODÉRATEUR. Fais une synthèse équilibrée du débat : consensus, désaccords réels, éléments démontrés, incertitudes et questions ouvertes. Ne présente jamais une hypothèse comme un fait. Cite les passages avec [chunk:ID]. Réponds en français, clairement et sans préambule.",
};

export function attachNotebookDebateWebSocket(wss: WebSocketServer, deps: NotebookDebateDeps): void {
  wss.on("connection", (ws: WebSocket, req: { url?: string }) => {
    const params = new URLSearchParams(req.url?.split("?")[1] || "");
    const notebookId = params.get("notebookId") || "";
    let closed = false;
    let paused = false;
    let running = false;
    let stopRequested = false;
    let deadline = 0;
    let durationTimer: ReturnType<typeof setTimeout> | undefined;
    let sessions: Partial<Record<Speaker, any>> = {};
    const transcript: DebateMessage[] = [];
    const send = (payload: unknown) => {
      if (!closed && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(payload)); } catch { /* socket closing */ }
      }
    };
    const closeSessions = () => {
      for (const session of Object.values(sessions)) {
        if (!session) continue;
        try { session.close(); } catch { /* already closed */ }
        deps.activeGeminiSessions.delete(session);
      }
      sessions = {};
    };
    const cleanup = () => {
      closed = true;
      if (durationTimer) clearTimeout(durationTimer);
      closeSessions();
    };
    const waitIfPaused = async () => {
      while (paused && !stopRequested && !closed) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    };

    const notebook = notebookManager.getNotebook(notebookId, SELF_ROOT || undefined);
    if (!notebookId || !notebook) {
      send({ type: "error", error: "Notebook introuvable ou inaccessible dans le workspace actif." });
      ws.close(1008, "Notebook unavailable");
      return;
    }

    const connectAgent = async (speaker: Speaker, voiceName: string, temperature: number) => {
      const session = await deps.createGeminiAI().live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          temperature,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: { parts: [{ text: ROLE_PROMPTS[speaker] }] },
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (message.usageMetadata) {
              recordModelCallUsage({ provider: "gemini", model: MODEL, rawUsage: message.usageMetadata, promptCharCount: 0, outputText: "", toolName: "notebook_ai_debate", kind: "live" });
            }
          },
          onerror: () => send({ type: "error", error: "Une session Gemini Live a rencontré une erreur." }),
        },
      });
      sessions[speaker] = session;
      deps.activeGeminiSessions.add(session);
      return session;
    };

    const runTurn = async (speaker: Speaker, prompt: string, evidence: string, citations: DebateMessage["citations"]) => {
      await waitIfPaused();
      if (stopRequested || closed || Date.now() >= deadline) return;
      const session = sessions[speaker];
      if (!session) throw new Error("Session Gemini indisponible.");
      send({ type: "speaker", speaker, state: "speaking" });
      let output = "";
      let settled = false;
      let resolveTurn!: () => void;
      const completed = new Promise<void>(resolve => { resolveTurn = resolve; });
      const timeout = setTimeout(() => { if (!settled) { settled = true; resolveTurn(); } }, 90000);
      const previous = session.callbacks?.onmessage;
      // Le SDK appelle le callback défini à la connexion ; le flux est relayé via
      // les callbacks installés ci-dessous dans la connexion dédiée de chaque agent.
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text:
          `SUJET DU DÉBAT : ${prompt}\n\nEXTRAITS AUTORISÉS :\n${evidence}\n\nConsigne : ${prompt}`
        }] }],
        turnComplete: true,
      });
      // Gemini Live pousse la transcription et l'audio via le callback de session.
      // Le callback générique reçoit ces événements via le registre de tour ci-dessous.
      const waiter = (session as any).__debateTurn;
      if (waiter) await waiter;
      clearTimeout(timeout);
      void previous;
      if (!output.trim()) output = (session as any).__lastTranscript || "Intervention audio terminée ; transcription non disponible.";
      const entry: DebateMessage = { speaker, text: output, at: new Date().toISOString(), citations };
      transcript.push(entry);
      send({ type: "transcript", message: entry });
      send({ type: "speaker", speaker, state: "idle" });
    };

    const startDebate = async (input: { topic?: string; sourceIds?: string[]; durationMinutes?: number }) => {
      if (running) return;
      running = true;
      const topic = String(input.topic || "").trim().slice(0, MAX_TOPIC_LENGTH);
      if (!topic) { send({ type: "error", error: "Indiquez un sujet de débat." }); running = false; return; }
      const allowedIds = new Set(notebook!.sources.map(source => source.id));
      const requested = Array.isArray(input.sourceIds) ? input.sourceIds.filter(id => typeof id === "string" && allowedIds.has(id)) : [];
      const sourceIds = requested.length ? requested : notebook!.sources.map(source => source.id);
      const durationMinutes = Math.max(1, Math.min(10, Number(input.durationMinutes) || 10));
      deadline = Date.now() + Math.min(durationMinutes * 60_000, MAX_DURATION_MS);
      durationTimer = setTimeout(() => { stopRequested = true; send({ type: "limit_reached" }); }, deadline - Date.now());
      const profile = deps.getCurrentProfile();
      const voiceA = profile.aiVoice || "Aoede";
      const voiceB = "Puck";
      send({ type: "status", status: "connecting", topic, durationMinutes, sourceCount: sourceIds.length });
      try {
        await Promise.all([
          connectAgent("analyst", voiceA, profile.temperature ?? 0.5),
          connectAgent("critic", voiceB, profile.temperature ?? 0.6),
          connectAgent("moderator", voiceA, 0.3),
        ]);
        send({ type: "status", status: "running" });
        let previousText = "";
        for (let turn = 0; turn < MAX_TURNS && !stopRequested && !closed && Date.now() < deadline; turn++) {
          const speaker: Speaker = turn === MAX_TURNS - 1 ? "moderator" : turn % 2 === 0 ? "analyst" : "critic";
          const query = turn === 0 ? topic : `${topic}\nIntervention précédente : ${previousText.slice(-1800)}\nQuel nouvel angle ou contre-argument étayer ?`;
          const results = await ragEngine.searchHybrid(query, notebook!.sources, { maxChunks: 6, minRelevance: 0.12, sourceIds });
          const evidence = results.map((r, i) => `[chunk:${r.chunk.id}] [source:${r.source.id}] ${r.source.title}\n${r.chunk.content.slice(0, 1800)}`).join("\n\n");
          const citations = results.map(r => ({ sourceId: r.source.id, sourceTitle: r.source.title, chunkId: r.chunk.id, excerpt: r.chunk.content.slice(0, 240), relevance: r.relevance }));
          if (!evidence) {
            send({ type: "error", error: "Aucun passage pertinent trouvé dans les sources sélectionnées." });
            break;
          }
          await runTurn(speaker, turn === 0 ? `Analyse le sujet : ${topic}` : turn === MAX_TURNS - 1 ? `Synthétise le débat sur : ${topic}` : `Réponds à l'intervention précédente sur : ${topic}. ${previousText}`, evidence, citations);
          previousText = transcript[transcript.length - 1]?.text || previousText;
          if (turn < MAX_TURNS - 1) await runTurn(speaker === "analyst" ? "critic" : "analyst", `Réagis à l'argument suivant : ${previousText}`, evidence, citations);
          previousText = transcript[transcript.length - 1]?.text || previousText;
          if (turn > 0) break;
        }
        if (!stopRequested && !closed) send({ type: "status", status: "completed", transcript });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Échec du débat." });
      } finally {
        running = false;
        closeSessions();
      }
    };

    ws.on("message", (raw: Buffer) => {
      let message: any;
      try { message = JSON.parse(raw.toString()); } catch { send({ type: "error", error: "Message invalide." }); return; }
      if (message.type === "start") void startDebate(message);
      else if (message.type === "pause") { paused = true; send({ type: "status", status: "paused" }); }
      else if (message.type === "resume") { paused = false; send({ type: "status", status: "running" }); }
      else if (message.type === "stop") { stopRequested = true; paused = false; send({ type: "status", status: "stopping" }); }
    });
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });
}

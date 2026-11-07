/**
 * Orchestrates a grounded, sequential three-role Notebook debate over Gemini Live.
 * Only one role speaks at a time; pause is honored between turns.
 */
import { WebSocket, WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { notebookManager, ragEngine } from "../notebooks/index.js";
import type { GeneratedDocument } from "../notebooks/types.js";
import { recordModelCallUsage } from "../utils/textGeneration.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import type { ProfileConfig } from "../prompts/systemInstruction.js";

const MODEL = "gemini-3.8-live";
const MAX_DURATION_MS = 10 * 60_000;
const ROLES = ["analyst", "critic", "moderator"] as const;
type Speaker = typeof ROLES[number];
type Citation = { sourceId: string; sourceTitle: string; chunkId: string; excerpt: string; relevance: number };
type TurnMessage = { speaker: Speaker; text: string; at: string; citations: Citation[] };

export interface NotebookDebateDeps {
  createGeminiAI: () => GoogleGenAI;
  getCurrentProfile: () => ProfileConfig;
  activeGeminiSessions: Set<unknown>;
}

const ROLE_PROMPTS: Record<Speaker, string> = {
  analyst: "Tu es l'ANALYSTE du débat. Construis une lecture structurée, nuancée et fidèle aux extraits fournis. Identifie faits, mécanismes, arguments et limites. Chaque affirmation documentaire doit citer un identifiant [chunk:ID] présent dans les extraits. N'invente aucune source. Réponds en français, oralement, en 45 à 75 secondes.",
  critic: "Tu es le CONTRADICTEUR. Examine rigoureusement l'intervention précédente : angles morts, contradictions, généralisations et preuves manquantes. Reconnais aussi les arguments solides. Chaque affirmation documentaire doit citer un [chunk:ID] fourni. N'invente aucune source. Réponds en français, oralement, en 45 à 75 secondes.",
  moderator: "Tu es le MODÉRATEUR. Synthétise équitablement : consensus, désaccords, éléments étayés, incertitudes et questions ouvertes. Ne présente jamais une hypothèse comme un fait. Cite les [chunk:ID] fournis. Réponds en français, oralement, de façon concise.",
};

export function attachNotebookDebateWebSocket(wss: WebSocketServer, deps: NotebookDebateDeps): void {
  wss.on("connection", (ws: WebSocket, req: { url?: string }) => {
    const params = new URLSearchParams(req.url?.split("?")[1] || "");
    const notebookId = params.get("notebookId") || "";
    let closed = false;
    let paused = false;
    let stopRequested = false;
    let running = false;
    let deadline = 0;
    let durationTimer: ReturnType<typeof setTimeout> | undefined;
    const sessions = new Map<Speaker, any>();
    const turnRunners = new Map<Speaker, (prompt: string, evidence: string) => Promise<string>>();
    const transcript: TurnMessage[] = [];

    const send = (payload: unknown) => {
      if (!closed && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(payload)); } catch { /* socket closing */ }
      }
    };
    const closeSessions = () => {
      for (const session of sessions.values()) {
        try { session.close(); } catch { /* already closed */ }
        deps.activeGeminiSessions.delete(session);
      }
      sessions.clear();
    };
    const cleanup = () => {
      closed = true;
      if (durationTimer) clearTimeout(durationTimer);
      closeSessions();
    };
    const waitIfPaused = async () => {
      while (paused && !stopRequested && !closed && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 120));
      }
    };

    const notebook = notebookManager.getNotebook(notebookId, SELF_ROOT || undefined);
    if (!notebookId || !notebook) {
      send({ type: "error", error: "Notebook introuvable ou inaccessible dans le workspace actif." });
      ws.close(1008, "Notebook unavailable");
      return;
    }

    const connectAgent = async (speaker: Speaker, voiceName: string, temperature: number) => {
      let active: { text: string; resolve: (value: string) => void; timer: ReturnType<typeof setTimeout> } | null = null;
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
            if (!active) return;
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.text) active.text += part.text;
              const audio = part.inlineData?.data;
              if (audio) send({ type: "audio", speaker, data: audio, mimeType: part.inlineData?.mimeType || "audio/pcm;rate=24000" });
            }
            const outputText = (message.serverContent as any)?.outputAudioTranscription?.text;
            if (typeof outputText === "string" && outputText) {
              active.text += outputText;
              send({ type: "live_transcript", speaker, text: outputText });
            }
            if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
              const current = active;
              active = null;
              clearTimeout(current.timer);
              current.resolve(current.text.trim());
            }
          },
          onerror: () => {
            if (active) {
              const current = active;
              active = null;
              clearTimeout(current.timer);
              current.resolve(current.text.trim());
            }
            send({ type: "error", error: `La session ${speaker} a rencontré une erreur Gemini Live.` });
          },
        },
      });
      sessions.set(speaker, session);
      deps.activeGeminiSessions.add(session);
      turnRunners.set(speaker, (prompt, evidence) => new Promise<string>((resolve, reject) => {
        if (active) { reject(new Error("Un tour de parole est déjà en cours.")); return; }
        const timer = setTimeout(() => {
          if (active) {
            const current = active;
            active = null;
            current.resolve(current.text.trim());
          }
        }, 75_000);
        active = { text: "", resolve, timer };
        try {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: `SUJET ET CONSIGNE : ${prompt}\n\nEXTRAITS AUTORISÉS DU NOTEBOOK :\n${evidence}\n\nRéponds uniquement à partir de ces extraits. Si une preuve manque, dis-le explicitement.` }] }],
            turnComplete: true,
          });
        } catch (error) {
          clearTimeout(timer);
          active = null;
          reject(error);
        }
      }));
    };

    const startDebate = async (input: { topic?: string; sourceIds?: string[]; durationMinutes?: number }) => {
      if (running) return;
      running = true;
      const topic = typeof input.topic === "string" ? input.topic.trim().slice(0, 500) : "";
      if (!topic) { send({ type: "error", error: "Indiquez un sujet de débat." }); running = false; return; }
      const allowed = new Set(notebook!.sources.map(source => source.id));
      const requested = Array.isArray(input.sourceIds) ? input.sourceIds.filter((id): id is string => typeof id === "string" && allowed.has(id)) : [];
      const sourceIds = requested.length ? requested : notebook!.sources.map(source => source.id);
      if (!sourceIds.length) { send({ type: "error", error: "Ajoutez au moins une source au Notebook avant de lancer le débat." }); running = false; return; }
      const durationMinutes = Math.max(1, Math.min(10, Number(input.durationMinutes) || 10));
      deadline = Date.now() + Math.min(durationMinutes * 60_000, MAX_DURATION_MS);
      durationTimer = setTimeout(() => { stopRequested = true; paused = false; send({ type: "limit_reached" }); }, deadline - Date.now());
      const profile = deps.getCurrentProfile();
      send({ type: "status", status: "connecting", topic, durationMinutes, sourceCount: sourceIds.length });
      try {
        await Promise.all([
          connectAgent("analyst", profile.aiVoice || "Aoede", profile.temperature ?? 0.5),
          connectAgent("critic", "Puck", profile.temperature ?? 0.6),
          connectAgent("moderator", profile.aiVoice || "Aoede", 0.3),
        ]);
        send({ type: "status", status: "running" });
        let previousText = "";
        for (const speaker of ROLES) {
          await waitIfPaused();
          if (stopRequested || closed || Date.now() >= deadline) break;
          const query = speaker === "analyst"
            ? topic
            : `${topic}\nIntervention précédente : ${previousText.slice(-2200)}\nIdentifie les points solides, les limites et les preuves pertinentes.`;
          const results = await ragEngine.searchHybrid(query, notebook!.sources, { maxChunks: 6, minRelevance: 0.12, sourceIds });
          if (!results.length) { send({ type: "error", error: "Aucun passage pertinent trouvé dans les sources sélectionnées." }); break; }
          const citations: Citation[] = results.map(result => ({
            sourceId: result.source.id, sourceTitle: result.source.title, chunkId: result.chunk.id,
            excerpt: result.chunk.content.slice(0, 240), relevance: result.relevance,
          }));
          const evidence = results.map(result => `[chunk:${result.chunk.id}] [source:${result.source.id}] ${result.source.title}\n${result.chunk.content.slice(0, 1600)}`).join("\n\n");
          const prompt = speaker === "analyst"
            ? `Analyse le sujet : ${topic}`
            : speaker === "critic"
              ? `Contredis et teste l'analyse suivante sur « ${topic} » : ${previousText}`
              : `Produis la synthèse finale du débat sur « ${topic} ». Dernière intervention : ${previousText}`;
          send({ type: "speaker", speaker, state: "speaking" });
          const text = await turnRunners.get(speaker)!(prompt, evidence);
          const message: TurnMessage = { speaker, text: text || "Transcription indisponible ; consultez la sortie audio.", at: new Date().toISOString(), citations };
          transcript.push(message);
          previousText = message.text;
          send({ type: "transcript", message });
          send({ type: "speaker", speaker, state: "idle" });
        }
        if (transcript.length && !closed) {
          const report = [
            `# Débat IA — ${topic}`,
            "",
            `Durée configurée : ${durationMinutes} minutes maximum`,
            `Date : ${new Date().toLocaleString("fr-FR")}`,
            "",
            "## Interventions",
            ...transcript.flatMap((turn, index) => [
              `### ${index + 1}. ${turn.speaker === "analyst" ? "Analyste" : turn.speaker === "critic" ? "Contradicteur" : "Modérateur"}`,
              turn.text,
              "",
              turn.citations.length ? `Sources consultées : ${turn.citations.map(c => `${c.sourceTitle} (chunk ${c.chunkId})`).join(", ")}` : "Aucune citation associée.",
              "",
            ]),
            "## Limites de traçabilité",
            "Les passages listés sont ceux fournis aux agents par la recherche RAG. Leur présence ne constitue pas une validation sémantique automatique de chaque affirmation prononcée.",
          ].join("\n");
          const document: GeneratedDocument = {
            id: randomUUID(), notebookId, type: "synthesis-report",
            title: `Débat IA — ${topic.slice(0, 70)}`, content: report, sourceIds, createdAt: new Date().toISOString(),
          };
          notebookManager.addGeneratedDocument(notebookId, document);
          send({ type: "document_saved", documentId: document.id, title: document.title });
        }
        if (!stopRequested && !closed) send({ type: "status", status: "completed", transcript });
        else if (!closed) send({ type: "status", status: "stopped", transcript });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Échec du débat." });
      } finally {
        running = false;
        if (durationTimer) clearTimeout(durationTimer);
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

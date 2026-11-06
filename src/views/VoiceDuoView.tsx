import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, RotateCcw, Radio, Loader2, Volume2 } from "lucide-react";
import { useProfile } from "../context/UserProfileContext.js";
import { useAudio } from "../hooks/useAudio.js";

type Speaker = "leanna" | "roxane";
type Entry = { id: string; speaker: "user" | Speaker; name: string; text: string };

export default function VoiceDuoView() {
  const { profile } = useProfile();
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Prêt à démarrer");
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker>("leanna");
  const [messages, setMessages] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [sessionsReady, setSessionsReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const activeRef = useRef(false);
  const sessionsReadyRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const interruptOutputRef = useRef<() => void>(() => {});
  const lastLocalInterruptAtRef = useRef(0);

  const onAudioData = useCallback((pcm16: ArrayBuffer) => {
    const ws = wsRef.current;
    if (activeRef.current && sessionsReadyRef.current && ws?.readyState === WebSocket.OPEN) ws.send(pcm16);
  }, []);

  const onVadSpeech = useCallback(() => {
    if (!activeRef.current || !sessionsReadyRef.current) return;
    // Coupe localement la lecture avant d’envoyer le prochain paquet micro.
    interruptOutputRef.current();
    lastLocalInterruptAtRef.current = Date.now();
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "interrupt" }));
  }, []);

  const audio = useAudio({
    onAudioData,
    onVadSpeech,
    vadEnabled: profile.vadEnabled ?? true,
    vadThreshold: profile.vadThreshold ?? 28,
    vadSilenceDuration: profile.vadSilenceDuration ?? 700,
  });
  interruptOutputRef.current = audio.handleInterrupt;

  const appendEntry = useCallback((speaker: "user" | Speaker, name: string, fragment: string) => {
    const text = fragment.trim();
    if (!text) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [...prev.slice(0, -1), { ...last, text: (last.text + " " + text).slice(-5000) }];
      }
      return [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, speaker, name, text }];
    });
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    activeRef.current = false;
    setActive(false);
    setSessionsReady(false);
    sessionsReadyRef.current = false;
    wsRef.current?.close(1000, "User ended voice duo");
    wsRef.current = null;
    audio.cleanupAudio();
    audio.handleInterrupt();
    setStatus("Conversation terminée");
  }, [audio.cleanupAudio, audio.handleInterrupt]);

  const connect = useCallback(async () => {
    if (activeRef.current) return;
    setError("");
    setMessages([]);
    setStatus("Activation du microphone…");
    intentionalCloseRef.current = false;
    try {
      await audio.initAudio();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/voice-duo-live`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onopen = () => {
        activeRef.current = true;
        setActive(true);
        setStatus("Connexion des deux sessions Gemini Live…");
      };
      ws.onmessage = event => {
        if (event.data instanceof ArrayBuffer) {
          if (activeRef.current) audio.playAudioChunk(event.data);
          return;
        }
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "ready") {
            sessionsReadyRef.current = true;
            setSessionsReady(true);
            setStatus("Deux sessions Gemini Live connectées — vous pouvez parler");
            setActiveSpeaker("leanna");
          } else if (msg.type === "connecting") {
            setStatus("Ouverture des deux sessions vocales…");
          } else if (msg.type === "speaker") {
            setActiveSpeaker(msg.speaker);
            setStatus(`${msg.name || msg.speaker} prépare sa réponse…`);
          } else if (msg.type === "transcript" || msg.type === "text") {
            appendEntry(msg.speaker as Speaker, msg.name || (msg.speaker === "roxane" ? profile.duoName : profile.aiName), msg.text || "");
            setStatus(`${msg.name || msg.speaker} parle…`);
          } else if (msg.type === "user_text") {
            appendEntry("user", "Vous", msg.text || "");
            setStatus("Vous avez la parole");
          } else if (msg.type === "interrupted") {
            if (Date.now() - lastLocalInterruptAtRef.current > 1200) audio.handleInterrupt();
            setStatus("Interruption détectée — à vous la parole");
          } else if (msg.type === "listening" || msg.type === "user_turn_complete") {
            setStatus("À votre écoute — parlez naturellement");
          } else if (msg.type === "session_error" || msg.type === "error") {
            setError(msg.message || "Erreur de session vocale");
            setStatus("Une session vocale rencontre un problème");
          } else if (msg.type === "session_closed") {
            setError(`La session ${msg.speaker} s'est déconnectée.`);
          } else if (msg.type === "ide-action" && msg.action) {
            const action = msg.action;
            window.dispatchEvent(new CustomEvent("Leanna-action", { detail: action }));
            const browserEvents: Record<string, string> = {
              "browser-scroll": "Leanna-browser-scroll",
              "browser-back": "Leanna-browser-control",
              "browser-forward": "Leanna-browser-control",
              "browser-reload": "Leanna-browser-control",
              "browser-read-request": "Leanna-browser-read-request",
              "browser-click": "Leanna-browser-click",
              "browser-type": "Leanna-browser-type",
              "browser-snapshot": "Leanna-browser-snapshot",
              "browser-inspect": "Leanna-browser-inspect",
              "browser-get-links": "Leanna-browser-get-links",
              "browser-mouse-move": "Leanna-browser-mouse-move",
              "browser-accessibility-snapshot": "Leanna-browser-accessibility-snapshot",
              "browser-click-by-role": "Leanna-browser-click-by-role",
              "browser-type-by-label": "Leanna-browser-type-by-label",
              "browser-wait-for": "Leanna-browser-wait-for",
              "browser-get-element-text": "Leanna-browser-get-element-text",
              "browser-get-element-attribute": "Leanna-browser-get-element-attribute",
              "browser-fill-form": "Leanna-browser-fill-form",
              "browser-select-option": "Leanna-browser-select-option",
              "browser-get-console": "Leanna-browser-get-console",
              "browser-capture": "Leanna-browser-capture",
              "browser-new-tab": "Leanna-browser-new-tab",
              "open-rich-document": "Leanna-open-rich-document",
            };
            const eventName = browserEvents[action.type];
            if (eventName) {
              const detail = action.type === "browser-read-request"
                ? { requestId: action.requestId, selector: action.selector ?? null }
                : action;
              window.dispatchEvent(new CustomEvent(eventName, { detail }));
            }
          } else if (msg.tool_start) {
            const tool = String(msg.tool_start);
            setStatus(`${msg.speaker === "roxane" ? profile.duoName || "Roxane" : profile.aiName || "Leanna"} exécute ${tool}…`);
            window.dispatchEvent(new CustomEvent("Leanna-tool-start", { detail: { tool, args: msg.args } }));
            const ideTools = ["list_project_files", "read_project_file", "write_project_file", "modify_project_file", "search_in_files", "open_project_file", "open_ide", "create_project_directory", "rename_project_file", "delete_project_file", "delete_project_folder", "analyze_project_file", "get_workspace_info", "generate_codebase_markdown"];
            if (ideTools.includes(tool)) window.dispatchEvent(new CustomEvent("Leanna-action", { detail: { type: "open-ide" } }));
          } else if (msg.tool_used) {
            window.dispatchEvent(new CustomEvent("Leanna-tool-done", { detail: { tool: msg.tool_used, info: msg.info, result: msg.result } }));
            if (msg.tool_used === "security_audit" && msg.result) {
              window.dispatchEvent(new CustomEvent("Leanna-security-audit-report", { detail: msg.result }));
            }
            setStatus(`Action terminée : ${msg.tool_used}`);
          } else if (msg.type === "agent_event") {
            window.dispatchEvent(new CustomEvent("Leanna-agent-event", { detail: msg }));
          } else if (msg.type === "mission_event") {
            window.dispatchEvent(new CustomEvent("Leanna-mission-event", { detail: msg }));
          } else if (msg.type === "build-status") {
            window.dispatchEvent(new CustomEvent("Leanna-build-status", { detail: msg }));
          } else if (msg.type === "knowledge_progress") {
            window.dispatchEvent(new CustomEvent("Leanna-knowledge-progress", { detail: msg }));
          } else if (msg.type === "save-rich-document-result") {
            window.dispatchEvent(new CustomEvent("Leanna-save-rich-document-result", { detail: msg }));
          } else if (msg.type === "browser-read-request" && msg.requestId) {
            window.dispatchEvent(new CustomEvent("Leanna-browser-read-request", {
              detail: { requestId: msg.requestId, selector: msg.selector ?? null },
            }));
          } else if (msg.type === "confirm-critical-edit" && msg.requestId) {
            window.dispatchEvent(new CustomEvent("Leanna-confirm-critical-edit", { detail: msg }));
          }
        } catch (e) {
          console.warn("[VoiceDuo] Message serveur invalide", e);
        }
      };
      ws.onerror = () => setError("Erreur WebSocket du Duo vocal.");
      ws.onclose = event => {
        wsRef.current = null;
        setSessionsReady(false);
        sessionsReadyRef.current = false;
        if (!intentionalCloseRef.current) {
          activeRef.current = false;
          setActive(false);
          audio.cleanupAudio();
          setError(event.reason || "Connexion Gemini Live interrompue.");
          setStatus("Connexion interrompue");
        }
      };
    } catch (e) {
      audio.cleanupAudio();
      setError(e instanceof Error ? e.message : "Impossible d'activer le microphone.");
      setStatus("Démarrage impossible");
    }
  }, [appendEntry, audio.cleanupAudio, audio.handleInterrupt, audio.initAudio, audio.playAudioChunk, profile.aiName, profile.duoName]);

  const reset = useCallback(() => {
    // Un vrai reset doit recréer les deux sessions Gemini : effacer seulement
    // le transcript UI laisserait l'ancien contexte côté modèle.
    disconnect();
    setMessages([]);
    setError("");
    setStatus("Sessions réinitialisées — relancez les deux IA");
  }, [disconnect]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => {
    intentionalCloseRef.current = true;
    activeRef.current = false;
    wsRef.current?.close();
    audio.cleanupAudio();
  }, [audio.cleanupAudio]);

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col gap-5 overflow-hidden p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Gemini Live · double session</p>
          <h1 className="mt-1 text-2xl font-bold">Leanna <span className="text-[var(--text-muted)]">×</span> {profile.duoName || "Roxane"}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Deux sessions vocales indépendantes, un contexte de conversation partagé.</p>
        </div>
        <button onClick={reset} disabled={!active} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-base)] px-3 py-2 text-sm disabled:opacity-40"><RotateCcw size={15}/> Réinitialiser</button>
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={`rounded-2xl border p-4 ${activeSpeaker === "leanna" && active ? "border-[var(--accent-primary)] bg-[var(--accent-subtle)]" : "border-[var(--border-base)] bg-[var(--bg-secondary)]"}`}>
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-subtle)] text-[var(--accent-primary)]"><Volume2 size={19}/></div><div><p className="font-semibold">{profile.aiName || "Leanna"}</p><p className="text-xs text-[var(--text-muted)]">Session Gemini Live · {profile.aiVoice || "Aoede"}</p></div></div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Assistante principale · analyse et coordination</p>
        </div>
        <div className={`rounded-2xl border p-4 ${activeSpeaker === "roxane" && active ? "border-purple-400 bg-purple-500/10" : "border-[var(--border-base)] bg-[var(--bg-secondary)]"}`}>
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-purple-500/10 text-purple-400"><Volume2 size={19}/></div><div><p className="font-semibold">{profile.duoName || "Roxane"}</p><p className="text-xs text-[var(--text-muted)]">Session Gemini Live · {profile.duoVoice || "Kore"}</p></div></div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Perspective indépendante · contradiction constructive</p>
        </div>
      </section>
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-base)] px-4 py-3">
          <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${sessionsReady ? "bg-emerald-500 animate-pulse" : "bg-[var(--text-muted)]"}`}/><span className="text-sm text-[var(--text-muted)]">{status}</span></div>
          <span className="text-xs text-[var(--text-muted)]">{messages.length} interventions</span>
        </div>
        <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && <div className="grid h-full min-h-48 place-items-center text-center"><div><div className="mb-3 text-4xl">🎙️</div><p className="font-medium">Lancez votre conversation vocale</p><p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">Leanna et Roxane ont chacune leur propre session Gemini Live. Parlez, interrompez-les et laissez-les confronter leurs points de vue.</p></div></div>}
          {messages.map(item => <article key={item.id} className={`max-w-[90%] rounded-xl p-3 ${item.speaker === "user" ? "ml-auto bg-[var(--accent-subtle)]" : item.speaker === "roxane" ? "bg-purple-500/10" : "bg-[var(--bg-secondary)]"}`}><p className="mb-1 text-xs font-semibold text-[var(--accent-primary)]">{item.name}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p></article>)}
        </div>
        {error && <p role="alert" className="border-t border-red-500/20 px-4 py-2 text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-center gap-3 border-t border-[var(--border-base)] p-4">
          {!active ? <button onClick={() => void connect()} className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-primary)] px-6 py-3 font-semibold text-white"><Mic size={18}/> Démarrer les deux IA</button> : <button onClick={disconnect} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 font-semibold text-white"><PhoneOff size={18}/> Terminer</button>}
          {active && <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]"><Radio size={15}/> Micro actif · barge-in Gemini</span>}
          {!sessionsReady && active && <Loader2 size={16} className="animate-spin"/>}
        </div>
      </section>
      <p className="text-center text-xs text-[var(--text-muted)]">Deux sessions Gemini Live indépendantes · PCM16 16 kHz en entrée · PCM 24 kHz en sortie · interruption vocale native · tours autonomes bornés à quatre.</p>
    </main>
  );
}

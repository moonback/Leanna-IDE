import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CirclePause, CirclePlay, Mic2, Radio, Square, Users, ShieldCheck, Clock3, Send, Mic, MicOff } from "lucide-react";

type Source = { id: string; title: string; indexingStatus?: string };
type Speaker = "analyst" | "critic" | "moderator" | "user";
type DebateTurn = { speaker: Speaker; text: string; at: string; citations: Array<{ sourceId: string; sourceTitle: string; chunkId: string; excerpt: string; relevance: number }> };
type Status = "setup" | "connecting" | "running" | "paused" | "stopping" | "completed" | "stopped" | "error";

const SPEAKERS: Record<Speaker, { label: string; role: string; initials: string }> = {
  analyst: { label: "Analyste", role: "Construit l'argumentation", initials: "A" },
  critic: { label: "Contradicteur", role: "Teste les arguments et les preuves", initials: "C" },
  moderator: { label: "Modérateur", role: "Dégage consensus et désaccords", initials: "M" },
  user: { label: "Vous", role: "Intervention utilisateur", initials: "Vous" },
};

function pcm16Base64ToBuffer(context: AudioContext, base64: string): AudioBuffer | null {
  try {
    const binary = atob(base64);
    const samples = new Int16Array(Math.floor(binary.length / 2));
    for (let i = 0; i < samples.length; i++) {
      const lo = binary.charCodeAt(i * 2);
      const hi = binary.charCodeAt(i * 2 + 1);
      samples[i] = (hi << 8) | lo;
    }
    const buffer = context.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    return buffer;
  } catch {
    return null;
  }
}

export function NotebookDebatePanel({
  notebookId,
  sources,
  onOpenSource,
}: {
  notebookId: string;
  sources: Source[];
  onOpenSource?: (sourceId: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>(sources.map(source => source.id));
  const [status, setStatus] = useState<Status>("setup");
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [turns, setTurns] = useState<DebateTurn[]>([]);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [interventionText, setInterventionText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [queuedIntervention, setQueuedIntervention] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioEnabledRef = useRef(true);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCursorRef = useRef(0);
  const turnsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedSources(current => current.length ? current.filter(id => sources.some(source => source.id === id)) : sources.map(source => source.id));
  }, [sources]);

  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, liveText]);

  const stopSocket = useCallback(() => {
    const socket = wsRef.current;
    wsRef.current = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    audioCursorRef.current = 0;
  }, []);

  useEffect(() => () => {
    try { recognitionRef.current?.abort(); } catch { /* microphone already stopped */ }
    stopSocket();
  }, [stopSocket]);

  const sendIntervention = () => {
    const text = interventionText.trim();
    const socket = wsRef.current;
    if (!text || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "intervene", text }));
    setInterventionText("");
    setQueuedIntervention(true);
  };

  const toggleDictation = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("La dictée vocale n’est pas disponible dans ce navigateur. Vous pouvez saisir votre question au clavier.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const spoken = Array.from(event.results || []).map((result: any) => result[0]?.transcript || "").join(" ").trim();
      if (spoken) setInterventionText(current => [current, spoken].filter(Boolean).join(" ").slice(0, 1200));
    };
    recognition.onerror = () => { setError("La reconnaissance vocale a échoué. Vérifiez l’autorisation du microphone."); setIsListening(false); };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setIsListening(true); }
    catch { setIsListening(false); setError("Impossible de démarrer le microphone."); }
  };

  const start = async () => {
    if (!topic.trim() || selectedSources.length === 0) return;
    setError("");
    setTurns([]);
    setLiveText("");
    setSpeaker(null);
    setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/notebook-debate?notebookId=${encodeURIComponent(notebookId)}`);
    wsRef.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "start", topic: topic.trim(), sourceIds: selectedSources, durationMinutes: 10 }));
    socket.onmessage = event => {
      if (typeof event.data !== "string") return;
      let message: any;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "status") setStatus(message.status as Status);
      if (message.type === "document_saved") window.dispatchEvent(new CustomEvent("notebook-generated-docs-changed", { detail: { notebookId } }));
      if (message.type === "intervention_queued") setQueuedIntervention(true);
      if (message.type === "orchestration") setQueuedIntervention(false);
      if (message.type === "speaker") setSpeaker(message.state === "speaking" ? message.speaker : null);
      if (message.type === "transcript" && message.message) {
        setTurns(current => [...current, message.message as DebateTurn]);
        setLiveText("");
      }
      if (message.type === "live_transcript") setLiveText((current) => current + (current ? " " : "") + String(message.text || ""));
      if (message.type === "error") { setError(String(message.error || "Erreur du débat.")); setStatus("error"); }
      if (message.type === "limit_reached") setStatus("stopping");
      if (message.type === "audio" && audioEnabledRef.current) {
        try {
          const context = audioContextRef.current || new AudioContext({ sampleRate: 24000 });
          audioContextRef.current = context;
          if (context.state === "suspended") void context.resume();
          const audioBuffer = pcm16Base64ToBuffer(context, message.data);
          if (audioBuffer) {
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(context.destination);
            const startAt = Math.max(context.currentTime + 0.02, audioCursorRef.current);
            source.start(startAt);
            audioCursorRef.current = startAt + audioBuffer.duration;
          }
        } catch { /* sortie audio indisponible : la transcription reste consultable */ }
      }
    };
    socket.onerror = () => { setError("Connexion au service de débat impossible."); setStatus("error"); };
    socket.onclose = () => {
      if (wsRef.current === socket) wsRef.current = null;
    };
  };

  const sendControl = (type: "pause" | "resume" | "stop") => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type }));
    if (type === "stop") setStatus("stopping");
    if (type === "pause") setStatus("paused");
    if (type === "resume") setStatus("running");
  };

  const isActive = ["connecting", "running", "paused", "stopping"].includes(status);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--notebook-surface)]">
      <div className="flex-shrink-0 border-b border-[var(--notebook-border)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]"><Users className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Débat IA</h2>
            <p className="text-xs text-[var(--text-muted)]">Deux voix, trois rôles, des arguments ancrés dans vos sources</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--notebook-border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]"><ShieldCheck className="h-3 w-3" /> Sources vérifiables</span>
        </div>
      </div>

      {!isActive && status !== "completed" && status !== "stopped" && (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["analyst", "critic", "moderator"] as Speaker[]).map(role => (
                <div key={role} className="rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)] text-sm font-semibold text-[var(--notebook-accent)]">{SPEAKERS[role].initials}</div>
                    <div><div className="text-sm font-semibold text-[var(--text-primary)]">{SPEAKERS[role].label}</div><div className="text-[11px] text-[var(--text-muted)]">{SPEAKERS[role].role}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label htmlFor="debate-topic" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Sujet à débattre</label>
              <textarea id="debate-topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={500} rows={3} placeholder="Ex. : Les sources démontrent-elles réellement que… ?" className="w-full resize-y rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--notebook-accent)]" />
              <div className="mt-1 text-right text-[11px] text-[var(--text-muted)]">{topic.length}/500</div>
            </div>
            <div className="rounded-xl border border-[var(--notebook-border)] p-4">
              <div className="mb-3 flex items-center justify-between"><div className="text-sm font-medium text-[var(--text-primary)]">Sources du débat</div><button type="button" className="text-xs text-[var(--notebook-accent)]" onClick={() => setSelectedSources(selectedSources.length === sources.length ? [] : sources.map(source => source.id))}>{selectedSources.length === sources.length ? "Tout désélectionner" : "Tout sélectionner"}</button></div>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {sources.map(source => (
                  <label key={source.id} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input type="checkbox" checked={selectedSources.includes(source.id)} onChange={event => setSelectedSources(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />
                    <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)]" />
                    <span className="min-w-0 flex-1 truncate">{source.title}</span>
                    {source.indexingStatus === "indexed" ? <span className="text-[10px] text-emerald-500">Indexée</span> : <span className="text-[10px] text-[var(--text-muted)]">{source.indexingStatus || "Statut inconnu"}</span>}
                  </label>
                ))}
                {sources.length === 0 && <p className="text-xs text-[var(--text-muted)]">Ajoutez des sources pour démarrer un débat.</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--notebook-surface-elevated)] p-3 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1"><Radio className="h-3.5 w-3.5" /> Mode hybride</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> 10 minutes maximum</span>
              <span className="inline-flex items-center gap-1"><CirclePause className="h-3.5 w-3.5" /> Pause entre les interventions</span>
            </div>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <button type="button" disabled={!topic.trim() || selectedSources.length === 0 || !sources.length} onClick={() => void start()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--notebook-accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Mic2 className="h-4 w-4" /> Lancer le débat vocal</button>
          </div>
        </div>
      )}

      {(isActive || status === "completed" || status === "stopped") && (
        <>
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--notebook-border)] px-5 py-3">
            <div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--text-primary)]">{topic}</div><div className="text-xs text-[var(--text-muted)]">{status === "connecting" ? "Connexion aux voix…" : status === "paused" ? "Débat en pause" : status === "completed" ? "Débat terminé" : status === "stopped" ? "Débat arrêté" : "Débat en cours"}</div></div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button type="button" onClick={() => setAudioEnabled(value => !value)} className="rounded-lg border border-[var(--notebook-border)] px-2.5 py-2 text-xs text-[var(--text-secondary)]">{audioEnabled ? "Audio activé" : "Audio coupé"}</button>
              {status === "paused" ? <button type="button" onClick={() => sendControl("resume")} className="rounded-lg bg-[var(--notebook-accent)] p-2 text-white" aria-label="Reprendre"><CirclePlay className="h-4 w-4" /></button> : isActive && status !== "stopping" ? <button type="button" onClick={() => sendControl("pause")} className="rounded-lg border border-[var(--notebook-border)] p-2 text-[var(--text-primary)]" aria-label="Mettre en pause"><CirclePause className="h-4 w-4" /></button> : null}
              {isActive && <button type="button" onClick={() => sendControl("stop")} className="rounded-lg border border-red-500/30 p-2 text-red-500" aria-label="Arrêter"><Square className="h-4 w-4" /></button>}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-2">
              {(["analyst", "critic", "moderator"] as Speaker[]).map(role => <div key={role} className={`rounded-xl border p-2.5 text-center ${speaker === role ? "border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)]" : "border-[var(--notebook-border)]"}`}><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--notebook-surface-elevated)] text-xs font-semibold text-[var(--text-primary)]">{SPEAKERS[role].initials}</div><div className="text-xs font-semibold text-[var(--text-primary)]">{SPEAKERS[role].label}</div><div className="text-[10px] text-[var(--text-muted)]">{speaker === role ? "Parle…" : "En attente"}</div></div>)}
            </div>
            {turns.map((turn, index) => <article key={`${turn.speaker}-${turn.at}-${index}`} className="rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-[var(--notebook-accent)]">{SPEAKERS[turn.speaker].label}</span><time className="text-[10px] text-[var(--text-muted)]">{new Date(turn.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time></div><p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{turn.text}</p><div className="mt-3 flex flex-wrap gap-1.5">{turn.citations.map(citation => <button key={citation.chunkId} type="button" onClick={() => onOpenSource?.(citation.sourceId)} title={citation.excerpt} className="rounded-md border border-[var(--notebook-border)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:border-[var(--notebook-accent)]">{citation.sourceTitle}</button>)}</div></article>)}
            {liveText && <div className="rounded-xl border border-[var(--notebook-accent)]/40 p-4"><div className="mb-1 text-xs font-semibold text-[var(--notebook-accent)]">{speaker ? SPEAKERS[speaker].label : "Transcription en direct"}</div><p className="text-sm text-[var(--text-secondary)]">{liveText}</p></div>}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <div ref={turnsEndRef} />
          </div>
          {isActive && <div className="flex-shrink-0 border-t border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium text-[var(--text-secondary)]">Intervenir dans le débat</span><span className="text-[10px] text-[var(--text-muted)]">{queuedIntervention ? "Intervention en attente de traitement" : "Votre question sera traitée au prochain tour"}</span></div>
            <div className="flex items-end gap-2">
              <button type="button" onClick={toggleDictation} aria-label={isListening ? "Arrêter la dictée" : "Dicter une intervention"} title={isListening ? "Arrêter la dictée" : "Dicter une intervention"} className={\`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border \${isListening ? "border-red-500 bg-red-500/10 text-red-500" : "border-[var(--notebook-border)] text-[var(--text-secondary)]"}\`}>{isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
              <textarea value={interventionText} onChange={event => setInterventionText(event.target.value.slice(0, 1200))} rows={2} maxLength={1200} placeholder="Posez une question aux deux IA… ou utilisez le microphone" className="min-h-[40px] max-h-24 min-w-0 flex-1 resize-y rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--notebook-accent)]" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendIntervention(); } }} />
              <button type="button" disabled={!interventionText.trim()} onClick={sendIntervention} aria-label="Envoyer l’intervention" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--notebook-accent)] text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
          </div>}
          {!isActive && <div className="flex-shrink-0 border-t border-[var(--notebook-border)] p-3"><button type="button" onClick={() => { stopSocket(); setStatus("setup"); setTurns([]); setLiveText(""); setError(""); }} className="w-full rounded-lg border border-[var(--notebook-border)] px-3 py-2 text-sm text-[var(--text-secondary)]">Préparer un nouveau débat</button></div>}
        </>
      )}
    </div>
  );
}

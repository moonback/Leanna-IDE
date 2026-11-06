import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2, Loader2, RotateCcw } from "lucide-react";
import { useProfile } from "../context/UserProfileContext.js";

type DuoMessage = { speaker: "leanna" | "roxane"; name: string; text: string; audio?: string | null };
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: any) => void) | null; onerror: ((event: any) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void;
};

function playPcm24k(base64: string, context: AudioContext, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return resolve();
    const binary = atob(base64);
    const pcm = new Int16Array(binary.length / 2);
    for (let i = 0; i < pcm.length; i++) {
      const lo = binary.charCodeAt(i * 2);
      const hi = binary.charCodeAt(i * 2 + 1);
      pcm[i] = (hi << 8) | lo;
    }
    const buffer = context.createBuffer(1, pcm.length, 24_000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const finish = () => { signal.removeEventListener("abort", stop); resolve(); };
    const stop = () => { try { source.stop(); } catch { /* déjà arrêté */ } finish(); };
    signal.addEventListener("abort", stop, { once: true });
    source.onended = finish;
    source.start();
  });
}

export default function VoiceDuoView() {
  const { profile } = useProfile();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Prêt à démarrer");
  const [messages, setMessages] = useState<DuoMessage[]>([]);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Array<{speaker:"user"|"leanna"|"roxane";text:string}>>([]);
  const activeRef = useRef(false);
  const busyRef = useRef(false);

  const stopPlayback = useCallback(() => {
    playbackRef.current?.abort();
    playbackRef.current = null;
  }, []);

  const speak = useCallback(async (items: DuoMessage[]) => {
    const context = audioContextRef.current || new AudioContext({ sampleRate: 24_000 });
    audioContextRef.current = context;
    if (context.state === "suspended") await context.resume();
    const controller = new AbortController();
    playbackRef.current = controller;
    for (const item of items) {
      if (controller.signal.aborted || !activeRef.current) break;
      setStatus(`${item.name} parle…`);
      if (item.audio) {
        try { await playPcm24k(item.audio, context, controller.signal); }
        catch (e) { if (!controller.signal.aborted) throw e; }
      } else if (!controller.signal.aborted) {
        // Fallback accessible si le provider TTS est indisponible.
        const utterance = new SpeechSynthesisUtterance(item.text);
        utterance.lang = profile.language === "fr" ? "fr-FR" : profile.language || "fr-FR";
        window.speechSynthesis.speak(utterance);
        await new Promise<void>(resolve => { utterance.onend = () => resolve(); utterance.onerror = () => resolve(); });
      }
    }
    if (playbackRef.current === controller) playbackRef.current = null;
  }, [profile.language]);

  const handleUtterance = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || !activeRef.current) return;
    stopPlayback();
    window.speechSynthesis?.cancel();
    historyRef.current.push({ speaker: "user", text });
    historyRef.current = historyRef.current.slice(-20);
    setMessages(prev => [...prev, { speaker: "leanna", name: "Vous", text } as DuoMessage]);
    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus("Leanna et Roxane réfléchissent…");
    try {
      const response = await fetch("/api/voice-duo/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyRef.current, maxTurns: 2, includeAudio: true, language: profile.language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur du dialogue vocal");
      const generated = (data.messages || []) as DuoMessage[];
      if (!activeRef.current) return;
      for (const item of generated) historyRef.current.push({ speaker: item.speaker, text: item.text });
      historyRef.current = historyRef.current.slice(-20);
      setMessages(prev => [...prev, ...generated]);
      await speak(generated);
      if (activeRef.current) setStatus("À votre écoute — vous pouvez interrompre à tout moment");
    } catch (e) {
      if (activeRef.current) {
        const message = e instanceof Error ? e.message : "Erreur inconnue";
        setError(message);
        setStatus("Une erreur est survenue");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [profile.language, speak, stopPlayback]);

  const start = useCallback(async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("La reconnaissance vocale n'est pas disponible dans ce navigateur. Utilisez Chrome ou Edge.");
      return;
    }
    try {
      const context = audioContextRef.current || new AudioContext({ sampleRate: 24_000 });
      audioContextRef.current = context;
      await context.resume();
      const recognition = new SpeechRecognition() as SpeechRecognitionLike;
      recognition.lang = profile.language === "fr" ? "fr-FR" : profile.language || "fr-FR";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = event => {
        const result = event.results?.[event.results.length - 1];
        const transcript = result?.[0]?.transcript;
        if (transcript) void handleUtterance(transcript);
      };
      recognition.onerror = event => {
        if (event.error !== "no-speech" && event.error !== "aborted") setError(`Micro : ${event.error}`);
      };
      recognition.onend = () => {
        if (activeRef.current) {
          try { recognition.start(); } catch { /* une reprise est déjà en cours */ }
        }
      };
      recognitionRef.current = recognition;
      activeRef.current = true;
      setActive(true);
      setError("");
      setStatus("À votre écoute — parlez naturellement");
      recognition.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'activer le microphone");
    }
  }, [handleUtterance, profile.language]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopPlayback();
    window.speechSynthesis?.cancel();
    setBusy(false);
    busyRef.current = false;
    setStatus("Conversation arrêtée");
  }, [stopPlayback]);

  const reset = useCallback(() => {
    stopPlayback();
    historyRef.current = [];
    setMessages([]);
    setError("");
    setStatus(activeRef.current ? "À votre écoute — parlez naturellement" : "Prêt à démarrer");
  }, [stopPlayback]);

  useEffect(() => () => {
    activeRef.current = false;
    recognitionRef.current?.stop();
    stopPlayback();
    window.speechSynthesis?.cancel();
    void audioContextRef.current?.close();
  }, [stopPlayback]);

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col gap-5 overflow-hidden p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Conversation multi-IA</p>
          <h1 className="mt-1 text-2xl font-bold">Leanna <span className="text-[var(--text-muted)]">×</span> {profile.duoName || "Roxane"}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Deux regards indépendants, une conversation vivante avec vous.</p>
        </div>
        <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-base)] px-3 py-2 text-sm">
          <RotateCcw size={15}/> Réinitialiser
        </button>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-secondary)] p-4">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-subtle)] text-[var(--accent-primary)]"><Volume2 size={19}/></div><div><p className="font-semibold">{profile.aiName || "Leanna"}</p><p className="text-xs text-[var(--text-muted)]">Voix : {profile.aiVoice || "Aoede"}</p></div></div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Assistante principale · synthèse, coordination et décisions</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-secondary)] p-4">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-purple-500/10 text-purple-400"><Volume2 size={19}/></div><div><p className="font-semibold">{profile.duoName || "Roxane"}</p><p className="text-xs text-[var(--text-muted)]">Voix : {profile.duoVoice || "Kore"}</p></div></div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Perspective indépendante · critique et alternatives</p>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-base)] px-4 py-3">
          <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500 animate-pulse" : "bg-[var(--text-muted)]"}`}/><span className="text-sm text-[var(--text-muted)]">{status}</span></div>
          <span className="text-xs text-[var(--text-muted)]">{messages.length} interventions</span>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && <div className="grid h-full min-h-48 place-items-center text-center"><div><div className="mb-3 text-4xl">🎙️</div><p className="font-medium">Lancez la conversation</p><p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">Posez une question. Leanna et Roxane répondront chacune avec leur propre voix et pourront confronter leurs points de vue.</p></div></div>}
          {messages.map((item, index) => <article key={index} className={`max-w-[90%] rounded-xl p-3 ${item.name === "Vous" ? "ml-auto bg-[var(--accent-subtle)]" : "bg-[var(--bg-secondary)]"}`}><p className="mb-1 text-xs font-semibold text-[var(--accent-primary)]">{item.name}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p></article>)}
        </div>
        {error && <p role="alert" className="border-t border-red-500/20 px-4 py-2 text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-center gap-3 border-t border-[var(--border-base)] p-4">
          {!active ? <button onClick={() => void start()} className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-primary)] px-6 py-3 font-semibold text-white"><Mic size={18}/> Démarrer la conversation</button> : <button onClick={stop} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 font-semibold text-white"><PhoneOff size={18}/> Terminer</button>}
          {busy && <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 size={15} className="animate-spin"/> Réponse en cours</span>}
          {active && <button onClick={() => { stopPlayback(); window.speechSynthesis?.cancel(); setStatus("Intervention interrompue — à vous la parole"); }} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-base)] px-4 py-3 text-sm"><MicOff size={16}/> Interrompre</button>}
        </div>
      </section>
      <p className="text-center text-xs text-[var(--text-muted)]">Le microphone reste actif pendant la conversation. Les échanges autonomes sont limités à deux prises de parole par intervention pour maîtriser la latence et les coûts.</p>
    </main>
  );
}

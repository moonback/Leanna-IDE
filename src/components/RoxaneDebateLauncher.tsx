import { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, Send, Sparkles, Square, Users, X } from 'lucide-react';

type Turn = { id: string; speaker: 'leanna' | 'roxane' | 'user'; text: string; round: number };

export function RoxaneDebateLauncher() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [liveStatus, setLiveStatus] = useState('idle');
  const [liveTurns, setLiveTurns] = useState<Turn[]>([]);
  const [interjection, setInterjection] = useState('');
  const [approvedTasks, setApprovedTasks] = useState('');
  const [missionStatus, setMissionStatus] = useState('');
  const liveSocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioScheduleRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openPanel = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail?.topic === 'string') setTopic(detail.topic);
      if (typeof detail?.context === 'string') setContext(detail.context);
      setOpen(true);
    };
    window.addEventListener('Leanna-start-roxane-debate', openPanel);
    return () => window.removeEventListener('Leanna-start-roxane-debate', openPanel);
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.stop?.();
    liveSocketRef.current?.close();
    void audioContextRef.current?.close();
  }, []);

  const startRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('La reconnaissance vocale n’est pas disponible dans ce navigateur.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results).map((r: any) => r[0]?.transcript || '').join(' ');
      setTopic(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError('La reconnaissance vocale a échoué.'); };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const run = async () => {
    setError(''); setLiveTurns([]); setApprovedTasks(''); setMissionStatus(''); setBusy(true); setLiveStatus('connecting');
    try {
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${scheme}//${window.location.host}/roxane-live`);
      liveSocketRef.current = socket;
      socket.onopen = () => socket.send(JSON.stringify({ type: 'start', topic, context }));
      socket.onmessage = event => {
        let msg: any; try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type === 'status') setLiveStatus(msg.status);
        if (msg.type === 'ready') { setBusy(false); setLiveStatus('live'); }
        if (msg.type === 'error') { setError(msg.message || 'Erreur Live'); setBusy(false); setLiveStatus('error'); }
        if (msg.type === 'transcript_delta' && typeof msg.text === 'string') {
          setLiveTurns(prev => {
            const last = prev[prev.length - 1];
            if (last?.speaker === msg.speaker) return [...prev.slice(0, -1), { ...last, text: last.text + msg.text }];
            return [...prev, { id: `${Date.now()}-${prev.length}`, speaker: msg.speaker, text: msg.text, round: 1 }];
          });
        }
        if (msg.type === 'turn_complete') setLiveTurns(prev => {
          const last = prev[prev.length - 1];
          if (last?.speaker === msg.speaker) return [...prev.slice(0, -1), { ...last, text: msg.text || last.text, round: msg.round || 1 }];
          return [...prev, { id: `${Date.now()}-${prev.length}`, speaker: msg.speaker, text: msg.text || '', round: msg.round || 1 }];
        });
        if (msg.type === 'audio' && typeof msg.data === 'string') {
          try {
            const binary = atob(msg.data); const samples = new Int16Array(binary.length / 2);
            for (let i = 0; i < samples.length; i++) samples[i] = (binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8));
            const ctx = audioContextRef.current ?? new AudioContext({ sampleRate: 24000 }); audioContextRef.current = ctx;
            const buffer = ctx.createBuffer(1, samples.length, 24000); const channel = buffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
            const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
            const at = Math.max(ctx.currentTime + 0.025, audioScheduleRef.current); source.start(at);
            audioScheduleRef.current = at + buffer.duration; setSpeaking(true);
            source.onended = () => { if (ctx.currentTime >= audioScheduleRef.current - 0.04) setSpeaking(false); };
          } catch (e) { console.warn('[RoxaneLive] Audio decode failed', e); }
        }
        if (msg.type === 'debate_complete') { setBusy(false); setLiveStatus('complete'); }
        if (msg.type === 'interrupted_by_user') { setBusy(false); setSpeaking(false); setLiveStatus('interrupted'); }
      };
      socket.onerror = () => { setError('Connexion WebSocket Roxane impossible.'); setBusy(false); setLiveStatus('error'); };
      socket.onclose = () => setBusy(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur inconnue'); setBusy(false); setLiveStatus('error'); }
  };

  const sendInterjection = () => {
    const text = interjection.trim(); if (!text) return;
    if (liveSocketRef.current?.readyState === WebSocket.OPEN) {
      liveSocketRef.current.send(JSON.stringify({ type: 'user_interjection', text }));
      setLiveTurns(prev => [...prev, { id: String(Date.now()), speaker: 'user', text, round: 0 }]);
      setInterjection('');
    }
  };

  const createApprovedMissions = async () => {
    const tasks = approvedTasks.split(/\\r?\\n/).map(line => line.trim()).filter(Boolean).slice(0, 5)
      .map(title => ({ title: title.slice(0, 160), description: title, priority: 'medium' }));
    if (tasks.length === 0) { setMissionStatus('Ajoute au moins une tâche, une par ligne.'); return; }
    setMissionStatus('Création des missions…');
    try {
      const response = await fetch('/api/debate/decisions/create-missions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true, tasks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Création impossible');
      setMissionStatus(`${data.created?.length || 0} mission(s) créée(s). ${data.failed?.length ? `${data.failed.length} échec(s).` : ''}`);
    } catch (e) { setMissionStatus(e instanceof Error ? e.message : 'Erreur lors de la création'); }
  };

  const stopLive = () => {
    if (liveSocketRef.current?.readyState === WebSocket.OPEN) liveSocketRef.current.send(JSON.stringify({ type: 'interrupt' }));
    liveSocketRef.current?.close(); liveSocketRef.current = null;
    audioScheduleRef.current = 0; void audioContextRef.current?.close(); audioContextRef.current = null;
    setBusy(false); setSpeaking(false); setLiveStatus('interrupted');
  };

  const close = () => { stopLive(); recognitionRef.current?.stop?.(); setListening(false); setOpen(false); };

  return <>
    <button type="button" onClick={() => { setOpen(true); setLiveStatus('idle'); }} title="Débattre avec Roxane" aria-label="Ouvrir le débat Roxane" className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-xl transition-transform hover:scale-[1.03]" style={{ background: 'linear-gradient(135deg,#49318b,#7650c9)', borderColor: 'rgba(196,181,253,.35)', color: '#fff' }}>
      <Users className="h-4 w-4"/><span>Roxane</span><AudioLines className="h-4 w-4"/>
    </button>
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Débat Leanna et Roxane">
      <div ref={panelRef} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>
        <header className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-3"><div className="rounded-xl bg-violet-500/15 p-2 text-violet-400"><Sparkles className="h-5 w-5"/></div><div><h2 className="font-semibold">Débat vocal · Leanna × Roxane</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Deux analyses indépendantes, une décision humaine.</p></div></div>
          <button onClick={close} aria-label="Fermer"><X className="h-5 w-5"/></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!result && liveStatus === 'idle' && <><label className="block space-y-2 text-sm font-medium">Quel sujet veux-tu débattre ?<textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ex. : Faut-il refondre l’architecture mémoire de mon projet ?" className="min-h-24 w-full rounded-xl border p-3 text-sm outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}/></label><label className="block space-y-2 text-sm">Contexte de la conversation (facultatif)<textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Colle ici les éléments de la conversation à transmettre aux deux IA…" className="min-h-24 w-full rounded-xl border p-3 text-sm outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}/></label><div className="flex flex-wrap gap-2"><button onClick={startRecognition} disabled={listening || busy} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-base)' }}><Mic className="h-4 w-4"/>Dicter le sujet</button>{listening && <button onClick={() => recognitionRef.current?.stop?.()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"><MicOff className="h-4 w-4"/>Arrêter la dictée</button>}</div></>}
          {busy && <div className="rounded-xl p-5 text-center text-sm" style={{ background: 'var(--bg-secondary)' }}><AudioLines className="mx-auto mb-2 h-6 w-6 animate-pulse text-violet-400"/>Connexion des deux sessions Gemini Live…</div>}
          {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          {liveTurns.length > 0 && <section className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">Conversation en direct</h3><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{liveStatus === 'complete' ? 'Débat terminé' : liveStatus === 'interrupted' ? 'Interrompu' : 'Gemini Live'}</span></div>
            {liveTurns.map(turn => <article key={turn.id} className="rounded-xl border p-4" style={{ borderColor: turn.speaker === 'roxane' ? 'rgba(167,139,250,.35)' : turn.speaker === 'user' ? 'rgba(16,185,129,.35)' : 'rgba(56,189,248,.35)', background: 'var(--bg-secondary)' }}>
              <div className="mb-2 text-xs font-bold" style={{ color: turn.speaker === 'roxane' ? '#a78bfa' : turn.speaker === 'user' ? '#10b981' : '#38bdf8' }}>{turn.speaker === 'roxane' ? 'ROXANE' : turn.speaker === 'user' ? 'TOI' : 'LEANNA'}</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
            </article>)}
            {liveStatus === 'complete' && <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: 'rgba(16,185,129,.35)' }}>
              <h4 className="text-sm font-semibold">Valider des tâches dans Mission System</h4>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Relis les échanges, puis saisis les tâches que tu approuves, une par ligne. Rien n’est créé sans ce clic explicite.</p>
              <textarea value={approvedTasks} onChange={e => setApprovedTasks(e.target.value)} placeholder="Ex. : Auditer les dépendances du module vocal&#10;Ajouter les tests d'interruption audio" className="min-h-20 w-full rounded-xl border p-3 text-sm" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}/>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{missionStatus}</span><button onClick={createApprovedMissions} disabled={!approvedTasks.trim()} className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: '#059669' }}>Approuver et créer les missions</button></div>
            </div>}
            {liveStatus !== 'complete' && liveStatus !== 'interrupted' && <div className="flex gap-2"><input value={interjection} onChange={e => setInterjection(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendInterjection(); }} placeholder="Interromps et donne ton avis…" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}/><button onClick={sendInterjection} disabled={!interjection.trim()} className="rounded-xl px-3 py-2 text-white" style={{ background: '#7650c9' }}><Send className="h-4 w-4"/></button></div>}
          </section>}

        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>{speaking ? <><AudioLines className="h-4 w-4 text-violet-400"/>Lecture Live</> : liveStatus === 'live' ? 'Deux sessions Live connectées' : 'Intervention utilisateur prioritaire'}</div>
          <div className="flex gap-2">{(busy || liveStatus === 'live') && <button onClick={stopLive} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-base)' }}><Square className="h-3.5 w-3.5"/>Arrêter le débat</button>}<button onClick={close} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-base)' }}>Fermer</button>{liveStatus === 'idle' && <button onClick={run} disabled={busy || !topic.trim()} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: '#7650c9' }}><Send className="h-3.5 w-3.5"/>{busy ? 'Connexion…' : 'Lancer le débat vocal'}</button>}</div>
        </footer>
      </div>
    </div>}
  </>;
}

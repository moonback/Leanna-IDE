import { useEffect, useRef, useState } from 'react';
import { AudioLines, Check, Mic, MicOff, Pause, Play, Send, Sparkles, Square, Users, X } from 'lucide-react';

type Turn = { id: string; speaker: 'leanna' | 'roxane' | 'user'; text: string; round: number };
type Result = { id: string; topic: string; turns: Turn[]; synthesis: string; status: string; durationMs: number };

export function RoxaneDebateLauncher() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
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

  useEffect(() => () => { window.speechSynthesis?.cancel(); recognitionRef.current?.stop?.(); }, []);

  const speak = (text: string, speaker: 'leanna' | 'roxane') => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = speaker === 'roxane' ? 0.98 : 1.03;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /fr/i.test(v.lang) && (speaker === 'roxane' ? /female|audrey|hortense|amelie/i.test(v.name) : /female|julie|marie/i.test(v.name)));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

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
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const response = await fetch('/api/debate/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, context }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Le débat n’a pas pu démarrer.');
      setResult(data);
      const first = data.turns?.[0];
      if (first) speak(first.text, first.speaker);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur inconnue'); }
    finally { setBusy(false); }
  };

  const stopSpeech = () => { window.speechSynthesis?.cancel(); setSpeaking(false); };
  const close = () => { stopSpeech(); recognitionRef.current?.stop?.(); setListening(false); setOpen(false); };

  return <>
    <button type="button" onClick={() => setOpen(true)} title="Débattre avec Roxane" aria-label="Ouvrir le débat Roxane" className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-xl transition-transform hover:scale-[1.03]" style={{ background: 'linear-gradient(135deg,#49318b,#7650c9)', borderColor: 'rgba(196,181,253,.35)', color: '#fff' }}>
      <Users className="h-4 w-4"/><span>Roxane</span><AudioLines className="h-4 w-4"/>
    </button>
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Débat Leanna et Roxane">
      <div ref={panelRef} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>
        <header className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-3"><div className="rounded-xl bg-violet-500/15 p-2 text-violet-400"><Sparkles className="h-5 w-5"/></div><div><h2 className="font-semibold">Débat vocal · Leanna × Roxane</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Deux analyses indépendantes, une décision humaine.</p></div></div>
          <button onClick={close} aria-label="Fermer"><X className="h-5 w-5"/></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!result && <><label className="block space-y-2 text-sm font-medium">Quel sujet veux-tu débattre ?<textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ex. : Faut-il refondre l’architecture mémoire de mon projet ?" className="min-h-24 w-full rounded-xl border p-3 text-sm outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}/></label><label className="block space-y-2 text-sm">Contexte de la conversation (facultatif)<textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Colle ici les éléments de la conversation à transmettre aux deux IA…" className="min-h-24 w-full rounded-xl border p-3 text-sm outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}/></label><div className="flex flex-wrap gap-2"><button onClick={startRecognition} disabled={listening || busy} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-base)' }}><Mic className="h-4 w-4"/>Dicter le sujet</button>{listening && <button onClick={() => recognitionRef.current?.stop?.()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"><MicOff className="h-4 w-4"/>Arrêter la dictée</button>}</div></>}
          {busy && <div className="rounded-xl p-5 text-center text-sm" style={{ background: 'var(--bg-secondary)' }}><AudioLines className="mx-auto mb-2 h-6 w-6 animate-pulse text-violet-400"/>Leanna et Roxane préparent leurs analyses indépendantes puis débattent…</div>}
          {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          {result && <><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Sujet du débat</p><h3 className="font-semibold">{result.topic}</h3></div><button onClick={() => { setResult(null); setTopic(result.topic); }} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-base)' }}>Nouveau débat</button></div><div className="space-y-3">{result.turns.map(turn => <article key={turn.id} className="rounded-xl border p-4" style={{ borderColor: turn.speaker === 'roxane' ? 'rgba(167,139,250,.35)' : 'rgba(56,189,248,.35)', background: 'var(--bg-secondary)' }}><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold" style={{ color: turn.speaker === 'roxane' ? '#a78bfa' : '#38bdf8' }}>{turn.speaker === 'roxane' ? 'ROXANE' : 'LEANNA'} · Tour {turn.round}</span><button onClick={() => speak(turn.text, turn.speaker)} className="text-xs">Écouter</button></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p></article>)}</div><section className="rounded-xl border p-4" style={{ borderColor: 'rgba(16,185,129,.35)', background: 'rgba(16,185,129,.06)' }}><h3 className="mb-2 flex items-center gap-2 font-semibold"><Check className="h-4 w-4 text-emerald-400"/>Synthèse proposée</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{result.synthesis}</p><p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>Cette synthèse est une proposition. Aucune tâche n'est exécutée et aucune décision n'est validée automatiquement.</p></section></>}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>{speaking ? <><AudioLines className="h-4 w-4 text-violet-400"/>Lecture vocale</> : 'Intervention utilisateur prioritaire'}</div>
          <div className="flex gap-2">{speaking && <button onClick={stopSpeech} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-base)' }}><Square className="h-3.5 w-3.5"/>Interrompre</button>}<button onClick={close} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-base)' }}>Fermer</button>{!result && <button onClick={run} disabled={busy || !topic.trim()} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: '#7650c9' }}><Send className="h-3.5 w-3.5"/>{busy ? 'Débat en cours…' : 'Lancer le débat'}</button>}</div>
        </footer>
      </div>
    </div>}
  </>;
}

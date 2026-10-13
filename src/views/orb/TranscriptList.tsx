import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, MessageSquare, Trash2 } from 'lucide-react';
import type { TranscriptEntry } from '../../hooks/useTranscript.js';

function formatTime(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Historique de conversation de la session live (onglet « Conversation » du drawer). */
export function TranscriptList({ entries, aiName, onClear, reduceMotion }: {
  entries: TranscriptEntry[]; aiName: string; onClear: () => void; reduceMotion: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const visible = entries.slice(-60);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' });
  }, [entries.length, reduceMotion]);

  const copy = (e: TranscriptEntry) => {
    navigator.clipboard?.writeText(e.text).then(() => {
      setCopied(e.id);
      setTimeout(() => setCopied(c => (c === e.id ? null : c)), 1400);
    }).catch(() => { /* ignore */ });
  };

  if (visible.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
          <MessageSquare className="h-4 w-4" />
        </span>
        <p className="max-w-[220px] text-xs leading-relaxed">La conversation apparaîtra ici dès que tu parleras à {aiName}.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs" style={{ color: 'var(--text-dimmed)' }}>{entries.length} messages</span>
        <button type="button" onClick={onClear} title="Effacer la conversation"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
          style={{ color: 'var(--text-muted)' }}>
          <Trash2 className="h-3 w-3" />Effacer
        </button>
      </div>
      {visible.map(e => {
        const mine = e.role === 'user';
        return (
          <motion.div key={e.id} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`group flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>
              <span className="font-semibold" style={{ color: mine ? 'var(--color-accent-alt)' : 'var(--accent-primary)' }}>{mine ? 'Toi' : aiName}</span>
              <span>{formatTime(e.timestamp)}</span>
              <button type="button" onClick={() => copy(e)} title="Copier" aria-label="Copier le message"
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none">
                {copied === e.id ? <Check className="h-3 w-3" style={{ color: 'var(--color-success)' }} /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-xs leading-relaxed"
              style={{
                backgroundColor: mine ? 'var(--accent-subtle)' : 'var(--bg-panel)',
                border: `1px solid ${mine ? 'color-mix(in srgb, var(--accent-primary) 30%, transparent)' : 'var(--border-base)'}`,
                color: 'var(--text-primary)',
                borderTopRightRadius: mine ? 6 : undefined,
                borderTopLeftRadius: mine ? undefined : 6,
              }}>
              {e.pending === 'image' ? 'Génération d\'image en cours…' : e.pending === 'image-error' ? `Échec : ${e.imageError ?? 'image'}` : e.text}
            </div>
          </motion.div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

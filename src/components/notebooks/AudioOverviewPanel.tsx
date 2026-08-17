/**
 * AudioOverviewPanel — Génération et lecture de podcasts IA
 */

import { useState, useCallback } from 'react';
import { Mic, Play, Loader2, Clock, Users } from 'lucide-react';
import { useToast } from '../ui/Toast';

interface AudioOverview {
  id: string;
  title: string;
  script: string;
  estimatedDuration: number;
  status: 'generating' | 'ready' | 'error';
  createdAt: string;
}

interface Props {
  notebookId: string;
  overviews: AudioOverview[];
  onRefresh: () => void;
}

export function AudioOverviewPanel({ notebookId, overviews, onRefresh }: Props) {
  const { success, error: toastError } = useToast();
  const [generating, setGenerating] = useState(false);
  const [selectedOverview, setSelectedOverview] = useState<AudioOverview | null>(null);
  const [duration, setDuration] = useState<'short' | 'medium' | 'long'>('medium');

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/audio-overview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.overview.status === 'ready') {
        success('Audio Overview généré !');
        setSelectedOverview(data.overview);
      } else {
        toastError('Erreur lors de la génération');
      }
      onRefresh();
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setGenerating(false);
    }
  }, [notebookId, duration, success, toastError, onRefresh]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left: Generator + list */}
      <div className="w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r overflow-y-auto custom-scrollbar p-5 space-y-4"
        style={{ borderColor: 'var(--border-base)' }}>

        {/* Generator */}
        <div className="p-4 rounded-2xl border space-y-4"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Audio Overview
            </p>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Génère un script de podcast : deux hôtes discutent du contenu de vos sources
            dans un format engageant et accessible.
          </p>

          {/* Duration selector */}
          <div className="space-y-1">
            <p className="text-[9px] font-medium" style={{ color: 'var(--text-dimmed)' }}>Durée</p>
            <div className="flex gap-2">
              {([
                { key: 'short' as const, label: '~5 min' },
                { key: 'medium' as const, label: '~10 min' },
                { key: 'long' as const, label: '~15 min' },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setDuration(opt.key)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all"
                  style={{
                    backgroundColor: duration === opt.key ? 'var(--accent-subtle)' : 'var(--bg-base)',
                    color: duration === opt.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                    border: `1px solid ${duration === opt.key ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
          >
            {generating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                Générer le podcast
              </>
            )}
          </button>
        </div>

        {/* Previous overviews */}
        {overviews.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              Podcasts ({overviews.length})
            </p>
            {overviews.map(ov => (
              <button
                key={ov.id}
                onClick={() => setSelectedOverview(ov)}
                className={`w-full p-3 rounded-xl border text-left transition-all ${selectedOverview?.id === ov.id ? 'border-[var(--accent-primary)]' : ''}`}
                style={{ borderColor: selectedOverview?.id === ov.id ? 'var(--accent-primary)' : 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
              >
                <div className="flex items-center gap-2">
                  <Play className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                  <p className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {ov.title}
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[9px] flex items-center gap-1" style={{ color: 'var(--text-dimmed)' }}>
                    <Clock className="w-2.5 h-2.5" />
                    {formatDuration(ov.estimatedDuration)}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${ov.status === 'ready' ? 'bg-green-500/10 text-green-400' : ov.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {ov.status === 'ready' ? 'Prêt' : ov.status === 'error' ? 'Erreur' : 'En cours'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Script viewer */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {selectedOverview ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedOverview.title}
                </h2>
                <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                  Durée estimée : {formatDuration(selectedOverview.estimatedDuration)}
                </p>
              </div>
            </div>

            {/* Script */}
            <div className="space-y-3">
              {selectedOverview.script.split('\n').map((line, i) => {
                const isAlex = line.trim().startsWith('Alex:') || line.trim().startsWith('Alex :');
                const isSam = line.trim().startsWith('Sam:') || line.trim().startsWith('Sam :');

                if (isAlex || isSam) {
                  const speaker = isAlex ? 'Alex' : 'Sam';
                  const text = line.replace(/^(Alex|Sam)\s*:\s*/i, '');
                  return (
                    <div key={i} className={`flex gap-3 ${isAlex ? '' : 'flex-row-reverse'}`}>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{
                          backgroundColor: isAlex ? '#60a5fa20' : '#34d39920',
                          color: isAlex ? '#60a5fa' : '#34d399',
                        }}
                      >
                        {speaker[0]}
                      </div>
                      <div
                        className={`max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed ${isAlex ? 'rounded-tl-md' : 'rounded-tr-md'}`}
                        style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                      >
                        {text}
                      </div>
                    </div>
                  );
                }

                if (!line.trim()) return null;
                return (
                  <p key={i} className="text-[10px] italic text-center py-1" style={{ color: 'var(--text-dimmed)' }}>
                    {line}
                  </p>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Mic className="w-8 h-8" style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-xs text-center max-w-sm" style={{ color: 'var(--text-dimmed)' }}>
              Générez un Audio Overview pour obtenir un script de podcast
              où deux hôtes discutent du contenu de vos sources.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

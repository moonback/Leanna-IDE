/**
 * AudioOverviewPanel — Génération et lecture de podcasts IA
 *
 * UI améliorée avec meilleur layout, animations, et feedback visuel.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Play, Loader2, Clock, Users, Radio, Pause, Download, Trash2, RefreshCw } from 'lucide-react';
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
  const [downloading, setDownloading] = useState(false);
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

  const handleDownloadToWorkspace = useCallback(async () => {
    if (!selectedOverview) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/notebooks/${notebookId}/audio-overviews/${selectedOverview.id}/export?save=true`
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      success(`Script sauvegardé : ${data.filePath}`);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setDownloading(false);
    }
  }, [notebookId, selectedOverview, success, toastError]);

  const handleDelete = useCallback(async (overviewId: string) => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/audio-overviews/${overviewId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      success('Audio overview supprimé');
      if (selectedOverview?.id === overviewId) {
        setSelectedOverview(null);
      }
      onRefresh();
    } catch (e: any) {
      toastError(e.message);
    }
  }, [notebookId, selectedOverview, success, toastError, onRefresh]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedOverview) return;
    // Supprimer l'ancien puis régénérer
    try {
      await fetch(`/api/notebooks/${notebookId}/audio-overviews/${selectedOverview.id}`, {
        method: 'DELETE',
      });
    } catch {}
    setSelectedOverview(null);
    // Lancer la génération
    handleGenerate();
  }, [notebookId, selectedOverview, handleGenerate]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left: Generator + list */}
      <div
        className="w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r overflow-y-auto custom-scrollbar p-5 space-y-5"
        style={{ borderColor: 'var(--border-base)' }}
      >
        {/* Generator card */}
        <div
          className="p-5 rounded-2xl border space-y-4"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Mic className="w-4.5 h-4.5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                Audio Overview
              </p>
              <p className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                Script de podcast IA
              </p>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Génère un script conversationnel : deux hôtes discutent du contenu de vos sources
            dans un format engageant et accessible.
          </p>

          {/* Duration selector */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold" style={{ color: 'var(--text-dimmed)' }}>Durée cible</p>
            <div className="flex gap-2">
              {([
                { key: 'short' as const, label: '~5 min', icon: '⚡' },
                { key: 'medium' as const, label: '~10 min', icon: '📻' },
                { key: 'long' as const, label: '~15 min', icon: '🎙️' },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setDuration(opt.key)}
                  className="flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl text-[10px] font-medium transition-all"
                  style={{
                    backgroundColor: duration === opt.key ? 'var(--accent-subtle)' : 'var(--bg-base)',
                    color: duration === opt.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                    border: `1.5px solid ${duration === opt.key ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                  }}
                >
                  <span className="text-sm">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-sm"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                Générer le podcast
              </>
            )}
          </button>
        </div>

        {/* Previous overviews */}
        {overviews.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              Podcasts ({overviews.length})
            </p>
            <AnimatePresence initial={false}>
              {overviews.map(ov => (
                <motion.div
                  key={ov.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative group"
                >
                  <button
                    onClick={() => setSelectedOverview(ov)}
                    className={`w-full p-3.5 rounded-xl border text-left transition-all hover:shadow-sm ${selectedOverview?.id === ov.id ? 'ring-1 ring-[var(--accent-primary)]' : ''}`}
                    style={{ borderColor: selectedOverview?.id === ov.id ? 'var(--accent-primary)' : 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'var(--accent-subtle)' }}
                      >
                        <Play className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {ov.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] flex items-center gap-1" style={{ color: 'var(--text-dimmed)' }}>
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(ov.estimatedDuration)}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${ov.status === 'ready' ? 'bg-green-500/10 text-green-400' : ov.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                            {ov.status === 'ready' ? '● Prêt' : ov.status === 'error' ? '● Erreur' : '● En cours'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                  {/* Delete button on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ov.id); }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
                    style={{ color: '#ef4444' }}
                    title="Supprimer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Right: Script viewer */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7">
        {selectedOverview ? (
          <div className="space-y-5 max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <Users className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedOverview.title}
                </h2>
                <p className="text-[10px] flex items-center gap-2" style={{ color: 'var(--text-dimmed)' }}>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(selectedOverview.estimatedDuration)}
                  </span>
                  <span>•</span>
                  <span>{new Date(selectedOverview.createdAt).toLocaleDateString('fr-FR')}</span>
                </p>
              </div>
              <button
                onClick={handleDownloadToWorkspace}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold transition-all hover:shadow-sm active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--accent-primary)',
                }}
                title="Sauvegarder le script en .md dans le workspace"
              >
                {downloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Télécharger .md
              </button>
              <button
                onClick={handleRegenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold transition-all hover:shadow-sm active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--bg-base)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-base)',
                }}
                title="Régénérer ce podcast"
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => handleDelete(selectedOverview.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold transition-all hover:shadow-sm active:scale-95"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
                title="Supprimer ce podcast"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Script as chat bubbles */}
            <div className="space-y-4">
              {selectedOverview.script.split('\n').map((line, i) => {
                const isAlex = line.trim().startsWith('Alex:') || line.trim().startsWith('Alex :');
                const isSam = line.trim().startsWith('Sam:') || line.trim().startsWith('Sam :');

                if (isAlex || isSam) {
                  const speaker = isAlex ? 'Alex' : 'Sam';
                  const text = line.replace(/^(Alex|Sam)\s*:\s*/i, '');
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={`flex gap-3 ${isSam ? 'flex-row-reverse' : ''}`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 shadow-sm"
                        style={{
                          backgroundColor: isAlex ? '#60a5fa20' : '#34d39920',
                          color: isAlex ? '#60a5fa' : '#34d399',
                          border: `1.5px solid ${isAlex ? '#60a5fa40' : '#34d39940'}`,
                        }}
                      >
                        {speaker[0]}
                      </div>
                      <div className="max-w-[80%]">
                        <p className="text-[9px] font-semibold mb-1 px-1" style={{ color: isAlex ? '#60a5fa' : '#34d399' }}>
                          {speaker}
                        </p>
                        <div
                          className={`p-3.5 rounded-2xl text-xs leading-relaxed ${isAlex ? 'rounded-tl-md' : 'rounded-tr-md'}`}
                          style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                        >
                          {text}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                if (!line.trim()) return null;
                return (
                  <p key={i} className="text-[10px] italic text-center py-2 px-4 rounded-lg"
                    style={{ color: 'var(--text-dimmed)', backgroundColor: 'var(--bg-base)' }}>
                    {line}
                  </p>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Mic className="w-7 h-7" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Audio Overview
              </p>
              <p className="text-xs max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Générez un podcast IA pour obtenir un script conversationnel
                où deux hôtes discutent du contenu de vos sources.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

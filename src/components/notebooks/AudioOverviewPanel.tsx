/**
 * AudioOverviewPanel — Génération et lecture de podcasts IA.
 *
 * Orchestrateur mince depuis le découpage (Phase 2) :
 *  - détient l'état de configuration de génération et l'overview sélectionné ;
 *  - détient les actions réseau (générer, régénérer, supprimer, exporter) ;
 *  - délègue la lecture TTS au hook useTtsPlayer ;
 *  - rend AudioGenerator (colonne gauche) et AudioPlayer (colonne droite).
 */

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../ui/Toast.js';
import { api, apiVoid } from './api/client.js';
import { AudioGenerator } from './audio/AudioGenerator.js';
import { AudioPlayer } from './audio/AudioPlayer.js';
import { useTtsPlayer } from './audio/useTtsPlayer.js';
import type { AudioOverview, AudioSource, Tone } from './audio/types.js';
import { useNotebookLive } from './chat/useNotebookLive.js';

interface Props {
  notebookId: string;
  overviews: AudioOverview[];
  sources: AudioSource[];
  onRefresh: () => void;
  fullView?: boolean;
  onClose?: () => void;
  onViewDoc?: (doc: { id: string; title: string; type: string; content: string; createdAt: string }) => void;
  playerDockElement?: HTMLElement | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioOverviewPanel({ notebookId, overviews, sources, onRefresh, fullView = false, onViewDoc, playerDockElement }: Props) {
  const { success, error: toastError } = useToast();

  // ─── État de génération / configuration ────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedOverview, setSelectedOverview] = useState<AudioOverview | null>(null);
  const [duration, setDuration] = useState<'short' | 'medium' | 'long'>('medium');
  const [showOptions, setShowOptions] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>('casual');
  const [customInstructions, setCustomInstructions] = useState('');
  const [hostName, setHostName] = useState('Leanna');
  const [coHostName, setCoHostName] = useState('Noah');
  const [coHostPersonality, setCoHostPersonality] = useState('Analytique et curieux : pose des questions pertinentes, nuance les affirmations et apporte un autre point de vue.');

  // ─── Lecture TTS (hook dédié) ──────────────────────────────────────────────
  const player = useTtsPlayer({ notebookId, selectedOverview, onError: toastError });
  const podcastLive = useNotebookLive({
    notebookId,
    mode: 'podcast',
    hostName: selectedOverview?.hostName || hostName,
    coHostName: selectedOverview?.coHostName || coHostName,
    coHostPersonality: selectedOverview?.coHostPersonality || coHostPersonality,
    selectedSources: selectedSourceIds,
    onError: toastError,
  });
  const [liveDraft, setLiveDraft] = useState('');

  useEffect(() => {
    if (podcastLive.connected && player.playing) player.stopTTS();
  }, [podcastLive.connected, player.playing, player.stopTTS]);

  useEffect(() => {
    if (podcastLive.connected) podcastLive.disconnect();
  }, [selectedOverview?.id, podcastLive.disconnect]);

  // Initialiser la sélection de sources avec toutes les sources (une fois les
  // sources chargées). La garde `length === 0` rend l'effet idempotent : une
  // fois peuplée, il ne réécrit plus la sélection.
  useEffect(() => {
    if (selectedSourceIds.length === 0 && sources.length > 0) {
      setSelectedSourceIds(sources.map(s => s.id));
    }
  }, [sources, selectedSourceIds.length]);

  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSourceIds(prev =>
      prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  }, []);

  const selectAllSources = useCallback(() => setSelectedSourceIds(sources.map(s => s.id)), [sources]);
  const deselectAllSources = useCallback(() => setSelectedSourceIds([]), []);

  const handleGenerate = useCallback(async (): Promise<AudioOverview | null> => {
    setGenerating(true);
    try {
      const data = await api<{ overview: AudioOverview }>(
        `/api/notebooks/${notebookId}/audio-overview`,
        {
          method: 'POST',
          json: {
            duration,
            sourceIds: selectedSourceIds.length < sources.length ? selectedSourceIds : undefined,
            tone: tone !== 'casual' ? tone : undefined,
            customInstructions: customInstructions.trim() || undefined,
            hostName: hostName.trim() || 'Leanna',
            coHostName: coHostName.trim() || 'Noah',
            coHostPersonality: coHostPersonality.trim() || undefined,
          },
        },
      );
      if (data.overview.status === 'ready') {
        success('Audio Overview généré !');
        setSelectedOverview(data.overview);
        onRefresh();
        return data.overview;
      }
      toastError('Erreur lors de la génération');
      onRefresh();
      return null;
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Erreur');
      return null;
    } finally {
      setGenerating(false);
    }
  }, [notebookId, duration, selectedSourceIds, sources.length, tone, customInstructions, hostName, coHostName, coHostPersonality, success, toastError, onRefresh]);

  const handleSaveToSandbox = useCallback(async () => {
    if (!selectedOverview) return;
    setDownloading(true);
    try {
      const data = await api<{ filePath: string }>(
        `/api/notebooks/${notebookId}/audio-overviews/${selectedOverview.id}/export?save=sandbox`,
      );
      success(`Script audio sauvegardé dans la sandbox : ${data.filePath}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDownloading(false);
    }
  }, [notebookId, selectedOverview, success, toastError]);

  const handleDelete = useCallback(async (overviewId: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/audio-overviews/${overviewId}`, {
        method: 'DELETE',
      });
      success('Audio overview supprimé');
      if (selectedOverview?.id === overviewId) {
        setSelectedOverview(null);
      }
      onRefresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Erreur');
    }
  }, [notebookId, selectedOverview, success, toastError, onRefresh]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedOverview) return;
    const previousId = selectedOverview.id;

    // Opération atomique : on génère d'abord. L'ancien overview n'est supprimé
    // qu'une fois le nouveau obtenu, pour ne jamais perdre les deux en cas d'échec.
    const newOverview = await handleGenerate();
    if (!newOverview || newOverview.id === previousId) {
      return;
    }

    // Génération réussie : on supprime l'ancien overview en arrière-plan.
    try {
      await apiVoid(`/api/notebooks/${notebookId}/audio-overviews/${previousId}`, {
        method: 'DELETE',
      });
    } catch {
      toastError("Nouvel audio généré, mais l'ancien n'a pas pu être supprimé.");
    }
    onRefresh();
  }, [notebookId, selectedOverview, handleGenerate, toastError, onRefresh]);

  const handleDownloadScript = useCallback(() => {
    if (!selectedOverview) return;
    const blob = new Blob([`# ${selectedOverview.title}\n\n${selectedOverview.script}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedOverview.title.replace(/[^a-zA-Z0-9]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Script téléchargé');
  }, [selectedOverview, success]);

  const handleSelectOverview = useCallback((ov: AudioOverview) => {
    setSelectedOverview(ov);
    if (onViewDoc && !fullView) {
      onViewDoc({ id: ov.id, title: ov.title, type: 'audio-overview', content: ov.script, createdAt: ov.createdAt });
    }
  }, [onViewDoc, fullView]);

  return (<>
    <div className={`h-full ${fullView ? 'flex flex-col lg:flex-row' : 'flex flex-col'}`}>
      <AudioGenerator
        fullView={fullView}
        sources={sources}
        overviews={overviews}
        selectedOverview={selectedOverview}
        duration={duration}
        setDuration={setDuration}
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        tone={tone}
        setTone={setTone}
        selectedSourceIds={selectedSourceIds}
        toggleSource={toggleSource}
        selectAllSources={selectAllSources}
        deselectAllSources={deselectAllSources}
        customInstructions={customInstructions}
        setCustomInstructions={setCustomInstructions}
        hostName={hostName}
        setHostName={setHostName}
        coHostName={coHostName}
        setCoHostName={setCoHostName}
        coHostPersonality={coHostPersonality}
        setCoHostPersonality={setCoHostPersonality}
        generating={generating}
        onGenerate={handleGenerate}
        onSelectOverview={handleSelectOverview}
        onDelete={handleDelete}
        formatDuration={formatDuration}
      />

      {selectedOverview && (
        <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--notebook-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Podcast interactif</p>
            <p className="text-xs text-[var(--text-muted)]">Discutez avec {selectedOverview.hostName || 'Leanna'} et explorez les sources pendant l'émission. Session Live à une seule voix.</p>
          </div>
          <div className="flex items-center gap-2">
            {podcastLive.connected && <button type="button" onClick={podcastLive.toggleMute} className="rounded-lg border border-[var(--notebook-border)] px-3 py-1.5 text-xs text-[var(--text-primary)]">{podcastLive.muted ? 'Activer le micro' : 'Couper le micro'}</button>}
            <button type="button" onClick={() => { if (!podcastLive.connected && !podcastLive.connecting) player.stopTTS(); podcastLive.toggle(); }} disabled={podcastLive.connecting} className="rounded-lg bg-[var(--notebook-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {podcastLive.connecting ? 'Connexion…' : podcastLive.connected ? 'Terminer la conversation' : 'Rejoindre le podcast'}
            </button>
          </div>
        </div>
        {podcastLive.connected && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <p className="text-xs text-[var(--text-muted)]" aria-live="polite">{podcastLive.busy ? 'Recherche dans les sources…' : podcastLive.isSpeaking ? 'Leanna répond…' : podcastLive.muted ? 'Micro coupé' : 'Micro actif — vous pouvez intervenir à tout moment.'}</p>
            <div className="min-h-24 flex-1 space-y-2 overflow-y-auto rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-3" aria-live="polite">
              {podcastLive.transcript.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Leanna est à l'écoute. Posez une question pour intervenir dans le podcast.</p> : podcastLive.transcript.map(entry => (
                <div key={entry.id} className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <p className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${entry.role === 'user' ? 'bg-[var(--notebook-accent-surface)] text-[var(--text-primary)]' : 'bg-[var(--notebook-surface-muted)] text-[var(--text-secondary)]'}`}>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide opacity-70">{entry.role === 'user' ? 'Vous' : selectedOverview.hostName || 'Leanna'}</span>{entry.text}
                  </p>
                </div>
              ))}
            </div>
            {podcastLive.lastCitations.length > 0 && <div className="flex flex-wrap gap-1.5">{podcastLive.lastCitations.slice(0, 5).map((citation, index) => <span key={citation.chunkId || index} title={citation.excerpt} className="max-w-48 truncate rounded-full bg-[var(--notebook-accent-surface)] px-2 py-1 text-[10px] text-[var(--notebook-accent)]">{citation.sourceTitle}</span>)}</div>}
            <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (liveDraft.trim()) { podcastLive.sendText(liveDraft); setLiveDraft(''); } }}>
              <input value={liveDraft} onChange={event => setLiveDraft(event.target.value)} placeholder="Intervenir par écrit…" className="min-w-0 flex-1 rounded-lg border border-[var(--notebook-border)] bg-[var(--notebook-surface)] px-3 py-2 text-sm text-[var(--text-primary)]" />
              <button type="submit" disabled={!liveDraft.trim()} className="rounded-lg border border-[var(--notebook-border)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-40">Envoyer</button>
            </form>
          </div>
        )}

        </div>
      )}

    </div>
    {selectedOverview && playerDockElement && createPortal(
      <AudioPlayer
        selectedOverview={selectedOverview}
        playing={player.playing}
        ttsLoading={player.ttsLoading}
        currentLineIndex={player.currentLineIndex}
        ttsProgress={player.ttsProgress}
        ttsTotalLines={player.ttsTotalLines}
        playbackSpeed={player.playbackSpeed}
        onPlay={() => { if (podcastLive.connected) podcastLive.disconnect(); void player.playTTS(); }}
        onStop={player.stopTTS}
        onCycleSpeed={player.cycleSpeed}
        generating={generating}
        downloading={downloading}
        onRegenerate={handleRegenerate}
        onDelete={handleDelete}
        onSaveToSandbox={handleSaveToSandbox}
        onDownloadScript={handleDownloadScript}
        formatDuration={formatDuration}
      />,
      playerDockElement,
    )}
  </>);
}

/**
 * AudioPlayer — colonne droite de l'Audio Overview (mode plein écran) :
 * en-tête + barre d'actions, lecteur TTS (progression), contrôles hors lecture,
 * et rendu du script sous forme de bulles de conversation (Alex / Sam).
 *
 * Composant présentationnel : l'état de lecture provient du hook useTtsPlayer
 * (via le parent) et les actions réseau sont des callbacks du parent.
 */

import { motion } from 'motion/react';
import {
  Loader2, Clock, Users, Square, Trash2, RefreshCw, Volume2, FileText,
} from 'lucide-react';
import { NbButton, NbIconButton } from '../ui/primitives.js';
import type { AudioOverview } from './types.js';

interface Props {
  selectedOverview: AudioOverview;

  // État de lecture (useTtsPlayer)
  playing: boolean;
  ttsLoading: boolean;
  currentLineIndex: number;
  ttsProgress: number;
  ttsTotalLines: number;
  playbackSpeed: number;
  onPlay: () => void;
  onStop: () => void;
  onCycleSpeed: () => void;

  // Actions (parent)
  generating: boolean;
  downloading: boolean;
  onRegenerate: () => void;
  onDelete: (overviewId: string) => void;
  onSaveToSandbox: () => void;
  onDownloadScript: () => void;
  formatDuration: (seconds: number) => string;
}

export function AudioPlayer({
  selectedOverview,
  playing,
  ttsLoading,
  currentLineIndex,
  ttsProgress,
  ttsTotalLines,
  playbackSpeed,
  onPlay,
  onStop,
  onCycleSpeed,
  generating,
  downloading,
  onRegenerate,
  onDelete,
  onSaveToSandbox,
  onDownloadScript,
  formatDuration,
}: Props) {
  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto p-5 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--notebook-border)] pb-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)]">
            <Users className="h-5 w-5 text-[var(--notebook-accent)]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="notebook-heading text-sm font-semibold text-[var(--text-primary)]">
              {selectedOverview.title}
            </h2>
            <p className="flex items-center gap-2 text-xs text-[var(--text-dimmed)]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {formatDuration(selectedOverview.estimatedDuration)}
              </span>
              <span>•</span>
              <span>{new Date(selectedOverview.createdAt).toLocaleDateString('fr-FR')}</span>
            </p>
          </div>
          <div className="notebook-actions">
            {/* Play TTS */}
            {playing ? (
              <NbButton
                variant="danger"
                size="sm"
                icon={Square}
                onClick={onStop}
                title="Arrêter la lecture"
              >
                Stop
              </NbButton>
            ) : (
              <NbButton
                variant="primary"
                size="sm"
                icon={Volume2}
                loading={ttsLoading}
                onClick={onPlay}
                title="Écouter le podcast (TTS)"
              >
                Écouter
              </NbButton>
            )}
            {/* Save to Sandbox */}
            <NbIconButton
              icon={downloading ? Loader2 : FileText}
              label="Enregistrer dans la sandbox"
              onClick={onSaveToSandbox}
              disabled={downloading}
              className={downloading ? '[&>svg]:animate-spin' : undefined}
            />
            {/* Regenerate */}
            <NbIconButton
              icon={generating ? Loader2 : RefreshCw}
              label="Régénérer"
              onClick={onRegenerate}
              disabled={generating}
              className={generating ? '[&>svg]:animate-spin' : undefined}
            />
            {/* Delete */}
            <NbIconButton
              icon={Trash2}
              label="Supprimer"
              tone="danger"
              onClick={() => onDelete(selectedOverview.id)}
            />
          </div>
        </div>

        {/* TTS Progress bar — Enhanced player */}
        {playing && ttsTotalLines > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-success)_25%,transparent)] bg-[var(--color-success-subtle)] px-4 py-3"
          >
            {/* Top row: waveform + progress */}
            <div className="flex items-center gap-3">
              {/* Mini waveform animation */}
              <div className="flex h-5 flex-shrink-0 items-center gap-[2px]" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] rounded-full bg-[var(--color-success)]"
                    animate={{ height: ['8px', '16px', '10px', '18px', '8px'] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                  />
                ))}
              </div>

              {/* Progress bar */}
              <div className="flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
                  <motion.div
                    className="h-full rounded-full bg-[var(--color-success)]"
                    animate={{ width: `${(ttsProgress / ttsTotalLines) * 100}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Progress count */}
              <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-[var(--color-success)]">
                {ttsProgress}/{ttsTotalLines}
              </span>
            </div>

            {/* Bottom row: controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Stop button */}
                <NbButton variant="ghost" size="sm" icon={Square} onClick={onStop} className="text-[var(--color-error)]">
                  Arrêter
                </NbButton>

                {/* Speed button */}
                <NbButton
                  size="sm"
                  onClick={onCycleSpeed}
                  title="Changer la vitesse"
                  className="font-semibold tabular-nums"
                >
                  {playbackSpeed}×
                </NbButton>
              </div>

              {/* Estimated remaining */}
              <span className="text-xs font-medium text-[var(--text-dimmed)]">
                {ttsTotalLines - ttsProgress > 0
                  ? `~${Math.ceil((ttsTotalLines - ttsProgress) * 3)}s restants`
                  : 'Terminé'}
              </span>
            </div>
          </motion.div>
        )}

        {/* Controls bar (when not playing) */}
        {!playing && (
          <div className="flex flex-wrap items-center gap-2">
            <NbButton size="sm" onClick={onCycleSpeed} title="Vitesse de lecture">
              ⚡ {playbackSpeed}×
            </NbButton>
            <NbButton size="sm" onClick={onDownloadScript} title="Télécharger le script">
              📥 Script .md
            </NbButton>
            <span className="ml-auto text-xs font-medium text-[var(--text-dimmed)]">
              ~{Math.ceil(selectedOverview.script.split('\n').filter((l: string) => l.trim()).length * 3 / playbackSpeed)}s à {playbackSpeed}×
            </span>
          </div>
        )}

        {/* Script as chat bubbles */}
        <div className="space-y-4">
          {selectedOverview.script.split('\n').map((line, i) => {
            const isAlex = line.trim().startsWith('Alex:') || line.trim().startsWith('Alex :');
            const isSam = line.trim().startsWith('Sam:') || line.trim().startsWith('Sam :');

            if (isAlex || isSam) {
              const speaker = isAlex ? 'Alex' : 'Sam';
              const text = line.replace(/^(Alex|Sam)\s*:\s*/i, '');
              const isCurrentLine = playing && currentLineIndex === i;
              // Couleur de l'interlocuteur : accent pour Alex, succès pour Sam.
              const speakerColor = isAlex ? 'var(--notebook-accent)' : 'var(--color-success)';
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`flex gap-3 ${isSam ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm ${isCurrentLine ? 'animate-pulse' : ''}`}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${speakerColor} 12%, transparent)`,
                      color: speakerColor,
                      border: `1.5px solid ${isCurrentLine ? speakerColor : `color-mix(in srgb, ${speakerColor} 25%, transparent)`}`,
                    }}
                  >
                    {speaker[0]}
                  </div>
                  <div className="max-w-[80%]">
                    <p className="mb-1 px-1 text-xs font-semibold" style={{ color: speakerColor }}>
                      {speaker}
                    </p>
                    <div
                      className={`rounded-2xl p-3 text-sm leading-relaxed text-[var(--text-primary)] transition-colors ${isAlex ? 'rounded-tl-md' : 'rounded-tr-md'}`}
                      style={{
                        backgroundColor: isCurrentLine ? `color-mix(in srgb, ${speakerColor} 6%, transparent)` : 'var(--notebook-surface)',
                        border: `1px solid ${isCurrentLine ? `color-mix(in srgb, ${speakerColor} 25%, transparent)` : 'var(--notebook-border)'}`,
                      }}
                    >
                      {text}
                    </div>
                  </div>
                </motion.div>
              );
            }

            if (!line.trim()) return null;
            return (
              <p key={i} className="rounded-lg bg-[var(--notebook-surface-muted)] px-4 py-2 text-center text-xs italic text-[var(--text-dimmed)]">
                {line}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

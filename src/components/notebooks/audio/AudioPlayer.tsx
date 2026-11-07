/**
 * AudioPlayer — dock lecteur de l'Audio Overview : en-tête + actions, lecteur
 * natif du fichier WAV à deux voix (lecture, avance, vitesse, téléchargement),
 * et script affiché sous forme de bulles de conversation.
 *
 * Composant présentationnel : les actions réseau sont des callbacks du parent.
 */

import {
  Loader2, Clock, Users, Trash2, RefreshCw, Volume2, FileText, Download,
} from 'lucide-react';
import { NbButton, NbIconButton } from '../ui/primitives.js';
import type { AudioOverview } from './types.js';

interface Props {
  selectedOverview: AudioOverview;
  /** URL du fichier audio, null tant qu'il n'a pas été généré. */
  audioUrl: string | null;
  /** Progression du rendu audio en cours (null = aucun rendu). */
  renderProgress: { done: number; total: number } | null;
  onRenderAudio: () => void;

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
  audioUrl,
  renderProgress,
  onRenderAudio,
  generating,
  downloading,
  onRegenerate,
  onDelete,
  onSaveToSandbox,
  onDownloadScript,
  formatDuration,
}: Props) {
  const hostName = selectedOverview.hostName || 'Alex';
  const coHostName = selectedOverview.coHostName || 'Sam';
  const rendering = renderProgress !== null;

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
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
              <span>{hostName} &amp; {coHostName}</span>
              <span>•</span>
              <span>{new Date(selectedOverview.createdAt).toLocaleDateString('fr-FR')}</span>
            </p>
          </div>
          <div className="notebook-actions">
            <NbIconButton
              icon={downloading ? Loader2 : FileText}
              label="Enregistrer le script dans la sandbox"
              onClick={onSaveToSandbox}
              disabled={downloading}
              className={downloading ? '[&>svg]:animate-spin' : undefined}
            />
            <NbIconButton
              icon={generating ? Loader2 : RefreshCw}
              label="Régénérer"
              onClick={onRegenerate}
              disabled={generating || rendering}
              className={generating ? '[&>svg]:animate-spin' : undefined}
            />
            <NbIconButton
              icon={Trash2}
              label="Supprimer"
              tone="danger"
              onClick={() => onDelete(selectedOverview.id)}
            />
          </div>
        </div>

        {/* Lecteur audio */}
        {rendering ? (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] px-4 py-3" aria-live="polite">
            <p className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Génération de l'audio… {renderProgress.total > 0 && `${renderProgress.done}/${renderProgress.total} répliques`}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]">
              <div
                className="h-full rounded-full bg-[var(--notebook-accent)] transition-[width] duration-300"
                style={{ width: `${renderProgress.total ? (renderProgress.done / renderProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : audioUrl ? (
          <div className="flex items-center gap-2">
            <audio controls preload="metadata" src={audioUrl} className="min-w-0 flex-1" aria-label={`Podcast : ${selectedOverview.title}`} />
            <a
              href={audioUrl}
              download={`${selectedOverview.title.replace(/[^a-zA-Z0-9]/g, '-')}.wav`}
              title="Télécharger l'audio"
              aria-label="Télécharger l'audio"
              className="rounded-lg border border-[var(--notebook-border)] p-2 text-[var(--text-primary)] hover:bg-[var(--notebook-surface-muted)]"
            >
              <Download className="h-4 w-4" aria-hidden />
            </a>
          </div>
        ) : (
          <NbButton variant="primary" size="sm" icon={Volume2} onClick={onRenderAudio}>
            Générer l'audio
          </NbButton>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <NbButton size="sm" onClick={onDownloadScript} title="Télécharger le script">
            📥 Script .md
          </NbButton>
        </div>

        {/* Script as chat bubbles */}
        <div className="space-y-4">
          {selectedOverview.script.split('\n').map((line, i) => {
            const separator = line.trim().indexOf(':');
            const label = separator > 0 ? line.trim().slice(0, separator).trim().toLowerCase() : '';
            const isCoHost = label === coHostName.toLowerCase() || label === 'sam';
            const isHost = !isCoHost && (label === hostName.toLowerCase() || label === 'alex');

            if (separator > 0 && (isHost || isCoHost)) {
              const speaker = isHost ? hostName : coHostName;
              const text = line.trim().slice(separator + 1).trim();
              // Couleur de l'interlocuteur : accent pour l'hôte, succès pour le co-hôte.
              const speakerColor = isHost ? 'var(--notebook-accent)' : 'var(--color-success)';
              return (
                <div key={i} className={`flex gap-3 ${isCoHost ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${speakerColor} 12%, transparent)`,
                      color: speakerColor,
                      border: `1.5px solid color-mix(in srgb, ${speakerColor} 25%, transparent)`,
                    }}
                  >
                    {speaker[0]}
                  </div>
                  <div className="max-w-[80%]">
                    <p className="mb-1 px-1 text-xs font-semibold" style={{ color: speakerColor }}>
                      {speaker}
                    </p>
                    <div className={`rounded-2xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-3 text-sm leading-relaxed text-[var(--text-primary)] ${isHost ? 'rounded-tl-md' : 'rounded-tr-md'}`}>
                      {text}
                    </div>
                  </div>
                </div>
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

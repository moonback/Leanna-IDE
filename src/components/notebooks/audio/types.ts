/**
 * Types partagés du sous-module Audio Overview (podcast IA).
 * Extraits d'AudioOverviewPanel pour être réutilisés par AudioGenerator et AudioPlayer.
 */

export interface AudioOverview {
  id: string;
  title: string;
  script: string;
  estimatedDuration: number;
  status: 'generating' | 'ready' | 'error';
  hostName?: string;
  coHostName?: string;
  coHostPersonality?: string;
  /** Fichier WAV à deux voix disponible via GET …/audio. */
  audioReady?: boolean;
  createdAt: string;
}

export interface AudioSource {
  id: string;
  title: string;
}

export type Tone = 'casual' | 'academic' | 'humorous' | 'professional';

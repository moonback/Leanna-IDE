import { useState, useCallback, useEffect, useRef } from 'react';
import { useChatPersistence } from './useChatPersistence.js';

export type TranscriptRole = 'user' | 'assistant';

export interface ContextSource {
  id: string;
  path: string;
  tool: string;
  lines?: string;
  excluded?: boolean;
}

export interface DocumentAttachment {
  fileName: string;
  mimeType: string;
  summary: string;
  extractedTextLength: number;
  provider?: 'gemini' | 'openrouter';
}

export interface TranscriptEntry {
  id: string;
  role: TranscriptRole;
  text: string;
  timestamp: Date;
  sources?: ContextSource[];
  /**
   * État spécial d'un message de génération d'image, rendu dans la bulle au
   * lieu du texte markdown :
   *  - 'image'       : génération en cours → animation de chargement
   *  - 'image-error' : génération échouée → carte d'échec (voir `imageError`)
   * Transitions : `addPendingImage` (→ image), `resolvePendingImage` (→ image
   * remplacée par le markdown final), `failPendingImage` (→ image-error).
   */
  pending?: 'image' | 'image-error';
  /** Message d'erreur affiché quand `pending === 'image-error'`. */
  imageError?: string;
  /** Document réellement analysé et injecté dans le contexte de conversation. */
  attachment?: DocumentAttachment;
}

export function useTranscript() {
  const { restored, hasRestoredTranscript, loadTranscript, saveTranscript, clearPersistedTranscript } = useChatPersistence();
  const didRestoreRef = useRef(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    const restoredTranscript = loadTranscript();
    if (restoredTranscript.length > 0) {
      setTranscript(restoredTranscript);
    }
  }, [loadTranscript]);

  useEffect(() => {
    if (!restored) return;
    if (transcript.length === 0) {
      clearPersistedTranscript();
      return;
    }
    saveTranscript(transcript);
  }, [restored, transcript, saveTranscript, clearPersistedTranscript]);

  const addTranscript = useCallback((role: TranscriptRole, text: string, sources?: ContextSource[]) => {
    setTranscript(prev => {
      if (prev.length > 0 && prev[prev.length - 1].role === role) {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), {
          ...last,
          text: last.text + text,
          sources: sources?.length ? [...(last.sources ?? []), ...sources] : last.sources,
        }];
      }
      const entry: TranscriptEntry = {
        id: Date.now().toString() + Math.random(),
        role,
        text,
        timestamp: new Date(),
        sources,
      };
      const next = [...prev, entry];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  // ── Placeholder « génération d'image » ──────────────────────────────────────
  // On insère un message assistant marqué `pending: 'image'` dès le début de la
  // génération (animation de chargement), puis on le remplace par l'image une
  // fois reçue. Un seul placeholder image à la fois : si un ancien traîne (ex.
  // échec silencieux), on le remplace. `id` stable pour le retrouver.
  const PENDING_IMAGE_ID = '__pending_image__';

  const addPendingImage = useCallback(() => {
    setTranscript(prev => {
      // Retirer un éventuel placeholder image orphelin avant d'en créer un neuf.
      const cleaned = prev.filter(e => e.id !== PENDING_IMAGE_ID);
      const entry: TranscriptEntry = {
        id: PENDING_IMAGE_ID,
        role: 'assistant',
        text: '',
        timestamp: new Date(),
        pending: 'image',
      };
      const next = [...cleaned, entry];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, []);

  const resolvePendingImage = useCallback((markdown: string) => {
    setTranscript(prev => {
      const idx = prev.findIndex(e => e.id === PENDING_IMAGE_ID);
      if (idx === -1) {
        // Pas de placeholder (ex. start manqué) → simple ajout en fin.
        const entry: TranscriptEntry = {
          id: Date.now().toString() + Math.random(),
          role: 'assistant',
          text: markdown,
          timestamp: new Date(),
        };
        return [...prev, entry];
      }
      const resolved: TranscriptEntry = {
        ...prev[idx],
        id: Date.now().toString() + Math.random(),
        text: markdown,
        timestamp: new Date(),
        pending: undefined,
      };
      return [...prev.slice(0, idx), resolved, ...prev.slice(idx + 1)];
    });
  }, []);

  const failPendingImage = useCallback((message?: string) => {
    const errorText = (message && message.trim())
      ? message.trim()
      : "La génération de l'image a échoué.";
    setTranscript(prev => {
      const idx = prev.findIndex(e => e.id === PENDING_IMAGE_ID);
      if (idx === -1) {
        // Pas de placeholder (ex. start manqué) → créer directement une carte
        // d'échec pour que l'utilisateur voie que la génération a raté.
        const entry: TranscriptEntry = {
          id: Date.now().toString() + Math.random(),
          role: 'assistant',
          text: '',
          timestamp: new Date(),
          pending: 'image-error',
          imageError: errorText,
        };
        return [...prev, entry];
      }
      // Convertir le placeholder animé en carte d'échec (id réaffecté pour qu'il
      // ne soit plus ciblé comme « pending image » par une génération ultérieure).
      const failed: TranscriptEntry = {
        ...prev[idx],
        id: Date.now().toString() + Math.random(),
        timestamp: new Date(),
        pending: 'image-error',
        imageError: errorText,
      };
      return [...prev.slice(0, idx), failed, ...prev.slice(idx + 1)];
    });
  }, []);


  // ── Documents analysés : conserver une trace visible dans l'historique ───────
  useEffect(() => {
    const handler = (event: Event) => {
      const attachment = (event as CustomEvent<DocumentAttachment>).detail;
      if (!attachment || typeof attachment.fileName !== 'string') return;
      const summary = typeof attachment.summary === 'string' ? attachment.summary : '';
      const entry: TranscriptEntry = {
        id: `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        text: `Document analysé : ${attachment.fileName}\n${summary}`,
        timestamp: new Date(),
        attachment,
      };
      setTranscript(prev => [...prev, entry].slice(-200));
    };
    window.addEventListener('Leanna-document-analyzed', handler as EventListener);
    return () => window.removeEventListener('Leanna-document-analyzed', handler as EventListener);
  }, []);

  // ── Listener: résumé automatique du contexte ─────────────────────────────
  // Quand useLiveAPI déclenche 'Leanna-summarize-context', on remplace le
  // transcript par le résumé + les tours conservés.
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { summary, summarizedTurns, retained } = e.detail as {
        summary: string;
        summarizedTurns: number;
        retained: TranscriptEntry[];
      };
      
      // Validation défensive : s'assurer que summary est bien une string
      const summaryText = typeof summary === 'string' 
        ? summary 
        : (typeof summary === 'object' ? JSON.stringify(summary) : String(summary));
      
      const summaryEntry: TranscriptEntry = {
        id: Date.now().toString() + Math.random(),
        role: 'assistant',
        text: `[Résumé automatique du contexte — ${summarizedTurns} messages condensés]\n${summaryText}`,
        timestamp: new Date(),
      };
      console.log(
        `[useTranscript] Résumé appliqué: summarizedTurns=${summarizedTurns}, ` +
        `retainedCount=${retained.length}, summaryLength=${summaryText.length}, ` +
        `summaryType=${typeof summary}`,
      );
      setTranscript([summaryEntry, ...retained]);
    };
    window.addEventListener('Leanna-summarize-context', handler as EventListener);
    return () => window.removeEventListener('Leanna-summarize-context', handler as EventListener);
  }, []);

  return {
    transcript,
    addTranscript,
    clearTranscript,
    addPendingImage,
    resolvePendingImage,
    failPendingImage,
    transcriptRestored: hasRestoredTranscript,
  };
}

/**
 * useTtsPlayer — lecture d'une piste podcast WAV complète.
 * Le rendu des deux voix est effectué côté serveur ; le navigateur lit un
 * seul fichier continu et ne synthétise/assemble plus les répliques.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioOverview } from "./types.js";

export interface UseTtsPlayerOptions {
  notebookId: string;
  selectedOverview: AudioOverview | null;
  onError?: (message: string) => void;
}

export interface TtsPlayerState {
  playing: boolean;
  ttsLoading: boolean;
  currentLineIndex: number;
  ttsProgress: number;
  ttsTotalLines: number;
  playbackSpeed: number;
  playTTS: () => Promise<void>;
  stopTTS: () => void;
  cycleSpeed: () => void;
}

export function useTtsPlayer({ notebookId, selectedOverview, onError }: UseTtsPlayerOptions): TtsPlayerState {
  const [playing, setPlaying] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [ttsProgress, setTtsProgress] = useState(0);
  const [ttsTotalLines, setTtsTotalLines] = useState(1000);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const playingRef = useRef(false);

  const stopTTS = useCallback(() => {
    playingRef.current = false;
    generationControllerRef.current?.abort();
    generationControllerRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    }
    setPlaying(false);
    setTtsLoading(false);
    setCurrentLineIndex(-1);
    setTtsProgress(0);
  }, []);

  const playTTS = useCallback(async () => {
    if (!selectedOverview || playingRef.current) return;
    stopTTS();
    setTtsLoading(true);
    setTtsProgress(0);
    setCurrentLineIndex(0);
    const controller = new AbortController();
    generationControllerRef.current = controller;

    try {
      const base = `/api/notebooks/${encodeURIComponent(notebookId)}/audio-overviews/${encodeURIComponent(selectedOverview.id)}`;
      const response = await fetch(`${base}/audio-track`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostVoice: "Aoede", coHostVoice: "Charon" }),
        signal: controller.signal,
      });
      const payload = await response.json() as { audioUrl?: string; error?: string; durationSeconds?: number };
      if (!response.ok || !payload.audioUrl) {
        throw new Error(payload.error || "Impossible de générer la piste audio.");
      }
      if (controller.signal.aborted) return;

      const audio = new Audio(payload.audioUrl);
      audio.preload = "auto";
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (!audio.duration || !Number.isFinite(audio.duration)) return;
        const ratio = Math.min(1, audio.currentTime / audio.duration);
        setTtsProgress(Math.round(ratio * 1000));
        const lineCount = selectedOverview.script.split("\n").filter(line => line.trim()).length;
        setCurrentLineIndex(Math.min(Math.max(0, lineCount - 1), Math.floor(ratio * lineCount)));
      };
      audio.onended = () => {
        playingRef.current = false;
        setPlaying(false);
        setTtsLoading(false);
        setTtsProgress(1000);
        setCurrentLineIndex(-1);
      };
      audio.onerror = () => {
        playingRef.current = false;
        setPlaying(false);
        setTtsLoading(false);
        onError?.("Le fichier audio du podcast ne peut pas être lu.");
      };
      await audio.play();
      playingRef.current = true;
      setPlaying(true);
      setTtsLoading(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      playingRef.current = false;
      setPlaying(false);
      setTtsLoading(false);
      onError?.(error instanceof Error ? error.message : "Erreur pendant la génération audio.");
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
    }
  }, [notebookId, selectedOverview, playbackSpeed, stopTTS, onError]);

  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed(previous => {
      const next = previous === 1 ? 1.25 : previous === 1.25 ? 1.5 : previous === 1.5 ? 1.75 : previous === 1.75 ? 2 : 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  useEffect(() => () => {
    generationControllerRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
  }, []);

  return {
    playing,
    ttsLoading,
    currentLineIndex,
    ttsProgress,
    ttsTotalLines,
    playbackSpeed,
    playTTS,
    stopTTS,
    cycleSpeed,
  };
}

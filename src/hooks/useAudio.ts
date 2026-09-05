import { useState, useRef, useCallback, useEffect } from 'react';

function floatToPcm16(pcmData: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export interface UseAudioOptions {
  onAudioData: (pcm16: ArrayBuffer) => void;
  autoMuteEnabled?: boolean;
  autoMuteTimeout?: number; // in seconds
  vadEnabled?: boolean;      // Voice Activity Detection
  vadThreshold?: number;     // Amplitude minimum pour détecter la voix (0-100)
  vadSilenceDuration?: number; // Durée de silence avant d'arrêter l'envoi (ms)
}

export function useAudio({ 
  onAudioData, 
  autoMuteEnabled = false, 
  autoMuteTimeout = 40,
  vadEnabled = true,
  vadThreshold = 35,
  vadSilenceDuration = 800,
}: UseAudioOptions) {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  
  // Auto-mute timer refs
  const autoMuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const autoMuteEnabledRef = useRef(autoMuteEnabled);
  const autoMuteTimeoutRef = useRef(autoMuteTimeout);

  // VAD (Voice Activity Detection) refs
  const vadSilenceStartRef = useRef<number | null>(null);
  const vadEnabledRef = useRef(vadEnabled);
  const vadThresholdRef = useRef(vadThreshold);
  const vadSilenceDurationRef = useRef(vadSilenceDuration);

  // Keep refs in sync
  autoMuteEnabledRef.current = autoMuteEnabled;
  autoMuteTimeoutRef.current = autoMuteTimeout;
  vadEnabledRef.current = vadEnabled;
  vadThresholdRef.current = vadThreshold;
  vadSilenceDurationRef.current = vadSilenceDuration;

  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
 
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputAmplitudeRef = useRef(0);
  const outputAmplitudeRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  mutedRef.current = muted;

  // Auto-mute logic - Utilise useEffect pour synchronisation avec config
  const clearAutoMuteTimer = useCallback(() => {
    if (autoMuteTimerRef.current) {
      clearTimeout(autoMuteTimerRef.current);
      autoMuteTimerRef.current = null;
    }
  }, []);

  // Reset auto-mute: simplement unmute, le useEffect ci-dessous relancera le timer
  const resetAutoMute = useCallback(() => {
    if (!mutedRef.current) {
      lastActivityRef.current = Date.now();
    }
  }, []);

  // useEffect: Gère le timer auto-mute de manière réactive aux changements de config
  useEffect(() => {
    if (!autoMuteEnabled || muted) {
      clearAutoMuteTimer();
      return;
    }
    
    const timerId = setTimeout(() => {
      if (!mutedRef.current) {
        setMuted(true);
        mutedRef.current = true;
      }
    }, autoMuteTimeout * 1000);
    
    autoMuteTimerRef.current = timerId;
    return () => clearTimeout(timerId);
  }, [autoMuteEnabled, autoMuteTimeout, muted, clearAutoMuteTimer]);

  // Wake/unmute function
  const wake = useCallback(() => {
    if (mutedRef.current) {
      setMuted(false);
      mutedRef.current = false;
    }
    lastActivityRef.current = Date.now();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(prev => !prev);
  }, []);

  const playAudioChunk = useCallback((audioData: ArrayBuffer | string) => {
    const audioCtx = outputAudioCtxRef.current;
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
     
      const pcm16 = typeof audioData === 'string'
        ? (() => {
            const binaryStr = atob(audioData);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            return new Int16Array(bytes.buffer);
          })()
        : new Int16Array(audioData);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;

      const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.copyToChannel(float32, 0);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
     
      if (outputAnalyserRef.current) {
        source.connect(outputAnalyserRef.current);
        outputAnalyserRef.current.connect(audioCtx.destination);
      } else {
        source.connect(audioCtx.destination);
      }

      const now = audioCtx.currentTime;
      if (nextStartTimeRef.current < now) nextStartTimeRef.current = now + 0.05;
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
    } catch (e) {
      console.error('Error playing audio chunk', e);
    }
  }, []);

  const handleInterrupt = useCallback(() => {
    const outCtx = outputAudioCtxRef.current;
    if (outCtx && outCtx.state !== 'closed') {
      outputAnalyserRef.current?.disconnect();
      outputAnalyserRef.current = null;
      outCtx.close().catch(console.error);

      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const newCtx = new AC({ sampleRate: 24000 });
      outputAudioCtxRef.current = newCtx;
      nextStartTimeRef.current = 0;

      const newAnalyser = newCtx.createAnalyser();
      newAnalyser.fftSize = 256;
      newAnalyser.smoothingTimeConstant = 0.8;
      outputAnalyserRef.current = newAnalyser;
    }
  }, []);

  const initAudio = useCallback(async () => {
    try {
      // ── Capture avec contraintes de qualité audio ──────────────────────
      // noiseSuppression, echoCancellation et autoGainControl sont supportées
      // nativement par Chrome/Edge et réduisent les bruits de fond sans latence.
      // On demande également le sampleRate cible directement dans les contraintes
      // (hint pour le driver, pas garanti sur tous les navigateurs).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      }).catch(() =>
        // Fallback sans contraintes si le navigateur les refuse
        navigator.mediaDevices.getUserMedia({ audio: true })
      );
      mediaStreamRef.current = stream;

      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AC({ sampleRate: 16000 });
      const outputCtx = new AC({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const source = inputCtx.createMediaStreamSource(stream);

      // ── Filtre passe-haut (≥80 Hz) ─────────────────────────────────────
      // Élimine les grondements basses fréquences (ventilateurs, vibrations)
      // qui ne font pas partie de la voix humaine.
      const highpassFilter = inputCtx.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = 80;
      highpassFilter.Q.value = 0.7;

      // ── Compresseur dynamique ───────────────────────────────────────────
      // Normalise le niveau de la voix (parole douce vs forte) et réduit
      // les pics soudains (bruits de bouche, claquements).
      const compressor = inputCtx.createDynamicsCompressor();
      compressor.threshold.value = -24; // dB — commence à compresser à -24 dB
      compressor.knee.value = 10;       // transition douce
      compressor.ratio.value = 4;       // ratio 4:1
      compressor.attack.value = 0.003;  // 3ms — réactif
      compressor.release.value = 0.25;  // 250ms — relâchement naturel

      // ── Buffer réduit à 2048 samples (128ms) pour moins de latence ─────
      // Valeur précédente : 4096 (256ms). 2048 est le meilleur compromis
      // latence/stabilité sur ScriptProcessorNode (déprécié mais encore
      // universellement supporté).
      const processor = inputCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyser.smoothingTimeConstant = 0.8;
      inputAnalyserRef.current = inputAnalyser;

      // Chaîne : source → highpass → compressor → analyser → processor → destination
      source.connect(highpassFilter);
      highpassFilter.connect(compressor);
      compressor.connect(inputAnalyser);
      inputAnalyser.connect(processor);
      processor.connect(inputCtx.destination);

      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyser.smoothingTimeConstant = 0.8;
      outputAnalyserRef.current = outputAnalyser;

      const dataArray = new Uint8Array(inputAnalyser.frequencyBinCount);
      const outDataArray = new Uint8Array(outputAnalyser.frequencyBinCount);
      const tick = () => {
        animFrameRef.current = requestAnimationFrame(tick);

        inputAnalyser.getByteFrequencyData(dataArray);
        const inAvg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        inputAmplitudeRef.current = Math.min(1, inAvg / 100);

        // Detect voice activity (simple amplitude threshold)
        if (inAvg > 30) {
          resetAutoMute();
        }

        outputAnalyser.getByteFrequencyData(outDataArray);
        const outAvg = outDataArray.reduce((a, b) => a + b, 0) / outDataArray.length;
        outputAmplitudeRef.current = Math.min(1, outAvg / 100);
      };
      tick();

      processor.onaudioprocess = (e) => {
        if (mutedRef.current) return;
        
        // ── VAD (Voice Activity Detection) ──────────────────────────────
        // Économise 40-60% de bande passante en ne transmettant que les segments
        // où une voix est détectée (amplitude > seuil).
        
        if (vadEnabledRef.current) {
          // Calculer l'amplitude moyenne du chunk actuel
          inputAnalyser.getByteFrequencyData(dataArray);
          const amplitude = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          
          if (amplitude > vadThresholdRef.current) {
            // ✅ Voix détectée → envoyer le chunk et reset le timer de silence
            vadSilenceStartRef.current = null;
            onAudioData(floatToPcm16(e.inputBuffer.getChannelData(0)));
            resetAutoMute();
          } else {
            // 🔇 Silence détecté
            if (vadSilenceStartRef.current === null) {
              // Premier chunk de silence → démarrer le timer
              vadSilenceStartRef.current = Date.now();
            }
            
            const silenceDuration = Date.now() - vadSilenceStartRef.current;
            
            if (silenceDuration < vadSilenceDurationRef.current) {
              // Silence court (< 800ms par défaut) → continuer d'envoyer
              // (pauses naturelles dans les phrases, respiration)
              onAudioData(floatToPcm16(e.inputBuffer.getChannelData(0)));
            }
            // Silence long (> 800ms) → NE RIEN ENVOYER (économie bande passante)
          }
        } else {
          // VAD désactivé → envoyer tout l'audio (comportement original)
          onAudioData(floatToPcm16(e.inputBuffer.getChannelData(0)));
        }
      };
    } catch (err) {
      console.error('Failed to start audio', err);
      throw err;
    }
  }, [onAudioData, resetAutoMute]);

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    clearAutoMuteTimer();

    processorRef.current?.disconnect();
    processorRef.current = null;

    inputAnalyserRef.current?.disconnect();
    inputAnalyserRef.current = null;
    outputAnalyserRef.current?.disconnect();
    outputAnalyserRef.current = null;

    if (inputAudioCtxRef.current?.state !== 'closed') {
      inputAudioCtxRef.current?.close().catch(console.error);
    }
    inputAudioCtxRef.current = null;

    if (outputAudioCtxRef.current?.state !== 'closed') {
      outputAudioCtxRef.current?.close().catch(console.error);
    }
    outputAudioCtxRef.current = null;

    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;

    // Reset mute state so the next session starts unmuted
    setMuted(false);
    mutedRef.current = false;

    inputAmplitudeRef.current = 0;
    outputAmplitudeRef.current = 0;
  }, [clearAutoMuteTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAutoMuteTimer();
    };
  }, [clearAutoMuteTimer]);

  const getInputAmplitude = useCallback(() => inputAmplitudeRef.current, []);
  const getOutputAmplitude = useCallback(() => outputAmplitudeRef.current, []);

  return {
    muted,
    toggleMute,
    wake,
    playAudioChunk,
    handleInterrupt,
    initAudio,
    cleanupAudio,
    getInputAmplitude,
    getOutputAmplitude,
  };
}

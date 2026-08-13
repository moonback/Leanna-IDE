import { useState, useRef, useCallback, useEffect } from 'react';

function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface UseAudioOptions {
  onAudioData: (base64Audio: string) => void;
  autoMuteEnabled?: boolean;
  autoMuteTimeout?: number; // in seconds
}

export function useAudio({ onAudioData, autoMuteEnabled = false, autoMuteTimeout = 40 }: UseAudioOptions) {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  
  // Auto-mute timer refs
  const autoMuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const autoMuteEnabledRef = useRef(autoMuteEnabled);
  const autoMuteTimeoutRef = useRef(autoMuteTimeout);

  // Keep refs in sync
  autoMuteEnabledRef.current = autoMuteEnabled;
  autoMuteTimeoutRef.current = autoMuteTimeout;

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

  // Auto-mute logic
  const resetAutoMuteTimer = useCallback(() => {
    if (!autoMuteEnabledRef.current) return;
    
    lastActivityRef.current = Date.now();
    
    if (autoMuteTimerRef.current) {
      clearTimeout(autoMuteTimerRef.current);
    }
    
    autoMuteTimerRef.current = setTimeout(() => {
      if (!mutedRef.current) {
        setMuted(true);
        mutedRef.current = true;
      }
    }, autoMuteTimeoutRef.current * 1000);
  }, []);

  const clearAutoMuteTimer = useCallback(() => {
    if (autoMuteTimerRef.current) {
      clearTimeout(autoMuteTimerRef.current);
      autoMuteTimerRef.current = null;
    }
  }, []);

  // Wake/unmute function
  const wake = useCallback(() => {
    if (mutedRef.current) {
      setMuted(false);
      mutedRef.current = false;
    }
    resetAutoMuteTimer();
  }, [resetAutoMuteTimer]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      if (!next) {
        // When unmuting manually, reset the auto-mute timer
        resetAutoMuteTimer();
      } else {
        // When muting manually, clear the auto-mute timer
        clearAutoMuteTimer();
      }
      return next;
    });
  }, [resetAutoMuteTimer, clearAutoMuteTimer]);

  const playAudioChunk = useCallback((base64Audio: string) => {
    const audioCtx = outputAudioCtxRef.current;
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
     
      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const pcm16 = new Int16Array(bytes.buffer);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AC({ sampleRate: 16000 });
      const outputCtx = new AC({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyser.smoothingTimeConstant = 0.8;
      inputAnalyserRef.current = inputAnalyser;
      source.connect(inputAnalyser);
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
          resetAutoMuteTimer();
        }

        outputAnalyser.getByteFrequencyData(outDataArray);
        const outAvg = outDataArray.reduce((a, b) => a + b, 0) / outDataArray.length;
        outputAmplitudeRef.current = Math.min(1, outAvg / 100);
      };
      tick();

      processor.onaudioprocess = (e) => {
        if (!mutedRef.current) {
          onAudioData(pcmToBase64(e.inputBuffer.getChannelData(0)));
        }
      };
      
      // Initialize auto-mute timer if enabled
      resetAutoMuteTimer();
    } catch (err) {
      console.error('Failed to start audio', err);
      throw err;
    }
  }, [onAudioData, resetAutoMuteTimer]);

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

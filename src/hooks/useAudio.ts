import { useState, useRef, useCallback, useEffect } from 'react';
import {
  preloadWakeModel, startWakeWordListener, DEFAULT_WAKE_STRICTNESS,
  type WakeWordListener, type WakeStrictness,
} from '../lib/wakeWord.js';
import { playSessionStartSound } from '../lib/sound.js';
import {
  computeNoiseProfile, createSpeechGate, loadNoiseProfile, saveNoiseProfile,
  NoiseCalibrationError, DEFAULT_CALIBRATION_MS, type NoiseProfile,
} from '../lib/noiseCalibration.js';

function floatToPcm16(pcmData: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

// ── AudioWorklet de capture ────────────────────────────────────────────────
// Remplace le ScriptProcessorNode déprécié sur les navigateurs modernes. Le
// worklet tourne dans le thread audio, accumule les échantillons en blocs de
// FRAME_SIZE (2048, comme l'ancien buffer) et les poste au thread principal.
// Défini en Blob inline pour éviter toute configuration de bundling (Vite/Electron).
const CAPTURE_FRAME_SIZE = 2048;
// 32 × 2048 échantillons à 16 kHz ≈ 4 s rejouées à Gemini après le réveil.
// Le réveil n'a lieu qu'en fin d'énoncé (résultat final Vosk) : le préroll doit
// couvrir toute la phrase « Leanna, ouvre… » pour que la commande ne soit pas perdue.
const PREROLL_FRAMES = 32;
const AUDIO_WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._frameSize = ${CAPTURE_FRAME_SIZE};
    this._buffer = new Float32Array(this._frameSize);
    this._offset = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset >= this._frameSize) {
        // Copie transférable pour ne pas bloquer le thread audio.
        this.port.postMessage(this._buffer.slice(0));
        this._offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('leanna-capture-processor', CaptureProcessor);
`;

let audioWorkletModuleUrl: string | null = null;
function getAudioWorkletModuleUrl(): string {
  if (!audioWorkletModuleUrl) {
    audioWorkletModuleUrl = URL.createObjectURL(
      new Blob([AUDIO_WORKLET_SOURCE], { type: 'application/javascript' }),
    );
  }
  return audioWorkletModuleUrl;
}

export interface UseAudioOptions {
  onAudioData: (pcm16: ArrayBuffer) => void;
  autoMuteEnabled?: boolean;
  autoMuteTimeout?: number; // in seconds
  /** Outil en cours côté serveur : empêche la mise en veille. */
  isBusy?: boolean;
  /** En veille, écoute le nom « Leanna » pour se réveiller. */
  wakeWordEnabled?: boolean;
  /** Exigences sur le nom reconnu (confiance, durée, position) contre les faux réveils. */
  wakeStrictness?: WakeStrictness;
  vadEnabled?: boolean;      // Voice Activity Detection
  vadThreshold?: number;     // Amplitude minimum pour détecter la voix (0-100)
  vadSilenceDuration?: number; // Durée de silence avant d'arrêter l'envoi (ms)
  /** Appelé une seule fois par utterance quand le VAD détecte le silence long (étape A). */
  onVadSilence?: () => void;
  /**
   * Appelé une seule fois quand le premier chunk audio de réponse est programmé
   * pour lecture via source.start (étape F — PROGRAMMATION, pas audibilité).
   *
   * @param info.scheduledInMs  Délai (ms, relatif à performance.now()) avant le
   *   début programmé de la lecture. 0 si la lecture démarre immédiatement.
   * @param info.outputLatencyMs Latence de sortie matérielle/OS estimée (ms),
   *   issue de AudioContext.outputLatency (fallback baseLatency, puis 0).
   *   scheduledInMs + outputLatencyMs ≈ délai avant audibilité réelle (étape G).
   */
  onFirstAudioScheduled?: (info: { scheduledInMs: number; outputLatencyMs: number }) => void;
}

export function useAudio({ 
  onAudioData, 
  autoMuteEnabled = false, 
  autoMuteTimeout = 40,
  isBusy = false,
  wakeWordEnabled = true,
  wakeStrictness = DEFAULT_WAKE_STRICTNESS,
  vadEnabled = true,
  vadThreshold = 35,
  vadSilenceDuration = 800,
  onVadSilence,
  onFirstAudioScheduled,
}: UseAudioOptions) {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  
  // Veille automatique
  const lastActivityRef = useRef<number>(Date.now());
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  // Veille = muet déclenché par l'inactivité (≠ muet manuel) : seul cas où l'on écoute le nom.
  const [asleep, setAsleep] = useState(false);
  const [wakeWordFailed, setWakeWordFailed] = useState(false); // modèle absent/illisible → réveil par clic
  const wakeListenerRef = useRef<WakeWordListener | null>(null);
  const prerollRef = useRef<Float32Array[]>([]); // ~1,5 s d'audio avant le réveil
  const onAudioDataRef = useRef(onAudioData);
  onAudioDataRef.current = onAudioData;
  // Lu à chaque résultat Vosk : un réglage modifié s'applique sans relancer l'écoute.
  const wakeStrictnessRef = useRef(wakeStrictness);
  wakeStrictnessRef.current = wakeStrictness;

  // VAD (Voice Activity Detection) refs
  const vadSilenceStartRef = useRef<number | null>(null);
  const vadEnabledRef = useRef(vadEnabled);
  const vadThresholdRef = useRef(vadThreshold);
  const vadSilenceDurationRef = useRef(vadSilenceDuration);
  // Callback étape A (sonde latence) — ne se déclenche qu'une fois par utterance
  const onVadSilenceRef = useRef<(() => void) | undefined>(onVadSilence);
  const vadSilenceFiredRef = useRef(false); // garde pour n'appeler qu'une fois
  // Callback étape F (sonde latence) — premier chunk audio programmé pour lecture
  const onFirstAudioScheduledRef = useRef<UseAudioOptions['onFirstAudioScheduled']>(onFirstAudioScheduled);
  const firstAudioScheduledFiredRef = useRef(false);

  // Keep refs in sync
  vadEnabledRef.current = vadEnabled;
  vadThresholdRef.current = vadThreshold;
  vadSilenceDurationRef.current = vadSilenceDuration;
  onVadSilenceRef.current = onVadSilence;
  onFirstAudioScheduledRef.current = onFirstAudioScheduled;

  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
 
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputAmplitudeRef = useRef(0);
  const outputAmplitudeRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  mutedRef.current = muted;

  // ── Calibration du bruit ambiant ────────────────────────────────────────
  // Le seuil d'activité (qui repousse la veille) est relevé au-dessus du bruit
  // mesuré de la pièce ; sans calibration, il vaut vadThreshold comme avant.
  const [noiseProfile, setNoiseProfile] = useState<NoiseProfile | null>(() => loadNoiseProfile());
  const [calibrating, setCalibrating] = useState(false);
  const calibrationSamplesRef = useRef<number[] | null>(null);
  const activityThresholdRef = useRef(vadThreshold);
  activityThresholdRef.current = Math.max(vadThreshold, noiseProfile?.threshold ?? 0);
  const speechGateRef = useRef(createSpeechGate());

  // Toute activité (voix, texte envoyé…) repousse la mise en veille.
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Veille sur inactivité : vérifie chaque seconde depuis quand rien ne s'est passé.
  // Un outil en cours ou Leanna en train de parler comptent comme de l'activité.
  useEffect(() => {
    if (!autoMuteEnabled || muted) return;
    lastActivityRef.current = Date.now(); // délai complet après réveil/activation
    const id = setInterval(() => {
      const out = outputAudioCtxRef.current;
      const playing = !!out && nextStartTimeRef.current > out.currentTime;
      if (isBusyRef.current || playing) {
        lastActivityRef.current = Date.now();
        return;
      }
      if (Date.now() - lastActivityRef.current >= autoMuteTimeout * 1000) {
        setMuted(true);
        mutedRef.current = true;
        setAsleep(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [autoMuteEnabled, autoMuteTimeout, muted]);

  // Wake/unmute function
  const wake = useCallback(() => {
    if (mutedRef.current) {
      setMuted(false);
      mutedRef.current = false;
    }
    setAsleep(false);
    lastActivityRef.current = Date.now();
  }, []);

  const toggleMute = useCallback(() => {
    setAsleep(false);
    setMuted(prev => !prev);
  }, []);

  // Précharge le modèle dès que la veille + réveil vocal sont actifs, pour que le
  // premier « Leanna » après l'endormissement ne soit pas perdu pendant le chargement.
  useEffect(() => {
    if (!autoMuteEnabled || !wakeWordEnabled) return;
    preloadWakeModel()
      .then(() => setWakeWordFailed(false))
      .catch((err) => {
        console.warn('[useAudio] Modèle de réveil vocal introuvable :', err);
        setWakeWordFailed(true);
      });
  }, [autoMuteEnabled, wakeWordEnabled]);

  // En veille : écoute le nom « Leanna ». Le recognizer est libéré au réveil (le modèle reste).
  useEffect(() => {
    if (!asleep || !wakeWordEnabled) return;
    let cancelled = false;
    startWakeWordListener(16000, () => {
      if (!mutedRef.current) return;
      wake();
      playSessionStartSound();
      // Rejoue le début de la phrase (« Leanna, ouvre… ») pour Gemini.
      for (const frame of prerollRef.current) onAudioDataRef.current(floatToPcm16(frame));
      prerollRef.current = [];
    }, () => wakeStrictnessRef.current)
      .then((listener) => {
        setWakeWordFailed(false);
        if (cancelled) listener.stop();
        else wakeListenerRef.current = listener;
      })
      .catch((err) => {
        console.warn('[useAudio] Réveil vocal indisponible :', err);
        setWakeWordFailed(true);
      });
    return () => {
      cancelled = true;
      wakeListenerRef.current?.stop();
      wakeListenerRef.current = null;
      prerollRef.current = [];
    };
  }, [asleep, wakeWordEnabled, wake]);

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
      const scheduledAt = nextStartTimeRef.current;
      source.start(scheduledAt);
      nextStartTimeRef.current += audioBuffer.duration;

      // Étape F : premier chunk audio PROGRAMMÉ pour lecture (source.start).
      // On réarme après chaque interruption (handleInterrupt recrée l'AudioContext).
      if (!firstAudioScheduledFiredRef.current) {
        firstAudioScheduledFiredRef.current = true;
        // Délai avant le début programmé de la lecture (horloge AudioContext).
        const scheduledInMs = Math.max(0, (scheduledAt - now) * 1000);
        // Latence de sortie matérielle/OS : outputLatency est la plus fidèle,
        // baseLatency un fallback, 0 si aucune n'est exposée par le navigateur.
        const outputLatencySec =
          (typeof audioCtx.outputLatency === 'number' ? audioCtx.outputLatency : undefined) ??
          (typeof audioCtx.baseLatency === 'number' ? audioCtx.baseLatency : undefined) ??
          0;
        onFirstAudioScheduledRef.current?.({
          scheduledInMs,
          outputLatencyMs: outputLatencySec * 1000,
        });
      }
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
      // Réarmer la sonde E : le prochain chunk sera le premier de la nouvelle réponse
      firstAudioScheduledFiredRef.current = false;

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

      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyser.smoothingTimeConstant = 0.8;
      inputAnalyserRef.current = inputAnalyser;

      // Chaîne : source → highpass → compressor → analyser → processor → destination
      source.connect(highpassFilter);
      highpassFilter.connect(compressor);
      compressor.connect(inputAnalyser);

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

        const out = outputAudioCtxRef.current;
        const leannaSpeaking = !!out && nextStartTimeRef.current > out.currentTime;

        // Calibration : on n'échantillonne que le bruit de la pièce, pas la voix de Leanna.
        if (calibrationSamplesRef.current && !leannaSpeaking) {
          calibrationSamplesRef.current.push(inAvg);
        }

        // Activité vocale : seul un son soutenu au-dessus du seuil calibré compte
        // comme de la parole. Bruit de fond et bruits brefs laissent la veille venir.
        if (!calibrationSamplesRef.current
          && speechGateRef.current.update(inAvg, activityThresholdRef.current, performance.now())) {
          markActivity();
        }

        outputAnalyser.getByteFrequencyData(outDataArray);
        const outAvg = outDataArray.reduce((a, b) => a + b, 0) / outDataArray.length;
        outputAmplitudeRef.current = Math.min(1, outAvg / 100);
      };
      tick();

      // ── Traitement d'un bloc de capture (VAD + envoi) ──────────────────
      // Logique identique quel que soit le backend (AudioWorklet ou fallback
      // ScriptProcessor). L'amplitude VAD est lue via l'analyser côté thread
      // principal, alimenté en continu par tick(), donc indépendant du backend.
      const processCaptureFrame = (channelData: Float32Array) => {
        if (mutedRef.current) {
          // En veille, l'audio part uniquement au détecteur local, jamais à Gemini.
          const listener = wakeListenerRef.current;
          if (listener) {
            const preroll = prerollRef.current;
            preroll.push(channelData);
            if (preroll.length > PREROLL_FRAMES) preroll.shift();
            listener.feed(channelData);
          }
          return;
        }

        // ── VAD (Voice Activity Detection) ──────────────────────────────
        // Économise 40-60% de bande passante en ne transmettant que les segments
        // où une voix est détectée (amplitude > seuil).
        if (vadEnabledRef.current) {
          inputAnalyser.getByteFrequencyData(dataArray);
          const amplitude = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

          if (amplitude > vadThresholdRef.current) {
            vadSilenceStartRef.current = null;
            vadSilenceFiredRef.current = false; // voix détectée → réarmer la sonde A
            // Pas de markActivity ici : la veille ne dépend que de la porte « parole »
            // (tick), sinon le bruit ambiant au-dessus du seuil VAD la repousserait.
            onAudioData(floatToPcm16(channelData));
          } else {
            if (vadSilenceStartRef.current === null) {
              vadSilenceStartRef.current = Date.now();
            }
            const silenceDuration = Date.now() - vadSilenceStartRef.current;
            if (silenceDuration < vadSilenceDurationRef.current) {
              // Silence court → continuer (pauses naturelles, respiration).
              onAudioData(floatToPcm16(channelData));
            } else {
              // Silence long → ne rien envoyer (économie de bande passante).
              // Étape A : fin de capture audio — on marque UNE SEULE fois par utterance.
              if (!vadSilenceFiredRef.current) {
                vadSilenceFiredRef.current = true;
                onVadSilenceRef.current?.();
              }
            }
          }
        } else {
          onAudioData(floatToPcm16(channelData));
        }
      };

      // ── Backend de capture : AudioWorklet (moderne) avec repli ScriptProcessor ──
      // ScriptProcessorNode est déprécié ; on privilégie AudioWorkletNode quand
      // il est disponible et chargeable, tout en gardant un repli sûr pour les
      // environnements où le worklet échoue (WebView anciennes, CSP stricte).
      let useWorklet = false;
      if (typeof AudioWorkletNode !== 'undefined' && inputCtx.audioWorklet) {
        try {
          await inputCtx.audioWorklet.addModule(getAudioWorkletModuleUrl());
          const workletNode = new AudioWorkletNode(inputCtx, 'leanna-capture-processor');
          workletNode.port.onmessage = (event) => {
            processCaptureFrame(event.data as Float32Array);
          };
          inputAnalyser.connect(workletNode);
          // Un nœud sans sortie audible : on le relie à la destination pour
          // maintenir le graphe actif sans produire de son (le worklet n'émet rien).
          workletNode.connect(inputCtx.destination);
          workletRef.current = workletNode;
          useWorklet = true;
        } catch (workletErr) {
          console.warn('[useAudio] AudioWorklet indisponible, repli sur ScriptProcessorNode:', workletErr);
        }
      }

      if (!useWorklet) {
        // Repli : ScriptProcessorNode (déprécié mais universellement supporté).
        // 2048 samples = meilleur compromis latence/stabilité.
        const processor = inputCtx.createScriptProcessor(CAPTURE_FRAME_SIZE, 1, 1);
        processorRef.current = processor;
        inputAnalyser.connect(processor);
        processor.connect(inputCtx.destination);
        processor.onaudioprocess = (e) => {
          processCaptureFrame(e.inputBuffer.getChannelData(0));
        };
      }
    } catch (err) {
      console.error('Failed to start audio', err);
      throw err;
    }
  }, [onAudioData, markActivity]);

  /** keepSleep : reconnexion GoAway → Leanna reste en veille au lieu de se réveiller seule. */
  const cleanupAudio = useCallback((keepSleep = false) => {
    cancelAnimationFrame(animFrameRef.current);
    // Une calibration en cours échouera proprement (pas assez de mesures).
    calibrationSamplesRef.current = null;

    processorRef.current?.disconnect();
    processorRef.current = null;

    if (workletRef.current) {
      try { workletRef.current.port.onmessage = null; } catch { /* ignore */ }
      workletRef.current.disconnect();
      workletRef.current = null;
    }

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

    // Reset mute state so the next session starts unmuted (sauf veille conservée)
    if (!(keepSleep && mutedRef.current)) {
      setMuted(false);
      mutedRef.current = false;
      setAsleep(false);
    }

    inputAmplitudeRef.current = 0;
    outputAmplitudeRef.current = 0;
  }, []);

  const getInputAmplitude = useCallback(() => inputAmplitudeRef.current, []);
  const getOutputAmplitude = useCallback(() => outputAmplitudeRef.current, []);
  /** Seuil d'activité vocale, sur la même échelle que getInputAmplitude (0–1). */
  const getActivityThreshold = useCallback(() => activityThresholdRef.current / 100, []);

  /**
   * Mesure le bruit ambiant pendant `durationMs` (l'utilisateur doit rester
   * silencieux) et relève le seuil d'activité au-dessus de ce bruit.
   */
  const calibrateNoise = useCallback((durationMs = DEFAULT_CALIBRATION_MS): Promise<NoiseProfile> => {
    if (!inputAnalyserRef.current) {
      return Promise.reject(new NoiseCalibrationError('unavailable', 'Micro inactif : connectez la discussion avant de calibrer.'));
    }
    if (mutedRef.current) {
      return Promise.reject(new NoiseCalibrationError('unavailable', 'Micro coupé ou en veille : réactivez-le avant de calibrer.'));
    }
    if (calibrationSamplesRef.current) {
      return Promise.reject(new NoiseCalibrationError('unavailable', 'Calibration déjà en cours.'));
    }
    calibrationSamplesRef.current = [];
    setCalibrating(true);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const samples = calibrationSamplesRef.current ?? [];
        calibrationSamplesRef.current = null;
        speechGateRef.current.reset();
        setCalibrating(false);
        try {
          const profile = computeNoiseProfile(samples, vadThresholdRef.current);
          saveNoiseProfile(profile);
          setNoiseProfile(profile);
          lastActivityRef.current = Date.now();
          resolve(profile);
        } catch (err) {
          reject(err);
        }
      }, durationMs);
    });
  }, []);

  const resetNoiseCalibration = useCallback(() => {
    saveNoiseProfile(null);
    setNoiseProfile(null);
  }, []);

  return {
    noiseProfile,
    calibrating,
    calibrateNoise,
    resetNoiseCalibration,
    getActivityThreshold,
    muted,
    asleep,
    wakeWordFailed,
    toggleMute,
    wake,
    markActivity,
    playAudioChunk,
    handleInterrupt,
    initAudio,
    cleanupAudio,
    getInputAmplitude,
    getOutputAmplitude,
  };
}

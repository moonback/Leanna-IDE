import { WebSocket, WebSocketServer } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import type { ProfileConfig } from '../prompts/systemInstruction.js';
import { normalizeRoxaneConfig } from './types.js';
import { recordModelCallUsage } from '../utils/textGeneration.js';

interface Deps {
  getProfile: () => ProfileConfig & Record<string, any>;
  createGeminiAI: () => GoogleGenAI;
  activeGeminiSessions: Set<any>;
}

const MAX_TOPIC = 3000;
const MAX_CONTEXT = 14000;
const MAX_TURNS = 8;

export function attachRoxaneLiveWebSocket(wss: WebSocketServer, deps: Deps): void {
  wss.on('connection', (client: WebSocket) => {
    const profile = deps.getProfile();
    const config = normalizeRoxaneConfig(profile.roxane);
    let leanna: any = null;
    let roxane: any = null;
    let closed = false;
    let started = false;
    let finished = false;
    let durationTimer: ReturnType<typeof setTimeout> | null = null;
    let active: 'leanna' | 'roxane' = 'leanna';
    let rounds = 0;
    let currentText = '';
    let lastLeannaText = '';
    let lastRoxaneText = '';
    let topic = '';
    let context = '';
    const transcript: Array<{ speaker: 'leanna' | 'roxane' | 'user'; text: string; round: number }> = [];
    const send = (payload: unknown) => {
      if (!closed && client.readyState === WebSocket.OPEN) {
        try { client.send(JSON.stringify(payload)); } catch { /* disconnected */ }
      }
    };
    const closeSessions = () => {
      if (closed) return;
      closed = true;
      if (durationTimer) { clearTimeout(durationTimer); durationTimer = null; }
      for (const session of [leanna, roxane]) {
        if (!session) continue;
        try { session.close(); } catch { /* already closed */ }
        deps.activeGeminiSessions.delete(session);
      }
    };
    const rolePrompt = (role: 'leanna' | 'roxane') => role === 'leanna'
      ? [
          `Tu es ${profile.aiName || 'Leanna'}, l'assistante principale de l'utilisateur.`,
          'Tu défends une approche pragmatique, structurée et réalisable. Tu écoutes les objections de Roxane et ajustes honnêtement ton analyse.',
          'Tu parles directement à l’utilisateur en français oral. Réponses courtes, naturelles, sans markdown.',
          'Tu dois attendre ton tour : tu réponds uniquement quand un message utilisateur te sollicite.',
        ].join(' ')
      : [
          config.systemPrompt,
          `Tu es ${config.name}, la seconde voix du débat.`,
          `Langue : ${config.language}. Style : ${config.responseStyle}.`,
          'Tu apportes un regard différent. Tu es indépendante de Leanna et tu apportes un regard différent.',
          `Niveau de contradiction : ${config.contradictionLevel}/100.`,
          'Tu réponds en français oral, de manière concise. Tu ne contredis pas artificiellement.',
          'Tu dois attendre ton tour : tu réponds uniquement quand un message utilisateur te sollicite.',
        ].join(' ');

    const connectSession = async (role: 'leanna' | 'roxane') => {
      const voiceName = role === 'roxane' ? config.voice : (profile.aiVoice || 'Aoede');
      const liveModel = role === 'roxane' ? config.model : 'gemini-3.8-live';
      const session = await deps.createGeminiAI().live.connect({
        model: liveModel,
        config: {
          responseModalities: role === 'roxane' && !config.useSpeech ? [Modality.TEXT] : [Modality.AUDIO],
          temperature: role === 'roxane' ? config.temperature : (profile.temperature ?? 0.7),
          topP: role === 'roxane' ? config.topP : undefined,
          maxOutputTokens: role === 'roxane' ? config.maxTokens : undefined,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: { parts: [{ text: rolePrompt(role) }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (message.usageMetadata) {
              recordModelCallUsage({
                provider: 'gemini', model: role === 'roxane' ? config.model : 'gemini-3.8-live', rawUsage: message.usageMetadata,
                promptCharCount: 0, outputText: '', toolName: `roxane_debate_live_${role}`, kind: 'live',
              });
            }
            if (active === role) {
              const parts = message.serverContent?.modelTurn?.parts ?? [];
              for (const part of parts) {
                const audio = part.inlineData?.data;
                if (audio) send({ type: 'audio', speaker: role, data: audio, mimeType: part.inlineData?.mimeType || 'audio/pcm;rate=24000' });
              }
              const transcription = (message.serverContent as any)?.outputTranscription?.text;
              const textParts = parts.map(part => part.text).filter((value): value is string => typeof value === 'string').join('');
              const output = typeof transcription === 'string' && transcription ? transcription : textParts;
              if (output) {
                currentText += output;
                send({ type: 'transcript_delta', speaker: role, text: output });
              }
            }
            const inputTranscript = (message.serverContent as any)?.inputTranscription?.text;
            if (!finished && typeof inputTranscript === 'string' && inputTranscript.trim()) {
              if (transcript.length < 32) transcript.push({ speaker: 'user', text: inputTranscript.trim().slice(0, 3000), round: rounds + 1 });
              send({ type: 'user_transcript', text: inputTranscript });
            }
            if (message.serverContent?.interrupted) send({ type: 'interrupted', speaker: role });
            if (message.serverContent?.turnComplete && active === role && !finished) {
              const completed = currentText.trim();
              currentText = '';
              if (role === 'leanna') {
                lastLeannaText = completed;
                transcript.push({ speaker: 'leanna', text: completed, round: rounds + 1 });
                send({ type: 'turn_complete', speaker: role, text: completed, round: rounds + 1 });
                if (rounds < Math.min(config.maxRounds, MAX_TURNS)) {
                  try { leanna?.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* best effort */ }
                  active = 'roxane';
                  roxane?.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: `Leanna vient de dire : ${completed || '(réponse vocale sans transcription)'}\nRéponds directement à son argument, puis donne ton avis à l'utilisateur.` }] }],
                    turnComplete: true,
                  });
                } else { finished = true; send({ type: 'debate_complete', turns: transcript }); }
              } else {
                lastRoxaneText = completed;
                transcript.push({ speaker: 'roxane', text: completed, round: rounds + 1 });
                send({ type: 'turn_complete', speaker: role, text: completed, round: rounds + 1 });
                rounds += 1;
                if (rounds < Math.min(config.maxRounds, MAX_TURNS)) {
                  try { roxane?.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* best effort */ }
                  active = 'leanna';
                  leanna?.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: `Roxane vient de répondre : ${completed || '(réponse vocale sans transcription)'}\nRéponds à son objection et poursuis le débat avec une proposition améliorée.` }] }],
                    turnComplete: true,
                  });
                } else {
                  finished = true;
                  send({ type: 'debate_complete', lastLeannaText, lastRoxaneText, turns: transcript });
                }
              }
            }
          },
          onerror: (error: unknown) => {
            console.error(`[RoxaneLive][${role}] Gemini session error`, error);
            send({ type: 'error', message: `Erreur de la session vocale ${role === 'roxane' ? 'Roxane' : 'Leanna'}.` });
          },
          onclose: () => {
            if (!closed) {
              send({ type: 'session_closed', speaker: role });
              closeSessions();
            }
          },
        },
      });
      deps.activeGeminiSessions.add(session);
      return session;
    };

    const start = async (message: any) => {
      if (started) { send({ type: 'error', message: 'Cette connexion de débat a déjà démarré.' }); return; }
      started = true;
      if (!config.enabled) { send({ type: 'error', message: 'Roxane est désactivée dans les paramètres.' }); return; }
      if (deps.activeGeminiSessions.size >= 16) { send({ type: 'error', message: 'Trop de sessions Gemini Live sont déjà actives. Ferme une autre session puis réessaie.' }); return; }
      if (config.provider !== 'gemini') { send({ type: 'error', message: 'Le mode vocal Live nécessite Google Gemini. OpenRouter reste disponible pour les débats texte.' }); return; }
      if (!/-live(?:-|$)/i.test(config.model)) { send({ type: 'error', message: 'Choisis un identifiant de modèle compatible Gemini Live dans les réglages de Roxane.' }); return; }
      topic = typeof message.topic === 'string' ? message.topic.trim().slice(0, MAX_TOPIC) : '';
      context = typeof message.context === 'string' ? message.context.slice(-MAX_CONTEXT) : '';
      if (!topic) { send({ type: 'error', message: 'Le sujet du débat est obligatoire.' }); return; }
      send({ type: 'status', status: 'connecting' });
      try {
        const settled = await Promise.allSettled([connectSession('leanna'), connectSession('roxane')]);
        const opened = settled.filter((item): item is PromiseFulfilledResult<any> => item.status === 'fulfilled').map(item => item.value);
        if (settled.some(item => item.status === 'rejected')) {
          for (const session of opened) {
            try { session.close(); } catch { /* already closed */ }
            deps.activeGeminiSessions.delete(session);
          }
          throw settled.find(item => item.status === 'rejected')?.status === 'rejected'
            ? (settled.find(item => item.status === 'rejected') as PromiseRejectedResult).reason
            : new Error('Session Live non disponible.');
        }
        leanna = settled[0].status === 'fulfilled' ? settled[0].value : null;
        roxane = settled[1].status === 'fulfilled' ? settled[1].value : null;
        if (closed) {
          for (const session of [leanna, roxane]) {
            if (!session) continue;
            try { session.close(); } catch { /* already closed */ }
            deps.activeGeminiSessions.delete(session);
          }
          return;
        }
        send({ type: 'ready', topic, models: { leanna: 'gemini-3.8-live', roxane: config.model } });
        durationTimer = setTimeout(() => {
          if (finished || closed) return;
          finished = true;
          send({ type: 'debate_complete', turns: transcript, reason: 'time_limit' });
          closeSessions();
        }, config.maxDurationSeconds * 1000);
        active = 'leanna';
        rounds = 1;
        currentText = '';
        leanna.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: `Sujet à débattre : ${topic}\nContexte récent de la conversation :\n${context || '(aucun)'}\n\nPrésente ta première analyse à voix haute en moins de 90 secondes. Adresse-toi à l'utilisateur.` }] }],
          turnComplete: true,
        });
      } catch (error) {
        console.error('[RoxaneLive] Impossible de créer les deux sessions Gemini Live', error);
        send({ type: 'error', message: 'Impossible de démarrer les deux sessions Gemini Live. Vérifie les clés et le modèle Live.' });
        closeSessions();
      }
    };

    client.on('message', (raw, isBinary) => {
      if (isBinary) {
        if (finished) return;
        const target = active === 'leanna' ? leanna : roxane;
        if (target && !closed) {
          try {
            target.sendRealtimeInput({
              audio: { data: Buffer.from(raw as Buffer).toString('base64'), mimeType: 'audio/pcm;rate=16000' },
            });
          } catch (error) {
            console.warn('[RoxaneLive] Microphone frame rejected:', error instanceof Error ? error.message : String(error));
          }
        }
        return;
      }
      let message: any;
      try { message = JSON.parse(raw.toString()); } catch { send({ type: 'error', message: 'Message WebSocket invalide.' }); return; }
      if (message.type === 'start') { void start(message); return; }
      if (message.type === 'mic_stop' && !finished) {
        const target = active === 'leanna' ? leanna : roxane;
        try { target?.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* best effort */ }
        return;
      }
      if (message.type === 'interrupt') {
        send({ type: 'interrupted_by_user' });
        closeSessions();
        return;
      }
      if (message.type === 'user_interjection' && !finished && typeof message.text === 'string' && message.text.trim()) {
        const text = message.text.trim().slice(0, 3000);
        if (transcript.length < 32) transcript.push({ speaker: 'user', text, round: rounds + 1 });
        send({ type: 'user_interjection', text });
        const target = active === 'leanna' ? leanna : roxane;
        target?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `L'utilisateur interrompt le débat et précise : ${text}. Réponds directement à cette intervention avant de poursuivre.` }] }], turnComplete: true });
      }
    });

    client.on('close', closeSessions);
    client.on('error', (error) => { console.error('[RoxaneLive] WebSocket client error', error); closeSessions(); });
  });
}

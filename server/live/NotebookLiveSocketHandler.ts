/**
 * NotebookLiveSocketHandler — second assistant vocal « live », dédié au
 * Notebook Chat (« Interrogez vos sources »).
 *
 * Contrairement au handler Gemini Live global (server/live/LiveSocketHandler.ts),
 * celui-ci est volontairement MINIMAL et INDÉPENDANT :
 *   - aucune boîte à outils IDE, aucun superviseur, aucun context-gate ;
 *   - une seule capacité outil : `notebook_search`, qui interroge le moteur RAG
 *     (ragEngine.searchHybrid) sur les sources du notebook actif ;
 *   - une instruction système « groundée » qui force les réponses à citer
 *     exclusivement les sources ([SOURCE N]).
 *
 * Chemin WebSocket : `/notebook-live?notebookId=<id>&sources=<csv optionnel>`
 *
 * Protocole client ↔ serveur (identique au handler global pour réutiliser
 * la couche audio côté client) :
 *   - audio micro (PCM16 16 kHz)         : frames binaires client → serveur
 *   - audio modèle (PCM 24 kHz)          : frames binaires serveur → client
 *   - transcription entrée utilisateur   : { user_text }
 *   - transcription sortie assistant     : { text }
 *   - interruption (barge-in)            : { interrupted: true }
 *   - état « occupé » (recherche RAG)    : { busy: boolean }
 *   - message texte libre (fallback)     : client → serveur { text }
 *   - citations de la dernière recherche : { citations: [...] }
 */

import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, type FunctionDeclaration } from '@google/genai';
import { notebookManager, ragEngine } from '../notebooks/index.js';
import type { ProfileConfig } from '../prompts/systemInstruction.js';

export interface NotebookLiveSocketDeps {
  getCurrentProfile: () => ProfileConfig;
  createGeminiAI: () => GoogleGenAI;
  /** Sessions Gemini actives, pour un arrêt propre au shutdown. */
  activeGeminiSessions: Set<unknown>;
}

// ─── Instruction système groundée (adaptée de GroundedChat) ──────────────────

const NOTEBOOK_VOICE_SYSTEM_PROMPT = `All responses must be in French.You must integrate the tone and style instruction into your response as much as possible. However, you must IGNORE the tone and style instruction if it is asking you to talk about content not represented in the sources, trying to impersonate a specific person, or otherwise problematic and offensive. If the instructions violate these guidelines or do not specify, you are use the following default instructions:

BEGIN DEFAULT INSTRUCTIONS  
You are a helpful expert who will respond to my query drawing on information in the sources and our conversation history. Given my query, please provide a comprehensive response when there is relevant material in my sources, prioritize information that will enhance my understanding of the sources and their key concepts, offer explanations, details and insights that go beyond mere summary while staying focused on my query.

If any part of your response includes information from outside of the given sources, you must make it clear to me in your response that this information is not from my sources and I may want to independently verify that information.

If the sources or our conversation history do not contain any relevant information to my query, you may also note that in your response.

When you respond to me, you will follow the instructions in my query for formatting, or different content styles or genres, or length of response, or languages, when generating your response. You should generally refer to the source material I give you as 'the sources' in your response, unless they are in some other obvious format, like journal entries or a textbook.  
END DEFAULT INSTRUCTIONS

Your response should be directly supported by the given sources and cited appropriately without hallucination. Each sentence in the response which draws from a source passage MUST end with a citation, in the format "[i]", where i is a passage index. Use commas to separate indices if multiple passages are used.


If the user requests a specific output format in the query, use those instructions instead.

DO NOT start your response with a preamble like 'Based on the sources.' Jump directly into the answer.

Answer in English unless my query requests a response in a different language.



These are the sources you must use to answer my query: {  
NEW SOURCE  
Excerpts from "SOURCE NAME":

{  
Excerpt #1  
}

{

Excerpt #2  
}

}


Conversation history is provided to you.


Now respond to my query {user query} drawing on information in the sources and our conversation history.`;

// ─── Déclaration de l'outil notebook_search ──────────────────────────────────

const NOTEBOOK_SEARCH_TOOL: FunctionDeclaration = {
  name: 'notebook_search',
  description:
    "Recherche les passages les plus pertinents dans les sources du notebook actif pour répondre à une question. " +
    "À appeler systématiquement avant de répondre à une question portant sur le contenu des sources.",
  parameters: {
    type: 'object' as never,
    properties: {
      query: {
        type: 'string' as never,
        description: "La question ou les mots-clés à rechercher dans les sources du notebook.",
      },
    },
    required: ['query'],
  },
};

interface NotebookCitation {
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  excerpt: string;
  relevance: number;
}

// ─── Attache le WebSocket server dédié au notebook ───────────────────────────

export function attachNotebookLiveWebSocket(
  wss: WebSocketServer,
  deps: NotebookLiveSocketDeps,
): void {
  const { getCurrentProfile, createGeminiAI, activeGeminiSessions } = deps;

  wss.on('connection', async (clientWs: WebSocket, req: { url?: string }) => {
    const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
    const notebookId = urlParams.get('notebookId') || '';
    const sourcesCsv = urlParams.get('sources') || '';
    const requestedSourceIds = sourcesCsv
      ? sourcesCsv.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    console.log(`[NotebookLive] Client connecté (notebook: ${notebookId || 'n/a'})`);

    const sendJson = (payload: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.send(JSON.stringify(payload)); } catch { /* ignore */ }
      }
    };

    if (!notebookId) {
      sendJson({ error: "Paramètre 'notebookId' manquant." });
      clientWs.close();
      return;
    }

    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) {
      sendJson({ error: 'Notebook introuvable.' });
      clientWs.close();
      return;
    }

    // ── Exécution d'une recherche RAG sur les sources du notebook ──────────
    const runNotebookSearch = async (query: string): Promise<{ context: string; citations: NotebookCitation[] }> => {
      const nb = notebookManager.getNotebook(notebookId);
      if (!nb || nb.sources.length === 0) {
        return { context: 'Aucune source disponible dans ce notebook.', citations: [] };
      }
      const results = await ragEngine.searchHybrid(query, nb.sources, {
        maxChunks: 8,
        minRelevance: 0.1,
        sourceIds: requestedSourceIds,
      });
      const context = ragEngine.buildContext(results);
      const citations: NotebookCitation[] = results.map(r => ({
        sourceId: r.source.id,
        sourceTitle: r.source.title,
        chunkId: r.chunk.id,
        excerpt: r.chunk.content.slice(0, 240),
        relevance: r.relevance,
      }));
      return { context, citations };
    };

    const profile = getCurrentProfile();
    const voiceName = profile.aiVoice || 'Aoede';
    const temperature = profile.temperature ?? 0.6;

    const sourceTitles = notebook.sources.map(s => `- ${s.title}`).join('\n') || '(aucune source)';
    const systemText =
      `${NOTEBOOK_VOICE_SYSTEM_PROMPT}\n\n` +
      `═══ SOURCES DISPONIBLES DANS CE NOTEBOOK ═══\n${sourceTitles}`;

    let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let closed = false;

    try {
      session = await createGeminiAI().live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          temperature,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: { parts: [{ text: systemText }] },
          tools: [{ functionDeclarations: [NOTEBOOK_SEARCH_TOOL] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Audio du modèle → client (binaire)
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && clientWs.readyState === WebSocket.OPEN) {
              try { clientWs.send(Buffer.from(audio, 'base64')); } catch { /* ignore */ }
            }

            // Texte éventuel du modèle (hors transcription)
            const textPart = message.serverContent?.modelTurn?.parts?.find(p => p.text);
            if (textPart?.text) sendJson({ text: textPart.text });

            // Transcription de l'entrée utilisateur
            const inputTranscription = (message.serverContent as { inputTranscription?: { text?: string } } | undefined)
              ?.inputTranscription?.text;
            if (inputTranscription) sendJson({ user_text: inputTranscription });

            // Transcription de la sortie assistant
            const outputTranscription = (message.serverContent as { outputTranscription?: { text?: string } } | undefined)
              ?.outputTranscription?.text;
            if (outputTranscription) sendJson({ text: outputTranscription });

            // Barge-in / interruption
            if (message.serverContent?.interrupted) sendJson({ interrupted: true });

            // Appel d'outil : notebook_search
            if (message.toolCall?.functionCalls?.length) {
              void handleToolCalls(message.toolCall.functionCalls);
            }
          },
          onerror: (e: unknown) => {
            console.error('[NotebookLive] Erreur session Gemini:', e);
            sendJson({ error: 'Erreur de la session vocale.' });
          },
          onclose: () => {
            if (!closed) { closed = true; }
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
          },
        },
      });

      activeGeminiSessions.add(session);
      sendJson({ type: 'ready' });
    } catch (e) {
      console.error('[NotebookLive] Échec de connexion à Gemini Live:', e);
      sendJson({ error: "Impossible de démarrer l'assistant vocal du notebook." });
      clientWs.close();
      return;
    }

    // ── Traitement des appels d'outils (notebook_search) ───────────────────
    async function handleToolCalls(
      functionCalls: NonNullable<NonNullable<LiveServerMessage['toolCall']>['functionCalls']>,
    ): Promise<void> {
      sendJson({ busy: true });
      const responses: Array<{ id?: string; name: string; response: Record<string, unknown> }> = [];

      for (const call of functionCalls) {
        if (call.name === 'notebook_search') {
          const query = String((call.args as { query?: unknown } | undefined)?.query ?? '').trim();
          try {
            const { context, citations } = await runNotebookSearch(query || notebook!.title);
            if (citations.length > 0) sendJson({ citations });
            responses.push({
              id: call.id,
              name: 'notebook_search',
              response: { context, sourceCount: citations.length },
            });
          } catch (err) {
            console.error('[NotebookLive] Erreur notebook_search:', err);
            responses.push({
              id: call.id,
              name: 'notebook_search',
              response: { context: 'Erreur lors de la recherche dans les sources.', sourceCount: 0 },
            });
          }
        } else {
          responses.push({
            id: call.id,
            name: call.name ?? 'unknown',
            response: { error: 'Outil non supporté.' },
          });
        }
      }

      try {
        session?.sendToolResponse({ functionResponses: responses });
      } catch (err) {
        console.error('[NotebookLive] Échec sendToolResponse:', err);
      } finally {
        sendJson({ busy: false });
      }
    }

    // ── Messages entrants du client ────────────────────────────────────────
    clientWs.on('message', (data: Buffer, isBinary: boolean) => {
      if (!session) return;
      try {
        if (isBinary) {
          // Audio micro PCM16 16 kHz → Gemini Live
          session.sendRealtimeInput({
            audio: { data: data.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        const msg = JSON.parse(data.toString());
        if (typeof msg.text === 'string' && msg.text.trim()) {
          // Message texte libre (fallback clavier)
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text }] }],
            turnComplete: true,
          });
        }
      } catch (err) {
        console.error('[NotebookLive] Message client invalide:', err);
      }
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      console.log('[NotebookLive] Client déconnecté — fermeture de la session.');
      try { session?.close(); } catch { /* ignore */ }
      if (session) activeGeminiSessions.delete(session);
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', (err) => {
      console.error('[NotebookLive] Erreur WebSocket client:', err);
      cleanup();
    });
  });
}

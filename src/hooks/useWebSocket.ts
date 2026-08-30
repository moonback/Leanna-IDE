import { useState, useRef, useCallback, useEffect } from 'react';
import type { ConnectionStatus } from './useLiveAPI.js';

export interface UseWebSocketOptions {
  onMessage: (msg: any) => void;
  onLog: (msg: string, type: 'system' | 'action' | 'error' | 'info') => void;
}

export function useWebSocket({ onMessage, onLog }: UseWebSocketOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const statusRef = useRef<ConnectionStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  // ── auto-reconnect ────────────────────────────────────────────────────────
  const reconnectSkillsRef = useRef<string[]>([]);
  const reconnectModeRef = useRef<'full' | 'ask'>('full');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);
  // Flag positionné par handleGoAway pour distinguer une fermeture GoAway
  // (code 1000 "propre" côté Gemini) d'une déconnexion volontaire de l'utilisateur.
  const goAwayPendingRef = useRef(false);
  // conversation_id transmis par le serveur dans le message session_restart,
  // utilisé pour reprendre la session sans perdre l'historique.
  const pendingConversationIdRef = useRef<string | null>(null);
  // Flag pour distinguer un redémarrage après dépassement de tokens (context_overflow)
  const contextOverflowPendingRef = useRef(false);
  // Résumé issu du message session_restart (context_overflow), à injecter lors de la reconnexion
  // si Supabase n'est pas disponible ou que le résumé n'est pas encore en DB.
  const pendingContextSummaryRef = useRef<string>('');
  // Refs stables pour onInitAudio / onCleanupAudio (évite de les recaptuler)
  const onInitAudioRef = useRef<(() => Promise<void>) | null>(null);
  const onCleanupAudioRef = useRef<(() => void) | null>(null);

  const RECONNECT_MAX = 5;
  const RECONNECT_BASE_MS = 2000;

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  // Keep statusRef in sync so connect() closures always see the latest value
  statusRef.current = status;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback((intentional = true) => {
    if (intentional) {
      intentionalDisconnectRef.current = true;
      clearReconnectTimer();
      reconnectCountRef.current = 0;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close();
    }
    wsRef.current = null;
    setStatus('idle');
    onLog(intentional ? 'Disconnected' : 'Connection lost', 'system');
  }, [onLog, clearReconnectTimer]);

  const connect = useCallback((activeSkills: string[] = [], mode: 'full' | 'ask' = 'full', onInitAudio: () => Promise<void>, onCleanupAudio: () => void) => {
    if (statusRef.current !== 'idle') return;
    intentionalDisconnectRef.current = false;
    reconnectSkillsRef.current = activeSkills;
    reconnectModeRef.current = mode;
    // Mémoriser les callbacks audio pour les réutiliser lors des reconnexions GoAway
    onInitAudioRef.current = onInitAudio;
    onCleanupAudioRef.current = onCleanupAudio;
    setStatus('connecting');
    onLog('Initializing...', 'system');

    // Helper for scheduling reconnect
    const scheduleReconnect = (conversationId?: string | null) => {
      if (reconnectCountRef.current >= RECONNECT_MAX) {
        onLog(`Reconnexion abandonnée après ${RECONNECT_MAX} tentatives.`, 'error');
        reconnectCountRef.current = 0;
        return;
      }
      const attempt = reconnectCountRef.current + 1;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), 30_000);
      reconnectCountRef.current = attempt;
      onLog(`Reconnexion dans ${delay / 1000}s… (tentative ${attempt}/${RECONNECT_MAX})`, 'system');
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectWithConversationId(
          reconnectSkillsRef.current,
          reconnectModeRef.current,
          onInitAudioRef.current!,
          onCleanupAudioRef.current!,
          conversationId ?? null,
        );
      }, delay);
    };

    // Fonction interne qui accepte un conversation_id optionnel pour la reprise de session.
    // Nommée séparément pour éviter l'appel circulaire avec connect() (qui vérifie status !== 'idle').
    const connectWithConversationId = (
      skills: string[],
      sessionMode: 'full' | 'ask',
      initAudio: () => Promise<void>,
      cleanupAudio: () => void,
      conversationId: string | null,
    ) => {
      setStatus('connecting');
      initAudio().then(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const params = new URLSearchParams();
        if (skills.length > 0) params.set('skills', skills.join(','));
        if (sessionMode) params.set('mode', sessionMode);
        // Reprendre la conversation existante pour conserver l'historique côté serveur
        if (conversationId) params.set('conversation_id', conversationId);
        // Signaler au serveur qu'il faut injecter le résumé de contexte (context_overflow)
        if (contextOverflowPendingRef.current) {
          params.set('context_resume', '1');
          contextOverflowPendingRef.current = false;
        }
        const token = localStorage.getItem('Leanna_api_token');
        if (token) params.set('token', token);
        const query = params.toString() ? `?${params.toString()}` : '';
        const ws = new WebSocket(`${protocol}//${window.location.host}/live${query}`);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectCountRef.current = 0; // reset après reconnexion réussie
          goAwayPendingRef.current = false;
          setStatus('connected');
          onLog(conversationId ? (pendingContextSummaryRef.current ? 'Session reprise après dépassement de tokens (avec résumé de contexte)' : 'Session reprise après expiration GoAway') : 'Connected to Core', 'info');          // Injecter le résumé de contexte si disponible (fallback client-side pour context_overflow)
          // Le serveur l'injecte aussi via context_resume=1, mais ce message garantit
          // que le contexte est disponible même si Supabase est indisponible.
          if (pendingContextSummaryRef.current) {
            const summary = pendingContextSummaryRef.current;
            pendingContextSummaryRef.current = '';
            // Petit délai pour s'assurer que la session Gemini côté serveur est prête
            setTimeout(() => {
              try {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'context_resume_summary', summary }));
                }
              } catch {}
            }, 800);
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            // ── Intercepter session_restart (GoAway ou Context Overflow) ──────────────────────
            // Le serveur envoie ce message quelques secondes AVANT que la
            // session Gemini n'expire, ce qui nous laisse le temps de reconnecter
            // proprement sans couper l'utilisateur au milieu d'une phrase.
            if (msg.type === 'session_restart' && (msg.reason === 'goaway' || msg.reason === 'context_overflow')) {
              const convId: string | null = msg.conversation_id ?? null;
              if (msg.reason === 'context_overflow') {
                onLog(`Limite de tokens atteinte — redémarrage automatique avec résumé de la conversation${convId ? ` (conv: ${convId.slice(0, 8)})` : ''}`, 'system');
                contextOverflowPendingRef.current = true;
                // Sauvegarder le résumé pour l'injecter lors de la reconnexion (fallback si Supabase indisponible)
                pendingContextSummaryRef.current = msg.summary || '';
              } else {
                onLog(`Session Gemini expirée (GoAway) — reprise automatique${convId ? ` (conv: ${convId.slice(0, 8)})` : ''}`, 'system');
                contextOverflowPendingRef.current = false;
                pendingContextSummaryRef.current = '';
              }
              goAwayPendingRef.current = true;
              pendingConversationIdRef.current = convId;
              // Propager le message à onMessage pour que useLiveAPI puisse injecter le résumé dans le transcript
              if (msg.reason === 'context_overflow') {
                onMessage(msg);
              }
              // Fermer proactivement la WebSocket pour déclencher onclose → reconnexion
              // (le serveur est censé la fermer aussi, mais ce filet de sécurité garantit
              // que la reconnexion démarre même si le serveur oublie).
              try {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
                  setTimeout(() => ws.close(), 100);
                }
              } catch {}
              return;
            }

            onMessage(msg);
          } catch (err) {
            console.error('Failed to parse WebSocket message', err);
          }
        };

        ws.onclose = (evt) => {
          cleanupAudio();

          // Déconnexion volontaire de l'utilisateur → pas de reconnexion
          if (intentionalDisconnectRef.current) {
            intentionalDisconnectRef.current = false;
            wsRef.current = null;
            setStatus('idle');
            onLog('Disconnected', 'system');
            return;
          }

          wsRef.current = null;
          setStatus('idle');

          if (goAwayPendingRef.current) {
            // Fermeture déclenchée par GoAway : reconnecter immédiatement (0ms) en
            // reprenant le même conversation_id pour que le contexte soit continu.
            const convId = pendingConversationIdRef.current;
            goAwayPendingRef.current = false;
            pendingConversationIdRef.current = null;
            onLog('Reconnexion immédiate après GoAway…', 'system');
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              connectWithConversationId(
                reconnectSkillsRef.current,
                reconnectModeRef.current,
                onInitAudioRef.current!,
                onCleanupAudioRef.current!,
                convId,
              );
            }, 500); // délai court pour laisser Gemini fermer proprement sa side
            return;
          }

          const isClean = evt.wasClean && evt.code === 1000;
          onLog(isClean ? 'Connection lost' : 'Connection lost', 'system');
          if (!isClean) scheduleReconnect(null);
        };

        ws.onerror = () => {
          onLog('Connection error', 'error');
        };
      }).catch(err => {
        console.error('Failed to initialize audio', err);
        onLog('Failed to start audio / WebSocket', 'error');
        setStatus('idle');
      });
    };

    onInitAudio().then(() => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams();
      if (activeSkills.length > 0) params.set('skills', activeSkills.join(','));
      if (mode) params.set('mode', mode);
      const token = localStorage.getItem('Leanna_api_token');
      if (token) params.set('token', token);
      const query = params.toString() ? `?${params.toString()}` : '';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live${query}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectCountRef.current = 0;
        setStatus('connected');
        onLog('Connected to Core', 'info');
        // Injecter le résumé de contexte si disponible (cas de reconnexion context_overflow
        // déclenchée avant que goAwayPendingRef ait pu router vers connectWithConversationId)
        if (pendingContextSummaryRef.current) {
          const summary = pendingContextSummaryRef.current;
          pendingContextSummaryRef.current = '';
          setTimeout(() => {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'context_resume_summary', summary }));
              }
            } catch {}
          }, 800);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // ── Intercepter session_restart (GoAway ou Context Overflow) ──────────────────────
          if (msg.type === 'session_restart' && (msg.reason === 'goaway' || msg.reason === 'context_overflow')) {
            const convId: string | null = msg.conversation_id ?? null;
            if (msg.reason === 'context_overflow') {
              onLog(`Limite de tokens atteinte — redémarrage automatique avec résumé de la conversation${convId ? ` (conv: ${convId.slice(0, 8)})` : ''}`, 'system');
              contextOverflowPendingRef.current = true;
              // Sauvegarder le résumé pour l'injecter lors de la reconnexion (fallback si Supabase indisponible)
              pendingContextSummaryRef.current = msg.summary || '';
            } else {
              onLog(`Session Gemini expirée (GoAway) — reprise automatique${convId ? ` (conv: ${convId.slice(0, 8)})` : ''}`, 'system');
              contextOverflowPendingRef.current = false;
              pendingContextSummaryRef.current = '';
            }
            goAwayPendingRef.current = true;
            pendingConversationIdRef.current = convId;
            if (msg.reason === 'context_overflow') {
              onMessage(msg);
            }
            // Fermer proactivement la WebSocket pour déclencher onclose → reconnexion
            // (le serveur est censé la fermer aussi, mais ce filet de sécurité garantit
            // que la reconnexion démarre même si le serveur oublie).
            try {
              if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                setTimeout(() => ws.close(), 100);
              }
            } catch {}
            return;
          }

          onMessage(msg);
        } catch (err) {
          console.error('Failed to parse WebSocket message', err);
        }
      };

      ws.onclose = (evt) => {
        onCleanupAudio();

        if (intentionalDisconnectRef.current) {
          intentionalDisconnectRef.current = false;
          wsRef.current = null;
          setStatus('idle');
          onLog('Disconnected', 'system');
          return;
        }

        wsRef.current = null;
        setStatus('idle');

        if (goAwayPendingRef.current) {
          const convId = pendingConversationIdRef.current;
          goAwayPendingRef.current = false;
          pendingConversationIdRef.current = null;
          onLog('Reconnexion immédiate après GoAway…', 'system');
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connectWithConversationId(
              reconnectSkillsRef.current,
              reconnectModeRef.current,
              onInitAudioRef.current!,
              onCleanupAudioRef.current!,
              convId,
            );
          }, 500);
          return;
        }

        const isClean = evt.wasClean && evt.code === 1000;
        onLog('Connection lost', 'system');
        if (!isClean) scheduleReconnect(null);
      };

      ws.onerror = () => {
        onLog('Connection error', 'error');
      };
    }).catch(err => {
      console.error('Failed to initialize audio', err);
      onLog('Failed to start audio / WebSocket', 'error');
      setStatus('idle');
    });
  }, [onLog, disconnect]);



  useEffect(() => () => {
    clearReconnectTimer();
    const ws = wsRef.current;
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close(1000, 'component unmounted');
    }
    wsRef.current = null;
    onCleanupAudioRef.current?.();
  }, [clearReconnectTimer]);

  const sendAudioData = useCallback((base64Data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ audio: base64Data }));
    }
  }, []);

  const sendVideoFrame = useCallback((base64Data: string, mimeType = 'image/jpeg') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        video: { data: base64Data.split(',')[1] ?? base64Data, mimeType },
      }));
    }
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
    }
  }, []);

  const sendRawMessage = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return {
    status,
    connected,
    connecting,
    connect,
    disconnect,
    sendAudioData,
    sendVideoFrame,
    sendTextMessage,
    sendRawMessage,
  };
}

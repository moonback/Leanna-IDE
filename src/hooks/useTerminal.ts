import { useState, useCallback, useEffect, useRef } from 'react';

// Types pour les messages du terminal
export interface TerminalMessage {
  type: 'output' | 'error' | 'close';
  data?: string;
  code?: number;
}

interface TerminalSize {
  cols: number;
  rows: number;
}

// Résolution du port serveur (similaire à ce qui est fait dans IdeView)
// Utiliser window.location.port si disponible, sinon le port par défaut
const getServerPort = (): number => {
  // Si on est sur le même hôte que le serveur Vite, utiliser le port du serveur backend
  // qui est généralement 5000 en dev, ou le port configuré
  if (typeof window !== 'undefined') {
    // Le serveur backend est généralement sur le port 5000
    // Mais si VITE_SERVER_PORT est défini dans l'environnement au build time, l'utiliser
    const envPort = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_SERVER_PORT;
    return Number(envPort) || 5000;
  }
  return 5000;
};

// URL base pour le serveur WebSocket
export function getTerminalWebSocketUrl(token: string | null = null): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = getServerPort();
  const baseUrl = `${protocol}//${host}:${port}`;
  
  if (token) {
    return `${baseUrl}/terminal?token=${encodeURIComponent(token)}`;
  }
  return `${baseUrl}/terminal`;
}

export interface TerminalState {
  isConnected: boolean;
  output: string;
  error: string | null;
  isConnecting: boolean;
}

export interface TerminalActions {
  sendInput: (input: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
  clear: () => void;
  reconnect: () => void;
}

export function useTerminal(initialCols = 80, initialRows = 24): [TerminalState, TerminalActions] {
  const [isConnected, setIsConnected] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const sizeRef = useRef<TerminalSize>({ cols: initialCols, rows: initialRows });
  const bufferRef = useRef<string>('');
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 5;
  const welcomeShownRef = useRef<boolean>(false);

  // Obtenir le token d'authentification
  const getAuthToken = useCallback((): string | null => {
    return localStorage.getItem('jarvis_api_token');
  }, []);

  // Ajouter du texte à la sortie
  const appendOutput = useCallback((text: string) => {
    setOutput((prev) => prev + text);
    bufferRef.current += text;
  }, []);

  // Gérer la connexion WebSocket
  const connect = useCallback(() => {
    const token = getAuthToken();
    const wsUrl = getTerminalWebSocketUrl(token);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setIsConnecting(true);
      setError(null);

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        
        // Envoyer la taille initiale
        ws.send(JSON.stringify({
          type: 'resize',
          data: { cols: sizeRef.current.cols, rows: sizeRef.current.rows },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: TerminalMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'output':
              // Filtrer les messages de bienvenue dupliqués
              const messageText = message.data || '';
              if (messageText.includes('=== Jarvis-OS Terminal ===') || messageText.includes('Jarvis-OS Terminal')) {
                if (!welcomeShownRef.current) {
                  welcomeShownRef.current = true;
                  appendOutput(messageText);
                }
              } else {
                appendOutput(messageText);
              }
              break;
            case 'error':
              setError(message.data || 'Terminal error');
              appendOutput(`\x1b[31m${message.data || 'Error'}\x1b[0m\n`);
              break;
            case 'close':
              appendOutput(`\nTerminal closed (code: ${message.code})\n`);
              setIsConnected(false);
              welcomeShownRef.current = false; // Réinitialiser pour reconnexion
              break;
          }
        } catch (err) {
          // Si le message n'est pas du JSON, on l'affiche directement
          appendOutput(event.data as string);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setIsConnecting(false);
        welcomeShownRef.current = false; // Réinitialiser pour reconnexion
        // Ne pas afficher le message de fermeture pour éviter le spam
        wsRef.current = null;
      };

      ws.onerror = (err) => {
        setIsConnecting(false);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError('WebSocket error: ' + errorMessage);
        appendOutput(`\x1b[31mWebSocket error: ${errorMessage}\x1b[0m\n`);
      };
    } catch (err) {
      setIsConnecting(false);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError('Failed to create WebSocket: ' + errorMessage);
    }
  }, [getAuthToken, appendOutput]);

  // Envoyer une entrée au terminal
  const sendInput = useCallback((input: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'input',
          data: input,
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError('Failed to send input: ' + errorMessage);
      }
    }
  }, []);

  // Redimensionner le terminal
  const resize = useCallback((cols: number, rows: number) => {
    sizeRef.current = { cols, rows };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          data: { cols, rows },
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError('Failed to send resize: ' + errorMessage);
      }
    }
  }, []);

  // Fermer la connexion
  const close = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'close' }));
        wsRef.current.close();
      } catch (err) {
        // Ignorer les erreurs lors de la fermeture
      }
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    welcomeShownRef.current = false; // Réinitialiser pour la prochaine connexion
  }, []);

  // Effacer la sortie
  const clear = useCallback(() => {
    setOutput('');
    bufferRef.current = '';
  }, []);

  // Reconnexion
  const reconnect = useCallback(() => {
    close();
    welcomeShownRef.current = false; // Réinitialiser pour la nouvelle connexion
    // Attendre un court délai avant de reconnecter
    setTimeout(() => {
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        connect();
      } else {
        setError('Max reconnection attempts reached');
      }
    }, 1000);
  }, [close, connect]);

  // Connexion automatique au montage
  useEffect(() => {
    connect();
    return () => {
      close();
    };
  }, [connect, close]);

  // Gérer le redimensionnement de la fenêtre
  useEffect(() => {
    const handleResize = () => {
      // Pour l'instant, on ne fait rien automatiquement
      // Le composant TerminalPanel devra appeler resize explicitement
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const state: TerminalState = {
    isConnected,
    output,
    error,
    isConnecting,
  };

  const actions: TerminalActions = {
    sendInput,
    resize,
    close,
    clear,
    reconnect,
  };

  return [state, actions];
}

export default useTerminal;

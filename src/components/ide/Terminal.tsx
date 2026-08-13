import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TerminalRef {
  sendCommand: (cmd: string) => void;
  clear: () => void;
  fit: () => void;
  focus: () => void;
}

interface TerminalProps {
  /** Callback appelé pour chaque chunk de sortie PTY brute (utile pour détecter des URLs) */
  onOutput?: (chunk: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const TerminalComponent = forwardRef<TerminalRef, TerminalProps>(
  ({ onOutput }, ref) => {
    const onOutputRef = useRef(onOutput);
    useEffect(() => { onOutputRef.current = onOutput; }, [onOutput]);
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef     = useRef<XTerm | null>(null);
    const fitAddonRef  = useRef<FitAddon | null>(null);
    const wsRef        = useRef<WebSocket | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tries        = useRef(0);
    const MAX_TRIES    = 5;
    const unmounted    = useRef(false);
    const commandQueue = useRef<string[]>([]);

    // ── xterm init ───────────────────────────────────────────────────────────

    useEffect(() => {
        unmounted.current = false;

        const term = new XTerm({
          theme: {
            background: '#0d0d0d',
            foreground: '#e5e5e5',
            cursor:     '#7dd3fc',
            selectionBackground: 'rgba(125,211,252,0.25)',
            black:   '#000000', red:     '#f87171',
            green:   '#4ade80', yellow:  '#fbbf24',
            blue:    '#60a5fa', magenta: '#c084fc',
            cyan:    '#22d3ee', white:   '#e5e5e5',
            brightBlack:   '#525252', brightRed:     '#fca5a5',
            brightGreen:   '#86efac', brightYellow:  '#fde68a',
            brightBlue:    '#93c5fd', brightMagenta: '#d8b4fe',
            brightCyan:    '#67e8f9', brightWhite:   '#f5f5f5',
          },
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.4,
          cursorBlink: true,
          cursorStyle: 'block',
          scrollback: 5000,
          convertEol: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        xtermRef.current    = term;
        fitAddonRef.current = fitAddon;

        if (containerRef.current) {
          term.open(containerRef.current);
          setTimeout(() => {
            fitAddon.fit();
          }, 50);
        }

        // ── WebSocket connection ─────────────────────────────────────────────

        const connect = () => {
          if (unmounted.current || tries.current >= MAX_TRIES) return;

          const token = localStorage.getItem('jarvis_api_token');
          console.log("[Terminal Client] Connecting with token:", token ? `"${token.slice(0, 3)}..."` : "NO TOKEN");
          const wsUrl = `ws://${window.location.host}/terminal${token ? `?token=${encodeURIComponent(token)}` : ''}`;
          console.log("[Terminal Client] WebSocket URL:", wsUrl);
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            if (unmounted.current) { 
              ws.close(); 
              return; 
            }
            tries.current = 0;
            // Send initial size
            const dims = fitAddon.proposeDimensions();
            if (dims) {
              ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
            term.writeln('\x1b[32m✓ Terminal connecté\x1b[0m');
            term.writeln(`\x1b[90mWorkspace: ${window.location.host}\x1b[0m`);
            term.writeln('');

            // Send any queued commands
            while (commandQueue.current.length > 0) {
              const cmd = commandQueue.current.shift();
              if (cmd) {
                ws.send(JSON.stringify({ type: 'input', data: cmd }));
              }
            }
          };

          ws.onmessage = (ev) => {
            const text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
            term.write(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data));
            // Notify parent of raw output (strips ANSI escape codes for clean parsing)
            if (onOutputRef.current) {
              // Strip basic ANSI sequences so URL detection works on clean text
              const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
              onOutputRef.current(clean);
            }
          };

          ws.onerror = (event) => {
            // Don't log errors if we're already unmounting
            if (!unmounted.current) {
              console.error("[Terminal Client] WebSocket error event:", event);
              console.error("[Terminal Client] WebSocket readyState:", ws.readyState);
            }
          };

          ws.onclose = (event) => {
            console.log("[Terminal Client] WebSocket closed, code:", event.code, "reason:", event.reason, "clean:", event.wasClean);
            wsRef.current = null;
            if (unmounted.current) return;
            tries.current += 1;
            if (tries.current < MAX_TRIES) {
              term.writeln(`\r\n\x1b[33m⟳ Reconnexion (${tries.current}/${MAX_TRIES})...\x1b[0m`);
              reconnectRef.current = setTimeout(connect, 1500);
            } else {
              term.writeln('\r\n\x1b[31m✗ Terminal non disponible — serveur PTY introuvable.\x1b[0m');
              term.writeln('\x1b[90mUtilisez votre terminal système pour exécuter des commandes.\x1b[0m');
            }
          };
        };

        // Handle key events to ensure Ctrl+C is sent
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.ctrlKey && event.key.toLowerCase() === 'c') {
          // Check if there's a selection
          const hasSelection = term.hasSelection();
          if (hasSelection) {
            // If there's a selection, let the browser handle copy
            return true;
          } else {
            // No selection, send Ctrl+C (ASCII ETX character) to interrupt
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'input', data: '\x03' }));
            }
            event.preventDefault();
            return false;
          }
        }
        if (event.ctrlKey && event.key.toLowerCase() === 'v') {
          // Handle paste
          event.preventDefault();
          navigator.clipboard.readText().then(text => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'input', data: text }));
            }
          });
          return false;
        }
        return true; // Let XTerm handle other keys normally
      });

      // Key input → send to PTY
      term.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'input', data }));
        }
      });

        connect();

      // ── Resize observer ──────────────────────────────────────────────────

      const ro = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
          }
        } catch { /* ignore during teardown */ }
      });

      if (containerRef.current) ro.observe(containerRef.current);

      return () => {
        unmounted.current = true;
        ro.disconnect();
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current);
        }
        wsRef.current?.close();
        term.dispose();
        xtermRef.current    = null;
        fitAddonRef.current = null;
      };
    }, []);

    // ── Imperative API ─────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      sendCommand: (cmd: string) => {
        const fullCmd = cmd + '\r\n';
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: fullCmd }));
        } else {
          // Queue the command to send when connection is established
          commandQueue.current.push(fullCmd);
          xtermRef.current?.writeln(`\x1b[33m$ ${cmd}\x1b[0m`);
          xtermRef.current?.writeln('\x1b[90m⌛ Commande en file d\'attente, connexion en cours...\x1b[0m');
        }
      },
      clear: () => {
        xtermRef.current?.clear();
      },
      fit: () => {
        try { 
          fitAddonRef.current?.fit();
        } catch (err) { 
          console.error("[Terminal Client] fit() failed:", err); 
        }
      },
      focus: () => {
        xtermRef.current?.focus();
      }
    }));

    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#0d0d0d',
          overflow: 'hidden',
        }}
      />
    );
  }
);

TerminalComponent.displayName = 'TerminalComponent';

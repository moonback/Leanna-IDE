import React, { useEffect, useRef, useCallback, useState } from 'react';
import { X, Terminal, Play, Maximize, Minimize, Plus } from 'lucide-react';
import { useTerminal } from '../../hooks/useTerminal';
import { motion, AnimatePresence } from 'motion/react';

interface TerminalPanelProps {
  onClose: () => void;
  isDocked?: boolean;
  onToggleDock?: () => void;
  onOpenBrowser?: (url: string) => void;
  showExplorer?: boolean;
}

// Types pour les onglets
interface TerminalTab {
  id: string;
  title: string;
  shell: string;
  cwd: string;
}

// Commandes personnalisées par défaut
const DEFAULT_CUSTOM_COMMANDS = [
  { name: 'npm run dev', command: 'npm run dev', description: 'Démarrer le serveur de développement' },
  { name: 'npm install', command: 'npm install', description: 'Installer les dépendances' },
  { name: 'npm run build', command: 'npm run build', description: 'Builder le projet' },
  { name: 'npm test', command: 'npm test', description: 'Exécuter les tests' },
  { name: 'git status', command: 'git status', description: 'Voir le statut Git' },
  { name: 'git pull', command: 'git pull', description: 'Mettre à jour depuis remote' },
  { name: 'clear', command: 'clear', description: 'Effacer le terminal' },
];

// Formattage des couleurs ANSI
function formatAnsiText(text: string): React.ReactNode {
  const ansiColors: Record<string, string> = {
    '30': '#000000', '31': '#ff5555', '32': '#50fa7b', '33': '#ffb86c',
    '34': '#8be9fd', '35': '#ff79c6', '36': '#89ddff', '37': '#ffffff',
    '90': '#4d4d4d', '91': '#ff6b81', '92': '#51cf66', '93': '#ffd43b',
    '94': '#6b6bff', '95': '#ff6bcb', '96': '#6bffff',
  };
  const styles: Record<string, React.CSSProperties> = {
    '1': { fontWeight: 'bold' },
    '2': { fontWeight: 'lighter' },
    '3': { fontStyle: 'italic' },
    '4': { textDecoration: 'underline' },
  };

  const parts = text.split(/(\x1b\[[0-9;]*m)/);
  let currentStyle: React.CSSProperties = {};
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part?.startsWith('\x1b[') && part.endsWith('m')) {
      const code = part.slice(2, -1);
      const codes = code.split(';');
      for (const c of codes) {
        if (c === '0') { currentStyle = {}; }
        else if (ansiColors[c]) { currentStyle.color = ansiColors[c]; }
        else if (styles[c]) { currentStyle = { ...currentStyle, ...styles[c] }; }
      }
    } else if (part) {
      elements.push(Object.keys(currentStyle).length > 0 ? 
        <span key={i} style={currentStyle}>{part}</span> : part);
    }
  }
  return <>{elements}</>;
}

// Composant pour un onglet individuel
interface TerminalTabPanelProps {
  tab: TerminalTab;
  isActive: boolean;
  onSendInput: (input: string) => void;
}

const TerminalTabPanel: React.FC<TerminalTabPanelProps> = ({ tab, isActive, onSendInput }) => {
  // Seule la connexion WebSocket est établie quand l'onglet est actif
  const [state, actions] = useTerminal(120, 40);
  const { isConnected, output, error, isConnecting } = state;
  const { sendInput, close: closeConnection } = actions;

  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  
  // Fermer la connexion quand l'onglet devient inactif
  useEffect(() => {
    if (!isActive) {
      closeConnection();
    }
  }, [isActive, closeConnection]);

  useEffect(() => {
    if (isActive && isConnected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive, isConnected]);

  useEffect(() => {
    if (isActive) {
      outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [output, isActive]);

  const handleSendInput = useCallback((input: string) => {
    if (isConnected && isActive) {
      sendInput(input);
      onSendInput(input);
    }
  }, [isConnected, isActive, sendInput, onSendInput]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const command = inputValue.trim();
      if (command && isConnected) {
        setHistory(prev => [...prev, command]);
        setHistoryIndex(-1);
        handleSendInput(command);
        setInputValue('');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setInputValue(history[newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > -1) {
        const newIndex = Math.max(historyIndex - 1, -1);
        setHistoryIndex(newIndex);
        setInputValue(newIndex === -1 ? '' : history[newIndex]);
      }
    }
  }, [inputValue, isConnected, handleSendInput, history, historyIndex]);

  const lines = output.split('\n').filter(line => line !== '');

  if (!isActive) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-input)' }}>
      <div 
        style={{ flex: 1, overflowY: 'auto', padding: '16px', fontFamily: 'Consolas, Monaco, \'Courier New\', monospace',
          fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', 
          color: 'var(--text-primary)', userSelect: 'text' }}
        onCopy={(e) => {
          e.stopPropagation();
        }}
      >
        {output === '' && !isConnecting && !isConnected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            {isConnecting ? 'Connecting to terminal...' : 'Terminal ready. Type a command and press Enter.'}
          </div>
        ) : lines.map((line, index) => (
          <div key={index} style={{ minHeight: '1.6em' }}>{formatAnsiText(line)}</div>
        ))}
        {error && <div style={{ color: '#ff6b6b', marginTop: '8px', padding: '8px', backgroundColor: 'rgba(220, 53, 69, 0.1)',
          borderRadius: '4px', fontSize: '13px', fontFamily: 'Consolas, Monaco, \'Courier New\', monospace' }}>
          Error: {error}
        </div>}
        <div ref={outputEndRef} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-base)' }}>
        <span style={{ color: 'var(--accent-primary)', fontFamily: 'Consolas, Monaco, \'Courier New\', monospace',
          fontSize: '14px', marginRight: '10px' }}>
          {tab.title}$
        </span>
        <input ref={inputRef} type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown} disabled={!isConnected || isConnecting}
          placeholder={!isConnected ? 'Connecting...' : 'Type a command...'}
          style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'Consolas, Monaco, \'Courier New\', monospace',
            fontSize: '14px', color: 'var(--text-primary)', outline: 'none' }} />
        {inputValue && <button onClick={() => { setInputValue(''); setHistoryIndex(-1); }}
          title="Clear input" style={{ padding: '6px', border: 'none', background: 'transparent', color: 'var(--text-muted)',
            cursor: 'pointer', borderRadius: '4px' }}
          onMouseEnter={e => (e.target as HTMLButtonElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}>
          <X size={16} />
        </button>}
      </div>
    </div>
  );
};

// Composant principal
const TerminalPanel: React.FC<TerminalPanelProps> = ({ onClose, isDocked, onToggleDock, onOpenBrowser, showExplorer }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: '1', title: 'Terminal 1', shell: 'PowerShell', cwd: '' }]);
  const [activeTabId, setActiveTabId] = useState<string>('1');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const addTab = useCallback(() => {
    const newId = String(tabs.length + 1);
    setTabs(prev => [...prev, { id: newId, title: `Terminal ${tabs.length + 1}`, shell: 'PowerShell', cwd: '' }]);
    setActiveTabId(newId);
  }, [tabs.length]);

  const closeTab = useCallback((tabId: string) => {
    if (tabs.length <= 1) return;
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId(tabs[0]?.id || '1');
  }, [tabs, activeTabId]);

  const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);

  const handleCommandSent = useCallback((command: string) => {
    const trimmed = command.trim().toLowerCase();
    const serverCommands = ['npm run dev', 'npm start', 'npm run serve', 'npm run preview'];
    if (serverCommands.some(cmd => trimmed.includes(cmd)) && onOpenBrowser) {
      setTimeout(() => onOpenBrowser('http://localhost:5173'), 2000);
    }
  }, [onOpenBrowser]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 't') { e.preventDefault(); addTab(); }
      if (e.ctrlKey && e.key === 'w' && tabs.length > 1) { e.preventDefault(); closeTab(activeTabId); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addTab, closeTab, tabs.length, activeTabId]);

  return (
    <motion.div className="terminal-panel" style={{
      backgroundColor: 'var(--bg-panel)', 
      border: '1px solid var(--border-base)',
      borderRadius: isFullscreen ? '0' : isDocked ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', 
      height: isFullscreen ? '100vh' : isDocked ? '40vh' : '60vh',
      width: isFullscreen ? '100vw' : isDocked ? (showExplorer ? 'calc(100vw - 316px)' : 'calc(100vw - 56px)') : '70vw',
      minHeight: isDocked ? '200px' : '400px',
      maxHeight: isFullscreen ? 'none' : isDocked ? '70vh' : '80vh',
      position: 'fixed',
      top: isFullscreen ? 0 : isDocked ? undefined : '50%',
      right: isFullscreen ? 0 : isDocked ? '0' : undefined,
      left: isFullscreen ? 0 : isDocked ? (showExplorer ? '316px' : '56px') : '50%',
      bottom: isFullscreen ? 0 : isDocked ? '0' : undefined,
      zIndex: 1500,
      boxShadow: isFullscreen ? 'none' : isDocked ? '0 -4px 20px rgba(0, 0, 0, 0.3)' : '0 4px 20px rgba(0, 0, 0, 0.3)',
      transform: isDocked ? 'none' : 'translate(-50%, -50%)',
      resize: isDocked ? 'vertical' : 'none',
      overflow: 'hidden',
    }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px',
        backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-base)',
        borderTopLeftRadius: isFullscreen ? 0 : 'var(--radius-lg)', borderTopRightRadius: isFullscreen ? 0 : 'var(--radius-lg)',
        gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={14} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Terminal</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0 }}>
          {tabs.map(tab => (
            <motion.div key={tab.id} onClick={() => setActiveTabId(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', border: 'none',
                background: activeTabId === tab.id ? 'var(--bg-hover)' : 'transparent',
                color: activeTabId === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer', borderRadius: '6px', fontSize: '12px', minWidth: 0 }}
              whileHover={{ background: 'var(--bg-hover)' }} whileTap={{ scale: 0.95 }}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTabId(tab.id); } }}
            >
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.title}</span>
              <button 
                onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                title="Close tab"
                aria-label="Close tab"
                style={{ 
                  padding: '2px', 
                  border: 'none', 
                  background: 'transparent', 
                  color: 'var(--text-muted)',
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  borderRadius: '4px',
                }}
                onMouseEnter={e => (e.target as HTMLButtonElement).style.color = 'var(--color-danger)'}
                onMouseLeave={e => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); closeTab(tab.id); } }}
              >
                <X size={10} />
              </button>
            </motion.div>
          ))}
          <button onClick={addTab} title="New tab (Ctrl+T)" style={{ padding: '4px 8px', border: 'none', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '6px', display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = 'var(--text-primary)';
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = 'var(--text-muted)';
              (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
            <Plus size={12} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowCommandPalette(!showCommandPalette)} title="Commands"
              style={{ padding: '4px', border: 'none', background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.target as HTMLButtonElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}>
              <Play size={12} />
            </button>
            <AnimatePresence>
              {showCommandPalette && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, minWidth: '200px',
                    backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)',
                    borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', padding: '6px' }}>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {DEFAULT_CUSTOM_COMMANDS.map((cmd, i) => (
                      <button key={i} onClick={() => { onClose(); setShowCommandPalette(false); }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                          border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer',
                          borderRadius: '6px', fontSize: '12px', textAlign: 'left' }}
                        onMouseEnter={e => (e.target as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)'}
                        onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'}>
                        <code style={{ fontSize: '11px', color: 'var(--accent-primary)' }}>{cmd.name}</code>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{cmd.description}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isFullscreen && onToggleDock && (
            <button onClick={onToggleDock} title={isDocked ? 'Floating mode' : 'Dock to bottom'}
              style={{ padding: '4px', border: 'none', background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', borderRadius: '4px' }}
              onMouseEnter={e => (e.target as HTMLButtonElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}>
              {isDocked ? <Maximize size={14} /> : <Minimize size={14} />}
            </button>
          )}

          <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{ padding: '4px', border: 'none', background: 'transparent', color: 'var(--text-muted)',
              cursor: 'pointer', borderRadius: '4px' }}
            onMouseEnter={e => (e.target as HTMLButtonElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}>
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>

          <button onClick={onClose} title="Close" style={{ padding: '4px', border: 'none', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '4px' }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = 'var(--color-danger)';
              (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(220, 53, 69, 0.1)'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = 'var(--text-muted)';
              (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {tabs.map(tab => <TerminalTabPanel key={tab.id} tab={tab} isActive={activeTabId === tab.id}
          onSendInput={handleCommandSent} />)}
      </div>

      {isFullscreen && (
        <button onClick={toggleFullscreen} style={{ position: 'fixed', top: '16px', right: '16px', padding: '8px',
          border: 'none', background: 'var(--bg-panel)', color: 'var(--text-primary)', cursor: 'pointer',
          borderRadius: '8px', zIndex: 1001, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
          onMouseEnter={e => (e.target as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = 'var(--bg-panel)'}>
          <Minimize size={20} />
        </button>
      )}
    </motion.div>
  );
};

export default React.memo(TerminalPanel);
export type { TerminalTab, TerminalPanelProps };
export { DEFAULT_CUSTOM_COMMANDS };

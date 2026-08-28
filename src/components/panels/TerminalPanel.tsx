import React, { useEffect, useRef, useCallback, useState } from 'react';
import { X, Terminal, Play, Maximize, Minimize, Plus, Settings, ChevronDown } from 'lucide-react';
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

// Thèmes de couleurs pour le terminal
interface TerminalTheme {
  name: string;
  background: string;
  text: string;
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  cursor: string;
  selection: string;
  ansi: Record<string, string>;
}

// Thèmes disponibles
const TERMINAL_THEMES: TerminalTheme[] = [
  {
    name: 'Dracula',
    background: '#282a36',
    text: '#f8f8f2',
    primary: '#bd93f9',
    secondary: '#44475a',
    accent: '#ff79c6',
    error: '#ff5555',
    success: '#50fa7b',
    warning: '#ffb86c',
    info: '#8be9fd',
    cursor: '#ffffff',
    selection: 'rgba(255, 255, 255, 0.2)',
    ansi: {
      '0': '#282a36', '1': '#ff5555', '2': '#50fa7b', '3': '#ffb86c',
      '4': '#8be9fd', '5': '#bd93f9', '6': '#8be9fd', '7': '#f8f8f2',
      '8': '#44475a', '9': '#ff5555', '10': '#50fa7b', '11': '#ffb86c',
      '12': '#8be9fd', '13': '#bd93f9', '14': '#50fa7b', '15': '#ffffff',
    },
  },
  {
    name: 'One Dark',
    background: '#282c34',
    text: '#abb2bf',
    primary: '#61afef',
    secondary: '#3e4451',
    accent: '#c678dd',
    error: '#e06c75',
    success: '#98c379',
    warning: '#d19a66',
    info: '#569cd6',
    cursor: '#ffffff',
    selection: 'rgba(255, 255, 255, 0.2)',
    ansi: {
      '0': '#282c34', '1': '#e06c75', '2': '#98c379', '3': '#d19a66',
      '4': '#569cd6', '5': '#c678dd', '6': '#61afef', '7': '#abb2bf',
      '8': '#3e4451', '9': '#e06c75', '10': '#98c379', '11': '#d19a66',
      '12': '#569cd6', '13': '#c678dd', '14': '#d4a77a', '15': '#ffffff',
    },
  },
  {
    name: 'Solarized Dark',
    background: '#002b36',
    text: '#839496',
    primary: '#268bd2',
    secondary: '#073642',
    accent: '#dc322f',
    error: '#dc322f',
    success: '#859900',
    warning: '#b58900',
    info: '#268bd2',
    cursor: '#ffffff',
    selection: 'rgba(255, 255, 255, 0.2)',
    ansi: {
      '0': '#002b36', '1': '#dc322f', '2': '#859900', '3': '#b58900',
      '4': '#268bd2', '5': '#d33682', '6': '#2aa198', '7': '#839496',
      '8': '#073642', '9': '#dc322f', '10': '#859900', '11': '#b58900',
      '12': '#268bd2', '13': '#d33682', '14': '#586e75', '15': '#fdf6e3',
    },
  },
  {
    name: 'Monokai',
    background: '#272822',
    text: '#f8f8f2',
    primary: '#f92672',
    secondary: '#3e3d32',
    accent: '#a6e22e',
    error: '#f92672',
    success: '#a6e22e',
    warning: '#e6db74',
    info: '#66d9ef',
    cursor: '#ffffff',
    selection: 'rgba(255, 255, 255, 0.2)',
    ansi: {
      '0': '#272822', '1': '#f92672', '2': '#a6e22e', '3': '#e6db74',
      '4': '#66d9ef', '5': '#ae81ff', '6': '#66d9ef', '7': '#f8f8f2',
      '8': '#3e3d32', '9': '#f92672', '10': '#a6e22e', '11': '#e6db74',
      '12': '#66d9ef', '13': '#ae81ff', '14': '#f4bf75', '15': '#ffffff',
    },
  },
];

// Options de shell
const SHELL_OPTIONS = [
  { value: 'PowerShell', label: 'PowerShell', command: 'pwsh.exe' },
  { value: 'cmd', label: 'CMD', command: 'cmd.exe' },
  { value: 'Git Bash', label: 'Git Bash', command: 'C:\\Program Files\\Git\\bin\\bash.exe' },
];

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

// Formattage des couleurs ANSI avec thème personnalisé
function formatAnsiText(text: string, theme?: TerminalTheme): React.ReactNode {
  // Couleurs ANSI par défaut (Dracula-like)
  const defaultAnsiColors: Record<string, string> = {
    '0': '#282a36', '1': '#ff5555', '2': '#50fa7b', '3': '#ffb86c',
    '4': '#8be9fd', '5': '#bd93f9', '6': '#8be9fd', '7': '#f8f8f2',
    '8': '#44475a', '9': '#ff5555', '10': '#50fa7b', '11': '#ffb86c',
    '12': '#8be9fd', '13': '#bd93f9', '14': '#50fa7b', '15': '#ffffff',
    '30': '#282a36', '31': '#ff5555', '32': '#50fa7b', '33': '#ffb86c',
    '34': '#8be9fd', '35': '#bd93f9', '36': '#8be9fd', '37': '#f8f8f2',
    '90': '#44475a', '91': '#ff5555', '92': '#50fa7b', '93': '#ffb86c',
    '94': '#8be9fd', '95': '#bd93f9', '96': '#6bffff',
  };
  
  const ansiColors = theme?.ansi || defaultAnsiColors;
  
  const styles: Record<string, React.CSSProperties> = {
    '1': { fontWeight: 'bold' },
    '2': { fontWeight: 'lighter' },
    '3': { fontStyle: 'italic' },
    '4': { textDecoration: 'underline' },
    '5': { textDecoration: 'line-through' },
    '7': { backgroundColor: theme?.selection || 'rgba(255, 255, 255, 0.2)' },
    '8': { visibility: 'hidden' },
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
        else if (ansiColors[c]) { 
          currentStyle.color = ansiColors[c]; 
        }
        else if (styles[c]) { 
          currentStyle = { ...currentStyle, ...styles[c] }; 
        }
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
  theme?: TerminalTheme;
}

const TerminalTabPanel: React.FC<TerminalTabPanelProps> = ({ tab, isActive, onSendInput, theme }) => {
  // Seule la connexion WebSocket est établie quand l'onglet est actif
  const [state, actions] = useTerminal(120, 40);
  const { isConnected, output, error, isConnecting } = state;
  const { sendInput, close: closeConnection } = actions;

  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  
  // Thème par défaut (Dracula)
  const currentTheme = theme || TERMINAL_THEMES[0];
  
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: currentTheme.background, borderRadius: '8px' }}>
      <div 
        style={{ flex: 1, overflowY: 'auto', padding: '20px', fontFamily: '"Cascadia Code PL", "Fira Code", Consolas, Monaco, \'Courier New\', monospace',
          fontSize: '15px', lineHeight: '1.8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', 
          color: currentTheme.text, userSelect: 'text', fontWeight: 400 }}
        onCopy={(e) => {
          e.stopPropagation();
        }}
      >
        {output === '' && !isConnecting && !isConnected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: currentTheme.secondary, fontStyle: 'italic' }}>
            {isConnecting ? 'Connexion au terminal...' : 'Terminal prêt. Tapez une commande et appuyez sur Entrée.'}
          </div>
        ) : lines.map((line, index) => (
          <div key={index} style={{ minHeight: '1.8em' }}>{formatAnsiText(line, currentTheme)}</div>
        ))}
        {error && <div style={{ color: currentTheme.error, marginTop: '8px', padding: '12px', backgroundColor: 'rgba(255, 85, 85, 0.15)',
          borderRadius: '6px', fontSize: '14px', fontFamily: '"Cascadia Code PL", Consolas, Monaco, \'Courier New\', monospace',
          borderLeft: `4px solid ${currentTheme.error}` }}>
          ⚠ Erreur: {error}
        </div>}
        <div ref={outputEndRef} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', backgroundColor: currentTheme.secondary,
        borderTop: `1px solid ${currentTheme.secondary}` }}>
        <span style={{ color: currentTheme.accent, fontFamily: '"Cascadia Code PL", "Fira Code", Consolas, Monaco, \'Courier New\', monospace',
          fontSize: '15px', marginRight: '12px', fontWeight: 600 }}>
          {tab.title} 
          {isConnected ? (
            <span style={{ color: currentTheme.success }}>●</span>
          ) : isConnecting ? (
            <span style={{ color: currentTheme.warning }}>○</span>
          ) : (
            <span style={{ color: currentTheme.error }}>●</span>
          )}
        </span>
        <input ref={inputRef} type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown} disabled={!isConnected || isConnecting}
          placeholder={!isConnected ? 'Connexion...' : 'Tapez une commande...'}
          style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: '"Cascadia Code PL", "Fira Code", Consolas, Monaco, \'Courier New\', monospace',
            fontSize: '15px', color: currentTheme.text, outline: 'none', caretColor: currentTheme.cursor }} />
        {inputValue && <button onClick={() => { setInputValue(''); setHistoryIndex(-1); }}
          title="Effacer l'entrée" style={{ padding: '6px', border: 'none', background: 'transparent', color: currentTheme.text,
            cursor: 'pointer', borderRadius: '4px', opacity: 0.7 }}
          onMouseEnter={e => (e.target as HTMLButtonElement).style.opacity = '1'}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.opacity = '0.7'}>
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
  const [selectedTheme, setSelectedTheme] = useState<TerminalTheme>(TERMINAL_THEMES[0]);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showShellSelector, setShowShellSelector] = useState(false);

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

  const handleThemeChange = useCallback((theme: TerminalTheme) => {
    setSelectedTheme(theme);
    setShowThemeSelector(false);
  }, []);

  const handleShellChange = useCallback((shell: string) => {
    setTabs(prev => prev.map(tab => 
      activeTabId === tab.id ? { ...tab, shell } : tab
    ));
    setShowShellSelector(false);
  }, [activeTabId]);

  const getActiveTab = useCallback(() => {
    return tabs.find(tab => tab.id === activeTabId);
  }, [tabs, activeTabId]);

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
          {/* Sélecteur de thème */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowThemeSelector(!showThemeSelector)} title="Thèmes"
              style={{ padding: '4px', border: 'none', background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.target as HTMLButtonElement).style.color = selectedTheme.primary}
              onMouseLeave={e => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}>
              <div style={{ width: '14px', height: '14px', backgroundColor: selectedTheme.accent, borderRadius: '4px', border: '2px solid currentColor' }} />
            </button>
            <AnimatePresence>
              {showThemeSelector && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, minWidth: '180px',
                    backgroundColor: selectedTheme.background, border: `1px solid ${selectedTheme.secondary}`,
                    borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '6px' }}>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {TERMINAL_THEMES.map((theme, i) => (
                      <button key={i} onClick={() => handleThemeChange(theme)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                          border: 'none', background: 'transparent', color: selectedTheme.text, cursor: 'pointer',
                          borderRadius: '6px', fontSize: '12px', textAlign: 'left' }}
                        onMouseEnter={e => (e.target as HTMLButtonElement).style.backgroundColor = selectedTheme.secondary}
                        onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'}
                        title={theme.name}>
                        <div style={{ width: '12px', height: '12px', backgroundColor: theme.accent, borderRadius: '3px' }} />
                        <span style={{ fontSize: '11px' }}>{theme.name}</span>
                        {selectedTheme.name === theme.name && (
                          <span style={{ marginLeft: 'auto', color: theme.success }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sélecteur de shell */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowShellSelector(!showShellSelector)} title="Shell"
              style={{ padding: '4px', border: 'none', background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.target as HTMLButtonElement).style.color = selectedTheme.primary}
              onMouseLeave={e => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}>
              <Terminal size={12} />
              <ChevronDown size={10} />
            </button>
            <AnimatePresence>
              {showShellSelector && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, minWidth: '160px',
                    backgroundColor: selectedTheme.background, border: `1px solid ${selectedTheme.secondary}`,
                    borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '6px' }}>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {SHELL_OPTIONS.map((shell, i) => {
                      const activeShell = getActiveTab()?.shell || 'PowerShell';
                      const isActive = activeShell === shell.value;
                      return (
                        <button key={i} onClick={() => handleShellChange(shell.value)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                            border: 'none', background: 'transparent', color: selectedTheme.text, cursor: 'pointer',
                            borderRadius: '6px', fontSize: '12px', textAlign: 'left' }}
                          onMouseEnter={e => (e.target as HTMLButtonElement).style.backgroundColor = selectedTheme.secondary}
                          onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'}
                          title={shell.label}>
                          <span style={{ fontSize: '11px' }}>{shell.label}</span>
                          {isActive && (
                            <span style={{ marginLeft: 'auto', color: selectedTheme.success }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowCommandPalette(!showCommandPalette)} title="Commandes"
              style={{ padding: '4px', border: 'none', background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.target as HTMLButtonElement).style.color = selectedTheme.primary}
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
          onSendInput={handleCommandSent} theme={selectedTheme} />)}
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

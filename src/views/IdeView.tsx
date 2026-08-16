import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
// Monaco Editor - lazy loaded to reduce initial bundle
const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.Editor })));
// Panels - lazy loaded
const SandboxPanel = lazy(() => import('../components/panels/SandboxPanel').then(m => ({ default: m.SandboxPanel })));
const VisionPanel = lazy(() => import('../components/panels/VisionPanel').then(m => ({ default: m.VisionPanel })));
import { Plus, X } from 'lucide-react';
import { IdeModal, type ModalMode } from '../components/ide/IdeModal';
import { ContextMenu, type ContextTarget, type ClipboardEntry } from '../components/ide/ContextMenu';
import { DiffViewer } from '../components/ide/DiffViewer';
import { CommandPalette } from '../components/ide/CommandPalette';
import { GlobalSearch } from '../components/ide/GlobalSearch';
import { StatusBar } from '../components/ide/StatusBar';
import { TerminalComponent, type TerminalRef } from '../components/ide/Terminal';
import { EditorTabs } from '../components/ide/EditorTabs';
import { SettingsPanel } from '../components/ide/SettingsPanel';
import { HelpPanel } from '../components/ide/HelpPanel';
import { HistoryPanel } from '../components/ide/HistoryPanel';
import { AutomationPanel } from '../components/ide/AutomationPanel';
import { MemoryPanel } from '../components/ide/MemoryPanel';
import { FileExplorer } from '../components/ide/FileExplorerVirtualized';
import { UnifiedSidebar } from '../components/UnifiedSidebar';
import { useProfile } from '../context/UserProfileContext';
import { useFileSystem } from '../hooks/useFileSystem';
import { useIdeSettings } from '../hooks/useIdeSettings';
import { useEditorActions } from '../hooks/useEditorActions';
import { useLiveAPIContext } from '../context/LiveAPIContext';
import { ideApi } from '../services/ideApi';
import { useScreenShare } from '../context/ScreenShareContext';
import { useSandboxWatcher } from '../hooks/useSandboxWatcher';
import { AgentProgressBar } from '../components/ide/AgentProgressBar';
import { ChatPanel } from '../components/ide/ChatPanel';
import { LiveSkillsMonitor } from '../components/ide/LiveSkillsMonitor';
import { GitHubPanel } from '../components/ide/GitHubPanel';
import { WorkflowPanel } from '../components/ide/WorkflowPanel';
import { McpPanel } from '../components/panels/McpPanel';
import { GitSourceControl } from '../components/ide/GitSourceControl';
import { PreviewPanel } from '../components/ide/PreviewPanel';
import { MarkdownPreview } from '../components/ide/MarkdownPreview';
import { EmptyEditorState } from '../components/ide/EmptyEditorState';
import { SelfEditBanner } from '../components/ide/SelfEditBanner';
import { CheckpointPanel } from '../components/ide/CheckpointPanel';
import { SandboxDiffViewer } from '../components/sandbox/SandboxDiffViewer';
import { AgentPanel } from '../components/panels/AgentPanel';
import { initActivityStore } from '../stores/agentActivityStore';
import { MissionPanel } from '../components/panels/MissionPanel';
import { SystemHealthDashboard } from '../components/panels/SystemHealthDashboard';
import { AgentFleetPanel } from '../components/panels/AgentFleetPanel';
import { AssistantLogsPanel } from '../components/panels/AssistantLogsPanel';
import { AgentActivityOverlay } from '../components/ide/AgentActivityOverlay';

// ─── Main Component ─────────────────────────────────────────────────────────

export default function IdeView() {
  const { profile } = useProfile();
  const { activity, clearActivity, connected, disconnect, connect, muted, toggleMute, isBusy, reasoning, sendVideoFrame } = useLiveAPIContext();
  const { isSharing: screenShareEnabled, toggleScreenShare } = useScreenShare();

  // Initialize the global activity store (listens to events even when panel is closed)
  useEffect(() => { initActivityStore(); }, []);

  // Check if assistant is currently working
  const assistantWorking = activity.some(step => step.status === 'running') || isBusy;

  // Vision & Mode state
    const [visionEnabled, setVisionEnabled] = useState(false);
    const [terminalLoading, setTerminalLoading] = useState(false);
    const [mode, setMode] = useState<'full' | 'ask'>(() => 'full');
    const [pendingReconnectMode, setPendingReconnectMode] = useState<'full' | 'ask' | null>(null);

    // Initialize mode from localStorage on mount
    useEffect(() => {
      const stored = localStorage.getItem('jarvis_mode') as 'full' | 'ask' | null;
      if (stored && stored !== ('vie' as any)) setMode(stored);
    }, []);

    // Persist mode to localStorage
    useEffect(() => {
      localStorage.setItem('jarvis_mode', mode);
    }, [mode]);

    // Reconnect after mode change: wait until status is idle then reconnect
    useEffect(() => {
    if (pendingReconnectMode && !connected) {
      const timer = setTimeout(() => {
        connect([], pendingReconnectMode);
        setPendingReconnectMode(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pendingReconnectMode, connected, connect]);

  // Custom hooks for logic separation
  const fileSystem = useFileSystem();
  const { settings: ideSettings, updateSetting } = useIdeSettings(profile.theme);
  const { editorRef, monacoRef, editorPathRef, formatDocument, navigateToPosition, applySettingsToEditor, pushContentToEditor } = useEditorActions();

  // ── Sandbox Watcher — dispatcher les événements de fichiers en temps réel ──
  // Ce hook maintient une connexion WebSocket vers /sandbox-watch et dispatche
  // des CustomEvents globaux pour que useFileSystem puisse réagir (fermer onglets
  // de fichiers supprimés, recharger fichiers modifiés, actualiser l'arbre).
  useSandboxWatcher({
    enabled: true,
    onFileChanged: useCallback((relativePath: string) => {
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-file-changed', { detail: { path: relativePath } }));
      // Également rafraîchir l'arbre pour refléter les changements
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    }, []),
    onTreeChanged: useCallback(() => {
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    }, []),
    onFileDeleted: useCallback((relativePath: string) => {
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-file-deleted', { detail: { path: relativePath } }));
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    }, []),
  });

  // UI State
  const [showExplorer, setShowExplorer] = useState(true);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState<'files' | 'commands' | null>(null);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showRunMenu, setShowRunMenu] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [showGit, setShowGit] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [showSkillsMonitor, setShowSkillsMonitor] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatDocked, setChatDocked] = useState(false);
  const [pendingChatMessage, setPendingChatMessage] = useState<{ text: string; displayText?: string } | null>(null);
  const [showAgents, setShowAgents] = useState(false);
  const [showFleet, setShowFleet] = useState(false);
  const [showAssistantLogs, setShowAssistantLogs] = useState(false);
  const [showMissions, setShowMissions] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const [sandboxView, setSandboxView] = useState<'controls' | 'diff'>('controls');
  const [selectedSandboxDiffFile, setSelectedSandboxDiffFile] = useState<string | null>(null);
  const toggleSandbox = useCallback(() => {
    setShowSandbox((visible) => {
      if (!visible) {
        setSandboxView('controls');
        setSelectedSandboxDiffFile(null);
      }
      return !visible;
    });
  }, []);
  const openSandboxDiff = useCallback((initialFile: string | null = null) => {
    setSelectedSandboxDiffFile(initialFile);
    setSandboxView('diff');
    setShowSandbox(true);
  }, []);
  const closeSandbox = useCallback(() => {
    setShowSandbox(false);
    setSandboxView('controls');
    setSelectedSandboxDiffFile(null);
  }, []);
  const [showSystemHealth, setShowSystemHealth] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [selfEditingFile, setSelfEditingFile] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number } | null>(null);

  // Auto-close assistant-dependent panels when assistant is disconnected
  useEffect(() => {
    if (!connected) {
      setShowChat(false);
      setChatDocked(false);
      setShowAgents(false);
      setShowFleet(false);
      setShowSkillsMonitor(false);
    }
  }, [connected]);

  // Multiple terminals state
  const [terminals, setTerminals] = useState<{ id: number }[]>([{ id: 1 }]);
  const [activeTerminalId, setActiveTerminalId] = useState(1);
  const terminalRefs = useRef<Record<number, TerminalRef | null>>({});

  // Generate unique terminal ID
  const getNextTerminalId = useCallback(() => {
    const maxId = terminals.length > 0 ? Math.max(...terminals.map(t => t.id)) : 0;
    return maxId + 1;
  }, [terminals]);

  // Add a new terminal
  const addTerminal = useCallback(() => {
    const newId = getNextTerminalId();
    setTerminals(prev => [...prev, { id: newId }]);
    setActiveTerminalId(newId);
    setShowTerminal(true);
  }, [getNextTerminalId]);

  // Close a terminal
  const closeTerminal = useCallback((id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (terminals.length <= 1) {
      setShowTerminal(false);
      return;
    }
    setTerminals(prev => prev.filter(t => t.id !== id));
    if (activeTerminalId === id) {
      const remaining = terminals.filter(t => t.id !== id);
      setActiveTerminalId(remaining[remaining.length - 1].id);
    }
    delete terminalRefs.current[id];
  }, [terminals, activeTerminalId]);

  // Preview panel state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Markdown preview toggle — per-file, reset to false for non-md files
  const [markdownPreview, setMarkdownPreview] = useState(false);

  // Reset markdown preview when switching to a non-markdown file
  useEffect(() => {
    if (!fileSystem.activePath?.toLowerCase().endsWith('.md')) {
      setMarkdownPreview(false);
    }
  }, [fileSystem.activePath]);

  // Per-file reload keys
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});
  const [modalState, setModalState] = useState<ModalMode | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    target: ContextTarget;
    x: number;
    y: number;
  } | null>(null);
  const [clipboardEntry, setClipboardEntry] = useState<ClipboardEntry | null>(null);

  // ── File operations helpers ────────────────────────────────────────────────

  const openFileAt = useCallback(async (filePath: string, line?: number, column?: number) => {
    await fileSystem.openFile(filePath);
    if (typeof line === 'number') {
      navigateToPosition(line, column);
    }
  }, [fileSystem, navigateToPosition]);

  // ── Handle AI-triggered file open ──────────────────────────────────────────

  useEffect(() => {
    const pending = sessionStorage.getItem('jarvis-ide-pending-file');
    if (pending) {
      sessionStorage.removeItem('jarvis-ide-pending-file');
      try {
        const { path, line, column } = JSON.parse(pending);
        if (typeof path === 'string') {
          setTimeout(() => openFileAt(path, line, column), 200);
        }
      } catch { /* ignore malformed data */ }
    }

    const handleOpenFile = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail.path !== 'string') return;
      openFileAt(detail.path, detail.line, detail.column);
    };

    const handleFileChanged = async (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail.path !== 'string') return;
      const filePath: string = detail.path;
      // Show self-edit banner when the IA modifies an open file
      setSelfEditingFile(filePath);
      setTimeout(() => setSelfEditingFile(null), 5000);
      const isOpen = fileSystem.openFiles.some(f => f.path === filePath);
      if (isOpen) {
        await fileSystem.forceReloadFile(filePath);
        setReloadKeys(prev => ({ ...prev, [filePath]: (prev[filePath] ?? 0) + 1 }));
      } else {
        openFileAt(filePath);
      }
    };

    const handleWorkspaceChanged = () => {
      fileSystem.openFiles.forEach(f => fileSystem.closeTab(f.path));
      fileSystem.loadTree();
    };

    window.addEventListener('jarvis-ide-open-file', handleOpenFile);
    window.addEventListener('jarvis-ide-file-changed', handleFileChanged);
    window.addEventListener('jarvis-workspace-changed', handleWorkspaceChanged);
    return () => {
      window.removeEventListener('jarvis-ide-open-file', handleOpenFile);
      window.removeEventListener('jarvis-ide-file-changed', handleFileChanged);
      window.removeEventListener('jarvis-workspace-changed', handleWorkspaceChanged);
    };
  }, [openFileAt, fileSystem]);

  // ── Open Sandbox Diff from StatusBar click ─────────────────────────────────
  useEffect(() => {
    const handleOpenSandboxDiff = () => openSandboxDiff();
    window.addEventListener('jarvis-open-sandbox-diff', handleOpenSandboxDiff);
    return () => window.removeEventListener('jarvis-open-sandbox-diff', handleOpenSandboxDiff);
  }, [openSandboxDiff]);

  // Open Agents panel only on explicit user action (button click, overlay)
  useEffect(() => {
    const handleOpenAgents = () => setShowAgents(true);
    window.addEventListener('jarvis-open-agents-panel', handleOpenAgents);

    return () => {
      window.removeEventListener('jarvis-open-agents-panel', handleOpenAgents);
    };
  }, []);

  const saveActiveFile = useCallback(async () => {
    if (!fileSystem.activePath) return;
    const activeFile = fileSystem.openFiles.find(f => f.path === fileSystem.activePath);
    if (!activeFile?.dirty) return;
    await formatDocument();
    const currentContent = editorRef.current?.getValue() || activeFile.content;
    await fileSystem.saveFile(fileSystem.activePath, currentContent);
  }, [fileSystem, formatDocument, editorRef]);

  const closeTabWithConfirm = useCallback((filePath: string) => {
    const file = fileSystem.openFiles.find(f => f.path === filePath);
    if (file?.dirty) {
      setModalState({ type: 'confirm-delete', filePath, isDir: false });
      return;
    }
    fileSystem.closeTab(filePath);
  }, [fileSystem]);

  const queueMessageToAI = useCallback((message: string, displayText?: string) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    setPendingChatMessage({ text: trimmedMessage, displayText });
    setShowSkillsMonitor(false);
    setShowChat(true);
  }, []);

  // ── Context menu actions ───────────────────────────────────────────────────

  const handleContextAction = useCallback(async (actionId: string, target: ContextTarget) => {
    switch (actionId) {
      case 'open':
        if (target.kind === 'file') fileSystem.openFile(target.path);
        break;
      case 'send-to-ai':
        if (target.kind === 'file') {
          queueMessageToAI(
            `[Fichier sélectionné] ${target.path}`,
            `📄 ${target.name}`
          );
        }
        break;
      case 'new-file':
        setModalState({ type: 'create-file', dir: target.path });
        break;
      case 'new-folder':
        setModalState({ type: 'create-folder', dir: target.path });
        break;
      case 'rename':
        setModalState({ type: 'rename', oldPath: target.path, oldName: target.name });
        break;
      case 'duplicate':
        fileSystem.duplicateEntry(target.path);
        break;
      case 'cut':
        setClipboardEntry({ path: target.path, name: target.name, op: 'cut' });
        break;
      case 'copy':
        setClipboardEntry({ path: target.path, name: target.name, op: 'copy' });
        break;
      case 'paste':
        if (clipboardEntry && target.kind === 'folder') {
          fileSystem.pasteEntry(clipboardEntry.path, clipboardEntry.name, clipboardEntry.op, target.path);
          if (clipboardEntry.op === 'cut') setClipboardEntry(null);
        }
        break;
      case 'copy-path':
        navigator.clipboard?.writeText(target.path);
        break;
      case 'delete':
        setModalState({ type: 'confirm-delete', filePath: target.path, isDir: target.kind === 'folder' });
        break;
      case 'view-diff':
        if (target.kind === 'file' && target.path === fileSystem.activePath) {
          setShowDiffViewer(true);
        }
        break;
    }
  }, [fileSystem, clipboardEntry, queueMessageToAI]);

  // ── Modal actions ──────────────────────────────────────────────────────────

  const handleModalConfirm = useCallback((value?: string) => {
    if (!modalState) return;
    switch (modalState.type) {
      case 'create-file':
        if (value) fileSystem.createFile(modalState.dir, value);
        break;
      case 'create-folder':
        if (value) fileSystem.createFolder(modalState.dir, value);
        break;
      case 'rename':
        if (value) fileSystem.renameEntry(modalState.oldPath, value);
        break;
      case 'confirm-delete':
        fileSystem.deleteEntry(modalState.filePath);
        break;
    }
    setModalState(null);
  }, [modalState, fileSystem]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && fileSystem.activePath) {
        e.preventDefault();
        saveActiveFile();
      }
      if (e.shiftKey && e.altKey && e.key === 'F' && fileSystem.activePath) {
        e.preventDefault();
        formatDocument();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        setShowCommandPalette('files');
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowCommandPalette('commands');
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowGlobalSearch(true);
      }
      // ── Self-IDE shortcuts ────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        // Créer un checkpoint
        fetch('/api/checkpoint/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'checkpoint manuel (Ctrl+Shift+K)' }) }).catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        // Lancer la validation build
        fetch('/api/safeguards/validate', { method: 'POST' }).catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setShowCheckpoints(v => !v);
      }
      // Markdown preview toggle (Ctrl+Shift+M) — only when a .md file is active
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        if (fileSystem.activePath?.toLowerCase().endsWith('.md')) {
          e.preventDefault();
          setMarkdownPreview(v => !v);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveActiveFile, formatDocument, fileSystem.activePath]);

  // Prevent data loss
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (fileSystem.openFiles.some(f => f.dirty)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [fileSystem.openFiles]);

  // Terminal management
  useEffect(() => {
    if (showTerminal) {
      setTimeout(() => {
        terminalRefs.current[activeTerminalId]?.fit();
        terminalRefs.current[activeTerminalId]?.focus();
      }, 100);
    }
  }, [showTerminal, activeTerminalId]);

  // ── Terminal output → detect dev server URL ────────────────────────────────

  const handleTerminalOutput = useCallback((chunk: string) => {
    const chunkLower = chunk.toLowerCase();
    if (
      chunkLower.includes('compiled') ||
      chunkLower.includes('successfully') ||
      chunkLower.includes('exited with') ||
      chunkLower.includes('failed') ||
      chunkLower.includes('done in') ||
      chunkLower.includes('error') ||
      chunkLower.includes('✓ terminal connecté')
    ) {
      setTerminalLoading(false);
    }

    if (previewUrl) return;
    const match = chunk.match(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?/);
    if (match) {
      const detected = match[0].replace(/\/$/, '');
      const currentPort = window.location.port || '80';
      const detectedPort = (match[2] || ':80').replace(':', '');
      if (detectedPort === currentPort) return;
      setPreviewUrl(detected);
      setPreviewKey(k => k + 1);
      setShowPreview(true);
      setShowTerminal(true);
      setTerminalLoading(false);
    }
  }, [previewUrl]);

  // ── Editor handlers ────────────────────────────────────────────────────────

  const sendSelectionToAI = useCallback((editor: any) => {
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model || selection.isEmpty()) return;

    const selectedText = model.getValueInRange(selection).trim();
    if (!selectedText) return;

    queueMessageToAI(selectedText);
  }, [queueMessageToAI]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!fileSystem.activePath || value === undefined) return;
    fileSystem.updateFileContent(fileSystem.activePath, value);
  }, [fileSystem]);

  const handleEditorMount = useCallback((editor: any, monacoInstance: any) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    editorPathRef.current = fileSystem.activePath;
    applySettingsToEditor(editor, ideSettings);
    monacoInstance.editor.setTheme(ideSettings.theme);

    const updateCursor = () => {
      const pos = editor.getPosition();
      setCursorPosition(pos ? { line: pos.lineNumber, column: pos.column } : null);
    };
    editor.onDidChangeCursorPosition(updateCursor);
    updateCursor();

    editor.addAction({
      id: 'jarvis-send-selection-to-ai',
      label: "Envoyer à l'IA",
      keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter],
      precondition: 'editorHasSelection',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: sendSelectionToAI,
    });
  }, [fileSystem.activePath, ideSettings, applySettingsToEditor, sendSelectionToAI]);

  // Apply settings changes imperatively
  useEffect(() => {
    applySettingsToEditor(editorRef.current, ideSettings);
  }, [ideSettings, applySettingsToEditor]);

  // Keep editorPathRef in sync with active file
  useEffect(() => {
    editorPathRef.current = fileSystem.activePath;
  }, [fileSystem.activePath, editorPathRef]);

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(ideSettings.theme);
    }
  }, [ideSettings.theme]);

  // Monaco options (initial render only)
  const monacoOptions = useMemo(() => ({
    fontSize: ideSettings.fontSize,
    wordWrap: ideSettings.wordWrap ? 'on' as const : 'off' as const,
    tabSize: ideSettings.tabSize,
    insertSpaces: true,
    minimap: { enabled: ideSettings.showMinimap },
    renderWhitespace: ideSettings.showWhitespace ? 'all' as const : 'none' as const,
    stickyScroll: { enabled: ideSettings.stickyScroll },
    bracketPairColorization: { enabled: ideSettings.bracketPairs },
    guides: { bracketPairs: ideSettings.bracketPairs, indentation: true },
    lineNumbers: 'on' as const,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on' as const,
    multiCursorModifier: 'alt' as const,
    selectionHighlight: true,
    occurrencesHighlight: 'singleFile' as const,
    folding: true,
    showFoldingControls: 'mouseover' as const,
  }), []);

  // ── Run command handler ────────────────────────────────────────────────────

  const handleRunCommand = useCallback(async (cmd: string) => {
    setShowRunMenu(false);
    setShowTerminal(true);
    setTerminalLoading(true);
    if (cmd === 'npm run dev') {
      setPreviewUrl(null);
      setShowPreview(false);
    }

    // Vérifier si le mode sandbox est actif pour rediriger l'exécution
    let sandboxPrefix = '';
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/sandbox/status', { headers });
      const data = await res.json();
      if (data.status === 'success' && data.sandbox?.active && data.sandbox?.path) {
        // En mode sandbox : forcer PORT=5000 et cd vers le sandbox
        const sandboxRoot = data.sandbox.path.replace(/\\/g, '/');
        sandboxPrefix = `cd "${sandboxRoot}" ; $env:PORT="5000" ; `;
      }
    } catch {
      // Ignore — on exécute la commande normalement
    }

    setTimeout(() => {
      terminalRefs.current[activeTerminalId]?.fit();
      terminalRefs.current[activeTerminalId]?.sendCommand(sandboxPrefix + cmd);
    }, 300);
  }, [activeTerminalId]);

  // ── Active file ────────────────────────────────────────────────────────────

  const activeFile = useMemo(
    () => fileSystem.openFiles.find(f => f.path === fileSystem.activePath),
    [fileSystem.openFiles, fileSystem.activePath]
  );

  // ── Track recent files in localStorage ─────────────────────────────────────
  useEffect(() => {
    if (!fileSystem.activePath) return;
    const active = fileSystem.openFiles.find(f => f.path === fileSystem.activePath);
    if (!active) return;
    try {
      const STORAGE_KEY = 'jarvis_recent_files';
      const stored = localStorage.getItem(STORAGE_KEY);
      const recent: { path: string; language: string; openedAt: number }[] = stored ? JSON.parse(stored) : [];
      const filtered = recent.filter(r => r.path !== active.path);
      filtered.unshift({ path: active.path, language: active.language || '', openedAt: Date.now() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 10)));
    } catch { /* silent */ }
  }, [fileSystem.activePath, fileSystem.openFiles]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', width: showChat && chatDocked ? 'calc(100% - 420px)' : '100%', transition: 'width 0.25s ease' }}>

      {/* Sidebar Unifiée */}
      <UnifiedSidebar
        context="ide"
        showExplorer={showExplorer}
        showGlobalSearch={showGlobalSearch}
        showTerminal={showTerminal}
        showPreview={showPreview}
        showSettings={showSettingsPanel}
        showRunMenu={showRunMenu}
        showGitHub={showGitHub}
        showGit={showGit}
        showCheckpoints={showCheckpoints}
        showSandbox={showSandbox}
        showWorkflow={showWorkflow}
        showSkillsMonitor={showSkillsMonitor}
        showChat={showChat}
        showAgents={showAgents}
        showFleet={showFleet}
        showMissions={showMissions}
        showSystemHealth={showSystemHealth}
        showMcp={showMcp}
        previewUrl={previewUrl}
        assistantConnected={connected}
        assistantWorking={assistantWorking}
        assistantMuted={muted}
        visionEnabled={visionEnabled}
        screenShareEnabled={screenShareEnabled}
        mode={mode}
        onToggleExplorer={() => setShowExplorer(v => !v)}
        onToggleSearch={() => setShowGlobalSearch(v => !v)}
        onToggleTerminal={() => setShowTerminal(v => !v)}
        onTogglePreview={() => setShowPreview(v => !v)}
        onToggleSettings={() => {
          setShowSettingsPanel(v => !v);
          if (!showSettingsPanel) { setShowHelp(false); setShowHistory(false); setShowAutomation(false); }
        }}
        onToggleRunMenu={() => setShowRunMenu(v => !v)}
        onToggleGitHub={() => setShowGitHub(v => !v)}
        onToggleGit={() => setShowGit(v => !v)}
        onToggleCheckpoints={() => setShowCheckpoints(v => !v)}
        onToggleSandbox={toggleSandbox}
        onToggleWorkflow={() => setShowWorkflow(v => !v)}
        onToggleSkillsMonitor={() => setShowSkillsMonitor(v => !v)}
        onToggleChat={() => setShowChat(v => !v)}
        onToggleAgents={() => setShowAgents(v => !v)}
        onToggleFleet={() => setShowFleet(v => !v)}
        onToggleMissions={() => setShowMissions(v => !v)}
        onToggleSystemHealth={() => setShowSystemHealth(v => !v)}
        onToggleMcp={() => setShowMcp(v => !v)}
        onToggleVision={() => setVisionEnabled(v => !v)}
        onToggleScreenShare={toggleScreenShare}
        onToggleMode={() => {
          const next = mode === 'full' ? 'ask' : 'full';
          setMode(next);
          if (connected) {
            setPendingReconnectMode(next);
            disconnect();
          }
        }}
        onRunCommand={handleRunCommand}
        onDisconnectAssistant={disconnect}
        onConnectAssistant={() => connect([], mode)}
        onMuteToggle={toggleMute}
        showHelp={showHelp}
        onToggleHelp={() => {
          setShowHelp(v => !v);
          if (!showHelp) { setShowHistory(false); setShowAutomation(false); setShowSettingsPanel(false); setShowMemory(false); }
        }}
        showHistory={showHistory}
        onToggleHistory={() => {
          setShowHistory(v => !v);
          if (!showHistory) { setShowHelp(false); setShowAutomation(false); setShowSettingsPanel(false); setShowMemory(false); }
        }}
        showAutomation={showAutomation}
        onToggleAutomation={() => {
          setShowAutomation(v => !v);
          if (!showAutomation) { setShowHelp(false); setShowHistory(false); setShowSettingsPanel(false); setShowMemory(false); }
        }}
        showMemory={showMemory}
        onToggleMemory={() => {
          setShowMemory(v => !v);
          if (!showMemory) { setShowHelp(false); setShowHistory(false); setShowAutomation(false); setShowSettingsPanel(false); }
        }}
      />

      {/* File Explorer */}
      {showExplorer && !showGit && (
        <FileExplorer
          tree={fileSystem.tree}
          expandedDirs={fileSystem.expandedDirs}
          loading={fileSystem.loading}
          currentDir={fileSystem.currentDir}
          onOpenFile={fileSystem.openFile}
          onToggleDirectory={fileSystem.toggleDirectory}
          onContextMenu={(e, entry) => {
            e.preventDefault();
            setContextMenu({
              target: { kind: entry.type === 'file' ? 'file' : 'folder', path: entry.path, name: entry.name },
              x: e.clientX,
              y: e.clientY,
            });
          }}
          onCreateFile={() => setModalState({ type: 'create-file', dir: fileSystem.currentDir })}
          onRefresh={fileSystem.loadTree}
          onNavigate={fileSystem.setCurrentDir}
          onMoveEntry={fileSystem.moveEntry}
        />
      )}

      {/* Git Source Control Panel */}
      {showGit && (
        <GitSourceControl onClose={() => setShowGit(false)} />
      )}

      {/* Checkpoints Panel */}
      {showCheckpoints && (
        <div className="border-r flex flex-col min-h-0" style={{ width: '260px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
          <CheckpointPanel />
        </div>
      )}

      {/* Editor Area */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0 relative">
        {/* Tab Bar — masqué quand un panneau plein-écran est actif */}
        {!showSandbox && !showHistory && !showAutomation && !showMemory && !showHelp && !showSettingsPanel && (
          <EditorTabs
            openFiles={fileSystem.openFiles}
            activePath={fileSystem.activePath}
            showMinimap={ideSettings.showMinimap}
            wordWrap={ideSettings.wordWrap}
            activeFileDirty={activeFile?.dirty || false}
            markdownPreview={markdownPreview}
            onSelectTab={fileSystem.setActivePath}
            onCloseTab={closeTabWithConfirm}
            onSave={saveActiveFile}
            onFormat={formatDocument}
            onToggleMinimap={() => updateSetting('showMinimap', !ideSettings.showMinimap)}
            onToggleWordWrap={() => updateSetting('wordWrap', !ideSettings.wordWrap)}
            onToggleMarkdownPreview={() => setMarkdownPreview(v => !v)}
          />
        )}

        {/* Self-Edit Banner — visible when IA modifies the currently open file */}
        <SelfEditBanner
          editingFile={selfEditingFile}
          onRollback={async () => {
            try {
              const res = await fetch('/api/checkpoint/list');
              const data = await res.json();
              if (data.checkpoints?.[0]) {
                await fetch('/api/checkpoint/rollback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ hash: data.checkpoints[0].hash }),
                });
                fileSystem.loadTree();
                if (fileSystem.activePath) {
                  await fileSystem.forceReloadFile(fileSystem.activePath);
                  setReloadKeys(prev => ({ ...prev, [fileSystem.activePath!]: (prev[fileSystem.activePath!] ?? 0) + 1 }));
                }
              }
            } catch { /* silent */ }
            setSelfEditingFile(null);
          }}
          onAccept={() => setSelfEditingFile(null)}
        />

        {/* Global Progress Bar */}
        {(fileSystem.loading || assistantWorking || terminalLoading) && (
          <div className="absolute top-[35px] left-0 right-0 h-[2px] z-50 overflow-hidden bg-white/5">
            <div
              className="h-full bg-[var(--accent-primary)] animate-shimmer"
              style={{
                width: '100%',
                background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
              }}
            />
          </div>
        )}

        {/* Main Editor + Panels Layout */}
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="flex flex-1 min-h-0">
                    {/* Monaco Editor / Settings Panel */}
                    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                      {showSandbox ? (
                        sandboxView === 'diff' ? (
                          <SandboxDiffViewer
                            embedded
                            initialSelectedFile={selectedSandboxDiffFile}
                            onClose={() => {
                              setSandboxView('controls');
                              setSelectedSandboxDiffFile(null);
                            }}
                          />
                        ) : (
                          <div className="flex flex-1 flex-col min-h-0" style={{ backgroundColor: 'var(--bg-panel)' }}>
                            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-base)' }}>
                              <div>
                                <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Sandbox</h2>
                                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  Espace isolé pour examiner et valider vos modifications
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={closeSandbox}
                                className="p-2 rounded-lg hover:bg-white/10 transition"
                                title="Fermer le sandbox"
                                aria-label="Fermer le sandbox"
                              >
                                <X size={15} style={{ color: 'var(--text-muted)' }} />
                              </button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                              <Suspense fallback={<div className="flex flex-1 items-center justify-center"><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement du sandbox…</div></div>}>
                                <SandboxPanel onOpenDiff={openSandboxDiff} />
                              </Suspense>
                            </div>
                          </div>
                        )
                      ) : showSettingsPanel ? (
                        <SettingsPanel
                          settings={ideSettings}
                          onUpdateSetting={updateSetting}
                          onClose={() => setShowSettingsPanel(false)}
                        />
                      ) : showHelp ? (
                        <HelpPanel onClose={() => setShowHelp(false)} />
                      ) : showHistory ? (
                        <HistoryPanel onClose={() => setShowHistory(false)} />
                      ) : showAutomation ? (
                        <AutomationPanel onClose={() => setShowAutomation(false)} />
                      ) : showMemory ? (
                        <MemoryPanel onClose={() => setShowMemory(false)} />
                      ) : activeFile ? (
                                              markdownPreview && activeFile.language === 'markdown' ? (
                                                <MarkdownPreview content={activeFile.content} />
                                              ) : (
                                                <Suspense fallback={<div className="flex flex-1 items-center justify-center"><div className="text-sm" style={{color: 'var(--text-muted)'}}>Chargement de l'éditeur…</div></div>}>
                                                  <MonacoEditor
                                                    key={`${activeFile.path}-${reloadKeys[activeFile.path] ?? 0}`}
                                                    value={activeFile.content}
                                                    language={activeFile.language}
                                                    theme={ideSettings.theme}
                                                    onChange={handleEditorChange}
                                                    onMount={handleEditorMount}
                                                    options={monacoOptions}
                                                    keepCurrentModel={true}
                                                  />
                                                </Suspense>
                                              )
                      ) : (
                        <EmptyEditorState
                                                  onOpenFile={openFileAt}
                                                  onCreateFile={() => setModalState({ type: 'create-file', dir: fileSystem.currentDir })}
                                                  onShowSettings={() => setShowSettingsPanel(true)}
                                                  onOpenTerminal={() => setShowTerminal(true)}
                                                  onOpenSearch={() => setShowGlobalSearch(true)}
                                                  onOpenChat={() => setShowChat(true)}
                                                  onRunProject={() => handleRunCommand('npm run dev')}
                                                />
                      )}
                    </div>

            {/* Global Search Panel */}
            {showGlobalSearch && (
              <div
                className="border-l"
                style={{ width: '320px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
              >
                <GlobalSearch onOpenFile={openFileAt} onClose={() => setShowGlobalSearch(false)} />
              </div>
            )}

            {/* Preview Panel */}
            {showPreview && (
              <PreviewPanel
                previewUrl={previewUrl}
                previewKey={previewKey}
                iframeRef={iframeRef}
                onRefresh={() => setPreviewKey(k => k + 1)}
                onOpenExternal={() => previewUrl && window.open(previewUrl, '_blank')}
                onClose={() => setShowPreview(false)}
              />
            )}

            {/* GitHub Panel */}
            {showGitHub && (
              <GitHubPanel onClose={() => setShowGitHub(false)} />
            )}

            {/* Workflow Panel */}
            {showWorkflow && (
              <WorkflowPanel onClose={() => setShowWorkflow(false)} />
            )}

            {/* MCP Panel */}
                        {showMcp && (
                          <div className="border-l flex flex-col min-h-0" style={{ width: 320, borderColor: 'var(--border-base)' }}>
                            <McpPanel />
                          </div>
                        )}

                        {/* System Health Dashboard */}
                        {showSystemHealth && (
                          <SystemHealthDashboard onClose={() => setShowSystemHealth(false)} />
                        )}

                        {/* Vision Panel */}
                        {visionEnabled && (
                          <div
                            className="border-l flex flex-col min-h-0"
                            style={{ width: '260px', minWidth: '260px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
                          >
                            <Suspense fallback={<div className="flex flex-1 items-center justify-center"><div className="text-sm" style={{color: 'var(--text-muted)'}}>Chargement de la vision…</div></div>}>
                              <VisionPanel connected={connected} onFrame={sendVideoFrame} />
                            </Suspense>
                          </div>
                        )}

            {/* Live Skills Monitor */}
            {showSkillsMonitor && connected && (
              <div
                className="border-l flex flex-col min-h-0 overflow-hidden"
                style={{ width: '280px', minWidth: '280px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
              >
                <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '60%' }}>
                  <LiveSkillsMonitor />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden" />
              </div>
            )}

            {/* Chat/Agent Panel — moved to overlay below */}

            {/* Agents Panel — now rendered as modal overlay below */}

            {/* Agent Fleet Panel — rendered as modal overlay below */}

            {/* Missions Panel */}
            {showMissions && (
              <div
                className="border-l flex flex-col min-h-0"
                style={{ width: 340, borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <MissionPanel inline />
              </div>
            )}
          </div>

          {/* Terminal Panel */}
          {showTerminal && (
            <div
              className="border-t flex flex-col flex-shrink-0"
              style={{ height: '280px', minHeight: '180px', borderColor: 'var(--border-base)', backgroundColor: '#1a1a1a' }}
              role="region"
              aria-label="Panneau de terminal"
            >
              <div
                className="flex items-center gap-2 px-2 py-1 border-b flex-shrink-0"
                style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
                role="tablist"
                aria-label="Onglets de terminal"
              >
                <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                  {terminals.map((terminal) => (
                    <div
                      key={terminal.id}
                      onClick={() => setActiveTerminalId(terminal.id)}
                      role="tab"
                      aria-selected={activeTerminalId === terminal.id}
                      className={`flex items-center gap-2 px-3 py-1 rounded-t text-xs transition-colors cursor-pointer ${
                        activeTerminalId === terminal.id ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <span>Terminal {terminal.id}</span>
                      <button
                        onClick={(e) => closeTerminal(terminal.id, e)}
                        className="p-0.5 rounded hover:bg-white/10"
                        title="Fermer le terminal"
                        aria-label={`Fermer Terminal ${terminal.id}`}
                      >
                        <X size={10} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addTerminal}
                    className="p-1.5 rounded hover:bg-white/10"
                    title="Nouveau terminal"
                    aria-label="Ajouter un nouveau terminal"
                  >
                    <Plus size={12} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
                <button
                  onClick={() => setShowTerminal(false)}
                  className="rounded p-1 hover:bg-white/10"
                  title="Fermer le panneau"
                  aria-label="Fermer le panneau de terminal"
                >
                  <X size={12} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              {/* Active Terminal Content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {terminals.map((terminal) => (
                  <div
                    key={terminal.id}
                    id={`terminal-panel-${terminal.id}`}
                    role="tabpanel"
                    className={`w-full h-full ${activeTerminalId === terminal.id ? 'block' : 'hidden'}`}
                  >
                    <TerminalComponent
                      ref={(ref) => { terminalRefs.current[terminal.id] = ref; }}
                      onOutput={handleTerminalOutput}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Agent Progress Bar */}
        <AgentProgressBar steps={activity} connected={connected} onClear={clearActivity} reasoning={reasoning} />

        {/* Status Bar */}
        <StatusBar
          filePath={fileSystem.activePath}
          language={activeFile?.language}
          line={cursorPosition?.line}
          column={cursorPosition?.column}
          dirty={activeFile?.dirty}
          assistantBusy={assistantWorking}
          onToggleSandbox={toggleSandbox}
          onToggleMcp={() => setShowMcp(v => !v)}
          onToggleAgents={() => setShowAgents(v => !v)}
          onToggleFleet={() => setShowFleet(v => !v)}
          onToggleLogs={() => setShowAssistantLogs(v => !v)}
        />
      </div>

      {/* Modals and Overlays */}
      {modalState && (
        <IdeModal mode={modalState} onConfirm={handleModalConfirm} onCancel={() => setModalState(null)} />
      )}

      {contextMenu && (
        <ContextMenu
          target={contextMenu.target}
          x={contextMenu.x}
          y={contextMenu.y}
          activeFilePath={fileSystem.activePath}
          clipboardEntry={clipboardEntry}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showDiffViewer && activeFile && (
        <DiffViewer
          filePath={activeFile.path}
          currentContent={activeFile.content}
          theme={ideSettings.theme}
          onClose={() => setShowDiffViewer(false)}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          mode={showCommandPalette}
          openFiles={fileSystem.openFiles}
          onOpenFile={fileSystem.openFile}
          onClose={() => setShowCommandPalette(null)}
          onSave={saveActiveFile}
          onFormat={formatDocument}
          onToggleMinimap={() => updateSetting('showMinimap', !ideSettings.showMinimap)}
          onToggleWordWrap={() => updateSetting('wordWrap', !ideSettings.wordWrap)}
          onToggleSettings={() => setShowSettingsPanel(!showSettingsPanel)}
          onShowDiff={() => setShowDiffViewer(true)}
        />
      )}

      {/* Agent/Mission Activity Overlay — always visible when working */}
      <AgentActivityOverlay
        onOpenAgents={() => setShowAgents(true)}
        onOpenMissions={() => setShowMissions(true)}
      />

      {/* Chat Panel — floating overlay above everything */}
      {showChat && !showSkillsMonitor && (
        <ChatPanel
          pendingMessage={pendingChatMessage}
          onPendingMessageConsumed={() => setPendingChatMessage(null)}
          onDockedChange={setChatDocked}
        />
      )}

      {/* Assistant Logs — modal overlay */}
      {showAssistantLogs && (
        <AssistantLogsPanel onClose={() => setShowAssistantLogs(false)} />
      )}

      {/* Agents Panel — modal overlay */}
      {showAgents && (
        <AgentPanel inline onClose={() => setShowAgents(false)} />
      )}

      {/* Fleet Panel — modal overlay */}
      {showFleet && (
        <AgentFleetPanel inline onClose={() => setShowFleet(false)} />
      )}
    </div>
  );
}

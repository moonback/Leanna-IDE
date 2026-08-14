import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Mic, MicOff, Loader2, User, Bot,
  Trash2, ChevronDown, Power, Zap, GripVertical, Minus, PanelRight,
} from 'lucide-react';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import { useProfile, type UserProfile } from '../../context/UserProfileContext';
import { FileCard, CommandCard } from './ChatCards';
import { ActivityFeed } from './ActivityFeed';
import { MultiAgentIndicator } from './MultiAgentIndicator';
import { MentionDropdown } from './MentionDropdown';
import { SlashCommandDropdown } from './SlashCommandDropdown';
import { useFileMention } from '../../hooks/useFileMention';
import { useSlashCommand } from '../../hooks/useSlashCommand';
import { DocumentUpload, DropZoneOverlay, useDocumentDrop, type DocumentResult } from './DocumentUpload';
import type { TranscriptEntry, ActivityStep } from '../../hooks/useLiveAPI';

// ─── Hook pour gérer la file d'attente des messages ──────────────────────
interface PendingChatMessage {
  text: string;
  displayText?: string;
}

function useMessageQueue(
  isBusy: boolean,
  connected: boolean,
  sendTextMessage: (text: string, displayText?: string) => void
) {
  const [queue, setQueue] = useState<PendingChatMessage[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Ne rien faire si le timer est déjà en attente — il sera nettoyé par le cleanup
    if (!isBusy && queue.length > 0 && connected) {
      timerRef.current = setTimeout(() => {
        const [next, ...rest] = queue;
        sendTextMessage(next.text, next.displayText);
        setQueue(rest);
        timerRef.current = null;
      }, 300);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isBusy, queue, connected, sendTextMessage]);

  const enqueue = useCallback((message: PendingChatMessage) => {
    setQueue(prev => [...prev, message]);
  }, []);

  return { queue, enqueue };
}

// ─── Styles constants pour les bulles de chat ─────────────────────────────
const BUBBLE_STYLES = {
  assistant: {
    bg: 'var(--bg-secondary)',
    border: 'var(--border-base)',
    borderRadius: '4px 16px 16px 16px',
  },
  user: {
    bg: 'var(--accent-subtle)',
    border: 'rgba(14,165,233,0.2)',
    borderRadius: '16px 4px 16px 16px',
  },
} as const;

// ─── Composants memoïsés ──────────────────────────────────────────────────
const ChatMessage = memo(function ChatMessage({
  entry,
  profile: _profile,
}: {
  entry: TranscriptEntry;
  profile: UserProfile;
}) {
  const isAssistant = entry.role === 'assistant';
  const bubbleStyle = isAssistant ? BUBBLE_STYLES.assistant : BUBBLE_STYLES.user;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex gap-2 ${isAssistant ? '' : 'flex-row-reverse'}`}
    >
      <div
        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
        style={{
          backgroundColor: isAssistant ? 'var(--accent-subtle)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isAssistant ? 'rgba(14,165,233,0.3)' : 'var(--border-base)'}`,
        }}
      >
        {isAssistant
          ? <Bot size={11} style={{ color: 'var(--accent-primary)' }} />
          : <User size={11} style={{ color: 'var(--text-muted)' }} />
        }
      </div>
      <div className={`max-w-[85%] ${isAssistant ? '' : 'text-right'}`}>
        <div
          className="px-3 py-2 rounded-2xl text-[12px] leading-relaxed inline-block text-left"
          style={{
            backgroundColor: bubbleStyle.bg,
            border: `1px solid ${bubbleStyle.border}`,
            borderRadius: bubbleStyle.borderRadius,
            color: 'var(--text-primary)',
          }}
        >
          {entry.text}
        </div>
        <span className="text-[9px] font-mono px-1 mt-0.5 block" style={{ color: 'var(--text-dimmed)' }}>
          {entry.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
});

const AgentStep = memo(function AgentStep({ step }: { step: ActivityStep }) {
  const isRunning = step.status === 'running';
  return (
    <div className="flex items-center gap-2 py-0.5 pl-2">
      {isRunning ? (
        <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
      ) : (
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#34d399' }} />
      )}
      <span
        className="text-[10px] truncate"
        style={{ color: isRunning ? 'var(--text-primary)' : 'var(--text-muted)' }}
      >
        {step.label}
      </span>
    </div>
  );
});

// ─── Utilitaire pour replacer le curseur après mise à jour de l'input ────
function setCursorPosition(textarea: HTMLTextAreaElement, pos: number): void {
  // requestAnimationFrame garantit que React a flushed le DOM avant de lire selectionStart
  requestAnimationFrame(() => {
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
  });
}

// ─── Sous-composant InputArea ─────────────────────────────────────────────
interface InputAreaProps {
  connected: boolean;
  isBusy: boolean;
  onSend: (text: string) => void;
  onDocumentAnalyzed: (result: DocumentResult) => void;
}

function InputArea({ connected, isBusy, onSend, onDocumentAnalyzed }: InputAreaProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = connected && !isBusy;

  // Hooks de mentions et commandes
  const {
    suggestions,
    showSuggestions,
    selectedIndex,
    setSelectedIndex,
    handleMentionKeyDown,
    acceptSuggestion,
    mentionQuery,
  } = useFileMention(input, textareaRef.current?.selectionStart ?? 0);

  const {
    suggestions: slashSuggestions,
    showSuggestions: showSlashSuggestions,
    selectedIndex: slashSelectedIndex,
    setSelectedIndex: setSlashSelectedIndex,
    handleSlashKeyDown,
    acceptCommand,
    commandQuery,
  } = useSlashCommand(input, textareaRef.current?.selectionStart ?? 0);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !canSend) return;
    onSend(text);
    setInput('');
    textareaRef.current?.focus();
  }, [input, canSend, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Navigation dans les dropdowns
      if (showSlashSuggestions && slashSuggestions.length > 0) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape') {
          handleSlashKeyDown(e);
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const selected = slashSuggestions[slashSelectedIndex];
          if (selected) {
            e.preventDefault();
            const { newInput, newCursorPos } = acceptCommand(selected);
            setInput(newInput);
            if (textareaRef.current) setCursorPosition(textareaRef.current, newCursorPos);
          }
          return;
        }
      }

      if (showSuggestions && suggestions.length > 0) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape') {
          handleMentionKeyDown(e);
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const selected = suggestions[selectedIndex];
          if (selected) {
            e.preventDefault();
            const { newInput, newCursorPos } = acceptSuggestion(selected);
            setInput(newInput);
            if (textareaRef.current) setCursorPosition(textareaRef.current, newCursorPos);
          }
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      showSlashSuggestions,
      slashSuggestions,
      slashSelectedIndex,
      handleSlashKeyDown,
      acceptCommand,
      showSuggestions,
      suggestions,
      selectedIndex,
      handleMentionKeyDown,
      acceptSuggestion,
      handleSend,
    ]
  );

  return (
    <div
      className="flex-shrink-0 px-3 pb-3 pt-2"
      style={{ borderTop: '1px solid var(--border-base)' }}
    >
      <div
        className="relative flex items-end gap-2 px-3 py-2 transition-all"
        style={{
          backgroundColor: 'var(--bg-input)',
          border: '1px solid var(--border-base)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        {showSuggestions && suggestions.length > 0 && (
          <MentionDropdown
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onSelect={(suggestion) => {
              const { newInput, newCursorPos } = acceptSuggestion(suggestion);
              setInput(newInput);
              if (textareaRef.current) setCursorPosition(textareaRef.current, newCursorPos);
            }}
            onHover={setSelectedIndex}
            query={mentionQuery}
          />
        )}

        {showSlashSuggestions && slashSuggestions.length > 0 && (
          <SlashCommandDropdown
            suggestions={slashSuggestions}
            selectedIndex={slashSelectedIndex}
            onSelect={(suggestion) => {
              const { newInput, newCursorPos } = acceptCommand(suggestion);
              setInput(newInput);
              if (textareaRef.current) setCursorPosition(textareaRef.current, newCursorPos);
            }}
            onHover={setSlashSelectedIndex}
            query={commandQuery}
          />
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={connected ? 'Message… (@ fichier, / skill)' : 'Connectez-vous d\'abord'}
          disabled={!canSend}
          rows={1}
          className="flex-1 bg-transparent text-[12px] resize-none outline-none placeholder:opacity-50 min-h-[20px] max-h-[80px]"
          style={{ color: 'var(--text-primary)' }}
          aria-label="Saisie du message"
          aria-describedby="chat-input-hints"
          aria-autocomplete="list"
          aria-haspopup="listbox"
        />
        <DocumentUpload connected={connected} onDocumentAnalyzed={onDocumentAnalyzed} />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !canSend}
          className="p-1.5 rounded-lg transition-all disabled:opacity-30 hover:bg-white/10"
          title="Envoyer (Enter)"
          aria-label="Envoyer le message"
        >
          <Send size={14} style={{ color: 'var(--accent-primary)' }} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span id="chat-input-hints" className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
          Enter envoyer • @ fichier • / skill • 📎 document
        </span>
        {connected && (
          <span className="text-[9px] flex items-center gap-1" style={{ color: isBusy ? 'var(--accent-primary)' : '#34d399' }}>
            <div className={`w-1.5 h-1.5 rounded-full ${isBusy ? 'bg-sky-400 animate-pulse' : 'bg-green-400'}`} />
            {isBusy ? 'En cours…' : 'Connecté'}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Hook pour rendre un élément déplaçable ───────────────────────────────
function useDraggable() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore si on clique sur un bouton
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({
        x: posStart.current.x + dx,
        y: posStart.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return { position, isDragging, handleMouseDown };
}

// ─── Composant principal ──────────────────────────────────────────────────
interface ChatPanelProps {
  pendingMessage?: PendingChatMessage | null;
  onPendingMessageConsumed?: () => void;
}

export function ChatPanel({ pendingMessage, onPendingMessageConsumed }: ChatPanelProps = {}) {
  const {
    connected, connecting, connect, disconnect,
    sendTextMessage, sendRawMessage, transcript, clearTranscript,
    activity, isBusy, muted, toggleMute,
  } = useLiveAPIContext();
  const { profile } = useProfile();
  const [showActivity, setShowActivity] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [docked, setDocked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Draggable
  const { position, isDragging: isDraggingPanel, handleMouseDown: handleDragMouseDown } = useDraggable();

  // File d'attente
  const { queue, enqueue } = useMessageQueue(isBusy, connected, sendTextMessage);

  // Mémorisation des valeurs dérivées
  const runningSteps = useMemo(() => activity.filter(s => s.status === 'running'), [activity]);
  const doneSteps = useMemo(() => activity.filter(s => s.status === 'done'), [activity]);
  const recentActivity = useMemo(() => activity.slice(-12), [activity]);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 20;
  }, []);

  // Scroll automatique uniquement si l'utilisateur est déjà proche du bas.
  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript.length, queue.length, isBusy, connecting]);

  // Gestion de l'envoi (utilisée par InputArea)
  const handleSend = useCallback(
    (text: string, displayText?: string) => {
      if (!connected) return;
      try {
        if (isBusy) {
          enqueue({ text, displayText });
        } else {
          sendTextMessage(text, displayText);
        }
      } catch (err) {
        console.error('[ChatPanel] sendTextMessage failed:', err);
      }
    },
    [connected, isBusy, enqueue, sendTextMessage]
  );

  useEffect(() => {
    if (!pendingMessage) return;

    if (!connected) {
      if (!connecting) connect([], 'full');
      return;
    }

    handleSend(pendingMessage.text, pendingMessage.displayText);
    onPendingMessageConsumed?.();
  }, [pendingMessage, connected, connecting, connect, handleSend, onPendingMessageConsumed]);

  // Document upload
  const handleDocumentAnalyzed = useCallback(
    (result: DocumentResult) => {
      if (!connected) return;
      try {
        sendRawMessage({
          type: 'document_context',
          fileName: result.fileName,
          summary: result.summary,
        });
      } catch (err) {
        console.error('[ChatPanel] sendRawMessage failed:', err);
      }
    },
    [connected, sendRawMessage]
  );

  // Drag & Drop
  const { isDragging, dropHandlers } = useDocumentDrop({
    connected,
    onDocumentAnalyzed: handleDocumentAnalyzed,
  });

  // Actions de contrôle
  const handleClear = useCallback(() => clearTranscript(), [clearTranscript]);
  const handleToggleMute = useCallback(() => toggleMute(), [toggleMute]);
  const handleToggleConnect = useCallback(() => {
    if (connected) disconnect();
    else connect([], 'full');
  }, [connected, disconnect, connect]);

  return (
    <div
      className="fixed flex flex-col overflow-hidden"
      style={{
        top: docked ? '0' : '80px',
        right: docked ? '0' : '24px',
        width: minimized ? '300px' : docked ? '420px' : '420px',
        height: minimized ? 'auto' : docked ? '100vh' : 'calc(100vh - 120px)',
        maxHeight: minimized ? undefined : docked ? '100vh' : '800px',
        minWidth: minimized ? '200px' : '320px',
        zIndex: 9990,
        backgroundColor: 'var(--bg-panel)',
        border: docked ? 'none' : '1px solid var(--border-base)',
        borderLeft: docked ? '1px solid var(--border-base)' : undefined,
        borderRadius: docked ? '0' : '16px',
        transform: docked ? 'none' : `translate(${position.x}px, ${position.y}px)`,
        cursor: isDraggingPanel && !docked ? 'grabbing' : undefined,
        userSelect: isDraggingPanel ? 'none' : undefined,
        boxShadow: docked
          ? '-4px 0 20px rgba(0,0,0,0.2)'
          : isDraggingPanel
            ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)'
            : '0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
        transition: isDraggingPanel ? 'box-shadow 0.15s' : 'all 0.25s ease',
        backdropFilter: 'blur(12px)',
      }}
      {...dropHandlers}
    >
      <DropZoneOverlay isDragging={isDragging} />

      {/* ─── Header (draggable) ─── */}
      <div
        onMouseDown={docked ? undefined : handleDragMouseDown}
        className="flex items-center gap-2.5 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-base)', cursor: docked ? 'default' : 'grab' }}
      >
        {!docked && <GripVertical size={12} style={{ color: 'var(--text-dimmed)', flexShrink: 0 }} />}
        <div className="relative">
          <Bot size={16} style={{ color: connected ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
          <div
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{
              backgroundColor: connected ? '#34d399' : connecting ? '#fbbf24' : '#52525b',
              border: '1.5px solid var(--bg-panel)',
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold block" style={{ color: 'var(--text-primary)' }}>
            {profile?.aiName || 'Leanna'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: connected ? '#34d399' : connecting ? '#fbbf24' : 'var(--text-dimmed)' }}>
              {connecting ? 'Connexion en cours…' : isBusy ? 'En cours…' : connected ? 'En ligne' : 'Hors ligne'}
            </span>
            <MultiAgentIndicator steps={activity} />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {connected && (
            <button
              onClick={handleToggleMute}
              className="p-1.5 rounded-lg hover:bg-white/10 transition"
              title={muted ? 'Réactiver le micro' : 'Couper le micro'}
              aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
            >
              {muted
                ? <MicOff size={14} style={{ color: '#f59e0b' }} />
                : <Mic size={14} style={{ color: '#34d399' }} />
              }
            </button>
          )}
          {transcript.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg hover:bg-white/10 transition"
              title="Effacer la conversation"
              aria-label="Effacer la conversation"
            >
              <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
          <button
            onClick={() => setDocked(d => !d)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition"
            title={docked ? 'Détacher du bord' : 'Ancrer à droite'}
            aria-label={docked ? 'Détacher du bord' : 'Ancrer à droite'}
          >
            <PanelRight size={14} style={{ color: docked ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
          </button>
          <button
            onClick={() => setMinimized(m => !m)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition"
            title={minimized ? 'Agrandir' : 'Réduire'}
            aria-label={minimized ? 'Agrandir le panneau' : 'Réduire le panneau'}
          >
            <Minus size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={handleToggleConnect}
            className="p-1.5 rounded-lg hover:bg-white/10 transition"
            title={connected ? 'Déconnecter' : 'Connecter'}
            aria-label={connected ? 'Déconnecter' : 'Connecter'}
          >
            <Power size={14} style={{ color: connected ? '#ef4444' : 'var(--accent-primary)' }} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* ─── Messages Area ─── */}
          <div
            ref={messagesRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar"
          >
        

        {connecting && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Connexion en cours...</span>
          </div>
        )}

        {transcript.length === 0 && activity.length === 0 && !connecting && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Bot size={24} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="text-center">
              <p className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {connected ? 'Prêt à aider' : 'Agent hors ligne'}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {connected
                  ? 'Posez une question ou dictez une instruction'
                  : 'Connectez-vous pour démarrer une conversation'
                }
              </p>
            </div>
            
          </div>
        )}

        <AnimatePresence initial={false}>
          {transcript.map((entry) => (
            <ChatMessage key={entry.id} entry={entry} profile={profile!} />
          ))}
        </AnimatePresence>

        {activity.length > 0 && (
          <div className="mt-2 space-y-2">
            {activity
              .filter(s => s.status === 'done' && (s.tool.includes('write') || s.tool.includes('modify') || s.tool.includes('patch') || s.tool.includes('create') || s.tool.includes('delete')))
              .slice(-5)
              .map(step => {
                const action = step.tool.includes('delete') ? 'deleted' as const
                  : step.tool.includes('create') ? 'created' as const
                  : 'modified' as const;
                const path = step.label.replace(/^(Écrire|Modifier|Patcher|Créer|Supprimer|Renommer)\s*/i, '');
                return <FileCard key={step.id} path={path} action={action} />;
              })}

            {activity
              .filter(s => s.status === 'done' && s.tool === 'system_execute_command')
              .slice(-3)
              .map(step => (
                <CommandCard key={step.id} command={step.label.replace('Shell: ', '')} exitCode={0} />
              ))}

            <button
              onClick={() => setShowActivity(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-medium mb-1.5 transition hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              aria-expanded={showActivity}
              aria-label={showActivity ? 'Masquer les étapes' : 'Afficher les étapes'}
            >
              <Zap size={10} style={{ color: runningSteps.length > 0 ? 'var(--accent-primary)' : '#34d399' }} />
              <span>{doneSteps.length} étape{doneSteps.length > 1 ? 's' : ''}</span>
              {runningSteps.length > 0 && (
                <span style={{ color: 'var(--accent-primary)' }}>• {runningSteps.length} en cours</span>
              )}
              <ChevronDown size={10} className={`transition-transform ${showActivity ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showActivity && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-0.5 pl-1 border-l-2 ml-1" style={{ borderColor: 'var(--border-base)' }}>
                    {recentActivity.map((step) => (
                      <AgentStep key={step.id} step={step} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {isBusy && (
          <div className="flex items-center gap-2 px-3 py-2">
            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {profile?.aiName || 'Leanna'} réfléchit…
            </span>
          </div>
        )}

        {queue.length > 0 && (
          <div className="px-3 py-1.5 space-y-1">
            {queue.map((msg, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid rgba(14,165,233,0.15)',
                }}
              >
                <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                <span className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                  {msg.displayText ?? msg.text}
                </span>
                <span className="text-[9px] flex-shrink-0 ml-auto" style={{ color: 'var(--text-dimmed)' }}>
                  en attente
                </span>
              </div>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ─── Activity Feed ─── */}
      <ActivityFeed steps={activity} connected={connected} />

      {/* ─── Input Area ─── */}
      <InputArea
        connected={connected}
        isBusy={isBusy}
        onSend={handleSend}
        onDocumentAnalyzed={handleDocumentAnalyzed}
      />
        </>
      )}
    </div>
  );
}
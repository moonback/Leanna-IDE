import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useReducedMotion, animate } from 'motion/react';
import {
  Send, Mic, MicOff, User, Bot,
  Trash2, Power, GripVertical, Minus, PanelRight, Maximize2, Minimize2,
} from 'lucide-react';
import { marked } from 'marked';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import { useProfile, type UserProfile } from '../../context/UserProfileContext';
import { ActivityFeed } from './ActivityFeed';
import { MultiAgentIndicator } from './MultiAgentIndicator';
import { MentionDropdown } from './MentionDropdown';
import { SlashCommandDropdown } from './SlashCommandDropdown';
import { useFileMention } from '../../hooks/useFileMention';
import { useSlashCommand } from '../../hooks/useSlashCommand';
import { DocumentUpload, DropZoneOverlay, useDocumentDrop, type DocumentResult } from './DocumentUpload';
import type { TranscriptEntry } from '../../hooks/useLiveAPI';

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

// ─── Rendu Markdown pour les messages assistant ───────────────────────────
const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      const result = marked.parse(text, { gfm: true, breaks: true });
      return typeof result === 'string' ? result : '';
    } catch {
      return text;
    }
  }, [text]);

  return (
    <div
      className="chat-markdown"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled HTML from markdown parser
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

// ─── Trois points qui respirent — indicateur d'activité partagé ──────────
const BreathingDots = memo(function BreathingDots({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  if (reduceMotion) {
    return (
      <div className="flex items-center gap-0.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1 h-1 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -1, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
});

// ─── Composants memoïsés ──────────────────────────────────────────────────
const ChatMessage = memo(function ChatMessage({
  entry,
  profile: _profile,
  reduceMotion,
}: {
  entry: TranscriptEntry;
  profile: UserProfile;
  reduceMotion: boolean;
}) {
  const isAssistant = entry.role === 'assistant';
  const bubbleStyle = isAssistant ? BUBBLE_STYLES.assistant : BUBBLE_STYLES.user;
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0.1 } : { type: 'spring', bounce: 0.1, duration: 0.35 }}
      className={`flex gap-2 group ${isAssistant ? '' : 'flex-row-reverse'}`}
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
          className="px-3 py-2 rounded-2xl text-[0.75rem] leading-relaxed inline-block text-left"
          style={{
            backgroundColor: bubbleStyle.bg,
            border: `1px solid ${bubbleStyle.border}`,
            borderRadius: bubbleStyle.borderRadius,
            color: 'var(--text-primary)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
          }}
        >
          {isAssistant ? <ChatMarkdown text={entry.text} /> : entry.text}
        </div>
        <span
          className="text-[0.5625rem] tracking-wide font-mono px-1 mt-0.5 block opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-dimmed)' }}
        >
          {entry.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
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
  const [isFocused, setIsFocused] = useState(false);
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
        className="relative flex items-end gap-2 px-3 py-2 transition-[border-color,box-shadow] duration-150"
        style={{
          backgroundColor: 'var(--bg-input)',
          border: `1px solid ${isFocused ? 'var(--accent-primary)' : 'var(--border-base)'}`,
          borderRadius: 'var(--radius-lg)',
          boxShadow: isFocused ? '0 0 0 3px rgba(14,165,233,0.12)' : 'none',
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
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={connected ? 'Message… (@ fichier, / skill)' : 'Connectez-vous d\'abord'}
          disabled={!canSend}
          rows={1}
          className="flex-1 bg-transparent text-[0.75rem] resize-none outline-none placeholder:opacity-50 min-h-[20px] max-h-[80px]"
          style={{ color: 'var(--text-primary)' }}
          aria-label="Saisie du message"
          aria-describedby="chat-input-hints"
          aria-autocomplete="list"
          aria-haspopup="listbox"
        />
        <DocumentUpload connected={connected} onDocumentAnalyzed={onDocumentAnalyzed} />
        <motion.button
          onClick={handleSend}
          disabled={!input.trim() || !canSend}
          whileTap={input.trim() && canSend ? { scale: 0.9 } : undefined}
          className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-white/10"
          title="Envoyer (Enter)"
          aria-label="Envoyer le message"
        >
          <Send size={14} style={{ color: 'var(--accent-primary)' }} />
        </motion.button>
      </div>
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span id="chat-input-hints" className="text-[0.5625rem] tracking-wide" style={{ color: 'var(--text-dimmed)' }}>
          Enter envoyer • @ fichier • / skill • 📎 document
        </span>
        {connected && (
          <span className="text-[0.5625rem] tracking-wide flex items-center gap-1.5" style={{ color: isBusy ? 'var(--accent-primary)' : '#34d399' }}>
            <BreathingDots color={isBusy ? '#38bdf8' : '#4ade80'} reduceMotion={false} />
            {isBusy ? 'En cours…' : 'Connecté'}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Rubber-band : résistance progressive au-delà des limites ────────────
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function clampWithRubberband(value: number, min: number, max: number, dimension: number): number {
  if (value < min) return min + rubberband(value - min, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
}

// ─── Hook pour rendre le panneau déplaçable (Pointer Events, borné, avec rebond) ─
interface DragSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  anchorRect: DOMRect;
  startX: number;
  startY: number;
  moved: boolean;
}

const DRAG_HYSTERESIS = 6; // px avant qu'un clic ne devienne un drag
const EDGE_MARGIN = 8;

function useDraggablePanel(panelRef: React.RefObject<HTMLDivElement | null>, disabled: boolean, reduceMotion: boolean) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const session = useRef<DragSession | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const panel = panelRef.current;
    if (!panel) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    session.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      anchorRect: panel.getBoundingClientRect(),
      startX: mx.get(),
      startY: my.get(),
      moved: false,
    };
  }, [disabled, panelRef, mx, my]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startClientX;
    const dy = e.clientY - s.startClientY;
    if (!s.moved) {
      if (Math.hypot(dx, dy) < DRAG_HYSTERESIS) return;
      s.moved = true;
      setIsDragging(true);
    }
    const minLeft = EDGE_MARGIN;
    const maxLeft = window.innerWidth - EDGE_MARGIN - s.anchorRect.width;
    const minTop = EDGE_MARGIN;
    const maxTop = window.innerHeight - EDGE_MARGIN - s.anchorRect.height;

    const clampedLeft = clampWithRubberband(s.anchorRect.left + dx, minLeft, maxLeft, window.innerWidth);
    const clampedTop = clampWithRubberband(s.anchorRect.top + dy, minTop, maxTop, window.innerHeight);

    mx.set(s.startX + (clampedLeft - s.anchorRect.left));
    my.set(s.startY + (clampedTop - s.anchorRect.top));
  }, [mx, my]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    setIsDragging(false);

    const minLeft = EDGE_MARGIN;
    const maxLeft = window.innerWidth - EDGE_MARGIN - s.anchorRect.width;
    const minTop = EDGE_MARGIN;
    const maxTop = window.innerHeight - EDGE_MARGIN - s.anchorRect.height;

    const curLeft = s.anchorRect.left + (mx.get() - s.startX);
    const curTop = s.anchorRect.top + (my.get() - s.startY);
    const targetLeft = Math.min(Math.max(curLeft, minLeft), maxLeft);
    const targetTop = Math.min(Math.max(curTop, minTop), maxTop);

    // Rebond de retour dans les bornes, avec transfert de la vélocité du relâchement (§5/§9)
    if (targetLeft !== curLeft) {
      animate(mx, mx.get() + (targetLeft - curLeft), reduceMotion
        ? { duration: 0.15, ease: 'easeOut' }
        : { type: 'spring', bounce: 0.15, duration: 0.4, velocity: mx.getVelocity() });
    }
    if (targetTop !== curTop) {
      animate(my, my.get() + (targetTop - curTop), reduceMotion
        ? { duration: 0.15, ease: 'easeOut' }
        : { type: 'spring', bounce: 0.15, duration: 0.4, velocity: my.getVelocity() });
    }
    session.current = null;
  }, [mx, my, reduceMotion]);

  const resetPosition = useCallback(() => {
    mx.set(0);
    my.set(0);
  }, [mx, my]);

  return {
    mx, my, isDragging, resetPosition,
    dragHandlers: { onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: handlePointerUp },
  };
}

// ─── Composant principal ──────────────────────────────────────────────────
interface ChatPanelProps {
  pendingMessage?: PendingChatMessage | null;
  onPendingMessageConsumed?: () => void;
  onDockedChange?: (docked: boolean) => void;
}

export function ChatPanel({ pendingMessage, onPendingMessageConsumed, onDockedChange }: ChatPanelProps = {}) {
  const {
    connected, connecting, connect, disconnect,
    sendTextMessage, sendRawMessage, transcript, clearTranscript,
    activity, isBusy, muted, toggleMute,
  } = useLiveAPIContext();
  const { profile } = useProfile();
  const [minimized, setMinimized] = useState(false);
  const [docked, setDocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const reduceMotion = !!useReducedMotion();

  // Notify parent when docked state changes
  useEffect(() => {
    onDockedChange?.(docked);
  }, [docked, onDockedChange]);

  // Draggable (Pointer Events, borné avec rebond élastique, vélocité transférée au relâchement)
  const { mx, my, isDragging: isDraggingPanel, resetPosition, dragHandlers } =
    useDraggablePanel(panelRef, docked || fullscreen, reduceMotion);

  // Le panneau ne doit pas garder un offset de drag quand on ancre/plein-écran
  useEffect(() => {
    if (docked || fullscreen) resetPosition();
  }, [docked, fullscreen, resetPosition]);

  // File d'attente
  const { queue, enqueue } = useMessageQueue(isBusy, connected, sendTextMessage);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 20;
  }, []);

  // Scroll automatique uniquement si l'utilisateur est déjà proche du bas.
  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [transcript.length, queue.length, isBusy, connecting, reduceMotion]);

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

  const layoutTransition = reduceMotion ? 'box-shadow 0.15s' : (isDraggingPanel ? 'box-shadow 0.15s' : 'top 0.3s cubic-bezier(0.22,1,0.36,1), right 0.3s cubic-bezier(0.22,1,0.36,1), width 0.3s cubic-bezier(0.22,1,0.36,1), height 0.3s cubic-bezier(0.22,1,0.36,1), max-height 0.3s cubic-bezier(0.22,1,0.36,1), border-radius 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s');

  return (
    <motion.div
      ref={panelRef}
      className="fixed flex flex-col overflow-hidden"
      style={{
        top: fullscreen ? '0' : docked ? '0' : '80px',
        right: fullscreen ? '0' : docked ? '0' : '24px',
        left: fullscreen ? '0' : undefined,
        bottom: fullscreen ? '0' : undefined,
        width: fullscreen ? '100vw' : minimized ? '300px' : docked ? '420px' : '420px',
        height: fullscreen ? '100vh' : minimized ? 'auto' : docked ? '100vh' : 'calc(100vh - 120px)',
        maxHeight: fullscreen ? '100vh' : minimized ? undefined : docked ? '100vh' : '800px',
        minWidth: fullscreen ? undefined : minimized ? '200px' : '320px',
        zIndex: fullscreen ? 99999 : 9990,
        backgroundColor: 'var(--bg-panel)',
        border: fullscreen || docked ? 'none' : '1px solid var(--border-base)',
        borderLeft: !fullscreen && docked ? '1px solid var(--border-base)' : undefined,
        borderRadius: fullscreen ? '0' : docked ? '0' : '16px',
        x: fullscreen || docked ? 0 : mx,
        y: fullscreen || docked ? 0 : my,
        cursor: isDraggingPanel && !docked && !fullscreen ? 'grabbing' : undefined,
        userSelect: isDraggingPanel ? 'none' : undefined,
        boxShadow: fullscreen
          ? 'none'
          : docked
            ? '-4px 0 20px rgba(0,0,0,0.2)'
            : isDraggingPanel
              ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)'
              : '0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
        transition: layoutTransition,
        backdropFilter: fullscreen ? undefined : 'blur(12px)',
      }}
      {...dropHandlers}
    >
      <DropZoneOverlay isDragging={isDragging} />

      {/* ─── Header (draggable) ─── */}
      <div
        {...(docked || fullscreen ? {} : dragHandlers)}
        className="flex items-center gap-2.5 px-4 py-2.5 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border-base)',
          cursor: docked || fullscreen ? 'default' : (isDraggingPanel ? 'grabbing' : 'grab'),
          touchAction: docked || fullscreen ? undefined : 'none',
        }}
      >
        {!docked && !fullscreen && <GripVertical size={12} style={{ color: 'var(--text-dimmed)', flexShrink: 0 }} />}
        <div className="relative">
          <Bot size={16} style={{ color: connected ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ border: '1.5px solid var(--bg-panel)' }}>
            {connected && !reduceMotion ? (
              <motion.div
                className="w-full h-full rounded-full"
                style={{ backgroundColor: '#34d399' }}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <div
                className="w-full h-full rounded-full"
                style={{ backgroundColor: connected ? '#34d399' : connecting ? '#fbbf24' : '#52525b' }}
              />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[0.75rem] font-semibold block" style={{ color: 'var(--text-primary)' }}>
            {profile?.aiName || 'Leanna'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[0.625rem] tracking-wide" style={{ color: connected ? '#34d399' : connecting ? '#fbbf24' : 'var(--text-dimmed)' }}>
              {connecting ? 'Connexion en cours…' : isBusy ? 'En cours…' : connected ? 'En ligne' : 'Hors ligne'}
            </span>
            <MultiAgentIndicator steps={activity} />
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {connected && (
            <motion.button
              onClick={handleToggleMute}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={muted ? 'Réactiver le micro' : 'Couper le micro'}
              aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
            >
              {muted
                ? <MicOff size={14} style={{ color: '#f59e0b' }} />
                : <Mic size={14} style={{ color: '#34d399' }} />
              }
            </motion.button>
          )}
          {transcript.length > 0 && (
            <motion.button
              onClick={handleClear}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Effacer la conversation"
              aria-label="Effacer la conversation"
            >
              <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
            </motion.button>
          )}
          <motion.button
            onClick={() => {
              setFullscreen(f => {
                if (!f) { setDocked(false); setMinimized(false); }
                return !f;
              });
            }}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {fullscreen
              ? <Minimize2 size={14} style={{ color: 'var(--accent-primary)' }} />
              : <Maximize2 size={14} style={{ color: 'var(--text-muted)' }} />
            }
          </motion.button>
          <motion.button
            onClick={() => setDocked(d => !d)}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={docked ? 'Détacher du bord' : 'Ancrer à droite'}
            aria-label={docked ? 'Détacher du bord' : 'Ancrer à droite'}
          >
            <PanelRight size={14} style={{ color: docked ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
          </motion.button>
          <motion.button
            onClick={() => setMinimized(m => !m)}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={minimized ? 'Agrandir' : 'Réduire'}
            aria-label={minimized ? 'Agrandir le panneau' : 'Réduire le panneau'}
          >
            <Minus size={14} style={{ color: 'var(--text-muted)' }} />
          </motion.button>
          <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border-base)' }} />
          <motion.button
            onClick={handleToggleConnect}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={connected ? 'Déconnecter' : 'Connecter'}
            aria-label={connected ? 'Déconnecter' : 'Connecter'}
          >
            <Power size={14} style={{ color: connected ? '#ef4444' : 'var(--accent-primary)' }} />
          </motion.button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* ─── Messages Area ─── */}
          <div
            ref={messagesRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar"
            style={{ maxWidth: fullscreen ? '800px' : undefined, margin: fullscreen ? '0 auto' : undefined, width: fullscreen ? '100%' : undefined }}
          >

        {connecting && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <BreathingDots color="var(--accent-primary)" reduceMotion={reduceMotion} />
            <span className="text-[0.6875rem]" style={{ color: 'var(--text-muted)' }}>Connexion en cours…</span>
          </div>
        )}

        {transcript.length === 0 && activity.length === 0 && !connecting && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center relative"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.18), transparent 70%)', transform: 'scale(1.8)' }}
              />
              <Bot size={22} style={{ color: 'var(--accent-primary)', position: 'relative' }} />
            </div>
            <div className="text-center">
              <p className="text-[0.75rem] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {connected ? 'Prêt à aider' : 'Agent hors ligne'}
              </p>
              <p className="text-[0.6875rem]" style={{ color: 'var(--text-muted)' }}>
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
            <ChatMessage key={entry.id} entry={entry} profile={profile!} reduceMotion={reduceMotion} />
          ))}
        </AnimatePresence>

        {isBusy && (
          <div className="flex items-center gap-2 px-3 py-2">
            <BreathingDots color="var(--accent-primary)" reduceMotion={reduceMotion} />
            <span className="text-[0.6875rem]" style={{ color: 'var(--text-muted)' }}>
              {profile?.aiName || 'Leanna'} réfléchit…
            </span>
          </div>
        )}

        {queue.length > 0 && (
          <div className="px-3 py-1.5 space-y-1">
            {queue.map((msg, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg relative overflow-hidden"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid rgba(14,165,233,0.15)',
                }}
              >
                <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--accent-primary)', opacity: 0.5 }} />
                <span className="text-[0.625rem] truncate ml-1" style={{ color: 'var(--text-secondary)' }}>
                  {msg.displayText ?? msg.text}
                </span>
                <span className="text-[0.5625rem] tracking-wide flex-shrink-0 ml-auto" style={{ color: 'var(--text-dimmed)' }}>
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
    </motion.div>
  );
}
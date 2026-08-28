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

// --- Styles Globaux ---
const COLORS = {
  primary: 'var(--accent-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  muted: 'var(--text-muted)',
  dimmed: 'var(--text-dimmed)',
  bgPanel: 'var(--bg-panel)',
  bgSecondary: 'var(--bg-secondary)',
  bgInput: 'var(--bg-input)',
  borderBase: 'var(--border-base)',
  textPrimary: 'var(--text-primary)',
};

const RADII = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
};

const SHADOWS = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.08)',
  md: '0 4px 12px rgba(0, 0, 0, 0.12)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.16)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.24)',
  inner: 'inset 0 1px 2px rgba(255, 255, 255, 0.04)',
};

const TRANSITIONS = {
  fast: { duration: 0.12, ease: 'ease' },
  normal: { duration: 0.2, ease: 'ease' },
  slow: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  spring: { type: 'spring', bounce: 0.2, duration: 0.4 } as const,
};

// --- Hook pour la file d'attente ---
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

// --- Styles des bulles de chat ---
const BUBBLE_STYLES = {
  assistant: {
    bg: COLORS.bgSecondary,
    border: COLORS.borderBase,
    borderRadius: `4px ${RADII.lg} ${RADII.lg} ${RADII.lg}`,
    shadow: SHADOWS.sm,
  },
  user: {
    bg: 'rgba(14, 165, 233, 0.08)',
    border: 'rgba(14, 165, 233, 0.25)',
    borderRadius: `${RADII.lg} 4px ${RADII.lg} ${RADII.lg}`,
    shadow: SHADOWS.sm,
  },
} as const;

// --- Markdown ---
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

// --- Indicateurs d'activite ---
const BreathingDots = memo(function BreathingDots({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  if (reduceMotion) {
    return (
      <div className="flex items-center gap-0.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
});

// --- Bulle de message ---
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
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0.1 } : TRANSITIONS.spring}
      className={`flex gap-3 group ${isAssistant ? '' : 'flex-row-reverse'}`}
    >
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
        style={{
          backgroundColor: isAssistant ? 'rgba(14, 165, 233, 0.12)' : 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${isAssistant ? 'rgba(14, 165, 233, 0.3)' : COLORS.borderBase}`,
        }}
      >
        {isAssistant
          ? <Bot size={13} style={{ color: COLORS.primary }} />
          : <User size={13} style={{ color: COLORS.muted }} />
        }
      </div>
      <div className={`max-w-[82%] ${isAssistant ? '' : 'text-right'}`}>
        <div
          className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed inline-block text-left"
          style={{
            backgroundColor: bubbleStyle.bg,
            border: `1px solid ${bubbleStyle.border}`,
            borderRadius: bubbleStyle.borderRadius,
            color: COLORS.textPrimary,
            boxShadow: bubbleStyle.shadow,
          }}
        >
          {isAssistant ? <ChatMarkdown text={entry.text} /> : entry.text}
        </div>
        <span
          className="text-xs tracking-wide font-mono px-1 mt-1 block opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: COLORS.dimmed }}
        >
          {entry.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
});

// --- Utilitaire pour le curseur ---
function setCursorPosition(textarea: HTMLTextAreaElement, pos: number): void {
  requestAnimationFrame(() => {
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
  });
}

// --- Zone d'input ---
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
      showSlashSuggestions, slashSuggestions, slashSelectedIndex, handleSlashKeyDown, acceptCommand,
      showSuggestions, suggestions, selectedIndex, handleMentionKeyDown, acceptSuggestion,
      handleSend,
    ]
  );

  return (
    <div
      className="flex-shrink-0 px-4 pb-4 pt-3"
      style={{ borderTop: `1px solid ${COLORS.borderBase}` }}
    >
      <div
        className="relative flex items-end gap-2.5 px-4 py-2.5 transition-[border-color,box-shadow] duration-200
                   bg-[var(--bg-input)] rounded-xl border"
        style={{
          borderColor: isFocused ? COLORS.primary : COLORS.borderBase,
          boxShadow: isFocused ? `0 0 0 4px rgba(14, 165, 233, 0.12), ${SHADOWS.inner}` : SHADOWS.inner,
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
          placeholder={connected ? 'Message... (@ fichier, / skill)' : 'Connectez-vous d\'abord'}
          disabled={!canSend}
          rows={1}
          className="flex-1 bg-transparent text-sm resize-none outline-none
                     placeholder:text-[var(--text-dimmed)] placeholder:opacity-60
                     min-h-[24px] max-h-[100px] leading-tight"
          style={{ color: COLORS.textPrimary, lineHeight: '1.5' }}
          aria-label="Saisie du message"
          aria-describedby="chat-input-hints"
          aria-autocomplete="list"
          aria-haspopup="listbox"
        />

        <DocumentUpload connected={connected} onDocumentAnalyzed={onDocumentAnalyzed} />

        <motion.button
          onClick={handleSend}
          disabled={!input.trim() || !canSend}
          whileTap={input.trim() && canSend ? { scale: 0.92 } : undefined}
          className="p-2 rounded-xl transition-colors disabled:opacity-20
                     hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20"
          title="Envoyer (Enter)"
          aria-label="Envoyer le message"
        >
          <Send size={16} style={{ color: COLORS.primary }} />
        </motion.button>
      </div>

      <div className="flex items-center justify-between mt-2 px-1">
        <span
          id="chat-input-hints"
          className="text-xs tracking-wide"
          style={{ color: COLORS.dimmed }}
        >
          Enter = Envoyer | @ = Mention fichier | / = Commande | 📎 = Document
        </span>
        {connected && (
          <span
            className="text-xs tracking-wide flex items-center gap-2"
            style={{ color: isBusy ? COLORS.primary : COLORS.success }}
          >
            <BreathingDots color={isBusy ? COLORS.primary : COLORS.success} reduceMotion={false} />
            {isBusy ? 'En cours...' : 'Connecte'}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Rubber-band pour le drag ---
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function clampWithRubberband(value: number, min: number, max: number, dimension: number): number {
  if (value < min) return min + rubberband(value - min, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
}

// --- Hook pour le panneau deplacable ---
interface DragSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  anchorRect: DOMRect;
  startX: number;
  startY: number;
  moved: boolean;
}

const DRAG_HYSTERESIS = 6;
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

// --- Composant principal ---
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

  useEffect(() => {
    onDockedChange?.(docked);
  }, [docked, onDockedChange]);

  const { mx, my, isDragging: isDraggingPanel, resetPosition, dragHandlers } =
    useDraggablePanel(panelRef, docked || fullscreen, reduceMotion);

  useEffect(() => {
    if (docked || fullscreen) resetPosition();
  }, [docked, fullscreen, resetPosition]);

  const { queue, enqueue } = useMessageQueue(isBusy, connected, sendTextMessage);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 20;
  }, []);

  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [transcript.length, queue.length, isBusy, connecting, reduceMotion]);

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

  const { isDragging, dropHandlers } = useDocumentDrop({
    connected,
    onDocumentAnalyzed: handleDocumentAnalyzed,
  });

  const handleClear = useCallback(() => clearTranscript(), [clearTranscript]);
  const handleToggleMute = useCallback(() => toggleMute(), [toggleMute]);
  const handleToggleConnect = useCallback(() => {
    if (connected) disconnect();
    else connect([], 'full');
  }, [connected, disconnect, connect]);

  return (
    <motion.div
      ref={panelRef}
      className="fixed flex flex-col overflow-hidden"
      style={{
        top: fullscreen ? '0' : docked ? '0' : '80px',
        right: fullscreen ? '0' : docked ? '0' : '24px',
        left: fullscreen ? '0' : undefined,
        bottom: fullscreen ? '0' : undefined,
        width: fullscreen ? '100vw' :
              minimized ? '420px' :
              docked ? '420px' : '420px',
        height: fullscreen ? '100vh' :
               minimized ? 'auto' :
               docked ? '100vh' : 'calc(100vh - 120px)',
        maxHeight: fullscreen ? '100vh' : minimized ? undefined : '100vh',
        minWidth: fullscreen ? undefined : '280px',
        zIndex: fullscreen ? 99999 : 9990,
        backgroundColor: COLORS.bgPanel,
        border: fullscreen || docked ? 'none' : `1px solid ${COLORS.borderBase}`,
        borderLeft: !fullscreen && docked ? `1px solid ${COLORS.borderBase}` : undefined,
        borderRadius: fullscreen ? '0' : docked ? '0' : RADII.xl,
        x: fullscreen || docked ? 0 : mx,
        y: fullscreen || docked ? 0 : my,
        cursor: isDraggingPanel && !docked && !fullscreen ? 'grabbing' : 'default',
        userSelect: isDraggingPanel ? 'none' : 'auto',
        boxShadow: fullscreen
          ? 'none'
          : docked
            ? `-4px 0 30px rgba(0, 0, 0, 0.25)`
            : isDraggingPanel
              ? `0 24px 70px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04)`
              : `0 12px 50px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)`,
        transition: reduceMotion
          ? 'box-shadow 0.15s'
          : isDraggingPanel
            ? 'box-shadow 0.15s'
            : 'top 0.3s cubic-bezier(0.22, 1, 0.36, 1), right 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1), height 0.3s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.3s',
        backdropFilter: fullscreen ? 'none' : 'blur(16px)',
      }}
      {...dropHandlers}
    >
      <DropZoneOverlay isDragging={isDragging} />

      {/* Header (draggable) */}
      <div
        {...(docked || fullscreen ? {} : dragHandlers)}
        className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{
          borderBottom: `1px solid ${COLORS.borderBase}`,
          cursor: docked || fullscreen ? 'default' : (isDraggingPanel ? 'grabbing' : 'grab'),
          touchAction: docked || fullscreen ? undefined : 'none',
        }}
      >
        {!docked && !fullscreen && (
          <GripVertical
            size={14}
            className="flex-shrink-0"
            style={{ color: COLORS.dimmed, opacity: 0.6 }}
          />
        )}

        <div className="relative">
          <Bot
            size={18}
            style={{ color: connected ? COLORS.primary : COLORS.muted }}
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-panel)]">
            {connected && !reduceMotion ? (
              <motion.div
                className="w-full h-full rounded-full"
                style={{ backgroundColor: COLORS.success }}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <div
                className="w-full h-full rounded-full"
                style={{
                  backgroundColor: connected
                    ? COLORS.success
                    : connecting
                      ? COLORS.warning
                      : COLORS.muted
                }}
              />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span
            className="text-sm font-semibold block truncate"
            style={{ color: COLORS.textPrimary }}
          >
            {profile?.aiName || 'Leanna'}
          </span>
          <div className="flex items-center gap-2">
            <span
              className="text-xs truncate"
              style={{
                color: connected
                  ? COLORS.success
                  : connecting
                    ? COLORS.warning
                    : COLORS.dimmed
              }}
            >
              {connecting ? 'Connexion...' : isBusy ? 'En cours...' : connected ? 'En ligne' : 'Hors ligne'}
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
              title={muted ? 'Activer le micro' : 'Desactiver le micro'}
              aria-label={muted ? 'Activer le micro' : 'Desactiver le micro'}
            >
              {muted ? (
                <MicOff size={16} style={{ color: COLORS.warning }} />
              ) : (
                <Mic size={16} style={{ color: COLORS.success }} />
              )}
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
              <Trash2 size={15} style={{ color: COLORS.muted }} />
            </motion.button>
          )}

          <motion.button
            onClick={() => {
              setFullscreen((f) => {
                if (!f) { setDocked(false); setMinimized(false); }
                return !f;
              });
            }}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={fullscreen ? 'Quitter le plein ecran' : 'Plein ecran'}
            aria-label={fullscreen ? 'Quitter le plein ecran' : 'Plein ecran'}
          >
            {fullscreen ? (
              <Minimize2 size={16} style={{ color: COLORS.primary }} />
            ) : (
              <Maximize2 size={16} style={{ color: COLORS.muted }} />
            )}
          </motion.button>

          <motion.button
            onClick={() => setDocked((d) => !d)}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={docked ? 'Detacher' : 'Ancrer a droite'}
            aria-label={docked ? 'Detacher' : 'Ancrer a droite'}
          >
            <PanelRight
              size={16}
              style={{ color: docked ? COLORS.primary : COLORS.muted }}
            />
          </motion.button>

          {!docked && (
            <motion.button
              onClick={() => setMinimized((m) => !m)}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={minimized ? 'Agrandir' : 'Reduire'}
              aria-label={minimized ? 'Agrandir' : 'Reduire'}
            >
              <Minus size={16} style={{ color: COLORS.muted }} />
            </motion.button>
          )}

          <div
            className="w-px h-5 mx-0.5"
            style={{ backgroundColor: COLORS.borderBase }}
          />

          <motion.button
            onClick={handleToggleConnect}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={connected ? 'Deconnecter' : 'Connecter'}
            aria-label={connected ? 'Deconnecter' : 'Connecter'}
          >
            <Power
              size={16}
              style={{ color: connected ? COLORS.error : COLORS.primary }}
            />
          </motion.button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages Area */}
          <div
            ref={messagesRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar"
            style={{
              maxWidth: fullscreen ? '850px' : undefined,
              margin: fullscreen ? '0 auto' : undefined,
              width: fullscreen ? '100%' : undefined,
            }}
          >
            {connecting && (
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: COLORS.bgSecondary }}
              >
                <BreathingDots color={COLORS.primary} reduceMotion={reduceMotion} />
                <span
                  className="text-sm"
                  style={{ color: COLORS.muted }}
                >
                  Connexion en cours...
                </span>
              </div>
            )}

            {transcript.length === 0 && activity.length === 0 && !connecting && (
              <div className="flex flex-col items-center justify-center h-full gap-5">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center relative"
                  style={{ backgroundColor: 'rgba(14, 165, 233, 0.12)' }}
                >
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(14, 165, 233, 0.2), transparent 70%)',
                      transform: 'scale(1.8)',
                    }}
                  />
                  <Bot size={26} style={{ color: COLORS.primary, position: 'relative' }} />
                </div>
                <div className="text-center">
                  <p
                    className="text-base font-medium mb-1"
                    style={{ color: COLORS.textPrimary }}
                  >
                    {connected ? 'Pret a vous aider' : 'Agent hors ligne'}
                  </p>
                  <p
                    className="text-sm max-w-[300px]"
                    style={{ color: COLORS.muted }}
                  >
                    {connected
                      ? 'Posez une question ou utilisez une commande'
                      : 'Connectez-vous pour demarrer une conversation'}
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
              <div className="flex items-center gap-2.5 px-4 py-2">
                <BreathingDots color={COLORS.primary} reduceMotion={reduceMotion} />
                <span
                  className="text-sm"
                  style={{ color: COLORS.muted }}
                >
                  {profile?.aiName || 'Leanna'} refleichit...
                </span>
              </div>
            )}

            {queue.length > 0 && (
              <div className="px-3 py-2 space-y-1.5">
                {queue.map((msg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-xl relative overflow-hidden"
                    style={{
                      backgroundColor: 'rgba(14, 165, 233, 0.06)',
                      border: '1px solid rgba(14, 165, 233, 0.18)',
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-0.5"
                      style={{ backgroundColor: COLORS.primary, opacity: 0.5 }}
                    />
                    <span
                      className="text-sm truncate ml-1.5"
                      style={{ color: COLORS.muted }}
                    >
                      {msg.displayText ?? msg.text}
                    </span>
                    <span
                      className="text-xs tracking-wide flex-shrink-0 ml-auto"
                      style={{ color: COLORS.dimmed }}
                    >
                      en attente
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <ActivityFeed steps={activity} connected={connected} />

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

export default ChatPanel;

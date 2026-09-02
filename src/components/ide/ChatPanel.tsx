import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useReducedMotion, animate } from 'motion/react';
import {
  Send, Mic, MicOff, User, Bot, Eye, X,
  Trash2, Power, GripVertical, Minus, PanelRight, Maximize2, Minimize2, ChevronDown, Download, MessageSquare,
} from 'lucide-react';
import { marked } from 'marked';
import { sanitizeMarkdownHtml } from '../../utils/sanitizeMarkdownHtml.js';
import { useLiveAPIContext } from '../../context/LiveAPIContext.js';
import { useProfile, type UserProfile } from '../../context/UserProfileContext.js';
import { ActivityFeed } from './ActivityFeed.js';
import { MultiAgentIndicator } from './MultiAgentIndicator.js';
import { MentionDropdown } from './MentionDropdown.js';
import { SlashCommandDropdown } from './SlashCommandDropdown.js';
import { useFileMention } from '../../hooks/useFileMention.js';
import { useSlashCommand } from '../../hooks/useSlashCommand.js';
import { DocumentUpload, DropZoneOverlay, useDocumentDrop, type DocumentResult } from './DocumentUpload.js';
import type { TranscriptEntry, ContextSource } from '../../hooks/useLiveAPI.js';

// --- Styles Globaux améliorés ---
const COLORS = {
  primary: 'var(--accent-primary)',
  primarySubtle: 'rgba(14, 165, 233, 0.08)',
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
  shadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
  shadowLg: '0 8px 40px rgba(0, 0, 0, 0.2)',
};

const RADII = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
};

const TRANSITIONS = {
  fast: { duration: 0.12, ease: 'ease' },
  normal: { duration: 0.2, ease: 'ease' },
  slow: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  spring: { type: 'spring', bounce: 0.2, duration: 0.4 } as const,
};

// --- Hook pour la file d'attente (inchangé) ---
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

// --- Styles des bulles de chat améliorés ---
const BUBBLE_STYLES = {
  assistant: {
    bg: 'var(--bg-secondary)',
    border: 'var(--border-base)',
    borderRadius: `4px ${RADII.lg} ${RADII.lg} ${RADII.lg}`,
    shadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  user: {
    bg: 'rgba(14, 165, 233, 0.10)',
    border: 'rgba(14, 165, 233, 0.25)',
    borderRadius: `${RADII.lg} 4px ${RADII.lg} ${RADII.lg}`,
    shadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
} as const;

// --- Markdown amélioré avec styles intégrés ---
const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      const result = marked.parse(text, { gfm: true, breaks: true });
      return typeof result === 'string' ? sanitizeMarkdownHtml(result) : '';
    } catch {
      // If parsing fails, escape the original content as plain text
      const escaped = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p>${escaped}</p>`;
    }
  }, [text]);

  return (
    <div
      className="chat-markdown"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with sanitizeMarkdownHtml
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        color: 'var(--text-primary)',
      }}
    />
  );
});

// --- Indicateurs d'activité (breathing dots) améliorés ---
const BreathingDots = memo(function BreathingDots({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const dotStyle = {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: color,
  };

  if (reduceMotion) {
    return (
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...dotStyle, opacity: 0.5 }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={dotStyle}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
});

// --- Bulle de message améliorée ---
const ChatMessage = memo(function ChatMessage({
  entry,
  profile: _profile,
  reduceMotion,
  onExcludeSource,
}: {
  entry: TranscriptEntry;
  profile: UserProfile;
  reduceMotion: boolean;
  onExcludeSource?: (source: ContextSource) => void;
}) {
  const isAssistant = entry.role === 'assistant';
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [showSources, setShowSources] = useState(false);
  const bubbleStyle = isAssistant ? BUBBLE_STYLES.assistant : BUBBLE_STYLES.user;
  const visibleSources = entry.sources?.filter(source => !excludedIds.has(source.id)) ?? [];

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0.1 } : TRANSITIONS.spring}
      className={`flex gap-3 group ${isAssistant ? '' : 'flex-row-reverse'}`}
    >
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
        style={{
          backgroundColor: isAssistant ? 'rgba(14, 165, 233, 0.12)' : 'rgba(255, 255, 255, 0.05)',
          border: `1px solid ${isAssistant ? 'rgba(14, 165, 233, 0.25)' : 'var(--border-base)'}`,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {isAssistant
          ? <Bot size={14} style={{ color: 'var(--accent-primary)' }} />
          : <User size={14} style={{ color: 'var(--text-muted)' }} />
        }
      </div>
      <div className={`max-w-[85%] ${isAssistant ? '' : 'text-right'}`}>
        <div
          className="px-4 py-2.5 text-sm leading-relaxed inline-block text-left"
          style={{
            backgroundColor: bubbleStyle.bg,
            border: `1px solid ${bubbleStyle.border}`,
            borderRadius: bubbleStyle.borderRadius,
            color: 'var(--text-primary)',
            boxShadow: bubbleStyle.shadow,
          }}
        >
          {isAssistant ? <ChatMarkdown text={entry.text} /> : entry.text}
        </div>
        <span
          className="text-xs tracking-wide font-mono px-1 mt-1.5 block opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-dimmed)' }}
        >
          {entry.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {isAssistant && visibleSources.length > 0 && (
          <div className="mt-2 text-left">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-base)', backgroundColor: 'color-mix(in srgb, var(--bg-input) 55%, transparent)' }}
              aria-expanded={showSources}
              aria-controls={`sources-${entry.id}`}
              onClick={() => setShowSources(value => !value)}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                <Eye size={10} style={{ color: 'var(--accent-primary)' }} />
              </span>
              <span className="font-medium">Sources utilisées</span>
              <span className="rounded-full px-1.5 py-px font-mono text-[9px]" style={{ color: 'var(--accent-primary)', backgroundColor: 'var(--accent-subtle)' }}>
                {visibleSources.length}
              </span>
              <span className="ml-auto text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                {showSources ? 'Masquer' : 'Afficher'}
              </span>
              <ChevronDown
                size={11}
                style={{
                  color: 'var(--text-dimmed)',
                  transform: showSources ? 'rotate(180deg)' : undefined,
                  transition: 'transform 0.2s ease',
                }}
              />
            </button>

            <AnimatePresence initial={false}>
              {showSources && (
                <motion.div
                  id={`sources-${entry.id}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: reduceMotion ? 0.1 : 0.2 }}
                  className="mt-1 max-h-48 overflow-y-auto rounded-lg custom-scrollbar"
                  style={{ border: '1px solid var(--border-base)', backgroundColor: 'var(--bg-input)' }}
                >
                  <div className="divide-y" style={{ borderColor: 'var(--border-base)' }}>
                    {visibleSources.map(source => {
                      return (
                        <div key={source.id} className="group flex items-center gap-1.5 px-2 py-1.5 min-w-0 transition-colors hover:bg-white/5">
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                            <Eye size={10} style={{ color: 'var(--accent-primary)' }} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[11px] truncate" title={source.path} style={{ color: 'var(--text-primary)' }}>
                              {source.path}
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] truncate" style={{ color: 'var(--text-dimmed)' }}>
                              {source.lines && <span className="rounded px-1" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--text-muted)' }}>{source.lines}</span>}
                              <span className="truncate">via {source.tool}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="p-1 rounded opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100 flex-shrink-0"
                            aria-label={`Exclure ${source.path} du contexte`}
                            title="Exclure du contexte"
                            onClick={() => {
                              setExcludedIds(prev => new Set(prev).add(source.id));
                              onExcludeSource?.(source);
                            }}
                          >
                            <X size={10} style={{ color: 'var(--text-muted)' }} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
});

// --- Utilitaire pour le curseur (inchangé) ---
function setCursorPosition(textarea: HTMLTextAreaElement, pos: number): void {
  requestAnimationFrame(() => {
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
  });
}

// --- Zone d'input améliorée ---
interface InputAreaProps {
  connected: boolean;
  isBusy: boolean;
  onSend: (text: string) => void;
  onDocumentAnalyzed: (result: DocumentResult) => void;
}

function InputArea({ connected, isBusy, onSend, onDocumentAnalyzed }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSend = connected && !isBusy;

  // Détection de la frappe pour les indicateurs
  useEffect(() => {
    if (input.length > 0) {
      setIsTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
    } else {
      setIsTyping(false);
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [input]);

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
      style={{ borderTop: `1px solid var(--border-base)` }}
    >
      <div
        className="relative flex items-end gap-2 px-3 py-2 transition-[border-color,box-shadow] duration-200
                   bg-[var(--bg-input)] rounded-xl border"
        style={{
          borderColor: isFocused ? 'var(--accent-primary)' : 'var(--border-base)',
          boxShadow: isFocused
            ? `0 0 0 4px rgba(14, 165, 233, 0.1), inset 0 1px 2px rgba(0,0,0,0.04)`
            : `inset 0 1px 2px rgba(0,0,0,0.04)`,
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
          placeholder={connected ? 'Message... (@fichier, /commande)' : 'Connectez-vous d\'abord'}
          disabled={!canSend}
          rows={1}
          className="flex-1 bg-transparent text-sm resize-none outline-none
                     placeholder:text-[var(--text-dimmed)] placeholder:opacity-60
                     min-h-[28px] max-h-[120px] leading-[1.5]"
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
          className="p-1.5 rounded-lg transition-colors disabled:opacity-30
                     hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30"
          title="Envoyer (Enter)"
          aria-label="Envoyer le message"
        >
          <Send size={18} style={{ color: 'var(--accent-primary)' }} />
        </motion.button>
      </div>

      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex items-center gap-2">
          <span
            id="chat-input-hints"
            className="text-xs tracking-wide"
            style={{ color: 'var(--text-dimmed)' }}
          >
            Enter = Envoyer · @ = Fichier · / = Commande · 📎 = Document
          </span>
          {input.length > 0 && (
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ 
                color: input.length > 500 ? 'var(--color-warning)' : 'var(--text-dimmed)',
                backgroundColor: 'var(--bg-secondary)'
              }}
            >
              {input.length}
            </span>
          )}
        </div>
        {connected && (
          <span
            className="text-xs tracking-wide flex items-center gap-2"
            style={{ color: isBusy ? 'var(--accent-primary)' : 'var(--color-success)' }}
          >
            <BreathingDots color={isBusy ? 'var(--accent-primary)' : 'var(--color-success)'} reduceMotion={false} />
            {isBusy ? 'En cours...' : isTyping ? 'Frappe...' : 'Connecté'}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Rubber-band (inchangé) ---
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function clampWithRubberband(value: number, min: number, max: number, dimension: number): number {
  if (value < min) return min + rubberband(value - min, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
}

// --- Hook pour le panneau déplaçable (inchangé) ---
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

// --- Composant principal amélioré ---
interface ChatPanelProps {
  pendingMessage?: PendingChatMessage | null;
  onPendingMessageConsumed?: () => void;
  onDockedChange?: (docked: boolean) => void;
  initialDocked?: boolean;
  onClose?: () => void;
}

export function ChatPanel({ pendingMessage, onPendingMessageConsumed, onDockedChange, initialDocked = false, onClose }: ChatPanelProps = {}) {
  const {
    connected, connecting, connect, disconnect,
    sendTextMessage, sendRawMessage, transcript, clearTranscript,
    activity, isBusy, muted, toggleMute,
  } = useLiveAPIContext();
  const { profile } = useProfile();
  const [minimized, setMinimized] = useState(false);
  const [docked, setDocked] = useState(() => {
    try {
      const saved = localStorage.getItem('Leanna_chat_docked');
      return saved ? JSON.parse(saved) : initialDocked;
    } catch {
      return initialDocked;
    }
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [showInput, setShowInput] = useState(() => {
    try {
      const saved = localStorage.getItem('Leanna_chat_show_input');
      return saved ? JSON.parse(saved) : false; // Caché par défaut
    } catch {
      return false;
    }
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const reduceMotion = !!useReducedMotion();

  // Sauvegarder l'état docké dans localStorage
  useEffect(() => {
    try {
      localStorage.setItem('Leanna_chat_docked', JSON.stringify(docked));
    } catch (err) {
      console.warn('[ChatPanel] Failed to save docked state:', err);
    }
  }, [docked]);

  // Sauvegarder l'état de la zone d'input dans localStorage
  useEffect(() => {
    try {
      localStorage.setItem('Leanna_chat_show_input', JSON.stringify(showInput));
    } catch (err) {
      console.warn('[ChatPanel] Failed to save input state:', err);
    }
  }, [showInput]);

  useEffect(() => {
    onDockedChange?.(docked);
  }, [docked, onDockedChange]);

  // Sauvegarde automatique de la conversation dans localStorage
  useEffect(() => {
    if (transcript.length > 0) {
      try {
        localStorage.setItem('Leanna_chat_history', JSON.stringify(transcript.slice(-50))); // Garder les 50 derniers messages
      } catch (err) {
        console.warn('[ChatPanel] Failed to save chat history:', err);
      }
    }
  }, [transcript]);

  // Restauration de l'historique au montage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('Leanna_chat_history');
      if (saved) {
        // Note: Cette fonctionnalité nécessiterait une méthode dans useLiveAPI pour restaurer l'historique
        // Pour l'instant, on se contente de le sauvegarder pour référence future
      }
    } catch (err) {
      console.warn('[ChatPanel] Failed to restore chat history:', err);
    }
  }, []);

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
  
  const handleExport = useCallback(() => {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        assistant: profile?.aiName || 'Leanna',
        messages: transcript.map(entry => ({
          role: entry.role,
          content: entry.text,
          timestamp: entry.timestamp.toISOString(),
          sources: entry.sources?.map(s => ({ path: s.path, lines: s.lines, tool: s.tool }))
        }))
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leanna-conversation-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ChatPanel] Export failed:', err);
    }
  }, [transcript, profile]);
  
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
        bottom: fullscreen ? '0' : docked ? '32px' : '40px', // Ajusté pour ne pas couvrir la StatusBar (32px + 8px marge)
        width: fullscreen ? '100vw' :
              minimized ? '400px' :
              docked ? '400px' : '400px',
        height: fullscreen ? '100vh' :
               minimized ? 'auto' :
               docked ? 'calc(100vh - 32px)' : 'calc(100vh - 152px)', // Ajusté : hauteur totale - 80px (top) - 40px (bottom) - 32px (statusbar)
        maxHeight: fullscreen ? '100vh' : minimized ? undefined : docked ? 'calc(100vh - 32px)' : 'calc(100vh - 152px)',
        minWidth: fullscreen ? undefined : '280px',
        zIndex: fullscreen ? 99999 : 9990,
        backgroundColor: 'var(--bg-panel)',
        border: fullscreen || docked ? 'none' : `1px solid var(--border-base)`,
        borderLeft: !fullscreen && docked ? `1px solid var(--border-base)` : undefined,
        borderRadius: fullscreen ? '0' : docked ? '0' : RADII.xl,
        x: fullscreen || docked ? 0 : mx,
        y: fullscreen || docked ? 0 : my,
        cursor: isDraggingPanel && !docked && !fullscreen ? 'grabbing' : 'default',
        userSelect: isDraggingPanel ? 'none' : 'auto',
        boxShadow: fullscreen
          ? 'none'
          : docked
            ? `-4px 0 30px rgba(0, 0, 0, 0.2)`
            : isDraggingPanel
              ? `0 24px 70px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)`
              : `0 12px 50px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)`,
        transition: reduceMotion
          ? 'box-shadow 0.15s'
          : isDraggingPanel
            ? 'box-shadow 0.15s'
            : 'top 0.3s cubic-bezier(0.22, 1, 0.36, 1), right 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1), height 0.3s cubic-bezier(0.22, 1, 0.36, 1), bottom 0.3s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.3s',
        backdropFilter: fullscreen ? 'none' : 'blur(20px)',
      }}
      {...dropHandlers}
    >
      <DropZoneOverlay isDragging={isDragging} />

      {/* Header amélioré */}
      <div
        {...(docked || fullscreen ? {} : dragHandlers)}
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{
          borderBottom: `1px solid var(--border-base)`,
          cursor: docked || fullscreen ? 'default' : (isDraggingPanel ? 'grabbing' : 'grab'),
          touchAction: docked || fullscreen ? undefined : 'none',
        }}
      >
        {!docked && !fullscreen && (
          <GripVertical
            size={16}
            className="flex-shrink-0"
            style={{ color: 'var(--text-dimmed)', opacity: 0.4 }}
          />
        )}

        <div className="relative flex-shrink-0">
          <Bot
            size={20}
            style={{ color: connected ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-panel)]">
            {connected && !reduceMotion ? (
              <motion.div
                className="w-full h-full rounded-full"
                style={{ backgroundColor: 'var(--color-success)' }}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <div
                className="w-full h-full rounded-full"
                style={{
                  backgroundColor: connected
                    ? 'var(--color-success)'
                    : connecting
                      ? 'var(--color-warning)'
                      : 'var(--text-dimmed)'
                }}
              />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span
            className="text-sm font-semibold block truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {profile?.aiName || 'Leanna'}
          </span>
          <div className="flex items-center gap-2">
            <span
              className="text-xs truncate"
              style={{
                color: connected
                  ? 'var(--color-success)'
                  : connecting
                    ? 'var(--color-warning)'
                    : 'var(--text-dimmed)'
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
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title={muted ? 'Activer le micro' : 'Désactiver le micro'}
              aria-label={muted ? 'Activer le micro' : 'Désactiver le micro'}
            >
              {muted ? (
                <MicOff size={16} style={{ color: 'var(--color-warning)' }} />
              ) : (
                <Mic size={16} style={{ color: 'var(--color-success)' }} />
              )}
            </motion.button>
          )}

          {transcript.length > 0 && (
            <>
              <motion.button
                onClick={handleExport}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Exporter la conversation"
                aria-label="Exporter la conversation"
              >
                <Download size={16} style={{ color: 'var(--text-muted)' }} />
              </motion.button>
              <motion.button
                onClick={handleClear}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Effacer la conversation"
                aria-label="Effacer la conversation"
              >
                <Trash2 size={16} style={{ color: 'var(--text-muted)' }} />
              </motion.button>
            </>
          )}

          <motion.button
            onClick={() => setShowInput((s: boolean) => !s)}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title={showInput ? 'Masquer la saisie de texte' : 'Afficher la saisie de texte'}
            aria-label={showInput ? 'Masquer la saisie de texte' : 'Afficher la saisie de texte'}
          >
            <MessageSquare
              size={16}
              style={{ color: showInput ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            />
          </motion.button>

          <motion.button
            onClick={() => {
              setFullscreen((f) => {
                if (!f) { setDocked(false); setMinimized(false); }
                return !f;
              });
            }}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {fullscreen ? (
              <Minimize2 size={16} style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <Maximize2 size={16} style={{ color: 'var(--text-muted)' }} />
            )}
          </motion.button>

          <motion.button
            onClick={() => setDocked((d: boolean) => !d)}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title={docked ? 'Détacher' : 'Ancrer à droite'}
            aria-label={docked ? 'Détacher' : 'Ancrer à droite'}
          >
            <PanelRight
              size={16}
              style={{ color: docked ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            />
          </motion.button>

          {!docked && (
            <motion.button
              onClick={() => setMinimized((m) => !m)}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title={minimized ? 'Agrandir' : 'Réduire'}
              aria-label={minimized ? 'Agrandir' : 'Réduire'}
            >
              <Minus size={16} style={{ color: 'var(--text-muted)' }} />
            </motion.button>
          )}

          <div
            className="w-px h-5 mx-0.5"
            style={{ backgroundColor: 'var(--border-base)' }}
          />

          <motion.button
            onClick={handleToggleConnect}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title={connected ? 'Déconnecter' : 'Connecter'}
            aria-label={connected ? 'Déconnecter' : 'Connecter'}
          >
            <Power
              size={16}
              style={{ color: connected ? 'var(--color-error)' : 'var(--accent-primary)' }}
            />
          </motion.button>

          {onClose && (
            <>
              <div
                className="w-px h-5 mx-0.5"
                style={{ backgroundColor: 'var(--border-base)' }}
              />
              <motion.button
                onClick={onClose}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Fermer le panneau"
                aria-label="Fermer le panneau"
              >
                <X size={16} style={{ color: 'var(--text-muted)' }} />
              </motion.button>
            </>
          )}
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages Area améliorée */}
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
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <BreathingDots color="var(--accent-primary)" reduceMotion={reduceMotion} />
                <span
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Connexion en cours...
                </span>
              </div>
            )}

            {transcript.length === 0 && activity.length === 0 && !connecting && (
              <div className="flex flex-col items-center justify-center h-full gap-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center relative"
                  style={{ backgroundColor: 'rgba(14, 165, 233, 0.12)' }}
                >
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15), transparent 70%)',
                      transform: 'scale(1.6)',
                    }}
                  />
                  <Bot size={28} style={{ color: 'var(--accent-primary)', position: 'relative' }} />
                </div>
                <div className="text-center">
                  <p
                    className="text-base font-medium mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {connected ? 'Prêt à vous aider' : 'Agent hors ligne'}
                  </p>
                  <p
                    className="text-sm max-w-[280px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {connected
                      ? 'Posez une question ou utilisez une commande'
                      : 'Connectez-vous pour démarrer une conversation'}
                  </p>
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {transcript.map((entry) => (
                <ChatMessage
                  key={entry.id}
                  entry={entry}
                  profile={profile!}
                  reduceMotion={reduceMotion}
                  onExcludeSource={(source) => sendRawMessage({ context_exclude: source.path })}
                />
              ))}
            </AnimatePresence>

            {isBusy && (
              <div className="flex items-center gap-3 px-4 py-2">
                <BreathingDots color="var(--accent-primary)" reduceMotion={reduceMotion} />
                <span
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {profile?.aiName || 'Leanna'} réfléchit...
                </span>
              </div>
            )}

            {queue.length > 0 && (
              <div className="px-2 py-2 space-y-1.5">
                {queue.map((msg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-xl relative overflow-hidden"
                    style={{
                      backgroundColor: 'rgba(14, 165, 233, 0.06)',
                      border: '1px solid rgba(14, 165, 233, 0.15)',
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-0.5"
                      style={{ backgroundColor: 'var(--accent-primary)', opacity: 0.5 }}
                    />
                    <span
                      className="text-sm truncate ml-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {msg.displayText ?? msg.text}
                    </span>
                    <span
                      className="text-xs tracking-wide flex-shrink-0 ml-auto"
                      style={{ color: 'var(--text-dimmed)' }}
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

          {showInput && (
            <InputArea
              connected={connected}
              isBusy={isBusy}
              onSend={handleSend}
              onDocumentAnalyzed={handleDocumentAnalyzed}
            />
          )}
        </>
      )}
    </motion.div>
  );
}

export default ChatPanel;
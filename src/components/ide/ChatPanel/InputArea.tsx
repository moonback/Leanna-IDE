import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Send, X, CornerDownLeft } from 'lucide-react';
import { useFileMention } from '../../../hooks/useFileMention.js';
import { useSlashCommand } from '../../../hooks/useSlashCommand.js';
import { MentionDropdown } from '../MentionDropdown.js';
import { SlashCommandDropdown } from '../SlashCommandDropdown.js';
import { DocumentUpload, type DocumentResult } from '../DocumentUpload.js';
import { SkillPicker } from '../SkillPicker.js';
import type { CustomSkill } from '../../../hooks/useCustomSkills.js';
import { BreathingDots } from './BreathingDots.js';
import { SuggestionChips } from './SuggestionChips.js';
import type { SuggestionSet } from './proactiveSuggestions.js';
import { CHAR_LIMIT } from './theme.js';
import { setCursorPosition } from './utils.js';

const DRAFT_STORAGE_KEY = 'Leanna_chat_draft_v1';

/** API impérative exposée au parent pour piloter la saisie (ex. édition). */
export interface InputAreaHandle {
  /** Préremplit le champ et place le curseur en fin de texte. */
  setValue: (value: string) => void;
  /** Donne le focus au champ. */
  focus: () => void;
}

export interface InputAreaProps {
  connected: boolean;
  onConnect?: () => void;
  isBusy: boolean;
  onSend: (text: string) => void;
  onDocumentAnalyzed: (result: DocumentResult) => void;
  onToast: (msg: string, icon?: React.ReactNode) => void;
  showChips?: boolean;
  /** Suggestions proactives calculées par le parent à partir du contexte. */
  proactiveSuggestions: SuggestionSet;
}

/** Zone de saisie : textarea auto-redimensionnée, @mentions, /commandes, skills. */
export const InputArea = forwardRef<InputAreaHandle, InputAreaProps>(function InputArea(
  { connected, onConnect: _onConnect, isBusy, onSend, onDocumentAnalyzed, onToast: _onToast, showChips = true, proactiveSuggestions },
  ref,
) {
  const [input, setInput] = useState(() => {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? '' : ''; }
    catch { return ''; }
  });
  const [cursorPos, setCursorPos] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const reduceMotion = !!useReducedMotion();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Le parent sait placer les messages en file lorsque Leanna travaille déjà.
  // Ne pas désactiver la saisie pendant isBusy : cela rendrait cette file inaccessible.
  const canSend = connected;

  useImperativeHandle(ref, () => ({
    setValue: (value: string) => {
      setInput(value);
      const pos = value.length;
      setCursorPos(pos);
      if (textareaRef.current) setCursorPosition(textareaRef.current, pos);
    },
    focus: () => textareaRef.current?.focus(),
  }), []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const newH = Math.min(ta.scrollHeight, 140);
    ta.style.height = `${newH}px`;
  }, [input]);

  // Brouillon local : une fermeture/recharge du panneau ne fait pas perdre la saisie.
  useEffect(() => {
    try {
      if (input) window.localStorage.setItem(DRAFT_STORAGE_KEY, input);
      else window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch { /* Le chat reste utilisable si le stockage est indisponible. */ }
  }, [input]);

  // Typing indicator
  useEffect(() => {
    if (input.length > 0) {
      setIsTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1200);
    } else {
      setIsTyping(false);
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [input]);

  const {
    suggestions, showSuggestions, selectedIndex, setSelectedIndex,
    handleMentionKeyDown, acceptSuggestion, mentionQuery,
  } = useFileMention(input, cursorPos);

  const {
    suggestions: slashSuggestions, showSuggestions: showSlashSuggestions,
    selectedIndex: slashSelectedIndex, setSelectedIndex: setSlashSelectedIndex,
    handleSlashKeyDown, acceptCommand, commandQuery,
  } = useSlashCommand(input, cursorPos);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !canSend) return;
    onSend(text);
    setInput('');
    setCursorPos(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  }, [input, canSend, onSend]);

  // Activation d'un skill custom : préremplit la saisie avec l'invocation.
  const handleSelectSkill = useCallback((skill: CustomSkill) => {
    const hasParams = skill.parameters && skill.parameters.length > 0;
    const paramsHint = hasParams
      ? ` ${skill.parameters.map(p => `${p.name}=`).join(' ')}`
      : '';
    const invocation = `/custom_${skill.name}${paramsHint} `;
    setInput(invocation);
    const pos = invocation.length;
    setCursorPos(pos);
    if (textareaRef.current) setCursorPosition(textareaRef.current, pos);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSlashSuggestions && slashSuggestions.length > 0) {
        if (['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) { handleSlashKeyDown(e); return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const sel = slashSuggestions[slashSelectedIndex];
          if (sel) {
            e.preventDefault();
            const { newInput, newCursorPos } = acceptCommand(sel);
            setInput(newInput);
            setCursorPos(newCursorPos);
            if (textareaRef.current) setCursorPosition(textareaRef.current, newCursorPos);
          }
          return;
        }
      }
      if (showSuggestions && suggestions.length > 0) {
        if (['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) { handleMentionKeyDown(e); return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const sel = suggestions[selectedIndex];
          if (sel) {
            e.preventDefault();
            const { newInput, newCursorPos } = acceptSuggestion(sel);
            setInput(newInput);
            setCursorPos(newCursorPos);
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
      showSuggestions, suggestions, selectedIndex, handleMentionKeyDown, acceptSuggestion, handleSend,
    ]
  );

  const nearLimit = input.length > CHAR_LIMIT * 0.8;
  const overLimit = input.length > CHAR_LIMIT;

  return (
    <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--border-base)' }}>
      {/* Outer wrapper — relative so dropdowns (bottom-full) can escape overflow-hidden */}
      <div className="relative">

        {/* Dropdowns — outside the overflow-hidden container so they aren't clipped */}
        {showSuggestions && suggestions.length > 0 && (
          <MentionDropdown
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onSelect={(s) => {
              const { newInput, newCursorPos } = acceptSuggestion(s);
              setInput(newInput);
              setCursorPos(newCursorPos);
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
            onSelect={(s) => {
              const { newInput, newCursorPos } = acceptCommand(s);
              setInput(newInput);
              setCursorPos(newCursorPos);
              if (textareaRef.current) setCursorPosition(textareaRef.current, newCursorPos);
            }}
            onHover={setSlashSelectedIndex}
            query={commandQuery}
          />
        )}

        {/* Suggestions proactives — au-dessus du champ, si connecté, au repos et champ vide. */}
        <SuggestionChips
          visible={connected && !isBusy && input.length === 0 && showChips}
          suggestions={proactiveSuggestions}
          onSend={onSend}
        />

        {/* Input container — overflow-hidden only here for border-radius */}
        <div
          className="lea-chat-input flex flex-col transition-[border-color,box-shadow] duration-200 rounded-xl overflow-hidden"
          data-focused={isFocused ? 'true' : undefined}
          style={{
            border: `1px solid ${isFocused ? 'var(--accent-primary)' : 'var(--border-base)'}`,
            boxShadow: isFocused
              ? '0 0 0 3px color-mix(in srgb, var(--accent-primary) 18%, transparent), 0 0 20px var(--accent-glow), inset 0 1px 2px rgba(0,0,0,0.15)'
              : 'inset 0 1px 2px rgba(0,0,0,0.15)',
          }}
        >
          {/* Textarea row */}
          <div className="flex items-end gap-2 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value.slice(0, CHAR_LIMIT));
                setCursorPos(Math.min(e.target.selectionStart ?? 0, CHAR_LIMIT));
              }}
              onSelect={(e) => {
                setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0);
              }}
              onKeyDown={handleKeyDown}
              onFocus={(e) => {
                setIsFocused(true);
                setCursorPos(e.target.selectionStart ?? 0);
              }}
              onBlur={() => setIsFocused(false)}
              placeholder={connected ? 'Message… (@fichier, /commande)' : 'Connectez-vous pour écrire à l\'assistant'}
              disabled={!canSend}
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none outline-none
                         placeholder:text-[var(--text-dimmed)] placeholder:opacity-60
                         leading-[1.55] custom-scrollbar"
              style={{
                color: 'var(--text-primary)',
                minHeight: '28px',
                maxHeight: '140px',
                overflowY: 'auto',
              }}
              aria-label="Saisie du message"
              aria-describedby="chat-input-hints"
              aria-autocomplete="list"
              aria-haspopup="listbox"
            />

            <div className="flex items-center gap-1 pb-0.5 flex-shrink-0">
              {input.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setInput(''); setCursorPos(0); textareaRef.current?.focus(); }}
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
                  title="Effacer le brouillon"
                  aria-label="Effacer le brouillon"
                >
                  <X size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
              <SkillPicker onSelect={handleSelectSkill} disabled={!canSend} />
              <DocumentUpload connected={connected} onDocumentAnalyzed={onDocumentAnalyzed} />

              <motion.button
                onClick={handleSend}
                disabled={!input.trim() || !canSend}
                whileTap={input.trim() && canSend ? { scale: 0.88 } : undefined}
                className="lea-chat-send p-2 rounded-xl transition-all duration-150 disabled:opacity-30 focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
                style={{
                  background: input.trim() && canSend
                    ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-hover))'
                    : 'transparent',
                  color: input.trim() && canSend ? '#0a1628' : 'var(--accent-primary)',
                  boxShadow: input.trim() && canSend ? '0 2px 12px var(--accent-glow)' : 'none',
                }}
                title={isBusy ? 'Ajouter à la file d’attente (Enter)' : 'Envoyer (Enter)'}
                aria-label="Envoyer le message"
              >
                {isBusy ? <CornerDownLeft size={16} /> : <Send size={16} />}
              </motion.button>
            </div>
          </div>

          {/* Bottom info bar */}
          <div
            className="flex items-center justify-between gap-2 px-3 py-1.5 border-t overflow-hidden"
            style={{ borderColor: 'var(--border-base)', backgroundColor: 'color-mix(in srgb, var(--bg-input) 40%, transparent)' }}
          >
            <span
              id="chat-input-hints"
              className="text-xs tracking-wide min-w-0 flex-1 truncate whitespace-nowrap"
              style={{ color: 'var(--text-dimmed)' }}
            >
              <kbd className="font-mono">Enter</kbd> {isBusy ? 'mettre en file' : 'envoyer'} <span className="opacity-60">·</span>{' '}
              <kbd className="font-mono">⇧Enter</kbd> saut de ligne <span className="opacity-60">·</span>{' '}
              <kbd className="font-mono">@</kbd> fichier <span className="opacity-60">·</span>{' '}
              <kbd className="font-mono">/</kbd> commande
            </span>

            <div className="flex items-center gap-2 flex-shrink-0">
              {input.length > 0 && (
                <span
                  className="text-xs font-mono transition-colors"
                  style={{
                    color: overLimit
                      ? 'var(--color-error)'
                      : nearLimit
                        ? 'var(--color-warning)'
                        : 'var(--text-dimmed)',
                  }}
                >
                  {input.length}/{CHAR_LIMIT}
                </span>
              )}

              {connected && (
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: isBusy ? 'var(--accent-primary)' : 'var(--color-success)' }}
                >
                  <BreathingDots
                    color={isBusy ? 'var(--accent-primary)' : 'var(--color-success)'}
                    reduceMotion={reduceMotion}
                    size={4}
                  />
                  {isBusy ? 'Leanna travaille · file active' : isTyping ? 'Frappe…' : 'Connecté'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

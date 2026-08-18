/**
 * NotebookChat — Chat Q&A groundé sur les sources du notebook
 *
 * Interface de conversation avec citations, streaming SSE, suggestions,
 * deep dive, rendu markdown, et UX amélioré.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Loader2, Lightbulb, BookOpen, Trash2, Quote, Telescope, Download,
  MessageCircle, ArrowDown, GitCompare, Zap, StickyNote, Volume2, Square,
  Copy, Check, RefreshCw, Pencil, StopCircle,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { MermaidDiagram } from './MermaidDiagram';

interface Citation {
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  excerpt: string;
  relevance: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  timestamp: string;
}

interface Props {
  notebookId: string;
  hasSources: boolean;
  sources?: { id: string; title: string }[];
}

/** Rich markdown rendering for chat messages */
function renderMessageContent(content: string): JSX.Element {
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim().toLowerCase() || '';
          const code = (lang ? lines.slice(1) : lines).join('\n').trim();

          // Render Mermaid diagrams
          if (lang === 'mermaid') {
            return <MermaidDiagram key={i} code={code} id={`chat-${i}`} />;
          }

          return (
            <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-base)' }}>
              {/* Code block header with language tag */}
              {lang && (
                <div
                  className="flex items-center justify-between px-3 py-1.5"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-base)' }}
                >
                  <span className="text-[9px] font-mono font-medium uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                    {lang}
                  </span>
                </div>
              )}
              <pre
                className="px-4 py-3 text-[11px] overflow-x-auto font-mono leading-relaxed"
                style={{ backgroundColor: 'var(--bg-base)', margin: 0 }}
              >
                <code style={{ color: 'var(--text-secondary)' }}>{code}</code>
              </pre>
            </div>
          );
        }

        // Process block-level markdown
        const lines = part.split('\n');
        const blocks: JSX.Element[] = [];
        let blockIdx = 0;
        let inBlockquote = false;
        let blockquoteLines: string[] = [];
        let inTable = false;
        let tableRows: string[] = [];

        const flushBlockquote = () => {
          if (blockquoteLines.length > 0) {
            blocks.push(
              <blockquote
                key={`bq-${blockIdx++}`}
                className="pl-3 py-1.5 my-1 rounded-r-lg"
                style={{
                  borderLeft: '3px solid var(--accent-primary)',
                  backgroundColor: 'var(--accent-subtle)',
                }}
              >
                {blockquoteLines.map((line, j) => (
                  <p key={j} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {renderInlineMarkdown(line)}
                  </p>
                ))}
              </blockquote>
            );
            blockquoteLines = [];
          }
          inBlockquote = false;
        };

        const flushTable = () => {
          if (tableRows.length > 0) {
            const headerRow = tableRows[0].split('|').filter(c => c.trim());
            const dataRows = tableRows.slice(2).map(row => row.split('|').filter(c => c.trim()));

            blocks.push(
              <div key={`tbl-${blockIdx++}`} className="overflow-x-auto my-2 rounded-lg" style={{ border: '1px solid var(--border-base)' }}>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      {headerRow.map((cell, ci) => (
                        <th key={ci} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-base)' }}>
                          {cell.trim()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: ri < dataRows.length - 1 ? '1px solid var(--border-base)' : 'none' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                            {renderInlineMarkdown(cell.trim())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            tableRows = [];
          }
          inTable = false;
        };

        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];

          // Table detection
          if (line.includes('|') && line.trim().startsWith('|')) {
            if (!inTable) {
              flushBlockquote();
              inTable = true;
            }
            tableRows.push(line);
            continue;
          } else if (inTable) {
            flushTable();
          }

          // Blockquote
          if (line.startsWith('>')) {
            if (!inBlockquote) {
              inBlockquote = true;
            }
            blockquoteLines.push(line.replace(/^>\s?/, ''));
            continue;
          } else if (inBlockquote) {
            flushBlockquote();
          }

          // Empty line
          if (!line.trim()) {
            blocks.push(<div key={`sp-${blockIdx++}`} className="h-2" />);
            continue;
          }

          // Horizontal rule
          if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
            blocks.push(
              <hr key={`hr-${blockIdx++}`} className="my-3 border-none" style={{ height: '1px', backgroundColor: 'var(--border-base)' }} />
            );
            continue;
          }

          // Headers
          if (line.startsWith('#### ')) {
            blocks.push(
              <h4 key={`h4-${blockIdx++}`} className="text-[11px] font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(5))}
              </h4>
            );
            continue;
          }
          if (line.startsWith('### ')) {
            blocks.push(
              <h3 key={`h3-${blockIdx++}`} className="text-xs font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(4))}
              </h3>
            );
            continue;
          }
          if (line.startsWith('## ')) {
            blocks.push(
              <h2 key={`h2-${blockIdx++}`} className="text-[13px] font-bold mt-4 mb-1.5" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(3))}
              </h2>
            );
            continue;
          }
          if (line.startsWith('# ')) {
            blocks.push(
              <h1 key={`h1-${blockIdx++}`} className="text-sm font-bold mt-4 mb-1.5" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(2))}
              </h1>
            );
            continue;
          }

          // Unordered lists
          if (line.match(/^[\-\*]\s/)) {
            blocks.push(
              <div key={`ul-${blockIdx++}`} className="flex gap-2.5 pl-2 my-0.5">
                <span
                  className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-primary)', opacity: 0.7 }}
                />
                <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {renderInlineMarkdown(line.slice(2))}
                </span>
              </div>
            );
            continue;
          }

          // Ordered lists
          if (line.match(/^\d+\.\s/)) {
            const num = line.match(/^(\d+)\./)?.[1];
            blocks.push(
              <div key={`ol-${blockIdx++}`} className="flex gap-2.5 pl-2 my-0.5">
                <span
                  className="text-[10px] font-bold min-w-[16px] mt-[2px] flex-shrink-0 text-center rounded"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {num}
                </span>
                <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {renderInlineMarkdown(line.replace(/^\d+\.\s/, ''))}
                </span>
              </div>
            );
            continue;
          }

          // Regular paragraph
          blocks.push(
            <p key={`p-${blockIdx++}`} className="text-xs leading-[1.7]" style={{ color: 'var(--text-secondary)' }}>
              {renderInlineMarkdown(line)}
            </p>
          );
        }

        // Flush remaining
        if (inBlockquote) flushBlockquote();
        if (inTable) flushTable();

        return <div key={i}>{blocks}</div>;
      })}
    </div>
  );
}

/** Render inline markdown: **bold**, *italic*, `code`, [links](url) */
function renderInlineMarkdown(text: string): (string | JSX.Element)[] {
  const tokens: (string | JSX.Element)[] = [];
  // Regex to match inline elements
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    // Push text before this match
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      tokens.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      tokens.push(
        <em key={`i-${keyIdx++}`} className="italic" style={{ color: 'var(--text-secondary)' }}>
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // `inline code`
      tokens.push(
        <code
          key={`c-${keyIdx++}`}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono"
          style={{ backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-base)' }}
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // [text](url)
      tokens.push(
        <a
          key={`a-${keyIdx++}`}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--accent-primary)' }}
        >
          {match[8]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.length > 0 ? tokens : [text];
}

export function NotebookChat({ notebookId, hasSources, sources = [] }: Props) {
  const { error: toastError, success: toastSuccess } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [deepDiveProgress, setDeepDiveProgress] = useState('');
  const [showCitations, setShowCitations] = useState<string | null>(null);
  const [hoveredCitation, setHoveredCitation] = useState<{ citation: Citation; fullContent: string; x: number; y: number } | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chunkCache = useRef<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Charger l'historique
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/chat/history`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch { /* ignore */ }
      setLoadingHistory(false);
    })();
  }, [notebookId]);

  // Charger les suggestions
  useEffect(() => {
    if (!hasSources) return;
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/chat/suggestions`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch { /* ignore */ }
    })();
  }, [notebookId, hasSources]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Detect scroll position for "scroll to bottom" button
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!atBottom && messages.length > 3);
  }, [messages.length]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ─── TTS — Text-to-Speech ─────────────────────────────────────────────────

  const handleTTS = useCallback((msgId: string, content: string) => {
    // If already speaking this message, stop it
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      speechRef.current = null;
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    // Strip markdown syntax for cleaner speech
    const cleanText = content
      .replace(/```[\s\S]*?```/g, ' bloc de code. ')
      .replace(/#{1,4}\s/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^[\-\*]\s/gm, '')
      .replace(/^\d+\.\s/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/\|/g, ' ')
      .replace(/-{3,}/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'fr-FR';
    utterance.rate = 1;
    utterance.pitch = 1;

    // Try to pick a French voice if available
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith('fr'));
    if (frVoice) utterance.voice = frVoice;

    utterance.onend = () => {
      setSpeakingMsgId(null);
      speechRef.current = null;
    };
    utterance.onerror = () => {
      setSpeakingMsgId(null);
      speechRef.current = null;
    };

    speechRef.current = utterance;
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  }, [speakingMsgId]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // ─── Copy to Clipboard ────────────────────────────────────────────────────

  const handleCopy = useCallback(async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  }, []);

  // ─── Edit User Message (start/cancel only — submit defined after handleSend) ─

  const handleEditStart = useCallback((msgId: string, content: string) => {
    setEditingMsgId(msgId);
    setEditingContent(content);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingMsgId(null);
    setEditingContent('');
  }, []);

  // ─── Stop Streaming ───────────────────────────────────────────────────────

  const handleStopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    if (streamingText) {
      // Save the partial response as a message
      setMessages(prev => [...prev, {
        id: `partial-${Date.now()}`,
        role: 'assistant',
        content: streamingText + '\n\n*(réponse interrompue)*',
        citations: [],
        timestamp: new Date().toISOString(),
      }]);
      setStreamingText('');
    }
    setDeepDiveProgress('');
  }, [streamingText]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  // ─── Streaming Send ────────────────────────────────────────────────────────

  const handleSend = useCallback(async (question?: string) => {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);
    setFollowUps([]);
    setStreamingText('');

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: q,
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`/api/notebooks/${notebookId}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Pas de body stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              } else if (parsed.message) {
                setStreamingText('');
                setMessages(prev => [...prev, parsed.message]);
                if (parsed.followUps) setFollowUps(parsed.followUps);
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }
        }
      }
    } catch (e: any) {
      toastError(e.message);
      setStreamingText('');
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ Erreur: ${e.message}`,
        citations: [],
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      setStreamingText('');
      inputRef.current?.focus();
    }
  }, [input, loading, notebookId, toastError]);

  // ─── Retry / Regenerate (must be after handleSend) ─────────────────────────

  const handleRetry = useCallback(async (msgId: string) => {
    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex < 1) return;

    const userMsg = messages[msgIndex - 1];
    if (userMsg.role !== 'user') return;

    // Remove the assistant answer and resend the question
    setMessages(prev => prev.filter((_, i) => i !== msgIndex));
    setTimeout(() => handleSend(userMsg.content), 50);
  }, [messages, handleSend]);

  // ─── Edit Submit (must be after handleSend) ────────────────────────────────

  const handleEditSubmit = useCallback((msgId: string) => {
    const newContent = editingContent.trim();
    if (!newContent) return;

    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex < 0) return;

    // Remove this message and all subsequent messages, then resend
    setMessages(prev => prev.slice(0, msgIndex));
    setEditingMsgId(null);
    setEditingContent('');
    setTimeout(() => handleSend(newContent), 50);
  }, [editingContent, messages, handleSend]);

  // ─── Deep Dive ─────────────────────────────────────────────────────────────

  const handleDeepDive = useCallback(async (question?: string) => {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);
    setFollowUps([]);
    setStreamingText('');
    setDeepDiveProgress('');

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: `🔬 [Deep Dive] ${q}`,
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat/deep-dive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Pas de body stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.stage) {
                setDeepDiveProgress(parsed.content || parsed.stage);
              } else if (parsed.message) {
                setDeepDiveProgress('');
                setMessages(prev => [...prev, parsed.message]);
                if (parsed.followUps) setFollowUps(parsed.followUps);
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }
        }
      }
    } catch (e: any) {
      toastError(e.message);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ Erreur Deep Dive: ${e.message}`,
        citations: [],
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      setDeepDiveProgress('');
      inputRef.current?.focus();
    }
  }, [input, loading, notebookId, toastError]);

  const handleClear = useCallback(async () => {
    try {
      await fetch(`/api/notebooks/${notebookId}/chat/history`, { method: 'DELETE' });
      setMessages([]);
      setFollowUps([]);
    } catch { /* ignore */ }
  }, [notebookId]);

  // ─── Compare Sources ───────────────────────────────────────────────────────

  const handleCompare = useCallback(async () => {
    if (loading || sources.length < 2) return;

    setLoading(true);
    setFollowUps([]);
    setStreamingText('');

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: `🔄 Comparer les sources : ${sources.map(s => `"${s.title}"`).join(", ")}`,
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: sources.map(s => s.id) }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Pas de body stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              } else if (parsed.message) {
                setStreamingText('');
                setMessages(prev => [...prev, parsed.message]);
                if (parsed.followUps) setFollowUps(parsed.followUps);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (e: any) {
      toastError(e.message);
      setStreamingText('');
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  }, [loading, notebookId, sources, toastError]);

  // ─── Extract Insights ──────────────────────────────────────────────────────

  const handleInsights = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    setFollowUps([]);
    setStreamingText('');

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: '💡 Extraction d\'insights — analyse approfondie des sources',
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Pas de body stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              } else if (parsed.message) {
                setStreamingText('');
                setMessages(prev => [...prev, parsed.message]);
                if (parsed.followUps) setFollowUps(parsed.followUps);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (e: any) {
      toastError(e.message);
      setStreamingText('');
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  }, [loading, notebookId, toastError]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ─── Citation Hover ─────────────────────────────────────────────────────────

  const handleCitationHover = useCallback(async (citation: Citation, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    const cached = chunkCache.current.get(citation.chunkId);
    if (cached) {
      setHoveredCitation({ citation, fullContent: cached, x: rect.left, y: rect.top });
      return;
    }

    setHoveredCitation({ citation, fullContent: citation.excerpt, x: rect.left, y: rect.top });

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat/chunk/${citation.chunkId}`);
      if (res.ok) {
        const data = await res.json();
        const content = data.chunk?.content || citation.excerpt;
        chunkCache.current.set(citation.chunkId, content);
        setHoveredCitation(prev =>
          prev?.citation.chunkId === citation.chunkId
            ? { ...prev, fullContent: content }
            : prev
        );
      }
    } catch { /* ignore */ }
  }, [notebookId]);

  const handleCitationLeave = useCallback(() => {
    setHoveredCitation(null);
  }, []);

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat/export?format=markdown`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'chat-export.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toastError(e.message);
    }
  }, [notebookId, toastError]);

  // ─── Save message to notes ─────────────────────────────────────────────────

  const handleSaveToNote = useCallback(async (msg: ChatMessage) => {
    // Trouver la question utilisateur correspondante (message précédent)
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
    const title = userMsg?.role === 'user'
      ? userMsg.content.slice(0, 80).replace(/[\n\r]/g, ' ')
      : `Note du chat — ${new Date(msg.timestamp).toLocaleDateString('fr')}`;

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: msg.content,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      toastSuccess('Sauvegardé dans les notes');
    } catch (e: any) {
      toastError(`Erreur : ${e.message}`);
    }
  }, [messages, notebookId, toastError, toastSuccess]);

  // ─── Empty state: no sources ───────────────────────────────────────────────

  if (!hasSources) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 p-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent-subtle)' }}
        >
          <BookOpen className="w-7 h-7" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Ajoutez des sources d'abord
          </p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Le chat a besoin de sources pour répondre à vos questions.
            Allez dans l'onglet "Sources" pour uploader des documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7 space-y-5 relative"
      >
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
        ) : messages.length === 0 ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center py-10 gap-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <MessageCircle className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Interrogez vos sources
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                L'IA répondra en citant les passages pertinents de vos documents.
              </p>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2 w-full max-w-lg mt-2">
                <p className="text-[10px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-dimmed)' }}>
                  <Lightbulb className="w-3 h-3" />
                  Questions suggérées
                </p>
                <div className="grid gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      className="w-full text-left p-3.5 rounded-xl border text-xs transition-all hover:border-[var(--accent-primary)] hover:shadow-sm active:scale-[0.99]"
                      style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] ${msg.role === 'user' ? 'px-4 py-3 rounded-2xl rounded-br-md' : 'px-5 py-4 rounded-2xl rounded-bl-md'}`}
                  style={{
                    backgroundColor: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-panel)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: msg.role === 'assistant' ? '1px solid var(--border-base)' : 'none',
                    boxShadow: msg.role === 'user'
                      ? '0 2px 8px rgba(99,102,241,0.2)'
                      : '0 1px 6px rgba(0,0,0,0.04), 0 0 0 0.5px var(--border-base)',
                  }}
                >
                  {/* Message content — with edit mode for user messages */}
                  {msg.role === 'user' && editingMsgId === msg.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-xs bg-white/10 border border-white/20 outline-none resize-none text-white placeholder-white/50"
                        rows={3}
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditSubmit(msg.id)}
                          disabled={!editingContent.trim()}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-40"
                        >
                          Renvoyer
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-medium hover:bg-white/10 transition-colors opacity-70"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : msg.role === 'assistant' ? (
                    renderMessageContent(msg.content)
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}

                  {/* Actions bar */}
                  {editingMsgId !== msg.id && (
                    <div className="flex items-center gap-2 mt-2.5 pt-1">
                      <p className="text-[9px] opacity-40">
                        {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>

                      {/* Separator dot */}
                      <span className="text-[6px] opacity-20">•</span>

                      {msg.role === 'assistant' && (
                        <>
                          {/* Copy */}
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className={`flex items-center gap-1 text-[9px] transition-all ${copiedMsgId === msg.id ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                            style={{ color: copiedMsgId === msg.id ? '#10b981' : undefined }}
                            title="Copier la réponse"
                          >
                            {copiedMsgId === msg.id ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedMsgId === msg.id ? 'Copié' : 'Copier'}</span>
                          </button>

                          {/* Retry */}
                          <button
                            onClick={() => handleRetry(msg.id)}
                            disabled={loading}
                            className="flex items-center gap-1 text-[9px] opacity-40 hover:opacity-100 transition-opacity disabled:opacity-20"
                            title="Régénérer la réponse"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>

                          {/* TTS */}
                          <button
                            onClick={() => handleTTS(msg.id, msg.content)}
                            className={`flex items-center gap-1 text-[9px] transition-opacity ${speakingMsgId === msg.id ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                            style={{ color: speakingMsgId === msg.id ? 'var(--accent-primary)' : undefined }}
                            title={speakingMsgId === msg.id ? 'Arrêter la lecture' : 'Lire à voix haute'}
                          >
                            {speakingMsgId === msg.id ? (
                              <Square className="w-3 h-3" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                            <span>{speakingMsgId === msg.id ? 'Stop' : 'Écouter'}</span>
                          </button>

                          {/* Save to notes */}
                          <button
                            onClick={() => handleSaveToNote(msg)}
                            className="flex items-center gap-1 text-[9px] opacity-40 hover:opacity-100 transition-opacity"
                            title="Sauvegarder dans les notes"
                          >
                            <StickyNote className="w-3 h-3" />
                            <span>Note</span>
                          </button>
                        </>
                      )}

                      {msg.role === 'user' && (
                        <button
                          onClick={() => handleEditStart(msg.id, msg.content)}
                          className="flex items-center gap-1 text-[9px] opacity-40 hover:opacity-100 transition-opacity"
                          title="Modifier et renvoyer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Modifier</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Citations */}
                  {msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t" style={{ borderColor: msg.role === 'user' ? 'rgba(255,255,255,0.15)' : 'var(--border-base)' }}>
                      <button
                        onClick={() => setShowCitations(showCitations === msg.id ? null : msg.id)}
                        className="flex items-center gap-1.5 text-[10px] font-medium opacity-70 hover:opacity-100 transition"
                      >
                        <Quote className="w-3 h-3" />
                        {msg.citations.length} citation{msg.citations.length > 1 ? 's' : ''}
                      </button>

                      <AnimatePresence>
                        {showCitations === msg.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 space-y-2">
                              {msg.citations.map((cit, i) => (
                                <div
                                  key={i}
                                  className="p-2.5 rounded-lg text-[10px] cursor-pointer transition-all hover:ring-1 hover:ring-[var(--accent-primary)]"
                                  style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}
                                  onMouseEnter={(e) => handleCitationHover(cit, e)}
                                  onMouseLeave={handleCitationLeave}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{cit.sourceTitle}</span>
                                    <span
                                      className="px-1.5 py-0.5 rounded-full text-[8px] font-bold"
                                      style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                                    >
                                      {(cit.relevance * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                  <p className="mt-1 line-clamp-2 opacity-75 leading-relaxed">{cit.excerpt}</p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Streaming text */}
            {streamingText && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div
                  className="max-w-[85%] px-5 py-4 rounded-2xl rounded-bl-md"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-base)',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.04), 0 0 0 0.5px var(--border-base)',
                  }}
                >
                  {renderMessageContent(streamingText)}
                  <span className="inline-block w-2 h-4 ml-0.5 animate-pulse rounded-sm" style={{ backgroundColor: 'var(--accent-primary)' }} />
                </div>
              </motion.div>
            )}

            {/* Stop streaming button */}
            {loading && (streamingText || deepDiveProgress) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex justify-center"
              >
                <button
                  onClick={handleStopStreaming}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-medium transition-all hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-base)',
                    color: 'var(--text-secondary)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <StopCircle className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                  Arrêter la génération
                </button>
              </motion.div>
            )}

            {/* Deep dive progress */}
            {deepDiveProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-[11px]"
                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}
                >
                  <Telescope className="w-4 h-4 animate-pulse" />
                  <span className="font-medium">{deepDiveProgress}</span>
                </div>
              </motion.div>
            )}

            {/* Loading indicator */}
            {loading && !streamingText && !deepDiveProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-bl-md"
                  style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
                >
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-primary)', animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-primary)', animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-primary)', animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Follow-ups */}
            {followUps.length > 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-2 pt-3"
              >
                <p className="text-[10px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-dimmed)' }}>
                  <Lightbulb className="w-3 h-3" />
                  Questions de suivi
                </p>
                <div className="flex flex-wrap gap-2">
                  {followUps.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q)}
                      className="px-3 py-2 rounded-xl border text-[11px] transition-all hover:border-[var(--accent-primary)] hover:shadow-sm active:scale-[0.98]"
                      style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)' }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToBottom}
              className="fixed bottom-28 right-8 p-2.5 rounded-full shadow-lg z-30 transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              <ArrowDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Citation hover tooltip */}
      <AnimatePresence>
        {hoveredCitation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 max-w-md p-4 rounded-xl shadow-2xl pointer-events-none"
            style={{
              left: Math.min(hoveredCitation.x, window.innerWidth - 420),
              top: Math.max(hoveredCitation.y - 200, 8),
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-focus)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Quote className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-[11px] font-semibold truncate">{hoveredCitation.citation.sourceTitle}</span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
              >
                {(hoveredCitation.citation.relevance * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[11px] leading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto custom-scrollbar" style={{ color: 'var(--text-muted)' }}>
              {hoveredCitation.fullContent}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area — refined professional design */}
      <div
        className="flex-shrink-0 border-t px-4 py-3 lg:px-6"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        {/* Main input container */}
        <div
          className="relative flex items-end gap-0 rounded-2xl transition-all"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-base)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Posez une question sur vos sources..."
            rows={1}
            className="flex-1 px-4 py-3 bg-transparent text-xs outline-none resize-none placeholder:text-[var(--text-dimmed)]"
            style={{
              color: 'var(--text-primary)',
              minHeight: '44px',
              maxHeight: '120px',
            }}
          />

          {/* Inline action buttons — right side of input */}
          <div className="flex items-center gap-1 px-2 py-2 flex-shrink-0">
            <button
              onClick={() => handleDeepDive()}
              disabled={!input.trim() || loading}
              className="p-2 rounded-lg transition-all active:scale-90 disabled:opacity-25 hover:bg-[var(--accent-subtle)]"
              style={{ color: 'var(--accent-primary)' }}
              title="Deep Dive — exploration approfondie"
            >
              <Telescope className="w-4 h-4" />
            </button>

            <button
              onClick={handleInsights}
              disabled={loading}
              className="p-2 rounded-lg transition-all active:scale-90 disabled:opacity-25 hover:bg-amber-500/10"
              style={{ color: '#f59e0b' }}
              title="Extraire les insights clés"
            >
              <Zap className="w-4 h-4" />
            </button>

            {sources.length >= 2 && (
              <button
                onClick={handleCompare}
                disabled={loading}
                className="p-2 rounded-lg transition-all active:scale-90 disabled:opacity-25 hover:bg-violet-500/10"
                style={{ color: '#8b5cf6' }}
                title="Comparer les sources"
              >
                <GitCompare className="w-4 h-4" />
              </button>
            )}

            {/* Separator */}
            <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border-base)' }} />

            {/* Send button */}
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-xl transition-all active:scale-90 disabled:opacity-30 shadow-sm"
              style={{
                backgroundColor: input.trim() && !loading ? 'var(--accent-primary)' : 'var(--bg-ctrl)',
                color: input.trim() && !loading ? '#fff' : 'var(--text-dimmed)',
              }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Bottom bar — hints + secondary actions */}
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
            Entrée pour envoyer • Shift+Entrée pour un saut de ligne
          </p>

          {messages.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleExport}
                className="p-1.5 rounded-md transition-all hover:bg-[var(--accent-subtle)] active:scale-90"
                style={{ color: 'var(--text-muted)' }}
                title="Exporter en Markdown"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClear}
                className="p-1.5 rounded-md transition-all hover:bg-red-500/10 active:scale-90"
                style={{ color: 'var(--text-muted)' }}
                title="Effacer l'historique"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

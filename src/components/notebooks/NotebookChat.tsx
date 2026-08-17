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
  MessageCircle, ArrowDown,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

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
}

/** Simple markdown-like rendering for chat messages */
function renderMessageContent(content: string): JSX.Element {
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim() || '';
          const code = (lang ? lines.slice(1) : lines).join('\n');
          return (
            <pre
              key={i}
              className="px-3 py-2.5 rounded-lg text-[11px] overflow-x-auto font-mono"
              style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
            >
              <code>{code}</code>
            </pre>
          );
        }

        // Process inline markdown
        return (
          <div key={i} className="space-y-1.5">
            {part.split('\n').map((line, j) => {
              if (!line.trim()) return <div key={j} className="h-1.5" />;

              // Headers
              if (line.startsWith('### ')) return <p key={j} className="text-xs font-bold mt-2">{line.slice(4)}</p>;
              if (line.startsWith('## ')) return <p key={j} className="text-[13px] font-bold mt-2">{line.slice(3)}</p>;
              if (line.startsWith('# ')) return <p key={j} className="text-sm font-bold mt-2">{line.slice(2)}</p>;

              // Lists
              if (line.match(/^[\-\*]\s/)) {
                return (
                  <div key={j} className="flex gap-2 pl-1">
                    <span className="text-[10px] mt-0.5 opacity-40">•</span>
                    <span className="text-xs leading-relaxed flex-1">{renderInlineMarkdown(line.slice(2))}</span>
                  </div>
                );
              }
              if (line.match(/^\d+\.\s/)) {
                const num = line.match(/^(\d+)\./)?.[1];
                return (
                  <div key={j} className="flex gap-2 pl-1">
                    <span className="text-[10px] mt-0.5 opacity-50 font-medium min-w-[14px]">{num}.</span>
                    <span className="text-xs leading-relaxed flex-1">{renderInlineMarkdown(line.replace(/^\d+\.\s/, ''))}</span>
                  </div>
                );
              }

              // Regular paragraph
              return <p key={j} className="text-xs leading-relaxed">{renderInlineMarkdown(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): string {
  // Simple: just return text. A full implementation would parse **bold**, *italic*, `code`
  // but for now we keep it lightweight
  return text;
}

export function NotebookChat({ notebookId, hasSources }: Props) {
  const { error: toastError } = useToast();
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
      const res = await fetch(`/api/notebooks/${notebookId}/chat/stream`, {
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
                  className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'}`}
                  style={{
                    backgroundColor: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-panel)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: msg.role === 'assistant' ? '1px solid var(--border-base)' : 'none',
                    boxShadow: msg.role === 'user' ? '0 2px 8px rgba(var(--accent-primary-rgb, 99,102,241), 0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  {msg.role === 'assistant' ? (
                    renderMessageContent(msg.content)
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}

                  {/* Timestamp */}
                  <p className="text-[9px] mt-2 opacity-40">
                    {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>

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
                  className="max-w-[80%] p-4 rounded-2xl rounded-bl-md"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-base)',
                  }}
                >
                  {renderMessageContent(streamingText)}
                  <span className="inline-block w-2 h-4 ml-0.5 animate-pulse rounded-sm" style={{ backgroundColor: 'var(--accent-primary)' }} />
                </div>
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

      {/* Input area */}
      <div
        className="flex-shrink-0 border-t p-4 lg:px-7"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <div className="flex items-end gap-2.5">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Posez une question sur vos sources..."
              rows={1}
              className="w-full px-4 py-3 rounded-xl text-xs outline-none resize-none transition-all focus:ring-1 focus:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
                minHeight: '44px',
                maxHeight: '120px',
              }}
            />
          </div>

          <button
            onClick={() => handleDeepDive()}
            disabled={!input.trim() || loading}
            className="p-3 rounded-xl border transition-all active:scale-95 disabled:opacity-30 hover:bg-white/5"
            style={{ borderColor: 'var(--border-base)', color: 'var(--accent-primary)' }}
            title="Deep Dive — exploration approfondie"
          >
            <Telescope className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="p-3 rounded-xl transition-all active:scale-95 disabled:opacity-30 shadow-sm"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>

          {messages.length > 0 && (
            <>
              <button
                onClick={handleExport}
                className="p-3 rounded-xl border transition-all hover:bg-white/5 active:scale-95"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title="Exporter en Markdown"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={handleClear}
                className="p-3 rounded-xl border transition-all hover:bg-red-500/10 active:scale-95"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title="Effacer l'historique"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Keyboard hint */}
        <p className="text-[9px] mt-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
          Entrée pour envoyer • Shift+Entrée pour un saut de ligne
        </p>
      </div>
    </div>
  );
}

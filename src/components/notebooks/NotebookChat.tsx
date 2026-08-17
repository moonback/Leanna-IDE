/**
 * NotebookChat — Chat Q&A groundé sur les sources du notebook
 *
 * Interface de conversation avec citations et suggestions de questions.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Send, Loader2, Lightbulb, BookOpen, Trash2, Quote,
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

export function NotebookChat({ notebookId, hasSources }: Props) {
  const { error: toastError } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showCitations, setShowCitations] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
  }, [messages]);

  const handleSend = useCallback(async (question?: string) => {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput('');
    setLoading(true);

    // Ajouter le message utilisateur optimistiquement
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: q,
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMessages(prev => [...prev, data.message]);
    } catch (e: any) {
      toastError(e.message);
      // Ajouter un message d'erreur
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ Erreur: ${e.message}`,
        citations: [],
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, notebookId, toastError]);

  const handleClear = useCallback(async () => {
    try {
      await fetch(`/api/notebooks/${notebookId}/chat/history`, { method: 'DELETE' });
      setMessages([]);
    } catch { /* ignore */ }
  }, [notebookId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (!hasSources) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <BookOpen className="w-10 h-10" style={{ color: 'var(--text-dimmed)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          Ajoutez des sources d'abord
        </p>
        <p className="text-xs text-center max-w-sm" style={{ color: 'var(--text-dimmed)' }}>
          Le chat a besoin de sources pour répondre à vos questions.
          Allez dans l'onglet "Sources" pour uploader des documents.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7 space-y-4">
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Posez une question sur vos sources. L'IA répondra en citant les documents pertinents.
            </p>
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2 w-full max-w-lg">
                <p className="text-[10px] font-medium flex items-center gap-1" style={{ color: 'var(--text-dimmed)' }}>
                  <Lightbulb className="w-3 h-3" />
                  Questions suggérées
                </p>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    className="w-full text-left p-3 rounded-xl border text-xs transition-all hover:border-[var(--border-focus)]"
                    style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user' ? 'rounded-tr-md' : 'rounded-tl-md'}`}
                  style={{
                    backgroundColor: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-panel)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: msg.role === 'assistant' ? '1px solid var(--border-base)' : 'none',
                  }}
                >
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {/* Citations */}
                  {msg.citations.length > 0 && (
                    <div className="mt-3 pt-2 border-t" style={{ borderColor: msg.role === 'user' ? 'rgba(255,255,255,0.2)' : 'var(--border-base)' }}>
                      <button
                        onClick={() => setShowCitations(showCitations === msg.id ? null : msg.id)}
                        className="flex items-center gap-1 text-[9px] font-medium opacity-70 hover:opacity-100 transition"
                      >
                        <Quote className="w-3 h-3" />
                        {msg.citations.length} citation{msg.citations.length > 1 ? 's' : ''}
                      </button>

                      {showCitations === msg.id && (
                        <div className="mt-2 space-y-2">
                          {msg.citations.map((cit, i) => (
                            <div
                              key={i}
                              className="p-2 rounded-lg text-[10px]"
                              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}
                            >
                              <span className="font-semibold">{cit.sourceTitle}</span>
                              <p className="mt-0.5 line-clamp-2 opacity-75">{cit.excerpt}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t p-4 lg:px-7" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez une question sur vos sources..."
              rows={1}
              className="w-full px-4 py-3 pr-10 rounded-xl text-xs outline-none resize-none"
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
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="p-3 rounded-xl transition-all active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-3 rounded-xl border transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
              title="Effacer l'historique"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

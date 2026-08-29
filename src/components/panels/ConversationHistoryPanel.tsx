import React, { useState, useEffect, useCallback } from 'react';
import { History, Search, Trash2, MessageSquare, ChevronLeft, RefreshCw, User, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Panel } from '../ui/Panel';
import { IconButton } from '../ui/IconButton';

// ── Types ───────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string | null;
  summary: string | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
}

interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SearchResult {
  message_id: string;
  conversation_id: string;
  conversation_title: string | null;
  role: string;
  content: string;
  created_at: string;
  rank: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (days > 0)  return `Il y a ${days}j`;
  if (hours > 0) return `Il y a ${hours}h`;
  if (mins > 0)  return `Il y a ${mins}m`;
  return 'À l\'instant';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ───────────────────────────────────────────────────────────────

interface ConversationHistoryPanelProps {
  onLoadConversation?: (messages: ConversationMessage[]) => void;
}

export const ConversationHistoryPanel = React.memo(function ConversationHistoryPanel({
  onLoadConversation,
}: ConversationHistoryPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'list' | 'detail' | 'search'>('list');

  // ── Fetch conversations ───────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/conversations?limit=30');
      const data = await res.json();
      if (data.status === 'success') {
        setConversations(data.conversations);
      }
    } catch (e) {
      console.error('[History] Erreur chargement conversations:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch conversation messages ───────────────────────────────────────────
  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`);
      const data = await res.json();
      if (data.status === 'success') {
        setMessages(data.messages);
        setSelectedConversation(conversationId);
        setView('detail');
      }
    } catch (e) {
      console.error('[History] Erreur chargement messages:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setView('search');
    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.status === 'success') {
        setSearchResults(data.results);
      }
    } catch (e) {
      console.error('[History] Erreur recherche:', e);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // ── Delete conversation ───────────────────────────────────────────────────
  const handleDelete = useCallback(async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (selectedConversation === conversationId) {
        setView('list');
        setSelectedConversation(null);
      }
    } catch (e) {
      console.error('[History] Erreur suppression:', e);
    }
  }, [selectedConversation]);

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ── Render list view ──────────────────────────────────────────────────────
  const renderListView = () => (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-dimmed)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Rechercher dans l'historique..."
            className="w-full pl-8 pr-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-base)',
              color: 'var(--text-primary)',
            }}
            aria-label="Rechercher dans l'historique des conversations"
          />
        </div>
      </div>

      {/* Conversation list */}
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed rounded-2xl"
          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <History className="w-10 h-10 animate-pulse" style={{ color: 'var(--text-dimmed)' }} />
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Aucun historique
            </p>
            <p className="text-xs max-w-[240px]" style={{ color: 'var(--text-muted)' }}>
              Les conversations seront sauvegardées automatiquement ici.
            </p>
          </div>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {conversations.map((conv) => (
            <motion.button
              key={conv.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              onClick={() => fetchMessages(conv.id)}
              className="w-full text-left p-3.5 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group"
              style={{
                backgroundColor: 'var(--bg-panel)',
                borderColor: 'var(--border-base)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {conv.title || 'Conversation sans titre'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
                      {timeAgo(conv.started_at)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>•</span>
                    <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                      {conv.message_count} msg
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all hover:scale-110"
                  style={{ color: 'var(--text-dimmed)' }}
                  aria-label="Supprimer la conversation"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      )}
    </div>
  );

  // ── Render detail view ────────────────────────────────────────────────────
  const renderDetailView = () => (
    <div className="space-y-3">
      {/* Back button */}
      <button
        onClick={() => { setView('list'); setSelectedConversation(null); }}
        className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
        style={{ color: 'var(--accent-primary)' }}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Retour
      </button>

      {/* Load into context button */}
      {onLoadConversation && messages.length > 0 && (
        <button
          onClick={() => onLoadConversation(messages)}
          className="w-full py-2 px-3 rounded-xl text-xs font-medium border transition-colors"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            borderColor: 'var(--border-focus)',
            color: 'var(--accent-primary)',
          }}
        >
          Reprendre cette conversation
        </button>
      )}

      {/* Messages */}
      <div className="max-h-72 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {messages.map((msg, index) => {
          const isAssistant = msg.role === 'assistant';
          const isConsecutive = index > 0 && messages[index - 1].role === msg.role;

          return (
            <div
              key={msg.id}
              className={`flex gap-2 ${isAssistant ? 'flex-row' : 'flex-row-reverse'} ${isConsecutive ? 'mt-0.5' : 'mt-2.5'}`}
            >
              {!isConsecutive ? (
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{
                    backgroundColor: isAssistant ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    border: `1px solid ${isAssistant ? 'var(--border-focus)' : 'var(--border-base)'}`,
                  }}
                >
                  {isAssistant
                    ? <Cpu className="w-2.5 h-2.5" style={{ color: 'var(--accent-primary)' }} />
                    : <User className="w-2.5 h-2.5" style={{ color: 'var(--text-muted)' }} />
                  }
                </div>
              ) : (
                <div className="w-5 flex-shrink-0" />
              )}
              <div className={`flex flex-col gap-0.5 max-w-[80%] ${isAssistant ? 'items-start' : 'items-end'}`}>
                {!isConsecutive && (
                  <span className="text-xs font-semibold uppercase tracking-wider px-0.5 mb-0.5" style={{ color: 'var(--text-dimmed)' }}>
                    {isAssistant ? 'Leanna' : 'Vous'}
                  </span>
                )}
                <div
                  className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    backgroundColor: isAssistant ? 'var(--bg-secondary)' : 'var(--accent-subtle)',
                    border: `1px solid ${isAssistant ? 'var(--border-base)' : 'var(--border-focus)'}`,
                    color: isAssistant ? 'var(--text-primary)' : 'var(--accent-primary)',
                    borderRadius: isAssistant
                      ? (isConsecutive ? '10px 14px 14px 10px' : '4px 14px 14px 10px')
                      : (isConsecutive ? '14px 10px 10px 14px' : '14px 4px 10px 14px'),
                  }}
                >
                  {msg.content}
                </div>
                {!isConsecutive && (
                  <span className="text-xs font-mono px-1" style={{ color: 'var(--text-dimmed)' }}>
                    {formatDate(msg.created_at)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Render search results ─────────────────────────────────────────────────
  const renderSearchView = () => (
    <div className="space-y-3">
      <button
        onClick={() => { setView('list'); setSearchResults([]); setSearchQuery(''); }}
        className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
        style={{ color: 'var(--accent-primary)' }}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Retour
      </button>

      <p className="text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
        {searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''} pour "{searchQuery}"
      </p>

      <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {searchResults.length === 0 && !isSearching ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
            Aucun résultat trouvé.
          </p>
        ) : (
          searchResults.map((result) => (
            <button
              key={result.message_id}
              onClick={() => fetchMessages(result.conversation_id)}
              className="w-full text-left p-3 rounded-xl border transition-all hover:shadow-sm"
              style={{
                backgroundColor: 'var(--bg-panel)',
                borderColor: 'var(--border-base)',
              }}
            >
              <p className="text-xs font-medium truncate mb-1" style={{ color: 'var(--accent-primary)' }}>
                {result.conversation_title || 'Conversation sans titre'}
              </p>
              <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {result.content}
              </p>
              <span className="text-xs font-mono mt-1 block" style={{ color: 'var(--text-dimmed)' }}>
                {formatDate(result.created_at)} • {result.role}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Panel
      title="Historique"
      icon={<History className="w-4 h-4" />}
      actions={
        <IconButton
          variant="default"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={fetchConversations}
          tooltip="Rafraîchir"
          aria-label="Rafraîchir l'historique"
          className="p-1.5 rounded-lg"
        />
      }
    >
      {loading && view === 'list' ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-dimmed)' }} />
        </div>
      ) : (
        <>
          {view === 'list' && renderListView()}
          {view === 'detail' && renderDetailView()}
          {view === 'search' && renderSearchView()}
        </>
      )}
    </Panel>
  );
});

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, Search, Trash2, RefreshCw, MessageSquare, User, Cpu, Loader2, X, Eraser, Clock, ChevronRight } from 'lucide-react';
import { useToast } from '../components/ui/Toast.js';
import { useConfirm } from '../components/ui/ConfirmDialog.js';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { viewHeaderProps } from '../config/navigation.js';

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

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (days > 0)  return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  if (hours > 0) return `Il y a ${hours}h`;
  if (mins > 0)  return `Il y a ${mins}m`;
  return 'À l\'instant';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryView() {
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const messageRequestRef = useRef(0);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetch('/api/conversations?limit=50')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        if (!Array.isArray(data.conversations)) throw new Error('Réponse invalide : historique indisponible.');
        return data;
      })
      .then(d => setConversations(d.conversations))
      .catch(() => {
        setLoadError('Impossible de charger l’historique. Vérifiez la connexion au serveur puis réessayez.');
        toastError('Impossible de charger l\'historique');
      })
      .finally(() => setLoading(false));
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const filtered = conversations.filter(c => {
    if (query.length === 0) return true;
    const q = query.toLowerCase();
    return (c.title || '').toLowerCase().includes(q) ||
      (c.summary || '').toLowerCase().includes(q);
  });

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const conv = conversations.find(c => c.id === id);
    const confirmed = await confirm({
      title: 'Supprimer la conversation',
      message: `Supprimer « ${conv?.title || 'Conversation sans titre'} » ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setConversations(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
      success('Conversation supprimée');
    } catch {
      toastError('Impossible de supprimer la conversation');
    } finally {
      setDeleting(null);
    }
  }, [success, toastError, selectedId, conversations, confirm]);

  const handleSelect = useCallback(async (id: string) => {
    const requestId = ++messageRequestRef.current;
    setSelectedId(id);
    setMessages([]);
    setMessagesError(null);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/conversations/${id}?limit=200`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!Array.isArray(data.messages)) throw new Error('Réponse invalide : messages indisponibles.');
      if (requestId !== messageRequestRef.current) return;
      setMessages(data.messages);
    } catch (error) {
      if (requestId !== messageRequestRef.current) return;
      setMessagesError(error instanceof Error ? error.message : 'Impossible de charger cette conversation.');
      toastError('Impossible de charger la conversation');
    } finally {
      if (requestId === messageRequestRef.current) setLoadingMessages(false);
    }
  }, [toastError]);

  const handleClearAll = useCallback(async () => {
    if (conversations.length === 0) return;
    const confirmed = await confirm({
      title: 'Effacer tout l\'historique',
      message: `Supprimer les ${conversations.length} conversation${conversations.length > 1 ? 's' : ''} ? Cette action est irréversible.`,
      confirmLabel: 'Tout effacer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    });
    if (!confirmed) return;
    setClearingAll(true);
    try {
      const res = await fetch('/api/conversations/all', { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setConversations([]);
      setSelectedId(null);
      setMessages([]);
      success('Tout l\'historique a été effacé');
    } catch {
      toastError('Impossible d\'effacer l\'historique');
    } finally {
      setClearingAll(false);
    }
  }, [conversations.length, confirm, success, toastError]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <ViewHeader
        {...viewHeaderProps('history')}
        badge="Persistant"
        description="Toutes vos conversations passées avec Leanna"
        actions={
          <>
            <span className="hidden text-xs sm:inline" style={{ color: 'var(--text-muted)' }}>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg p-2 transition-colors hover:bg-[var(--bg-active)] disabled:opacity-50"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Rafraîchir"
              title="Rafraîchir"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearingAll}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-error-subtle, rgba(239,68,68,0.1))',
                  color: 'var(--color-error, #ef4444)',
                  border: '1px solid var(--color-error-border, rgba(239,68,68,0.2))',
                }}
                aria-label="Effacer tout l'historique"
                title="Effacer tout l'historique"
              >
                {clearingAll
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Eraser className="h-3 w-3" />
                }
                <span className="hidden sm:inline">{clearingAll ? 'Effacement…' : 'Tout effacer'}</span>
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Conversations list */}
        <div className="w-80 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--notebook-border, var(--border-base))', backgroundColor: 'var(--notebook-surface)' }}>
          {/* Search + stats */}
          <div className="px-4 pt-4 pb-3 flex-shrink-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl text-xs outline-none transition-all focus:ring-2"
                style={{
                  backgroundColor: 'var(--notebook-surface-muted)',
                  border: '1px solid var(--notebook-border)',
                  color: 'var(--text-primary)',
                  ['--tw-ring-color' as any]: 'var(--notebook-accent)',
                }}
                aria-label="Rechercher dans les conversations"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Stats bar */}
            {!loading && conversations.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                    {query
                      ? `${filtered.length}/${conversations.length} conversation${conversations.length > 1 ? 's' : ''}`
                      : `${conversations.length} conversation${conversations.length > 1 ? 's' : ''}`
                    }
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--notebook-surface-muted)' }}>
                  <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--text-dimmed)' }} />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement...</p>
              </div>
            ) : loadError ? (
              <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{loadError}</p>
                <button type="button" onClick={load} className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>Réessayer</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--notebook-surface-muted)' }}>
                  <MessageSquare className="w-5 h-5" style={{ color: 'var(--text-dimmed)' }} />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {query ? 'Aucune correspondance' : 'Aucune conversation'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                    {query ? `Aucun résultat pour "${query}"` : 'Les conversations apparaîtront ici'}
                  </p>
                </div>
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                    style={{ backgroundColor: 'var(--notebook-accent-surface)', color: 'var(--notebook-accent)' }}
                  >
                    Effacer la recherche
                  </button>
                )}
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((conv, i) => (
                  <motion.div
                    key={conv.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ duration: 0.15, delay: i < 10 ? i * 0.02 : 0 }}
                    onClick={() => handleSelect(conv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(conv.id); }}
                    className={`w-full text-left p-3 rounded-xl mb-1.5 transition-all cursor-pointer group relative overflow-hidden`}
                    style={{
                      backgroundColor: selectedId === conv.id
                        ? 'var(--notebook-accent-surface)'
                        : 'var(--notebook-surface-muted)',
                      border: `1px solid ${selectedId === conv.id
                        ? 'var(--notebook-accent)'
                        : 'transparent'}`,
                      boxShadow: selectedId === conv.id
                        ? '0 0 0 1px var(--notebook-accent, transparent)'
                        : 'none',
                    }}
                  >
                    {/* Active left indicator */}
                    {selectedId === conv.id && (
                      <div
                        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--notebook-accent)' }}
                      />
                    )}

                    <div className="flex items-start gap-2 pl-1">
                      {/* Icon */}
                      <div
                        className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                        style={{
                          backgroundColor: selectedId === conv.id
                            ? 'var(--notebook-accent)'
                            : 'var(--notebook-surface)',
                          border: `1px solid ${selectedId === conv.id ? 'transparent' : 'var(--notebook-border)'}`,
                        }}
                      >
                        <MessageSquare
                          className="w-3 h-3"
                          style={{ color: selectedId === conv.id ? 'white' : 'var(--text-muted)' }}
                        />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                          {conv.title || 'Conversation sans titre'}
                        </p>
                        {conv.summary && (
                          <p className="text-xs leading-snug mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                            {conv.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                            {timeAgo(conv.started_at)}
                          </span>
                          <span style={{ color: 'var(--text-dimmed)' }}>·</span>
                          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                            {conv.message_count} msg
                          </span>
                        </div>
                      </div>

                      {/* Actions — visible on hover or selected */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(conv.id, e)}
                          disabled={deleting === conv.id}
                          className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-error-subtle)] disabled:opacity-50"
                          style={{ color: 'var(--color-error)' }}
                          aria-label={`Supprimer ${conv.title || 'la conversation'}`}
                          title="Supprimer"
                        >
                          {deleting === conv.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>

                    {/* Open indicator on selected */}
                    {selectedId === conv.id && (
                      <div className="flex items-center gap-1 mt-2 pl-8">
                        <ChevronRight className="w-3 h-3" style={{ color: 'var(--notebook-accent)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--notebook-accent)' }}>
                          Conversation ouverte
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right — Conversation detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedId ? (
            <>
              {/* Conversation header */}
              <div className="flex-shrink-0 px-6 py-4 border-b" style={{ borderColor: 'var(--notebook-border)', backgroundColor: 'var(--notebook-surface-elevated)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--notebook-accent-surface)', border: '1px solid var(--notebook-accent)' }}>
                      <MessageSquare className="w-4 h-4" style={{ color: 'var(--notebook-accent)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {conversations.find(c => c.id === selectedId)?.title || 'Conversation'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
                        {formatDate(conversations.find(c => c.id === selectedId)?.started_at || '')} · <span className="font-mono">{messages.length} messages</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { if (selectedId) handleDelete(selectedId, e); }}
                    disabled={deleting === selectedId}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors flex-shrink-0 hover:opacity-90 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-error-subtle, rgba(239,68,68,0.1))',
                      color: 'var(--color-error, #ef4444)',
                      border: '1px solid var(--color-error-border, rgba(239,68,68,0.2))',
                    }}
                    aria-label="Supprimer cette conversation"
                    title="Supprimer cette conversation"
                  >
                    {deleting === selectedId
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />
                    }
                    <span className="hidden sm:inline">Supprimer</span>
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
                {loadingMessages ? (
                  <MessageList messages={[]} loadingMessages />
                ) : messagesError ? (
                  <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <p className="max-w-md text-sm" style={{ color: 'var(--color-error)' }}>{messagesError}</p>
                    <button
                      type="button"
                      onClick={() => handleSelect(selectedId)}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                      style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <MessageSquare className="h-8 w-8" style={{ color: 'var(--text-dimmed)' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Aucun message dans cette conversation</p>
                    <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Cette conversation ne contient pas encore de message archivé.</p>
                  </div>
                ) : (
                  <MessageList messages={messages} loadingMessages={false} />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)' }}>
                <History className="w-7 h-7" style={{ color: 'var(--text-dimmed)' }} />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                  {selectedId ? 'Chargement...' : 'Sélectionnez une conversation'}
                </p>
                <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>
                  Cliquez sur une conversation à gauche pour voir les messages échangés.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MessageList sub-component ───────────────────────────────────────────────

function formatMessageContent(content: string): React.ReactNode {
  // Split into paragraphs and render with proper spacing
  const paragraphs = content.split(/\n{2,}/);
  if (paragraphs.length <= 1) {
    // Single paragraph — still handle single newlines
    const lines = content.split('\n');
    if (lines.length <= 1) return content;
    return lines.map((line, i) => (
      <React.Fragment key={`${i}-${line.slice(0, 50)}`}>
        {line}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  }
  return paragraphs.map((para, i) => (
    <p key={`${i}-${para.slice(0, 50)}`} className={i > 0 ? 'mt-2' : ''}>
      {para.split('\n').map((line, j, arr) => (
        <React.Fragment key={j}>
          {line}
          {j < arr.length - 1 && <br />}
        </React.Fragment>
      ))}
    </p>
  ));
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function shouldShowTimestamp(messages: ConversationMessage[], index: number): boolean {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].created_at).getTime();
  const curr = new Date(messages[index].created_at).getTime();
  // Show timestamp if more than 5 minutes between messages
  return (curr - prev) > 5 * 60 * 1000;
}

function MessageList({ messages, loadingMessages }: { messages: ConversationMessage[]; loadingMessages: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (loadingMessages) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-dimmed)' }} />
      </div>
    );
  }

  let lastDateLabel = '';

  return (
    <div className="space-y-1">
      {messages.map((msg, index) => {
        const dateLabel = getDateLabel(msg.created_at);
        const showDateSeparator = dateLabel !== lastDateLabel;
        if (showDateSeparator) lastDateLabel = dateLabel;

        const isAssistant = msg.role === 'assistant';
        const showTime = shouldShowTimestamp(messages, index);
        const isConsecutiveSameRole = index > 0 && messages[index - 1].role === msg.role && !showTime;

        return (
          <React.Fragment key={msg.id}>
            {/* Date separator */}
            {showDateSeparator && (
              <div className="flex items-center gap-3 py-4">
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--notebook-border, var(--border-base))' }} />
                <span className="text-xs font-medium uppercase tracking-wider px-2" style={{ color: 'var(--text-dimmed)' }}>
                  {dateLabel}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--notebook-border, var(--border-base))' }} />
              </div>
            )}

            {/* Timestamp between message groups */}
            {showTime && !showDateSeparator && index > 0 && (
              <div className="flex justify-center py-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ color: 'var(--text-dimmed)', backgroundColor: 'var(--notebook-surface-muted)' }}>
                  {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {/* Message bubble */}
            <div
              className={`flex gap-2.5 ${isAssistant ? 'flex-row' : 'flex-row-reverse'} ${isConsecutiveSameRole ? 'mt-0.5' : 'mt-3'}`}
            >
              {/* Avatar — only show on first message of a group */}
              {!isConsecutiveSameRole ? (
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm"
                  style={{
                    backgroundColor: isAssistant ? 'var(--notebook-accent-surface)' : 'var(--notebook-surface-muted)',
                    border: `1.5px solid ${isAssistant ? 'var(--notebook-accent)' : 'var(--notebook-border)'}`,
                  }}
                >
                  {isAssistant
                    ? <Cpu className="w-3 h-3" style={{ color: 'var(--notebook-accent)' }} />
                    : <User className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  }
                </div>
              ) : (
                <div className="w-7 flex-shrink-0" /> // spacer for alignment
              )}

              {/* Content */}
              <div className={`flex flex-col gap-0.5 max-w-[75%] ${isAssistant ? 'items-start' : 'items-end'}`}>
                {/* Role label on first message of group */}
                {!isConsecutiveSameRole && (
                  <span className="text-xs font-semibold uppercase tracking-wider px-1 mb-0.5" style={{ color: 'var(--text-dimmed)' }}>
                    {isAssistant ? 'Leanna' : 'Vous'}
                  </span>
                )}

                {/* Bubble */}
                <div
                  className="px-4 py-2.5 text-sm leading-[1.6] whitespace-pre-wrap"
                  style={{
                    backgroundColor: isAssistant ? 'var(--notebook-surface)' : 'var(--notebook-accent-surface)',
                    border: `1px solid ${isAssistant ? 'var(--notebook-border)' : 'var(--notebook-accent)'}`,
                    color: isAssistant ? 'var(--text-primary)' : 'var(--notebook-accent)',
                    borderRadius: isAssistant
                      ? (isConsecutiveSameRole ? '12px 16px 16px 12px' : '4px 16px 16px 12px')
                      : (isConsecutiveSameRole ? '16px 12px 12px 16px' : '16px 4px 12px 16px'),
                  }}
                >
                  {formatMessageContent(msg.content)}
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

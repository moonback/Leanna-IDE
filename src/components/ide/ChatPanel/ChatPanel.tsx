import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, RefreshCw, Download, Volume2, CheckCheck } from 'lucide-react';
import { useLiveAPIContext } from '../../../context/LiveAPIContext.js';
import { useProfile } from '../../../context/UserProfileContext.js';
import { UnifiedTimeline } from '../UnifiedTimeline.js';
import { PlanPanel } from './PlanPanel.js';
import { PromptInspectorPanel } from '../PromptInspectorPanel.js';
import { DropZoneOverlay, useDocumentDrop, type DocumentResult } from '../DocumentUpload.js';
import type { TranscriptEntry } from '../../../hooks/useLiveAPI.js';

import type { ChatPanelProps } from './types.js';
import { RADII, MIN_WIDTH, STORAGE_KEYS } from './theme.js';
import { readJSON, writeJSON } from './utils.js';
import { Toast } from './Toast.js';
import { ChatHeader } from './ChatHeader.js';
import { SearchBar } from './SearchBar.js';
import { ChatMessageList } from './ChatMessageList.js';
import { InputArea, type InputAreaHandle } from './InputArea.js';
import { exportConversation, deriveModifiedFiles, type ExportFormat } from './exportConversation.js';
import { useChangeLog } from './useChangeLog.js';
import { ChangeLogPanel } from './ChangeLogPanel.js';
import { getProfile, DEFAULT_PROFILE_ID } from './behaviorProfiles.js';
import { useMessageQueue } from './useMessageQueue.js';
import { useDraggablePanel } from './useDraggablePanel.js';
import { useResizablePanel } from './useResizablePanel.js';
import { useChatScroll } from './useChatScroll.js';
import { usePinnedMessages } from './usePinnedMessages.js';
import { useChatSearch } from './useChatSearch.js';
import { buildProactiveSuggestions } from './proactiveSuggestions.js';
import VoiceDuoView from '../../../views/VoiceDuoView.js';

/**
 * Panneau de conversation flottant / ancré de Leanna.
 *
 * Orchestration pure : l'état et le rendu sont délégués à des hooks et
 * sous-composants dédiés (voir le dossier ./). Ce fichier câble les flux
 * (envoi, file d'attente, défilement, recherche, drag/resize) et conserve
 * l'API publique `ChatPanelProps`.
 */
export function ChatPanel({
  pendingMessage,
  onPendingMessageConsumed,
  onDockedChange,
  onWidthChange,
  onFullscreenChange,
  initialDocked = false,
  onClose,
}: ChatPanelProps = {}) {
  const {
    connected, connecting, connect, disconnect,
    sendTextMessage, sendRawMessage, transcript, clearTranscript,
    activity, isBusy, muted, toggleMute, reasoning, promptDebug,
    systemOverride, sendSystemPromptOverride,
    systemReplace, sendSystemPromptReplace,
    currentPlan, clearPlan,
  } = useLiveAPIContext();
  const { profile } = useProfile();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [minimized, setMinimized] = useState(false);
  const [docked, setDocked] = useState<boolean>(() => readJSON(STORAGE_KEYS.docked, initialDocked));
  const [fullscreen, setFullscreen] = useState(false);
  const [showInput, setShowInput] = useState<boolean>(() => readJSON(STORAGE_KEYS.showInput, false));
  const [showMenu, setShowMenu] = useState(false);
  const [showVoiceDuo, setShowVoiceDuo] = useState(false);
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [showChangeLog, setShowChangeLog] = useState(false);

  // Journal des modifications appliquées depuis le chat (feature #9).
  const { entries: changeLog, clear: clearChangeLog, remove: removeChangeLogEntry } = useChangeLog();
  // Referme le panneau quand il n'y a plus rien à afficher (le bouton d'en-tête
  // disparaît alors aussi : on évite un panneau vide orphelin).
  useEffect(() => { if (changeLog.length === 0) setShowChangeLog(false); }, [changeLog.length]);

  // ── Profil de comportement (feature #7) ─────────────────────────────────────
  // Identifiant persisté ; l'application réelle (surcouche de prompt) se fait
  // via sendSystemPromptOverride à la connexion et à chaque changement.
  const [activeProfileId, setActiveProfileId] = useState<string>(
    () => readJSON<string>(STORAGE_KEYS.profile, DEFAULT_PROFILE_ID),
  );

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; icon?: React.ReactNode } | null>(null);
  const showToast = useCallback((message: string, icon?: React.ReactNode) => {
    setToast({ message, icon });
  }, []);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputAreaHandle>(null);

  const reduceMotion = !!useReducedMotion();

  // ── Épingles ────────────────────────────────────────────────────────────────
  const { togglePin, isPinned } = usePinnedMessages();

  // ── Recherche dans la conversation ───────────────────────────────────────────
  const {
    showSearch, query: searchQuery, setQuery: setSearchQuery,
    matchedEntries, matchedIds, currentMatchId, currentMatchNumber,
    next: gotoNextMatch, prev: gotoPrevMatch, open: openSearchRaw, close: closeSearch, toggle: toggleSearch,
  } = useChatSearch({ transcript, reduceMotion, containerRef: panelRef });

  const openSearch = useCallback(() => { openSearchRaw(); setShowMenu(false); }, [openSearchRaw]);

  // ── Width / resize ──────────────────────────────────────────────────────────
  const handleWidthChange = useCallback((newWidth: number) => {
    writeJSON(STORAGE_KEYS.width, newWidth);
    onWidthChange?.(newWidth);
  }, [onWidthChange]);

  const initialWidth = useMemo(() => readJSON(STORAGE_KEYS.width, 400), []);

  const { width, isResizing, resizeHandlers } = useResizablePanel(
    !docked || fullscreen,
    initialWidth,
    handleWidthChange,
  );

  // ── Persist state ───────────────────────────────────────────────────────────
  useEffect(() => { writeJSON(STORAGE_KEYS.docked, docked); }, [docked]);
  useEffect(() => { writeJSON(STORAGE_KEYS.showInput, showInput); }, [showInput]);
  useEffect(() => { onDockedChange?.(docked); }, [docked, onDockedChange]);
  useEffect(() => { onFullscreenChange?.(fullscreen); }, [fullscreen, onFullscreenChange]);

  // Notify parent of initial width (une seule fois).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onWidthChange?.(width); }, []);

  // ── Drag ────────────────────────────────────────────────────────────────────
  const { mx, my, isDragging: isDraggingPanel, resetPosition, dragHandlers } =
    useDraggablePanel(panelRef, docked || fullscreen, reduceMotion);

  useEffect(() => {
    if (docked || fullscreen) resetPosition();
  }, [docked, fullscreen, resetPosition]);

  // ── Message queue ───────────────────────────────────────────────────────────
  const { queue, enqueue, dequeue } = useMessageQueue(isBusy, connected, sendTextMessage);

  // ── Scroll ──────────────────────────────────────────────────────────────────
  const lastEntry = transcript[transcript.length - 1];
  const {
    messagesRef, messagesInnerRef, showScrollBtn,
    scrollToBottom, handleMessagesScroll, forceAutoScroll,
  } = useChatScroll({
    reduceMotion,
    messageCount: transcript.length,
    lastEntryText: lastEntry?.text,
    lastEntryId: lastEntry?.id,
    extraDeps: [queue.length, isBusy, connecting, activity.length],
  });

  // ── Suggestions proactives (prochaines étapes déduites du contexte) ─────────
  const suggestions = useMemo(
    () => buildProactiveSuggestions({ transcript, activity }),
    [transcript, activity],
  );

  // ── Send helpers ─────────────────────────────────────────────────────────────
  const handleSend = useCallback((text: string, displayText?: string) => {
    if (!connected) return;
    try {
      forceAutoScroll();
      scrollToBottom(true);
      if (isBusy) enqueue({ text, displayText });
      else sendTextMessage(text, displayText);
    } catch (err) {
      console.error('[ChatPanel] sendTextMessage failed:', err);
    }
  }, [connected, isBusy, enqueue, sendTextMessage, scrollToBottom, forceAutoScroll]);

  // Retry : renvoie le dernier message utilisateur.
  const handleRetry = useCallback(() => {
    const lastUser = [...transcript].reverse().find(e => e.role === 'user');
    if (!lastUser || !connected) return;
    handleSend(lastUser.text, lastUser.text);
    showToast('Régénération en cours…', <RefreshCw size={13} style={{ color: 'var(--accent-primary)' }} />);
  }, [transcript, connected, handleSend, showToast]);

  // Édition : préremplit la saisie avec le texte du message (sans l'envoyer).
  const handleEditMessage = useCallback((entry: TranscriptEntry) => {
    setShowInput(true);
    // Laisse le temps au champ d'être monté s'il était masqué.
    requestAnimationFrame(() => {
      inputRef.current?.setValue(entry.text);
      inputRef.current?.focus();
    });
    showToast('Message chargé pour édition', <RefreshCw size={13} style={{ color: 'var(--accent-primary)' }} />);
  }, [showToast]);

  // ── Pending message ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingMessage) return;
    if (!connected) {
      if (!connecting) connect([], 'full');
      return;
    }
    forceAutoScroll();
    scrollToBottom(true);
    handleSend(pendingMessage.text, pendingMessage.displayText);
    onPendingMessageConsumed?.();
  }, [pendingMessage, connected, connecting, connect, handleSend, onPendingMessageConsumed, scrollToBottom, forceAutoScroll]);

  // ── Document upload ─────────────────────────────────────────────────────────
  const handleDocumentAnalyzed = useCallback((result: DocumentResult) => {
    if (!connected) return;
    try {
      sendRawMessage({ type: 'document_context', fileName: result.fileName, summary: result.summary });
    } catch (err) {
      console.error('[ChatPanel] sendRawMessage failed:', err);
    }
  }, [connected, sendRawMessage]);

  const { isDragging, dropHandlers } = useDocumentDrop({ connected, onDocumentAnalyzed: handleDocumentAnalyzed });

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => clearTranscript(), [clearTranscript]);
  const handleToggleConnect = useCallback(() => {
    if (connected) disconnect(); else connect([], 'full');
  }, [connected, disconnect, connect]);

  // Applique un profil : « default » réinitialise la surcouche, les autres
  // injectent leur directive. Non destructif (les garde-fous serveur restent).
  const applyProfile = useCallback((text: string) => {
    if (!text) sendSystemPromptOverride('', { reset: true });
    else sendSystemPromptOverride(text);
  }, [sendSystemPromptOverride]);

  const handleSelectProfile = useCallback((id: string) => {
    setActiveProfileId(id);
    writeJSON(STORAGE_KEYS.profile, id);
    if (connected) applyProfile(getProfile(id).directive);
  }, [connected, applyProfile]);

  // Ré-applique le profil choisi à chaque (re)connexion : l'override agit sur la
  // session Gemini, qui est recréée à la connexion. Sans cela, un profil
  // persisté serait silencieusement « oublié » après reconnexion.
  useEffect(() => {
    if (!connected) return;
    const directive = getProfile(activeProfileId).directive;
    if (directive) applyProfile(directive);
    // On ne ré-applique qu'au passage à l'état connecté (et si le profil change).
  }, [connected, activeProfileId, applyProfile]);

  const handleExport = useCallback((format: ExportFormat = 'markdown') => {
    if (transcript.length === 0) {
      showToast('Aucune conversation à exporter', <X size={13} style={{ color: 'var(--color-error)' }} />);
      return;
    }
    try {
      const result = exportConversation(format, transcript, {
        assistantName: profile?.aiName || 'Leanna',
        userName: profile?.userName || undefined,
        modifiedFiles: deriveModifiedFiles(activity),
      });
      if (!result) {
        // Seul le PDF peut échouer ici (popup bloqué par le navigateur).
        showToast('Export PDF bloqué : autorisez les fenêtres pop-up puis réessayez.', <X size={13} style={{ color: 'var(--color-error)' }} />);
        return;
      }
      const label = format === 'markdown' ? 'Rapport Markdown exporté'
        : format === 'json' ? 'Rapport JSON exporté'
          : 'Rapport PDF prêt — choisissez « Enregistrer en PDF »';
      showToast(label, <Download size={13} style={{ color: 'var(--accent-primary)' }} />);
    } catch (err) {
      console.error('[ChatPanel] Export failed:', err);
      showToast("Échec de l'export de la conversation", <X size={13} style={{ color: 'var(--color-error)' }} />);
    }
  }, [transcript, profile, showToast, activity]);

  // Test de la présence vocale via l'endpoint de debug protégé.
  const handleVoiceTest = useCallback(async () => {
    const voiceIcon = <Volume2 size={13} style={{ color: 'var(--accent-primary)' }} />;
    try {
      const res = await fetch('/api/debug/voice-test', { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        showToast('Test vocal déclenché — Leanna va parler', voiceIcon);
      } else if (res.status === 404) {
        showToast('Test vocal indisponible (routes de debug désactivées)', <X size={13} style={{ color: 'var(--color-error)' }} />);
      } else if (res.status === 409) {
        showToast('Présence vocale inactive (LEANNA_VOICE_PRESENCE)', <X size={13} style={{ color: 'var(--color-error)' }} />);
      } else {
        showToast(`Échec du test vocal${data?.error ? ` : ${data.error}` : ''}`, <X size={13} style={{ color: 'var(--color-error)' }} />);
      }
    } catch (err) {
      console.error('[ChatPanel] Voice test failed:', err);
      showToast('Échec du test vocal (réseau)', <X size={13} style={{ color: 'var(--color-error)' }} />);
    }
  }, [showToast]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMenu) { setShowMenu(false); return; }
        if (showSearch) { closeSearch(); return; }
        if (fullscreen) { setFullscreen(false); return; }
      }
      // Ctrl/Cmd+F : recherche
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f' && transcript.length > 0) {
        e.preventDefault();
        openSearch();
        return;
      }
      // Ctrl/Cmd+Shift+C : fermer le panneau
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showMenu, showSearch, fullscreen, onClose, transcript.length, openSearch, closeSearch]);

  // Dernier message assistant (pour le bouton « régénérer »).
  const lastAssistantIdx = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i].role === 'assistant') return i;
    }
    return -1;
  }, [transcript]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {toast && <Toast message={toast.message} icon={toast.icon} onDone={() => setToast(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showPromptInspector && (
          <PromptInspectorPanel
            promptDebug={promptDebug}
            connected={connected}
            chatWidth={docked ? width : width + 48}
            chatFullscreen={fullscreen}
            override={systemOverride}
            onApplyOverride={sendSystemPromptOverride}
            replaced={systemReplace}
            onReplace={sendSystemPromptReplace}
            onClose={() => setShowPromptInspector(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={panelRef}
        className="lea-chat-panel fixed flex flex-col overflow-hidden"
        style={{
          top:    fullscreen ? '0' : docked ? '0'    : '80px',
          right:  fullscreen ? '0' : docked ? '0'    : '24px',
          left:   fullscreen ? '50vw' : undefined,
          bottom: fullscreen ? '0' : docked ? '32px' : '40px',
          width:  fullscreen ? '50vw' : `${width}px`,
          height: fullscreen
            ? '100vh'
            : minimized
              ? 'auto'
              : docked
                ? 'calc(100vh - 32px)'
                : 'calc(100vh - 152px)',
          maxHeight: fullscreen ? '100vh' : minimized ? undefined : docked ? 'calc(100vh - 32px)' : 'calc(100vh - 152px)',
          minWidth:  fullscreen ? undefined : `${MIN_WIDTH}px`,
          zIndex:    fullscreen ? 99999 : 9990,
          backgroundColor: 'var(--bg-panel)',
          border:     fullscreen || docked ? 'none' : '1px solid var(--border-base)',
          borderLeft: (fullscreen || docked) ? '1px solid var(--border-base)' : undefined,
          borderRadius: fullscreen ? '0' : docked ? '0' : RADII.xl,
          x: fullscreen || docked ? 0 : mx,
          y: fullscreen || docked ? 0 : my,
          cursor: isDraggingPanel && !docked && !fullscreen ? 'grabbing' : isResizing ? 'ew-resize' : 'default',
          userSelect: isDraggingPanel || isResizing ? 'none' : 'auto',
          boxShadow: fullscreen
            ? 'none'
            : docked
              ? '-4px 0 32px rgba(0,0,0,0.28), -1px 0 0 var(--border-base), inset 1px 0 0 rgba(255,255,255,0.03)'
              : isDraggingPanel
                ? '0 28px 80px rgba(0,0,0,0.55), 0 0 0 1px var(--border-base), 0 0 40px var(--accent-glow)'
                : '0 16px 56px rgba(0,0,0,0.4), 0 0 0 1px var(--border-base), 0 0 24px color-mix(in srgb, var(--accent-primary) 8%, transparent)',
          transition: reduceMotion || isDraggingPanel || isResizing
            ? 'box-shadow 0.15s'
            : 'top 0.3s cubic-bezier(0.22,1,0.36,1), right 0.3s cubic-bezier(0.22,1,0.36,1), width 0.3s cubic-bezier(0.22,1,0.36,1), height 0.3s cubic-bezier(0.22,1,0.36,1), bottom 0.3s cubic-bezier(0.22,1,0.36,1), border-radius 0.3s',
          backdropFilter: fullscreen ? 'none' : 'blur(24px)',
        }}
        {...dropHandlers}
      >
        <DropZoneOverlay isDragging={isDragging} />

        {/* Resize handle */}
        {docked && !fullscreen && (
          <div
            {...resizeHandlers}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize group z-50"
            style={{ touchAction: 'none' }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-4 -translate-x-1/2" />
            <div
              className="absolute left-0 top-0 bottom-0 w-0.5 transition-colors"
              style={{ backgroundColor: isResizing ? 'var(--accent-primary)' : 'transparent' }}
            />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-14 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: 'var(--accent-primary)', boxShadow: '0 0 10px color-mix(in srgb, var(--accent-primary) 50%, transparent)' }}
            />
          </div>
        )}

        {/* Header */}
        <ChatHeader
          aiName={profile?.aiName || 'Leanna'}
          connected={connected}
          connecting={connecting}
          isBusy={isBusy}
          muted={muted}
          reduceMotion={reduceMotion}
          messageCount={transcript.length}
          docked={docked}
          fullscreen={fullscreen}
          minimized={minimized}
          showInput={showInput}
          showMenu={showMenu}
          showClose={!!onClose}
          dragHandlers={dragHandlers}
          onToggleMute={toggleMute}
          onToggleVoiceDuo={() => setShowVoiceDuo(value => !value)}
          voiceDuoOpen={showVoiceDuo}
          onToggleInput={() => setShowInput(s => !s)}
          onToggleMenu={() => setShowMenu(v => !v)}
          onToggleSearch={() => { toggleSearch(); setShowMenu(false); }}
          changeLogCount={changeLog.length}
          showChangeLog={showChangeLog}
          onToggleChangeLog={() => setShowChangeLog(v => !v)}
          activeProfileId={activeProfileId}
          onSelectProfile={handleSelectProfile}
          onExport={(format) => { handleExport(format); setShowMenu(false); }}
          onClear={() => { handleClear(); setShowMenu(false); }}
          onVoiceTest={() => { void handleVoiceTest(); setShowMenu(false); }}
          onInspectPrompt={() => { setShowPromptInspector(true); setShowMenu(false); }}
          onToggleFullscreen={() => {
            setFullscreen(f => { if (!f) { setDocked(false); setMinimized(false); } return !f; });
            setShowMenu(false);
          }}
          onToggleDocked={() => { setDocked(d => !d); setShowMenu(false); }}
          onToggleMinimized={() => { setMinimized(m => !m); setShowMenu(false); }}
          onToggleConnect={handleToggleConnect}
          onClose={onClose}
        />

        {/* Journal des modifications appliquées (feature #9) */}
        {!minimized && (
          <ChangeLogPanel
            entries={changeLog}
            open={showChangeLog}
            reduceMotion={reduceMotion}
            onClose={() => setShowChangeLog(false)}
            onClear={clearChangeLog}
            onRemove={removeChangeLogEntry}
          />
        )}

        {/* Barre de recherche */}
        <AnimatePresence>
          {showSearch && !minimized && (
            <SearchBar
              query={searchQuery}
              onQueryChange={setSearchQuery}
              matchCount={matchedEntries.length}
              currentMatch={currentMatchNumber}
              onNext={gotoNextMatch}
              onPrev={gotoPrevMatch}
              onClose={closeSearch}
            />
          )}
        </AnimatePresence>

        {/* Timeline d'activité unifiée */}
        {!minimized && connected && (activity.length > 0 || reasoning?.active) && (
          <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <UnifiedTimeline steps={activity} reasoning={reasoning} connected={connected} />
          </div>
        )}

        {/* Plan d'exécution — affiché dès que set_plan est appelé */}
        {!minimized && currentPlan && (
          <PlanPanel plan={currentPlan} onDismiss={clearPlan} />
        )}

        {/* Body */}
        {!minimized && (
          <>
            <ChatMessageList
              transcript={transcript}
              queue={queue}
              profile={profile!}
              connected={connected}
              connecting={connecting}
              isBusy={isBusy}
              activityLength={activity.length}
              reduceMotion={reduceMotion}
              lastAssistantIdx={lastAssistantIdx}
              searchQuery={searchQuery}
              matchedIds={showSearch ? matchedIds : undefined}
              currentMatchId={currentMatchId}
              isPinned={isPinned}
              onTogglePin={togglePin}
              onEditMessage={handleEditMessage}
              onExcludeSource={(source) => sendRawMessage({ context_exclude: source.path })}
              onCopy={() => showToast('Copié dans le presse-papiers', <CheckCheck size={13} style={{ color: 'var(--color-success)' }} />)}
              onRetry={handleRetry}
              onDequeue={dequeue}
              sendRawMessage={sendRawMessage}
              messagesRef={messagesRef}
              messagesInnerRef={messagesInnerRef}
              onScroll={handleMessagesScroll}
              showScrollBtn={showScrollBtn}
              onScrollToBottom={() => scrollToBottom(true)}
            />

            {/* Input area */}
            {showInput && (
              <InputArea
                ref={inputRef}
                connected={connected}
                onConnect={handleToggleConnect}
                isBusy={isBusy}
                onSend={handleSend}
                onDocumentAnalyzed={handleDocumentAnalyzed}
                onToast={showToast}
                showChips={profile.showChatSuggestions ?? true}
                proactiveSuggestions={suggestions}
              />
            )}
          </>
        )}

        {/* Duo vocal intégré au ChatPanel : les deux sessions restent dans l'IDE. */}
        <AnimatePresence>
          {showVoiceDuo && (
            <motion.div
              key="voice-duo-overlay"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
              className="absolute inset-0 z-[80] overflow-hidden"
              style={{ backgroundColor: 'var(--bg-panel)' }}
            >
              <VoiceDuoView embedded onClose={() => setShowVoiceDuo(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

export default ChatPanel;

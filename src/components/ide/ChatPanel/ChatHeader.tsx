import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, X, Trash2, Power, GripVertical, Minus, PanelRight,
  Maximize2, Minimize2, Download, MessageSquare, MoreVertical,
  Hash, Loader2, Volume2, FileSearch, Search, Sparkles,
} from 'lucide-react';
import { MenuButton } from './MenuButton.js';

export interface ChatHeaderProps {
  aiName: string;
  connected: boolean;
  connecting: boolean;
  isBusy: boolean;
  muted: boolean;
  reduceMotion: boolean;
  messageCount: number;
  docked: boolean;
  fullscreen: boolean;
  minimized: boolean;
  showInput: boolean;
  showMenu: boolean;
  showClose: boolean;

  // Drag
  dragHandlers: Record<string, unknown>;

  // Actions
  onToggleMute: () => void;
  onToggleInput: () => void;
  onToggleMenu: () => void;
  onToggleSearch: () => void;
  onExport: () => void;
  onClear: () => void;
  onVoiceTest: () => void;
  onInspectPrompt: () => void;
  onToggleFullscreen: () => void;
  onToggleDocked: () => void;
  onToggleMinimized: () => void;
  onToggleConnect: () => void;
  onClose?: () => void;
}

/** En-tête du ChatPanel : titre, statut, actions et menu « Plus d'options ». */
export function ChatHeader({
  aiName, connected, connecting, isBusy, muted, reduceMotion, messageCount,
  docked, fullscreen, minimized, showInput, showMenu, showClose,
  dragHandlers,
  onToggleMute, onToggleInput, onToggleMenu, onToggleSearch, onExport, onClear,
  onVoiceTest, onInspectPrompt, onToggleFullscreen, onToggleDocked,
  onToggleMinimized, onToggleConnect, onClose,
}: ChatHeaderProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermer le menu au clic extérieur.
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onToggleMenu();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu, onToggleMenu]);

  const statusColor = connected
    ? (isBusy ? 'var(--accent-primary)' : 'var(--color-success)')
    : connecting ? 'var(--color-warning)' : 'var(--text-dimmed)';
  const statusLabel = connecting
    ? 'Connexion…'
    : isBusy ? 'Réflexion…' : connected ? 'En ligne' : 'Hors ligne';
  // État visuel de l'orbe et du liseré d'en-tête (voir styles/workspace-pro.css)
  const orbState = connecting ? 'connecting' : !connected ? 'offline' : isBusy ? 'busy' : 'online';

  return (
    <div
      {...(docked || fullscreen ? {} : dragHandlers)}
      className="lea-chat-header flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0 relative"
      data-state={orbState}
      style={{
        borderBottom: '1px solid var(--border-base)',
        cursor: docked || fullscreen ? 'default' : 'grab',
        touchAction: docked || fullscreen ? undefined : 'none',
        // Le menu déroulant (z-50) vit dans l'en-tête : sans contexte d'empilement
        // ici, le corps du chat (soeur `relative` suivante) le recouvrait et
        // interceptait les clics. On élève l'en-tête au-dessus du corps.
        zIndex: 20,
      }}
    >
      {!docked && !fullscreen && (
        <GripVertical size={14} className="flex-shrink-0" style={{ color: 'var(--text-dimmed)', opacity: 0.35 }} />
      )}

      {/* Orbe de l'assistante : pulse quand elle réfléchit, grisée hors ligne */}
      <span className="lea-orb" data-state={orbState} style={{ width: 30, height: 30 }} aria-hidden="true">
        <Sparkles size={14} />
        <span className="lea-orb__status" style={{ backgroundColor: statusColor }} />
      </span>

      {/* Title + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
            {aiName}
          </span>
          {messageCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-xs font-mono px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ color: 'var(--text-dimmed)', backgroundColor: 'color-mix(in srgb, var(--text-dimmed) 10%, transparent)' }}
              title={`${messageCount} message${messageCount > 1 ? 's' : ''}`}
            >
              <Hash size={8} />
              {messageCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          <span
            className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ color: statusColor, backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}
          >
            {connecting ? (
              <Loader2 size={9} className={reduceMotion ? '' : 'animate-spin'} />
            ) : isBusy && !reduceMotion ? (
              <motion.span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusColor }}
                animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
            )}
            <span className={isBusy && !reduceMotion ? 'lea-shimmer-text' : undefined}>{statusLabel}</span>
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <div
          className="flex items-center gap-0.5 rounded-xl p-0.5"
          style={{ backgroundColor: 'color-mix(in srgb, var(--bg-input) 55%, transparent)', border: '1px solid var(--border-base)' }}
        >
          {/* Search */}
          {messageCount > 0 && (
            <motion.button
              onClick={onToggleSearch}
              whileTap={reduceMotion ? undefined : { scale: 0.88 }}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
              title="Rechercher (Ctrl+F)"
              aria-label="Rechercher dans la conversation"
            >
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
            </motion.button>
          )}

          {/* Mute */}
          {connected && (
            <motion.button
              onClick={onToggleMute}
              whileTap={reduceMotion ? undefined : { scale: 0.88 }}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
              title={muted ? 'Activer le micro' : 'Désactiver le micro'}
              aria-label={muted ? 'Activer le micro' : 'Désactiver le micro'}
            >
              {muted
                ? <MicOff size={15} style={{ color: 'var(--color-warning)' }} />
                : <Mic size={15} style={{ color: 'var(--color-success)' }} />
              }
            </motion.button>
          )}

          {/* Toggle input */}
          <motion.button
            onClick={onToggleInput}
            whileTap={reduceMotion ? undefined : { scale: 0.88 }}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
            title={showInput ? 'Masquer la saisie' : 'Afficher la saisie'}
            aria-label={showInput ? 'Masquer la saisie' : 'Afficher la saisie'}
            aria-pressed={showInput}
            style={{ backgroundColor: showInput ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'transparent' }}
          >
            <MessageSquare size={15} style={{ color: showInput ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
          </motion.button>

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <motion.button
              onClick={onToggleMenu}
              whileTap={reduceMotion ? undefined : { scale: 0.88 }}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
              title="Plus d'options"
              aria-label="Plus d'options"
              aria-expanded={showMenu}
              style={{ backgroundColor: showMenu ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' : 'transparent' }}
            >
              <MoreVertical size={15} style={{ color: showMenu ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
            </motion.button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.94 }}
                  transition={{ duration: 0.13 }}
                  className="absolute right-0 top-full mt-1.5 w-52 rounded-xl overflow-hidden z-50"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-base)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)',
                  }}
                >
                  {messageCount > 0 && (
                    <>
                      <div className="px-3 pt-2 pb-1">
                        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                          Conversation
                        </span>
                      </div>
                      <MenuButton
                        icon={<Search size={13} style={{ color: 'var(--accent-primary)' }} />}
                        label="Rechercher"
                        shortcut="⌘F"
                        onClick={onToggleSearch}
                      />
                      <MenuButton
                        icon={<Download size={13} style={{ color: 'var(--accent-primary)' }} />}
                        label="Exporter"
                        onClick={onExport}
                      />
                      <MenuButton
                        icon={<Trash2 size={13} style={{ color: 'var(--color-error)' }} />}
                        label="Effacer"
                        onClick={onClear}
                        danger
                      />
                      <div className="h-px mx-3 my-1" style={{ backgroundColor: 'var(--border-base)' }} />
                    </>
                  )}

                  <div className="px-3 pt-1 pb-1">
                    <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                      Outils
                    </span>
                  </div>

                  <MenuButton
                    icon={<Volume2 size={13} style={{ color: 'var(--accent-primary)' }} />}
                    label="Tester la voix"
                    onClick={onVoiceTest}
                  />
                  <MenuButton
                    icon={<FileSearch size={13} style={{ color: 'var(--accent-primary)' }} />}
                    label="Inspecter le prompt"
                    onClick={onInspectPrompt}
                  />

                  <div className="h-px mx-3 my-1" style={{ backgroundColor: 'var(--border-base)' }} />

                  <div className="px-3 pt-1 pb-1">
                    <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                      Affichage
                    </span>
                  </div>

                  <MenuButton
                    icon={fullscreen
                      ? <Minimize2 size={13} style={{ color: 'var(--accent-primary)' }} />
                      : <Maximize2 size={13} style={{ color: 'var(--text-muted)' }} />
                    }
                    label={fullscreen ? 'Quitter plein écran' : 'Plein écran'}
                    onClick={onToggleFullscreen}
                  />
                  <MenuButton
                    icon={<PanelRight size={13} style={{ color: docked ? 'var(--accent-primary)' : 'var(--text-muted)' }} />}
                    label={docked ? 'Détacher' : 'Ancrer au bord'}
                    onClick={onToggleDocked}
                  />
                  {!docked && (
                    <MenuButton
                      icon={<Minus size={13} style={{ color: 'var(--text-muted)' }} />}
                      label={minimized ? 'Agrandir' : 'Réduire'}
                      onClick={onToggleMinimized}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Power — connect / disconnect */}
        <motion.button
          onClick={onToggleConnect}
          whileTap={reduceMotion ? undefined : { scale: 0.88 }}
          className="p-1.5 rounded-lg transition-colors"
          title={connected ? 'Déconnecter' : 'Connecter'}
          aria-label={connected ? 'Déconnecter' : 'Connecter'}
          style={{
            backgroundColor: connected
              ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
              : 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
          }}
        >
          <Power size={15} style={{ color: connected ? 'var(--color-error)' : 'var(--accent-primary)' }} />
        </motion.button>

        {/* Close */}
        {showClose && onClose && (
          <motion.button
            onClick={onClose}
            whileTap={reduceMotion ? undefined : { scale: 0.88 }}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
            title="Fermer (Ctrl+Shift+C)"
            aria-label="Fermer le panneau"
          >
            <X size={15} style={{ color: 'var(--text-muted)' }} />
          </motion.button>
        )}
      </div>
    </div>
  );
}

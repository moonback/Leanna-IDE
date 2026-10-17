import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, X, Trash2, Power, GripVertical, Minus, PanelRight,
  Maximize2, Minimize2, MessageSquare, MoreVertical,
  Hash, Loader2, Volume2, FileSearch, Search, Sparkles, History,
} from 'lucide-react';
import { MenuButton } from './MenuButton.js';
import { ProfileSwitcher } from './ProfileSwitcher.js';
import { ExportMenuSection } from './ExportMenuSection.js';
import type { ExportFormat } from './exportConversation.js';

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
  /** Nombre de modifications appliquées (badge sur le bouton journal). */
  changeLogCount?: number;
  /** Journal des modifications ouvert ? */
  showChangeLog?: boolean;
  /** Profil de comportement actif (feature #7). */
  activeProfileId?: string;

  // Drag
  dragHandlers: Record<string, unknown>;

  // Actions
  onToggleMute: () => void;
  onToggleInput: () => void;
  onToggleMenu: () => void;
  onToggleSearch: () => void;
  onToggleChangeLog?: () => void;
  /** Change de profil de comportement (applique/réinitialise la surcouche). */
  onSelectProfile?: (id: string) => void;
  onExport: (format: ExportFormat) => void;
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
  changeLogCount = 0, showChangeLog = false, activeProfileId = 'default',
  dragHandlers,
  onToggleMute, onToggleInput, onToggleMenu, onToggleSearch, onToggleChangeLog, onSelectProfile, onExport, onClear,
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
      className="lea-chat-header flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0 relative select-none"
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
      {/* Zone gauche : Drag handle + Orbe + Identité / Statut */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {!docked && !fullscreen && (
          <GripVertical
            size={14}
            className="flex-shrink-0 text-[var(--text-dimmed)] opacity-40 hover:opacity-80 transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* Orbe de l'assistante : pulse quand elle réfléchit, grisée hors ligne */}
        <span
          className="lea-orb flex-shrink-0"
          data-state={orbState}
          style={{ width: 28, height: 28 }}
          aria-hidden="true"
        >
          <Sparkles size={13} />
          <span className="lea-orb__status" style={{ backgroundColor: statusColor }} />
        </span>

        {/* Identité + Statut + Profil */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {/* Ligne 1 : Nom de l'IA + Compteur de messages */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[13px] font-semibold truncate leading-tight tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {aiName}
            </span>
            {messageCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  color: 'var(--text-dimmed)',
                  backgroundColor: 'color-mix(in srgb, var(--text-dimmed) 12%, transparent)',
                }}
                title={`${messageCount} message${messageCount > 1 ? 's' : ''}`}
              >
                <Hash size={8} />
                <span>{messageCount}</span>
              </span>
            )}
          </div>

          {/* Ligne 2 : Pastille de statut + Sélecteur de profil */}
          {/* overflow-hidden retiré : il clippait le dropdown absolu du ProfileSwitcher */}
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
              style={{
                color: statusColor,
                backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
              }}
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
              <span
                className={`truncate max-w-[70px] sm:max-w-[85px] ${
                  isBusy && !reduceMotion ? 'lea-shimmer-text' : ''
                }`}
              >
                {statusLabel}
              </span>
            </span>

            {/* Sélecteur de profil de comportement */}
            {onSelectProfile && (
              <ProfileSwitcher
                activeId={activeProfileId}
                connected={connected}
                reduceMotion={reduceMotion}
                onSelect={onSelectProfile}
              />
            )}
          </div>
        </div>
      </div>

      {/* Zone droite : Barre d'actions épurée sans chevauchement */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Groupe d'outils principaux */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-input) 60%, transparent)',
            border: '1px solid var(--border-base)',
          }}
        >
          {/* Recherche */}
          {messageCount > 0 && (
            <motion.button
              type="button"
              onClick={onToggleSearch}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-active)]"
              title="Rechercher (Ctrl+F)"
              aria-label="Rechercher dans la conversation"
            >
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
            </motion.button>
          )}

          {/* Journal des modifications appliquées */}
          {onToggleChangeLog && changeLogCount > 0 && (
            <motion.button
              type="button"
              onClick={onToggleChangeLog}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="relative w-6.5 h-6.5 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-active)]"
              title="Modifications appliquées"
              aria-label="Afficher les modifications appliquées"
              aria-pressed={showChangeLog}
              style={{
                backgroundColor: showChangeLog
                  ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)'
                  : 'transparent',
              }}
            >
              <History
                size={14}
                style={{ color: showChangeLog ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              />
              <span
                className="absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-full text-[8.5px] font-bold leading-none pointer-events-none shadow-sm"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--bg-base, #0a1628)',
                }}
              >
                {changeLogCount > 9 ? '9+' : changeLogCount}
              </span>
            </motion.button>
          )}

          {/* Mute (microphone vocal) */}
          {connected && (
            <motion.button
              type="button"
              onClick={onToggleMute}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-active)]"
              title={muted ? 'Activer le micro' : 'Désactiver le micro'}
              aria-label={muted ? 'Activer le micro' : 'Désactiver le micro'}
            >
              {muted ? (
                <MicOff size={14} style={{ color: 'var(--color-warning)' }} />
              ) : (
                <Mic size={14} style={{ color: 'var(--color-success)' }} />
              )}
            </motion.button>
          )}

          {/* Bascule saisie clavier / vocale */}
          <motion.button
            type="button"
            onClick={onToggleInput}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-active)]"
            title={showInput ? 'Masquer la saisie' : 'Afficher la saisie'}
            aria-label={showInput ? 'Masquer la saisie' : 'Afficher la saisie'}
            aria-pressed={showInput}
            style={{
              backgroundColor: showInput
                ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)'
                : 'transparent',
            }}
          >
            <MessageSquare
              size={14}
              style={{ color: showInput ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            />
          </motion.button>

          {/* Menu Plus d'options */}
          <div className="relative" ref={menuRef}>
            <motion.button
              type="button"
              onClick={onToggleMenu}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-active)]"
              title="Plus d'options"
              aria-label="Plus d'options"
              aria-expanded={showMenu}
              style={{
                backgroundColor: showMenu
                  ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                  : 'transparent',
              }}
            >
              <MoreVertical
                size={14}
                style={{ color: showMenu ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              />
            </motion.button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1.5 w-52 max-w-[calc(100vw-24px)] rounded-xl overflow-hidden z-50 shadow-2xl"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-base)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
                  }}
                >
                  {messageCount > 0 && (
                    <>
                      <div className="px-3 pt-2 pb-1">
                        <span
                          className="text-xs uppercase tracking-widest font-semibold"
                          style={{ color: 'var(--text-dimmed)' }}
                        >
                          Conversation
                        </span>
                      </div>
                      <MenuButton
                        icon={<Search size={13} style={{ color: 'var(--accent-primary)' }} />}
                        label="Rechercher"
                        shortcut="⌘F"
                        onClick={onToggleSearch}
                      />
                      <ExportMenuSection onExport={onExport} />
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
                    <span
                      className="text-xs uppercase tracking-widest font-semibold"
                      style={{ color: 'var(--text-dimmed)' }}
                    >
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
                    <span
                      className="text-xs uppercase tracking-widest font-semibold"
                      style={{ color: 'var(--text-dimmed)' }}
                    >
                      Affichage
                    </span>
                  </div>

                  <MenuButton
                    icon={
                      fullscreen ? (
                        <Minimize2 size={13} style={{ color: 'var(--accent-primary)' }} />
                      ) : (
                        <Maximize2 size={13} style={{ color: 'var(--text-muted)' }} />
                      )
                    }
                    label={fullscreen ? 'Quitter plein écran' : 'Plein écran'}
                    onClick={onToggleFullscreen}
                  />
                  <MenuButton
                    icon={
                      <PanelRight
                        size={13}
                        style={{ color: docked ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                      />
                    }
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

        {/* Bouton Power : Connecter / Déconnecter */}
        <motion.button
          type="button"
          onClick={onToggleConnect}
          whileTap={reduceMotion ? undefined : { scale: 0.9 }}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          title={connected ? 'Déconnecter' : 'Connecter'}
          aria-label={connected ? 'Déconnecter' : 'Connecter'}
          style={{
            backgroundColor: connected
              ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
              : 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
            border: `1px solid ${
              connected
                ? 'color-mix(in srgb, var(--color-error) 24%, transparent)'
                : 'color-mix(in srgb, var(--accent-primary) 24%, transparent)'
            }`,
          }}
        >
          <Power size={14} style={{ color: connected ? 'var(--color-error)' : 'var(--accent-primary)' }} />
        </motion.button>

        {/* Bouton Fermer */}
        {showClose && onClose && (
          <motion.button
            type="button"
            onClick={onClose}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-active)]"
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


import { useState, useCallback, useEffect, memo } from 'react';
import { motion } from 'motion/react';
import {
  Send,
  Play,
  Square,
  RefreshCw,
  X,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Shield,
  Bell,
  Radio,
  LoaderCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface TelegramBotInfo {
  id: number;
  username: string;
  firstName: string;
}

export interface TelegramStatus {
  isRunning: boolean;
  isConfigured: boolean;
  botInfo: TelegramBotInfo | null;
  allowedUsersCount: number;
  autoStart: boolean;
  notificationsEnabled: boolean;
  defaultChatId?: string;
  lastError: string | null;
}

interface TelegramStatusModalProps {
  status: TelegramStatus | null;
  onClose: () => void;
  onStatusChange?: (newStatus: TelegramStatus) => void;
}

export const TelegramStatusModal = memo(function TelegramStatusModal({
  status: initialStatus,
  onClose,
  onStatusChange,
}: TelegramStatusModalProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TelegramStatus | null>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync when prop changes
  useEffect(() => {
    if (initialStatus) setStatus(initialStatus);
  }, [initialStatus]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setStatus(data.data);
          onStatusChange?.(data.data);
        }
      }
    } catch {
      setFeedback({ type: 'error', message: 'Impossible de joindre le serveur.' });
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  const handleStartBot = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/start', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(data.data);
        onStatusChange?.(data.data);
        window.dispatchEvent(new CustomEvent('Leanna-telegram-status-changed', { detail: data.data }));
        setFeedback({
          type: 'success',
          message: `Bot démarré avec succès ! (@${data.data?.botInfo?.username || 'bot'})`,
        });
      } else {
        if (data.data) {
          setStatus(data.data);
          onStatusChange?.(data.data);
        }
        setFeedback({ type: 'error', message: data.error || 'Impossible de démarrer le bot.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message || 'Erreur réseau.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopBot = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/stop', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(data.data);
        onStatusChange?.(data.data);
        window.dispatchEvent(new CustomEvent('Leanna-telegram-status-changed', { detail: data.data }));
        setFeedback({ type: 'success', message: 'Bot arrêté avec succès.' });
      } else {
        setFeedback({ type: 'error', message: data.error || 'Impossible d\'arrêter le bot.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message || 'Erreur réseau.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendTest = async () => {
    setTestLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFeedback({ type: 'success', message: 'Message de test envoyé sur Telegram ! 🎉' });
      } else {
        setFeedback({ type: 'error', message: data.error || 'Échec de l\'envoi du test.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message || 'Erreur réseau.' });
    } finally {
      setTestLoading(false);
    }
  };

  const handleGoToSettings = () => {
    onClose();
    navigate('/settings?section=telegram-settings');
  };

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isRunning = status?.isRunning ?? false;
  const isConfigured = status?.isConfigured ?? false;
  const botInfo = status?.botInfo;
  const lastError = status?.lastError;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="telegram-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: isRunning ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-hover)',
                color: isRunning ? 'var(--color-success)' : 'var(--text-muted)',
              }}
            >
              <Send size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="telegram-modal-title" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Bot Telegram
                </h3>
                {/* Status Badge */}
                {isRunning ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En ligne
                  </span>
                ) : lastError ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    Erreur
                  </span>
                ) : isConfigured ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    Arrêté
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Non configuré
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Contrôle à distance &amp; notifications
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={fetchStatus}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Actualiser le statut"
              aria-label="Actualiser le statut"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Fermer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Feedback alert */}
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl flex items-start gap-2.5 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{feedback.message}</span>
            </motion.div>
          )}

          {/* Last Error banner */}
          {lastError && !feedback && (
            <div className="p-3 rounded-xl flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold block">Erreur détectée :</span>
                <span className="font-mono text-[11px] break-all leading-normal opacity-90">{lastError}</span>
              </div>
            </div>
          )}

          {!isConfigured ? (
            /* Bot Non Configuré */
            <div
              className="p-4 rounded-xl border space-y-3"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)' }}
            >
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Aucun token API de bot Telegram n'est configuré. Pour activer le contrôle à distance et les notifications :
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <li>Créez un bot avec <span className="font-semibold text-white">@BotFather</span> sur Telegram</li>
                <li>Copiez le token API fourni</li>
                <li>Collez-le dans la section Paramètres → Bot Telegram</li>
              </ol>
              <button
                type="button"
                onClick={handleGoToSettings}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs transition-all shadow-sm"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
              >
                <Settings size={14} />
                Configurer le bot dans les Paramètres
              </button>
            </div>
          ) : (
            /* Bot Configuré */
            <div className="space-y-3">
              {/* Bot Info card */}
              <div
                className="p-3.5 rounded-xl border space-y-2.5"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)' }}
              >
                {botInfo ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {botInfo.firstName}
                      </div>
                      <a
                        href={`https://t.me/${botInfo.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono transition-opacity hover:opacity-80"
                        style={{ color: 'var(--accent-primary)' }}
                        title="Ouvrir sur Telegram"
                      >
                        @{botInfo.username}
                        <ExternalLink size={10} />
                      </a>
                    </div>
                    <span className="text-[11px] font-mono opacity-50">ID: {botInfo.id}</span>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Bot configuré (en attente de démarrage pour obtenir les détails du compte)
                  </div>
                )}

                <div className="pt-2 border-t grid grid-cols-2 gap-2 text-[11px]" style={{ borderColor: 'var(--border-base)' }}>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Shield size={12} className="opacity-70" />
                    <span>{status?.allowedUsersCount || 0} utilisateur(s) autorisé(s)</span>
                  </div>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Radio size={12} className="opacity-70" />
                    <span>Mode Polling</span>
                  </div>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Bell size={12} className="opacity-70" />
                    <span>Notifs : {status?.notificationsEnabled ? 'Activées' : 'Désactivées'}</span>
                  </div>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: status?.autoStart ? 'var(--color-success)' : 'var(--text-muted)' }} />
                    <span>Auto-start : {status?.autoStart ? 'Oui' : 'Non'}</span>
                  </div>
                </div>
              </div>

              {/* Bouton principal Démarrer / Arrêter */}
              <div className="pt-1 flex gap-2">
                {isRunning ? (
                  <button
                    type="button"
                    onClick={handleStopBot}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs transition-all border disabled:opacity-50"
                    style={{
                      backgroundColor: 'rgba(244, 63, 94, 0.12)',
                      borderColor: 'rgba(244, 63, 94, 0.3)',
                      color: 'rgb(251, 113, 133)',
                    }}
                  >
                    {actionLoading ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <Square size={14} fill="currentColor" />
                    )}
                    <span>Arrêter le bot Telegram</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartBot}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs transition-all disabled:opacity-50 shadow-sm"
                    style={{
                      backgroundColor: 'var(--color-success)',
                      color: '#ffffff',
                    }}
                  >
                    {actionLoading ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} fill="currentColor" />
                    )}
                    <span>Démarrer le bot Telegram</span>
                  </button>
                )}

                {/* Bouton de test (si en ligne) */}
                {isRunning && (
                  <button
                    type="button"
                    onClick={handleSendTest}
                    disabled={testLoading}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-medium text-xs transition-all border hover:bg-white/5 disabled:opacity-50"
                    style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)' }}
                    title="Envoyer un message de test sur Telegram"
                  >
                    {testLoading ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>Tester</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t text-xs"
          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <button
            type="button"
            onClick={handleGoToSettings}
            className="flex items-center gap-1.5 hover:underline transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <Settings size={13} />
            <span>Paramètres complets</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg border font-medium transition hover:bg-white/10"
            style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </div>
  );
});

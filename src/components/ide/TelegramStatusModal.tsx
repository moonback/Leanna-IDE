import { useState, useCallback, useEffect, memo } from 'react';
import { motion } from 'motion/react';
import {
  Send, Play, Square, RefreshCw, X, ExternalLink,
  AlertTriangle, CheckCircle2, Settings, Shield, Bell, Radio, LoaderCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';

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

  useEffect(() => { if (initialStatus) setStatus(initialStatus); }, [initialStatus]);

  const fetchStatus = useCallback(async () => {
    setLoading(true); setFeedback(null);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') { setStatus(data.data); onStatusChange?.(data.data); }
      }
    } catch { setFeedback({ type: 'error', message: 'Impossible de joindre le serveur.' }); }
    finally { setLoading(false); }
  }, [onStatusChange]);

  const handleStartBot = async () => {
    setActionLoading(true); setFeedback(null);
    try {
      const res = await fetch('/api/telegram/start', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(data.data); onStatusChange?.(data.data);
        window.dispatchEvent(new CustomEvent('Leanna-telegram-status-changed', { detail: data.data }));
        setFeedback({ type: 'success', message: `Bot démarré ! (@${data.data?.botInfo?.username || 'bot'})` });
      } else {
        if (data.data) { setStatus(data.data); onStatusChange?.(data.data); }
        setFeedback({ type: 'error', message: data.error || 'Impossible de démarrer le bot.' });
      }
    } catch (e: any) { setFeedback({ type: 'error', message: e.message || 'Erreur réseau.' }); }
    finally { setActionLoading(false); }
  };

  const handleStopBot = async () => {
    setActionLoading(true); setFeedback(null);
    try {
      const res = await fetch('/api/telegram/stop', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(data.data); onStatusChange?.(data.data);
        window.dispatchEvent(new CustomEvent('Leanna-telegram-status-changed', { detail: data.data }));
        setFeedback({ type: 'success', message: 'Bot arrêté avec succès.' });
      } else { setFeedback({ type: 'error', message: data.error || "Impossible d'arrêter le bot." }); }
    } catch (e: any) { setFeedback({ type: 'error', message: e.message || 'Erreur réseau.' }); }
    finally { setActionLoading(false); }
  };

  const handleSendTest = async () => {
    setTestLoading(true); setFeedback(null);
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.status === 'success') setFeedback({ type: 'success', message: 'Message de test envoyé sur Telegram ! 🎉' });
      else setFeedback({ type: 'error', message: data.error || "Échec de l'envoi du test." });
    } catch (e: any) { setFeedback({ type: 'error', message: e.message || 'Erreur réseau.' }); }
    finally { setTestLoading(false); }
  };

  const handleGoToSettings = () => { onClose(); navigate('/settings?section=telegram-settings'); };

  const isRunning    = status?.isRunning ?? false;
  const isConfigured = status?.isConfigured ?? false;
  const botInfo      = status?.botInfo;
  const lastError    = status?.lastError;

  // Derive tone from status
  const tone = lastError ? 'danger' : 'default';

  return (
    <Modal open onClose={onClose} size="sm" tone={tone}>
      <Modal.Header>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: isRunning ? 'var(--color-success-subtle)' : 'var(--bg-secondary)', color: isRunning ? 'var(--color-success)' : 'var(--text-muted)' }}
          >
            <Send size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Bot Telegram</h3>
              {isRunning ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold badge-success">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
                  En ligne
                </span>
              ) : lastError ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold badge-error">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-error)' }} />
                  Erreur
                </span>
              ) : isConfigured ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
                  Arrêté
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold badge-warning">
                  Non configuré
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Contrôle à distance &amp; notifications</p>
          </div>
        </div>
        {/* Refresh button in header actions area — before the auto-injected × */}
        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Actualiser le statut"
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </Modal.Header>

      <Modal.Body>
        <div className="space-y-4 text-xs">
          {/* Feedback alert */}
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl flex items-start gap-2.5 border ${feedback.type === 'success' ? 'badge-success' : 'badge-error'}`}
              role="alert"
            >
              {feedback.type === 'success'
                ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
              <span className="leading-relaxed">{feedback.message}</span>
            </motion.div>
          )}

          {/* Last error banner */}
          {lastError && !feedback && (
            <div className="p-3 rounded-xl flex items-start gap-2.5 badge-error border" role="alert">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold block">Erreur détectée :</span>
                <span className="font-mono text-xs break-all leading-normal opacity-90">{lastError}</span>
              </div>
            </div>
          )}

          {!isConfigured ? (
            <div className="p-4 rounded-xl border space-y-3" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Aucun token API de bot Telegram n'est configuré. Pour activer le contrôle à distance et les notifications :
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <li>Créez un bot avec <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>@BotFather</span> sur Telegram</li>
                <li>Copiez le token API fourni</li>
                <li>Collez-le dans la section Paramètres → Bot Telegram</li>
              </ol>
              <Button variant="primary" fullWidth size="sm" onClick={handleGoToSettings} iconLeft={<Settings size={14} />}>
                Configurer le bot dans les Paramètres
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Bot info card */}
              <div className="p-3.5 rounded-xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)' }}>
                {botInfo ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{botInfo.firstName}</div>
                      <a href={`https://t.me/${botInfo.username}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono transition-opacity hover:opacity-80"
                        style={{ color: 'var(--accent-primary)' }}>
                        @{botInfo.username} <ExternalLink size={10} />
                      </a>
                    </div>
                    <span className="text-xs font-mono opacity-50">ID: {botInfo.id}</span>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Bot configuré (en attente de démarrage pour obtenir les détails du compte)
                  </div>
                )}
                <div className="pt-2 border-t grid grid-cols-2 gap-2 text-xs" style={{ borderColor: 'var(--border-base)' }}>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Shield size={12} className="opacity-70" />
                    <span>{status?.allowedUsersCount || 0} utilisateur(s) autorisé(s)</span>
                  </div>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Radio size={12} className="opacity-70" /> <span>Mode Polling</span>
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

              {/* Start / Stop + Test */}
              <div className="flex gap-2">
                {isRunning ? (
                  <Button
                    variant="danger-ghost"
                    fullWidth size="sm"
                    loading={actionLoading}
                    onClick={handleStopBot}
                    iconLeft={<Square size={14} fill="currentColor" />}
                  >
                    Arrêter le bot Telegram
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    fullWidth size="sm"
                    loading={actionLoading}
                    onClick={handleStartBot}
                    iconLeft={<Play size={14} fill="currentColor" />}
                    style={{ backgroundColor: 'var(--color-success)', borderColor: 'transparent' } as React.CSSProperties}
                  >
                    Démarrer le bot Telegram
                  </Button>
                )}
                {isRunning && (
                  <Button
                    variant="secondary" size="sm"
                    loading={testLoading}
                    onClick={handleSendTest}
                    iconLeft={<Send size={13} />}
                    aria-label="Envoyer un message de test sur Telegram"
                  >
                    Tester
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer align="between">
        <button
          type="button"
          onClick={handleGoToSettings}
          className="flex items-center gap-1.5 text-xs hover:underline transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <Settings size={13} /> <span>Paramètres complets</span>
        </button>
        <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
      </Modal.Footer>
    </Modal>
  );
});

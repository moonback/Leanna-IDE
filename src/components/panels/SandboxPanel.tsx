import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Box, RefreshCw, Upload, Trash2, Loader2, CheckCircle2,
  XCircle, Power, Lock, ShieldCheck,
  GitCompareArrows, FileCode2,
  ChevronDown, RotateCcw, X,
} from 'lucide-react';
import { useSandboxWatcher } from '../../hooks/useSandboxWatcher';

interface SandboxStatus {
  active: boolean;
  path: string;
  modifiedFiles: string[];
  modifiedCount: number;
  lastSync: string | null;
  exists: boolean;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('jarvis_api_token');
  return token ? { 'x-jarvis-token': token } : {};
}

interface SandboxPanelProps {
  onOpenDiff: (initialFile: string | null) => void;
}

/**
 * SandboxPanel — Panneau de contrôle du workspace sandbox.
 * Design épuré, suivi d'état clair, tooltips, fichiers cliquables.
 */
export function SandboxPanel({ onOpenDiff }: SandboxPanelProps) {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [securityCode, setSecurityCode] = useState('');
  const [showResetCodeInput, setShowResetCodeInput] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);
  const resetCodeRef = useRef<HTMLInputElement>(null);
  const hasFetched = useRef(false);
  const [showModifiedFiles, setShowModifiedFiles] = useState(false);
  const [showAdvancedActions, setShowAdvancedActions] = useState(false);

  // Motion : spring critically-damped par défaut, fondu court si l'utilisateur
  // a demandé moins de mouvement — même convention que NotebookDetail /
  // GeneratePanel, pour une texture de mouvement cohérente dans toute l'app.
  const reduceMotion = useReducedMotion();
  const spring = reduceMotion
    ? { duration: 0.15, ease: 'easeOut' as const }
    : { type: 'spring' as const, bounce: 0, duration: 0.3 };
  const hoverSpring = reduceMotion
    ? { duration: 0.1 }
    : { type: 'spring' as const, stiffness: 400, damping: 25 };

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sandbox/status', { headers: authHeaders() });
      const data = await res.json();
      if (data.status === 'success') setStatus(data.sandbox);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (showCodeInput && codeInputRef.current) {
      codeInputRef.current.focus();
      return;
    }
    if (showResetCodeInput && resetCodeRef.current) {
      resetCodeRef.current.focus();
    }
  }, [showCodeInput, showResetCodeInput]);

  useSandboxWatcher({
    enabled: status?.active ?? false,
    onFileChanged: useCallback((_rp: string) => {
      fetchStatus();
    }, [fetchStatus]),
    onTreeChanged: useCallback(() => {
      fetchStatus();
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    }, [fetchStatus]),
    onFileDeleted: useCallback((_rp: string) => {
      fetchStatus();
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    }, [fetchStatus]),
  });

  const doAction = useCallback(async (action: string, method = 'POST', body?: object) => {
    setBusy(action);
    setFeedback(null);
    try {
      const headers: Record<string, string> = {
        ...authHeaders(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      };
      const res = await fetch(`/api/sandbox/${action}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json();
      if (data.status === 'success') {
        setFeedback({ type: 'success', msg: actionMessages[action] || 'OK' });
        window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
        setShowCodeInput(false);
        setSecurityCode('');
      } else if (data.status === 'validation_failed') {
        setFeedback({ type: 'error', msg: 'Synchronisation refusée' });
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Erreur' });
      }
      await fetchStatus();
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Erreur réseau' });
    } finally { setBusy(null); }
  }, [fetchStatus]);

  const handleDeactivate = useCallback(() => {
    if (!showCodeInput) {
      setShowCodeInput(true);
      setSecurityCode('');
      setShowResetCodeInput(false);
      setFeedback(null);
      return;
    }
    if (securityCode.length !== 6) {
      setFeedback({ type: 'error', msg: '6 chiffres requis' });
      return;
    }
    doAction('deactivate', 'POST', { code: securityCode });
  }, [showCodeInput, securityCode, doAction]);

  const handleReset = useCallback(() => {
    if (!showResetCodeInput) {
      setShowResetCodeInput(true);
      setResetCode('');
      setShowCodeInput(false);
      setFeedback(null);
      return;
    }
    if (resetCode.length !== 6) {
      setFeedback({ type: 'error', msg: '6 chiffres requis' });
      return;
    }
    doAction('reset', 'POST', { code: resetCode });
  }, [showResetCodeInput, resetCode, doAction]);

  const actionMessages: Record<string, string> = {
      init: 'Sandbox initialisé',
      activate: 'Sandbox activé',
      deactivate: 'Sandbox désactivé',
      sync: 'Synchronisation réussie',
      discard: 'Modifications abandonnées',
      reset: 'Sandbox réinitialisé',
    };

  // Feedback : auto-dismiss après 4s, mais l'utilisateur garde la main pour
  // le fermer plus tôt (agence) — surtout utile s'il veut relire une erreur.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center gap-2 py-10" style={{ color: 'var(--text-dimmed)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[11px]">Chargement…</span>
      </div>
    );
  }

  return (
    <>
    <motion.div
      className="flex flex-col gap-4 p-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >

      {/* ═══ Vue d'ensemble ═══ */}
      <motion.div
        className="rounded-xl border px-3 py-3 flex items-center gap-3 shadow-sm"
        style={{
          borderColor: status?.active ? 'rgba(74,222,128,0.28)' : 'var(--border-base)',
          backgroundColor: status?.active ? 'rgba(74,222,128,0.055)' : 'var(--bg-input)',
          transition: 'border-color 0.3s ease, background-color 0.3s ease',
        }}
        layout
      >
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: status?.active ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)' }}
        >
          <Box size={15} style={{ color: status?.active ? 'var(--color-success)' : 'var(--text-dimmed)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {status?.active ? 'Sandbox actif' : 'Sandbox inactif'}
            </span>
            {status?.active && <ShieldCheck size={12} style={{ color: 'var(--color-success)' }} />}
          </div>
          {/* Le compteur change parfois en arrière-plan (watcher de fichiers) sans
              action explicite de l'utilisateur : un léger fade sur le changement
              de valeur rend ce statut silencieux visible sans être bruyant. */}
          <div className="mt-0.5 h-4 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={status?.modifiedCount ?? 0}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={spring}
                className="text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {status?.modifiedCount ?? 0} modification{(status?.modifiedCount ?? 0) > 1 ? 's' : ''}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          className="p-1.5 rounded-lg hover:bg-white/8 active:scale-95 transition-all duration-150"
          title="Rafraîchir l'état du sandbox"
          aria-label="Rafraîchir l'état du sandbox"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
        </button>
      </motion.div>

      {/* ═══ Quick actions — compact row ═══ */}
      <div className="flex flex-col gap-1.5">

        {/* Deactivate */}
        {status?.active && (
          <ActionRow
            icon={<Lock size={12} />}
            label="Désactiver"
            color="var(--color-warning)"
            onClick={handleDeactivate}
            busy={busy === 'deactivate'}
            tooltip="Entrez un code à 6 chiffres pour désactiver le sandbox"
            transition={hoverSpring}
          />
        )}

        {/* Activate */}
        {status?.exists && !status.active && (
          <ActionRow
            icon={<Power size={12} />}
            label="Activer"
            color="var(--color-success)"
            onClick={() => doAction('activate')}
            busy={busy === 'activate'}
            tooltip="Isoler les écritures dans le sandbox"
            transition={hoverSpring}
          />
        )}

        {/* Init */}
        {!status?.exists && (
          <ActionRow
            icon={<Box size={12} />}
            label="Initialiser"
            color="var(--accent-primary)"
            onClick={() => doAction('init')}
            busy={busy === 'init'}
            tooltip="Copier le code source dans un espace isolé"
            transition={hoverSpring}
          />
        )}

        {/* Security code input */}
        <AnimatePresence>
          {showCodeInput && status?.active && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-input)' }}>
                <input
                  ref={codeInputRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Code 6 chiffres"
                  value={securityCode}
                  onChange={(e) => setSecurityCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDeactivate();
                    if (e.key === 'Escape') { setShowCodeInput(false); setSecurityCode(''); }
                  }}
                  className="flex-1 bg-transparent outline-none text-[11px] font-mono tracking-[0.25em] text-center"
                  style={{ color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleDeactivate}
                  disabled={securityCode.length !== 6}
                  className="text-[9px] font-bold px-2 py-1 rounded transition-opacity disabled:opacity-30"
                  style={{ color: 'var(--color-warning)' }}
                >
                  OK
                </button>
                <button
                  onClick={() => { setShowCodeInput(false); setSecurityCode(''); }}
                  className="text-[9px] px-1 py-0.5 rounded hover:bg-white/10"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
          {showResetCodeInput && status?.exists && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-input)' }}>
                <input
                  ref={resetCodeRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Code 6 chiffres"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleReset();
                    if (e.key === 'Escape') { setShowResetCodeInput(false); setResetCode(''); }
                  }}
                  className="flex-1 bg-transparent outline-none text-[11px] font-mono tracking-[0.25em] text-center"
                  style={{ color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleReset}
                  disabled={resetCode.length !== 6}
                  className="text-[9px] font-bold px-2 py-1 rounded transition-opacity disabled:opacity-30"
                  style={{ color: 'var(--color-warning)' }}
                >
                  OK
                </button>
                <button
                  onClick={() => { setShowResetCodeInput(false); setResetCode(''); }}
                  className="text-[9px] px-1 py-0.5 rounded hover:bg-white/10"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ Changements ═══ */}
        {status?.active && status.modifiedCount > 0 && (
          <>
            <div className="h-px my-1" style={{ backgroundColor: 'var(--border-base)' }} />
            <ActionRow
              icon={<GitCompareArrows size={12} />}
              label="Examiner les modifications"
              color="var(--color-info)"
              onClick={() => onOpenDiff(null)}
              busy={false}
              tooltip="Comparer avant/après, accepter ou rejeter fichier par fichier"
              highlight
              transition={hoverSpring}
            />
          </>
        )}

        {/* ═══ Actions avancées ═══ */}
        {status?.exists && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedActions(value => !value)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
              aria-expanded={showAdvancedActions}
            >
              <span>Actions avancées</span>
              <ChevronDown
                size={13}
                style={{ transform: showAdvancedActions ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }}
              />
            </button>
            <AnimatePresence initial={false}>
              {showAdvancedActions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={spring}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1 pt-1">
                    {status.active && status.modifiedCount > 0 && (
                      <ActionRow
                        icon={<Upload size={12} />}
                        label="Synchroniser tout"
                        color="var(--color-success)"
                        onClick={() => doAction('sync')}
                        busy={busy === 'sync'}
                        tooltip="Appliquer toutes les modifications au repo principal"
                        transition={hoverSpring}
                      />
                    )}
                    {status.active && status.modifiedCount > 0 && (
                      <ActionRow
                        icon={<Trash2 size={12} />}
                        label="Tout rejeter"
                        color="var(--color-error)"
                        onClick={() => doAction('discard')}
                        busy={busy === 'discard'}
                        tooltip="Supprimer toutes les modifications et réinitialiser le sandbox"
                        transition={hoverSpring}
                      />
                    )}
                    <ActionRow
                      icon={<RotateCcw size={12} />}
                      label="Réinitialiser le sandbox"
                      color="var(--color-warning)"
                      onClick={handleReset}
                      busy={busy === 'reset'}
                      tooltip="Écraser le sandbox avec une copie fraîche du code source (code requis)"
                      transition={hoverSpring}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ═══ Modified files — clickable to open diff ═══ */}
      {status?.active && status.modifiedFiles.length > 0 && (
        <div className="mt-1 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-base)' }}>
          <button
            type="button"
            onClick={() => setShowModifiedFiles(value => !value)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/5"
            aria-expanded={showModifiedFiles}
          >
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Fichiers modifiés
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-input)' }}>
                {status.modifiedFiles.length}
              </span>
              <ChevronDown size={13} style={{ color: 'var(--text-dimmed)', transform: showModifiedFiles ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }} />
            </span>
          </button>
          {showModifiedFiles && (
            <AnimatePresence initial={false}>
            <motion.div
              key="modified-files-list"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
            <div className="space-y-0.5 max-h-44 overflow-y-auto custom-scrollbar px-1.5 pb-1.5">
            {status.modifiedFiles.map(f => {
              const Icon = FileCode2;

              return (
                <button
                  key={f}
                  onClick={() => onOpenDiff(f)}
                  className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all hover:bg-white/5"
                  style={{ borderLeft: '2px solid transparent' }}
                >
                  <Icon size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <span className="text-[10px] font-mono truncate flex-1 transition-colors group-hover:text-[var(--text-primary)]" style={{ color: 'var(--text-secondary)' }}>
                    {f}
                  </span>
                </button>
              );
            })}
            </div>
            </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}


      {/* ═══ Last sync ═══ */}
      {status?.lastSync && (
        <p className="text-[9px] text-center mt-1" style={{ color: 'var(--text-dimmed)' }}>
          Sync : {new Date(status.lastSync).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
        </p>
      )}

      {/* ═══ Feedback ═══ */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={spring}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-medium"
            style={{
              backgroundColor: feedback.type === 'success'
                ? 'color-mix(in srgb, var(--color-success) 8%, transparent)'
                : 'color-mix(in srgb, var(--color-error) 8%, transparent)',
              color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
            <span className="flex-1">{feedback.msg}</span>
            {/* Fermeture manuelle anticipée — l'utilisateur garde la main plutôt
                que de subir les 4s d'auto-dismiss, notamment pour relire une erreur. */}
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors active:scale-90"
              aria-label="Fermer"
            >
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </>
  );
}

// ── ActionRow — compact button with icon, label, tooltip ─────────────────────

function ActionRow({ icon, label, color, onClick, busy, tooltip, highlight, transition }: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  busy: boolean;
  tooltip: string;
  highlight?: boolean;
  transition: { type: 'spring'; stiffness: number; damping: number } | { duration: number };
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      whileTap={{ scale: 0.97 }}
      whileHover={{ x: 2 }}
      transition={transition}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all disabled:opacity-50 w-full group hover:bg-white/5"
      style={{
        backgroundColor: highlight
          ? `color-mix(in srgb, ${color} 10%, transparent)`
          : 'transparent',
        border: highlight
          ? `1px solid color-mix(in srgb, ${color} 22%, transparent)`
          : '1px solid transparent',
      }}
      title={tooltip}
    >
      <div
        className="flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0 transition-all duration-150 group-hover:scale-110 group-hover:shadow-sm"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : icon}
      </div>
      <span className="text-[11px] font-medium transition-colors group-hover:text-[var(--text-primary)]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </motion.button>
  );
}
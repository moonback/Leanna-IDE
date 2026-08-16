import { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  LoaderCircle,
  Hash,
  AlertTriangle,
  GitFork,
  BrainCircuit,
  FileText,
  RefreshCcw,
  X,
  Users,
  Radio,
  ScrollText,
} from 'lucide-react';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import { useProfile } from '../../context/UserProfileContext';
import { TokenDetailModal } from './TokenDetailModal';
import { ModelPickerModal } from './ModelPickerModal';
import { formatExactTokenCount, formatTokenCount } from '../../utils/tokenFormatting';

// ── Types ──────────────────────────────────────────────────────────────────

interface StatusBarProps {
  filePath?: string | null;
  language?: string;
  line?: number;
  column?: number;
  dirty?: boolean;
  encoding?: string;
  assistantBusy?: boolean;
  onToggleMcp?: () => void;
  onToggleSandbox?: () => void;
  onToggleAgents?: () => void;
  onToggleFleet?: () => void;
  onToggleLogs?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getModifierKey(): string {
  return navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
}

// ── StatusBar Component ────────────────────────────────────────────────────

export const StatusBar = memo(function StatusBar({
  filePath,
  line,
  column,
  dirty,
  encoding = 'UTF-8',
  assistantBusy,
  onToggleMcp,
  onToggleSandbox,
  onToggleAgents,
  onToggleFleet,
  onToggleLogs,
}: StatusBarProps) {
  const { tokenUsage, promptContext } = useLiveAPIContext();
  const { profile } = useProfile();


  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const resetInputRef = useRef<HTMLInputElement | null>(null);

  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [branches, setBranches] = useState<Array<{ name: string; current: boolean }>>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchSwitching, setBranchSwitching] = useState<string | null>(null);
  
  const [mcpStatus, setMcpStatus] = useState<'ok' | 'error' | 'loading'>('loading');
  const [sandboxActive, setSandboxActive] = useState(false);

  const modifierKey = getModifierKey();
  const sandboxLabel = sandboxActive ? 'Sandbox' : 'Sandbox';

  // ── Git ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchBranch = async () => {
      try {
        const token = localStorage.getItem('jarvis_api_token');
        const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
        const res = await fetch('/api/git/status', { headers });
        const data = await res.json();
        if (!cancelled && data.status === 'success' && data.branch) {
          setGitBranch(data.branch);
        }
      } catch {
        /* silent */
      }
    };
    fetchBranch();
    const interval = setInterval(fetchBranch, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const loadBranches = useCallback(async () => {
    setBranchLoading(true);
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
      const res = await fetch('/api/git/branches', { headers });
      const data = await res.json();
      if (data.status === 'success' && data.branches) {
        setBranches(data.branches);
      }
    } catch {
      /* silent */
    } finally {
      setBranchLoading(false);
    }
  }, []);

  const switchBranch = useCallback(async (branchName: string) => {
    setBranchSwitching(branchName);
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { 'x-jarvis-token': token } : {}),
      };
      const res = await fetch('/api/git/switch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ branch: branchName }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setGitBranch(branchName);
        setShowBranchPicker(false);
      }
    } catch {
      /* silent */
    } finally {
      setBranchSwitching(null);
    }
  }, []);

  // ── MCP ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchMcp = async () => {
      try {
        const token = localStorage.getItem('jarvis_api_token');
        const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
        const res = await fetch('/api/mcp/status', { headers });
        const data = await res.json();
        if (!cancelled) {
          setMcpStatus(data.status === 'success' ? 'ok' : 'error');
        }
      } catch {
        if (!cancelled) setMcpStatus('error');
      }
    };
    fetchMcp();
    const interval = setInterval(fetchMcp, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ── Build ──────────────────────────────────────────────────────────────────


  // ── Sandbox ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchSandbox = async () => {
      try {
        const token = localStorage.getItem('jarvis_api_token');
        const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
        const res = await fetch('/api/sandbox/status', { headers });
        const data = await res.json();
        if (!cancelled && data.status === 'success') {
          setSandboxActive(data.sandbox?.active ?? false);
        }
      } catch {
        /* silent */
      }
    };
    fetchSandbox();
    const interval = setInterval(fetchSandbox, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleConfirmReset = useCallback(async () => {
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { 'x-jarvis-token': token } : {}),
      };
      const res = await fetch('/api/sandbox/reset', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: resetCode }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowResetConfirm(false);
        setResetCode('');
        window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
      }
    } catch {
      /* silent */
    }
  }, [resetCode]);

  useEffect(() => {
    if (!showResetConfirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowResetConfirm(false);
        setResetCode('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showResetConfirm]);

  useEffect(() => {
    if (showResetConfirm) {
      resetInputRef.current?.focus();
    }
  }, [showResetConfirm]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const { suggestion } = promptContext;

  return (
    <>
      <div
        className="group/bar flex items-center gap-3 px-4 h-8 border-t select-none text-[11px]"
        style={{
          borderColor: 'var(--border-base)',
          backgroundColor: 'var(--bg-secondary)',
          boxShadow: '0 -1px 4px rgba(0,0,0,0.04)',
        }}
      >
        {/* ─── Zone gauche : Git · Sandbox · Build · AI ─────────────────── */}
        <div className="flex items-center gap-3">
          {/* Branch */}
          <div className="relative">
            <button
              onClick={() => {
                if (!showBranchPicker) loadBranches();
                setShowBranchPicker((prev) => !prev);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))] active:scale-[0.97]"
              style={{ color: 'var(--text-primary)' }}
            >
              <GitFork size={12} strokeWidth={2} style={{ color: 'var(--accent-primary)' }} />
              <span className="truncate max-w-[120px]">{gitBranch || '…'}</span>
            </button>

            {showBranchPicker && (
              <div
                className="absolute bottom-full left-0 mb-2 w-48 max-h-60 overflow-y-auto rounded-lg border shadow-lg z-50"
                style={{
                  backgroundColor: 'var(--bg-ctrl)',
                  borderColor: 'var(--border-base)',
                  boxShadow: '0 4px 12px var(--bg-shadow)',
                }}
              >
                {branchLoading ? (
                  <div className="p-3 text-center text-xs text-[var(--text-muted)] flex items-center gap-2 justify-center">
                    <LoaderCircle size={10} className="animate-spin" />
                    Chargement...
                  </div>
                ) : branches.length === 0 ? (
                  <div className="p-3 text-center text-xs text-[var(--text-muted)]">Aucune branche.</div>
                ) : (
                  branches.map((b) => (
                    <button
                      key={b.name}
                      onClick={() => switchBranch(b.name)}
                      disabled={b.current || branchSwitching === b.name}
                      className="flex items-center w-full px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-gray-100/10 disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ color: b.current ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                    >
                      {branchSwitching === b.name ? (
                        <LoaderCircle size={10} className="animate-spin mr-2" />
                      ) : (
                        <GitFork size={10} className="mr-2" style={{ opacity: b.current ? 1 : 0.4 }} />
                      )}
                      <span className="truncate">{b.name}</span>
                      {b.current && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Séparateur */}
          <div className="w-px h-4 bg-[var(--border-base)] opacity-40" />

          {/* Sandbox — dot + label */}
          <button
            type="button"
            onClick={() => onToggleSandbox?.()}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))]"
            title={sandboxActive ? 'Sandbox actif' : 'Sandbox inactif'}
          >
            <div className={`w-2 h-2 rounded-full ${sandboxActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span style={{ color: sandboxActive ? 'var(--color-success, #059669)' : 'var(--text-muted)' }} className="font-medium">
              {sandboxLabel}
            </span>
          </button>


          {/* Séparateur */}
          <div className="w-px h-4 bg-[var(--border-base)] opacity-40" />

          {/* AI Model — compact, clickable */}
          <button
            type="button"
            onClick={() => setShowModelPicker(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))]"
            style={{ color: 'var(--text-muted)' }}
            title="Changer de modèle IA"
          >
            <BrainCircuit size={12} />
            <span className="font-medium truncate max-w-[100px]">
              {profile.textProvider === 'openrouter'
                ? profile.openrouterModel.split('/').pop()
                : 'Gemini Live'}
            </span>
          </button>

          {/* MCP dot */}
          <button
            type="button"
            onClick={onToggleMcp}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))]"
            title={`MCP: ${mcpStatus}`}
          >
            <div className={`w-2 h-2 rounded-full ${
              mcpStatus === 'ok' ? 'bg-emerald-500' :
              mcpStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
            }`} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">MCP</span>
          </button>

          {/* Agents */}
          <button
            type="button"
            onClick={onToggleAgents}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))]"
            title="Ouvrir le panneau Agents"
          >
            <Users size={12} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">Agents</span>
          </button>

          {/* Fleet */}
          <button
            type="button"
            onClick={onToggleFleet}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))]"
            title="Ouvrir la flotte d'agents"
          >
            <Radio size={12} style={{ color: '#a78bfa' }} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">Flotte</span>
          </button>

          {/* Logs */}
          <button
            type="button"
            onClick={onToggleLogs}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))]"
            title="Ouvrir les logs de l'assistant et des agents"
          >
            <ScrollText size={12} style={{ color: '#38bdf8' }} />
            <span style={{ color: 'var(--text-muted)' }} className="font-medium">Logs</span>
          </button>
        </div>

        {/* ─── Spacer ───────────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ─── Zone droite : Tokens · Status · Édition · Shortcut ───────── */}
        <div className="flex items-center gap-3">
          {/* Busy indicator */}
          {assistantBusy && (
            <span className="flex items-center gap-1.5 text-amber-600 font-medium">
              <LoaderCircle size={11} className="animate-spin" />
              <span>Traitement…</span>
            </span>
          )}

          {/* File state */}
          {filePath && (
            <span className="flex items-center gap-1.5 font-medium">
              {dirty ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span style={{ color: 'var(--color-warning, #d97706)' }}>Modifié</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span style={{ color: 'var(--color-success, #059669)' }}>Sauvé</span>
                </>
              )}
            </span>
          )}

          {/* Séparateur */}
          <div className="w-px h-4 bg-[var(--border-base)] opacity-40" />

          {/* Tokens — clickable */}
          <button
            type="button"
            onClick={() => setShowDetailModal(true)}
            className="relative flex items-center gap-2.5 px-2 py-1 rounded transition-colors duration-150 hover:bg-[var(--bg-hover,rgba(128,128,128,0.12))]"
            style={{ color: 'var(--text-muted)' }}
            title={`Tokens : ${formatExactTokenCount(tokenUsage.totalTokens)} · Contexte : ${formatExactTokenCount(promptContext.currentSize)} / ${formatExactTokenCount(promptContext.maxSize)}`}
          >
            <span className="flex items-center gap-1 tabular-nums font-semibold">
              <Hash size={10} className="opacity-50" />
              {tokenUsage.totalTokens > 0 ? formatTokenCount(tokenUsage.totalTokens) : '—'}
            </span>
            <span className="flex items-center gap-1 tabular-nums font-semibold">
              <FileText size={10} className="opacity-50" />
              {formatTokenCount(promptContext.currentSize)}/{formatTokenCount(promptContext.maxSize)}
            </span>
            {suggestion && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          {/* Séparateur */}
          <div className="w-px h-4 bg-[var(--border-base)] opacity-40" />

          {/* Édition */}
          <div className="flex items-center gap-2 font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
            <span>{encoding}</span>
            <span>LF</span>
            {typeof line === 'number' && typeof column === 'number' && (
              <button
                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ...(navigator.platform.includes('Mac') ? { metaKey: true } : { ctrlKey: true }) }))}
                className="hover:text-[var(--text-primary)] transition-colors duration-150"
                title="Aller à la ligne..."
              >
                Ln {line}, Col {column}
              </button>
            )}
          </div>

          {/* Séparateur */}
          <div className="w-px h-4 bg-[var(--border-base)] opacity-40" />

          {/* Reset — discret, visible on hover */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity duration-300 hover:bg-amber-500/10 hover:text-amber-600"
            style={{ color: 'var(--text-muted)' }}
            title="Réinitialiser le sandbox"
          >
            <RefreshCcw size={10} strokeWidth={1.8} />
            <span className="hidden sm:inline font-medium">Reset</span>
          </button>

          {/* Command palette shortcut */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }))}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono transition-colors duration-150 hover:text-[var(--text-primary)]"
            style={{ color: 'var(--text-dimmed)' }}
          >
            <kbd className="opacity-60">{modifierKey}</kbd>
            <kbd className="font-semibold">P</kbd>
          </button>
        </div>
      </div>

      {showResetConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/40"
          onClick={() => {
            setShowResetConfirm(false);
            setResetCode('');
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
        >
          <div
            className="w-full max-w-sm rounded-2xl border shadow-2xl transition-all duration-300"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(251,146,60,0.12)' }}>
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div className="text-left">
                  <h3 id="reset-confirm-title" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Confirmer la réinitialisation
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Supprimez toutes les modifications en cours et restaurez l'état d'origine.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowResetConfirm(false); setResetCode(''); }}
                className="p-2 rounded-lg hover:bg-white/10 transition"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Fermer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Entrez le code de confirmation pour valider la réinitialisation du sandbox.
              </p>
              <input
                ref={resetInputRef}
                type="text"
                maxLength={6}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' && resetCode.length === 6) handleConfirmReset();
                  if (e.key === 'Escape') {
                    setShowResetConfirm(false);
                    setResetCode('');
                  }
                }}
                value={resetCode}
                className="w-full rounded-xl border px-4 py-3 text-center text-sm font-mono tracking-[0.45em] outline-none transition-colors"
                style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                placeholder="000000"
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border-base)' }}>
              <button
                type="button"
                onClick={() => { setShowResetConfirm(false); setResetCode(''); }}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-white/10"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={resetCode.length !== 6}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--color-warning)', color: '#ffffff' }}
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && <TokenDetailModal onClose={() => setShowDetailModal(false)} />}
      {showModelPicker && <ModelPickerModal onClose={() => setShowModelPicker(false)} />}
    </>
  );
});
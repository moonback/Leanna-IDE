import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, GitBranch, CheckCircle2, AlertTriangle, RefreshCw,
  FolderOpen, Save, Loader2, Upload, ShieldAlert, X, Check,
} from 'lucide-react';
import { Section, Field, InfoRow } from './SettingsPrimitives';
import { ideApi } from '../../services/ideApi';

interface SelfRootStatus {
  rootPath: string;
  locked: boolean;
  gitBranch: string;
  gitStatus: 'clean' | 'dirty' | 'unknown';
  lastCommit: string;
  lastCommitDate: string;
  aheadBehind: { ahead: number; behind: number };
}

const FALLBACK_STATUS: SelfRootStatus = {
  rootPath: '(en attente du serveur)',
  locked: true,
  gitBranch: '—',
  gitStatus: 'unknown',
  lastCommit: '—',
  lastCommitDate: '—',
  aheadBehind: { ahead: 0, behind: 0 },
};

/** Access Electron API if available (desktop mode) */
function getElectronAPI(): { selectFolder: () => Promise<string | null> } | null {
  const w = window as any;
  return w.electronAPI?.selectFolder ? w.electronAPI : null;
}

export function SelfRootSection() {
  const [status, setStatus] = useState<SelfRootStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const hasFetched = useRef(false);

  // Local confirmation modal — replaces WS-based confirm for manual repo changes
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/self-root/status');
      if (res.status === 429) {
        setError('Rate limit — réessayez dans quelques secondes.');
        if (!status) setStatus(FALLBACK_STATUS);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setPathInput(data.rootPath || '');
    } catch (e: any) {
      setError(e.message || 'Impossible de récupérer le statut');
      if (!status) setStatus(FALLBACK_STATUS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStatus();
  }, [fetchStatus]);

  // Step 1: show local confirm modal before hitting the API
  const handleSave = useCallback(() => {
    const trimmed = pathInput.trim();
    if (!trimmed || trimmed === status?.rootPath) return;
    setPendingPath(trimmed);
  }, [pathInput, status]);

  // Step 2: user confirmed → actually call the API (with bypass flag)
  const handleConfirmed = useCallback(async () => {
    if (!pendingPath) return;
    const trimmed = pendingPath;
    setPendingPath(null);
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed, userConfirmed: true }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFeedback({ type: 'success', msg: `Repo changé → ${data.newRoot}` });
        // Invalide les caches IDE pour forcer un rechargement depuis le nouveau repo
        ideApi.invalidateCache();
        // Reload file tree in IDE + notify workspace change
        window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
        window.dispatchEvent(new CustomEvent('jarvis-workspace-changed', { detail: { workspace: data.newRoot } }));
        setTimeout(() => fetchStatus(), 1000);
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Erreur' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Erreur réseau' });
    } finally {
      setSaving(false);
    }
  }, [pendingPath, fetchStatus]);

  const handleCancelled = useCallback(() => setPendingPath(null), []);

  const handleBrowse = async () => {
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      const selected = await electronAPI.selectFolder();
      if (selected) { setPathInput(selected); setFeedback(null); }
    } else {
      try {
        // @ts-ignore — Web File System Access API
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        if (handle?.name) setPathInput(handle.name);
      } catch { /* user cancelled */ }
    }
  };

  const canBrowse = !!getElectronAPI() || typeof (window as any).showDirectoryPicker === 'function';
  const isChanged = pathInput.trim() !== (status?.rootPath || '');

  return (
    <>
      <Section
        icon={Shield}
        title="Périmètre du repo"
        description="Chemin du repo sur lequel l'assistant travaille. Toutes les opérations (lecture, écriture) ciblent ce dossier."
      >
        {/* Current path + edit */}
        <Field label="Chemin du repo" hint="Chemin absolu vers la racine du projet. Le changement prend effet immédiatement.">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
              <input
                type="text"
                value={pathInput}
                onChange={e => { setPathInput(e.target.value); setFeedback(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder="C:\Users\...\mon-projet"
                className="w-full rounded-lg border pl-8 pr-3 py-2 text-[11px] font-mono transition-colors focus:ring-1 focus:ring-[var(--accent-primary)]"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border-base)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
                spellCheck={false}
              />
            </div>
            {canBrowse && (
              <button
                type="button"
                onClick={handleBrowse}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold transition-colors hover:opacity-80 flex-shrink-0"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--accent-primary)' }}
                title="Parcourir"
              >
                <Upload className="w-3.5 h-3.5" />
                Parcourir
              </button>
            )}
          </div>

          {/* Save button */}
          {isChanged && (
            <motion.button
              type="button"
              onClick={handleSave}
              disabled={saving}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center justify-center gap-2 w-full rounded-lg py-2.5 mt-2 text-[11px] font-bold transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Application…' : 'Appliquer le nouveau chemin'}
            </motion.button>
          )}
        </Field>

        {/* Feedback */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{
                backgroundColor: feedback.type === 'success'
                  ? 'color-mix(in srgb, var(--color-success) 10%, transparent)'
                  : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                border: `1px solid color-mix(in srgb, ${feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'} 25%, transparent)`,
              }}
            >
              {feedback.type === 'success' ? '✓' : '✗'} {feedback.msg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Git Info */}
        {status && status.rootPath !== '(en attente du serveur)' && (
          <div
            className="flex flex-col gap-0.5 rounded-xl p-3"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
          >
            <InfoRow label="Branche" value={
              <span className="flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                {status.gitBranch}
              </span>
            } />
            <InfoRow label="Dernier commit" value={status.lastCommit} mono />
            <InfoRow label="Date" value={status.lastCommitDate} />
            <InfoRow label="Statut" value={
              <span className="flex items-center gap-1.5">
                {status.gitStatus === 'clean' ? (
                  <><CheckCircle2 className="w-3 h-3" style={{ color: '#4ade80' }} /> Propre</>
                ) : status.gitStatus === 'dirty' ? (
                  <><AlertTriangle className="w-3 h-3" style={{ color: '#f59e0b' }} /> Modifié</>
                ) : (
                  <span style={{ color: 'var(--text-dimmed)' }}>Inconnu</span>
                )}
              </span>
            } />
            {(status.aheadBehind.ahead > 0 || status.aheadBehind.behind > 0) && (
              <InfoRow label="Sync" value={`↑${status.aheadBehind.ahead} ↓${status.aheadBehind.behind}`} mono />
            )}
            <div className="flex justify-end mt-1">
              <button
                onClick={fetchStatus}
                className="flex items-center gap-1 text-[9px] font-medium transition-colors hover:opacity-80"
                style={{ color: 'var(--text-muted)' }}
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Rafraîchir
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 10%, transparent)', color: '#fbbf24' }}
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      {/* ── Local confirmation modal ───────────────────────────────────────── */}
      <AnimatePresence>
        {pendingPath && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
              style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 15%, transparent)' }}
                >
                  <ShieldAlert className="w-5 h-5" style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    Changement de repo
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Confirmer le changement du répertoire de travail
                  </p>
                </div>
              </div>

              {/* Details */}
              <div
                className="rounded-xl p-4 mb-5"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Avant</span>
                    <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                      {status?.rootPath || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Après</span>
                    <span className="text-[11px] font-mono font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {pendingPath}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <motion.button
                  type="button"
                  onClick={handleCancelled}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-base)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                  Annuler
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleConfirmed}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-white transition-all"
                  style={{ backgroundColor: '#f59e0b', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirmer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

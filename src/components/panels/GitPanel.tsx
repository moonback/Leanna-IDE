import React, { useState, useCallback, useEffect } from 'react';
import {
  GitBranch, GitCommit, GitMerge, Plus, Minus, Check,
  RefreshCw, Upload, Download, ChevronDown, ChevronRight,
  FileText, FilePlus, FileX, Loader2, Eye,
} from 'lucide-react';
import { Panel } from '../ui/Panel';
import { IconButton } from '../ui/IconButton';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GitFile {
  indexStatus: string;
  workTreeStatus: string;
  path: string;
}

interface GitCommitEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

interface GitBranchEntry {
  name: string;
  current: boolean;
}

type Tab = 'changes' | 'branches' | 'log';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(indexStatus: string, workTreeStatus: string) {
  if (indexStatus === '?' || workTreeStatus === '?') return <FilePlus className="w-3.5 h-3.5 text-green-400" />;
  if (indexStatus === 'D' || workTreeStatus === 'D') return <FileX className="w-3.5 h-3.5 text-red-400" />;
  if (indexStatus === 'A') return <FilePlus className="w-3.5 h-3.5 text-green-400" />;
  return <FileText className="w-3.5 h-3.5 text-amber-400" />;
}

function statusLabel(indexStatus: string, workTreeStatus: string): string {
  if (indexStatus === '?' || workTreeStatus === '?') return 'U';
  if (indexStatus === 'A') return 'A';
  if (indexStatus === 'D' || workTreeStatus === 'D') return 'D';
  if (indexStatus === 'R') return 'R';
  return 'M';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GitPanelProps {
  onViewDiff?: (file: string, staged: boolean) => void;
}

export function GitPanel({ onViewDiff }: GitPanelProps) {
  const [tab, setTab] = useState<Tab>('changes');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Changes state
  const [branch, setBranch] = useState('');
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitFile[]>([]);
  const [untrackedFiles, setUntrackedFiles] = useState<GitFile[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [showStaged, setShowStaged] = useState(true);
  const [showUnstaged, setShowUnstaged] = useState(true);

  // Branches state
  const [branches, setBranches] = useState<GitBranchEntry[]>([]);
  const [newBranchName, setNewBranchName] = useState('');

  // Log state
  const [commits, setCommits] = useState<GitCommitEntry[]>([]);

  // Diff state
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffFile, setDiffFile] = useState<string | null>(null);

  // ─── API calls ──────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/git/status');
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setBranch(data.branch || '');
      const files: GitFile[] = data.files || [];
      setStagedFiles(files.filter(f => f.indexStatus !== ' ' && f.indexStatus !== '?'));
      setUnstagedFiles(files.filter(f => f.workTreeStatus !== ' ' && f.indexStatus !== '?' && f.workTreeStatus !== '?'));
      setUntrackedFiles(files.filter(f => f.indexStatus === '?'));
    } catch (e: any) {
      setError(e.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/branches');
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setBranches(data.branches || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/log');
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setCommits(data.commits || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const stageFile = useCallback(async (filePath: string) => {
    await fetch('/api/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [filePath] }),
    });
    fetchStatus();
  }, [fetchStatus]);

  const unstageFile = useCallback(async (filePath: string) => {
    await fetch('/api/git/unstage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [filePath] }),
    });
    fetchStatus();
  }, [fetchStatus]);

  const stageAll = useCallback(async () => {
    await fetch('/api/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: ['.'] }),
    });
    fetchStatus();
  }, [fetchStatus]);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage.trim() }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setCommitMessage('');
      fetchStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [commitMessage, fetchStatus]);

  const handlePush = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.error) setError(data.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePull = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else fetchStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const handleSwitchBranch = useCallback(async (branchName: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: branchName }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { fetchBranches(); fetchStatus(); }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchBranches, fetchStatus]);

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/git/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: newBranchName.trim(), create: true }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setNewBranchName(''); fetchBranches(); fetchStatus(); }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [newBranchName, fetchBranches, fetchStatus]);

  const viewDiff = useCallback(async (file: string, staged: boolean) => {
    if (onViewDiff) { onViewDiff(file, staged); return; }
    try {
      const params = new URLSearchParams({ file, staged: String(staged) });
      const res = await fetch(`/api/git/diff?${params}`);
      const data = await res.json();
      setDiffContent(data.diff || 'Aucune modification.');
      setDiffFile(file);
    } catch { setDiffContent(null); }
  }, [onViewDiff]);

  // ─── Auto-refresh on mount and tab change ────────────────────────────────

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => {
    if (tab === 'branches') fetchBranches();
    if (tab === 'log') fetchLog();
  }, [tab, fetchBranches, fetchLog]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const renderFileList = (files: GitFile[], label: string, isStaged: boolean, show: boolean, onToggle: () => void) => (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-white/5 transition-colors"
      >
        {show ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-dimmed)' }}>
          {files.length}
        </span>
      </button>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {files.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-3 py-1 rounded hover:bg-white/5 group transition-colors"
              >
                {statusIcon(file.indexStatus, file.workTreeStatus)}
                <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                  {file.path}
                </span>
                <span className="text-[9px] font-mono px-1 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-dimmed)' }}>
                  {statusLabel(file.indexStatus, file.workTreeStatus)}
                </span>
                <div className="hidden group-hover:flex items-center gap-0.5">
                  <button
                    onClick={() => viewDiff(file.path, isStaged)}
                    className="p-0.5 rounded hover:bg-white/10"
                    title="Voir le diff"
                  >
                    <Eye className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  </button>
                  {isStaged ? (
                    <button
                      onClick={() => unstageFile(file.path)}
                      className="p-0.5 rounded hover:bg-white/10"
                      title="Retirer du staging"
                    >
                      <Minus className="w-3 h-3 text-red-400" />
                    </button>
                  ) : (
                    <button
                      onClick={() => stageFile(file.path)}
                      className="p-0.5 rounded hover:bg-white/10"
                      title="Ajouter au staging"
                    >
                      <Plus className="w-3 h-3 text-green-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <Panel
      title="Git"
      icon={<GitBranch className="w-4 h-4" />}
      actions={
        <div className="flex items-center gap-1">
          <IconButton
            icon={loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            onClick={fetchStatus}
            tooltip="Rafraîchir"
            variant="default"
            disabled={loading}
          />
          <IconButton icon={<Download className="w-3.5 h-3.5" />} onClick={handlePull} tooltip="Pull" variant="default" disabled={loading} />
          <IconButton icon={<Upload className="w-3.5 h-3.5" />} onClick={handlePush} tooltip="Push" variant="default" disabled={loading} />
        </div>
      }
    >
      {/* Branch badge */}
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
        <span className="text-[11px] font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
          {branch || '...'}
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg text-[11px]" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 mb-3 p-0.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
        {([
          { key: 'changes', label: 'Changements', icon: <FileText className="w-3 h-3" /> },
          { key: 'branches', label: 'Branches', icon: <GitMerge className="w-3 h-3" /> },
          { key: 'log', label: 'Historique', icon: <GitCommit className="w-3 h-3" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all"
            style={{
              backgroundColor: tab === key ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-dimmed)',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ─── Changes Tab ─────────────────────────────────────────────────── */}
      {tab === 'changes' && (
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {renderFileList(stagedFiles, 'Staged', true, showStaged, () => setShowStaged(v => !v))}
          {renderFileList([...unstagedFiles, ...untrackedFiles], 'Modifications', false, showUnstaged, () => setShowUnstaged(v => !v))}

          {stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0 && !loading && (
            <div className="text-center py-6">
              <Check className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-dimmed)' }} />
              <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Aucune modification</p>
            </div>
          )}

          {/* Stage all + Commit area */}
          {(unstagedFiles.length > 0 || untrackedFiles.length > 0) && (
            <button
              onClick={stageAll}
              className="w-full mt-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors hover:bg-white/10"
              style={{ border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
            >
              <Plus className="w-3 h-3 inline mr-1" /> Tout stager
            </button>
          )}

          {stagedFiles.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-base)' }}>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Message du commit..."
                className="w-full px-3 py-2 rounded-lg text-[11px] resize-none focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                  minHeight: '3rem',
                }}
                rows={2}
              />
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim() || loading}
                className="w-full mt-2 px-3 py-2 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                }}
              >
                <GitCommit className="w-3.5 h-3.5 inline mr-1" />
                Commit ({stagedFiles.length} fichier{stagedFiles.length > 1 ? 's' : ''})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Branches Tab ────────────────────────────────────────────────── */}
      {tab === 'branches' && (
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {/* Create branch */}
          <div className="flex gap-1 mb-3">
            <input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="Nouvelle branche..."
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] focus:outline-none focus:ring-1"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
            />
            <button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim()}
              className="px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Branch list */}
          {branches.filter(b => !b.name.startsWith('remotes/')).map((b) => (
            <button
              key={b.name}
              onClick={() => !b.current && handleSwitchBranch(b.name)}
              disabled={b.current}
              className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-left transition-colors hover:bg-white/5 disabled:opacity-70"
            >
              <GitBranch className="w-3 h-3" style={{ color: b.current ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
              <span className="text-[11px] flex-1 truncate" style={{ color: b.current ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                {b.name}
              </span>
              {b.current && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(14,165,233,0.15)', color: 'var(--accent-primary)' }}>
                  actuelle
                </span>
              )}
            </button>
          ))}

          {/* Remote branches */}
          {branches.filter(b => b.name.startsWith('remotes/')).length > 0 && (
            <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border-base)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2" style={{ color: 'var(--text-dimmed)' }}>Remotes</span>
              {branches.filter(b => b.name.startsWith('remotes/')).map((b) => (
                <button
                  key={b.name}
                  onClick={() => handleSwitchBranch(b.name.replace(/^remotes\/origin\//, ''))}
                  className="flex items-center gap-2 w-full px-3 py-1 rounded text-left hover:bg-white/5"
                >
                  <GitBranch className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
                  <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Log Tab ─────────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {commits.map((c) => (
            <div
              key={c.hash}
              className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <GitCommit className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {c.message}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                    {c.shortHash}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    {c.author}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                    {c.date}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {commits.length === 0 && !loading && (
            <p className="text-center text-[11px] py-4" style={{ color: 'var(--text-dimmed)' }}>
              Aucun commit trouvé
            </p>
          )}
        </div>
      )}

      {/* ─── Inline Diff Viewer ──────────────────────────────────────────── */}
      <AnimatePresence>
        {diffContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-base)' }}>
              <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{diffFile}</span>
                <button onClick={() => { setDiffContent(null); setDiffFile(null); }} className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>×</button>
              </div>
              <pre className="px-3 py-2 text-[10px] font-mono overflow-x-auto max-h-48 custom-scrollbar" style={{ color: 'var(--text-primary)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                {diffContent.split('\n').map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.startsWith('+') ? '#4ade80' : line.startsWith('-') ? '#f87171' : line.startsWith('@@') ? '#60a5fa' : 'inherit',
                      backgroundColor: line.startsWith('+') ? 'rgba(74,222,128,0.06)' : line.startsWith('-') ? 'rgba(248,113,113,0.06)' : 'transparent',
                    }}
                  >
                    {line}
                  </div>
                ))}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

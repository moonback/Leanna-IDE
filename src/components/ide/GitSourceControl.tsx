import React, { useState, useCallback, useEffect } from 'react';
import {
  GitBranch, GitCommit, GitMerge, Plus, Minus, Check,
  RefreshCw, Upload, Download, ChevronDown, ChevronRight,
  FileText, FilePlus, FileX, Loader2, Eye, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GitFile {
  indexStatus: string;
  workTreeStatus: string;
  path: string;
}

interface GitCommitEntry {
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

interface GitBranchEntry {
  name: string;
  current: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(indexStatus: string, workTreeStatus: string) {
  if (indexStatus === '?' || workTreeStatus === '?') return <FilePlus className="w-3 h-3 text-green-400" />;
  if (indexStatus === 'D' || workTreeStatus === 'D') return <FileX className="w-3 h-3 text-red-400" />;
  if (indexStatus === 'A') return <FilePlus className="w-3 h-3 text-green-400" />;
  return <FileText className="w-3 h-3 text-amber-400" />;
}

function statusLabel(indexStatus: string, workTreeStatus: string): string {
  if (indexStatus === '?' || workTreeStatus === '?') return 'U';
  if (indexStatus === 'A') return 'A';
  if (indexStatus === 'D' || workTreeStatus === 'D') return 'D';
  return 'M';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GitSourceControlProps {
  onClose: () => void;
}

export function GitSourceControl({ onClose }: GitSourceControlProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branch, setBranch] = useState('');
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitFile[]>([]);
  const [untrackedFiles, setUntrackedFiles] = useState<GitFile[]>([]);
  const [commitMessage, setCommitMessage] = useState('');

  const [branches, setBranches] = useState<GitBranchEntry[]>([]);
  const [showBranches, setShowBranches] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const [recentCommits, setRecentCommits] = useState<GitCommitEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  // ─── API ────────────────────────────────────────────────────────────────

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
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/git/branches');
      const data = await res.json();
      if (!data.error) setBranches(data.branches || []);
    } catch { /* */ }
  }, []);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch('/api/git/log?count=5');
      const data = await res.json();
      if (!data.error) setRecentCommits(data.commits || []);
    } catch { /* */ }
  }, []);

  const stageFile = useCallback(async (fp: string) => {
    await fetch('/api/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [fp] }) });
    fetchStatus();
  }, [fetchStatus]);

  const unstageFile = useCallback(async (fp: string) => {
    await fetch('/api/git/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [fp] }) });
    fetchStatus();
  }, [fetchStatus]);

  const stageAll = useCallback(async () => {
    await fetch('/api/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: ['.'] }) });
    fetchStatus();
  }, [fetchStatus]);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/git/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: commitMessage.trim() }) });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setCommitMessage('');
      fetchStatus();
      fetchLog();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [commitMessage, fetchStatus, fetchLog]);

  const handlePush = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const handlePull = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setError(null); fetchStatus(); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [fetchStatus]);

  const handleSwitchBranch = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: name }) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { fetchStatus(); fetchBranches(); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [fetchStatus, fetchBranches]);

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/git/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: newBranchName.trim(), create: true }) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setNewBranchName(''); fetchStatus(); fetchBranches(); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [newBranchName, fetchStatus, fetchBranches]);

  // ─── Effects ────────────────────────────────────────────────────────────

  useEffect(() => { fetchStatus(); fetchBranches(); fetchLog(); }, [fetchStatus, fetchBranches, fetchLog]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const totalChanges = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;

  return (
    <div
      className="border-r flex flex-col overflow-hidden"
      style={{ width: '260px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
        <div className="flex items-center gap-2">
          <GitBranch size={13} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            Source Control
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={fetchStatus} className="p-1 rounded hover:bg-white/10" title="Rafraîchir">
            {loading ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--text-muted)' }} /> : <RefreshCw size={11} style={{ color: 'var(--text-muted)' }} />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" title="Fermer">
            <X size={11} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Branch + Push/Pull */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
        <button onClick={() => setShowBranches(v => !v)} className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 flex-1 min-w-0">
          <GitBranch size={11} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-[10px] font-mono truncate" style={{ color: 'var(--accent-primary)' }}>{branch || '...'}</span>
          <ChevronDown size={9} style={{ color: 'var(--text-dimmed)' }} />
        </button>
        <button onClick={handlePull} className="p-1 rounded hover:bg-white/10" title="Pull" disabled={loading}>
          <Download size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button onClick={handlePush} className="p-1 rounded hover:bg-white/10" title="Push" disabled={loading}>
          <Upload size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Branch picker */}
      <AnimatePresence>
        {showBranches && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-b" style={{ borderColor: 'var(--border-base)' }}
          >
            <div className="px-2 py-2 max-h-32 overflow-y-auto custom-scrollbar">
              <div className="flex gap-1 mb-1.5">
                <input
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="Nouvelle branche..."
                  className="flex-1 px-2 py-1 rounded text-[10px] focus:outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                />
                <button onClick={handleCreateBranch} disabled={!newBranchName.trim()} className="px-1.5 rounded text-[10px] disabled:opacity-40" style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}>
                  <Plus size={10} />
                </button>
              </div>
              {branches.filter(b => !b.name.startsWith('remotes/')).map((b) => (
                <button
                  key={b.name}
                  onClick={() => { if (!b.current) { handleSwitchBranch(b.name); setShowBranches(false); } }}
                  disabled={b.current}
                  className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-left hover:bg-white/5 disabled:opacity-60"
                >
                  <GitBranch size={10} style={{ color: b.current ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
                  <span className="text-[10px] truncate" style={{ color: b.current ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{b.name}</span>
                  {b.current && <span className="text-[8px] ml-auto" style={{ color: 'var(--accent-primary)' }}>●</span>}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="mx-2 mt-1.5 px-2 py-1 rounded text-[9px]" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
          {error}
          <button onClick={() => setError(null)} className="ml-1 underline">×</button>
        </div>
      )}

      {/* Commit input */}
      <div className="px-2 pt-2 pb-1 flex-shrink-0">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Message du commit (Ctrl+Enter)"
          className="w-full px-2 py-1.5 rounded text-[10px] resize-none focus:outline-none focus:ring-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-base)', color: 'var(--text-primary)', minHeight: '2.5rem' }}
          rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }}
        />
        <button
          onClick={handleCommit}
          disabled={!commitMessage.trim() || stagedFiles.length === 0 || loading}
          className="w-full mt-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all disabled:opacity-30"
          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
        >
          <GitCommit className="w-3 h-3 inline mr-1" />
          Commit {stagedFiles.length > 0 ? `(${stagedFiles.length})` : ''}
        </button>
      </div>

      {/* File lists */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-1 pb-2">
        {/* Staged */}
        {stagedFiles.length > 0 && (
          <FileSection label="Staged" files={stagedFiles} isStaged={true} onStage={stageFile} onUnstage={unstageFile} />
        )}

        {/* Changes */}
        {(unstagedFiles.length > 0 || untrackedFiles.length > 0) && (
          <FileSection
            label="Modifications"
            files={[...unstagedFiles, ...untrackedFiles]}
            isStaged={false}
            onStage={stageFile}
            onUnstage={unstageFile}
            onStageAll={stageAll}
          />
        )}

        {/* Empty state */}
        {totalChanges === 0 && !loading && (
          <div className="text-center py-6">
            <Check size={16} className="mx-auto mb-1" style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Aucune modification</p>
          </div>
        )}

        {/* Recent commits */}
        <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-1 w-full px-2 py-1 mt-2 rounded hover:bg-white/5">
          {showLog ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Commits récents</span>
        </button>
        {showLog && recentCommits.map((c) => (
          <div key={c.shortHash} className="flex items-center gap-1.5 px-2 py-1">
            <GitCommit size={9} style={{ color: 'var(--text-dimmed)' }} />
            <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>{c.shortHash}</span>
            <span className="text-[9px] truncate flex-1" style={{ color: 'var(--text-muted)' }}>{c.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── File Section Sub-component ───────────────────────────────────────────

function FileSection({ label, files, isStaged, onStage, onUnstage, onStageAll }: {
  label: string;
  files: GitFile[];
  isStaged: boolean;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onStageAll?: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1 px-1">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 flex-1 px-1 py-0.5 rounded hover:bg-white/5">
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            {label}
          </span>
          <span className="text-[8px] ml-1 px-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-dimmed)' }}>
            {files.length}
          </span>
        </button>
        {!isStaged && onStageAll && (
          <button onClick={onStageAll} className="p-0.5 rounded hover:bg-white/10" title="Tout stager">
            <Plus size={10} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>
      {open && files.map((file) => (
        <div key={file.path} className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/5 group">
          {statusIcon(file.indexStatus, file.workTreeStatus)}
          <span className="text-[10px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>
            {file.path.split('/').pop()}
          </span>
          <span className="text-[8px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
            {statusLabel(file.indexStatus, file.workTreeStatus)}
          </span>
          <button
            onClick={() => isStaged ? onUnstage(file.path) : onStage(file.path)}
            className="hidden group-hover:block p-0.5 rounded hover:bg-white/10"
            title={isStaged ? 'Unstage' : 'Stage'}
          >
            {isStaged ? <Minus size={10} className="text-red-400" /> : <Plus size={10} className="text-green-400" />}
          </button>
        </div>
      ))}
    </div>
  );
}

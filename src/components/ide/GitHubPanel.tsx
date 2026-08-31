import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Github, GitPullRequest, AlertCircle, Bell, Search, Star,
  ExternalLink, RefreshCw, Loader2, X, BookOpen, GitCommit,
  FolderOpen, Lock, GitMerge, CheckCircle2, Circle, Clock,
  ChevronDown, Filter, MessageSquare, Tag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip } from '../ui/Tooltip.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Repo {
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  updated_at: string;
  private: boolean;
  html_url: string;
}

interface Issue {
  number: number;
  title: string;
  state: string;
  author: string;
  labels: string[];
  created_at: string;
  comments: number;
  html_url: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  author: string;
  head: string;
  base: string;
  created_at: string;
  draft: boolean;
  html_url: string;
}

interface Notification {
  id: string;
  reason: string;
  unread: boolean;
  title: string;
  type: string;
  repo: string;
  updated_at: string;
}

interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

interface CommitDetail {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  files: CommitFile[];
}

interface CommitFile {
  status: string;
  path: string;
}

type Tab = 'commits' | 'repos' | 'issues' | 'prs' | 'notifications';
type IssueFilter = 'open' | 'closed' | 'all';
type PRFilter = 'open' | 'closed' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}j`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function langColor(lang: string | null): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
    Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', 'C#': '#178600',
    HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Ruby: '#701516',
    Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Vue: '#41b883',
  };
  return colors[lang || ''] || 'var(--text-dimmed)';
}

function openExternal(url: string) {
  const api = (window as any).electronAPI;
  if (api?.openExternal) {
    api.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const FILE_STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  A: { label: 'A', bg: 'rgba(63,185,80,0.15)', color: '#3fb950' },
  M: { label: 'M', bg: 'rgba(14,165,233,0.15)', color: 'var(--accent-primary)' },
  D: { label: 'D', bg: 'rgba(248,81,73,0.15)', color: '#f85149' },
  R: { label: 'R', bg: 'rgba(163,113,247,0.15)', color: '#a371f7' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, subtitle }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-base)' }}
      >
        <Icon size={18} style={{ color: 'var(--text-dimmed)' }} />
      </div>
      <div>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{title}</p>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-dimmed)' }}>{subtitle}</p>}
      </div>
    </div>
  );
}

function FilterDropdown({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-white/8"
        style={{ border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
      >
        <Filter size={10} />
        {current?.label}
        <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 z-50 rounded-lg overflow-hidden"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-base)', boxShadow: 'var(--shadow-lg)', minWidth: 100 }}
          >
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/8"
                style={{ color: opt.value === value ? 'var(--accent-primary)' : 'var(--text-primary)' }}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface GitHubPanelProps {
  onClose: () => void;
  /** Quand true, le panneau occupe toute la zone principale (pas de border-l ni largeur fixe) */
  fullWidth?: boolean;
}

export function GitHubPanel({ onClose, fullWidth = false }: GitHubPanelProps) {
  const [tab, setTab] = useState<Tab>('commits');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  // Repo context
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [detectingRepo, setDetectingRepo] = useState(true);

  // Data
  const [commits, setCommits] = useState<Commit[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Commit detail
  const [selectedCommit, setSelectedCommit] = useState<CommitDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Filters
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('open');
  const [prFilter, setPrFilter] = useState<PRFilter>('open');
  const [repoSearch, setRepoSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const unreadCount = notifications.filter(n => n.unread).length;

  // ─── Repo detection ───────────────────────────────────────────────────

  const detectCurrentRepo = useCallback(async () => {
    setDetectingRepo(true);
    try {
      const res = await fetch('/api/github/current-repo');
      const data = await res.json();
      if (data.status === 'success' && data.owner && data.repo) {
        setRepoOwner(data.owner);
        setRepoName(data.repo);
        setRepoUrl(`https://github.com/${data.owner}/${data.repo}`);
      }
    } catch { /* ignore */ }
    finally { setDetectingRepo(false); }
  }, []);

  useEffect(() => { detectCurrentRepo(); }, [detectCurrentRepo]);

  // ─── API calls ────────────────────────────────────────────────────────

  const fetchCommits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/commits?limit=30');
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setCommits(data.commits || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/repos');
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('TOKEN')) setConfigured(false);
        setError(data.error);
        return;
      }
      setRepos(data.repos || []);
      setConfigured(true);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchIssues = useCallback(async (state: string = issueFilter) => {
    if (!repoOwner || !repoName) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ owner: repoOwner, repo: repoName, state: state === 'all' ? 'all' : state });
      const res = await fetch(`/api/github/issues?${params}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setIssues(data.issues || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [repoOwner, repoName, issueFilter]);

  const fetchPRs = useCallback(async (state: string = prFilter) => {
    if (!repoOwner || !repoName) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ owner: repoOwner, repo: repoName, state: state === 'all' ? 'all' : state });
      const res = await fetch(`/api/github/pulls?${params}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setPrs(data.pull_requests || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [repoOwner, repoName, prFilter]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/notifications');
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('TOKEN') || data.error.includes('scope')) {
          setNotifications([]);
          setError(`⚠️ ${data.error}`);
        } else {
          setError(data.error);
        }
        return;
      }
      setNotifications(data.notifications || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchCommitDetail = useCallback(async (hash: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/github/commits/${hash}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setSelectedCommit(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingDetail(false); }
  }, []);

  const searchRepos = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ query: searchQuery.trim() });
      const res = await fetch(`/api/github/search?${params}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setRepos(data.repos || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [searchQuery]);

  const refresh = useCallback(() => {
    setError(null);
    if (tab === 'commits') fetchCommits();
    else if (tab === 'repos') fetchRepos();
    else if (tab === 'issues') fetchIssues();
    else if (tab === 'prs') fetchPRs();
    else fetchNotifications();
  }, [tab, fetchCommits, fetchRepos, fetchIssues, fetchPRs, fetchNotifications]);

  // ─── Effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab === 'commits') fetchCommits();
    else if (tab === 'repos') { if (repos.length === 0) fetchRepos(); }
    else if (tab === 'notifications') fetchNotifications();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'issues') fetchIssues(issueFilter);
  }, [issueFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'prs') fetchPRs(prFilter);
  }, [prFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (repoOwner && repoName) {
      if (tab === 'issues') fetchIssues();
      else if (tab === 'prs') fetchPRs();
    }
  }, [repoOwner, repoName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load commits on mount
  useEffect(() => { fetchCommits(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered repos
  const filteredRepos = repoSearch.trim()
    ? repos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()))
    : repos;

  // ─── Tab config ───────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'commits', label: 'Commits', icon: <GitCommit size={11} />, badge: commits.length > 0 ? commits.length : undefined },
    { key: 'repos', label: 'Repos', icon: <BookOpen size={11} /> },
    { key: 'issues', label: 'Issues', icon: <AlertCircle size={11} />, badge: issues.filter(i => i.state === 'open').length || undefined },
    { key: 'prs', label: 'PRs', icon: <GitPullRequest size={11} />, badge: prs.filter(p => p.state === 'open').length || undefined },
    { key: 'notifications', label: 'Notifs', icon: <Bell size={11} />, badge: unreadCount || undefined },
  ];

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className={fullWidth ? 'flex flex-col h-full flex-1 min-w-0' : 'border-l flex flex-col h-full'}
      style={fullWidth
        ? { backgroundColor: 'var(--bg-panel)' }
        : { width: '340px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }
      }
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
          >
            <Github size={13} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>GitHub</span>
            {!detectingRepo && repoOwner && repoName ? (
              <button
                onClick={() => openExternal(repoUrl)}
                className="ml-2 inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded transition-opacity hover:opacity-75"
                style={{ backgroundColor: 'rgba(14,165,233,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(14,165,233,0.2)' }}
              >
                {repoOwner}/{repoName}
                <ExternalLink size={9} />
              </button>
            ) : detectingRepo ? (
              <span className="ml-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>détection…</span>
            ) : (
              <span className="ml-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>aucun repo</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Tooltip content="Rafraîchir" as="button" onClick={refresh}
            className="p-1.5 rounded-md transition-colors hover:bg-white/8">
            {loading
              ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              : <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />}
          </Tooltip>
          <Tooltip content="Fermer" as="button" onClick={onClose}
            className="p-1.5 rounded-md transition-colors hover:bg-white/8">
            <X size={13} style={{ color: 'var(--text-muted)' }} />
          </Tooltip>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div
        className="flex border-b flex-shrink-0 overflow-x-auto"
        style={{ borderColor: 'var(--border-base)' }}
      >
        {tabs.map(({ key, label, icon, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="relative flex-shrink-0 flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium transition-all border-b-2"
            style={{
              borderColor: tab === key ? 'var(--accent-primary)' : 'transparent',
              color: tab === key ? 'var(--accent-primary)' : 'var(--text-dimmed)',
              backgroundColor: tab === key ? 'rgba(14,165,233,0.04)' : 'transparent',
            }}
          >
            {icon}
            {label}
            {badge !== undefined && (
              <span
                className="text-[9px] font-bold px-1 py-0.5 rounded-full leading-none"
                style={{
                  backgroundColor: key === 'notifications' && unreadCount > 0
                    ? 'rgba(239,68,68,0.15)'
                    : 'rgba(14,165,233,0.15)',
                  color: key === 'notifications' && unreadCount > 0
                    ? '#f87171'
                    : 'var(--accent-primary)',
                }}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mt-2 flex-shrink-0"
          >
            <div
              className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs"
              style={{ backgroundColor: 'rgba(239,68,68,0.07)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
                <X size={11} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Not configured ──────────────────────────────────────────────── */}
      {!configured ? (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-base)' }}
          >
            <Github size={28} style={{ color: 'var(--text-dimmed)' }} />
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>GitHub non configuré</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Ajoutez votre <code className="px-1 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--bg-input)' }}>GITHUB_TOKEN</code> dans les paramètres pour accéder à vos repos, issues et PRs.
            </p>
          </div>
        </div>
      ) : (

        /* ── Tab Content ────────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ minHeight: 0 }}>

          {/* ──────────────────────────── COMMITS ────────────────────────── */}
          {tab === 'commits' && (
            <div className="p-2">
              {loading && commits.length === 0 && (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
                </div>
              )}

              {!loading && commits.length === 0 && !error && (
                <EmptyState icon={GitCommit} title="Aucun commit" subtitle="Ce workspace n'a pas de dépôt git." />
              )}

              {/* Commit list + detail side-by-side */}
              <div className={selectedCommit ? 'flex flex-col gap-2' : ''}>
                <div className="grid gap-1">
                  {commits.map((commit) => (
                    <motion.button
                      key={commit.hash}
                      layout
                      onClick={() => {
                        if (selectedCommit?.hash === commit.hash) {
                          setSelectedCommit(null);
                        } else {
                          fetchCommitDetail(commit.hash);
                        }
                      }}
                      className="w-full text-left flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/5"
                      style={{
                        border: '1px solid',
                        borderColor: selectedCommit?.hash === commit.hash
                          ? 'rgba(14,165,233,0.35)'
                          : 'transparent',
                        backgroundColor: selectedCommit?.hash === commit.hash
                          ? 'rgba(14,165,233,0.06)'
                          : undefined,
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: 'rgba(14,165,233,0.1)' }}
                      >
                        <GitCommit size={10} style={{ color: 'var(--accent-primary)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                          {commit.message.length > 72 ? commit.message.slice(0, 72) + '…' : commit.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(14,165,233,0.08)', color: 'var(--accent-primary)' }}>
                            {commit.shortHash}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{commit.author}</span>
                          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(commit.date)}</span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Commit detail */}
                <AnimatePresence>
                  {selectedCommit && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.18 }}
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid var(--border-base)', backgroundColor: 'var(--bg-base)' }}
                    >
                      {loadingDetail ? (
                        <div className="flex items-center justify-center py-6 gap-2">
                          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
                        </div>
                      ) : (
                        <>
                          {/* Detail header */}
                          <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-base)' }}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold leading-snug flex-1" style={{ color: 'var(--text-primary)' }}>
                                {selectedCommit.message}
                              </p>
                              <div className="flex gap-1 flex-shrink-0">
                                <Tooltip
                                  content="Voir sur GitHub"
                                  as="button"
                                  onClick={() => repoUrl && openExternal(`${repoUrl}/commit/${selectedCommit.hash}`)}
                                  className="p-1 rounded hover:bg-white/8"
                                >
                                  <ExternalLink size={11} style={{ color: 'var(--accent-primary)' }} />
                                </Tooltip>
                                <Tooltip content="Fermer" as="button" onClick={() => setSelectedCommit(null)} className="p-1 rounded hover:bg-white/8">
                                  <X size={11} style={{ color: 'var(--text-dimmed)' }} />
                                </Tooltip>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(14,165,233,0.1)', color: 'var(--accent-primary)' }}>
                                {selectedCommit.hash.slice(0, 10)}
                              </span>
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{selectedCommit.author}</span>
                              <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                                {new Date(selectedCommit.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                              </span>
                            </div>
                          </div>

                          {/* Files list */}
                          <div className="px-3 py-2">
                            <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-dimmed)' }}>
                              {selectedCommit.files.length} fichier{selectedCommit.files.length !== 1 ? 's' : ''} modifié{selectedCommit.files.length !== 1 ? 's' : ''}
                            </p>
                            <div className="grid gap-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                              {selectedCommit.files.map((file, i) => {
                                const cfg = FILE_STATUS_CONFIG[file.status] ?? FILE_STATUS_CONFIG['M'];
                                return (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                                  >
                                    <span
                                      className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                      style={{ backgroundColor: cfg.bg, color: cfg.color }}
                                    >
                                      {cfg.label}
                                    </span>
                                    <span className="truncate" style={{ color: 'var(--text-primary)' }}>{file.path}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* ──────────────────────────── REPOS ──────────────────────────── */}
          {tab === 'repos' && (
            <div className="p-2">
              {/* Search bar */}
              <div className="flex gap-1.5 mb-2">
                <div className="relative flex-1">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                  <input
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    placeholder="Filtrer mes repos…"
                    className="w-full pl-7 pr-2 py-1.5 rounded-md text-xs focus:outline-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="relative flex-shrink-0">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchRepos()}
                    placeholder="Chercher GitHub…"
                    className="w-full pl-7 pr-2 py-1.5 rounded-md text-xs focus:outline-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                    title="Appuyez sur Entrée pour chercher"
                  />
                </div>
              </div>

              {loading && repos.length === 0 && (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
                </div>
              )}

              {!loading && filteredRepos.length === 0 && !error && (
                <EmptyState icon={BookOpen} title="Aucun repo" subtitle={repos.length > 0 ? 'Aucun résultat pour ce filtre.' : 'Configurez votre GITHUB_TOKEN.'} />
              )}

              <div className="grid gap-1">
                {filteredRepos.map((repo) => (
                  <motion.div
                    key={repo.full_name}
                    layout
                    onClick={() => {
                      const [owner, name] = repo.full_name.split('/');
                      setRepoOwner(owner);
                      setRepoName(name);
                      setRepoUrl(repo.html_url);
                      setTab('issues');
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        const [owner, name] = repo.full_name.split('/');
                        setRepoOwner(owner);
                        setRepoName(name);
                        setRepoUrl(repo.html_url);
                        setTab('issues');
                      }
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-white/5 cursor-pointer"
                    style={{ border: '1px solid transparent' }}
                    whileHover={{ borderColor: 'var(--border-base)' }}
                  >
                    <div className="flex items-center gap-2">
                      {repo.private
                        ? <Lock size={11} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0" />
                        : <FolderOpen size={11} style={{ color: 'var(--accent-primary)' }} className="flex-shrink-0" />
                      }
                      <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                        {repo.full_name}
                      </span>
                      {repo.private && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-dimmed)' }}>
                          privé
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs mt-0.5 truncate pl-4" style={{ color: 'var(--text-dimmed)' }}>{repo.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 pl-4">
                      {repo.language && (
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: langColor(repo.language) }} />
                          {repo.language}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                        <Star size={9} /> {repo.stars}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(repo.updated_at)}</span>
                      <span
                        onClick={(e) => { e.stopPropagation(); openExternal(repo.html_url); }}
                        role="link"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openExternal(repo.html_url); } }}
                        className="ml-auto p-0.5 rounded hover:opacity-100 transition-opacity cursor-pointer"
                        title="Ouvrir sur GitHub"
                        style={{ opacity: 0.5 }}
                      >
                        <ExternalLink size={10} style={{ color: 'var(--text-dimmed)' }} />
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* ──────────────────────────── ISSUES ─────────────────────────── */}
          {tab === 'issues' && (
            <div className="p-2">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                  {repoOwner && repoName ? `${repoOwner}/${repoName}` : 'Aucun repo sélectionné'}
                </span>
                <FilterDropdown
                  value={issueFilter}
                  options={[
                    { value: 'open', label: 'Ouvertes' },
                    { value: 'closed', label: 'Fermées' },
                    { value: 'all', label: 'Toutes' },
                  ]}
                  onChange={(v) => setIssueFilter(v as IssueFilter)}
                />
              </div>

              {!repoOwner || !repoName ? (
                <EmptyState icon={AlertCircle} title="Sélectionnez un repo" subtitle="Allez dans l'onglet Repos et choisissez un projet." />
              ) : loading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
                </div>
              ) : issues.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Aucune issue" subtitle={`Aucune issue ${issueFilter !== 'all' ? issueFilter === 'open' ? 'ouverte' : 'fermée' : ''} sur ce repo.`} />
              ) : (
                <div className="grid gap-1">
                  {issues.map((issue) => (
                    <motion.div
                      key={issue.number}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => openExternal(issue.html_url)}
                      className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
                      style={{ border: '1px solid transparent' }}
                      whileHover={{ borderColor: 'var(--border-base)' }}
                      role="link"
                    >
                      {issue.state === 'open'
                        ? <Circle size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#3fb950' }} />
                        : <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#a371f7' }} />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                          <span style={{ color: 'var(--text-dimmed)' }}>#{issue.number}</span>{' '}
                          {issue.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{issue.author}</span>
                          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(issue.created_at)}</span>
                          {issue.comments > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                              <MessageSquare size={9} /> {issue.comments}
                            </span>
                          )}
                        </div>
                        {issue.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {issue.labels.slice(0, 3).map((l) => (
                              <span key={l} className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                                <Tag size={8} /> {l}
                              </span>
                            ))}
                            {issue.labels.length > 3 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-dimmed)' }}>
                                +{issue.labels.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ExternalLink size={10} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0 mt-0.5 opacity-50" />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ──────────────────────────── PULL REQUESTS ──────────────────── */}
          {tab === 'prs' && (
            <div className="p-2">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                  {repoOwner && repoName ? `${repoOwner}/${repoName}` : 'Aucun repo sélectionné'}
                </span>
                <FilterDropdown
                  value={prFilter}
                  options={[
                    { value: 'open', label: 'Ouvertes' },
                    { value: 'closed', label: 'Fermées' },
                    { value: 'all', label: 'Toutes' },
                  ]}
                  onChange={(v) => setPrFilter(v as PRFilter)}
                />
              </div>

              {!repoOwner || !repoName ? (
                <EmptyState icon={GitPullRequest} title="Sélectionnez un repo" subtitle="Allez dans l'onglet Repos et choisissez un projet." />
              ) : loading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
                </div>
              ) : prs.length === 0 ? (
                <EmptyState icon={GitMerge} title="Aucune PR" subtitle={`Aucune pull request ${prFilter !== 'all' ? prFilter === 'open' ? 'ouverte' : 'fermée' : ''} sur ce repo.`} />
              ) : (
                <div className="grid gap-1">
                  {prs.map((pr) => (
                    <motion.div
                      key={pr.number}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => openExternal(pr.html_url)}
                      className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
                      style={{ border: '1px solid transparent' }}
                      whileHover={{ borderColor: 'var(--border-base)' }}
                      role="link"
                    >
                      {pr.state === 'open'
                        ? <GitPullRequest size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#3fb950' }} />
                        : <GitMerge size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#a371f7' }} />
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium leading-snug flex-1" style={{ color: 'var(--text-primary)' }}>
                            <span style={{ color: 'var(--text-dimmed)' }}>#{pr.number}</span>{' '}
                            {pr.title}
                          </p>
                          {pr.draft && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-dimmed)' }}>
                              draft
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{pr.author}</span>
                          <span className="text-[10px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                            {pr.head.length > 20 ? pr.head.slice(0, 20) + '…' : pr.head} → {pr.base}
                          </span>
                          <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--text-dimmed)' }}>
                            <Clock size={9} /> {timeAgo(pr.created_at)}
                          </span>
                        </div>
                      </div>
                      <ExternalLink size={10} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0 mt-0.5 opacity-50" />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ──────────────────────────── NOTIFICATIONS ──────────────────── */}
          {tab === 'notifications' && (
            <div className="p-2">
              {/* Unread summary */}
              {unreadCount > 0 && (
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-2 text-xs"
                  style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
                >
                  <Bell size={11} />
                  <span><strong>{unreadCount}</strong> notification{unreadCount > 1 ? 's' : ''} non lue{unreadCount > 1 ? 's' : ''}</span>
                </div>
              )}

              {loading && notifications.length === 0 && (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
                </div>
              )}

              {!loading && notifications.length === 0 && !error && (
                <EmptyState icon={Bell} title="Aucune notification" subtitle="Vous êtes à jour !" />
              )}

              <div className="grid gap-1">
                {notifications.map((n) => (
                  <motion.div
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors hover:bg-white/5"
                    style={{ border: '1px solid', borderColor: n.unread ? 'rgba(239,68,68,0.12)' : 'transparent' }}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {n.unread
                        ? <Bell size={12} style={{ color: '#f87171' }} />
                        : <Bell size={12} style={{ color: 'var(--text-dimmed)' }} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug truncate" style={{ color: n.unread ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-dimmed)' }}>
                          {n.type}
                        </span>
                        <span className="text-[10px] truncate" style={{ color: 'var(--text-dimmed)' }}>{n.repo}</span>
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(n.updated_at)}</span>
                      </div>
                      {n.reason && (
                        <span className="text-[9px] mt-0.5 inline-block" style={{ color: 'var(--text-dimmed)' }}>
                          raison : {n.reason}
                        </span>
                      )}
                    </div>
                    {n.unread && (
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: '#f87171' }} />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useCallback, useEffect } from 'react';
import {
  Github, GitPullRequest, AlertCircle, Bell, Search, Star,
  ExternalLink, RefreshCw, Loader2, X, BookOpen, Eye,
  ChevronDown, ChevronRight, FolderOpen,
} from 'lucide-react';

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

type Tab = 'repos' | 'issues' | 'prs' | 'notifications';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

function langColor(lang: string | null): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f7df1e', Python: '#3572A5',
    Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', 'C#': '#178600',
    HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051',
  };
  return colors[lang || ''] || '#8b949e';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GitHubPanelProps {
  onClose: () => void;
}

export function GitHubPanel({ onClose }: GitHubPanelProps) {
  const [tab, setTab] = useState<Tab>('repos');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  // Data
  const [repos, setRepos] = useState<Repo[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Search / filter
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Auto-detect current project's GitHub repo ────────────────────────

  const detectCurrentRepo = useCallback(async () => {
    try {
      const res = await fetch('/api/github/current-repo');
      const data = await res.json();
      if (data.status === 'success' && data.owner && data.repo) {
        // Verify the repo actually exists on GitHub before setting it
        const checkRes = await fetch(`/api/github/issues?owner=${encodeURIComponent(data.owner)}&repo=${encodeURIComponent(data.repo)}&state=open`);
        const checkData = await checkRes.json();
        if (!checkData.error) {
          setRepoOwner(data.owner);
          setRepoName(data.repo);
        } else {
          console.warn(`[GitHubPanel] Repo ${data.owner}/${data.repo} non accessible:`, checkData.error);
          // Still set it so user sees which repo was detected
          setRepoOwner(data.owner);
          setRepoName(data.repo);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { detectCurrentRepo(); }, [detectCurrentRepo]);

  // ─── API calls ────────────────────────────────────────────────────────

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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIssues = useCallback(async () => {
    if (!repoOwner || !repoName) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ owner: repoOwner, repo: repoName });
      const res = await fetch(`/api/github/issues?${params}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setIssues(data.issues || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [repoOwner, repoName]);

  const fetchPRs = useCallback(async () => {
    if (!repoOwner || !repoName) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ owner: repoOwner, repo: repoName });
      const res = await fetch(`/api/github/pulls?${params}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setPrs(data.pull_requests || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [repoOwner, repoName]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/notifications');
      const data = await res.json();
      if (data.error) {
        // Don't show "not configured" or scope errors as blocking
        if (data.error.includes('TOKEN') || data.error.includes('scope')) {
          setNotifications([]);
          // Show error only as a subtle message, not blocking
          setError(`⚠️ ${data.error}`);
        } else {
          setError(data.error);
        }
        return;
      }
      setNotifications(data.notifications || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // Select a repo to browse its issues/PRs
  const selectRepo = useCallback((fullName: string) => {
    const [owner, repo] = fullName.split('/');
    setRepoOwner(owner);
    setRepoName(repo);
  }, []);

  // ─── Effects ──────────────────────────────────────────────────────────

  useEffect(() => { fetchRepos(); }, [fetchRepos]);
  useEffect(() => {
    if (tab === 'issues' && repoOwner && repoName) fetchIssues();
    if (tab === 'prs' && repoOwner && repoName) fetchPRs();
    if (tab === 'notifications') fetchNotifications();
  }, [tab, repoOwner, repoName, fetchIssues, fetchPRs, fetchNotifications]);

  // Auto-load issues when repo is detected and panel opens on issues tab
  useEffect(() => {
    if (repoOwner && repoName && tab === 'issues') fetchIssues();
    if (repoOwner && repoName && tab === 'prs') fetchPRs();
  }, [repoOwner, repoName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className="border-l flex flex-col"
      style={{ width: '320px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-base)' }}
      >
        <div className="flex items-center gap-2">
          <Github size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            GitHub
          </span>
          {repoOwner && repoName && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1" style={{ backgroundColor: 'rgba(14,165,233,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(14,165,233,0.2)' }}>
              {repoOwner}/{repoName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { if (tab === 'repos') fetchRepos(); else if (tab === 'issues') fetchIssues(); else if (tab === 'prs') fetchPRs(); else fetchNotifications(); }}
            className="p-1 rounded hover:bg-white/10"
            title="Rafraîchir"
          >
            {loading ? <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} /> : <RefreshCw size={12} style={{ color: 'var(--text-muted)' }} />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" title="Fermer">
            <X size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
        {([
          { key: 'repos', label: 'Repos', icon: <BookOpen size={11} /> },
          { key: 'issues', label: 'Issues', icon: <AlertCircle size={11} /> },
          { key: 'prs', label: 'PRs', icon: <GitPullRequest size={11} /> },
          { key: 'notifications', label: 'Notifs', icon: <Bell size={11} /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-semibold transition-all border-b-2"
            style={{
              borderColor: tab === key ? 'var(--accent-primary)' : 'transparent',
              color: tab === key ? 'var(--accent-primary)' : 'var(--text-dimmed)',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 rounded text-[10px]" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
          {error}
        </div>
      )}

      {/* Not configured */}
      {!configured && (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center">
          <Github size={32} style={{ color: 'var(--text-dimmed)' }} className="mb-3" />
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>GitHub non configuré</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Ajoutez votre GITHUB_TOKEN dans les paramètres pour accéder à vos repos, issues et PRs.
          </p>
        </div>
      )}

      {/* Content */}
      {configured && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* ─── Repos Tab ─────────────────────────────────────── */}
          {tab === 'repos' && (
            <div className="p-2">
              {/* Search */}
              <div className="flex gap-1 mb-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher des repos..."
                  className="flex-1 px-2 py-1 rounded text-[11px] focus:outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                  onKeyDown={(e) => e.key === 'Enter' && searchRepos()}
                />
                <button onClick={searchRepos} className="px-2 py-1 rounded hover:bg-white/10" title="Rechercher">
                  <Search size={12} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              {repos.map((repo) => (
                <button
                  key={repo.full_name}
                  onClick={() => selectRepo(repo.full_name)}
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 transition-colors mb-1"
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen size={12} style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-[11px] font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                      {repo.full_name}
                    </span>
                    {repo.private && (
                      <span className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-dimmed)' }}>privé</span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-[10px] mt-0.5 truncate pl-5" style={{ color: 'var(--text-muted)' }}>{repo.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 pl-5">
                    {repo.language && (
                      <span className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: langColor(repo.language) }} />
                        {repo.language}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                      <Star size={9} /> {repo.stars}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(repo.updated_at)}</span>
                  </div>
                </button>
              ))}
              {repos.length === 0 && !loading && !error && (
                <p className="text-center text-[10px] py-6" style={{ color: 'var(--text-dimmed)' }}>Aucun repo</p>
              )}
            </div>
          )}

          {/* ─── Issues Tab ────────────────────────────────────── */}
          {tab === 'issues' && (
            <div className="p-2">
              {!repoOwner || !repoName ? (
                <div className="text-center py-6">
                  <AlertCircle size={20} className="mx-auto mb-2" style={{ color: 'var(--text-dimmed)' }} />
                  <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                    Sélectionnez un repo dans l'onglet Repos
                  </p>
                </div>
              ) : (
                <>
                  {issues.map((issue) => (
                    <a
                      key={issue.number}
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors mb-1"
                    >
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" style={{ color: issue.state === 'open' ? '#3fb950' : '#f85149' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                          #{issue.number} {issue.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{issue.author}</span>
                          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(issue.created_at)}</span>
                          {issue.comments > 0 && <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>💬{issue.comments}</span>}
                        </div>
                        {issue.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {issue.labels.slice(0, 3).map((l) => (
                              <span key={l} className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                                {l}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ExternalLink size={10} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0 mt-1" />
                    </a>
                  ))}
                  {issues.length === 0 && !loading && (
                    <p className="text-center text-[10px] py-4" style={{ color: 'var(--text-dimmed)' }}>Aucune issue ouverte</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── PRs Tab ───────────────────────────────────────── */}
          {tab === 'prs' && (
            <div className="p-2">
              {!repoOwner || !repoName ? (
                <div className="text-center py-6">
                  <GitPullRequest size={20} className="mx-auto mb-2" style={{ color: 'var(--text-dimmed)' }} />
                  <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                    Sélectionnez un repo dans l'onglet Repos
                  </p>
                </div>
              ) : (
                <>
                  {prs.map((pr) => (
                    <a
                      key={pr.number}
                      href={pr.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors mb-1"
                    >
                      <GitPullRequest size={12} className="mt-0.5 flex-shrink-0" style={{ color: pr.state === 'open' ? '#3fb950' : '#a371f7' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                          #{pr.number} {pr.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{pr.author}</span>
                          <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                            {pr.head} → {pr.base}
                          </span>
                          {pr.draft && <span className="text-[8px] px-1 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-dimmed)' }}>draft</span>}
                        </div>
                      </div>
                      <ExternalLink size={10} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0 mt-1" />
                    </a>
                  ))}
                  {prs.length === 0 && !loading && (
                    <p className="text-center text-[10px] py-4" style={{ color: 'var(--text-dimmed)' }}>Aucune PR ouverte</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── Notifications Tab ─────────────────────────────── */}
          {tab === 'notifications' && (
            <div className="p-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors mb-1"
                >
                  <Bell size={12} className="mt-0.5 flex-shrink-0" style={{ color: n.unread ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: n.unread ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {n.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{n.repo}</span>
                      <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{n.reason}</span>
                      <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(n.updated_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && !loading && (
                <p className="text-center text-[10px] py-4" style={{ color: 'var(--text-dimmed)' }}>Aucune notification</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

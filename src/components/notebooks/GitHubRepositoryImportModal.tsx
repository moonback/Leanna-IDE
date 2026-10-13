/**
 * GitHubRepositoryImportModal — Modal pour l'ingestion de dépôts GitHub (Publics & Privés)
 * 
 * Fonctionnalités :
 * - Onglet "Mes Projets" : liste de tous les dépôts de l'utilisateur (publics et privés)
 * - Onglet "Recherche Globale" : recherche sur l'ensemble de GitHub
 * - Onglet "Lien direct" : saisie d'une URL GitHub ou owner/repo direct
 * - Gestion intégrée du token GitHub (Personal Access Token pour accès privé)
 * - Filtres par extensions avec presets rapides
 * - Sélection et création de notebook de destination
 * - Aperçu de la structure des fichiers et progression d'ingestion
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Github, Loader2, XCircle, AlertCircle,
  FileCode, FolderOpen, Star, GitFork,
  X, ExternalLink, RefreshCw, BookOpen, Lock, Globe,
  FolderGit2, Link as LinkIcon, Key, Check, Plus, ArrowRight,
  Sliders, ShieldCheck, ChevronRight
} from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { SPRING_MODAL } from './motion.js';
import { api } from './api/client.js';
import { errorMessage } from './utils.js';

interface Repository {
  full_name: string;
  owner: string;
  repo: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  topics: string[];
  html_url: string;
  private?: boolean;
  default_branch?: string;
  updated_at?: string;
}

interface RepositoryFile {
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
  extension: string;
}

interface Notebook {
  id: string;
  title: string;
  description: string;
  sources?: any[];
  sourcesCount?: number;
}

interface GitHubUser {
  login: string;
  name?: string;
  avatar_url?: string;
  total_private_repos?: number;
  owned_private_repos?: number;
  public_repos?: number;
}

interface GitHubRepositoryImportModalProps {
  onClose: () => void;
  onImportSuccess?: (notebookId: string, repository: string) => void;
  /** ID du notebook sélectionné par défaut (optionnel) */
  defaultNotebookId?: string;
}

// Extensions de code par défaut à ingérer
const DEFAULT_CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.hpp',
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.config', '.env', '.gitignore'
];

// Couleurs par langage
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  Cpp: '#f34b7d',
  C: '#555555',
  Markdown: '#083fa1',
  JSON: '#292929',
  YAML: '#cb171e',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  PHP: '#4F5D95',
  Ruby: '#701516',
};

const DEFAULT_EXTENSIONS = DEFAULT_CODE_EXTENSIONS.join(', ');

// Presets d'extensions
const PRESET_EXTENSIONS = [
  { name: 'Toutes', extensions: DEFAULT_CODE_EXTENSIONS.join(', ') },
  { name: 'TypeScript/JS', extensions: '.ts,.tsx,.js,.jsx,.json' },
  { name: 'Python', extensions: '.py,.json,.yaml,.yml,.txt,.md' },
  { name: 'Rust & Go', extensions: '.rs,.go,.toml,.yaml,.md' },
  { name: 'Frontend', extensions: '.ts,.tsx,.js,.jsx,.css,.html,.json' },
  { name: 'Backend', extensions: '.ts,.js,.py,.java,.go,.rs,.cpp,.c' },
  { name: 'Documentation', extensions: '.md,.txt,.json,.yaml,.yml' },
];

export function GitHubRepositoryImportModal({
  onClose,
  onImportSuccess,
  defaultNotebookId,
}: GitHubRepositoryImportModalProps) {
  const { success, error: toastError } = useToast();

  // Navigation par onglets de source
  const [sourceTab, setSourceTab] = useState<'my_repos' | 'search' | 'direct'>('my_repos');

  // Authentification et Utilisateur GitHub
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaving, setTokenSaving] = useState(false);

  // Onglet "Mes Dépôts"
  const [myRepos, setMyRepos] = useState<Repository[]>([]);
  const [myReposLoading, setMyReposLoading] = useState(false);
  const [myReposFilter, setMyReposFilter] = useState<'all' | 'private' | 'public'>('all');
  const [myReposSearch, setMyReposSearch] = useState('');

  // Onglet "Recherche Globale"
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Repository[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Onglet "Lien direct"
  const [directInput, setDirectInput] = useState('');
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  // Dépôt sélectionné
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);

  // Liste des fichiers du dépôt sélectionné
  const [filesLoading, setFilesLoading] = useState(false);
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);

  // Notebooks
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [, setNotebooksLoading] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(defaultNotebookId || null);

  // Création d'un nouveau notebook
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');

  // Options d'ingestion
  const [fileExtensions, setFileExtensions] = useState<string>(DEFAULT_EXTENSIONS);
  const [maxFiles, setMaxFiles] = useState<number>(100);
  const [branch, setBranch] = useState<string>('');

  // Progression de l'ingestion
  const [ingesting, setIngesting] = useState(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);

  // ─── 1. Vérification de l'utilisateur GitHub ──────────────────────────────

  const checkGitHubAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const data = await api<GitHubUser & { error?: string }>('/api/github/user');
      if (data && !data.error && data.login) {
        setGithubUser(data);
      } else {
        setGithubUser(null);
      }
    } catch {
      setGithubUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    checkGitHubAuth();
  }, [checkGitHubAuth]);

  // ─── 2. Chargement de "Mes Dépôts" ────────────────────────────────────────

  const loadMyRepos = useCallback(async () => {
    setMyReposLoading(true);
    try {
      const data = await api<{ repos?: any[] }>('/api/github/repos?limit=100&sort=updated');
      if (data.repos && Array.isArray(data.repos)) {
        const repos: Repository[] = data.repos.map((r: any) => ({
          full_name: r.full_name,
          owner: r.owner || r.full_name.split('/')[0],
          repo: r.repo || r.name || r.full_name.split('/')[1],
          description: r.description || '',
          language: r.language || 'Autre',
          stars: r.stars || 0,
          forks: r.forks || 0,
          topics: r.topics || [],
          html_url: r.html_url || `https://github.com/${r.full_name}`,
          private: !!r.private,
          default_branch: r.default_branch || 'main',
          updated_at: r.updated_at,
        }));
        setMyRepos(repos);
        // Sélection par défaut uniquement si rien n'est sélectionné — via le
        // setter fonctionnel pour ne PAS dépendre de `selectedRepo` (sinon la
        // liste se rechargeait à chaque changement de sélection).
        if (repos.length > 0) {
          setSelectedRepo(prev => prev ?? repos[0]);
        }
      }
    } catch (e: unknown) {
      console.warn('Erreur chargement mes dépôts:', errorMessage(e));
    } finally {
      setMyReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (githubUser) {
      loadMyRepos();
    }
  }, [githubUser, loadMyRepos]);

  // ─── 3. Recherche globale ────────────────────────────────────────────────

  const searchRepositories = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        query: `${query} in:name,description,readme`,
        limit: '15',
      });

      const data = await api<{ repos?: any[]; error?: string }>(`/api/github/search?${params}`);

      if (data.error) {
        setSearchError(data.error);
        setSearchResults([]);
        return;
      }

      const repos: Repository[] = (data.repos || []).map((r: any) => ({
        full_name: r.full_name,
        owner: r.full_name.split('/')[0],
        repo: r.full_name.split('/')[1],
        description: r.description || 'Aucune description',
        language: r.language || 'Autre',
        stars: r.stars || 0,
        forks: r.forks || 0,
        topics: r.topics || [],
        html_url: r.html_url,
        private: false,
      }));

      setSearchResults(repos);
    } catch (e: unknown) {
      setSearchError(`Erreur de recherche: ${errorMessage(e)}`);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sourceTab !== 'search') return;
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchRepositories(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery, searchRepositories, sourceTab]);

  // ─── 4. Inspection directe d'URL ou "owner/repo" ──────────────────────────

  const handleInspectDirect = useCallback(async () => {
    const raw = directInput.trim();
    if (!raw) return;

    let owner = '';
    let repo = '';

    // Match URLs type https://github.com/owner/repo
    const urlMatch = raw.match(/github\.com\/([^/]+)\/([^/#?]+)/);
    if (urlMatch) {
      owner = urlMatch[1];
      repo = urlMatch[2].replace(/\.git$/, '');
    } else {
      // Match owner/repo
      const parts = raw.split('/');
      if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
        owner = parts[0].trim();
        repo = parts[1].trim().replace(/\.git$/, '');
      }
    }

    if (!owner || !repo) {
      setDirectError('Format invalide. Entrez "owner/repo" ou une URL GitHub complète.');
      return;
    }

    setDirectLoading(true);
    setDirectError(null);

    try {
      const data = await api<any>(`/api/github/repo-info?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);

      if (data.error) {
        setDirectError(`Dépôt introuvable ou inaccessible: ${data.error}`);
        return;
      }

      const foundRepo: Repository = {
        full_name: data.full_name || `${owner}/${repo}`,
        owner,
        repo,
        description: data.description || '',
        language: data.language || 'Autre',
        stars: data.stars || 0,
        forks: data.forks || 0,
        topics: data.topics || [],
        html_url: data.html_url || `https://github.com/${owner}/${repo}`,
        private: !!data.private,
        default_branch: data.default_branch || 'main',
      };

      setSelectedRepo(foundRepo);
      if (foundRepo.default_branch) {
        setBranch(foundRepo.default_branch);
      }
      success(`Dépôt ${foundRepo.full_name} identifié (${foundRepo.private ? 'Privé' : 'Public'})`);
    } catch (e: unknown) {
      setDirectError(`Erreur lors de la vérification : ${errorMessage(e)}`);
    } finally {
      setDirectLoading(false);
    }
  }, [directInput, success]);

  // ─── 5. Chargement des fichiers du dépôt sélectionné ──────────────────────

  const loadRepositoryFiles = useCallback(async (owner: string, repo: string) => {
    setFilesLoading(true);
    setFilesError(null);
    setRepositoryFiles([]);

    try {
      const params = new URLSearchParams({
        owner,
        repo,
        max_files: '300',
      });
      if (branch) params.append('ref', branch);

      const data = await api<{ files?: any[]; error?: string }>(`/api/github/repo-files?${params}`);

      if (data.error) {
        setFilesError(data.error);
        return;
      }

      const files: RepositoryFile[] = (data.files || []).map((f: any) => ({
        path: f.path,
        type: f.type,
        size: f.size || 0,
        sha: f.sha,
        extension: `.${f.path.split('.').pop() || ''}`.toLowerCase(),
      }));

      setRepositoryFiles(files);
    } catch (e: unknown) {
      setFilesError(`Erreur: ${errorMessage(e)}`);
    } finally {
      setFilesLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    if (selectedRepo) {
      loadRepositoryFiles(selectedRepo.owner, selectedRepo.repo);
      if (selectedRepo.default_branch && !branch) {
        setBranch(selectedRepo.default_branch);
      }
    }
  }, [selectedRepo, loadRepositoryFiles, branch]);

  // ─── 6. Chargement des notebooks existants ────────────────────────────────

  const loadNotebooks = useCallback(async () => {
    setNotebooksLoading(true);
    try {
      const data = await api<{ notebooks?: Notebook[] }>('/api/notebooks');
      if (data.notebooks) {
        setNotebooks(data.notebooks);
        setSelectedNotebookId(prev => prev || (data.notebooks!.length > 0 ? data.notebooks![0].id : null));
      }
    } catch (e: unknown) {
      console.error('Erreur notebooks:', errorMessage(e));
    } finally {
      setNotebooksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  // ─── 7. Création de notebook rapide ──────────────────────────────────────

  const handleCreateNotebook = async () => {
    const title = newNotebookTitle.trim() || `Import - ${selectedRepo?.repo || 'GitHub'}`;
    try {
      const data = await api<{ notebook?: Notebook }>('/api/notebooks', {
        method: 'POST',
        json: {
          title,
          description: `Notebook créé pour l'analyse du dépôt GitHub ${selectedRepo?.full_name || ''}`,
        },
      });
      if (data.notebook) {
        const created = data.notebook;
        setNotebooks(prev => [created, ...prev]);
        setSelectedNotebookId(created.id);
        setCreatingNotebook(false);
        setNewNotebookTitle('');
        success(`Notebook « ${title} » créé avec succès !`);
      }
    } catch (e: unknown) {
      toastError(`Erreur de création : ${errorMessage(e)}`);
    }
  };

  // ─── 8. Sauvegarde du Token GitHub ───────────────────────────────────────

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setTokenSaving(true);
    try {
      const data = await api<{ status?: string; error?: string }>('/api/tokens', {
        method: 'POST',
        json: { key: 'GITHUB_TOKEN', value: tokenInput.trim() },
      });
      if (data.status === 'success') {
        success('Token GitHub configuré avec succès !');
        setTokenModalOpen(false);
        setTokenInput('');
        await checkGitHubAuth();
        await loadMyRepos();
      } else {
        toastError(data.error || 'Erreur lors de la sauvegarde du token');
      }
    } catch (e: unknown) {
      toastError(`Erreur: ${errorMessage(e)}`);
    } finally {
      setTokenSaving(false);
    }
  };

  // ─── 9. Lancement de l'Ingestion ─────────────────────────────────────────

  const handleIngest = async () => {
    if (!selectedRepo || !selectedNotebookId) {
      toastError('Veuillez sélectionner un dépôt et un notebook de destination.');
      return;
    }

    setIngesting(true);
    setIngestionError(null);

    try {
      const extensions = fileExtensions
        .split(',')
        .map(ext => ext.trim())
        .filter(ext => ext.startsWith('.'));

      const data = await api<{ status?: string; error?: string }>('/api/github/ingest-repository', {
        method: 'POST',
        json: {
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
          notebook_id: selectedNotebookId,
          branch: branch || undefined,
          max_files: maxFiles,
          file_extensions: extensions.length > 0 ? extensions : undefined,
        },
      });

      if (data.error) {
        setIngestionError(data.error);
        toastError(`Erreur d'ingestion: ${data.error}`);
        return;
      }

      if (data.status === 'success') {
        success(`Dépôt ${selectedRepo.full_name} ingéré avec succès !`);
        onImportSuccess?.(selectedNotebookId, selectedRepo.full_name);
        onClose();
      } else {
        setIngestionError('Réponse inattendue du serveur.');
      }
    } catch (e: unknown) {
      setIngestionError(`Erreur: ${errorMessage(e)}`);
      toastError(`Erreur d'ingestion: ${errorMessage(e)}`);
    } finally {
      setIngesting(false);
    }
  };

  // ─── Filtrage et stats des fichiers ──────────────────────────────────────

  const filteredMyRepos = useMemo(() => {
    return myRepos.filter(r => {
      if (myReposFilter === 'private' && !r.private) return false;
      if (myReposFilter === 'public' && r.private) return false;
      if (myReposSearch.trim()) {
        const q = myReposSearch.toLowerCase();
        return (
          r.full_name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.language?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [myRepos, myReposFilter, myReposSearch]);

  const parsedExtensionList = useMemo(() => {
    return fileExtensions
      .split(',')
      .map(ext => ext.trim().toLowerCase())
      .filter(ext => ext.startsWith('.'));
  }, [fileExtensions]);

  const matchingFiles = useMemo(() => {
    if (!repositoryFiles.length) return [];
    if (!parsedExtensionList.length) return repositoryFiles;
    return repositoryFiles.filter(f => parsedExtensionList.includes(f.extension));
  }, [repositoryFiles, parsedExtensionList]);

  const totalSizeMB = useMemo(() => {
    const bytes = matchingFiles.slice(0, maxFiles).reduce((acc, f) => acc + f.size, 0);
    return (bytes / (1024 * 1024)).toFixed(2);
  }, [matchingFiles, maxFiles]);

  const selectedNotebook = useMemo(() => {
    return notebooks.find(n => n.id === selectedNotebookId);
  }, [notebooks, selectedNotebookId]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-modal-title"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 15 }}
          transition={SPRING_MODAL}
          className="w-full max-w-5xl h-[88vh] max-h-[850px] bg-[var(--notebook-canvas)] border border-[var(--notebook-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* ─── Top Header ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--notebook-border)] bg-[var(--notebook-surface)]/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[color-mix(in_srgb,var(--notebook-accent)_20%,transparent)] to-[color-mix(in_srgb,var(--color-accent-alt)_20%,transparent)] border border-[color-mix(in_srgb,var(--notebook-accent)_30%,transparent)] text-[var(--notebook-accent)]">
                <Github size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="github-modal-title" className="text-base font-semibold text-[var(--text-primary)]">
                    Importer un dépôt GitHub
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[color-mix(in_srgb,var(--notebook-accent)_10%,transparent)] text-[var(--notebook-accent)] border border-[color-mix(in_srgb,var(--notebook-accent)_20%,transparent)]">
                    Sources & Codebase
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Ingérez le code et la documentation de vos dépôts publics ou privés directement dans un Notebook
                </p>
              </div>
            </div>

            {/* GitHub Auth Status Pill & Actions */}
            <div className="flex items-center gap-3">
              {authLoading ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-muted)]">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Vérification...</span>
                </div>
              ) : githubUser ? (
                <button
                  onClick={() => setTokenModalOpen(true)}
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] border border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] text-[var(--color-success)] transition-colors"
                  title="Accès GitHub connecté. Cliquez pour gérer votre token."
                >
                  {githubUser.avatar_url ? (
                    <img src={githubUser.avatar_url} alt={githubUser.login} className="w-4 h-4 rounded-full" />
                  ) : (
                    <ShieldCheck size={14} />
                  )}
                  <span className="font-medium">@{githubUser.login}</span>
                  <span className="text-xs px-1.5 py-0.2 rounded bg-[color-mix(in_srgb,var(--color-success)_20%,transparent)] text-[var(--color-success)]">
                    Privé & Public
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setTokenModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] text-[var(--color-warning)] transition-colors font-medium"
                  title="Ajoutez votre token personnel pour accéder à vos dépôts privés"
                >
                  <Key size={13} />
                  <span>Connecter token (dépôts privés)</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--notebook-accent-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title="Fermer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ─── Main Content Split ────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden flex">
            {/* ─── Colonne de Gauche : Sélecteur de Dépôt (44%) ─────────── */}
            <div className="w-[44%] border-r border-[var(--notebook-border)] flex flex-col bg-[var(--notebook-canvas)]">
              {/* Segmented Tab Controls */}
              <div className="p-4 pb-2 border-b border-[var(--notebook-border)]">
                <div className="grid grid-cols-3 p-1 rounded-xl bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-xs font-medium">
                  <button
                    onClick={() => setSourceTab('my_repos')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                      sourceTab === 'my_repos'
                        ? 'bg-[var(--notebook-accent)] text-white shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <FolderGit2 size={13} />
                    <span>Mes Projets</span>
                    {myRepos.length > 0 && (
                      <span className="text-xs px-1.5 py-0.2 rounded-full bg-[var(--notebook-accent-surface)]">
                        {myRepos.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setSourceTab('search')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                      sourceTab === 'search'
                        ? 'bg-[var(--notebook-accent)] text-white shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Search size={13} />
                    <span>Explorer</span>
                  </button>

                  <button
                    onClick={() => setSourceTab('direct')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                      sourceTab === 'direct'
                        ? 'bg-[var(--notebook-accent)] text-white shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <LinkIcon size={13} />
                    <span>Lien Direct</span>
                  </button>
                </div>
              </div>

              {/* Contenu Onglet 1 : Mes Projets */}
              {sourceTab === 'my_repos' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Filtres & Recherche locale */}
                  <div className="p-3 border-b border-[var(--notebook-border)] space-y-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        value={myReposSearch}
                        onChange={e => setMyReposSearch(e.target.value)}
                        placeholder="Filtrer mes projets..."
                        className="w-full pl-9 pr-8 py-1.5 rounded-lg text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--notebook-accent)]"
                      />
                      {myReposSearch && (
                        <button
                          onClick={() => setMyReposSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Visibilité filter chips */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs">
                        <button
                          onClick={() => setMyReposFilter('all')}
                          className={`px-2 py-0.5 rounded-lg border transition-colors ${
                            myReposFilter === 'all'
                              ? 'bg-[var(--notebook-accent-surface)] text-[var(--text-primary)] border-[var(--border-strong)]'
                              : 'text-[var(--text-muted)] border-transparent hover:bg-[var(--notebook-surface-muted)]'
                          }`}
                        >
                          Tous ({myRepos.length})
                        </button>
                        <button
                          onClick={() => setMyReposFilter('private')}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-colors ${
                            myReposFilter === 'private'
                              ? 'bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]'
                              : 'text-[var(--text-muted)] border-transparent hover:bg-[var(--notebook-surface-muted)]'
                          }`}
                        >
                          <Lock size={10} />
                          <span>Privés ({myRepos.filter(r => r.private).length})</span>
                        </button>
                        <button
                          onClick={() => setMyReposFilter('public')}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-colors ${
                            myReposFilter === 'public'
                              ? 'bg-[color-mix(in_srgb,var(--color-info)_20%,transparent)] text-[var(--color-info)] border-[color-mix(in_srgb,var(--color-info)_30%,transparent)]'
                              : 'text-[var(--text-muted)] border-transparent hover:bg-[var(--notebook-surface-muted)]'
                          }`}
                        >
                          <Globe size={10} />
                          <span>Publics ({myRepos.filter(r => !r.private).length})</span>
                        </button>
                      </div>

                      <button
                        onClick={loadMyRepos}
                        disabled={myReposLoading}
                        className="p-1 rounded hover:bg-[var(--notebook-surface-muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Actualiser la liste"
                      >
                        <RefreshCw size={12} className={myReposLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>

                  {/* Liste des dépôts personnels */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                    {myReposLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                        <Loader2 size={20} className="animate-spin text-[var(--notebook-accent)]" />
                        <span className="text-xs">Chargement de vos dépôts...</span>
                      </div>
                    ) : !githubUser ? (
                      <div className="p-6 text-center">
                        <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] text-[var(--color-warning)]">
                          <Lock size={20} />
                        </div>
                        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                          Accédez à vos dépôts privés
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] mb-4 max-w-xs mx-auto">
                          Configurez un Personal Access Token GitHub avec les droits de lecture pour importer directement vos dépôts privés et organisationnels.
                        </p>
                        <button
                          onClick={() => setTokenModalOpen(true)}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--notebook-accent)] text-white hover:opacity-90 shadow-md transition-all inline-flex items-center gap-2"
                        >
                          <Key size={14} />
                          <span>Ajouter mon Token GitHub</span>
                        </button>
                      </div>
                    ) : filteredMyRepos.length === 0 ? (
                      <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                        <FolderOpen className="mx-auto mb-2 opacity-40" size={24} />
                        Aucun dépôt ne correspond à ce filtre
                      </div>
                    ) : (
                      filteredMyRepos.map(repo => {
                        const isSelected = selectedRepo?.full_name === repo.full_name;
                        return (
                          <div
                            key={repo.full_name}
                            onClick={() => setSelectedRepo(repo)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-[var(--notebook-accent)]/10 border-[var(--notebook-accent)]/60 shadow-sm'
                                : 'bg-[var(--notebook-surface)]/50 border-[var(--notebook-border)] hover:bg-[var(--notebook-surface)] hover:border-[var(--notebook-border)]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  {repo.private ? (
                                    <span className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.2 rounded bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)] border border-[color-mix(in_srgb,var(--color-warning)_25%,transparent)] flex-shrink-0">
                                      <Lock size={9} />
                                      Privé
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.2 rounded bg-[color-mix(in_srgb,var(--color-info)_15%,transparent)] text-[var(--color-info)] border border-[color-mix(in_srgb,var(--color-info)_25%,transparent)] flex-shrink-0">
                                      <Globe size={9} />
                                      Public
                                    </span>
                                  )}
                                  <h3 className="font-semibold text-xs text-[var(--text-primary)] truncate">
                                    {repo.repo}
                                  </h3>
                                </div>

                                <p className="text-xs text-[var(--text-muted)] line-clamp-1 mb-2">
                                  {repo.description || 'Aucune description'}
                                </p>

                                <div className="flex items-center gap-3 text-xs text-[var(--text-dimmed)]">
                                  <div className="flex items-center gap-1">
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: LANGUAGE_COLORS[repo.language] || '#999' }}
                                    />
                                    <span>{repo.language}</span>
                                  </div>
                                  {repo.stars > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Star size={10} fill="currentColor" />
                                      <span>{repo.stars}</span>
                                    </div>
                                  )}
                                  {repo.default_branch && (
                                    <span className="opacity-75">🌿 {repo.default_branch}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex-shrink-0 mt-0.5">
                                {isSelected ? (
                                  <div className="w-5 h-5 rounded-full bg-[var(--notebook-accent)] flex items-center justify-center text-white">
                                    <Check size={12} strokeWidth={3} />
                                  </div>
                                ) : (
                                  <ChevronRight size={14} className="text-[var(--text-muted)] opacity-50" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Contenu Onglet 2 : Recherche Globale */}
              {sourceTab === 'search' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-[var(--notebook-border)]">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Rechercher sur GitHub (ex: langchain, fastify)..."
                        className="w-full pl-9 pr-8 py-2 rounded-lg text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--notebook-accent)]"
                      />
                      {searchLoading && (
                        <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
                      )}
                    </div>

                    {searchError && (
                      <p className="mt-2 text-xs text-[var(--color-error)] flex items-center gap-1.5">
                        <AlertCircle size={12} />
                        {searchError}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                    {searchResults.length === 0 && !searchLoading && searchQuery.trim() && (
                      <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                        <Github className="mx-auto mb-2 opacity-40" size={24} />
                        Aucun dépôt trouvé
                      </div>
                    )}

                    {searchResults.length === 0 && !searchLoading && !searchQuery.trim() && (
                      <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                        <Search className="mx-auto mb-2 opacity-40" size={24} />
                        Tapez un mot-clé ou un nom de projet pour explorer
                      </div>
                    )}

                    {searchResults.map(repo => {
                      const isSelected = selectedRepo?.full_name === repo.full_name;
                      return (
                        <div
                          key={repo.full_name}
                          onClick={() => setSelectedRepo(repo)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[var(--notebook-accent)]/10 border-[var(--notebook-accent)]/60 shadow-sm'
                              : 'bg-[var(--notebook-surface)]/50 border-[var(--notebook-border)] hover:bg-[var(--notebook-surface)] hover:border-[var(--notebook-border)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-xs text-[var(--text-primary)] truncate mb-1">
                                {repo.full_name}
                              </h3>
                              <p className="text-xs text-[var(--text-muted)] line-clamp-1 mb-2">
                                {repo.description || 'Aucune description'}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-[var(--text-dimmed)]">
                                <span className="flex items-center gap-1">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: LANGUAGE_COLORS[repo.language] || '#999' }}
                                  />
                                  {repo.language}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Star size={10} fill="currentColor" />
                                  {repo.stars.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <GitFork size={10} />
                                  {repo.forks.toLocaleString()}
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-[var(--notebook-accent)] flex items-center justify-center text-white">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contenu Onglet 3 : Lien direct */}
              {sourceTab === 'direct' && (
                <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-primary)] block mb-1.5">
                        URL du dépôt ou identifiant direct
                      </label>
                      <p className="text-xs text-[var(--text-muted)] mb-3">
                        Entrez l'URL complète ou la notation <code className="px-1 py-0.5 rounded bg-[var(--notebook-surface-muted)]">owner/repo</code>. Fonctionne avec les dépôts <strong>publics et privés</strong>.
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                          <input
                            type="text"
                            value={directInput}
                            onChange={e => setDirectInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleInspectDirect()}
                            placeholder="https://github.com/mon-org/mon-projet-prive"
                            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--notebook-accent)]"
                          />
                        </div>
                        <button
                          onClick={handleInspectDirect}
                          disabled={directLoading || !directInput.trim()}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--notebook-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
                        >
                          {directLoading ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                          <span>Inspecter</span>
                        </button>
                      </div>

                      {directError && (
                        <div className="mt-3 p-2.5 rounded-lg bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-error)_20%,transparent)] text-[var(--color-error)] text-xs flex items-center gap-2">
                          <AlertCircle size={14} className="flex-shrink-0" />
                          <span>{directError}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-[var(--notebook-surface)] border border-[var(--notebook-border)] space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                        <Lock size={13} className="text-[var(--color-warning)]" />
                        <span>Dépôts privés pris en charge</span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                        Si le dépôt est privé, Jarvis utilise votre token GitHub configuré avec le scope <code>repo</code> pour analyser l'arborescence et récupérer les fichiers en toute sécurité.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Colonne de Droite : Hub de Configuration & Ingestion (56%) ── */}
            <div className="w-[56%] flex flex-col bg-[var(--notebook-surface)]/30">
              {!selectedRepo ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-[color-mix(in_srgb,var(--notebook-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--notebook-accent)_20%,transparent)] text-[var(--notebook-accent)] mb-4 shadow-inner">
                    <Github size={32} />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                    Sélectionnez un dépôt GitHub
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] max-w-sm mb-6">
                    Choisissez l'un de vos projets dans la liste de gauche ou collez une URL directe pour configurer les fichiers à ingérer.
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-w-md w-full text-left text-xs">
                    <div className="p-3 rounded-xl bg-[var(--notebook-canvas)] border border-[var(--notebook-border)]">
                      <span className="font-semibold block text-[var(--text-primary)] mb-1">🔒 Dépôts Privés</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Accès authentifié à votre code propriétaire via votre token personnel.
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--notebook-canvas)] border border-[var(--notebook-border)]">
                      <span className="font-semibold block text-[var(--text-primary)] mb-1">⚡ Ingestion IA</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Indexation vectorielle et citations précises dans le Notebook sélectionné.
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Selected Repo Header Card */}
                  <div className="p-5 border-b border-[var(--notebook-border)] bg-[var(--notebook-surface)]/60">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-bold text-[var(--text-primary)]">
                            {selectedRepo.full_name}
                          </h3>
                          {selectedRepo.private ? (
                            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)] border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]">
                              <Lock size={10} />
                              Dépôt Privé
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-info)_15%,transparent)] text-[var(--color-info)] border border-[color-mix(in_srgb,var(--color-info)_30%,transparent)]">
                              <Globe size={10} />
                              Dépôt Public
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                          {selectedRepo.description || 'Aucune description fournie.'}
                        </p>
                      </div>

                      <a
                        href={selectedRepo.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--notebook-canvas)] border border-[var(--notebook-border)] transition-colors flex-shrink-0"
                      >
                        <span>GitHub</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>

                  {/* Scrollable Configuration Options */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
                    {/* Étape 1 : Notebook de destination */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 uppercase tracking-wider">
                          <BookOpen size={14} className="text-[var(--notebook-accent)]" />
                          <span>1. Notebook de destination</span>
                        </label>
                        <button
                          onClick={() => setCreatingNotebook(true)}
                          className="text-xs text-[var(--notebook-accent)] hover:underline flex items-center gap-1 font-semibold"
                        >
                          <Plus size={12} />
                          <span>Nouveau notebook</span>
                        </button>
                      </div>

                      {creatingNotebook ? (
                        <div className="p-3 rounded-xl bg-[var(--notebook-canvas)] border border-[var(--notebook-border)] space-y-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">Nom du nouveau notebook</span>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newNotebookTitle}
                              onChange={e => setNewNotebookTitle(e.target.value)}
                              placeholder={`Import ${selectedRepo.repo}`}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)]"
                            />
                            <button
                              onClick={handleCreateNotebook}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--notebook-accent)] text-white hover:opacity-90"
                            >
                              Créer
                            </button>
                            <button
                              onClick={() => setCreatingNotebook(false)}
                              className="px-2 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <select
                          value={selectedNotebookId || ''}
                          onChange={e => setSelectedNotebookId(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--notebook-accent)] font-medium"
                        >
                          {notebooks.length === 0 ? (
                            <option value="" disabled>Aucun notebook disponible</option>
                          ) : (
                            notebooks.map(nb => {
                              const count = nb.sourcesCount ?? (Array.isArray(nb.sources) ? nb.sources.length : 0);
                              return (
                                <option key={nb.id} value={nb.id}>
                                  📓 {nb.title} ({count} source{count !== 1 ? 's' : ''})
                                </option>
                              );
                            })
                          )}
                        </select>
                      )}
                    </div>

                    {/* Étape 2 : Filtres des fichiers */}
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 uppercase tracking-wider">
                        <Sliders size={14} className="text-[var(--color-accent-alt)]" />
                        <span>2. Fichiers et extensions</span>
                      </label>

                      {/* Presets chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_EXTENSIONS.map(preset => {
                          const isActive = fileExtensions === preset.extensions;
                          return (
                            <button
                              key={preset.name}
                              onClick={() => setFileExtensions(preset.extensions)}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                                isActive
                                  ? 'bg-[var(--notebook-accent)] text-white border-[var(--notebook-accent)] shadow-sm'
                                  : 'bg-[var(--notebook-surface-muted)] border-[var(--notebook-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {preset.name}
                            </button>
                          );
                        })}
                      </div>

                      <input
                        type="text"
                        value={fileExtensions}
                        onChange={e => setFileExtensions(e.target.value)}
                        placeholder=".ts, .tsx, .py, .md, .json"
                        className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--notebook-accent)]"
                      />

                      {/* Aperçu des fichiers correspondants */}
                      <div className="p-3 rounded-xl bg-[var(--notebook-canvas)] border border-[var(--notebook-border)] flex items-center justify-between">
                        {filesLoading ? (
                          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                            <Loader2 size={14} className="animate-spin text-[var(--notebook-accent)]" />
                            <span>Scan de l'arbre du dépôt...</span>
                          </div>
                        ) : filesError ? (
                          <div className="text-xs text-[var(--color-error)] flex items-center gap-1.5">
                            <AlertCircle size={14} />
                            <span>{filesError}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <FileCode size={16} className="text-[var(--notebook-accent)]" />
                              <div className="text-xs">
                                <span className="font-bold text-[var(--text-primary)]">
                                  {Math.min(matchingFiles.length, maxFiles)}
                                </span>
                                <span className="text-[var(--text-muted)]">
                                  {' '}/ {matchingFiles.length} fichiers retenus
                                </span>
                              </div>
                            </div>
                            <div className="text-xs font-semibold text-[var(--text-muted)]">
                              ~{totalSizeMB} MB
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Étape 3 : Branche & Plafond de fichiers */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-primary)] block">
                          Branche Git
                        </label>
                        <input
                          type="text"
                          value={branch}
                          onChange={e => setBranch(e.target.value)}
                          placeholder={selectedRepo.default_branch || 'main'}
                          className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[var(--text-primary)] block">
                            Limite max de fichiers
                          </label>
                          <span className="text-xs font-semibold text-[var(--notebook-accent)]">
                            {maxFiles} fichiers
                          </span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="200"
                          step="10"
                          value={maxFiles}
                          onChange={e => setMaxFiles(parseInt(e.target.value, 10))}
                          className="w-full accent-[var(--notebook-accent)]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Actions Footer */}
                  <div className="p-5 border-t border-[var(--notebook-border)] bg-[var(--notebook-surface)]/80 space-y-3">
                    {ingestionError && (
                      <div className="p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-error)_20%,transparent)] text-[var(--color-error)] text-xs flex items-center gap-2">
                        <XCircle size={15} className="flex-shrink-0" />
                        <span className="flex-1">{ingestionError}</span>
                        <button
                          onClick={() => setIngestionError(null)}
                          className="text-xs underline hover:opacity-80"
                        >
                          Fermer
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        Destination : <strong className="text-[var(--text-primary)]">{selectedNotebook?.title || 'Aucun sélectionné'}</strong>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={onClose}
                          disabled={ingesting}
                          className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--notebook-surface-muted)] transition-colors"
                        >
                          Annuler
                        </button>

                        <button
                          onClick={handleIngest}
                          disabled={ingesting || !selectedRepo || !selectedNotebookId}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[var(--notebook-accent)] to-[var(--color-accent-alt)] hover:from-[var(--notebook-accent)] hover:to-[var(--color-accent-alt)] disabled:opacity-50 transition-all shadow-md flex items-center gap-2"
                        >
                          {ingesting ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Ingestion en cours...</span>
                            </>
                          ) : (
                            <>
                              <FolderGit2 size={14} />
                              <span>Importer le dépôt dans le Notebook</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ─── Modal / Tiroir Token GitHub ─────────────────────────────────── */}
        <AnimatePresence>
          {tokenModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setTokenModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md bg-[var(--notebook-canvas)] border border-[var(--notebook-border)] rounded-2xl p-6 shadow-2xl space-y-4"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-[var(--text-primary)] font-bold text-sm">
                    <Key size={18} className="text-[var(--color-warning)]" />
                    <span>Configuration Token GitHub</span>
                  </div>
                  <button
                    onClick={() => setTokenModalOpen(false)}
                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Pour accéder à vos dépôts privés et éviter les quotas de l'API publique, générez un <strong>Personal Access Token (classic ou fine-grained)</strong> avec la permission <code>repo</code>.
                </p>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--text-primary)] block">
                    Personal Access Token (PAT)
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--notebook-surface-muted)] border border-[var(--notebook-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--notebook-accent)] font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setTokenModalOpen(false)}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={handleSaveToken}
                    disabled={tokenSaving || !tokenInput.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[var(--notebook-accent)] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
                  >
                    {tokenSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>Enregistrer et Connecter</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
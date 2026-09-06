/**
 * GitHubRepositoryImportModal — Modal pour l'ingestion de dépôts GitHub publics
 * 
 * Permet de :
 * - Rechercher des dépôts GitHub publics
 * - Prévisualiser la structure du dépôt
 * - Sélectionner les fichiers à ingérer (par extension)
 * - Choisir le notebook de destination
 * - Lancer l'ingestion complète
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Github, Loader2, CheckCircle2, XCircle, AlertCircle,
  Code2, FileCode, FolderOpen, Star, GitFork, Tag,
  ChevronDown, ChevronRight, X, ExternalLink, Filter, RefreshCw, BookOpen
} from 'lucide-react';
import { useToast } from '../ui/Toast.js';

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
  sources: any[];
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
};

const DEFAULT_EXTENSIONS = DEFAULT_CODE_EXTENSIONS.join(', ');

// Animation spring pour les interactions UI
const SPRING_MODAL = { type: 'spring' as const, bounce: 0, duration: 0.35 };
const SPRING_SNAPPY = { type: 'spring' as const, bounce: 0, duration: 0.2 };

export function GitHubRepositoryImportModal({
  onClose,
  onImportSuccess,
  defaultNotebookId,
}: GitHubRepositoryImportModalProps) {
  const { success, error: toastError, warning } = useToast();
  
  // État de recherche de repo
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // État de la liste des fichiers
  const [filesLoading, setFilesLoading] = useState(false);
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // État des notebooks
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(defaultNotebookId || null);

  // Options d'ingestion
  const [fileExtensions, setFileExtensions] = useState<string>(DEFAULT_EXTENSIONS);
  const [maxFiles, setMaxFiles] = useState<number>(100);
  const [branch, setBranch] = useState<string>('');

  // État d'ingestion
  const [ingesting, setIngesting] = useState(false);
  const [ingestionProgress, setIngestionProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [ingestionError, setIngestionError] = useState<string | null>(null);

  // Charger les notebooks existants
  const loadNotebooks = useCallback(async () => {
    setNotebooksLoading(true);
    setFilesError(null);
    try {
      const res = await fetch('/api/notebooks');
      const data = await res.json();
      if (data.notebooks) {
        setNotebooks(data.notebooks);
        // Sélectionner le premier notebook si aucun n'est sélectionné
        if (!selectedNotebookId && data.notebooks.length > 0) {
          setSelectedNotebookId(data.notebooks[0].id);
        }
      }
    } catch (e: any) {
      setFilesError(`Erreur de chargement des notebooks: ${e.message}`);
    } finally {
      setNotebooksLoading(false);
    }
  }, [selectedNotebookId]);

  // Charger les notebooks au montage
  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  // Rechercher des dépôts GitHub
  const searchRepositories = useCallback(async (query: string) => {
    if (!query.trim()) {
      setRepositories([]);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    
    try {
      const params = new URLSearchParams({
        query: `${query} in:name,description,readme`,
        limit: '10'
      });
      
      const res = await fetch(`/api/github/search?${params}`);
      const data = await res.json();
      
      if (data.error) {
        setSearchError(data.error);
        setRepositories([]);
        return;
      }

      const repos: Repository[] = (data.repos || []).map((r: any) => ({
        full_name: r.full_name,
        owner: r.full_name.split('/')[0],
        repo: r.full_name.split('/')[1],
        description: r.description || 'Aucune description',
        language: r.language || 'Unknown',
        stars: r.stars || 0,
        forks: r.forks || 0,
        topics: r.topics || [],
        html_url: r.html_url,
      }));
      
      setRepositories(repos);
      
      // Sélectionner le premier résultat si aucun n'est sélectionné
      if (repos.length > 0 && !selectedRepo) {
        setSelectedRepo(repos[0]);
      }
    } catch (e: any) {
      setSearchError(`Erreur de recherche: ${e.message}`);
      setRepositories([]);
    } finally {
      setSearchLoading(false);
    }
  }, [selectedRepo]);

  // Recherche avec debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchRepositories(searchQuery);
      } else {
        setRepositories([]);
        setSelectedRepo(null);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [searchQuery, searchRepositories]);

  // Charger les fichiers du dépôt sélectionné
  const loadRepositoryFiles = useCallback(async (owner: string, repo: string) => {
    setFilesLoading(true);
    setFilesError(null);
    setRepositoryFiles([]);
    
    try {
      const parsedExtensions = fileExtensions.split(',')
        .map(ext => ext.trim())
        .filter(ext => ext.startsWith('.'));
      
      const params = new URLSearchParams({
        owner,
        repo,
        max_files: '500', // Limite élevée pour l'aperçu
      });
      
      const res = await fetch(`/api/github/repo-files?${params}`);
      const data = await res.json();
      
      if (data.error) {
        setFilesError(data.error);
        return;
      }

      const files: RepositoryFile[] = (data.files || [])
        .filter((f: any) => f.type === 'blob') // Uniquement les fichiers, pas les dossiers
        .map((f: any) => ({
          path: f.path,
          type: 'file',
          size: f.size || 0,
          sha: f.sha,
          extension: f.path.split('.').pop()?.toLowerCase() || '',
        }));
      
      setRepositoryFiles(files);
    } catch (e: any) {
      setFilesError(`Erreur de chargement des fichiers: ${e.message}`);
    } finally {
      setFilesLoading(false);
    }
  }, [fileExtensions]);

  // Charger les fichiers quand un repo est sélectionné
  useEffect(() => {
    if (selectedRepo) {
      loadRepositoryFiles(selectedRepo.owner, selectedRepo.repo);
    } else {
      setRepositoryFiles([]);
    }
  }, [selectedRepo, loadRepositoryFiles]);

  // Gestion de l'expansion des dossiers
  const togglePathExpansion = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  // Filtrer les fichiers par extensions sélectionnées
  const filteredFiles = repositoryFiles.filter(file => {
    const parsedExtensions = fileExtensions.split(',')
      .map(ext => ext.trim().toLowerCase());
    return parsedExtensions.includes(`.${file.extension}`) || parsedExtensions.includes(file.extension);
  });

  // Compter les fichiers par extension
  const filesByExtension = filteredFiles.reduce((acc, file) => {
    const ext = file.extension || 'other';
    acc[ext] = (acc[ext] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculer la taille totale estimée
  const totalSize = filteredFiles.reduce((sum, file) => sum + file.size, 0);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

  // Formater les extensions pour l'API
  const formatExtensionsForAPI = useCallback(() => {
    return fileExtensions.split(',')
      .map(ext => ext.trim())
      .filter(ext => ext.startsWith('.'));
  }, [fileExtensions]);

  // Lancer l'ingestion du dépôt
  const handleIngest = useCallback(async () => {
    if (!selectedRepo || !selectedNotebookId) {
      toastError('Veuillez sélectionner un dépôt GitHub et un notebook de destination');
      return;
    }

    setIngesting(true);
    setIngestionError(null);
    setIngestionProgress(null);

    try {
      const extensions = formatExtensionsForAPI();
      
      const response = await fetch('/api/github/ingest-repository', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
          notebook_id: selectedNotebookId,
          branch: branch || undefined,
          max_files: maxFiles,
          file_extensions: extensions.length > 0 ? extensions : undefined,
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        setIngestionError(data.error);
        toastError(`Erreur d'ingestion: ${data.error}`);
        return;
      }

      if (data.status === 'success') {
        success(`Dépôt ${selectedRepo.full_name} ingéré avec succès dans le notebook !`);
        onImportSuccess?.(selectedNotebookId, selectedRepo.full_name);
        onClose();
      } else {
        setIngestionError('Réponse inattendue du serveur');
      }
    } catch (e: any) {
      setIngestionError(`Erreur lors de l'ingestion: ${e.message}`);
      toastError(`Erreur d'ingestion: ${e.message}`);
    } finally {
      setIngesting(false);
    }
  }, [selectedRepo, selectedNotebookId, branch, maxFiles, formatExtensionsForAPI, onImportSuccess, onClose, toastError, success]);

  // Créer un nouveau notebook
  const createNewNotebook = useCallback(async () => {
    try {
      const title = `Import GitHub - ${selectedRepo?.full_name || 'Dépôt GitHub'}`;
      const description = `Notebook créé pour l'import du dépôt ${selectedRepo?.full_name || ''}`;
      
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      
      const data = await res.json();
      if (data.notebook) {
        setNotebooks(prev => [...prev, data.notebook]);
        setSelectedNotebookId(data.notebook.id);
        success('Nouveau notebook créé');
      }
    } catch (e: any) {
      toastError(`Erreur de création du notebook: ${e.message}`);
    }
  }, [selectedRepo, success, toastError]);

  // Gestion des extensions présélectionnées
  const presetExtensions = [
    { name: 'Toutes', extensions: DEFAULT_CODE_EXTENSIONS.join(', ') },
    { name: 'Frontend', extensions: '.ts,.tsx,.js,.jsx,.css,.html,.json' },
    { name: 'Backend', extensions: '.ts,.js,.py,.java,.go,.rs,.cpp,.c' },
    { name: 'Documentation', extensions: '.md,.txt,.json,.yaml,.yml' },
    { name: 'Configuration', extensions: '.json,.yaml,.yml,.toml,.config,.env' },
    { name: 'TypeScript', extensions: '.ts,.tsx' },
    { name: 'Python', extensions: '.py' },
    { name: 'Rust', extensions: '.rs' },
    { name: 'Go', extensions: '.go' },
  ];

  const applyExtensionPreset = useCallback((extensions: string) => {
    setFileExtensions(extensions);
  }, []);

  return (
    <AnimatePresence>
      {true && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={SPRING_MODAL}
            className="w-[90vw] max-w-4xl h-[85vh] max-h-[800px] bg-[var(--bg-base)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,165,233,0.1)' }}>
                  <Github size={20} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <h2 id="modal-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Importer un dépôt GitHub
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Ajoutez le contenu d'un dépôt public à votre base de connaissances
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: 'var(--text-muted)' }}
                  title="Fermer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
              {/* Left Panel - Repository Search */}
              <div className="w-1/2 border-r flex flex-col" style={{ borderColor: 'var(--border-base)' }}>
                {/* Search Section */}
                <div className="p-5 border-b" style={{ borderColor: 'var(--border-base)' }}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher un dépôt GitHub..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm bg-[var(--bg-input)] border" 
                      style={{ borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
                    />
                    {searchLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                  
                  {searchError && (
                    <motion.p 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 text-xs flex items-center gap-2"
                      style={{ color: 'var(--color-error)' }}
                    >
                      <AlertCircle size={12} />
                      {searchError}
                    </motion.p>
                  )}
                </div>

                {/* Repository Results */}
                <div className="flex-1 overflow-y-auto">
                  {repositories.length === 0 && !searchLoading && searchQuery.trim() && (
                    <div className="p-5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Github className="mx-auto mb-2 opacity-50" size={24} />
                      Aucun dépôt trouvé
                    </div>
                  )}

                  {repositories.length === 0 && !searchLoading && !searchQuery.trim() && (
                    <div className="p-5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Search className="mx-auto mb-2 opacity-50" size={24} />
                      Commencez à taper pour rechercher un dépôt
                    </div>
                  )}

                  {repositories.map((repo) => (
                    <motion.div
                      key={repo.full_name}
                      whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                      className={`p-3 border-b cursor-pointer transition-colors ${selectedRepo?.full_name === repo.full_name ? 'bg-white/5' : ''}`}
                      style={{ borderColor: 'var(--border-base)' }}
                      onClick={() => setSelectedRepo(repo)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                               style={{ 
                                 backgroundColor: LANGUAGE_COLORS[repo.language] || 'var(--bg-input)' 
                               }}>
                            <Code2 size={16} style={{ color: '#fff' }} />
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                              {repo.full_name}
                            </h3>
                            {repo.language && (
                              <span 
                                className="text-[10px] px-2 py-0.5 rounded"
                                style={{ 
                                  backgroundColor: LANGUAGE_COLORS[repo.language] || 'var(--bg-input)',
                                  color: '#fff'
                                }}
                              >
                                {repo.language}
                              </span>
                            )}
                          </div>
                          
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            {repo.description || 'Aucune description'}
                          </p>
                          
                          <div className="flex items-center gap-3 mt-2 text-[10px]">
                            <div className="flex items-center gap-1" style={{ color: 'var(--text-dimmed)' }}>
                              <Star size={10} fill="currentColor" />
                              <span>{repo.stars?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex items-center gap-1" style={{ color: 'var(--text-dimmed)' }}>
                              <GitFork size={10} />
                              <span>{repo.forks?.toLocaleString() || 0}</span>
                            </div>
                            {repo.topics.length > 0 && (
                              <div className="flex gap-1">
                                {repo.topics.slice(0, 2).map(topic => (
                                  <span 
                                    key={topic} 
                                    className="px-1.5 py-0.5 rounded text-[10px]"
                                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
                                  >
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex-shrink-0">
                          {selectedRepo?.full_name === repo.full_name && (
                            <CheckCircle2 size={18} style={{ color: 'var(--color-success)' }} />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Right Panel - Files & Options */}
              <div className="w-1/2 flex flex-col">
                {/* Selected Repository Info */}
                {selectedRepo && (
                  <div className="p-5 border-b" style={{ borderColor: 'var(--border-base)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileCode size={16} style={{ color: 'var(--accent-primary)' }} />
                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                          Structure du dépôt
                        </span>
                      </div>
                      
                      <button
                        onClick={() => loadRepositoryFiles(selectedRepo.owner, selectedRepo.repo)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                        style={{ color: 'var(--text-muted)' }}
                        title="Rafraîchir"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>

                    {filesError && (
                      <motion.p 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-3 text-xs flex items-center gap-2"
                        style={{ color: 'var(--color-error)' }}
                      >
                        <AlertCircle size={12} />
                        {filesError}
                      </motion.p>
                    )}

                    {filesLoading && (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Chargement des fichiers...
                        </span>
                      </div>
                    )}

                    {!filesLoading && repositoryFiles.length > 0 && (
                      <>
                        {/* Files Statistics */}
                        <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-input)' }}>
                          <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                            Fichiers sélectionnés
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div className="text-center">
                              <div className="text-xl font-bold" style={{ color: 'var(--accent-primary)' }}>
                                {filteredFiles.length}
                              </div>
                              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                fichiers
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl font-bold" style={{ color: 'var(--accent-secondary)' }}>
                                {totalSizeMB} MB
                              </div>
                              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                total
                              </div>
                            </div>
                          </div>
                          
                          {/* Top extensions */}
                          <div className="mt-3 pt-3 border-t flex flex-wrap gap-1" style={{ borderColor: 'var(--border-base)' }}>
                            {Object.entries(filesByExtension)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 5)
                              .map(([ext, count]) => (
                                <span 
                                  key={ext}
                                  className="text-[10px] px-2 py-1 rounded"
                                  style={{ 
                                    backgroundColor: 'rgba(59,130,246,0.1)', 
                                    color: 'var(--accent-primary)' 
                                  }}
                                >
                                  {ext} ({count})
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* File Filter Options */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                              Extensions de fichiers
                            </label>
                            <div className="flex items-center gap-1">
                              <Filter size={12} style={{ color: 'var(--text-muted)' }} />
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-1 mb-2">
                            {presetExtensions.map((preset) => (
                              <button
                                key={preset.name}
                                onClick={() => applyExtensionPreset(preset.extensions)}
                                className="text-[10px] px-2 py-1 rounded-full border transition-colors"
                                style={{
                                  borderColor: 'var(--border-base)',
                                  backgroundColor: 'var(--bg-input)',
                                  color: 'var(--text-muted)'
                                }}
                              >
                                {preset.name}
                              </button>
                            ))}
                          </div>
                          
                          <input
                            type="text"
                            value={fileExtensions}
                            onChange={(e) => setFileExtensions(e.target.value)}
                            placeholder="ex: .ts,.tsx,.js,.md"
                            className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--bg-input)] border"
                            style={{ borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
                          />
                          <p className="text-[10px] mt-1" style={{ color: 'var(--text-dimmed)' }}>
                            Extensions séparées par des virgules, doivent commencer par un point
                          </p>
                        </div>

                        {/* Branch Selection */}
                        <div className="mb-4">
                          <label className="text-xs font-medium flex items-center gap-1 mb-2" style={{ color: 'var(--text-primary)' }}>
                            Branche à ingérer
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={branch}
                              onChange={(e) => setBranch(e.target.value)}
                              className="flex-1 px-3 py-2 text-xs rounded-lg bg-[var(--bg-input)] border"
                              style={{ borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
                            >
                              <option value="">Branche par défaut (main/master)</option>
                              <option value="main">main</option>
                              <option value="master">master</option>
                              <option value="develop">develop</option>
                              <option value="dev">dev</option>
                            </select>
                          </div>
                        </div>

                        {/* Max Files */}
                        <div className="mb-4">
                          <label className="text-xs font-medium flex items-center gap-1 mb-2" style={{ color: 'var(--text-primary)' }}>
                            Nombre max de fichiers
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={maxFiles}
                              onChange={(e) => setMaxFiles(Math.min(Math.max(1, parseInt(e.target.value) || 1), 200))}
                              min="1"
                              max="200"
                              className="flex-1 px-3 py-2 text-xs rounded-lg bg-[var(--bg-input)] border"
                              style={{ borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
                            />
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              /200
                            </span>
                          </div>
                          <div className="w-full bg-[var(--bg-input)] rounded-full h-1 mt-2 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1 rounded-full transition-all"
                              style={{ width: `${(maxFiles / 200) * 100}%` }}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {!filesLoading && repositoryFiles.length === 0 && (
                      <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                        <FolderOpen className="mx-auto mb-2 opacity-50" size={24} />
                        Aucun fichier trouvé dans ce dépôt
                      </div>
                    )}
                  </div>
                )}

                {/* Destination Notebook */}
                <div className="p-5 border-b" style={{ borderColor: 'var(--border-base)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen size={16} style={{ color: 'var(--notebook-accent)' }} />
                      <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                        Notebook de destination
                      </span>
                    </div>
                    
                    <button
                      onClick={createNewNotebook}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-white/10"
                      style={{ 
                        backgroundColor: 'var(--notebook-accent)', 
                        color: '#fff',
                        border: '1px solid rgba(139,92,246,0.2)'
                      }}
                    >
                      + Nouveau
                    </button>
                  </div>
                  
                  {notebooksLoading ? (
                    <div className="flex items-center gap-2 p-2">
                      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement...</span>
                    </div>
                  ) : (
                    <select
                      value={selectedNotebookId || ''}
                      onChange={(e) => setSelectedNotebookId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--bg-input)] border"
                      style={{ borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
                    >
                      {notebooks.length === 0 ? (
                        <option value="" disabled>
                          Aucun notebook disponible
                        </option>
                      ) : (
                        notebooks.map((notebook) => (
                          <option key={notebook.id} value={notebook.id}>
                            {notebook.title} {notebook.sources.length > 0 && 
                              `(${notebook.sources.length} sources)`}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>

                {/* Actions */}
                <div className="p-5 flex-1 flex flex-col justify-end">
                  {ingestionError && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-4 p-3 rounded-lg flex items-center gap-2"
                      style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
                    >
                      <XCircle size={16} style={{ color: '#f87171' }} />
                      <span className="text-xs" style={{ color: '#f87171' }}>{ingestionError}</span>
                      <button 
                        onClick={() => setIngestionError(null)}
                        className="ml-auto text-xs opacity-70 hover:opacity-100"
                        style={{ color: '#f87171' }}
                      >
                        Effacer
                      </button>
                    </motion.div>
                  )}

                  {ingestionProgress && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-4 p-3 rounded-lg"
                      style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--accent-primary)' }}>
                          Ingestion en cours...
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span style={{ color: 'var(--text-muted)' }}>
                          {ingestionProgress.current} / {ingestionProgress.total} fichiers
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {ingestionProgress.status}
                        </span>
                      </div>
                      <div className="w-full bg-[var(--bg-input)] rounded-full h-1 mt-2 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1 rounded-full transition-all"
                          style={{ 
                            width: `${(ingestionProgress.current / ingestionProgress.total) * 100}%` 
                          }}
                        />
                      </div>
                    </motion.div>
                  )}

                  <motion.button
                    onClick={handleIngest}
                    disabled={!selectedRepo || !selectedNotebookId || ingesting}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--notebook-accent))',
                      color: '#fff',
                      boxShadow: '0 4px 15px rgba(59,130,246,0.25)',
                    }}
                  >
                    {ingesting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Ingestion en cours...
                      </>
                    ) : (
                      <>
                        <Github size={16} />
                        Importer le dépôt dans le notebook
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook personnalisé pour gérer l'état du modal
export function useGitHubImportModal() {
  const [isOpen, setIsOpen] = useState(false);
  
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  
  return { isOpen, open, close };
}
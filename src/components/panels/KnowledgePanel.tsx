import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, RefreshCw, Search, CheckCircle2, AlertTriangle, Layers,
  FileText, Link2, Hash, Tag, ListTodo, ShieldAlert, Sparkles,
  Code2, Loader2, X
} from 'lucide-react';
import { useToast } from '../ui/Toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface KnowledgeDashboardData {
  status: string;
  generatedAt: string;
  workspace: {
    selfRoot: string;
    activeWorkspace: string;
    sandboxActive: boolean;
  };
  graph: {
    lastIndexed: string;
    totalFiles: number;
    totalLines: number;
    totalEntities: number;
    totalExports: number;
    totalImports: number;
    averageFileSize: number;
    filesByExtension: Record<string, number>;
    entitiesByType: Record<string, number>;
    structuralEntities: {
      sections?: number;
      todos?: number;
      frontmatter?: number;
      alerts?: number;
      docLinks?: number;
      codeBlocks?: number;
    };
    relations: {
      total: number;
      byType: Record<string, number>;
    };
    topLargest: { path: string; lines: number; size: number; entities: number }[];
    topEntityDense: { path: string; entities: number; lines: number }[];
    couplingRanking: { path: string; dependencies: number; dependents: number; totalEdges: number }[];
    cycleCount: number;
  };
  memory: {
    totalFacts: number;
    factByCategory: Record<string, number>;
    topTags: { tag: string; count: number }[];
    recentFacts: {
      id: string;
      content: string;
      category: string;
      tags: string[];
      createdAt: string;
      updatedAt: string;
      confidence: number;
      isStructural?: boolean;
    }[];
  };
  health: {
    initialized: boolean;
    freshness: number;
    warnings: string[];
  };
}

interface SearchResult {
  path: string;
  relevance: number;
  reason: string;
  sections?: { lineStart: number; lineEnd: number; snippet: string }[];
}

interface KnowledgePanelProps {
  onClose?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const KnowledgePanel: React.FC<KnowledgePanelProps> = React.memo(function KnowledgePanel({ onClose }) {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<KnowledgeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'entities' | 'memory' | 'relations' | 'search'>('overview');

  // Interactive search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/knowledge/dashboard');
      if (!res.ok) throw new Error('Erreur de chargement');
      const json = await res.json();
      setData(json);
    } catch {
      toastError('Impossible de charger le système de connaissance');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleReindex = useCallback(async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/knowledge/reindex', { method: 'POST' });
      if (!res.ok) throw new Error('Erreur de réindexation');
      const json = await res.json();
      success(`Indexation terminée (${json.stats.totalFiles} fichiers, ${json.stats.totalEntities} entités)`);
      fetchDashboard();
    } catch {
      toastError('Échec de l\'indexation');
    } finally {
      setReindexing(false);
    }
  }, [fetchDashboard, success, toastError]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch('/api/knowledge/build-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, strategy: 'document_first', detail: 'standard' }),
      });
      if (!res.ok) throw new Error('Échec recherche');
      const json = await res.json();
      if (json.batch?.files) {
        setSearchResults(json.batch.files);
      }
    } catch {
      toastError('Recherche sémantique échouée');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, toastError]);

  const docEntityTotal = useMemo(() => {
    if (!data?.graph?.structuralEntities) return 0;
    const s = data.graph.structuralEntities;
    return (s.sections || 0) + (s.todos || 0) + (s.frontmatter || 0) + (s.alerts || 0) + (s.docLinks || 0) + (s.codeBlocks || 0);
  }, [data]);

  return (
    <div
      className="flex flex-col w-full h-full min-h-0 select-none overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-base)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Header Panel Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{
          borderColor: 'var(--border-base)',
          backgroundColor: 'var(--bg-panel)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="p-2 rounded-lg"
            style={{
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent-primary)',
            }}
          >
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-primary)' }}>
              System Knowledge
            </h2>
            <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>
              Base de connaissances & Index documentaire IA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReindex}
            disabled={reindexing || loading}
            title="Réindexation complète du workspace"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            style={{
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent-primary)',
              border: '1px solid var(--accent-glow)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reindexing ? 'animate-spin' : ''}`} />
            <span>{reindexing ? 'Indexation...' : 'Réindexer'}</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition hover:opacity-80"
              style={{
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-input)',
              }}
              title="Fermer le panneau"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        className="flex items-center gap-1.5 px-4 py-2 border-b overflow-x-auto shrink-0"
        style={{
          borderColor: 'var(--border-base)',
          backgroundColor: 'var(--bg-panel)',
        }}
      >
        {[
          { id: 'overview', label: 'Vue générale', icon: Layers },
          { id: 'entities', label: 'Entités Doc', icon: FileText, badge: docEntityTotal },
          { id: 'memory', label: 'Mémoire & RAG', icon: Sparkles, badge: data?.memory?.totalFacts },
          { id: 'relations', label: 'Graphe Liens', icon: Link2, badge: data?.graph?.relations?.total },
          { id: 'search', label: 'Recherche', icon: Search },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap"
              style={{
                backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: active ? '1px solid var(--border-focus)' : '1px solid transparent',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold"
                  style={{
                    backgroundColor: active ? 'var(--accent-glow)' : 'var(--bg-input)',
                    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dynamic Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs">Chargement du Knowledge Graph...</span>
          </div>
        ) : !data ? (
          <div
            className="p-4 rounded-xl border text-xs"
            style={{
              backgroundColor: 'var(--critical-bg)',
              borderColor: 'var(--critical-border)',
              color: 'var(--critical-text)',
            }}
          >
            Échec du chargement des données du Knowledge System.
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-4"
              >
                {/* Health Banner */}
                <div
                  className="p-4 rounded-xl border flex items-start justify-between gap-3 shadow-sm"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-base)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="p-2 rounded-lg shrink-0"
                      style={{
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--color-success)',
                        border: '1px solid var(--border-base)',
                      }}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        Knowledge Engine Actif (Orientation Documentaire)
                        <span
                          className="text-[10px] px-2 py-0.5 rounded font-mono font-bold"
                          style={{
                            backgroundColor: 'var(--accent-subtle)',
                            color: 'var(--color-success)',
                            border: '1px solid var(--border-base)',
                          }}
                        >
                          {(data.health.freshness * 100).toFixed(0)}% Fraîcheur
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        Dernier scan : {data.graph.lastIndexed ? new Date(data.graph.lastIndexed).toLocaleString() : 'Jamais'} — Workspace: <strong style={{ color: 'var(--text-secondary)' }}>{data.workspace.sandboxActive ? 'Sandbox' : 'Direct'}</strong>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Warnings Box if any */}
                {data.health.warnings.length > 0 && (
                  <div
                    className="p-3 rounded-xl border space-y-1.5"
                    style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      borderColor: 'rgba(245, 158, 11, 0.3)',
                      color: 'var(--color-warning)',
                    }}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      Avertissements de santé :
                    </div>
                    <ul className="list-disc list-inside text-xs space-y-0.5 opacity-90">
                      {data.health.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div
                    className="p-3.5 rounded-xl border flex flex-col shadow-sm"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Fichiers Indexés</span>
                    <span className="text-2xl font-extrabold mt-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>{data.graph.totalFiles}</span>
                    <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{data.graph.totalLines} lignes analysées</span>
                  </div>

                  <div
                    className="p-3.5 rounded-xl border flex flex-col shadow-sm"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Entités Documentaires</span>
                    <span className="text-2xl font-extrabold mt-1 tabular-nums" style={{ color: 'var(--color-success)' }}>{docEntityTotal}</span>
                    <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{data.graph.totalEntities} entités au total</span>
                  </div>

                  <div
                    className="p-3.5 rounded-xl border flex flex-col shadow-sm"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Mémoire Projet</span>
                    <span className="text-2xl font-extrabold mt-1 tabular-nums" style={{ color: 'var(--color-warning)' }}>{data.memory.totalFacts}</span>
                    <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Faits & consignes RAG</span>
                  </div>

                  <div
                    className="p-3.5 rounded-xl border flex flex-col shadow-sm"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Relations Graphe</span>
                    <span className="text-2xl font-extrabold mt-1 tabular-nums" style={{ color: 'var(--accent-primary)' }}>{data.graph.relations.total}</span>
                    <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Liens inter-documents</span>
                  </div>
                </div>

                {/* File Extensions Breakdown */}
                <div
                  className="p-4 rounded-xl border space-y-2.5 shadow-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                >
                  <span className="font-bold text-xs block" style={{ color: 'var(--text-primary)' }}>Répartition des fichiers par type</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.graph.filesByExtension || {}).map(([ext, count]) => (
                      <div
                        key={ext}
                        className="px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-xs border"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          borderColor: 'var(--border-base)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span className="font-mono font-bold text-emerald-500">{ext || '.txt'}</span>
                        <span className="font-extrabold tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: ENTITIES */}
            {activeTab === 'entities' && (
              <motion.div
                key="entities"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Sections H1-H6', count: data.graph.structuralEntities?.sections || 0, icon: Hash, color: 'text-emerald-500' },
                    { label: 'Tâches (todos)', count: data.graph.structuralEntities?.todos || 0, icon: ListTodo, color: 'text-amber-500' },
                    { label: 'Frontmatter (YAML)', count: data.graph.structuralEntities?.frontmatter || 0, icon: Tag, color: 'text-indigo-500' },
                    { label: 'Alertes (GitHub)', count: data.graph.structuralEntities?.alerts || 0, icon: ShieldAlert, color: 'text-red-500' },
                    { label: 'Liens Docs', count: data.graph.structuralEntities?.docLinks || 0, icon: Link2, color: 'text-sky-500' },
                    { label: 'Blocs de Code', count: data.graph.structuralEntities?.codeBlocks || 0, icon: Code2, color: 'text-purple-500' },
                  ].map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border flex items-center justify-between shadow-sm"
                        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                      >
                        <div>
                          <span className="text-[11px] block font-medium" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                          <span className={`text-lg font-extrabold tabular-nums ${item.color}`}>{item.count}</span>
                        </div>
                        <Icon className={`w-5 h-5 opacity-80 ${item.color}`} />
                      </div>
                    );
                  })}
                </div>

                {/* Top Dense Documents */}
                <div
                  className="p-4 rounded-xl border space-y-2.5 shadow-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                >
                  <span className="font-bold text-xs block" style={{ color: 'var(--text-primary)' }}>Documents les plus riches en entités</span>
                  <div className="space-y-1.5">
                    {data.graph.topEntityDense?.slice(0, 8).map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg border transition"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)' }}
                      >
                        <span className="font-mono text-xs font-medium truncate max-w-[280px]" style={{ color: 'var(--text-primary)' }}>{doc.path}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className="px-2 py-0.5 rounded font-bold tabular-nums"
                            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--color-success)' }}
                          >
                            {doc.entities} entités
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{doc.lines}l</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 3: MEMORY & RAG */}
            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-4"
              >
                {/* Memory categories pill bar */}
                <div
                  className="p-4 rounded-xl border space-y-2.5 shadow-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                >
                  <span className="font-bold text-xs block" style={{ color: 'var(--text-primary)' }}>Faits mémoire par catégorie</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.memory.factByCategory || {}).map(([cat, count]) => (
                      <span
                        key={cat}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold border"
                        style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.1)',
                          borderColor: 'rgba(245, 158, 11, 0.25)',
                          color: 'var(--color-warning)',
                        }}
                      >
                        {cat}: <strong className="font-extrabold tabular-nums">{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Recent Facts */}
                <div className="space-y-2">
                  <span className="font-bold text-xs block" style={{ color: 'var(--text-primary)' }}>Faits & consignes récentes</span>
                  <div className="space-y-2">
                    {data.memory.recentFacts?.map((fact) => (
                      <div
                        key={fact.id}
                        className="p-3 rounded-xl border space-y-1.5 shadow-sm"
                        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] uppercase font-bold border"
                            style={{
                              backgroundColor: 'var(--accent-subtle)',
                              color: 'var(--accent-primary)',
                              borderColor: 'var(--border-base)',
                            }}
                          >
                            {fact.category}
                          </span>
                          {fact.isStructural && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold border"
                              style={{
                                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                color: '#818cf8',
                                borderColor: 'rgba(99, 102, 241, 0.3)',
                              }}
                            >
                              Structurel
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{fact.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 4: RELATIONS */}
            {activeTab === 'relations' && (
              <motion.div
                key="relations"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-4"
              >
                <div
                  className="p-4 rounded-xl border space-y-2.5 shadow-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                >
                  <span className="font-bold text-xs block" style={{ color: 'var(--text-primary)' }}>Types de relations interconnectées</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(data.graph.relations.byType || {}).map(([rel, count]) => (
                      <div
                        key={rel}
                        className="p-2.5 rounded-lg border flex items-center justify-between"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)' }}
                      >
                        <span className="font-mono text-xs font-semibold text-indigo-400">{rel}</span>
                        <span className="font-extrabold tabular-nums" style={{ color: 'var(--text-primary)' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Coupled Documents */}
                <div
                  className="p-4 rounded-xl border space-y-2.5 shadow-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                >
                  <span className="font-bold text-xs block" style={{ color: 'var(--text-primary)' }}>Documents les plus interconnectés</span>
                  <div className="space-y-1.5">
                    {data.graph.couplingRanking?.slice(0, 8).map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg border"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)' }}
                      >
                        <span className="font-mono text-xs truncate max-w-[280px]" style={{ color: 'var(--text-primary)' }}>{doc.path}</span>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="font-bold text-indigo-400 tabular-nums">{doc.totalEdges} liens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 5: SEARCH */}
            {activeTab === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-4"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Recherche sémantique dans les documents (ex: guide style, concurent, spēcs)..."
                    className="flex-1 px-3.5 py-2 rounded-lg border text-xs focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border-base)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching}
                    className="px-4 py-2 rounded-lg font-semibold transition text-xs flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: '#ffffff',
                    }}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Chercher</span>
                  </button>
                </div>

                {searching ? (
                  <div className="flex items-center justify-center h-28 gap-2" style={{ color: 'var(--text-muted)' }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-xs">Recherche sémantique en cours...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((res, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border space-y-1 shadow-sm"
                        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-emerald-500 truncate max-w-[280px]">{res.path}</span>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded font-bold tabular-nums border"
                            style={{
                              backgroundColor: 'var(--accent-subtle)',
                              color: 'var(--color-success)',
                              borderColor: 'var(--border-base)',
                            }}
                          >
                            Score: {(res.relevance * 100).toFixed(0)}%
                          </span>
                        </div>
                        {res.reason && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{res.reason}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Saisissez un terme ou concept documentaire ci-dessus pour interroger l'index sémantique.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
});

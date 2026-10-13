/**
 * GeneratedDocsPanel — Affichage des documents générés
 * 
 * Ce panneau affiche la liste des documents précédemment générés
 * avec possibilité de les consulter ou supprimer.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Sparkles, Trash2, FileText, HelpCircle, GraduationCap, Briefcase, Clock, List, Brain, Target, BookOpen, Lightbulb, Zap, FilePlus, Loader2, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useToast } from '../ui/Toast.js';
import { NbButton, NbIconButton, NbPanelHeader, NbEmptyState } from './ui/primitives.js';
import { api, apiVoid, ApiError } from './api/client.js';

interface SourceItem {
  id: string;
  title: string;
  type: string;
}

interface GeneratedDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  sourceIds: string[];
  createdAt: string;
}

interface Props {
  notebookId: string;
  sources: SourceItem[];
  onRefresh: () => void;
  onViewDoc?: (doc: { id: string; title: string; type: string; content: string; createdAt: string }) => void;
}

// Types de documents
const DOC_TYPES = [
  { key: 'full-report', label: 'Rapport complet', icon: FileText, color: 'var(--color-error)' },
  { key: 'summary', label: 'Résumé', icon: FileText, color: 'var(--notebook-accent)' },
  { key: 'faq', label: 'FAQ', icon: HelpCircle, color: 'var(--color-accent-alt)' },
  { key: 'study-guide', label: 'Guide d\'étude', icon: GraduationCap, color: 'var(--color-success)' },
  { key: 'briefing', label: 'Briefing', icon: Briefcase, color: 'var(--color-warning)' },
  { key: 'timeline', label: 'Chronologie', icon: Clock, color: 'var(--color-error)' },
  { key: 'outline', label: 'Plan', icon: List, color: 'var(--accent-secondary)' },
  { key: 'mindmap', label: 'Carte mentale', icon: Brain, color: 'var(--color-error)' },
  { key: 'infographic', label: 'Infographie', icon: Lightbulb, color: 'var(--color-warning)' },
  { key: 'swot', label: 'Analyse SWOT', icon: Target, color: 'var(--color-info)' },
  { key: 'glossary', label: 'Glossaire', icon: BookOpen, color: 'var(--color-accent-alt)' },
  { key: 'roadmap', label: 'Roadmap', icon: Zap, color: 'var(--color-warning)' },
];

const REPORT_TYPES = [
  { key: 'report-business', label: 'Business Plan', icon: Briefcase, color: 'var(--color-warning)' },
  { key: 'report-market', label: 'Étude de marché', icon: Target, color: 'var(--color-info)' },
  { key: 'report-technical', label: 'Rapport technique', icon: FileText, color: 'var(--notebook-accent)' },
  { key: 'report-competitive', label: 'Analyse concurrentielle', icon: Target, color: 'var(--color-accent-alt)' },
  { key: 'report-financial', label: 'Rapport financier', icon: FileText, color: 'var(--color-success)' },
  { key: 'report-marketing', label: 'Plan marketing', icon: Sparkles, color: 'var(--color-error)' },
  { key: 'report-product', label: 'Rapport produit', icon: List, color: 'var(--accent-secondary)' },
  { key: 'report-risk', label: 'Analyse des risques', icon: Target, color: 'var(--color-error)' },
  { key: 'report-executive', label: 'Synthèse exécutive', icon: Briefcase, color: 'var(--color-error)' },
  { key: 'report-project', label: 'Rapport de projet', icon: Clock, color: 'var(--color-accent-alt)' },
  { key: 'comparative-analysis', label: 'Analyse comparative', icon: Target, color: 'var(--color-info)' },
  { key: 'synthesis-report', label: 'Rapport de synthèse', icon: Briefcase, color: 'var(--color-success)' },
];

/**
 * Transition helpers pour les animations
 */
function useFluidTransition() {
  const reduceMotion = useReducedMotion();
  return {
    spring: reduceMotion
      ? { duration: 0.1, ease: 'easeOut' as const }
      : { type: 'spring' as const, bounce: 0, duration: 0.3 },
    fadeOnly: (offset: { x?: number; y?: number } = {}) =>
      reduceMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : { initial: { opacity: 0, ...offset }, animate: { opacity: 1, x: 0, y: 0 }, exit: { opacity: 0, ...offset } },
  };
}

export function GeneratedDocsPanel({ notebookId, sources, onRefresh, onViewDoc }: Props) {
  const { success, error: toastError } = useToast();
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<GeneratedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  // État d'ajout aux sources, par document : 'adding' | 'added'.
  const [addingToSources, setAddingToSources] = useState<Record<string, 'adding' | 'added'>>({});
  const { spring, fadeOnly } = useFluidTransition();

  // Types dont le contenu n'est pas de la prose (image/visualisation) :
  // non promouvables en source textuelle.
  const NON_PROSE_TYPES = ['infographic', 'visualization', 'chart'];

  // Charger les documents générés
  const loadGeneratedDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ documents?: GeneratedDoc[] }>(
        `/api/notebooks/${notebookId}/generated`,
      );
      setGeneratedDocs(data.documents || []);
    } catch {
      toastError('Erreur lors du chargement de l\'historique');
    } finally {
      setLoading(false);
    }
  }, [notebookId, toastError]);

  useEffect(() => {
    loadGeneratedDocs();
  }, [loadGeneratedDocs]);

  // Rafraîchir quand l'assistant vocal génère un document pour ce notebook.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ notebookId?: string }>).detail;
      if (!detail?.notebookId || detail.notebookId === notebookId) {
        loadGeneratedDocs();
      }
    };
    window.addEventListener('notebook-generated-docs-changed', handler as EventListener);
    return () => window.removeEventListener('notebook-generated-docs-changed', handler as EventListener);
  }, [notebookId, loadGeneratedDocs]);

  // Supprimer un document
  const handleDelete = useCallback(async (docId: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/generated/${docId}`, { method: 'DELETE' });
      setGeneratedDocs(prev => prev.filter(d => d.id !== docId));
      success('Document supprimé');
      onRefresh();
    } catch {
      toastError('Erreur lors de la suppression du document');
    }
  }, [notebookId, onRefresh, success, toastError]);

  // Ajouter un document généré aux sources du notebook (le rend interrogeable
  // par le chat groundé et l'assistant vocal).
  const handleAddToSources = useCallback(async (doc: GeneratedDoc) => {
    setAddingToSources(prev => ({ ...prev, [doc.id]: 'adding' }));
    try {
      await api(`/api/notebooks/${notebookId}/generated/${doc.id}/add-to-sources`, {
        method: 'POST',
      });
      setAddingToSources(prev => ({ ...prev, [doc.id]: 'added' }));
      success('Document ajouté aux sources');
      onRefresh();
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409
        ? 'Une source portant ce titre existe déjà'
        : 'Erreur lors de l\'ajout aux sources';
      toastError(msg);
      setAddingToSources(prev => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
    }
  }, [notebookId, onRefresh, success, toastError]);

  // Filtrer les documents par type
  const getSourceTitles = useCallback((sourceIds: string[]) => {
    return sourceIds
      .map(id => sources.find(s => s.id === id)?.title)
      .filter(Boolean)
      .join(', ');
  }, [sources]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Sparkles className="h-4 w-4 animate-pulse" aria-hidden />
          <span>Chargement de l'historique...</span>
        </div>
      </div>
    );
  }

  if (generatedDocs.length === 0) {
    return (
      <NbEmptyState
        icon={Sparkles}
        title="Aucun document généré pour le moment"
        description="Les documents générés s'afficheront ici"
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header avec compteur */}
      <NbPanelHeader
        icon={Sparkles}
        title="Historique des générations"
        count={generatedDocs.length}
      />

      {/* Liste des documents */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <AnimatePresence mode="wait">
          <motion.div
            key="history-list"
            {...fadeOnly({})}
            transition={spring}
            className="space-y-2"
          >
            {generatedDocs
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map(doc => {
                const docType = DOC_TYPES.find(t => t.key === doc.type) || REPORT_TYPES.find(t => t.key === doc.type);
                const DocIcon = docType?.icon || Sparkles;
                const color = docType?.color || 'var(--text-muted)';
                const label = docType?.label || doc.type;
                const isSelected = selectedDoc?.id === doc.id;

                return (
                  <motion.div
                    key={doc.id}
                    layout
                    data-interactive="true"
                    onClick={() => {
                      setSelectedDoc(doc);
                      if (onViewDoc) {
                        onViewDoc({
                          id: doc.id,
                          title: doc.title,
                          type: doc.type,
                          content: doc.content,
                          createdAt: doc.createdAt
                        });
                      }
                    }}
                    className="notebook-card group cursor-pointer rounded-xl p-3"
                    style={isSelected ? {
                      borderColor: color,
                      backgroundColor: `color-mix(in srgb, ${color} 6%, var(--notebook-card-bg))`,
                    } : undefined}
                  >
                    <div className="flex items-center gap-3">
                      {/* Icône */}
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                      >
                        <DocIcon className="h-4 w-4" style={{ color }} aria-hidden />
                      </div>

                      {/* Contenu */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {doc.title}
                          </p>
                          {doc.sourceIds.length > 0 && (
                            <span
                              className="notebook-badge px-1.5 py-0"
                              style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
                            >
                              {doc.sourceIds.length}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1 text-xs text-[var(--text-dimmed)]">
                          <span className="font-medium" style={{ color }}>
                            {label}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(doc.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                          {doc.sourceIds.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="truncate">
                                {getSourceTitles(doc.sourceIds)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-shrink-0 items-center gap-1">
                        {!NON_PROSE_TYPES.includes(doc.type) && (() => {
                          const state = addingToSources[doc.id];
                          const isAdded = state === 'added';
                          const isAdding = state === 'adding';
                          return (
                            <NbIconButton
                              icon={isAdding ? Loader2 : isAdded ? Check : FilePlus}
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!state) handleAddToSources(doc);
                              }}
                              disabled={isAdding || isAdded}
                              className={clsx(
                                isAdded ? 'text-[var(--color-success)] disabled:opacity-100' : 'text-[var(--notebook-accent)] opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
                                isAdding && '[&>svg]:animate-spin',
                              )}
                              title={isAdded ? 'Ajouté aux sources' : 'Ajouter aux sources (interrogeable par l\u2019assistant)'}
                              label={isAdded ? 'Ajouté aux sources' : 'Ajouter aux sources'}
                            />
                          );
                        })()}
                        <NbIconButton
                          icon={Trash2}
                          label="Supprimer"
                          size="sm"
                          tone="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.id);
                          }}
                          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Affichage du document sélectionné (optionnel - si on veut voir le contenu) */}
      {selectedDoc && onViewDoc === undefined && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="flex-1 overflow-y-auto border-t border-[var(--notebook-border)] p-4"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <NbButton variant="ghost" size="sm" onClick={() => setSelectedDoc(null)}>
                ← Retour
              </NbButton>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                {selectedDoc.title}
              </h4>
            </div>
            <pre className="whitespace-pre-wrap text-xs text-[var(--text-secondary)]">
              {selectedDoc.content.slice(0, 2000)}
              {selectedDoc.content.length > 2000 && '...'}
            </pre>
          </div>
        </motion.div>
      )}
    </div>
  );
}

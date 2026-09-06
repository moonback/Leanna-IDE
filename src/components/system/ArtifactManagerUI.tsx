/**
 * ArtifactManagerUI — Interface utilisateur pour la gestion des artefacts
 * 
 * Ce composant fournit une interface complète pour :
 * - Visualiser tous les artefacts
 * - Créer, modifier, supprimer des artefacts
 * - Gérer les versions et références
 * - Rechercher et filtrer les artefacts
 * - Statistiques et nettoyage
 * 
 * @example
 * <ArtifactManagerUI
 *   onArtifactSelect={(artifact) => console.log(artifact)}
 *   showCreateButton={true}
 * />
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Package, File, Clock, Search, X, Plus, Trash2, History, Link2, Unlink2,
  Filter, RefreshCw, BarChart3, MoreVertical, Eye, Edit2, Copy
} from "lucide-react";
import { useArtifactManager, useArtifactStats } from "../../hooks";
import type { ID, FileType, Artifact, ArtifactVersion } from "../../../server/core/types";
import { StatusBadge } from "../ui/StatusBadge";

/**
 * Props du composant ArtifactManagerUI
 */
export interface ArtifactManagerUIProps {
  /** On artefact sélectionné */
  onArtifactSelect?: (artifact: Artifact) => void;
  /** On artefact créé */
  onArtifactCreate?: (artifact: Artifact) => void;
  /** On artefact supprimé */
  onArtifactDelete?: (artifact: Artifact) => void;
  /** Afficher le bouton de création */
  showCreateButton?: boolean;
  /** Types d'artefacts à afficher */
  filterTypes?: FileType[];
  /** Afficher les statistiques */
  showStats?: boolean;
  /** Hauteur maximale */
  maxHeight?: string;
}

/**
 * Icônes des types de fichiers
 */
const FILE_TYPE_ICONS: Record<FileType, React.ReactNode> = {
  code: <File className="w-4 h-4" />,
  config: <BarChart3 className="w-4 h-4" />,
  document: <File className="w-4 h-4" />,
  data: <Package className="w-4 h-4" />,
  media: <Package className="w-4 h-4" />,
  other: <Package className="w-4 h-4" />,
};

/**
 * Couleurs des types de fichiers
 */
const FILE_TYPE_COLORS: Record<FileType, string> = {
  code: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  config: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  document: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  data: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  media: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  other: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

/**
 * Labels des types de fichiers
 */
const FILE_TYPE_LABELS: Record<FileType, string> = {
  code: "Code",
  config: "Configuration",
  document: "Document",
  data: "Données",
  media: "Média",
  other: "Autre",
};

/**
 * Formatage de la taille
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Formatage de la date
 */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString.substring(0, 19).replace("T", " ");
  }
}

/**
 * Composant ArtifactCard
 */
interface ArtifactCardProps {
  artifact: Artifact;
  selected?: boolean;
  onClick?: (artifact: Artifact) => void;
  onDelete?: (artifact: Artifact) => void;
  onViewVersions?: (artifact: Artifact) => void;
  onViewReferences?: (artifact: Artifact) => void;
}

function ArtifactCard({
  artifact,
  selected,
  onClick,
  onDelete,
  onViewVersions,
  onViewReferences,
}: ArtifactCardProps) {
  const type = artifact.type as FileType;
  const typeLabel = FILE_TYPE_LABELS[type] || "Autre";
  const typeColor = FILE_TYPE_COLORS[type] || FILE_TYPE_COLORS.other;
  const TypeIcon = FILE_TYPE_ICONS[type] || FILE_TYPE_ICONS.other;
  
  const [showMenu, setShowMenu] = useState(false);
  
  return (
    <motion.div
      layout
      className={`
        flex items-center gap-3 p-3 rounded-lg border border-slate-200/50
        bg-white hover:bg-slate-50/50 transition-all duration-200
        ${selected ? "ring-2 ring-blue-500 border-blue-500" : ""}
        ${onClick ? "cursor-pointer" : ""}
      `}
      onClick={() => onClick?.(artifact)}
    >
      {/* Icône de type */}
      <div className={`
        flex items-center justify-center w-10 h-10 rounded-lg
        ${typeColor}
      `}
      >
        {TypeIcon}
      </div>
      
      {/* Informations de base */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{artifact.name}</span>
          <span className="text-slate-400 text-xs">{typeLabel}</span>
        </div>
        
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
          <span>{formatSize(artifact.size || 0)}</span>
          <span className="text-slate-300">•</span>
          <span>{formatDate(artifact.createdAt)}</span>
          <span className="text-slate-300">•</span>
          <span>Créé par: {artifact.createdBy}</span>
        </div>
        
        {/* Chemin */}
        <div className="text-xs text-slate-400 mt-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {artifact.path}
        </div>
      </div>
      
      {/* Statut */}
      <div className="flex items-center gap-2">
        <StatusBadge variant="default" size="sm" label={artifact.status} />
        
        {/* Boutons d'action */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onViewVersions?.(artifact);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                >
                  <History className="w-3.5 h-3.5" />
                  Versions
                </button>
                
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onViewReferences?.(artifact);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Références
                </button>
                
                <div className="border-t border-slate-100 my-1" />
                
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete?.(artifact);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Composant VersionList
 */
interface VersionListProps {
  artifact: Artifact;
  onClose: () => void;
}

function VersionList({ artifact, onClose }: VersionListProps) {
  const { getVersions, getReferences } = useArtifactManager();
  const versions = getVersions(artifact.id);
  const references = getReferences(artifact.id);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">
              Versions de {artifact.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Contenu */}
        <div className="p-4 space-y-4 max-h-[calc(80vh-140px)] overflow-y-auto">
          {/* Statistiques */}
          <div className="flex gap-4 p-3 bg-slate-50 rounded-lg">
            <div className="text-center">
              <div className="text-xl font-bold text-slate-800">{versions.length}</div>
              <div className="text-xs text-slate-500">Versions</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-slate-800">{references.length}</div>
              <div className="text-xs text-slate-500">Références</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-slate-800">
                {formatSize(artifact.size || 0)}
              </div>
              <div className="text-xs text-slate-500">Taille actuelle</div>
            </div>
          </div>
          
          {/* Liste des versions */}
          <div className="space-y-2">
            {versions.length > 0 ? (
              versions.map((version, index) => {
                const isLatest = index === versions.length - 1;
                return (
                  <motion.div
                    key={version.id}
                    layout
                    className={`
                      p-3 rounded-lg border border-slate-100 bg-white
                      ${isLatest ? "ring-2 ring-blue-500/20" : ""}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          Version {versions.length - index}
                        </span>
                        {isLatest && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-xs">
                            Actuelle
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatDate(version.timestamp)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span>Hash: {version.contentHash.substring(0, 8)}...</span>
                      <span>Taille: {formatSize(version.size)}</span>
                      <span>Créé par: {version.createdBy}</span>
                    </div>
                    {version.description && (
                      <div className="mt-2 text-sm text-slate-600">
                        {version.description}
                      </div>
                    )}
                  </motion.div>
                );
              })
            ) : (
              <div className="text-center py-4 text-slate-400">
                Aucune version disponible
              </div>
            )}
          </div>
        </div>
        
        {/* Pied */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Composant ReferenceList
 */
interface ReferenceListProps {
  artifact: Artifact;
  onClose: () => void;
}

function ReferenceList({ artifact, onClose }: ReferenceListProps) {
  const { getReferences } = useArtifactManager();
  const references = getReferences(artifact.id);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">
              Références de {artifact.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Contenu */}
        <div className="p-4 space-y-4 max-h-[calc(80vh-140px)] overflow-y-auto">
          {references.length > 0 ? (
            <div className="space-y-2">
              {references.map(reference => (
                <motion.div
                  key={reference.usedAt}
                  layout
                  className="p-3 rounded-lg border border-slate-100 bg-white"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      Utilisé par: {reference.usedBy}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    <div>Chemin: {reference.path}</div>
                    <div>Le: {formatDate(reference.usedAt)}</div>
                    {reference.versionId && (
                      <div>Version: {reference.versionId}</div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-slate-400">
              Aucune référence disponible
            </div>
          )}
        </div>
        
        {/* Pied */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Composant StatsPanel
 */
function StatsPanel() {
  const { stats, refresh } = useArtifactStats();
  
  return (
    <div className="p-4 bg-slate-50/50 rounded-lg border border-slate-200/50">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.totalArtifacts}</div>
          <div className="text-xs text-slate-500 mt-1">Artefacts</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.totalVersions}</div>
          <div className="text-xs text-slate-500 mt-1">Versions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{stats.totalReferences}</div>
          <div className="text-xs text-slate-500 mt-1">Références</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-600">{formatSize(stats.totalSize)}</div>
          <div className="text-xs text-slate-500 mt-1">Taille totale</div>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-200/50">
        <div className="text-sm text-slate-600 mb-2">Par type:</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byType).map(([type, count]) => {
            if (count === 0) return null;
            const typeLabel = FILE_TYPE_LABELS[type as FileType] || type;
            return (
              <div key={type} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs text-slate-500">{typeLabel}: {count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Composant CreateArtifactModal
 */
interface CreateArtifactModalProps {
  onClose: () => void;
  onCreate: (artifact: Artifact) => void;
}

function CreateArtifactModal({ onClose, onCreate }: CreateArtifactModalProps) {
  const { createArtifact } = useArtifactManager();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [type, setType] = useState<FileType>("data");
  const [content, setContent] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !path || !createdBy) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const result = await createArtifact({
        name,
        path,
        type,
        content: content || undefined,
        createdBy,
      });
      
      if (result.success && result.artifact) {
        onCreate(result.artifact);
        onClose();
      } else {
        setError(result.error || "Erreur lors de la création");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [name, path, type, content, createdBy, createArtifact, onCreate, onClose]);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">Créer un artefact</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Contenu */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[calc(80vh-140px)] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50/50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nom *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de l'artefact"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Chemin *</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/chemin/vers/artefact.json"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FileType)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Object.entries(FILE_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Contenu (optionnel)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Contenu de l'artefact (JSON, texte, etc.)"
              rows={4}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Créé par *</label>
            <input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="agent-123 ou mission-456"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </form>
        
        {/* Pied */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-sm"
            disabled={loading}
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Créer
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Composant principal ArtifactManagerUI
 */
export function ArtifactManagerUI({
  onArtifactSelect,
  onArtifactCreate,
  onArtifactDelete,
  showCreateButton = true,
  filterTypes,
  showStats = true,
  maxHeight = "500px",
}: ArtifactManagerUIProps) {
  const { 
    artifacts, 
    loading, 
    error,
    createArtifact,
    deleteArtifact,
    searchArtifacts,
    getOrphanedArtifacts,
    cleanup
  } = useArtifactManager();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [showReferencesModal, setShowReferencesModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Artifact | null>(null);
  const [selectedType, setSelectedType] = useState<FileType | "">("");
  
  // Artefacts filtrés
  const filteredArtifacts = useMemo(() => {
    let result = artifacts;
    
    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.path.toLowerCase().includes(query) ||
        a.type.toLowerCase().includes(query) ||
        a.createdBy.toLowerCase().includes(query)
      );
    }
    
    // Filtre par type
    if (filterTypes && filterTypes.length > 0) {
      result = result.filter(a => filterTypes.includes(a.type as FileType));
    }
    
    // Filtre par type sélectionné
    if (selectedType) {
      result = result.filter(a => a.type === selectedType);
    }
    
    return result;
  }, [artifacts, searchQuery, filterTypes, selectedType]);
  
  // Gestion de la suppression
  const handleDelete = useCallback((artifact: Artifact) => {
    const result = deleteArtifact(artifact.id);
    if (result.success && onArtifactDelete) {
      onArtifactDelete(artifact);
    }
  }, [deleteArtifact, onArtifactDelete]);
  
  // Gestion de la sélection
  const handleArtifactSelect = useCallback((artifact: Artifact) => {
    setSelectedArtifact(artifact);
    onArtifactSelect?.(artifact);
  }, [onArtifactSelect]);
  
  // Gestion du clic sur créer
  const handleCreate = useCallback((artifact: Artifact) => {
    onArtifactCreate?.(artifact);
  }, [onArtifactCreate]);
  
  // Gestion des modalités
  const handleViewVersions = useCallback((artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setShowVersionsModal(true);
  }, []);
  
  const handleViewReferences = useCallback((artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setShowReferencesModal(true);
  }, []);
  
  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border shadow-sm overflow-hidden" style={{ maxHeight }}>
      {/* En-tête */}
      <div className="flex items-center justify-between p-3 border-b border-divider bg-surface-soft/50">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-800">Gestion des artefacts</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Filtre par type */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as FileType | "")}
            className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tous les types</option>
            {Object.entries(FILE_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Bouton créer */}
          {showCreateButton && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Créer
            </button>
          )}
        </div>
      </div>
      
      {/* Statistiques */}
      {showStats && (
        <div className="p-3 border-b border-divider bg-surface-soft/30">
          <StatsPanel />
        </div>
      )}
      
      {/* Liste des artefacts */}
      <div 
        className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200/50 scrollbar-track-transparent"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full py-8">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center animate-spin">
              <Loader2 className="w-5 h-5 text-blue-500" />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full py-8">
            <div className="text-center text-red-500">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : filteredArtifacts.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {filteredArtifacts.map(artifact => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                selected={selectedArtifact?.id === artifact.id}
                onClick={handleArtifactSelect}
                onDelete={() => setConfirmDelete(artifact)}
                onViewVersions={handleViewVersions}
                onViewReferences={handleViewReferences}
              />
            ))}
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center h-full py-8">
            <div className="text-center text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aucun artefact trouvé</p>
              {searchQuery || selectedType ? (
                <p className="text-xs mt-1">Essayez de modifier vos filtres</p>
              ) : (
                <p className="text-xs mt-1">Créez votre premier artefact</p>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Pied */}
      <div className="p-2 border-t border-divider bg-surface-soft/30 flex justify-between items-center">
        <div className="text-xs text-slate-500">
          {filteredArtifacts.length} artefact(s) affiché(s)
        </div>
        <div className="text-xs text-slate-500">
          {artifacts.length} total
        </div>
      </div>
      
      {/* Modal de création */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateArtifactModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreate}
          />
        )}
      </AnimatePresence>
      
      {/* Modal des versions */}
      <AnimatePresence>
        {showVersionsModal && selectedArtifact && (
          <VersionList
            artifact={selectedArtifact}
            onClose={() => setShowVersionsModal(false)}
          />
        )}
      </AnimatePresence>
      
      {/* Modal des références */}
      <AnimatePresence>
        {showReferencesModal && selectedArtifact && (
          <ReferenceList
            artifact={selectedArtifact}
            onClose={() => setShowReferencesModal(false)}
          />
        )}
      </AnimatePresence>
      
      {/* Confirmation de suppression */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold text-slate-800">Supprimer l'artefact</span>
                </div>
              </div>
              
              <div className="p-4">
                <p className="text-slate-600">
                  Vous êtes sur le point de supprimer l'artefact <strong>{confirmDelete.name}</strong>.
                  Cette action est irréversible.
                </p>
              </div>
              
              <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    handleDelete(confirmDelete);
                    setConfirmDelete(null);
                  }}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Exporter les sous-composants pour une utilisation indépendante
export { ArtifactCard, VersionList, ReferenceList, StatsPanel, CreateArtifactModal };

export default ArtifactManagerUI;

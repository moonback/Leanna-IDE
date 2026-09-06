/**
 * VerificationMonitor — Composant de surveillance des vérifications
 * 
 * Ce composant affiche les vérifications en temps réel avec :
 * - Statut des vérifications (en attente, en cours, réussi, échoué)
 * - Historique des vérifications
 * - Filtrage par type, statut, cible
 * - Statistiques détaillées
 * 
 * @example
 * <VerificationMonitor
 *   filterTypes={["safety_check", "quality_check"]}
 *   showStats={true}
 *   maxHeight="400px"
 * />
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle, X, Clock, AlertTriangle, Shield, Search, Filter,
  MoreVertical, RefreshCw, PlayCircle, PauseCircle
} from "lucide-react";
import type { 
  VerificationResult, 
  VerificationType, 
  VerificationStatus 
} from "../../../server/core/types";
import { useVerificationManager, useVerificationStats } from "../../hooks";
import { StatusBadge } from "../ui/StatusBadge";

/**
 * Props du composant VerificationMonitor
 */
export interface VerificationMonitorProps {
  /** Types de vérifications à afficher */
  filterTypes?: VerificationType[];
  /** Statuts à afficher */
  filterStatuses?: VerificationStatus[];
  /** Cibles à afficher */
  filterTargets?: string[];
  /** Afficher les statistiques */
  showStats?: boolean;
  /** Nombre maximum de vérifications à afficher */
  maxVerifications?: number;
  /** Activer le défilement automatique */
  autoScroll?: boolean;
  /** On vérification cliquée */
  onVerificationClick?: (verification: VerificationResult) => void;
  /** Hauteur maximale */
  maxHeight?: string;
}

/**
 * Couleurs des types de vérification
 */
const VERIFICATION_TYPE_COLORS: Record<VerificationType, string> = {
  pre_action: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  post_action: "bg-green-500/10 text-green-600 border-green-500/20",
  pre_commit: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  post_commit: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  safety_check: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  quality_check: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  constraint: "bg-red-500/10 text-red-600 border-red-500/20",
  custom: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

/**
 * Labels des types de vérification
 */
const VERIFICATION_TYPE_LABELS: Record<VerificationType, string> = {
  pre_action: "Pré-action",
  post_action: "Post-action",
  pre_commit: "Pré-commit",
  post_commit: "Post-commit",
  safety_check: "Sécurité",
  quality_check: "Qualité",
  constraint: "Contrainte",
  custom: "Personnalisée",
};

/**
 * Couleurs des statuts de vérification
 */
const STATUS_COLORS: Record<VerificationStatus, string> = {
  pending: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  running: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  passed: "bg-green-500/10 text-green-600 border-green-500/20",
  failed: "bg-red-500/10 text-red-600 border-red-500/20",
  skipped: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  error: "bg-red-500/10 text-red-600 border-red-500/20",
};

/**
 * Labels des statuts de vérification
 */
const STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "En attente",
  running: "En cours",
  passed: "Réussie",
  failed: "Échouée",
  skipped: "Ignorée",
  error: "Erreur",
};

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
      second: "2-digit",
    });
  } catch {
    return isoString.substring(0, 19).replace("T", " ");
  }
}

/**
 * Formatage de la durée
 */
function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Composant VerificationCard
 */
interface VerificationCardProps {
  verification: VerificationResult;
  selected?: boolean;
  onClick?: (verification: VerificationResult) => void;
}

function VerificationCard({ verification, selected, onClick }: VerificationCardProps) {
  const type = verification.type;
  const status = verification.status;
  const typeLabel = VERIFICATION_TYPE_LABELS[type] || type;
  const statusLabel = STATUS_LABELS[status] || status;
  const typeColor = VERIFICATION_TYPE_COLORS[type] || VERIFICATION_TYPE_COLORS.custom;
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending;
  
  return (
    <motion.div
      layout
      className={`
        flex items-center gap-3 p-3 rounded-lg border border-slate-200/50
        bg-white hover:bg-slate-50/50 transition-all duration-200
        ${selected ? "ring-2 ring-blue-500 border-blue-500" : ""}
        ${onClick ? "cursor-pointer" : ""}
      `}
      onClick={() => onClick?.(verification)}
    >
      {/* Icône de statut */}
      <div className={`
        flex items-center justify-center w-8 h-8 rounded-lg
        ${statusColor}
      `}
      >
        {status === "passed" && <CheckCircle className="w-4 h-4" />}
        {status === "failed" && <X className="w-4 h-4" />}
        {status === "error" && <AlertTriangle className="w-4 h-4" />}
        {status === "running" && <PlayCircle className="w-4 h-4" />}
        {status === "pending" && <Clock className="w-4 h-4" />}
        {status === "skipped" && <PauseCircle className="w-4 h-4" />}
      </div>
      
      {/* Informations de base */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`
            px-2 py-0.5 rounded-md text-xs font-medium
            ${typeColor}
          `}
          >
            {typeLabel}
          </span>
          
          <span className="font-medium text-slate-800">{verification.verifierName}</span>
          
          <StatusBadge 
            variant={status === "passed" ? "success" : status === "failed" || status === "error" ? "error" : "info"} 
            size="sm" 
            label={statusLabel}
          />
        </div>
        
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
          <span>ID: {verification.id.substring(0, 8)}...</span>
          <span className="text-slate-300">•</span>
          <span>Cible: {verification.targetType}:{verification.targetId}</span>
          <span className="text-slate-300">•</span>
          <span>Durée: {formatDuration(verification.durationMs)}</span>
        </div>
        
        {/* Date */}
        <div className="text-xs text-slate-400 mt-1">
          {formatDate(verification.startedAt)}
        </div>
      </div>
      
      {/* Badges des checks */}
      <div className="flex items-center gap-1">
        {verification.checks && (
          <>
            <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-xs">
              {verification.checks.filter(c => c.passed).length} OK
            </span>
            {verification.checks.filter(c => !c.passed).length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 text-xs">
                {verification.checks.filter(c => !c.passed).length} KO
              </span>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Composant StatsPanel
 */
function StatsPanel() {
  const { stats, refresh } = useVerificationStats();
  
  const total = stats.total;
  const passedPercentage = total > 0 ? ((stats.passed / total) * 100).toFixed(1) : 0;
  const failedPercentage = total > 0 ? ((stats.failed / total) * 100).toFixed(1) : 0;
  
  return (
    <div className="p-4 bg-slate-50/50 rounded-lg border border-slate-200/50">
      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-xl font-bold text-slate-800">{stats.total}</div>
          <div className="text-xs text-slate-500 mt-1">Total</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-green-600">{stats.passed}</div>
          <div className="text-xs text-slate-500 mt-1">Réussies</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-slate-500 mt-1">Échouées</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-amber-600">{stats.byStatus.skipped}</div>
          <div className="text-xs text-slate-500 mt-1">Ignorées</div>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-200/50">
        {/* Barre de progression */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-slate-500">Taux de succès</span>
          <div className="flex-1 h-2 bg-slate-200/50 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${passedPercentage}%` }}
            />
            <div 
              className="h-full bg-red-500 rounded-full transition-all duration-300"
              style={{ width: `${failedPercentage}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">{passedPercentage}%</span>
        </div>
        
        {/* Par type */}
        <div className="text-sm text-slate-600 mb-2">Par type:</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byType).map(([type, count]) => {
            if (count === 0) return null;
            const typeLabel = VERIFICATION_TYPE_LABELS[type as VerificationType] || type;
            return (
              <div key={type} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
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
 * Composant VerificationDetailsModal
 */
interface VerificationDetailsModalProps {
  verification: VerificationResult;
  onClose: () => void;
}

function VerificationDetailsModal({ verification, onClose }: VerificationDetailsModalProps) {
  const typeLabel = VERIFICATION_TYPE_LABELS[verification.type] || verification.type;
  const statusLabel = STATUS_LABELS[verification.status] || verification.status;
  const typeColor = VERIFICATION_TYPE_COLORS[verification.type] || VERIFICATION_TYPE_COLORS.custom;
  const statusColor = STATUS_COLORS[verification.status] || STATUS_COLORS.pending;
  
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
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">
              Détails de la vérification
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
          {/* Informations principales */}
          <div className="p-3 bg-slate-50/50 rounded-lg border border-slate-200/50">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-500">ID</div>
                <div className="font-medium text-slate-800">{verification.id}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Vérificateur</div>
                <div className="font-medium text-slate-800">{verification.verifierName}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Type</div>
                <span className={`
                  px-2 py-0.5 rounded-md text-xs font-medium
                  ${typeColor}
                `}
                >
                  {typeLabel}
                </span>
              </div>
              <div>
                <div className="text-sm text-slate-500">Statut</div>
                <StatusBadge 
                  variant={verification.status === "passed" ? "success" : verification.status === "failed" || verification.status === "error" ? "error" : "info"} 
                  size="sm" 
                  label={statusLabel}
                />
              </div>
              <div>
                <div className="text-sm text-slate-500">Cible</div>
                <div className="font-medium text-slate-800">
                  {verification.targetType}:{verification.targetId}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Durée</div>
                <div className="font-medium text-slate-800">
                  {formatDuration(verification.durationMs)}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Début</div>
                <div className="font-medium text-slate-800">
                  {formatDate(verification.startedAt)}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Fin</div>
                <div className="font-medium text-slate-800">
                  {verification.completedAt ? formatDate(verification.completedAt) : "-"}
                </div>
              </div>
            </div>
          </div>
          
          {/* Summary */}
          {verification.summary && (
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/50">
              <div className="text-sm text-slate-500 mb-1">Résumé</div>
              <div className="text-sm text-slate-700">{verification.summary}</div>
            </div>
          )}
          
          {/* Checks */}
          {verification.checks && verification.checks.length > 0 && (
            <div className="p-3 bg-slate-50/50 rounded-lg border border-slate-200/50">
              <div className="text-sm font-medium text-slate-700 mb-2">Vérifications</div>
              <div className="space-y-2">
                {verification.checks.map(check => (
                  <motion.div
                    key={check.id}
                    layout
                    className={`
                      p-2 rounded-lg border border-slate-200/50 bg-white
                      ${check.passed ? "ring-1 ring-green-500/20" : "ring-1 ring-red-500/20"}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {check.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <X className="w-4 h-4 text-red-500" />
                        )}
                        <span className={`
                          text-sm font-medium
                          ${check.passed ? "text-green-600" : "text-red-600"}
                        `}
                        >
                          {check.name}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        check.severity === "error" || check.severity === "critical" ? "bg-red-500/10 text-red-600" :
                        check.severity === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-green-500/10 text-green-600"
                      }`}
                      >
                        {check.severity}
                      </span>
                    </div>
                    {check.message && (
                      <div className="text-xs text-slate-500 mt-1 pl-6">{check.message}</div>
                    )}
                    {check.fixSuggestion && (
                      <div className="text-xs text-blue-500 mt-1 pl-6">
                        Suggestion: {check.fixSuggestion}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          
          {/* Details */}
          {verification.details && (
            <div className="p-3 bg-slate-50/50 rounded-lg border border-slate-200/50">
              <div className="text-sm text-slate-500 mb-1">Détails</div>
              <pre className="text-xs text-slate-600 overflow-x-auto">{verification.details}</pre>
            </div>
          )}
          
          {/* Error */}
          {verification.error && (
            <div className="p-3 bg-red-50/50 rounded-lg border border-red-200/50">
              <div className="text-sm text-slate-500 mb-1">Erreur</div>
              <pre className="text-xs text-red-600">{verification.error}</pre>
            </div>
          )}
        </div>
        
        {/* Pied */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-sm"
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Composant principal VerificationMonitor
 */
export function VerificationMonitor({
  filterTypes,
  filterStatuses,
  filterTargets,
  showStats = true,
  maxVerifications = 100,
  autoScroll = true,
  onVerificationClick,
  maxHeight = "400px",
}: VerificationMonitorProps) {
  const { 
    verifications, 
    loading, 
    error,
    getVerificationsByType,
    getVerificationsByStatus,
    getVerificationsByTarget
  } = useVerificationManager();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVerification, setSelectedVerification] = useState<VerificationResult | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<VerificationType[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<VerificationStatus[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Vérifications filtrées
  const filteredVerifications = useMemo(() => {
    let result = verifications.slice(0, maxVerifications);
    
    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(v => 
        v.id.toLowerCase().includes(query) ||
        v.type.toLowerCase().includes(query) ||
        v.verifierName.toLowerCase().includes(query) ||
        v.targetId.toLowerCase().includes(query) ||
        v.targetType.toLowerCase().includes(query) ||
        v.summary?.toLowerCase().includes(query)
      );
    }
    
    // Filtre par types sélectionnés
    if (selectedTypes.length > 0) {
      result = result.filter(v => selectedTypes.includes(v.type));
    }
    
    // Filtre par statuts sélectionnés
    if (selectedStatuses.length > 0) {
      result = result.filter(v => selectedStatuses.includes(v.status));
    }
    
    // Filtre par types
    if (filterTypes && filterTypes.length > 0) {
      result = result.filter(v => filterTypes.includes(v.type));
    }
    
    // Filtre par statuts
    if (filterStatuses && filterStatuses.length > 0) {
      result = result.filter(v => filterStatuses.includes(v.status));
    }
    
    return result;
  }, [verifications, maxVerifications, searchQuery, selectedTypes, selectedStatuses, filterTypes, filterStatuses]);
  
  // Gestion du défilement automatique
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const shouldScroll = 
        scrollRef.current.scrollHeight - scrollRef.current.clientHeight <= 
        scrollRef.current.scrollTop + 100;
      
      if (shouldScroll) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }
    }
  }, [filteredVerifications, autoScroll]);
  
  // Gestion des filtres
  const toggleType = useCallback((type: VerificationType) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  }, []);
  
  const toggleStatus = useCallback((status: VerificationStatus) => {
    setSelectedStatuses(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  }, []);
  
  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTypes([]);
    setSelectedStatuses([]);
  }, []);
  
  // Gestion du clic
  const handleVerificationClick = useCallback((verification: VerificationResult) => {
    setSelectedVerification(verification);
    onVerificationClick?.(verification);
  }, [onVerificationClick]);
  
  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border shadow-sm overflow-hidden" style={{ maxHeight }}>
      {/* En-tête */}
      <div className="flex items-center justify-between p-3 border-b border-divider bg-surface-soft/50">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-800">Surveillance des vérifications</span>
        </div>
        
        <div className="flex items-center gap-2">
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
          
          {/* Bouton filtres */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg transition-colors ${
              showFilters || selectedTypes.length > 0 || selectedStatuses.length > 0 || searchQuery
                ? "bg-blue-500/10 text-blue-600"
                : "hover:bg-slate-100/50 text-slate-500"
            }`}
            title="Filtres"
          >
            <Filter className="w-4 h-4" />
            {showFilters || selectedTypes.length > 0 || selectedStatuses.length > 0 || searchQuery ? (
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-500" />
            ) : null}
          </button>
          
          <button
            onClick={clearAllFilters}
            disabled={!searchQuery && selectedTypes.length === 0 && selectedStatuses.length === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500 hover:text-slate-700 disabled:opacity-50"
            title="Effacer les filtres"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Statistiques */}
      {showStats && (
        <div className="p-3 border-b border-divider bg-surface-soft/30">
          <StatsPanel />
        </div>
      )}
      
      {/* Filtres */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-divider bg-surface-soft/30"
          >
            <div className="p-3 space-y-3">
              <div className="flex flex-wrap gap-3">
                {/* Types */}
                <div className="flex flex-wrap gap-1">
                  {Object.entries(VERIFICATION_TYPE_LABELS).map(([key, label]) => {
                    const isSelected = selectedTypes.includes(key as VerificationType);
                    const typeColor = VERIFICATION_TYPE_COLORS[key as VerificationType];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleType(key as VerificationType)}
                        className={`
                          px-2 py-1 rounded-md text-xs font-medium transition-all
                          ${isSelected 
                            ? `${typeColor.split(" ")[1]} ${typeColor.split(" ")[0]} border border-current`
                            : "text-slate-500 hover:bg-slate-100/50"
                          }
                        `}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                
                {/* Statuts */}
                <div className="flex flex-wrap gap-1 border-l border-slate-200 pl-3">
                  {Object.entries(STATUS_LABELS).map(([key, label]) => {
                    const isSelected = selectedStatuses.includes(key as VerificationStatus);
                    const statusColor = STATUS_COLORS[key as VerificationStatus];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleStatus(key as VerificationStatus)}
                        className={`
                          px-2 py-1 rounded-md text-xs font-medium transition-all
                          ${isSelected 
                            ? `${statusColor.split(" ")[1]} ${statusColor.split(" ")[0]}`
                            : "text-slate-500 hover:bg-slate-100/50"
                          }
                        `}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Liste des vérifications */}
      <div 
        ref={scrollRef}
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
        ) : filteredVerifications.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {filteredVerifications.map(verification => (
              <VerificationCard
                key={verification.id}
                verification={verification}
                selected={selectedVerification?.id === verification.id}
                onClick={handleVerificationClick}
              />
            ))}
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center h-full py-8">
            <div className="text-center text-slate-400">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aucune vérification trouvée</p>
              {searchQuery || selectedTypes.length > 0 || selectedStatuses.length > 0 ? (
                <p className="text-xs mt-1">Essayez de modifier vos filtres</p>
              ) : (
                <p className="text-xs mt-1">En attente de vérifications...</p>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Pied */}
      <div className="p-2 border-t border-divider bg-surface-soft/30 flex justify-between items-center">
        <div className="text-xs text-slate-500">
          {filteredVerifications.length} vérification(s) affichée(s)
        </div>
        <div className="text-xs text-slate-500">
          {verifications.length} total
        </div>
      </div>
      
      {/* Modal des détails */}
      <AnimatePresence>
        {selectedVerification && (
          <VerificationDetailsModal
            verification={selectedVerification}
            onClose={() => setSelectedVerification(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Exporter les sous-composants pour une utilisation indépendante
export { VerificationCard, StatsPanel, VerificationDetailsModal };

// Composant Loader2 pour éviter les erreurs
declare const Loader2: React.FC<{ className?: string }>;

export default VerificationMonitor;

/**
 * EventMonitor — Composant de surveillance des événements en temps réel
 * 
 * Ce composant affiche les événements du système en temps réel avec :
 * - Filtres par type, source, priorité
 * - Historique des événements
 * - Métriques en temps réel
 * - Recherche et filtrage
 * 
 * @example
 * <EventMonitor 
 *   filterTypes={["mission:*", "agent:*"]}
 *   maxEvents={100}
 *   autoScroll={true}
 * />
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Filter, Search, X, Clock, AlertTriangle, CheckCircle, Loader2, PauseCircle, PlayCircle } from "lucide-react";
import type { Event, EventType, EventFilter } from "../../../server/core/types";
import { useEventBus, useEventHistory } from "../../hooks";
import { StatusBadge } from "../ui/StatusBadge";

/**
 * Props du composant EventMonitor
 */
export interface EventMonitorProps {
  /** Types d'événements à afficher (par défaut: tous) */
  filterTypes?: EventType[];
  /** Sources à afficher (par défaut: toutes) */
  filterSources?: string[];
  /** Priorités minimales (par défaut: toutes) */
  minPriority?: "low" | "medium" | "high" | "critical";
  /** Nombre maximum d'événements à afficher */
  maxEvents?: number;
  /** Activer le défilement automatique */
  autoScroll?: boolean;
  /** Activer la pause */
  paused?: boolean;
  /** On événement cliqué */
  onEventClick?: (event: Event) => void;
  /** On filtre changé */
  onFilterChange?: (filter: EventFilter) => void;
  /** Hauteur maximale */
  maxHeight?: string;
}

/**
 * Catégories d'événements avec couleurs
 */
const EVENT_CATEGORIES = {
  task: { label: "Tâches", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  agent: { label: "Agents", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  tool: { label: "Outils", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  mission: { label: "Missions", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  file: { label: "Fichiers", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  verification: { label: "Vérifications", color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
  checkpoint: { label: "Checkpoints", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  artifact: { label: "Artefacts", color: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  recovery: { label: "Récupération", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  replan: { label: "Replanification", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  workspace: { label: "Workspace", color: "bg-teal-500/10 text-teal-500 border-teal-500/20" },
  system: { label: "Système", color: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
  message: { label: "Messages", color: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
} as const;

/**
 * Couleurs des priorités
 */
const PRIORITY_COLORS = {
  low: "text-gray-400",
  medium: "text-blue-400",
  high: "text-amber-400",
  critical: "text-red-400",
} as const;

/**
 * Icônes des statuts d'événements
 */
const EVENT_STATUS_ICONS = {
  started: PlayCircle,
  completed: CheckCircle,
  failed: AlertTriangle,
  cancelled: X,
  created: Clock,
  progress: Loader2,
  error: AlertTriangle,
  passed: CheckCircle,
  skipped: ChevronDown,
  paused: PauseCircle,
} as const;

/**
 * Extraction de la catégorie à partir du type d'événement
 */
function getEventCategory(type: EventType): keyof typeof EVENT_CATEGORIES {
  const parts = type.split(":");
  const category = parts[0] as keyof typeof EVENT_CATEGORIES;
  return EVENT_CATEGORIES[category] ? category : "system";
}

/**
 * Extraction de l'action à partir du type d'événement
 */
function getEventAction(type: EventType): string {
  const parts = type.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : type;
}

/**
 * Formatage de la date
 */
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { 
      hour: "2-digit", 
      minute: "2-digit", 
      second: "2-digit",
      hour12: false 
    });
  } catch {
    return isoString.substring(11, 19); // HH:MM:SS
  }
}

/**
 * Formatage de la date complète
 */
function formatFullDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

/**
 * Composant EventMonitor
 */
export function EventMonitor({
  filterTypes,
  filterSources,
  minPriority,
  maxEvents = 100,
  autoScroll = true,
  paused = false,
  onEventClick,
  onFilterChange,
  maxHeight = "400px",
}: EventMonitorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { getHistory, getMetrics, historySize, subscriberCount } = useEventBus();
  const { history, refresh } = useEventHistory(maxEvents);
  
  // Métriques en temps réel
  const [metrics, setMetrics] = useState(getMetrics());
  
  // Rafraîchir les métriques périodiquement
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(getMetrics());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [getMetrics]);

  // Gestion du défilement automatique
  useEffect(() => {
    if (autoScroll && !paused && scrollRef.current) {
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
  }, [history, autoScroll, paused]);

  // Appliquer les filtres
  const filteredHistory = useMemo(() => {
    return history.filter(event => {
      // Filtre par recherche
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const typeMatch = event.type.toLowerCase().includes(query);
        const sourceMatch = event.source?.toLowerCase().includes(query);
        const dataMatch = JSON.stringify(event.data).toLowerCase().includes(query);
        
        if (!typeMatch && !sourceMatch && !dataMatch) {
          return false;
        }
      }
      
      // Filtre par catégorie
      if (selectedCategories.length > 0) {
        const category = getEventCategory(event.type);
        if (!selectedCategories.includes(category)) {
          return false;
        }
      }
      
      // Filtre par source
      if (selectedSources.length > 0 && event.source) {
        if (!selectedSources.includes(event.source)) {
          return false;
        }
      }
      
      // Filtre par priorité minimale
      if (minPriority && event.priority) {
        const priorityOrder: ("low" | "medium" | "high" | "critical")[] = [
          "low", "medium", "high", "critical"
        ];
        const eventPriorityIndex = priorityOrder.indexOf(event.priority as "low" | "medium" | "high" | "critical");
        const minPriorityIndex = priorityOrder.indexOf(minPriority);
        
        if (eventPriorityIndex < minPriorityIndex) {
          return false;
        }
      }
      
      // Filtre par priorités sélectionnées
      if (selectedPriorities.length > 0 && event.priority) {
        if (!selectedPriorities.includes(event.priority)) {
          return false;
        }
      }
      
      // Filtre par types
      if (filterTypes && filterTypes.length > 0) {
        const matches = filterTypes.some(type => {
          if (type === "*") return true;
          if (type.endsWith(":*")) {
            return event.type.startsWith(type.slice(0, -2));
          }
          return event.type === type;
        });
        
        if (!matches) return false;
      }
      
      // Filtre par sources
      if (filterSources && filterSources.length > 0 && event.source) {
        if (!filterSources.includes(event.source)) {
          return false;
        }
      }
      
      return true;
    });
  }, [history, searchQuery, selectedCategories, selectedSources, selectedPriorities, filterTypes, filterSources, minPriority]);

  // Détecter les sources disponibles
  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    history.forEach(event => {
      if (event.source) {
        sources.add(event.source);
      }
    });
    return Array.from(sources).sort();
  }, [history]);

  // Gestion des filtres
  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  }, []);

  const toggleSource = useCallback((source: string) => {
    setSelectedSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  }, []);

  const togglePriority = useCallback((priority: string) => {
    setSelectedPriorities(prev => 
      prev.includes(priority) 
        ? prev.filter(p => p !== priority)
        : [...prev, priority]
    );
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategories([]);
    setSelectedSources([]);
    setSelectedPriorities([]);
  }, []);

  // Appliquer le callback onFilterChange
  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({
        types: selectedCategories.length > 0 
          ? selectedCategories.map(c => `${c}:*` as EventType)
          : undefined,
        source: selectedSources.length === 1 ? selectedSources[0] : undefined,
        minPriority: selectedPriorities.length > 0 
          ? selectedPriorities[0] as "low" | "medium" | "high" | "critical"
          : undefined,
      });
    }
  }, [selectedCategories, selectedSources, selectedPriorities, onFilterChange]);

  // Rendu d'un événement
  const renderEvent = useCallback((event: Event, index: number) => {
    const category = getEventCategory(event.type);
    const action = getEventAction(event.type);
    const categoryConfig = EVENT_CATEGORIES[category] || EVENT_CATEGORIES.system;
    const StatusIcon = EVENT_STATUS_ICONS[action as keyof typeof EVENT_STATUS_ICONS] || Clock;
    
    // Déterminer le statut en fonction du type d'événement
    const getStatusVariant = () => {
      if (action.includes("failed") || action.includes("error")) return "error";
      if (action.includes("completed") || action.includes("passed") || action.includes("success")) return "success";
      if (action.includes("started") || action.includes("created") || action.includes("progress")) return "info";
      if (action.includes("cancelled") || action.includes("skipped")) return "warning";
      return "default";
    };
    
    return (
      <motion.div
        key={`${event.timestamp}-${index}`}
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
        className={`
          flex items-start gap-3 p-2 rounded-lg 
          border border-transparent
          hover:bg-slate-50/5 hover:border-slate-200/50
          transition-all duration-200
          cursor-pointer
        `}
        onClick={() => onEventClick?.(event)}
      >
        {/* Indicateur temporel */}
        <div className="flex flex-col items-center gap-1 min-w-[40px]">
          <span className="text-xs text-slate-500">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
        
        {/* Icône de catégorie */}
        <div className={`
          flex items-center justify-center w-8 h-8 rounded-lg
          ${categoryConfig.color.split(" ")[0]} ${categoryConfig.color.split(" ")[1]}
        `}
        >
          <StatusIcon className="w-4 h-4" />
        </div>
        
        {/* Contenu de l'événement */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`
              px-2 py-0.5 rounded-md text-xs font-medium
              ${categoryConfig.color.split(" ")[1]} ${categoryConfig.color.split(" ")[0]}
            `}
            >
              {categoryConfig.label}
            </span>
            
            <span className="text-slate-600 font-medium">{action}</span>
            
            {/* Badge de priorité */}
            {event.priority && (
              <span className={`
                px-2 py-0.5 rounded-md text-xs font-medium
                ${PRIORITY_COLORS[event.priority as keyof typeof PRIORITY_COLORS]}
                bg-slate-100/50
              `}
              >
                {event.priority}
              </span>
            )}
          </div>
          
          <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-2">
            {event.source && (
              <span className="text-slate-400">
                Source: {event.source}
              </span>
            )}
            
            {/* Affichage des données spécifiques */}
            {event.type === "mission:started" && (
              <span className="text-blue-600">
                Mission: {(event.data as any).missionId}
              </span>
            )}
            
            {event.type === "task:completed" && (
              <span className="text-green-600">
                Tâche: {(event.data as any).taskId} terminé
              </span>
            )}
            
            {event.type === "artifact:created" && (
              <span className="text-pink-600">
                Artefact: {(event.data as any).artifact?.name || (event.data as any).artifactId}
              </span>
            )}
            
            {event.type === "verification:passed" && (
              <span className="text-cyan-600">
                Vérification: {(event.data as any).verificationId} OK
              </span>
            )}
            
            {event.type === "verification:failed" && (
              <span className="text-red-600">
                Vérification: {(event.data as any).verificationId} ÉCHOUÉ
              </span>
            )}
          </div>
        </div>
        
        {/* Statut */}
        <div className="flex items-center">
          <StatusBadge variant={getStatusVariant()} size="sm" />
        </div>
      </motion.div>
    );
  }, [onEventClick]);

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border shadow-sm overflow-hidden" style={{ maxHeight }}>
      {/* En-tête */}
      <div className="flex items-center justify-between p-3 border-b border-divider bg-surface-soft/50">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-semibold text-slate-800">Événements en temps réel</span>
          </div>
          
          {/* Statistiques */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {metrics.uptime ? (metrics.uptime / 1000).toFixed(0) + "s" : "0s"}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {metrics.total}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {subscriberCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              {historySize}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Boutons de contrôle */}
          <button
            onClick={() => refresh()}
            className="p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500 hover:text-slate-700"
            title="Rafraîchir"
          >
            <Loader2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg transition-colors ${
              showFilters || selectedCategories.length > 0 || selectedSources.length > 0 || selectedPriorities.length > 0 || searchQuery
                ? "bg-blue-500/10 text-blue-600"
                : "hover:bg-slate-100/50 text-slate-500"
            }`}
            title="Filtres"
          >
            <Filter className="w-4 h-4" />
            {showFilters || selectedCategories.length > 0 || selectedSources.length > 0 || selectedPriorities.length > 0 || searchQuery ? (
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-500" />
            ) : null}
          </button>
          
          <button
            onClick={() => setPaused(!paused)}
            className={`p-1.5 rounded-lg transition-colors ${
              paused ? "bg-amber-500/10 text-amber-600" : "hover:bg-slate-100/50 text-slate-500"
            }`}
            title={paused ? "Reprendre" : "Pause"}
          >
            {paused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
          </button>
          
          {onEventClick && (
            <button
              onClick={clearAllFilters}
              disabled={!searchQuery && selectedCategories.length === 0 && selectedSources.length === 0 && selectedPriorities.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500 hover:text-slate-700 disabled:opacity-50"
              title="Effacer les filtres"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
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
              {/* Recherche */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher dans les événements..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex flex-wrap gap-3">
                {/* Catégories */}
                <div className="flex flex-wrap gap-1">
                  {Object.entries(EVENT_CATEGORIES).map(([key, config]) => {
                    const isSelected = selectedCategories.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleCategory(key)}
                        className={`
                          px-2 py-1 rounded-md text-xs font-medium transition-all
                          ${isSelected 
                            ? `${config.color.split(" ")[1]} ${config.color.split(" ")[0]} border border-current`
                            : "text-slate-500 hover:bg-slate-100/50 hover:text-slate-700"
                          }
                        `}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
                
                {/* Priorités */}
                <div className="flex flex-wrap gap-1 border-l border-slate-200 pl-3">
                  {(["low", "medium", "high", "critical"] as const).map(priority => {
                    const isSelected = selectedPriorities.includes(priority);
                    return (
                      <button
                        key={priority}
                        onClick={() => togglePriority(priority)}
                        className={`
                          px-2 py-1 rounded-md text-xs font-medium transition-all
                          ${isSelected 
                            ? `${PRIORITY_COLORS[priority]} bg-slate-100/50`
                            : "text-slate-500 hover:bg-slate-100/50"
                          }
                        `}
                      >
                        {priority}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Sources */}
              {availableSources.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {availableSources.slice(0, 10).map(source => {
                    const isSelected = selectedSources.includes(source);
                    return (
                      <button
                        key={source}
                        onClick={() => toggleSource(source)}
                        className={`
                          px-2 py-1 rounded-md text-xs transition-all
                          ${isSelected 
                            ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                            : "text-slate-500 hover:bg-slate-100/50"
                          }
                        `}
                      >
                        {source}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Liste des événements */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200/50 scrollbar-track-transparent"
      >
        <AnimatePresence mode="popLayout">
          {filteredHistory.length > 0 ? (
            filteredHistory.map((event, index) => renderEvent(event, index))
          ) : (
            <div className="flex items-center justify-center h-full py-8">
              <div className="text-center text-slate-400">
                <div className="w-12 h-12 rounded-full bg-slate-100/50 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm">Aucun événement trouvé</p>
                {searchQuery || selectedCategories.length > 0 || selectedSources.length > 0 || selectedPriorities.length > 0 ? (
                  <p className="text-xs mt-1">Essayez de modifier vos filtres</p>
                ) : (
                  <p className="text-xs mt-1">En attente d'événements...</p>
                )}
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Pied */}
      <div className="p-2 border-t border-divider bg-surface-soft/30 flex justify-between items-center">
        <div className="text-xs text-slate-500">
          {filteredHistory.length} événement(s) affiché(s)
        </div>
        <div className="text-xs text-slate-500">
          {historySize} total
        </div>
      </div>
    </div>
  );
}

export default EventMonitor;

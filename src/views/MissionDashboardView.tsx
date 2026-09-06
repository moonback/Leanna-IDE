/**
 * MissionDashboardView — Tableau de bord de gestion des missions
 * 
 * Ce composant fournit une vue centralisée pour surveiller et gérer :
 * - Les missions actives et historiques
 * - La Goal Stack (pile d'objectifs)
 * - L'exécution des plans
 * - La réflexion et l'apprentissage
 * - Les métriques de performance des missions
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, Target, Play, Pause, Stop, CheckCircle, XCircle, AlertCircle,
  Clock, ListOrdered, BarChart3, Settings, Plus, Search, Filter, MoreVertical,
  ChevronRight, ChevronLeft, RefreshCw, Trash2, Edit2, Eye, Rocket
} from "lucide-react";
import type { Mission, Goal, MissionStatus, MissionConfig, GoalStatus } from "../../server/mission/types";
import { useMissionManager } from "../hooks/useMissionManager";

// Types pour l'UI
interface MissionCardProps {
  mission: Mission;
  onSelect: (mission: Mission) => void;
  onStatusChange: (mission: Mission, newStatus: MissionStatus) => void;
  onDelete: (missionId: string) => void;
}

interface GoalTreeProps {
  goals: Goal[];
  onGoalSelect: (goal: Goal) => void;
  selectedGoalId?: string;
}

interface MissionStatsProps {
  stats: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    avgDuration: number;
    successRate: number;
  };
}

// Couleurs par statut
const statusColors: Record<MissionStatus, { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  completed: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  failed: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  cancelled: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
};

const goalStatusColors: Record<GoalStatus, { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  blocked: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  failed: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  cancelled: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
};

// Composant MissionCard
function MissionCard({ mission, onSelect, onStatusChange, onDelete }: MissionCardProps) {
  const colors = statusColors[mission.status] || statusColors.pending;
  
  const handleStatusChange = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Logic pour changer le statut
    const newStatus: MissionStatus = mission.status === "in_progress" ? "completed" : 
                                    mission.status === "completed" ? "in_progress" : "in_progress";
    onStatusChange(mission, newStatus);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onSelect(mission)}
      className={`
        bg-surface rounded-xl border border-border shadow-sm cursor-pointer
        transition-all duration-200
        ${colors.border}
      `}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            <div className={`
              w-3 h-3 rounded-full shrink-0 mt-1.5
              ${colors.bg} ${colors.border}
            `} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800 truncate">{mission.title}</h3>
              <p className="text-sm text-slate-500 line-clamp-1">{mission.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className={`
              px-2 py-0.5 rounded-full text-xs font-medium
              ${colors.bg} ${colors.text}
            `}>
              {mission.status.replace("_", " ")}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(mission.createdAt).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              {mission.goals?.length || 0} objectifs
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleStatusChange}
              className="p-1 rounded hover:bg-slate-100/50 transition-colors"
              title="Changer le statut"
            >
              {mission.status === "in_progress" ? (
                <Pause className="w-4 h-4 text-blue-500" />
              ) : mission.status === "completed" ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <Play className="w-4 h-4 text-slate-400" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(mission.id);
              }}
              className="p-1 rounded hover:bg-red-50/50 transition-colors text-red-400"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Barre de progression */}
        {mission.progress !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Progression</span>
              <span>{mission.progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${mission.progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Composant GoalTree (pour afficher la hiérarchie des objectifs)
function GoalTree({ goals, onGoalSelect, selectedGoalId }: GoalTreeProps) {
  const buildTree = useCallback((goals: Goal[]): any[] => {
    const rootGoals = goals.filter(g => g.parentId === null);
    return rootGoals.map(root => buildNode(root, goals));
  }, []);

  const buildNode = (goal: Goal, allGoals: Goal[]): any => ({
    ...goal,
    children: allGoals
      .filter(g => g.parentId === goal.id)
      .map(child => buildNode(child, allGoals))
  });

  const tree = useMemo(() => buildTree(goals), [goals, buildTree]);

  return (
    <div className="space-y-2">
      {tree.map((node, index) => (
        <GoalTreeNode
          key={node.id}
          node={node}
          level={0}
          onSelect={onGoalSelect}
          selectedId={selectedGoalId}
          hasNext={index < tree.length - 1}
        />
      ))}
    </div>
  );
}

function GoalTreeNode({ 
  node, 
  level, 
  onSelect, 
  selectedId,
  hasNext 
}: {
  node: any;
  level: number;
  onSelect: (goal: Goal) => void;
  selectedId?: string;
  hasNext: boolean;
}) {
  const colors = goalStatusColors[node.status] || goalStatusColors.pending;
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="pl-4">
      <motion.div
        layout
        className={`
          flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all
          ${isSelected ? 'bg-blue-50/50 border border-blue-200' : 'hover:bg-slate-50/50'}
        `}
        onClick={() => onSelect(node)}
        whileHover={{ x: 2 }}
      >
        {/* Connecteur */}
        {level > 0 && (
          <div className="relative">
            <div className={`
              absolute left-2 top-0 w-0.5 h-full 
              ${hasNext ? 'bg-slate-200' : 'bg-transparent'}
            `} />
          </div>
        )}
        
        {/* Statut */}
        <div className={`
          w-2 h-2 rounded-full shrink-0
          ${colors.bg} ${colors.border}
        `} />
        
        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span 
              className={`
                font-medium text-sm
                ${isSelected ? 'text-blue-600' : 'text-slate-700'}
              `}
            >
              {node.title}
            </span>
            {node.priority && (
              <span className={`
                px-1.5 py-0.5 rounded-full text-xs font-medium
                ${node.priority === 'high' ? 'bg-red-100 text-red-600' :
                  node.priority === 'critical' ? 'bg-purple-100 text-purple-600' :
                  node.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                  'bg-gray-100 text-gray-600'}
              `}>
                {node.priority}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 line-clamp-1">{node.description}</p>
          
          {/* Progression */}
          {node.progress !== undefined && (
            <div className="mt-1">
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${node.progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Indicateur d'enfants */}
        {hasChildren && (
          <ChevronRight className={`
            w-4 h-4 text-slate-400 transition-transform
            ${isSelected ? 'rotate-90' : ''}
          `} />
        )}
      </motion.div>
      
      {/* Enfants */}
      {hasChildren && isSelected && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.2 }}
        >
          {node.children.map((child: any, childIndex: number) => (
            <GoalTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onGoalSelect}
              selectedId={selectedId}
              hasNext={childIndex < node.children.length - 1}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

// Composant MissionStats
function MissionStats({ stats }: MissionStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-surface rounded-xl border border-border shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Total</span>
          <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-blue-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
        <div className="text-xs text-green-600">+{stats.active} actifs</div>
      </div>
      
      <div className="bg-surface rounded-xl border border-border shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Succès</span>
          <div className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-800">{stats.completed}</div>
        <div className="text-xs text-green-600">{stats.successRate}% taux</div>
      </div>
      
      <div className="bg-surface rounded-xl border border-border shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Temps moyen</span>
          <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-800">{(stats.avgDuration / 1000).toFixed(0)}s</div>
        <div className="text-xs text-purple-600">par mission</div>
      </div>
    </div>
  );
}

// Type pour l'onglet actif
type DashboardTab = "overview" | "missions" | "goals" | "stats" | "settings";

// Props du composant
export interface MissionDashboardViewProps {
  initialTab?: DashboardTab;
}

/**
 * Composant MissionDashboardView
 */
export function MissionDashboardView({ initialTab = "overview" }: MissionDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [showCreateMission, setShowCreateMission] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  
  const { missions, createMission, deleteMission } = useMissionManager();

  // Filtrage des missions
  const filteredMissions = useMemo(() => {
    return missions.filter(mission => 
      mission.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mission.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [missions, searchQuery]);

  // Statistiques
  const stats = useMemo(() => {
    const total = missions.length;
    const active = missions.filter(m => m.status === "in_progress" || m.status === "pending").length;
    const completed = missions.filter(m => m.status === "completed").length;
    const failed = missions.filter(m => m.status === "failed").length;
    const avgDuration = missions.reduce((sum, m) => {
      if (m.completedAt) {
        return sum + (new Date(m.completedAt).getTime() - new Date(m.createdAt).getTime());
      }
      return sum;
    }, 0) / (completed || 1);
    
    return {
      total,
      active,
      completed,
      failed,
      avgDuration: completed > 0 ? avgDuration : 0,
      successRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }, [missions]);

  // Gestion des missions
  const handleCreateMission = async (missionData: Partial<Mission>) => {
    await createMission(missionData);
    setShowCreateMission(false);
  };

  const handleDeleteMission = async (missionId: string) => {
    await deleteMission(missionId);
    if (selectedMission?.id === missionId) {
      setSelectedMission(null);
    }
  };

  const handleMissionSelect = (mission: Mission) => {
    setSelectedMission(mission);
    setActiveTab("goals");
  };

  const handleStatusChange = async (mission: Mission, newStatus: MissionStatus) => {
    // Mise à jour du statut
    // Cela sera remplacé par l'appel API réel
  };

  // Rendu de l'onglet "Vue d'ensemble"
  const renderOverview = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 p-4"
    >
      {/* Statistiques principales */}
      <MissionStats stats={stats} />
      
      {/* Liste des missions récentes */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-slate-800">Missions récentes</span>
          </div>
          <button
            onClick={() => setShowCreateMission(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle mission
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredMissions.slice(0, 4).map(mission => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onSelect={handleMissionSelect}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteMission}
            />
          ))}
        </div>
        
        {filteredMissions.length > 4 && (
          <button
            onClick={() => setActiveTab("missions")}
            className="mt-4 w-full py-2 text-sm text-blue-600 hover:text-blue-700"
          >
            Voir toutes les missions ({filteredMissions.length})
          </button>
        )}
      </div>
      
      {/* Activité récente */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-800">Activité récente</span>
        </div>
        <div className="space-y-3">
          {missions.slice(0, 5).map(mission => (
            <div key={mission.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`
                  w-2 h-2 rounded-full
                  ${statusColors[mission.status]?.bg || "bg-slate-200"}
                `} />
                <span className="text-sm text-slate-700">{mission.title}</span>
              </div>
              <span className="text-xs text-slate-500">
                {new Date(mission.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Missions"
  const renderMissions = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        {/* Recherche */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher une mission..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={() => setShowCreateMission(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle
          </button>
        </div>
        
        {/* Filtres */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button className="px-3 py-1 bg-blue-500/10 text-blue-600 rounded-full">Tout ({missions.length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Actif ({missions.filter(m => m.status === "in_progress").length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Terminé ({missions.filter(m => m.status === "completed").length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">En attente ({missions.filter(m => m.status === "pending").length})</button>
        </div>
        
        {/* Liste des missions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMissions.map(mission => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onSelect={handleMissionSelect}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteMission}
            />
          ))}
        </div>
        
        {filteredMissions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <LayoutDashboard className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-500">Aucune mission trouvée</p>
            <button
              onClick={() => setShowCreateMission(true)}
              className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Créer une mission
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Objectifs"
  const renderGoals = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      {selectedMission ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedMission(null)}
                className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div className="flex items-center gap-3">
                <span className={`
                  px-2 py-1 rounded-full text-xs font-medium
                  ${statusColors[selectedMission.status]?.bg}
                  ${statusColors[selectedMission.status]?.text}
                `}>
                  {selectedMission.status.replace("_", " ")}
                </span>
                <h2 className="text-xl font-semibold text-slate-800">{selectedMission.title}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
                <Play className="w-4 h-4" /> Démarrer
              </button>
              <button className="px-3 py-1.5 text-slate-600 hover:bg-slate-100/50 rounded-lg text-sm font-medium transition-colors">
                <Edit2 className="w-4 h-4" /> Modifier
              </button>
            </div>
          </div>
          
          <p className="text-slate-500 mb-6">{selectedMission.description}</p>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Goal Stack */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <ListOrdered className="w-5 h-5 text-slate-500" />
                <span className="font-semibold text-slate-800">Goal Stack</span>
              </div>
              <GoalTree
                goals={selectedMission.goals || []}
                onGoalSelect={(goal) => console.log("Objectif sélectionné:", goal)}
                selectedGoalId={undefined}
              />
            </div>
            
            {/* Métriques de la mission */}
            <div className="bg-surface-soft rounded-xl p-4">
              <h3 className="font-semibold text-slate-800 mb-4">Métriques</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Progression</span>
                  <span className="text-lg font-bold text-blue-600">{selectedMission.progress || 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${selectedMission.progress || 0}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Créée le</span>
                    <span className="text-slate-700">{new Date(selectedMission.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Objectifs</span>
                    <span className="text-slate-700">{selectedMission.goals?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tentatives max</span>
                    <span className="text-slate-700">{selectedMission.config?.maxAttempts || 3}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Target className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500">Sélectionnez une mission pour voir ses objectifs</p>
        </div>
      )}
    </motion.div>
  );

  // Rendu de l'onglet "Statistiques"
  const renderStats = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <h2 className="text-xl font-semibold text-slate-800 mb-6">Analyse des missions</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Graphique de répartition par statut */}
          <div className="bg-surface-soft rounded-xl p-4">
            <h3 className="font-semibold text-slate-800 mb-4">Par statut</h3>
            <div className="space-y-3">
              {Object.entries(statusColors).map(([status, colors]) => {
                const count = missions.filter(m => m.status === status as MissionStatus).length;
                const percentage = (count / missions.length * 100).toFixed(1);
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{status.replace("_", " ")}</span>
                      <span className="text-slate-700">{count} ({percentage}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${colors.bg}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Graphique de progression moyenne */}
          <div className="bg-surface-soft rounded-xl p-4">
            <h3 className="font-semibold text-slate-800 mb-4">Progression moyenne</h3>
            <div className="flex items-end justify-between h-32">
              {missions.slice(0, 10).map((mission, index) => {
                const height = (mission.progress || 0) / 100 * 100;
                return (
                  <motion.div
                    key={mission.id}
                    className="flex-1 mx-1 bg-blue-400 rounded-t" 
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    style={{ minHeight: '8px' }}
                    title={mission.title}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              {missions.slice(0, 10).map(mission => (
                <span key={mission.id} className="truncate max-w-[80px]">{mission.title}</span>
              ))}
            </div>
          </div>
        </div>
        
        {/* Historique */}
        <div className="mt-6 bg-surface-soft rounded-xl p-4">
          <h3 className="font-semibold text-slate-800 mb-4">Historique</h3>
          <div className="grid grid-cols-4 gap-2 text-xs text-slate-500">
            <div>Date</div>
            <div>Mission</div>
            <div>Statut</div>
            <div>Durée</div>
          </div>
          <div className="mt-2 space-y-2">
            {missions.slice(0, 5).map(mission => (
              <div key={mission.id} className="grid grid-cols-4 gap-2 py-2 border-b border-slate-100/50">
                <div className="text-sm text-slate-700">
                  {new Date(mission.createdAt).toLocaleDateString()}
                </div>
                <div className="text-sm text-slate-700 truncate">{mission.title}</div>
                <div className="text-sm">
                  <span className={`
                    px-2 py-0.5 rounded-full text-xs font-medium
                    ${statusColors[mission.status]?.bg}
                    ${statusColors[mission.status]?.text}
                  `}>
                    {mission.status.replace("_", " ")}
                  </span>
                </div>
                <div className="text-sm text-slate-500">
                  {mission.completedAt ? 
                    `${((new Date(mission.completedAt).getTime() - new Date(mission.createdAt).getTime()) / 1000 / 60).toFixed(0)} min` :
                    'En cours'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Paramètres"
  const renderSettings = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4"
    >
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-800">Paramètres du tableau de bord</span>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700">
                Afficher les métriques globales
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Affiche le panneau de statistiques dans l'onglet Vue d'ensemble
              </p>
            </div>
            <button className="w-10 h-6 rounded-full relative bg-blue-500 transition-colors">
              <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform translate-x-4" />
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700">
                Auto-rafraîchissement
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Met à jour automatiquement les données toutes les 30 secondes
              </p>
            </div>
            <button className="w-10 h-6 rounded-full relative bg-blue-500 transition-colors">
              <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform translate-x-4" />
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700">
                Notifications sonores
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Joue un son lors de la complétion des missions
              </p>
            </div>
            <button className="w-10 h-6 rounded-full relative bg-slate-200 transition-colors">
              <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform" />
            </button>
          </div>
        </div>
        
        <div className="mt-6 border-t border-slate-200/50 pt-4">
          <button className="w-full py-2 bg-red-600/10 hover:bg-red-600/20 text-red-600 rounded-lg transition-colors text-sm">
            Réinitialiser le tableau de bord
          </button>
        </div>
      </div>
    </motion.div>
  );

  // Rendu du modal de création de mission
  const renderCreateMissionModal = () => (
    <AnimatePresence>
      {showCreateMission && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-2xl p-6 m-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Nouvelle mission</h2>
              <button
                onClick={() => setShowCreateMission(false)}
                className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleCreateMission({
                title: formData.get('title') as string,
                description: formData.get('description') as string,
              });
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Titre
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="Nom de la mission"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Description détaillée de la mission"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateMission(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100/50 rounded-lg text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Créer la mission
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Navigation des onglets
  const tabs: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Vue d'ensemble", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "missions", label: "Missions", icon: <Target className="w-4 h-4" /> },
    { id: "goals", label: "Objectifs", icon: <ListOrdered className="w-4 h-4" /> },
    { id: "stats", label: "Statistiques", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "settings", label: "Paramètres", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-soft">
      {/* En-tête */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <Target className="w-6 h-6 text-blue-600" />
          <span className="text-xl font-bold text-slate-800">Tableau de bord des missions</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateMission(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle mission
          </button>
          <button className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500 hover:text-slate-700">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex items-center gap-1 p-2 bg-surface border-b border-border overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg transition-all
                ${isActive 
                  ? "bg-blue-500/10 text-blue-600 font-medium" 
                  : "text-slate-500 hover:bg-slate-100/50 hover:text-slate-700"
                }
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      
      {/* Contenu */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {activeTab === "overview" && renderOverview()}
            {activeTab === "missions" && renderMissions()}
            {activeTab === "goals" && renderGoals()}
            {activeTab === "stats" && renderStats()}
            {activeTab === "settings" && renderSettings()}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Modals */}
      {renderCreateMissionModal()}
    </div>
  );
}

export default MissionDashboardView;

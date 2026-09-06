/**
 * AgentDashboardView — Tableau de bord de gestion des agents
 * 
 * Ce composant fournit une vue centralisée pour surveiller et gérer :
 * - Les agents actifs et disponibles
 * - Le registre des agents (AgentRegistry)
 * - L'orchestration des tâches
 * - La communication inter-agents
 * - Les métriques de performance
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, Users, Bot, Play, Pause, Stop, CheckCircle, XCircle, 
  AlertCircle, Clock, Activity, BarChart3, Settings, Plus, Search, Filter,
  MoreVertical, RefreshCw, Trash2, Edit2, Eye, MessageSquare, Network
} from "lucide-react";

// Types pour les agents
interface Agent {
  id: string;
  name: string;
  type: string;
  status: "idle" | "busy" | "offline" | "error";
  capabilities: string[];
  currentTask?: string;
  progress?: number;
  createdAt: string;
  lastActivityAt?: string;
  description?: string;
}

interface Task {
  id: string;
  title: string;
  agentId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: "low" | "medium" | "high" | "critical";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface AgentCardProps {
  agent: Agent;
  onSelect: (agent: Agent) => void;
  onAction: (agent: Agent, action: string) => void;
}

interface TaskCardProps {
  task: Task;
  agent?: Agent;
  onSelect: (task: Task) => void;
}

// Couleurs par statut
const agentStatusColors = {
  idle: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  busy: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  offline: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-400" },
  error: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
};

const taskStatusColors = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  completed: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  failed: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

// Composant AgentCard
function AgentCard({ agent, onSelect, onAction }: AgentCardProps) {
  const colors = agentStatusColors[agent.status] || agentStatusColors.idle;
  const agentIcon = getAgentIcon(agent.type);

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onSelect(agent)}
      className={`
        bg-surface rounded-xl border border-border shadow-sm cursor-pointer
        transition-all duration-200
      `}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            <div className={`
              w-3 h-3 rounded-full shrink-0 mt-1.5 animate-pulse
              ${colors.dot}
            `} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800 truncate">{agent.name}</h3>
              <p className="text-sm text-slate-500 line-clamp-1">{agent.description || agent.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className={`
              px-2 py-0.5 rounded-full text-xs font-medium
              ${colors.bg} ${colors.text}
            `}>
              {agent.status.replace("_", " ")}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
          <div className="flex items-center gap-3">
            {agentIcon}
            <span>{agent.type}</span>
          </div>
          <span>
            {agent.capabilities?.length || 0} compétences
          </span>
        </div>
        
        {/* Tâche en cours */}
        {agent.currentTask && agent.progress !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Tâche en cours</span>
              <span>{agent.progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${agent.progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <p className="text-xs text-slate-600 mt-1 truncate">{agent.currentTask}</p>
          </div>
        )}
        
        {/* Dernière activité */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Dernière activité</span>
          <span>
            {agent.lastActivityAt 
              ? new Date(agent.lastActivityAt).toLocaleTimeString()
              : "Jamais"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Composant TaskCard
function TaskCard({ task, agent, onSelect }: TaskCardProps) {
  const colors = taskStatusColors[task.status] || taskStatusColors.pending;
  
  return (
    <motion.div
      whileHover={{ scale: 1.02, x: 2 }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onSelect(task)}
      className={`
        bg-surface rounded-lg border border-border shadow-sm cursor-pointer
        transition-all duration-200 p-3
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1">
          <div className={`
            w-2 h-2 rounded-full shrink-0
            ${colors.bg}
          `} />
          <h4 className="font-medium text-slate-700 truncate text-sm">{task.title}</h4>
        </div>
        <span className={`
          px-2 py-0.5 rounded-full text-xs font-medium
          ${colors.bg} ${colors.text}
        `}>
          {task.status.replace("_", " ")}
        </span>
      </div>
      
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3" />
          <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
        </div>
        {agent && (
          <div className="flex items-center gap-1">
            <Robot className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{agent.name}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Fonction utilitaire pour obtenir l'icône de l'agent
function getAgentIcon(type: string) {
  switch (type) {
    case "code":
      return <span className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-600 rounded-lg font-medium">{type}</span>;
    case "data":
      return <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-lg font-medium">{type}</span>;
    case "content":
      return <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 rounded-lg font-medium">{type}</span>;
    case "monitoring":
      return <span className="text-xs px-2 py-0.5 bg-orange-500/10 text-orange-600 rounded-lg font-medium">{type}</span>;
    default:
      return <span className="text-xs px-2 py-0.5 bg-slate-500/10 text-slate-600 rounded-lg font-medium">{type}</span>;
  }
}

// Hook pour gérer les agents
function useAgentManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  // Simuler le chargement
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // Simulation de chargement
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
    };
    
    loadData();
  }, []);

  // Stats des agents
  const stats = useMemo(() => {
    return {
      total: agents.length,
      idle: agents.filter(a => a.status === "idle").length,
      busy: agents.filter(a => a.status === "busy").length,
      offline: agents.filter(a => a.status === "offline").length,
      error: agents.filter(a => a.status === "error").length,
    };
  }, [agents]);

  // Stats des tâches
  const taskStats = useMemo(() => {
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === "pending").length,
      in_progress: tasks.filter(t => t.status === "in_progress").length,
      completed: tasks.filter(t => t.status === "completed").length,
      failed: tasks.filter(t => t.status === "failed").length,
    };
  }, [tasks]);

  // Actions
  const createAgent = useCallback(async (agent: Partial<Agent>) => {
    const newAgent: Agent = {
      id: Date.now().toString(),
      name: agent.name || "Nouvel agent",
      type: agent.type || "default",
      status: "idle",
      capabilities: agent.capabilities || [],
      description: agent.description,
      createdAt: new Date().toISOString(),
    };
    
    setAgents(prev => [newAgent, ...prev]);
    return newAgent;
  }, []);

  const deleteAgent = useCallback(async (agentId: string) => {
    setAgents(prev => prev.filter(a => a.id !== agentId));
  }, []);

  const createTask = useCallback(async (task: Partial<Task>) => {
    const newTask: Task = {
      id: Date.now().toString(),
      title: task.title || "Nouvelle tâche",
      agentId: task.agentId || "",
      status: "pending",
      priority: task.priority || "medium",
      createdAt: new Date().toISOString(),
    };
    
    setTasks(prev => [newTask, ...prev]);
    return newTask;
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const assignTask = useCallback(async (taskId: string, agentId: string) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, agentId } : t
    ));
  }, []);

  return {
    agents,
    tasks,
    selectedAgent,
    selectedTask,
    loading,
    stats,
    taskStats,
    setSelectedAgent,
    setSelectedTask,
    createAgent,
    deleteAgent,
    createTask,
    deleteTask,
    assignTask,
  };
}

// Type pour l'onglet actif
type DashboardTab = "overview" | "agents" | "tasks" | "orchestration" | "communication" | "settings";

// Props du composant
export interface AgentDashboardViewProps {
  initialTab?: DashboardTab;
}

/**
 * Composant AgentDashboardView
 */
export function AgentDashboardView({ initialTab = "overview" }: AgentDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const {
    agents,
    tasks,
    selectedAgent,
    selectedTask,
    loading,
    stats,
    taskStats,
    setSelectedAgent,
    setSelectedTask,
    createAgent,
    deleteAgent,
    createTask,
    deleteTask,
    assignTask,
  } = useAgentManager();

  // Filtrage
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => 
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [agents, searchQuery]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => 
      task.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tasks, searchQuery]);

  // Gestion des actions
  const handleCreateAgent = async (agentData: Partial<Agent>) => {
    await createAgent(agentData);
    setShowCreateAgent(false);
  };

  const handleCreateTask = async (taskData: Partial<Task>) => {
    await createTask(taskData);
    setShowCreateTask(false);
  };

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
  };

  // Rendu de l'onglet "Vue d'ensemble"
  const renderOverview = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 p-4"
    >
      {/* Statistiques des agents */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-surface rounded-xl border border-border shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Total</span>
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
          <div className="text-xs text-green-600">agents disponibles</div>
        </div>
        
        <div className="bg-surface rounded-xl border border-border shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Disponibles</span>
            <div className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.idle}</div>
          <div className="text-xs text-green-600">en attente</div>
        </div>
        
        <div className="bg-surface rounded-xl border border-border shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Occupés</span>
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.busy}</div>
          <div className="text-xs text-blue-600">en exécution</div>
        </div>
        
        <div className="bg-surface rounded-xl border border-border shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Tâches</span>
            <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <ListOrdered className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{taskStats.total}</div>
          <div className="text-xs text-purple-600">{taskStats.in_progress} en cours</div>
        </div>
      </div>
      
      {/* Résumé des tâches */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">Agents actifs</span>
          </div>
          <div className="space-y-3">
            {agents.filter(a => a.status !== "offline").slice(0, 5).map(agent => (
              <div key={agent.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-2 h-2 rounded-full
                    ${agentStatusColors[agent.status]?.dot}
                  `} />
                  <span className="text-sm text-slate-700">{agent.name}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {agent.currentTask ? "En tâche" : "Disponible"}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">Tâches récentes</span>
          </div>
          <div className="space-y-3">
            {tasks.slice(0, 5).map(task => (
              <div key={task.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-2 h-2 rounded-full
                    ${taskStatusColors[task.status]?.bg}
                  `} />
                  <span className="text-sm text-slate-700 truncate max-w-[120px]">{task.title}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(task.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Visualisation du réseau */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-800">Réseau d'agents</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {agents.map(agent => {
            const colors = agentStatusColors[agent.status];
            return (
              <div key={agent.id} className="flex flex-col items-center gap-2">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center
                    ${colors?.bg} ${colors?.border}
                    shadow-lg
                  `}
                >
                  <Robot className="w-6 h-6 text-slate-600" />
                </motion.div>
                <span className="text-xs text-slate-700 font-medium">{agent.name}</span>
                <span className="text-xs text-slate-500">{agent.status.replace("_", " ")}</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Agents"
  const renderAgents = () => (
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
              placeholder="Rechercher un agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={() => setShowCreateAgent(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau
          </button>
        </div>
        
        {/* Filtres */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button className="px-3 py-1 bg-blue-500/10 text-blue-600 rounded-full">Tout ({agents.length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Disponible ({stats.idle})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Occupé ({stats.busy})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Hors ligne ({stats.offline})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Erreur ({stats.error})</button>
        </div>
        
        {/* Liste des agents */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAgents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onSelect={handleAgentSelect}
              onAction={(agent, action) => {
                if (action === "delete") {
                  deleteAgent(agent.id);
                }
              }}
            />
          ))}
        </div>
        
        {filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Robot className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-500">Aucun agent trouvé</p>
            <button
              onClick={() => setShowCreateAgent(true)}
              className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Créer un agent
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Tâches"
  const renderTasks = () => (
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
              placeholder="Rechercher une tâche..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={() => setShowCreateTask(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle
          </button>
        </div>
        
        {/* Filtres */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button className="px-3 py-1 bg-blue-500/10 text-blue-600 rounded-full">Tout ({tasks.length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">En attente ({taskStats.pending})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">En cours ({taskStats.in_progress})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Terminé ({taskStats.completed})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Échoué ({taskStats.failed})</button>
        </div>
        
        {/* Liste des tâches */}
        <div className="grid grid-cols-1 gap-2">
          {filteredTasks.map(task => {
            const agent = agents.find(a => a.id === task.agentId);
            return (
              <TaskCard
                key={task.id}
                task={task}
                agent={agent}
                onSelect={handleTaskSelect}
              />
            );
          })}
        </div>
        
        {filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-500">Aucune tâche trouvée</p>
            <button
              onClick={() => setShowCreateTask(true)}
              className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Créer une tâche
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Orchestration"
  const renderOrchestration = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <h2 className="text-xl font-semibold text-slate-800 mb-6">Orchestration des agents</h2>
        
        {/* Diagramme d'orchestration */}
        <div className="bg-surface-soft rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <LayoutDashboard className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">Flux de travail</span>
          </div>
          
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="relative">
              {/* Agents disponibles */}
              <div className="flex gap-4 mb-6">
                {agents.filter(a => a.status === "idle").map(agent => (
                  <div key={agent.id} className="text-center">
                    <div className="w-16 h-16 bg-green-500/10 border border-green-200 rounded-xl flex items-center justify-center mb-2">
                      <Robot className="w-8 h-8 text-green-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-700">{agent.name}</span>
                    <span className="text-xs text-green-600">Disponible</span>
                  </div>
                ))}
              </div>
              
              {/* Tâches en cours */}
              <div className="flex gap-4 mb-6">
                {tasks.filter(t => t.status === "in_progress").map(task => {
                  const agent = agents.find(a => a.id === task.agentId);
                  return (
                    <div key={task.id} className="text-center">
                      <div className="w-16 h-16 bg-blue-500/10 border border-blue-200 rounded-xl flex items-center justify-center mb-2">
                        <Activity className="w-8 h-8 text-blue-600" />
                      </div>
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[60px]">{task.title}</span>
                      {agent && <span className="text-xs text-blue-600">{agent.name}</span>}
                    </div>
                  );
                })}
              </div>
              
              {/* Tâches terminées */}
              <div className="flex gap-4">
                {tasks.filter(t => t.status === "completed").slice(0, 3).map(task => {
                  const agent = agents.find(a => a.id === task.agentId);
                  return (
                    <div key={task.id} className="text-center">
                      <div className="w-16 h-16 bg-green-500/10 border border-green-200 rounded-xl flex items-center justify-center mb-2">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                      </div>
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[60px]">{task.title}</span>
                      {agent && <span className="text-xs text-green-600">{agent.name}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        {/* Statistiques d'orchestration */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface-soft rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{taskStats.in_progress}</div>
            <div className="text-sm text-slate-500">Tâches en cours</div>
          </div>
          <div className="bg-surface-soft rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{taskStats.completed}</div>
            <div className="text-sm text-slate-500">Tâches terminées</div>
          </div>
          <div className="bg-surface-soft rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-slate-600">{stats.idle}</div>
            <div className="text-sm text-slate-500">Agents disponibles</div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Communication"
  const renderCommunication = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <h2 className="text-xl font-semibold text-slate-800 mb-6">Communication inter-agents</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Messages récents */}
          <div className="bg-surface-soft rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-slate-500" />
              <span className="font-semibold text-slate-800">Messages récents</span>
            </div>
            <div className="space-y-3">
              {[
                { id: "1", from: "Developer Agent", to: "Data Analyst Agent", message: "Analyse des données terminée", timestamp: new Date().toISOString() },
                { id: "2", from: "System Monitor Agent", to: "Developer Agent", message: "Alerte CPU élevée détectée", timestamp: new Date(Date.now() - 3600000).toISOString() },
                { id: "3", from: "Content Writer Agent", to: "Developer Agent", message: "Documentation mise à jour", timestamp: new Date(Date.now() - 7200000).toISOString() },
              ].map(msg => (
                <div key={msg.id} className="p-3 rounded-lg bg-slate-50/50">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{msg.from} → {msg.to}</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm text-slate-700">{msg.message}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Statistiques de communication */}
          <div className="bg-surface-soft rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-slate-500" />
              <span className="font-semibold text-slate-800">Statistiques</span>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Messages envoyés</span>
                  <span className="text-slate-700">245</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-400"
                    initial={{ width: 0 }}
                    animate={{ width: "80%" }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Messages reçus</span>
                  <span className="text-slate-700">312</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-green-400"
                    initial={{ width: 0 }}
                    animate={{ width: "60%" }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
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
          <span className="font-semibold text-slate-800">Paramètres de l'orchestration</span>
        </div>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Load Balancing</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Stratégie</label>
                <select className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm">
                  <option>Round Robin</option>
                  <option>Priorité</option>
                  <option>Charge</option>
                  <option>Aléatoire</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max tâches par agent</label>
                <input
                  type="number"
                  defaultValue={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Timeouts</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Timeout tâche (s)</label>
                <input
                  type="number"
                  defaultValue={60}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Timeout réponse (s)</label>
                <input
                  type="number"
                  defaultValue={30}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Retries</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max tentatives</label>
                <input
                  type="number"
                  defaultValue={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Délai entre tentatives (ms)</label>
                <input
                  type="number"
                  defaultValue={1000}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 border-t border-slate-200/50 pt-4">
          <button className="w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg transition-colors text-sm">
            Sauvegarder les paramètres
          </button>
        </div>
      </div>
    </motion.div>
  );

  // Rendu des modals
  const renderCreateAgentModal = () => (
    <AnimatePresence>
      {showCreateAgent && (
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
              <h2 className="text-xl font-bold text-slate-800">Nouvel agent</h2>
              <button
                onClick={() => setShowCreateAgent(false)}
                className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleCreateAgent({
                name: formData.get('name') as string,
                type: formData.get('type') as string,
                description: formData.get('description') as string,
                capabilities: formData.get('capabilities')?.toString().split(',') || [],
              });
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nom
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Nom de l'agent"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Type
                </label>
                <select
                  name="type"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Sélectionner un type</option>
                  <option value="code">Développement</option>
                  <option value="data">Analyse de données</option>
                  <option value="content">Création de contenu</option>
                  <option value="monitoring">Surveillance</option>
                  <option value="general">Général</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Description de l'agent"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Compétences
                </label>
                <input
                  type="text"
                  name="capabilities"
                  placeholder="Séparer par des virgules"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateAgent(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100/50 rounded-lg text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Créer l'agent
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderCreateTaskModal = () => (
    <AnimatePresence>
      {showCreateTask && (
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
              <h2 className="text-xl font-bold text-slate-800">Nouvelle tâche</h2>
              <button
                onClick={() => setShowCreateTask(false)}
                className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleCreateTask({
                title: formData.get('title') as string,
                priority: formData.get('priority') as "low" | "medium" | "high" | "critical",
                agentId: formData.get('agentId') as string,
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
                  placeholder="Nom de la tâche"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Priorité
                </label>
                <select
                  name="priority"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="low">Faible</option>
                  <option value="medium" selected>Moyenne</option>
                  <option value="high">Haute</option>
                  <option value="critical">Critique</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Agent
                </label>
                <select
                  name="agentId"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Sélectionner un agent</option>
                  {agents.filter(a => a.status === "idle").map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name} ({agent.type})</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTask(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100/50 rounded-lg text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Créer la tâche
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
    { id: "agents", label: "Agents", icon: <Users className="w-4 h-4" /> },
    { id: "tasks", label: "Tâches", icon: <Activity className="w-4 h-4" /> },
    { id: "orchestration", label: "Orchestration", icon: <Network className="w-4 h-4" /> },
    { id: "communication", label: "Communication", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "settings", label: "Paramètres", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-soft">
      {/* En-tête */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <Robot className="w-6 h-6 text-blue-600" />
          <span className="text-xl font-bold text-slate-800">Tableau de bord des agents</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateAgent(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau agent
          </button>
          <button
            onClick={() => setShowCreateTask(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle tâche
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
            {activeTab === "agents" && renderAgents()}
            {activeTab === "tasks" && renderTasks()}
            {activeTab === "orchestration" && renderOrchestration()}
            {activeTab === "communication" && renderCommunication()}
            {activeTab === "settings" && renderSettings()}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Modals */}
      {renderCreateAgentModal()}
      {renderCreateTaskModal()}
    </div>
  );
}

export default AgentDashboardView;

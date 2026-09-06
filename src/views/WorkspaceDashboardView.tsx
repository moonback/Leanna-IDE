/**
 * WorkspaceDashboardView — Tableau de bord de gestion du workspace
 * 
 * Ce composant fournit une vue centralisée pour surveiller et gérer :
 * - Le contexte global du workspace
 * - Les projets actifs
 * - L'état des fichiers
 * - Les ressources disponibles
 * - Les paramètres du workspace
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, Folder, FileText, Clock, Users, Settings, Plus,
  Search, Filter, MoreVertical, RefreshCw, Trash2, Edit2, Eye,
  GitBranch, History, Link2, Unlink, BarChart3, Package, Database,
  Terminal, Network, ChevronRight, ChevronLeft, AlertCircle
} from "lucide-react";

// Types pour le workspace
interface WorkspaceProject {
  id: string;
  name: string;
  path: string;
  description?: string;
  status: "active" | "inactive" | "archived";
  type: "node" | "python" | "fullstack" | "data" | "other";
  lastModified: string;
  fileCount: number;
  collaborators?: string[];
  dependencies?: string[];
}

interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  extension?: string;
  size?: number;
  modifiedAt: string;
  status: "unmodified" | "modified" | "added" | "deleted" | "conflict";
}

interface WorkspaceResource {
  id: string;
  name: string;
  type: "agent" | "tool" | "model" | "database" | "api";
  status: "connected" | "disconnected" | "error";
  lastUsed?: string;
  usageCount: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}

interface ProjectCardProps {
  project: WorkspaceProject;
  onSelect: (project: WorkspaceProject) => void;
  onAction: (project: WorkspaceProject, action: string) => void;
}

interface FileTreeProps {
  files: WorkspaceFile[];
  onFileSelect: (file: WorkspaceFile) => void;
  selectedFileId?: string;
  maxDepth?: number;
}

// Couleurs par statut
const statusColors = {
  active: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  inactive: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-400" },
  archived: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
};

const fileStatusColors = {
  unmodified: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
  modified: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  added: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  deleted: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  conflict: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
};

const resourceStatusColors = {
  connected: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  disconnected: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-400" },
  error: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
};

// Composant StatCard
function StatCard({ title, value, subtitle, icon, color = "bg-blue-500/10" }: StatCardProps) {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
            {React.cloneElement(icon as React.ReactElement, {
              className: "w-5 h-5",
              style: { color: icon.props?.style?.color || "currentColor" }
            })}
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">{value}</div>
            <div className="text-sm text-slate-500">{subtitle || title}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Composant ProjectCard
function ProjectCard({ project, onSelect, onAction }: ProjectCardProps) {
  const colors = statusColors[project.status] || statusColors.active;
  
  const getProjectIcon = (type: string) => {
    switch (type) {
      case "node":
        return <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 rounded-lg font-medium">Node.js</span>;
      case "python":
        return <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-lg font-medium">Python</span>;
      case "fullstack":
        return <span className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-600 rounded-lg font-medium">Fullstack</span>;
      case "data":
        return <span className="text-xs px-2 py-0.5 bg-orange-500/10 text-orange-600 rounded-lg font-medium">Data</span>;
      default:
        return <span className="text-xs px-2 py-0.5 bg-slate-500/10 text-slate-600 rounded-lg font-medium">Projet</span>;
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onSelect(project)}
      className={`
        bg-surface rounded-xl border border-border shadow-sm cursor-pointer
        transition-all duration-200
      `}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-3 h-3 rounded-full shrink-0 mt-1.5 bg-blue-500" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800 truncate">{project.name}</h3>
              <p className="text-sm text-slate-500 line-clamp-1">{project.description || project.path}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className={`
              px-2 py-0.5 rounded-full text-xs font-medium
              ${colors.bg} ${colors.text}
            `}>
              {project.status.replace("_", " ")}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
          <div className="flex items-center gap-3">
            {getProjectIcon(project.type)}
            <span>{project.fileCount} fichiers</span>
          </div>
          <span>
            {new Date(project.lastModified).toLocaleDateString()}
          </span>
        </div>
        
        {project.collaborators && project.collaborators.length > 0 && (
          <div className="flex -space-x-1">
            {project.collaborators.slice(0, 3).map((collab, index) => (
              <div
                key={collab}
                className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white overflow-hidden"
                title={collab}
                style={{ zIndex: 2 - index }}
              >
                <span className="text-xs font-medium text-slate-600">
                  {collab.charAt(0).toUpperCase()}
                </span>
              </div>
            ))}
            {project.collaborators.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center">
                <span className="text-xs font-medium text-slate-500">+{project.collaborators.length - 3}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Composant FileTree
function FileTree({ files, onFileSelect, selectedFileId, maxDepth = 3 }: FileTreeProps) {
  const buildTree = useCallback((files: WorkspaceFile[]): any[] => {
    const rootFiles = files.filter(f => f.path === "/" || !f.path.includes("/"));
    return rootFiles.map(root => buildNode(root, files, 0, maxDepth));
  }, [maxDepth]);

  const buildNode = (
    file: WorkspaceFile,
    allFiles: WorkspaceFile[],
    currentDepth: number,
    maxDepth: number
  ): any => {
    if (currentDepth >= maxDepth) {
      return { ...file, children: [] };
    }
    
    const children = allFiles.filter(f => 
      f.path.startsWith(file.path + "/") && 
      !f.path.slice(file.path.length + 1).includes("/")
    );
    
    return {
      ...file,
      children: children.map(child => buildNode(child, allFiles, currentDepth + 1, maxDepth))
    };
  };

  const tree = useMemo(() => buildTree(files), [files, buildTree]);

  return (
    <div className="space-y-1">
      {tree.map((node, index) => (
        <FileTreeNode
          key={node.id}
          node={node}
          level={0}
          onSelect={onFileSelect}
          selectedId={selectedFileId}
          hasNext={index < tree.length - 1}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  node,
  level,
  onSelect,
  selectedId,
  hasNext,
}: {
  node: any;
  level: number;
  onSelect: (file: WorkspaceFile) => void;
  selectedId?: string;
  hasNext: boolean;
}) {
  const colors = fileStatusColors[node.status] || fileStatusColors.unmodified;
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isDirectory = node.type === "directory";

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
        
        {/* Icône de fichier */}
        <div className="flex items-center justify-center w-6 h-6">
          {node.type === "directory" ? (
            <Folder className="w-4 h-4 text-amber-600" />
          ) : node.type === "symlink" ? (
            <Link2 className="w-4 h-4 text-blue-600" />
          ) : (
            <FileText className="w-4 h-4 text-slate-600" />
          )}
        </div>
        
        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`
              font-medium text-sm
              ${isSelected ? 'text-blue-600' : 'text-slate-700'}
            `}>
              {node.name}
            </span>
            {node.extension && (
              <span className="text-xs text-slate-400">{node.extension}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 line-clamp-1">{node.path}</p>
        </div>
        
        {/* Indicateur de statut */}
        {node.status !== "unmodified" && (
          <div className={`
            w-2 h-2 rounded-full
            ${colors.bg}
          `} />
        )}
        
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
            <FileTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onFileSelect}
              selectedId={selectedId}
              hasNext={childIndex < node.children.length - 1}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

// Hook pour gérer le workspace
function useWorkspace() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [resources, setResources] = useState<WorkspaceResource[]>([]);

  const [selectedProject, setSelectedProject] = useState<WorkspaceProject | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [loading, setLoading] = useState(true);

  // Stats
  const stats = useMemo(() => {
    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === "active").length,
      totalFiles: files.length,
      modifiedFiles: files.filter(f => f.status !== "unmodified").length,
      connectedResources: resources.filter(r => r.status === "connected").length,
    };
  }, [projects, files, resources]);

  // Actions
  const createProject = useCallback(async (project: Partial<WorkspaceProject>) => {
    const newProject: WorkspaceProject = {
      id: Date.now().toString(),
      name: project.name || "Nouveau projet",
      path: project.path || `/home/user/${project.name}`,
      description: project.description,
      status: "active",
      type: project.type || "other",
      lastModified: new Date().toISOString(),
      fileCount: 0,
      collaborators: project.collaborators,
    };
    
    setProjects(prev => [newProject, ...prev]);
    return newProject;
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, []);

  const createFile = useCallback(async (file: Partial<WorkspaceFile>) => {
    const newFile: WorkspaceFile = {
      id: Date.now().toString(),
      name: file.name || "Nouveau fichier",
      path: file.path || "/",
      type: file.type || "file",
      extension: file.extension,
      size: file.size,
      modifiedAt: new Date().toISOString(),
      status: "added",
    };
    
    setFiles(prev => [newFile, ...prev]);
    return newFile;
  }, []);

  const deleteFile = useCallback(async (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  return {
    projects,
    files,
    resources,
    selectedProject,
    selectedFile,
    loading,
    stats,
    setSelectedProject,
    setSelectedFile,
    createProject,
    deleteProject,
    createFile,
    deleteFile,
  };
}

// Type pour l'onglet actif
type DashboardTab = "overview" | "projects" | "files" | "resources" | "settings";

// Props du composant
export interface WorkspaceDashboardViewProps {
  initialTab?: DashboardTab;
}

/**
 * Composant WorkspaceDashboardView
 */
export function WorkspaceDashboardView({ initialTab = "overview" }: WorkspaceDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const {
    projects,
    files,
    resources,
    selectedProject,
    selectedFile,
    stats,
    setSelectedProject,
    setSelectedFile,
    createProject,
    deleteProject,
  } = useWorkspace();

  // Filtrage
  const filteredProjects = useMemo(() => {
    return projects.filter(project => 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.path.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [projects, searchQuery]);

  const filteredFiles = useMemo(() => {
    return files.filter(file => 
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.path.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [files, searchQuery]);

  // Gestion des actions
  const handleCreateProject = async (projectData: Partial<WorkspaceProject>) => {
    await createProject(projectData);
    setShowCreateProject(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    if (selectedProject?.id === projectId) {
      setSelectedProject(null);
    }
  };

  const handleProjectSelect = (project: WorkspaceProject) => {
    setSelectedProject(project);
  };

  const handleFileSelect = (file: WorkspaceFile) => {
    setSelectedFile(file);
  };

  // Rendu de l'onglet "Vue d'ensemble"
  const renderOverview = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 p-4"
    >
      {/* Statistiques principales */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard
          title="Projets"
          value={stats.totalProjects}
          subtitle="Total"
          icon={<LayoutDashboard className="w-5 h-5 text-blue-600" />}
          color="bg-blue-500/10"
        />
        <StatCard
          title="Projets actifs"
          value={stats.activeProjects}
          subtitle="En cours"
          icon={<Folder className="w-5 h-5 text-green-600" />}
          color="bg-green-500/10"
        />
        <StatCard
          title="Fichiers"
          value={stats.totalFiles}
          subtitle="Total"
          icon={<FileText className="w-5 h-5 text-purple-600" />}
          color="bg-purple-500/10"
        />
        <StatCard
          title="Modifiés"
          value={stats.modifiedFiles}
          subtitle="À valider"
          icon={<AlertCircle className="w-5 h-5 text-yellow-600" />}
          color="bg-yellow-500/10"
        />
        <StatCard
          title="Ressources"
          value={stats.connectedResources}
          subtitle="Connectées"
          icon={<Network className="w-5 h-5 text-orange-600" />}
          color="bg-orange-500/10"
        />
      </div>
      
      {/* Projets récents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">Projets récents</span>
          </div>
          <div className="space-y-3">
            {projects.slice(0, 5).map(project => (
              <div
                key={project.id}
                onClick={() => handleProjectSelect(project)}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-3 h-3 rounded-full
                    ${statusColors[project.status]?.dot}
                  `} />
                  <span className="text-sm text-slate-700">{project.name}</span>
                </div>
                <span className="text-xs text-slate-500">{project.fileCount} fichiers</span>
              </div>
            ))}
          </div>
          {projects.length > 5 && (
            <button
              onClick={() => setActiveTab("projects")}
              className="mt-4 w-full py-2 text-sm text-blue-600 hover:text-blue-700"
            >
              Voir tous les projets
            </button>
          )}
        </div>
        
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800">Activité récente</span>
          </div>
          <div className="space-y-3">
            {[
              { type: "project", name: "Jarvis OS", action: "modifié", time: new Date().toISOString() },
              { type: "file", name: "App.tsx", action: "ajouté", time: new Date(Date.now() - 3600000).toISOString() },
              { type: "resource", name: "OpenAI", action: "connecté", time: new Date(Date.now() - 7200000).toISOString() },
              { type: "project", name: "Data Pipeline", action: "mis à jour", time: new Date(Date.now() - 86400000).toISOString() },
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm text-slate-700">{activity.name} {activity.action}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(activity.time).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Vue d'ensemble des ressources */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-800">Ressources connectées</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {resources.map(resource => {
            const colors = resourceStatusColors[resource.status] || resourceStatusColors.connected;
            return (
              <div key={resource.id} className="text-center">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                  {resource.type === "model" && <FileText className="w-6 h-6 text-blue-600" />}
                  {resource.type === "database" && <Database className="w-6 h-6 text-orange-600" />}
                  {resource.type === "api" && <Network className="w-6 h-6 text-green-600" />}
                  {resource.type === "agent" && <Users className="w-6 h-6 text-purple-600" />}
                </div>
                <div className="text-xs font-medium text-slate-700 truncate max-w-[80px]">{resource.name}</div>
                <div className={`
                  text-xs ${colors.text} truncate max-w-[80px]
                `}>
                  {resource.status.replace("_", " ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Projets"
  const renderProjects = () => (
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
              placeholder="Rechercher un projet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={() => setShowCreateProject(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau
          </button>
        </div>
        
        {/* Filtres */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button className="px-3 py-1 bg-blue-500/10 text-blue-600 rounded-full">Tout ({projects.length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Actif ({projects.filter(p => p.status === "active").length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Inactif ({projects.filter(p => p.status === "inactive").length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Archivé ({projects.filter(p => p.status === "archived").length})</button>
        </div>
        
        {/* Liste des projets */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={handleProjectSelect}
              onAction={(project, action) => {
                if (action === "delete") {
                  handleDeleteProject(project.id);
                }
              }}
            />
          ))}
        </div>
        
        {filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Folder className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-500">Aucun projet trouvé</p>
            <button
              onClick={() => setShowCreateProject(true)}
              className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Créer un projet
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Fichiers"
  const renderFiles = () => (
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
              placeholder="Rechercher un fichier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        
        {/* Filtres */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button className="px-3 py-1 bg-blue-500/10 text-blue-600 rounded-full">Tout ({files.length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Modifiés ({files.filter(f => f.status !== "unmodified").length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Ajoutés ({files.filter(f => f.status === "added").length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Supprimés ({files.filter(f => f.status === "deleted").length})</button>
          <button className="px-3 py-1 text-slate-500 hover:bg-slate-100/50 rounded-full">Conflits ({files.filter(f => f.status === "conflict").length})</button>
        </div>
        
        {/* Arbre des fichiers */}
        <FileTree
          files={filteredFiles}
          onFileSelect={handleFileSelect}
          selectedFileId={selectedFile?.id}
        />
        
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-500">Aucun fichier trouvé</p>
          </div>
        )}
      </div>
    </motion.div>
  );

  // Rendu de l'onglet "Ressources"
  const renderResources = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <h2 className="text-xl font-semibold text-slate-800 mb-6">Ressources du workspace</h2>
        
        {/* Statistiques des ressources */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-surface-soft rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{resources.length}</div>
            <div className="text-xs text-slate-500">Ressources totales</div>
          </div>
          <div className="bg-surface-soft rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {resources.filter(r => r.status === "connected").length}
            </div>
            <div className="text-xs text-slate-500">Connectées</div>
          </div>
          <div className="bg-surface-soft rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {resources.filter(r => r.status === "error").length}
            </div>
            <div className="text-xs text-slate-500">En erreur</div>
          </div>
        </div>
        
        {/* Liste des ressources */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {resources.map(resource => {
            const colors = resourceStatusColors[resource.status] || resourceStatusColors.connected;
            
            return (
              <div key={resource.id} className="bg-surface-soft rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-3 h-3 rounded-full animate-pulse
                      ${colors.dot}
                    `} />
                    <div>
                      <h3 className="font-semibold text-slate-800">{resource.name}</h3>
                      <p className="text-sm text-slate-500">{resource.type.replace("_", " ")}</p>
                    </div>
                  </div>
                  <span className={`
                    px-2 py-0.5 rounded-full text-xs font-medium
                    ${colors.bg} ${colors.text}
                  `}>
                    {resource.status.replace("_", " ")}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500">Utilisations</div>
                    <div className="text-slate-700 font-medium">{resource.usageCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Dernière utilisation</div>
                    <div className="text-slate-700">
                      {resource.lastUsed 
                        ? new Date(resource.lastUsed).toLocaleDateString()
                        : "Jamais"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
          <span className="font-semibold text-slate-800">Paramètres du workspace</span>
        </div>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Répertoire par défaut</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Chemin</label>
                <input
                  type="text"
                  defaultValue="/home/user/jarvis-os"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Nom</label>
                <input
                  type="text"
                  defaultValue="Jarvis OS"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Options de synchronisation</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Intervalle (minutes)</label>
                <input
                  type="number"
                  defaultValue={5}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Auto-save</label>
                <select className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm">
                  <option>Activé</option>
                  <option>Désactivé</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Gestion des conflits</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Stratégie</label>
                <select className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm">
                  <option>Demander confirmation</option>
                  <option>Conserver les deux</option>
                  <option>Ignorer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Backup automatique</label>
                <select className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm">
                  <option>Oui</option>
                  <option>Non</option>
                </select>
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

  // Rendu du modal de création de projet
  const renderCreateProjectModal = () => (
    <AnimatePresence>
      {showCreateProject && (
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
            className="w-full max-w-lg bg-surface rounded-2xl border border-border shadow-2xl p-6 m-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Nouveau projet</h2>
              <button
                onClick={() => setShowCreateProject(false)}
                className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleCreateProject({
                name: formData.get('name') as string,
                path: formData.get('path') as string,
                description: formData.get('description') as string,
                type: formData.get('type') as WorkspaceProject["type"],
                collaborators: formData.get('collaborators')?.toString().split(',') || [],
              });
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nom
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Nom du projet"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Chemin
                  </label>
                  <input
                    type="text"
                    name="path"
                    required
                    placeholder="/chemin/vers/le/projet"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Description du projet"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
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
                    <option value="node">Node.js</option>
                    <option value="python">Python</option>
                    <option value="fullstack">Fullstack</option>
                    <option value="data">Data/Analyse</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Collaborateurs
                  </label>
                  <input
                    type="text"
                    name="collaborators"
                    placeholder="Séparer par des virgules"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateProject(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100/50 rounded-lg text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Créer le projet
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
    { id: "projects", label: "Projets", icon: <Folder className="w-4 h-4" /> },
    { id: "files", label: "Fichiers", icon: <FileText className="w-4 h-4" /> },
    { id: "resources", label: "Ressources", icon: <Network className="w-4 h-4" /> },
    { id: "settings", label: "Paramètres", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-soft">
      {/* En-tête */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <Folder className="w-6 h-6 text-blue-600" />
          <span className="text-xl font-bold text-slate-800">Tableau de bord du workspace</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateProject(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau projet
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
            {activeTab === "projects" && renderProjects()}
            {activeTab === "files" && renderFiles()}
            {activeTab === "resources" && renderResources()}
            {activeTab === "settings" && renderSettings()}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Modals */}
      {renderCreateProjectModal()}
    </div>
  );
}

export default WorkspaceDashboardView;

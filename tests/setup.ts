/**
 * Configuration de setup pour Vitest
 * 
 * Ce fichier est exécuté avant chaque test et configure :
 * - L'environnement de test (mock de console.error pour éviter les erreurs Motion)
 * - Les mocks globaux pour les dépendances externes
 * - Les configurations nécessaires pour @testing-library/react
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import * as React from 'react';

// Nettoyer après chaque test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock des erreurs pour éviter les logs console non désirés
const originalError = console.error;
const originalWarn = console.warn;

// Supprimer les warnings et erreurs pendant les tests
// (surtout pour les composants de dev comme Motion qui log des warnings)
beforeAll(() => {
  console.error = vi.fn((...args) => {
    const errorMessage = args.join(' ');
    // Ignorer les warnings de Motion et autres libs de dev
    if (!errorMessage.includes('Motion') && 
        !errorMessage.includes('Warning') &&
        !errorMessage.includes('deprecated')) {
      originalError(...args);
    }
  });

  console.warn = vi.fn((...args) => {
    const warnMessage = args.join(' ');
    // Ignorer les warnings de dev
    if (!warnMessage.includes('Warning') &&
        !warnMessage.includes('deprecated') &&
        !warnMessage.includes('Missing') &&
        !warnMessage.includes('Invalid') &&
        !warnMessage.includes('prop type')) {
      originalWarn(...args);
    }
  });
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Mock global pour React Router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// Mock global pour les hooks personnalisés qui peuvent ne pas être disponibles
vi.mock('../src/hooks', () => ({
  useEventBus: () => ({
    getMetrics: () => ({ total: 0, uptime: 0, averagePerMinute: 0 }),
    historySize: 0,
    subscriberCount: 0,
  }),
  useArtifactManager: () => ({
    getStats: () => ({ totalArtifacts: 0, totalVersions: 0, totalReferences: 0, totalSize: 0 }),
  }),
  useVerificationManager: () => ({
    getStats: () => ({ total: 0, passed: 0, failed: 0 }),
  }),
  useMissionManager: () => ({
    missions: [],
    createMission: vi.fn(),
    deleteMission: vi.fn(),
  }),
  useAgentManager: () => ({
    agents: [],
    tasks: [],
    selectedAgent: null,
    selectedTask: null,
    loading: false,
    stats: { total: 0, idle: 0, busy: 0, offline: 0, error: 0 },
    taskStats: { total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0 },
    setSelectedAgent: vi.fn(),
    setSelectedTask: vi.fn(),
    createAgent: vi.fn(),
    deleteAgent: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    assignTask: vi.fn(),
  }),
  useWorkspace: () => ({
    projects: [],
    files: [],
    resources: [],
    selectedProject: null,
    selectedFile: null,
    stats: {
      totalProjects: 0,
      activeProjects: 0,
      archivedProjects: 0,
      totalFiles: 0,
      modifiedFiles: 0,
      addedFiles: 0,
      deletedFiles: 0,
      totalSize: 0,
    },
    setSelectedProject: vi.fn(),
    setSelectedFile: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}));

// Mock global pour Motion (pour éviter les erreurs SSR)
vi.mock('motion/react', () => {
  // Filtrer les props spécifiques à Motion qui ne sont pas reconnues par React
  const filterMotionProps = (props: any) => {
    const { whileHover, whileTap, initial, animate, exit, transition, layout, ...rest } = props;
    return rest;
  };
  
  return {
    motion: {
      div: ({ children, ...props }: any) => React.createElement('div', filterMotionProps(props), children),
      button: ({ children, ...props }: any) => React.createElement('button', filterMotionProps(props), children),
      span: ({ children, ...props }: any) => React.createElement('span', filterMotionProps(props), children),
      input: (props: any) => React.createElement('input', filterMotionProps(props)),
      textarea: (props: any) => React.createElement('textarea', filterMotionProps(props)),
    },
    AnimatePresence: ({ children }: any) => children,
    useAnimation: () => ({}),
    useMotionValue: () => ({}),
    useScroll: () => ({}),
    useTransform: () => ({}),
  };
});

// Mock global pour les icônes Lucide (pour éviter les erreurs d'import)
vi.mock('lucide-react', () => {
  const MockIcon = ({ className }: { className?: string }) => React.createElement('span', { className }, 'Icon');
  
  return {
    // Icônes courantes utilisées dans les dashboards
    LayoutDashboard: MockIcon,
    Target: MockIcon,
    Play: MockIcon,
    Pause: MockIcon,
    Stop: MockIcon,
    CheckCircle: MockIcon,
    XCircle: MockIcon,
    X: MockIcon,
    AlertCircle: MockIcon,
    Clock: MockIcon,
    ListOrdered: MockIcon,
    BarChart3: MockIcon,
    Settings: MockIcon,
    Plus: MockIcon,
    Search: MockIcon,
    Filter: MockIcon,
    MoreVertical: MockIcon,
    RefreshCw: MockIcon,
    Trash2: MockIcon,
    Edit2: MockIcon,
    Eye: MockIcon,
    Rocket: MockIcon,
    Users: MockIcon,
    Bot: MockIcon,
    Activity: MockIcon,
    MessageSquare: MockIcon,
    Network: MockIcon,
    Robot: MockIcon,
    Folder: MockIcon,
    FileText: MockIcon,
    GitBranch: MockIcon,
    History: MockIcon,
    Link2: MockIcon,
    Unlink: MockIcon,
    Package: MockIcon,
    Database: MockIcon,
    Terminal: MockIcon,
    ChevronRight: MockIcon,
    ChevronLeft: MockIcon,
    Minimize2: MockIcon,
    Maximize2: MockIcon,
    Shield: MockIcon,
    Wand2: MockIcon,
    BookOpen: MockIcon,
    Globe: MockIcon,
    Container: MockIcon,
    Github: MockIcon,
    Workflow: MockIcon,
    Camera: MockIcon,
    Monitor: MockIcon,
    Wrench: MockIcon,
    Store: MockIcon,
    Briefcase: MockIcon,
    Cpu: MockIcon,
    UserCog: MockIcon,
  };
});

// Suppression des doublons : Package, Terminal, GitBranch

// Mock pour Monaco Editor (s'il est utilisé dans les composants)
vi.mock('@monaco-editor/react', () => ({
  default: ({ children }: any) => React.createElement('div', { 'data-testid': 'monaco-editor' }, children),
  Editor: ({ children }: any) => React.createElement('div', { 'data-testid': 'monaco-editor' }, children),
  useMonaco: () => ({}),
  loader: {
    config: () => ({}),
    init: () => Promise.resolve({}),
  },
}));

// Mock pour Recharts (si utilisé)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => React.createElement('div', { 'data-testid': 'recharts-container' }, children),
  LineChart: ({ children }: any) => React.createElement('div', { 'data-testid': 'line-chart' }, children),
  BarChart: ({ children }: any) => React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  PieChart: ({ children }: any) => React.createElement('div', { 'data-testid': 'pie-chart' }, children),
  Line: ({ children }: any) => React.createElement('path', { 'data-testid': 'line' }, children),
  Bar: ({ children }: any) => React.createElement('rect', { 'data-testid': 'bar' }, children),
  Cell: ({ children }: any) => React.createElement('g', { 'data-testid': 'cell' }, children),
  XAxis: ({ children }: any) => React.createElement('g', { 'data-testid': 'x-axis' }, children),
  YAxis: ({ children }: any) => React.createElement('g', { 'data-testid': 'y-axis' }, children),
  CartesianGrid: ({ children }: any) => React.createElement('g', { 'data-testid': 'grid' }, children),
  Tooltip: ({ children }: any) => React.createElement('div', { 'data-testid': 'tooltip' }, children),
  Legend: ({ children }: any) => React.createElement('div', { 'data-testid': 'legend' }, children),
}));

// Mock pour Redux ou Context si nécessaire
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useId: () => 'test-id',
  };
});

// Export pour utilisation dans les tests
export { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
export { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
export { MemoryRouter, Routes, Route } from 'react-router-dom';

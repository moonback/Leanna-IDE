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
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    input: ({ ...props }: any) => <input {...props} />,
    textarea: ({ ...props }: any) => <textarea {...props} />,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useAnimation: () => ({}),
  useMotionValue: () => ({}),
  useScroll: () => ({}),
  useTransform: () => ({}),
}));

// Mock global pour les icônes Lucide (pour éviter les erreurs d'import)
vi.mock('lucide-react', () => {
  const MockIcon = ({ className }: { className?: string }) => <span className={className}>Icon</span>;
  
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
    Package: MockIcon,
    Wand2: MockIcon,
    BookOpen: MockIcon,
    Globe: MockIcon,
    Terminal: MockIcon,
    Container: MockIcon,
    Github: MockIcon,
    GitBranch: MockIcon,
    Workflow: MockIcon,
    Camera: MockIcon,
    Monitor: MockIcon,
    Wrench: MockIcon,
    Store: MockIcon,
    Briefcase: MockIcon,
    Cpu: MockIcon,
    UserCog: MockIcon,
    // Types
    type LucideIcon: React.ComponentType<{ className?: string }>,
  };
});

// Mock pour Monaco Editor (s'il est utilisé dans les composants)
vi.mock('@monaco-editor/react', () => ({
  default: ({ children }: any) => <div data-testid="monaco-editor">{children}</div>,
  Editor: ({ children }: any) => <div data-testid="monaco-editor">{children}</div>,
  useMonaco: () => ({}),
  loader: {
    config: () => ({}),
    init: () => Promise.resolve({}),
  },
}));

// Mock pour Recharts (si utilisé)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="recharts-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Line: ({ children }: any) => <path data-testid="line">{children}</path>,
  Bar: ({ children }: any) => <rect data-testid="bar">{children}</rect>,
  Cell: ({ children }: any) => <g data-testid="cell">{children}</g>,
  XAxis: ({ children }: any) => <g data-testid="x-axis">{children}</g>,
  YAxis: ({ children }: any) => <g data-testid="y-axis">{children}</g>,
  CartesianGrid: ({ children }: any) => <g data-testid="grid">{children}</g>,
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  Legend: ({ children }: any) => <div data-testid="legend">{children}</div>,
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

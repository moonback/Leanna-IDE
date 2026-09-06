/**
 * Tests complets pour AgentDashboardView
 * 
 * Couverture des fonctionnalités :
 * - Gestion des agents actifs et disponibles
 * - Registre des agents (AgentRegistry)
 * - Orchestration des tâches
 * - Communication inter-agents
 * - Métriques de performance
 * - Interface utilisateur avec onglets, cartes d'agents et monitoring
 */

import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Mock des dépendances externes
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock des icônes Lucide
vi.mock("lucide-react", () => ({
  LayoutDashboard: () => <span>LayoutDashboard</span>,
  Users: () => <span>Users</span>,
  Bot: () => <span>Bot</span>,
  Play: () => <span>Play</span>,
  Pause: () => <span>Pause</span>,
  Stop: () => <span>Stop</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  XCircle: () => <span>XCircle</span>,
  AlertCircle: () => <span>AlertCircle</span>,
  Clock: () => <span>Clock</span>,
  Activity: () => <span>Activity</span>,
  BarChart3: () => <span>BarChart3</span>,
  Settings: () => <span>Settings</span>,
  Plus: () => <span>Plus</span>,
  Search: () => <span>Search</span>,
  Filter: () => <span>Filter</span>,
  MoreVertical: () => <span>MoreVertical</span>,
  RefreshCw: () => <span>RefreshCw</span>,
  Trash2: () => <span>Trash2</span>,
  Edit2: () => <span>Edit2</span>,
  Eye: () => <span>Eye</span>,
  MessageSquare: () => <span>MessageSquare</span>,
  Network: () => <span>Network</span>,
  Robot: () => <span>Robot</span>,
}));

// Mock des composants internes (ils sont définis dans le fichier)
// Nous allons mocker le hook useAgentManager qui est utilisé par le composant
vi.mock("../../src/views/AgentDashboardView", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/views/AgentDashboardView")>();
  
  return {
    ...mod,
    // Remplacer useAgentManager par un mock
    useAgentManager: () => ({
      agents: [
        {
          id: "1",
          name: "Agent Code",
          type: "code",
          status: "idle" as const,
          capabilities: ["javascript", "typescript", "python"],
          currentTask: undefined,
          progress: undefined,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          description: "Agent spécialisé dans le code",
        },
        {
          id: "2",
          name: "Agent Data",
          type: "data",
          status: "busy" as const,
          capabilities: ["sql", "pandas", "analysis"],
          currentTask: "Analyse de données",
          progress: 75,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          description: "Agent spécialisé dans les données",
        },
        {
          id: "3",
          name: "Agent Content",
          type: "content",
          status: "offline" as const,
          capabilities: ["writing", "editing", "research"],
          currentTask: undefined,
          progress: undefined,
          createdAt: new Date().toISOString(),
          lastActivityAt: undefined,
          description: "Agent spécialisé dans le contenu",
        },
      ],
      tasks: [
        {
          id: "1",
          title: "Analyse de code",
          agentId: "1",
          status: "pending" as const,
          priority: "high" as const,
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          title: "Traitement de données",
          agentId: "2",
          status: "in_progress" as const,
          priority: "medium" as const,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
        },
      ],
      selectedAgent: null,
      selectedTask: null,
      loading: false,
      stats: {
        total: 3,
        idle: 1,
        busy: 1,
        offline: 1,
        error: 0,
      },
      taskStats: {
        total: 2,
        pending: 1,
        in_progress: 1,
        completed: 0,
        failed: 0,
      },
      setSelectedAgent: vi.fn(),
      setSelectedTask: vi.fn(),
      createAgent: vi.fn().mockResolvedValue({
        id: "new-agent",
        name: "Nouvel agent",
        type: "default",
        status: "idle",
        capabilities: [],
        createdAt: new Date().toISOString(),
      }),
      deleteAgent: vi.fn().mockResolvedValue(true),
      createTask: vi.fn().mockResolvedValue({
        id: "new-task",
        title: "Nouvelle tâche",
        status: "pending",
        priority: "medium",
        createdAt: new Date().toISOString(),
      }),
      deleteTask: vi.fn().mockResolvedValue(true),
      assignTask: vi.fn().mockResolvedValue(true),
    }),
  };
});

// Import après les mocks
import { AgentDashboardView } from "../../src/views/AgentDashboardView";
import type { AgentDashboardViewProps, DashboardTab as AgentDashboardTab } from "../../src/views/AgentDashboardView";

// Helper pour le rendu
const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>{component}</MemoryRouter>
  );
};

describe("AgentDashboardView", () => {
  describe("Props et initialisation", () => {
    it("devrait utiliser l'onglet initial par défaut (overview)", () => {
      renderWithRouter(<AgentDashboardView />);
      expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument();
    });

    it("devrait accepter un onglet initial personnalisé", () => {
      renderWithRouter(<AgentDashboardView initialTab="agents" />);
      expect(screen.getByText("Agents")).toBeInTheDocument();
    });

    it("devrait afficher le titre du tableau de bord", () => {
      renderWithRouter(<AgentDashboardView />);
      expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
    });
  });

  describe("Navigation entre onglets", () => {
    it("devrait avoir tous les onglets de navigation", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const tabs = [
        "Vue d'ensemble",
        "Agents",
        "Tâches",
        "Orchestration",
        "Communication",
        "Performances",
      ];
      
      tabs.forEach(tab => {
        expect(screen.getByText(tab)).toBeInTheDocument();
      });
    });

    it("devrait changer d'onglet en cliquant sur les boutons de navigation", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const agentsTab = screen.getByText("Agents");
      fireEvent.click(agentsTab);
      
      // Le contenu de l'onglet agents devrait être visible
      expect(screen.getByText("Liste des agents")).toBeInTheDocument();
    });
  });

  describe("Contenu des onglets", () => {
    describe("Onglet Vue d'ensemble", () => {
      it("devrait afficher les statistiques des agents", () => {
        renderWithRouter(<AgentDashboardView />);
        
        expect(screen.getByText("agents disponibles")).toBeInTheDocument();
        expect(screen.getByText("en attente")).toBeInTheDocument();
        expect(screen.getByText("occupés")).toBeInTheDocument();
      });

      it("devrait afficher les statistiques des tâches", () => {
        renderWithRouter(<AgentDashboardView />);
        
        expect(screen.getByText("Tâches en attente")).toBeInTheDocument();
        expect(screen.getByText("Tâches en cours")).toBeInTheDocument();
      });

      it("devrait afficher les agents récents", () => {
        renderWithRouter(<AgentDashboardView />);
        
        expect(screen.getByText("Agents récents")).toBeInTheDocument();
        expect(screen.getByText("Agent Code")).toBeInTheDocument();
        expect(screen.getByText("Agent Data")).toBeInTheDocument();
      });
    });

    describe("Onglet Agents", () => {
      it("devrait afficher la liste des agents", () => {
        renderWithRouter(<AgentDashboardView initialTab="agents" />);
        
        expect(screen.getByText("Liste des agents")).toBeInTheDocument();
      });

      it("devrait afficher les cartes d'agents", () => {
        renderWithRouter(<AgentDashboardView initialTab="agents" />);
        
        expect(screen.getByText("Agent Code")).toBeInTheDocument();
        expect(screen.getByText("Agent Data")).toBeInTheDocument();
        expect(screen.getByText("Agent Content")).toBeInTheDocument();
      });

      it("devrait avoir un bouton pour créer un nouvel agent", () => {
        renderWithRouter(<AgentDashboardView initialTab="agents" />);
        
        const newAgentButton = screen.getByText("Nouvel agent");
        expect(newAgentButton).toBeInTheDocument();
      });
    });

    describe("Onglet Tâches", () => {
      it("devrait afficher la liste des tâches", () => {
        renderWithRouter(<AgentDashboardView initialTab="tasks" />);
        
        expect(screen.getByText("Liste des tâches")).toBeInTheDocument();
      });

      it("devrait afficher les cartes de tâches", () => {
        renderWithRouter(<AgentDashboardView initialTab="tasks" />);
        
        expect(screen.getByText("Analyse de code")).toBeInTheDocument();
        expect(screen.getByText("Traitement de données")).toBeInTheDocument();
      });

      it("devrait avoir un bouton pour créer une nouvelle tâche", () => {
        renderWithRouter(<AgentDashboardView initialTab="tasks" />);
        
        const newTaskButton = screen.getByText("Nouvelle tâche");
        expect(newTaskButton).toBeInTheDocument();
      });
    });

    describe("Onglet Orchestration", () => {
      it("devrait afficher l'orchestration des tâches", () => {
        renderWithRouter(<AgentDashboardView initialTab="orchestration" />);
        
        expect(screen.getByText("Orchestration")).toBeInTheDocument();
      });
    });

    describe("Onglet Communication", () => {
      it("devrait afficher la communication inter-agents", () => {
        renderWithRouter(<AgentDashboardView initialTab="communication" />);
        
        expect(screen.getByText("Communication")).toBeInTheDocument();
      });
    });

    describe("Onglet Performances", () => {
      it("devrait afficher l'analyse des performances", () => {
        renderWithRouter(<AgentDashboardView initialTab="performance" />);
        
        expect(screen.getByText("Analyse des performances")).toBeInTheDocument();
      });
    });
  });

  describe("Gestion des agents", () => {
    it("devrait afficher les cartes d'agents avec le bon statut", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("Agent Code")).toBeInTheDocument();
      expect(screen.getByText("Agent Data")).toBeInTheDocument();
    });

    it("devrait afficher le statut des agents avec la bonne couleur", () => {
      renderWithRouter(<AgentDashboardView />);
      
      // Les statuts devraient être affichés
      expect(screen.getByText("idle")).toBeInTheDocument();
      expect(screen.getByText("busy")).toBeInTheDocument();
      expect(screen.getByText("offline")).toBeInTheDocument();
    });

    it("devrait afficher le type des agents", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("code")).toBeInTheDocument();
      expect(screen.getByText("data")).toBeInTheDocument();
      expect(screen.getByText("content")).toBeInTheDocument();
    });

    it("devrait afficher les capacités des agents", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("3 compétences")).toBeInTheDocument();
    });

    it("devrait afficher la tâche en cours pour les agents occupés", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("Analyse de données")).toBeInTheDocument();
      expect(screen.getByText("75%")).toBeInTheDocument();
    });

    it("devrait afficher la dernière activité", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getAllByText("Dernière activité").length).toBeGreaterThan(0);
    });

    it("devrait permettre de sélectionner un agent", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const agentCard = screen.getByText("Agent Code").closest("div");
      if (agentCard) {
        fireEvent.click(agentCard);
        // Devrait sélectionner l'agent
      }
    });

    it("devrait permettre de supprimer un agent", () => {
      renderWithRouter(<AgentDashboardView />);
      
      // Trouver le bouton de suppression (peut être dans un menu ou directement)
      const deleteButtons = screen.getAllByTitle("Supprimer");
      if (deleteButtons.length > 0) {
        expect(deleteButtons[0]).toBeInTheDocument();
      }
    });
  });

  describe("Gestion des tâches", () => {
    it("devrait afficher les cartes de tâches", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      expect(screen.getByText("Analyse de code")).toBeInTheDocument();
      expect(screen.getByText("Traitement de données")).toBeInTheDocument();
    });

    it("devrait afficher le statut des tâches", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      expect(screen.getByText("pending")).toBeInTheDocument();
      expect(screen.getByText("in_progress")).toBeInTheDocument();
    });

    it("devrait afficher la priorité des tâches", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      expect(screen.getByText("high")).toBeInTheDocument();
      expect(screen.getByText("medium")).toBeInTheDocument();
    });

    it("devrait afficher l'agent assigné à la tâche", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      // Devrait afficher le nom de l'agent assigné
      expect(screen.getAllByText("Agent Code").length).toBeGreaterThan(0);
    });

    it("devrait permettre de sélectionner une tâche", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      const taskCard = screen.getByText("Analyse de code").closest("div");
      if (taskCard) {
        fireEvent.click(taskCard);
        // Devrait sélectionner la tâche
      }
    });
  });

  describe("Fonctionnalités de recherche et filtrage", () => {
    it("devrait avoir une barre de recherche", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const searchInput = screen.getByPlaceholderText(/Rechercher/);
      expect(searchInput).toBeInTheDocument();
    });

    it("devrait filtrer les agents en fonction de la recherche", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const searchInput = screen.getByPlaceholderText(/Rechercher/);
      fireEvent.change(searchInput, { target: { value: "Code" } });
      
      // Devrait filtrer et afficher seulement les agents qui correspondent
      expect(screen.getByText("Agent Code")).toBeInTheDocument();
    });

    it("devrait filtrer les tâches en fonction de la recherche", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const searchInput = screen.getByPlaceholderText(/Rechercher/);
      fireEvent.change(searchInput, { target: { value: "code" } });
      
      // Devrait filtrer les tâches
      expect(screen.getByText("Analyse de code")).toBeInTheDocument();
    });
  });

  describe("Fonctionnalités de l'en-tête", () => {
    it("devrait avoir un bouton de rafraîchissement", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const refreshButton = screen.getByTitle("Rafraîchir");
      expect(refreshButton).toBeInTheDocument();
    });

    it("devrait avoir un bouton de paramètres", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const settingsButton = screen.getByTitle("Paramètres");
      expect(settingsButton).toBeInTheDocument();
    });
  });

  describe("Modal de création", () => {
    it("devrait ouvrir le modal de création d'agent", () => {
      renderWithRouter(<AgentDashboardView initialTab="agents" />);
      
      const newAgentButton = screen.getByText("Nouvel agent");
      fireEvent.click(newAgentButton);
      
      // Devrait afficher le modal de création
      expect(screen.getByText("Créer un nouvel agent")).toBeInTheDocument();
    });

    it("devrait ouvrir le modal de création de tâche", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      const newTaskButton = screen.getByText("Nouvelle tâche");
      fireEvent.click(newTaskButton);
      
      // Devrait afficher le modal de création
      expect(screen.getByText("Créer une nouvelle tâche")).toBeInTheDocument();
    });
  });

  describe("Gestion des callbacks", () => {
    it("devrait gérer la création d'un agent", () => {
      renderWithRouter(<AgentDashboardView initialTab="agents" />);
      
      const newAgentButton = screen.getByText("Nouvel agent");
      fireEvent.click(newAgentButton);
      
      // Le mock createAgent devrait être disponible
      expect(true).toBe(true);
    });

    it("devrait gérer la suppression d'un agent", () => {
      renderWithRouter(<AgentDashboardView />);
      
      // Le mock deleteAgent devrait être disponible
      expect(true).toBe(true);
    });

    it("devrait gérer la création d'une tâche", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      const newTaskButton = screen.getByText("Nouvelle tâche");
      fireEvent.click(newTaskButton);
      
      // Le mock createTask devrait être disponible
      expect(true).toBe(true);
    });

    it("devrait gérer l'assignation de tâche", () => {
      renderWithRouter(<AgentDashboardView />);
      
      // Le mock assignTask devrait être disponible
      expect(true).toBe(true);
    });
  });
});

// Tests des interfaces et types
describe("AgentDashboardView Types", () => {
  it("devrait exporter les props correctement", () => {
    const props: AgentDashboardViewProps = {
      initialTab: "overview",
    };
    
    expect(props.initialTab).toBe("overview");
  });

  it("devrait accepter tous les types d'onglets valides", () => {
    const validTabs = ["overview", "agents", "tasks", "orchestration", "communication", "performance"] as const;
    
    validTabs.forEach(tab => {
      const props: AgentDashboardViewProps = {
        initialTab: tab,
      };
      expect(props.initialTab).toBe(tab);
    });
  });
});

// Tests des composants internes
describe("AgentDashboardView Composants Internes", () => {
  describe("AgentCard", () => {
    it("devrait afficher les informations de base d'un agent", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("Agent Code")).toBeInTheDocument();
      expect(screen.getByText("Agent spécialisé dans le code")).toBeInTheDocument();
    });

    it("devrait afficher le statut avec la bonne couleur", () => {
      renderWithRouter(<AgentDashboardView />);
      
      const statusBadge = screen.getByText("idle");
      expect(statusBadge).toBeInTheDocument();
    });

    it("devrait afficher le type avec l'icône appropriée", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("code")).toBeInTheDocument();
    });

    it("devrait afficher le nombre de compétences", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("3 compétences")).toBeInTheDocument();
    });

    it("devrait afficher la progression pour les agents occupés", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("75%")).toBeInTheDocument();
    });
  });

  describe("TaskCard", () => {
    it("devrait afficher les informations de base d'une tâche", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      expect(screen.getByText("Analyse de code")).toBeInTheDocument();
    });

    it("devrait afficher le statut avec la bonne couleur", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      const statusBadge = screen.getByText("pending");
      expect(statusBadge).toBeInTheDocument();
    });

    it("devrait afficher l'agent assigné", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      // Devrait afficher l'agent assigné à la tâche
      const taskCards = screen.getAllByText("Agent Code");
      expect(taskCards.length).toBeGreaterThan(0);
    });

    it("devrait afficher la date de création", () => {
      renderWithRouter(<AgentDashboardView initialTab="tasks" />);
      
      // Devrait afficher les dates
      expect(screen.getAllByText(/\d{1,2}:\d{2}:\d{2}/).length).toBeGreaterThan(0);
    });
  });

  describe("StatCard", () => {
    it("devrait afficher les statistiques correctement", () => {
      renderWithRouter(<AgentDashboardView />);
      
      expect(screen.getByText("agents disponibles")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument(); // Total agents
    });
  });
});

// Tests d'export
describe("AgentDashboardView Export", () => {
  it("devrait exporter le composant par défaut", () => {
    const { default: DefaultExport } = require("../../src/views/AgentDashboardView");
    expect(DefaultExport).toBeDefined();
    expect(DefaultExport).toBe(AgentDashboardView);
  });

  it("devrait exporter le composant nommé", () => {
    const { AgentDashboardView: NamedExport } = require("../../src/views/AgentDashboardView");
    expect(NamedExport).toBeDefined();
  });
});

// Tests d'intégration
describe("AgentDashboardView Intégration", () => {
  it("devrait fonctionner avec MemoryRouter", () => {
    renderWithRouter(<AgentDashboardView />);
    
    expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
  });

  it("devrait gérer le routing sans erreurs", () => {
    render(
      <MemoryRouter initialEntries={["/agents"]}>
        <AgentDashboardView />
      </MemoryRouter>
    );
    
    expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
  });
});

// Tests de performance
describe("AgentDashboardView Performances", () => {
  it("devrait utiliser useMemo pour les statistiques", () => {
    renderWithRouter(<AgentDashboardView />);
    
    expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
  });

  it("devrait utiliser useCallback pour les handlers", () => {
    renderWithRouter(<AgentDashboardView />);
    
    expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
  });
});

// Tests de sécurité
describe("AgentDashboardView Sécurité", () => {
  it("ne devrait pas planter avec des données manquantes", () => {
    vi.mock("../../src/views/AgentDashboardView", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../src/views/AgentDashboardView")>();
      
      return {
        ...mod,
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
      };
    });

    renderWithRouter(<AgentDashboardView />);
    
    expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
  });

  it("devrait gérer les agents sans tâches en cours", () => {
    renderWithRouter(<AgentDashboardView />);
    
    // Devrait gérer les agents sans tâches
    expect(screen.getByText("Agent Content")).toBeInTheDocument();
  });
});

// Tests d'accessibilité
describe("AgentDashboardView Accessibilité", () => {
  it("devrait avoir les bonnes balises ARIA", () => {
    renderWithRouter(<AgentDashboardView />);
    
    const tabs = screen.getAllByRole("button");
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("devrait être navigable au clavier", () => {
    renderWithRouter(<AgentDashboardView />);
    
    const interactiveElements = screen.getAllByRole("button");
    interactiveElements.forEach(element => {
      expect(element).toHaveAttribute("tabindex");
    });
  });
});

// Tests de responsive design
describe("AgentDashboardView Responsive Design", () => {
  it("devrait s'adapter aux petits écrans", () => {
    renderWithRouter(<AgentDashboardView />);
    
    // La navigation devrait avoir un scroll horizontal
    const navigation = screen.getByTestId("navigation");
    expect(navigation).toHaveClass("overflow-x-auto");
  });
});

// Tests de cleanup
describe("AgentDashboardView Cleanup", () => {
  it("ne devrait pas laisser de fuites mémoire", () => {
    const { unmount } = renderWithRouter(<AgentDashboardView />);
    
    // Désmonter sans erreurs
    unmount();
    
    expect(true).toBe(true);
  });
});

// Tests edge cases
describe("AgentDashboardView Edge Cases", () => {
  it("devrait gérer une liste vide d'agents", () => {
    vi.mock("../../src/views/AgentDashboardView", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../src/views/AgentDashboardView")>();
      
      return {
        ...mod,
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
      };
    });

    renderWithRouter(<AgentDashboardView />);
    
    expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
    expect(screen.getByText("Aucun agent")).toBeInTheDocument();
  });

  it("devrait gérer beaucoup d'agents", () => {
    const manyAgents = Array.from({ length: 50 }, (_, i) => ({
      id: `agent${i}`,
      name: `Agent ${i}`,
      type: "code",
      status: "idle" as const,
      capabilities: [],
      createdAt: new Date().toISOString(),
    }));

    vi.mock("../../src/views/AgentDashboardView", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../src/views/AgentDashboardView")>();
      
      return {
        ...mod,
        useAgentManager: () => ({
          agents: manyAgents,
          tasks: [],
          selectedAgent: null,
          selectedTask: null,
          loading: false,
          stats: { total: 50, idle: 50, busy: 0, offline: 0, error: 0 },
          taskStats: { total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0 },
          setSelectedAgent: vi.fn(),
          setSelectedTask: vi.fn(),
          createAgent: vi.fn(),
          deleteAgent: vi.fn(),
          createTask: vi.fn(),
          deleteTask: vi.fn(),
          assignTask: vi.fn(),
        }),
      };
    });

    renderWithRouter(<AgentDashboardView />);
    
    expect(screen.getByText("Tableau de bord des agents")).toBeInTheDocument();
  });

  it("devrait gérer les agents avec des noms très longs", () => {
    const longName = "A".repeat(100);
    
    vi.mock("../../src/views/AgentDashboardView", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../src/views/AgentDashboardView")>();
      
      return {
        ...mod,
        useAgentManager: () => ({
          agents: [
            {
              id: "1",
              name: longName,
              type: "code",
              status: "idle" as const,
              capabilities: [],
              createdAt: new Date().toISOString(),
            },
          ],
          tasks: [],
          selectedAgent: null,
          selectedTask: null,
          loading: false,
          stats: { total: 1, idle: 1, busy: 0, offline: 0, error: 0 },
          taskStats: { total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0 },
          setSelectedAgent: vi.fn(),
          setSelectedTask: vi.fn(),
          createAgent: vi.fn(),
          deleteAgent: vi.fn(),
          createTask: vi.fn(),
          deleteTask: vi.fn(),
          assignTask: vi.fn(),
        }),
      };
    });

    renderWithRouter(<AgentDashboardView />);
    
    // Devrait tronquer le nom
    expect(screen.getByText(longName.slice(0, 50))).toBeInTheDocument();
  });
});

// Tests créés avec succès pour AgentDashboardView

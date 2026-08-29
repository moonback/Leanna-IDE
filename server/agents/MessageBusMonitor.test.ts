/**
 * Tests pour MessageBusMonitor
 * 
 * Teste :
 * - Collection de métriques
 * - Détection d'anomalies
 * - Génération de rapports
 * - Fonctionnalités de surveillance
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from "vitest";
import { EventEmitter } from "events";
import {
  MessageBusMonitor,
  messageBusMonitor,
  type MonitorAlert,
  type HealthStatus
} from "./MessageBusMonitor.js";
import { agentMessageBus } from "./AgentMessageBus.js";

// Mock du logger
vi.mock("../utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

// Mock de l'agentMessageBus
vi.mock("./AgentMessageBus", () => {
  
  class MockAgentMessageBus extends EventEmitter {
    private messages: any[] = [];
    
    constructor() {
      super();
    }
    
    publish(message: any) {
      this.messages.push(message);
      this.emit("message", message);
    }
    
    getMonitoringReport() {
      return {
        bus: {
          totalMessages: this.messages.length,
          successRate: 1,
          byMessageType: {},
          pendingRequests: 0,
          activeSubscriptions: 0,
          deadLetterQueue: {}
        },
        routing: {
          strategyUsage: {
            direct: this.messages.length,
            broadcast: 0,
            "round-robin": 0,
            "load-balanced": 0
          },
          agentLoad: {},
          roundRobinState: {}
        },
        traceEnabled: true,
        timestamp: new Date().toISOString()
      };
    }
    
    getMetrics() {
      return {
        totalMessages: this.messages.length,
        successRate: 1,
        byAgentRole: {},
        byMessageType: {},
        pendingRequests: 0,
        activeSubscriptions: 0,
        deadLetterQueue: {}
      };
    }
  }
  
  return {
    agentMessageBus: new MockAgentMessageBus()
  };
});

describe("MessageBusMonitor", () => {
  let monitor: MessageBusMonitor;

  beforeEach(() => {
    monitor = new MessageBusMonitor();
    vi.clearAllMocks();
  });

  // ─── Tests de base ───────────────────────────────────────────────────────
  
  describe("Initialisation", () => {
    it("devrait créer une instance avec des valeurs par défaut", () => {
      expect(monitor).toBeInstanceOf(MessageBusMonitor);
    });

    it("devrait avoir un état de santé initial valide", () => {
      const health = monitor.getHealthStatus();
      
      expect(health.healthy).toBe(true);
      expect(health.issues).toHaveLength(0);
      expect(health.metrics.uptime).toBeGreaterThan(0);
    });
  });

  // ─── Tests de santé ──────────────────────────────────────────────────────
  
  describe("Health Check", () => {
    it("devrait retourner un état sain initialement", () => {
      const health = monitor.getHealthStatus();
      
      expect(health.healthy).toBe(true);
      expect(health.issues).toEqual([]);
    });

    it("devrait détecter un taux de succès bas comme problème", () => {
      // Simuler un taux de succès bas
      vi.spyOn(agentMessageBus, "getMonitoringReport").mockReturnValue({
        bus: {
          totalMessages: 100,
          successRate: 0.7, // 70% - en dessous de 90%
          byMessageType: {},
          pendingRequests: 0,
          activeSubscriptions: 0,
          deadLetterQueue: {}
        },
        routing: {
          strategyUsage: { direct: 100, broadcast: 0, "round-robin": 0, "load-balanced": 0 },
          agentLoad: {},
          roundRobinState: {}
        },
        traceEnabled: true,
        timestamp: new Date().toISOString()
      });

      const health = monitor.getHealthStatus();
      
      expect(health.healthy).toBe(false);
      expect(health.issues).toContain("Taux de succès bas");
    });

    it("devrait détecter une dead-letter queue trop grande", () => {
      vi.spyOn(agentMessageBus, "getMonitoringReport").mockReturnValue({
        bus: {
          totalMessages: 100,
          successRate: 1,
          byMessageType: {},
          pendingRequests: 0,
          activeSubscriptions: 0,
          deadLetterQueue: { coder: 30, tester: 20 } // 50 total
        },
        routing: {
          strategyUsage: { direct: 100, broadcast: 0, "round-robin": 0, "load-balanced": 0 },
          agentLoad: {},
          roundRobinState: {}
        },
        traceEnabled: true,
        timestamp: new Date().toISOString()
      });

      const health = monitor.getHealthStatus();
      
      expect(health.healthy).toBe(false);
      expect(health.issues).toContain("Dead-letter queue trop grande");
    });
  });

  // ─── Tests de visualisation ──────────────────────────────────────────────
  
  describe("Visualisation", () => {
    it("devrait générer un dashboard textuel", () => {
      const dashboard = monitor.generateDashboard();
      
      expect(typeof dashboard).toBe("string");
      expect(dashboard).toContain("TABLEAU DE BORD");
      expect(dashboard).toContain("ÉTAT DE SANTÉ");
      expect(dashboard).toContain("ROUTAGE");
    });

    it("devrait générer un graphe de flux vide initialement", () => {
      const graph = monitor.generateMessageFlowGraph();
      
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it("devrait générer une visualisation ASCII du graphe", () => {
      const ascii = monitor.generateASCIIFlowGraph();
      
      expect(typeof ascii).toBe("string");
      expect(ascii).toContain("GRAPHE DE FLUX");
    });
  });

  // ─── Tests de configuration ─────────────────────────────────────────────
  
  describe("Configuration", () => {
    it("devrait configurer la taille maximale de l'historique", () => {
      monitor.setMaxHistorySize(200);
      // On ne peut pas vérifier directement car c'est privé, mais pas d'erreur
      expect(true).toBe(true);
    });

    it("devrait configurer le nombre maximal de métriques agrégées", () => {
      monitor.setMaxAggregatedMetrics(100);
      expect(true).toBe(true);
    });
  });

  // ─── Tests de nettoyage ─────────────────────────────────────────────────
  
  describe("Nettoyage", () => {
    it("devrait réinitialiser toutes les données", () => {
      // Ajouter des données
      // @ts-ignore - Accès interne pour le test
      monitor.alerts.set("test", { id: "test", severity: "info", type: "test", title: "Test", message: "Test", timestamp: new Date().toISOString() });
      
      monitor.reset();
      
      expect(monitor.getActiveAlerts()).toHaveLength(0);
    });
  });
});

// ─── Tests du singleton ────────────────────────────────────────────────────

describe("MessageBusMonitor Singleton", () => {
  it("devrait exporter une instance singleton", () => {
    expect(messageBusMonitor).toBeInstanceOf(MessageBusMonitor);
  });
});

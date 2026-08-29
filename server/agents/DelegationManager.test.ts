/**
 * Tests pour DelegationManager
 * 
 * Teste :
 * - Parsing JSON de délégations simples et batch
 * - Validation des délégations
 * - Exécution de délégations
 * - Gestion des statistiques
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from "vitest";
import {
  DelegationManager,
  delegationManager,
  structuredDelegationSchema,
  batchDelegationSchema
} from "./DelegationManager";
import { agentMessageBus } from "./AgentMessageBus";

// Mock du logger
vi.mock("../utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe("DelegationManager", () => {
  let manager: DelegationManager;

  beforeEach(() => {
    manager = new DelegationManager();
    vi.clearAllMocks();
  });

  // ─── Tests de parsing JSON ────────────────────────────────────────────────
  
  describe("parseFromJSON", () => {
    it("devrait parser une délégation simple valide", () => {
      const json = `{
        "targetRole": "coder",
        "title": "Implémenter une fonction",
        "description": "Créer une fonction utilitaire"
      }`;

      const result = manager.parseFromJSON(json, "planner");
      
      expect(result).toHaveLength(1);
      expect(result[0].targetRole).toBe("coder");
      expect(result[0].title).toBe("Implémenter une fonction");
      expect(result[0].description).toBe("Créer une fonction utilitaire");
      expect(result[0].priority).toBe("medium");
    });

    it("devrait parser un tableau de délégations", () => {
      const json = `[{
        "targetRole": "coder",
        "title": "Tâche 1",
        "description": "Desc 1"
      }, {
        "targetRole": "tester",
        "title": "Tâche 2",
        "description": "Desc 2"
      }]`;

      const result = manager.parseFromJSON(json, "planner");
      
      expect(result).toHaveLength(2);
      expect(result[0].targetRole).toBe("coder");
      expect(result[1].targetRole).toBe("tester");
    });

    it("devrait parser un batch de délégations", () => {
      const batchId = "550e8400-e29b-41d4-a716-446655440000";
      const json = `{
        "batchId": "${batchId}",
        "strategy": "parallel",
        "delegations": [
          {
            "targetRole": "coder",
            "title": "Tâche batch",
            "description": "Description batch"
          }
        ]
      }`;

      const result = manager.parseFromJSON(json, "planner");
      
      expect(result).toHaveLength(1);
      expect(result[0].targetRole).toBe("coder");
    });

    it("devrait lever une erreur pour un JSON invalide", () => {
      const json = `{"invalid": true}`;
      
      expect(() => {
        manager.parseFromJSON(json, "planner");
      }).toThrow();
    });

    it("devrait valider les champs obligatoires", () => {
      const json = `{
        "targetRole": "coder",
        "title": "Titre"
      }`; // description manquant

      expect(() => {
        manager.parseFromJSON(json, "planner");
      }).toThrow();
    });
  });

  // ─── Tests de validation ──────────────────────────────────────────────────
  
  describe("Validation", () => {
    it("devrait accepter les valeurs par défaut", () => {
      const delegation = {
        targetRole: "coder",
        title: "Test",
        description: "Description test"
      };

      // @ts-ignore - Appel interne
      const result = manager.validateAndEnrichDelegation(delegation, "planner");
      
      expect(result.priority).toBe("medium");
      expect(result.files).toEqual([]);
      expect(result.context).toEqual({});
      expect(result.condition).toEqual({ type: "always" });
    });

    it("devrait rejeter une délégation non autorisée", () => {
      const delegation = {
        targetRole: "vision", // vision ne peut pas être déléguer par planner dans la matrice
        title: "Test",
        description: "Description test"
      };

      expect(() => {
        // @ts-ignore - Appel interne
        manager.validateAndEnrichDelegation(delegation, "planner");
      }).toThrow("Délégation non autorisée");
    });
  });

  // ─── Tests de templates ──────────────────────────────────────────────────
  
  describe("Templates", () => {
    it("devrait générer un template de délégation valide", () => {
      const template = manager.generateDelegationTemplate("coder");
      
      expect(template).toContain('"targetRole": "coder"');
      expect(template).toContain('"title":');
      expect(template).toContain('"description":');
    });

    it("devrait générer un template de batch valide", () => {
      const template = manager.generateBatchTemplate("parallel");
      
      expect(template).toContain('"strategy": "parallel"');
      expect(template).toContain('"delegations":');
    });
  });

  // ─── Tests de statistiques ──────────────────────────────────────────────
  
  describe("Statistiques", () => {
    it("devrait retourner des statistiques vides initialement", () => {
      const stats = manager.getStatistics();
      
      expect(stats.totalDelegations).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.completed).toBe(0);
    });

    it("devrait retourner l'historique vide initialement", () => {
      const history = manager.getDelegationHistory();
      
      expect(history).toHaveLength(0);
    });
  });
});

// ─── Tests du singleton ────────────────────────────────────────────────────

describe("DelegationManager Singleton", () => {
  it("devrait exporter une instance singleton", () => {
    expect(delegationManager).toBeInstanceOf(DelegationManager);
  });
});

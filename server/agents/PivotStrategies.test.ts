/**
 * Tests pour le module PivotStrategies
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PivotStrategies, createPivotStrategies } from "./PivotStrategies.js";
import type { ErrorAnalysisReport } from "./EarlyErrorDetection.js";
import type { AgentTask } from "./types.js";

describe("PivotStrategies", () => {
  let strategies: PivotStrategies;
  
  const mockTask: AgentTask = {
    id: "test-task",
    role: "developer",
    title: "Test Task",
    description: "Description de test",
    priority: "medium",
    status: "pending",
    context: {
      files: [],
    },
    createdAt: new Date().toISOString(),
    timeoutMs: 30000,
  };

  const mockErrorAnalysis: ErrorAnalysisReport = {
    errors: [
      {
        message: "Cannot find module 'lodash'",
        category: "dependency",
        severity: "critical",
        isBlocking: true,
        confidence: 0.9,
        recommendation: "Installez le module manquant",
      }
    ],
    totalErrors: 1,
    criticalCount: 1,
    blockingCount: 1,
    categories: ["dependency"],
    riskScore: 0.8,
    recommendations: ["Installez le module manquant"],
    requiresHumanIntervention: false,
    needsClarification: false,
  };

  beforeEach(() => {
    strategies = createPivotStrategies();
  });

  describe("decidePivot", () => {
    it("devrait proposer le pivot par questionnement après 2 échecs consécutifs", async () => {
      // Mettre à jour l'état pour simuler 2 échecs consécutifs
      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);
      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);

      const context: any = {
        task: mockTask,
        previousResult: { success: false, summary: "Failed", details: "Error" },
        errorAnalysis: mockErrorAnalysis,
        iterationCount: 2,
        maxIterations: 3,
        elapsedTimeMs: 1000,
        iterationHistory: [],
        availableTools: ["verify_file"],
        availableAgents: ["developer", "debugger"],
      };

      const decision = await strategies.decidePivot(context);

      expect(decision.type).toBe("questioning");
      expect(decision.questions).toBeDefined();
      expect(decision.questions?.length).toBeGreaterThan(0);
    });

    it("devrait proposer le pivot par recherche contextuelle pour les erreurs de dépendances", async () => {
      const highRiskAnalysis: ErrorAnalysisReport = {
        ...mockErrorAnalysis,
        riskScore: 0.9,
        categories: ["dependency"],
      };

      const context: any = {
        task: mockTask,
        previousResult: { success: false, summary: "Failed", details: "Cannot find module" },
        errorAnalysis: highRiskAnalysis,
        iterationCount: 1,
        maxIterations: 3,
        elapsedTimeMs: 1000,
        iterationHistory: [],
        availableTools: ["verify_file", "browser_research"],
        availableAgents: ["developer", "debugger"],
      };

      const decision = await strategies.decidePivot(context);

      expect(decision.type).toBe("contextual_research");
      expect(decision.researchQuery).toBeDefined();
      expect(decision.researchQuery?.length).toBeGreaterThan(0);
    });

    it("devrait proposer le pivot par délégation pour les erreurs critiques", async () => {
      const highRiskAnalysis: ErrorAnalysisReport = {
        ...mockErrorAnalysis,
        totalErrors: 3,
        categories: ["runtime"],
      };

      const context: any = {
        task: mockTask,
        previousResult: { success: false, summary: "Failed", details: "Runtime error" },
        errorAnalysis: highRiskAnalysis,
        iterationCount: 1,
        maxIterations: 3,
        elapsedTimeMs: 1000,
        iterationHistory: [],
        availableTools: ["verify_file"],
        availableAgents: ["developer", "debugger", "sysadmin"],
      };

      const decision = await strategies.decidePivot(context);

      expect(decision.type).toBe("delegation");
      expect(decision.targetAgent).toBeDefined();
    });

    it("devrait proposer des alternatives pour les erreurs de risque moyen", async () => {
      const mediumRiskAnalysis: ErrorAnalysisReport = {
        ...mockErrorAnalysis,
        riskScore: 0.5,
        totalErrors: 2,
        errors: [
          mockErrorAnalysis.errors[0],
          mockErrorAnalysis.errors[0],
        ],
      };

      const context: any = {
        task: mockTask,
        previousResult: { success: false, summary: "Failed", details: "Error" },
        errorAnalysis: mediumRiskAnalysis,
        iterationCount: 1,
        maxIterations: 3,
        elapsedTimeMs: 1000,
        iterationHistory: [],
        availableTools: ["verify_file"],
        availableAgents: [],
      };

      const decision = await strategies.decidePivot(context);

      expect(decision.type).toBe("alternative");
      expect(decision.alternatives).toBeDefined();
      expect(decision.alternatives?.length).toBeGreaterThan(0);
    });

    it("devrait décider de continuer pour les tâches réussies", async () => {
      const context: any = {
        task: mockTask,
        previousResult: { success: true, summary: "Success", details: "All good" },
        errorAnalysis: {
          ...mockErrorAnalysis,
          totalErrors: 0,
          riskScore: 0,
        },
        iterationCount: 1,
        maxIterations: 3,
        elapsedTimeMs: 1000,
        iterationHistory: [],
        availableTools: ["verify_file"],
        availableAgents: [],
      };

      const decision = await strategies.decidePivot(context);

      expect(decision.type).toBe("continue");
      expect(decision.priority).toBe(0.1);
    });
  });

  describe("generateAlternatives", () => {
    it("devrait générer des alternatives pour les erreurs de dépendances", () => {
      const analysis: ErrorAnalysisReport = {
        errors: [
          {
            message: "Cannot find module 'react'",
            category: "dependency",
            severity: "critical",
            isBlocking: true,
            confidence: 0.9,
            recommendation: "Install react",
          }
        ],
        totalErrors: 1,
        criticalCount: 1,
        blockingCount: 1,
        categories: ["dependency"],
        riskScore: 0.8,
        recommendations: ["Install react"],
        requiresHumanIntervention: false,
        needsClarification: false,
      };

      const alternatives = strategies.generateAlternatives(analysis, mockTask);

      expect(alternatives.length).toBeGreaterThan(0);
    });

    it("devrait retourner un tableau vide pour une analyse sans erreurs", () => {
      const analysis: ErrorAnalysisReport = {
        errors: [],
        totalErrors: 0,
        criticalCount: 0,
        blockingCount: 0,
        categories: [],
        riskScore: 0,
        recommendations: [],
        requiresHumanIntervention: false,
        needsClarification: false,
      };

      const alternatives = strategies.generateAlternatives(analysis, mockTask);

      expect(alternatives.length).toBe(0);
    });
  });

  describe("generateClarificationQuestion", () => {
    it("devrait générer des questions pour les erreurs de dépendances", () => {
      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);
      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);

      const questions = strategies.generateClarificationQuestion(mockErrorAnalysis, mockTask);

      expect(questions.length).toBeGreaterThan(0);
    });

    it("devrait générer une question générique pour les erreurs inconnues", () => {
      const unknownAnalysis: ErrorAnalysisReport = {
        ...mockErrorAnalysis,
        errors: [
          {
            ...mockErrorAnalysis.errors[0],
            category: "unknown",
            message: "Some unknown error",
          }
        ],
        categories: ["unknown"],
      };

      const questions = strategies.generateClarificationQuestion(unknownAnalysis, mockTask);

      expect(questions.length).toBeGreaterThan(0);
    });
  });

  describe("generateResearchQuery", () => {
    it("devrait générer une requête de recherche pour les erreurs", () => {
      const query = strategies.generateResearchQuery(mockErrorAnalysis, mockTask);

      expect(query).toBeDefined();
      expect(query.length).toBeGreaterThan(0);
      expect(query.includes("fix") || query.includes("solution")).toBe(true);
    });

    it("devrait générer une requête de base pour une analyse vide", () => {
      const emptyAnalysis: ErrorAnalysisReport = {
        errors: [],
        totalErrors: 0,
        criticalCount: 0,
        blockingCount: 0,
        categories: [],
        riskScore: 0,
        recommendations: [],
        requiresHumanIntervention: false,
        needsClarification: false,
      };

      const query = strategies.generateResearchQuery(emptyAnalysis, mockTask);

      expect(query).toBeDefined();
      expect(query.includes("Test Task")).toBe(true);
    });
  });

  describe("getDelegationTarget", () => {
    it("devrait retourner un agent cible pour les erreurs de permission", () => {
      const permissionAnalysis: ErrorAnalysisReport = {
        ...mockErrorAnalysis,
        categories: ["permission"],
      };

      const target = strategies.getDelegationTarget(
        permissionAnalysis,
        ["developer", "sysadmin", "debugger"]
      );

      expect(target).toBe("sysadmin");
    });

    it("devrait retourner un agent cible pour les erreurs de runtime", () => {
      const runtimeAnalysis: ErrorAnalysisReport = {
        ...mockErrorAnalysis,
        categories: ["runtime"],
      };

      const target = strategies.getDelegationTarget(
        runtimeAnalysis,
        ["developer", "debugger", "sysadmin"]
      );

      expect(target).toBe("debugger");
    });

    it("devrait retourner null si aucun agent disponible", () => {
      const target = strategies.getDelegationTarget(mockErrorAnalysis, []);

      expect(target).toBeNull();
    });
  });

  describe("state management", () => {
    it("devrait mettre à jour correctement les échecs consécutifs", () => {
      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);
      expect((strategies as any).consecutiveFailures).toBe(1);

      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);
      expect((strategies as any).consecutiveFailures).toBe(2);

      strategies.updateAfterIteration(true, []);
      expect((strategies as any).consecutiveFailures).toBe(0);
    });

    it("devrait réinitialiser correctement l'état", () => {
      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);
      strategies.updateAfterIteration(false, mockErrorAnalysis.errors);
      
      expect((strategies as any).consecutiveFailures).toBe(2);
      expect(strategies.getPivotHistory().length).toBe(0);

      strategies.reset();

      expect((strategies as any).consecutiveFailures).toBe(0);
      expect(strategies.getPivotHistory().length).toBe(0);
    });
  });
});

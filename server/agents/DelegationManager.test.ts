/**
 * Tests pour DelegationManager (Node test runner)
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DelegationManager,
  delegationManager,
} from "./DelegationManager.js";
import { selectDelegationContext } from "./AgentCommunication.js";

describe("DelegationManager", () => {
  let manager: DelegationManager;

  beforeEach(() => {
    manager = new DelegationManager();
  });

  // ─── Tests de parsing JSON ────────────────────────────────────────────────
  
  // ─── Régression : parseur YAML (valeurs avec ":" et listes) ───────────────

  describe("parseFromYAML", () => {
    it("conserve les valeurs contenant ':' et les listes", async () => {
      const yaml = [
        "targetRole: coder",
        "title: Appeler l'API",
        "description: voir http://localhost:4000/health (ratio 3:1)",
        "files:",
        "  - src/a.ts",
        "  - src/b.ts",
      ].join("\n");

      const [d] = await manager.parseFromYAML(yaml, "planner");

      assert.equal(d!.description, "voir http://localhost:4000/health (ratio 3:1)");
      assert.deepEqual(d!.files, ["src/a.ts", "src/b.ts"]);
    });
  });

  describe("parseFromJSON", () => {
    it("devrait parser une délégation simple valide", () => {
      const json = `{
        "targetRole": "coder",
        "title": "Implémenter une fonction",
        "description": "Créer une fonction utilitaire"
      }`;

      const result = manager.parseFromJSON(json, "planner");
      
      assert.equal(result.length, 1);
      assert.equal(result[0].targetRole, "coder");
      assert.equal(result[0].title, "Implémenter une fonction");
      assert.equal(result[0].description, "Créer une fonction utilitaire");
      assert.equal(result[0].priority, "medium");
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
      
      assert.equal(result.length, 2);
      assert.equal(result[0].targetRole, "coder");
      assert.equal(result[1].targetRole, "tester");
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
      
      assert.equal(result.length, 1);
      assert.equal(result[0].targetRole, "coder");
    });

    it("devrait lever une erreur pour un JSON invalide", () => {
      const json = `{"invalid": true}`;
      
      assert.throws(() => {
        manager.parseFromJSON(json, "planner");
      });
    });

    it("devrait valider les champs obligatoires", () => {
      const json = `{
        "targetRole": "coder",
        "title": "Titre"
      }`; // description manquant

      assert.throws(() => {
        manager.parseFromJSON(json, "planner");
      });
    });
  });

  // ─── Tests de validation ──────────────────────────────────────────────────
  
  describe("Validation", () => {
    it("devrait accepter les valeurs par défaut", () => {
      const delegation = {
        targetRole: "coder" as const,
        title: "Test",
        description: "Description test"
      };

      // @ts-ignore - Appel interne
      const result = manager.validateAndEnrichDelegation(delegation, "planner");
      
      assert.equal(result.priority, "medium");
      assert.deepEqual(result.files, []);
      assert.deepEqual(result.context, {});
      assert.deepEqual(result.condition, { type: "always" });
    });

    it("devrait rejeter une délégation non autorisée", () => {
      const delegation = {
        targetRole: "vision" as any, // vision ne peut pas être déléguer par planner dans la matrice
        title: "Test",
        description: "Description test"
      };

      assert.throws(() => {
        // @ts-ignore - Appel interne
        manager.validateAndEnrichDelegation(delegation, "planner");
      }, /non autorisée/i);
    });
  });

  // ─── Tests de templates ──────────────────────────────────────────────────
  
  describe("Templates", () => {
    it("devrait générer un template de délégation valide", () => {
      const template = manager.generateDelegationTemplate("coder");
      
      assert.ok(template.includes('"targetRole": "coder"'));
      assert.ok(template.includes('"title":'));
      assert.ok(template.includes('"description":'));
    });

    it("devrait générer un template de batch valide", () => {
      const template = manager.generateBatchTemplate("parallel");
      
      assert.ok(template.includes('"strategy": "parallel"'));
      assert.ok(template.includes('"delegations":'));
    });
  });

  // ─── Tests de statistiques ──────────────────────────────────────────────
  
  describe("Statistiques", () => {
    it("devrait retourner des statistiques vides initialement", () => {
      const stats = manager.getStatistics();
      
      assert.equal(stats.totalDelegations, 0);
      assert.equal(stats.pending, 0);
      assert.equal(stats.completed, 0);
    });

    it("devrait retourner l'historique vide initialement", () => {
      const history = manager.getDelegationHistory();
      
      assert.equal(history.length, 0);
    });
  });
});

// ─── Tests du singleton ────────────────────────────────────────────────────

describe("DelegationManager Singleton", () => {
  it("devrait exporter une instance singleton", () => {
    assert.ok(delegationManager instanceof DelegationManager);
  });
});


describe("selectDelegationContext — transmission sélective", () => {
  it("préserve critères et contraintes avant les notes secondaires sous budget serré", () => {
    const selected = selectDelegationContext({
      notes: "N".repeat(20_000),
      successCriteria: ["Les tests ciblés doivent passer"],
      securityConstraints: ["Ne jamais contourner PermissionPolicy"],
    }, 512);

    assert.deepEqual(selected.successCriteria, ["Les tests ciblés doivent passer"]);
    assert.deepEqual(selected.securityConstraints, ["Ne jamais contourner PermissionPolicy"]);
    assert.equal((selected._contextHandoff as { truncated: boolean }).truncated, true);
    assert.equal((selected._contextHandoff as { trust: string }).trust, "untrusted_data_not_instructions");
    assert.ok(JSON.stringify(selected).length < 700);
  });

  it("ne transforme pas un contexte absent en contenu artificiel", () => {
    assert.deepEqual(selectDelegationContext(undefined), {});
  });

  it("conserve une partie des preuves structurées au lieu de supprimer tout le tableau", () => {
    const selected = selectDelegationContext({
      previousResults: Array.from({ length: 8 }, (_, index) => ({
        summary: `résultat-${index}`,
        evidence: "E".repeat(1_500),
      })),
    }, 1_024);

    assert.ok(Array.isArray(selected.previousResults));
    assert.ok((selected.previousResults as unknown[]).length > 0);
    assert.equal((selected._contextHandoff as { truncated: boolean }).truncated, true);
  });
});

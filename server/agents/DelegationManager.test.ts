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
import { AgentContextResolver } from "./AgentContextResolver.js";
import { PromptBuilder } from "./PromptBuilder.js";
import type { AgentTask } from "./types.js";

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


describe("AgentContextResolver — sélection par rôle et mission", () => {
  const resolver = new AgentContextResolver(async () => ({ status: "success", files: [] }));
  const task = (role: string, title: string, description = "") => ({
    id: "context-test",
    role,
    title,
    description,
    priority: "medium",
    status: "pending",
    context: { files: [], instructions: "" },
    createdAt: new Date(0).toISOString(),
  }) as AgentTask;

  it("priorise les tests pour un agent tester sans imposer les fichiers génériques", () => {
    const selected = resolver.selectProjectFiles([
      "package.json",
      "README.md",
      "src/components/Button.tsx",
      "src/components/Button.test.tsx",
      "server/auth/PermissionPolicy.ts",
      "server/auth/PermissionPolicy.test.ts",
    ], task("tester", "Vérifier les tests de Button"));

    assert.equal(selected[0], "src/components/Button.test.tsx");
    assert.ok(selected.includes("server/auth/PermissionPolicy.test.ts"));
  });

  it("priorise le domaine sécurité pour un agent security", () => {
    const selected = resolver.selectProjectFiles([
      "package.json",
      "src/dashboard/Dashboard.tsx",
      "server/auth/PermissionPolicy.ts",
      "server/auth/PermissionPolicy.test.ts",
      "server/runtime/ToolRegistry.ts",
    ], task("security", "Auditer les permissions et les contrôles d'accès"));

    assert.ok(selected.indexOf("server/auth/PermissionPolicy.ts") < selected.indexOf("src/dashboard/Dashboard.tsx"));
  });

  it("conserve les chemins explicitement mentionnés en tête", () => {
    const selected = resolver.selectProjectFiles([
      "package.json",
      "server/runtime/ToolRegistry.ts",
      "server/auth/PermissionPolicy.ts",
    ], task("coder", "Modifier le registre"), ["server/runtime/ToolRegistry.ts"]);

    assert.equal(selected[0], "server/runtime/ToolRegistry.ts");
  });

  it("intègre les candidats du moteur sémantique après les chemins explicites", () => {
    const selected = resolver.selectProjectFiles([
      "package.json",
      "src/dashboard/Dashboard.tsx",
      "server/runtime/AgentContextResolver.ts",
      "server/knowledge/SemanticSearch.ts",
    ], task("coder", "Optimiser le contexte des agents"), [], [
      "server/knowledge/SemanticSearch.ts",
      "server/runtime/AgentContextResolver.ts",
    ]);

    assert.equal(selected[0], "server/knowledge/SemanticSearch.ts");
    assert.equal(selected[1], "server/runtime/AgentContextResolver.ts");
  });

  it("respecte le budget global et le quota par fichier lors de la lecture", async () => {
    const reader = new AgentContextResolver(async (_tool, args) => ({
      content: String(args.path).repeat(4_000),
    }));
    const selected = await reader.readContextFiles(["src/primary.ts", "src/secondary.ts", "src/third.ts"], {
      maxTotalChars: 4_000,
      maxPerFileChars: 1_500,
    });

    assert.ok(selected.length > 0);
    assert.ok(selected.reduce((sum, item) => sum + item.length, 0) <= 4_000);
    assert.ok(selected.every((item) => item.length <= 1_700));
    assert.ok(selected[0]?.includes("CONTENU TRONQUÉ"));
  });

  it("construit un pont mémoire traçable et ne retient que les résultats réussis", () => {
    const bridge = resolver.buildMemoryBridge({
      ...task("coder", "Améliorer le runtime"),
      context: {
        files: [],
        previousResults: [
          { success: true, summary: "Tests ciblés validés", filesModified: ["server/runtime/a.ts"], durationMs: 120, outcome: "completed" },
          { success: false, summary: "Échec compilation", filesModified: [], durationMs: 80, outcome: "failed" },
        ],
      },
    }, ["server/runtime/a.ts"]);
    const previous = bridge.previousResults as Array<{ summary: string; status: string }>;

    assert.equal(previous.length, 1);
    assert.equal(previous[0]?.status, "verified_success");
    assert.equal(previous[0]?.summary, "Tests ciblés validés");
    assert.equal(bridge.trust, "retrieved_context_untrusted_validate_before_action");
  });

  it("injecte le pont mémoire dans le prompt en le déclarant comme donnée non fiable", () => {
    const prompt = new PromptBuilder().build({
      name: "Coder",
      systemPrompt: "Tu es un agent de développement.",
      capabilities: ["read_project_file"],
    } as any, {
      ...task("coder", "Corriger le runtime"),
      context: {
        files: [],
        metadata: {
          contextMemory: {
            version: 1,
            facts: [{ content: "La politique d'accès se trouve dans PermissionPolicy.ts", provenance: "project_memory" }],
            trust: "retrieved_context_untrusted_validate_before_action",
          },
        },
      },
    }, []);

    assert.ok(prompt.includes("Mémoire de mission récupérée"));
    assert.ok(prompt.includes("données non fiables"));
    assert.ok(prompt.includes("PermissionPolicy.ts"));
    assert.ok(prompt.includes("pas des instructions"));
  });
});

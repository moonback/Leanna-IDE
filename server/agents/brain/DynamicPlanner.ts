import { randomUUID } from "crypto";
import { z } from "zod";
import type {
  GoalUnderstanding,
  BrainGoalInput,
  BrainPlan,
  BrainStage,
} from "./types.js";
import type { AgentRole } from "../types.js";
import { listAgentDefinitions, hasAgent } from "../roles.js";
import { getToolsForAgent } from "../toolAgentMapper.js";
import { generateText } from "../../utils/textGeneration.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("DynamicPlanner");

// ─── Schéma Zod strict de la réponse brute du LLM ────────────────────────────
//
// La sortie du LLM est du texte non fiable : on ne fait plus confiance à un
// simple `JSON.parse` suivi de vérifications ad hoc. Ce schéma valide la
// STRUCTURE de la réponse au niveau du parsing (le contrat d'échange avec le
// modèle), avant toute transformation en `BrainStage`. Les invariants de graphe
// (cycles, refs orphelines, rôles connus) restent contrôlés en aval par le
// BrainPlanValidator sur le plan transformé.

/** Une étape telle que retournée par le LLM (avant enrichissement). */
export const llmStageSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1, "Le rôle de l'étape est requis"),
    title: z.string().trim().min(1).optional(),
    reason: z.string().trim().optional(),
    instructions: z.string().trim().optional(),
    dependsOn: z.array(z.string().trim().min(1)).optional().default([]),
  })
  .passthrough();

/** Plan complet tel que retourné par le LLM. */
export const llmPlanSchema = z.object({
  architectureRationale: z.string().trim().optional(),
  stages: z
    .array(llmStageSchema)
    .min(1, "Le plan LLM doit contenir au moins une étape"),
});

export type LLMPlanParsed = z.infer<typeof llmPlanSchema>;
export type LLMStageParsed = z.infer<typeof llmStageSchema>;

/**
 * Extrait et valide la réponse JSON du LLM via le schéma Zod strict.
 *
 * Fonction pure (pas d'état, pas d'I/O) pour rester directement testable
 * indépendamment de l'appel réseau au fournisseur de modèle.
 *
 * Étapes :
 *   1. Isole le premier bloc `{ ... }` dans la réponse (le LLM peut baver du
 *      texte autour du JSON malgré la consigne).
 *   2. `JSON.parse` sécurisé (les exceptions de syntaxe sont capturées).
 *   3. Validation structurelle Zod (`llmPlanSchema.safeParse`).
 *
 * @returns le plan validé, ou `null` si la réponse est absente/malformée
 *          (le caller retombe alors sur la décomposition heuristique).
 */
export function parseLLMPlanResponse(rawText: string): LLMPlanParsed | null {
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) {
    log.warn("Réponse LLM sans objet JSON détectable — repli heuristique");
    return null;
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(match[0]);
  } catch (err: any) {
    log.warn(`JSON du plan LLM illisible (${err?.message ?? err}) — repli heuristique`);
    return null;
  }

  const result = llmPlanSchema.safeParse(candidate);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "plan"}: ${i.message}`)
      .join(" ; ");
    log.warn(`Plan LLM invalide (${detail}) — repli heuristique`);
    return null;
  }

  return result.data;
}

export class DynamicPlanner {
  /**
   * Crée un plan dynamique adapté à l'objectif sans workflow codé en dur
   */
  async plan(understanding: GoalUnderstanding, input: BrainGoalInput): Promise<BrainPlan> {
    log.info(`🎯 Planification dynamique pour domaine '${understanding.domain}' (complexité: ${understanding.complexity})`);

    // 1. Essai de planification via LLM
    try {
      const llmPlan = await this.planWithLLM(understanding, input);
      if (llmPlan && llmPlan.stages.length > 0) {
        log.info(`✅ Plan LLM généré avec ${llmPlan.stages.length} étapes (${llmPlan.stages.map((s) => s.agentRole).join(" → ")})`);
        return llmPlan;
      }
    } catch (err: any) {
      log.warn(`⚠️ Échec planification LLM (${err.message}), application de la décomposition heuristique`);
    }

    // 2. Décomposition dynamique intelligente heuristique
    return this.planHeuristic(understanding, input);
  }

  /**
   * Décomposition dynamique heuristique basée sur les capabilities réelles
   */
  planHeuristic(understanding: GoalUnderstanding, input: BrainGoalInput): BrainPlan {
    const planId = randomUUID();
    const stages: BrainStage[] = [];
    const files = understanding.relevantFiles;

    // Déterminer la séquence dynamique selon l'intention et le domaine
    const selectedRoles = this.determineRoleSequence(understanding, input);

    let previousStageId: string | null = null;

    for (let i = 0; i < selectedRoles.length; i++) {
      const { role, reason, customTitle, customInstructions } = selectedRoles[i];
      const stageId = `stage-${i + 1}-${role}`;

      // Sélection dynamique des skills et outils adaptés à ce rôle pour cette tâche
      const { skills, tools } = this.selectSkillsAndTools(role, understanding.domain);

      const stage: BrainStage = {
        id: stageId,
        title: customTitle || `Étape ${i + 1} : ${this.getRoleActionTitle(role, understanding.intent)}`,
        description: `Exécution par l'agent ${role}. ${reason}`,
        agentRole: role,
        agentReason: reason,
        skills,
        tools,
        files,
        instructions: customInstructions || this.buildStageInstructions(role, understanding),
        dependsOn: previousStageId ? [previousStageId] : [],
        status: "pending",
        priority: understanding.complexity === "critical" ? "critical" : "high",
        verificationCriteria: this.getRoleVerificationCriteria(role, understanding),
      };

      stages.push(stage);
      previousStageId = stageId;
    }

    const estimatedDurationMs = stages.length * 45_000; // ~45s par étape estimée
    const rolesSummary = stages.map((s) => s.agentRole).join(" → ");
    const architectureRationale =
      `Plan dynamique structuré en ${stages.length} étapes adaptées au domaine '${understanding.domain}'. ` +
      `Agents engagés : ${rolesSummary}.`;

    return {
      id: planId,
      goal: input.goal,
      understanding,
      stages,
      estimatedDurationMs,
      architectureRationale,
      createdAt: new Date().toISOString(),
      status: "planned",
    };
  }

  /**
   * Détermine la séquence d'agents optimale selon l'analyse de l'objectif
   */
  private determineRoleSequence(
    understanding: GoalUnderstanding,
    input: BrainGoalInput
  ): Array<{ role: AgentRole; reason: string; customTitle?: string; customInstructions?: string }> {
    const { domain, intent, complexity } = understanding;
    const lower = intent.toLowerCase();
    const roles: Array<{ role: AgentRole; reason: string; customTitle?: string; customInstructions?: string }> = [];

    // Cas 1 : Modernisation de site / UI / Responsive Header (Exemple spécifique du prompt utilisateur)
    if (domain === "frontend" || /(responsive|header|modernis|ui|css)/i.test(lower)) {
      roles.push({
        role: "researcher",
        reason: "Analyse la structure existante du header, les classes CSS et les breakpoints responsive.",
        customTitle: "Recherche et analyse de l'existant UI",
      });
      roles.push({
        role: "architect",
        reason: "Conçoit la disposition responsive (Flexbox/Grid, media queries, menu hamburger sur mobile).",
        customTitle: "Conception de l'architecture responsive",
      });
      roles.push({
        role: "coder",
        reason: "Implémente le code TSX/CSS du composant pour le rendre responsive et moderne.",
        customTitle: "Implémentation du header responsive",
      });
      if (input.preferences?.visualValidation !== false) {
        roles.push({
          role: "vision",
          reason: "Vérifie visuellement l'adaptation responsive sur différentes largeurs et détecte les débordements.",
          customTitle: "Validation visuelle & responsive",
        });
      }
      if (!input.preferences?.skipTests) {
        roles.push({
          role: "tester",
          reason: "Valide la syntaxe, l'intégrité des composants et l'absence de régression.",
          customTitle: "Tests de validation et de non-régression",
        });
      }
      roles.push({
        role: "reviewer",
        reason: "Revue de code approfondie sur l'accessibilité, les conventions et la propreté CSS/TSX.",
        customTitle: "Revue de code et audit qualité",
      });
      return roles;
    }

    // Cas 2 : Bugfix / Dépannage
    if (domain === "bugfix" || /(bug|fix|erreur|crash)/i.test(lower)) {
      roles.push({
        role: "debugger",
        reason: "Analyse les stacktraces et localise la cause racine du dysfonctionnement.",
        customTitle: "Diagnostic et isolation du bug",
      });
      roles.push({
        role: "coder",
        reason: "Applique le correctif ciblé sur le code concerné.",
        customTitle: "Application du correctif",
      });
      roles.push({
        role: "tester",
        reason: "Valide le correctif et vérifie qu'aucune régression n'apparaît.",
        customTitle: "Vérification et non-régression",
      });
      roles.push({
        role: "reviewer",
        reason: "Revue de sécurité et de conformité du correctif.",
        customTitle: "Revue qualité du fix",
      });
      return roles;
    }

    // Cas 3 : Refactorisation
    if (domain === "refactor") {
      roles.push({
        role: "architect",
        reason: "Modélise la restructuration modulaire et les interfaces cibles.",
        customTitle: "Modélisation de la refactorisation",
      });
      roles.push({
        role: "refactor",
        reason: "Restructure le code, découpe les fonctions trop complexes et élimine la dette.",
        customTitle: "Restructuration propre du code",
      });
      roles.push({
        role: "tester",
        reason: "Garantit la stricte équivalence comportementale via les tests.",
        customTitle: "Tests de non-régression",
      });
      roles.push({
        role: "reviewer",
        reason: "Vérifie le respect des principes SOLID et clean code.",
        customTitle: "Revue finale",
      });
      return roles;
    }

    // Cas 4 : Documentation
    if (domain === "documentation") {
      roles.push({
        role: "researcher",
        reason: "Collecte les informations techniques et signatures d'API.",
        customTitle: "Collecte des informations",
      });
      roles.push({
        role: "writer",
        reason: "Rédige la documentation technique claire et exhaustive.",
        customTitle: "Rédaction documentaire",
      });
      roles.push({
        role: "proofreader",
        reason: "Relecture orthographique, syntaxique et stylistique.",
        customTitle: "Relecture et validation",
      });
      return roles;
    }

    // Cas 5 : Développement Fullstack / Général
    if (complexity === "complex" || complexity === "critical") {
      roles.push({
        role: "researcher",
        reason: "Analyse des dépendances, sources et contraintes techniques.",
      });
      roles.push({
        role: "architect",
        reason: "Conception de l'architecture technique et des interfaces.",
      });
      roles.push({
        role: "coder",
        reason: "Développement et implémentation du code.",
      });
      roles.push({
        role: "tester",
        reason: "Vérification et validation par tests automatisés.",
      });
      roles.push({
        role: "reviewer",
        reason: "Audit qualité et validation globale.",
      });
    } else {
      // Cas simple
      roles.push({
        role: "coder",
        reason: "Implémentation directe de la demande.",
      });
      roles.push({
        role: "tester",
        reason: "Validation du code implémenté.",
      });
    }

    return roles;
  }

  /**
   * Sélection dynamique des skills et outils adaptés par rôle
   */
  private selectSkillsAndTools(
    role: AgentRole,
    _domain: string
  ): { skills: string[]; tools: string[] } {
    const rawTools = getToolsForAgent(role);
    const skills: string[] = [];
    const tools: string[] = [];

    // Sélection ciblée des outils prioritaires pour éviter les contextes surchargés
    switch (role) {
      case "researcher":
        skills.push("codebase", "knowledge");
        tools.push("read_project_file", "search_in_files", "list_project_files", "analyze_project_file", "knowledge_build_context");
        break;

      case "architect":
        skills.push("codebase", "reasoning");
        tools.push("read_project_file", "search_in_files", "analyze_project_file", "reasoning_think");
        break;

      case "coder":
        skills.push("codebase", "verify");
        tools.push("read_project_file", "modify_project_file", "write_project_file", "patch_project_file", "verify_syntax", "verify_file");
        break;

      case "refactor":
        skills.push("codebase", "verify");
        tools.push("read_project_file", "modify_project_file", "patch_project_file", "verify_syntax", "verify_lint");
        break;

      case "debugger":
        skills.push("codebase", "verify", "reasoning");
        tools.push("read_project_file", "search_in_files", "run_project_command", "verify_syntax", "modify_project_file");
        break;

      case "vision":
        skills.push("browser", "automationBrowser");
        tools.push("automation_screenshot", "automation_navigate", "read_project_file");
        break;

      case "tester":
        skills.push("verify", "codebase");
        tools.push("run_project_command", "verify_file", "verify_syntax", "read_project_file");
        break;

      case "reviewer":
        skills.push("verify", "codebase");
        tools.push("read_project_file", "verify_lint", "verify_typecheck", "verify_syntax");
        break;

      case "writer":
        skills.push("codebase", "documents");
        tools.push("read_project_file", "write_project_file", "modify_project_file");
        break;

      case "proofreader":
        skills.push("codebase");
        tools.push("read_project_file", "modify_project_file");
        break;

      default:
        // Pour rôles personnalisés
        skills.push("codebase");
        tools.push(...rawTools.slice(0, 6));
        break;
    }

    return {
      skills: Array.from(new Set(skills)),
      tools: Array.from(new Set(tools)),
    };
  }

  private getRoleActionTitle(role: AgentRole, _intent: string): string {
    const titles: Record<string, string> = {
      researcher: "Analyse technique et exploration de la codebase",
      architect: "Conception architecturale et modélisation",
      coder: "Implémentation et modifications du code",
      refactor: "Refactorisation et élimination de la dette",
      vision: "Validation visuelle et responsive",
      tester: "Tests automatisés et vérification de conformité",
      reviewer: "Revue de code et audit qualité",
      debugger: "Diagnostic et résolution de bogues",
      writer: "Rédaction de contenu ou documentation",
      proofreader: "Relecture et finitions",
    };
    return titles[role as string] || `Exécution ${role}`;
  }

  private buildStageInstructions(role: AgentRole, understanding: GoalUnderstanding): string {
    return [
      `OBJECTIF GLOBAL : ${understanding.intent}`,
      `DOMAINE : ${understanding.domain} | COMPLEXITÉ : ${understanding.complexity}`,
      `CRITÈRES DE SUCCÈS À SATISFAIRE :`,
      ...understanding.successCriteria.map((c) => `- ${c}`),
      `\nConsigne spécifique pour le rôle '${role}' : concentre-toi exclusivement sur ton domaine d'expertise pour cette étape du plan.`,
    ].join("\n");
  }

  private getRoleVerificationCriteria(role: AgentRole, _understanding: GoalUnderstanding): string[] {
    const criteria: string[] = [];
    if (role === "coder" || role === "refactor" || role === "debugger") {
      criteria.push("Syntaxe valide et absence d'erreur TypeScript");
      criteria.push("Fichiers modifiés enregistrés avec succès");
    } else if (role === "vision") {
      criteria.push("Pas de dépassement ou superposition visuelle constatée");
      criteria.push("Mise en page cohérente sur les résolutions cibles");
    } else if (role === "tester") {
      criteria.push("Exécution sans erreur des tests du module");
    } else if (role === "reviewer") {
      criteria.push("Code conforme aux normes du projet");
    }
    return criteria;
  }

  /**
   * Planification avancée via LLM si disponible
   */
  private async planWithLLM(understanding: GoalUnderstanding, input: BrainGoalInput): Promise<BrainPlan | null> {
    const availableRoles = listAgentDefinitions().map((d) => `${d.role}: ${d.description.slice(0, 70)}...`);

    const prompt = `
Tu es l'Agent Brain de Leanna. Conçois le plan d'exécution optimal sous forme de DAG pour l'objectif suivant :

OBJECTIF : "${understanding.intent}"
DOMAINE : ${understanding.domain}
COMPLEXITÉ : ${understanding.complexity}
CRITÈRES : ${understanding.successCriteria.join("; ")}
FICHIERS : ${understanding.relevantFiles.join(", ") || "Non spécifiés"}

AGENTS DISPONIBLES :
${availableRoles.join("\n")}

RÈGLE ABSOLUE : Pas de workflow codé en dur ! Choisis les agents strictement pertinents et ordonne-les avec dépendances logiques.

Retourne UNIQUEMENT un objet JSON valide :
{
  "architectureRationale": "Explication de la stratégie choisie",
  "stages": [
    {
      "id": "stage-1",
      "role": "nom_du_role",
      "title": "Titre clair de l'étape",
      "reason": "Pourquoi cet agent est choisi",
      "instructions": "Instructions précises",
      "dependsOn": []
    }
  ]
}
`.trim();

    const res = await generateText({
      prompt,
      temperature: 0.1,
      maxOutputTokens: 2048,
    });

    // Validation stricte de la réponse brute du LLM via Zod (au lieu d'un
    // JSON.parse + vérifications ad hoc). Une réponse malformée retourne null,
    // ce qui déclenche proprement le repli heuristique dans `plan()`.
    const parsed = this.parsePlanResponse(res.text);
    if (!parsed) return null;

    // Réindexation des id d'étapes : on associe à chaque étape LLM son id final
    // (fourni ou dérivé) AVANT de remapper les `dependsOn`, afin de préserver
    // les dépendances même quand le LLM omet certains id.
    const stageIds = parsed.stages.map((st, idx) => {
      const role = (hasAgent(st.role) ? st.role : "coder") as AgentRole;
      return st.id && st.id.trim() ? st.id.trim() : `stage-${idx + 1}-${role}`;
    });
    const originalIdToFinal = new Map<string, string>();
    parsed.stages.forEach((st, idx) => {
      if (st.id && st.id.trim()) originalIdToFinal.set(st.id.trim(), stageIds[idx]);
    });

    const stages: BrainStage[] = parsed.stages.map((st: LLMStageParsed, idx: number) => {
      const role = (hasAgent(st.role) ? st.role : "coder") as AgentRole;
      const { skills, tools } = this.selectSkillsAndTools(role, understanding.domain);

      // Remapper les dépendances déclarées vers les id finaux ; à défaut de
      // dépendance explicite, chaîner sur l'étape précédente (séquence par défaut).
      const declaredDeps = (st.dependsOn ?? [])
        .map((d) => originalIdToFinal.get(d.trim()) ?? d.trim())
        .filter((d) => d && d !== stageIds[idx]);
      const dependsOn =
        declaredDeps.length > 0 ? declaredDeps : idx > 0 ? [stageIds[idx - 1]] : [];

      return {
        id: stageIds[idx],
        title: st.title || `Étape ${idx + 1} (${role})`,
        description: st.reason || `Exécution par ${role}`,
        agentRole: role,
        agentReason: st.reason || "Sélectionné par le Brain",
        skills,
        tools,
        files: understanding.relevantFiles,
        instructions: st.instructions || this.buildStageInstructions(role, understanding),
        dependsOn,
        status: "pending",
        priority: "high",
        verificationCriteria: this.getRoleVerificationCriteria(role, understanding),
      };
    });

    return {
      id: randomUUID(),
      goal: input.goal,
      understanding,
      stages,
      estimatedDurationMs: stages.length * 45_000,
      architectureRationale: parsed.architectureRationale || "Planification dynamique établie par LLM",
      createdAt: new Date().toISOString(),
      status: "planned",
    };
  }

  /**
   * Extrait et valide la réponse JSON du LLM via le schéma Zod strict.
   * Délègue à la fonction pure `parseLLMPlanResponse` (testable isolément).
   */
  private parsePlanResponse(rawText: string): LLMPlanParsed | null {
    return parseLLMPlanResponse(rawText);
  }
}

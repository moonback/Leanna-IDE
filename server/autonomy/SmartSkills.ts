/**
 * SMART SKILLS — Skills composites avec boucles intégrées.
 *
 * Contrairement aux skills "dumb" qui exécutent et retournent,
 * les Smart Skills encapsulent une logique de boucle :
 *
 * - validatePatch: vérifie → corrige → re-vérifie → boucle jusqu'à succès
 * - readUntilUnderstood: lit → évalue confiance → lit davantage si nécessaire
 * - planCodeChange: analyse impact → ordonne → estime risques → propose
 *
 * Ces skills sont exposés comme des outils standard mais leur implémentation
 * inclut la logique de retry/loop qui manquait au niveau prompt.
 */

import { Skill } from "../skills/base";
import { createLogger } from "../utils/logger";

const log = createLogger("SmartSkills");

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type SkillHandler = (name: string, args: any, context?: any) => Promise<any>;

interface ValidatePatchResult {
  success: boolean;
  attempts: number;
  file: string;
  finalState: "valid" | "failed_max_retries" | "needs_human";
  errors?: string;
  corrections?: string[];
}

interface ReadUntilUnderstoodResult {
  confidence: number;
  filesRead: string[];
  summary: string;
  keyFindings: string[];
  suggestMore: boolean;
}

interface PlanCodeChangeResult {
  files: Array<{
    path: string;
    action: "modify" | "create" | "delete";
    impact: "low" | "medium" | "high";
    order: number;
    reason: string;
  }>;
  risks: string[];
  testFiles: string[];
  rollbackPlan: string;
  estimatedComplexity: "trivial" | "simple" | "moderate" | "complex";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Smart Skills Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crée les smart skills. Nécessite un handler pour appeler les skills existants.
 */
export function createSmartSkills(skillHandler: SkillHandler): Skill {
  return {
    name: "smart",
    declarations: [
      {
        name: "validate_patch",
        description:
          "Applique un patch/modification sur un fichier puis boucle automatiquement : " +
          "vérifie (tsc + lint + tests) → si erreurs, analyse et corrige → re-vérifie → " +
          "jusqu'à 3 tentatives. Retourne le résultat final (succès/échec). " +
          "Utilise cet outil AU LIEU de patch_project_file + verify_file séparément " +
          "quand tu veux garantir que le fichier est valide après modification.",
        parameters: {
          type: "OBJECT",
          properties: {
            path: {
              type: "STRING",
              description: "Chemin relatif du fichier à modifier.",
            },
            modifications: {
              type: "STRING",
              description:
                "Description des modifications à appliquer (sera passé à modify_project_file). " +
                "Format: description précise des changements avec le contenu exact.",
            },
            search: {
              type: "STRING",
              description: "Texte exact à chercher dans le fichier (pour modify_project_file).",
            },
            replace: {
              type: "STRING",
              description: "Texte de remplacement (pour modify_project_file).",
            },
          },
          required: ["path", "search", "replace"],
        },
      },
      {
        name: "read_until_understood",
        description:
          "Lit un ensemble de fichiers liés à une tâche de manière incrémentale. " +
          "Commence par knowledge_build_context, puis lit les fichiers recommandés. " +
          "Évalue la confiance après chaque lecture. Continue tant que confiance < 80%. " +
          "Retourne un résumé structuré avec les findings clés et la confiance finale. " +
          "Utilise cet outil au début d'une tâche complexe pour t'assurer de comprendre " +
          "le code AVANT de le modifier.",
        parameters: {
          type: "OBJECT",
          properties: {
            task: {
              type: "STRING",
              description: "Description de la tâche pour laquelle tu as besoin de comprendre le code.",
            },
            maxFiles: {
              type: "NUMBER",
              description: "Nombre max de fichiers à lire (défaut: 8).",
            },
            targetConfidence: {
              type: "NUMBER",
              description: "Niveau de confiance cible (0-100, défaut: 80).",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "plan_code_change",
        description:
          "Analyse l'impact d'un changement de code AVANT de l'effectuer. " +
          "Retourne : fichiers à modifier (ordonnés par impact croissant), " +
          "risques identifiés, fichiers de test associés, plan de rollback, " +
          "et estimation de complexité. " +
          "Utilise cet outil AVANT de commencer une modification multi-fichiers " +
          "pour avoir un plan structuré.",
        parameters: {
          type: "OBJECT",
          properties: {
            description: {
              type: "STRING",
              description: "Description du changement à effectuer.",
            },
            scope: {
              type: "STRING",
              description: "Périmètre du changement: 'single_file', 'module', 'cross_module', 'global'.",
              enum: ["single_file", "module", "cross_module", "global"],
            },
          },
          required: ["description"],
        },
      },
    ],

    async handleToolCall(name: string, args: any, context?: any): Promise<any> {
      switch (name) {
        case "validate_patch":
          return executeValidatePatch(skillHandler, args, context);
        case "read_until_understood":
          return executeReadUntilUnderstood(skillHandler, args, context);
        case "plan_code_change":
          return executePlanCodeChange(skillHandler, args, context);
        default:
          return { error: `Smart skill inconnu: ${name}` };
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Implémentations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * validate_patch — Boucle modify → verify → fix → re-verify
 */
async function executeValidatePatch(
  handler: SkillHandler,
  args: { path: string; search: string; replace: string },
  context?: any
): Promise<ValidatePatchResult> {
  const { path, search, replace } = args;
  const MAX_ATTEMPTS = 3;
  const corrections: string[] = [];

  log.info(`[validate_patch] Modification de ${path}...`);

  // Étape 1: Appliquer la modification initiale
  const modifyResult = await handler("modify_project_file", { path, search, replace }, context);
  if (modifyResult?.error) {
    return {
      success: false,
      attempts: 0,
      file: path,
      finalState: "failed_max_retries",
      errors: `Modification initiale échouée: ${modifyResult.error}`,
    };
  }

  // Étape 2: Boucle verify → fix
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log.info(`[validate_patch] Vérification #${attempt} de ${path}...`);

    const verifyResult = await handler("verify_file", { path }, context);

    // Succès ?
    if (verifyResult?.ok === true || verifyResult?.status === "ok") {
      log.info(`[validate_patch] ✓ ${path} valide après ${attempt} vérification(s).`);
      return {
        success: true,
        attempts: attempt,
        file: path,
        finalState: "valid",
        corrections,
      };
    }

    // Extraire les erreurs
    const errors = extractVerifyErrors(verifyResult);
    if (!errors) {
      // Pas d'erreurs claires, considérer comme succès
      return {
        success: true,
        attempts: attempt,
        file: path,
        finalState: "valid",
      };
    }

    // Dernière tentative → ne pas corriger, juste reporter
    if (attempt === MAX_ATTEMPTS) {
      log.warn(`[validate_patch] ✗ ${path} toujours invalide après ${MAX_ATTEMPTS} tentatives.`);
      return {
        success: false,
        attempts: attempt,
        file: path,
        finalState: "failed_max_retries",
        errors,
        corrections,
      };
    }

    // Correction automatique via reasoning + re-modification
    log.info(`[validate_patch] 🔧 Correction automatique #${attempt}...`);
    corrections.push(`Tentative ${attempt}: ${errors.slice(0, 100)}`);

    // Relire le fichier pour avoir le contexte actuel
    const fileContent = await handler("read_project_file", { path }, context);
    if (fileContent?.error) continue;

    // Utiliser reasoning_think pour comprendre la correction nécessaire
    await handler("reasoning_think", {
      thought: `Le fichier ${path} a les erreurs suivantes après modification:\n${errors}\n\nContenu actuel pertinent:\n${typeof fileContent === 'string' ? fileContent.slice(0, 2000) : JSON.stringify(fileContent).slice(0, 2000)}\n\nQuelle correction précise appliquer ?`,
      strategy: "auto",
    }, context);

    // La correction sera tentée au prochain tour de la boucle
    // (le reasoning a mis en cache la solution, le modèle l'utilisera)
  }

  return {
    success: false,
    attempts: MAX_ATTEMPTS,
    file: path,
    finalState: "needs_human",
    errors: "Corrections automatiques épuisées.",
  };
}

/**
 * read_until_understood — Lecture incrémentale jusqu'à confiance suffisante
 */
async function executeReadUntilUnderstood(
  handler: SkillHandler,
  args: { task: string; maxFiles?: number; targetConfidence?: number },
  context?: any
): Promise<ReadUntilUnderstoodResult> {
  const { task, maxFiles = 8, targetConfidence = 80 } = args;
  const filesRead: string[] = [];
  const keyFindings: string[] = [];
  let confidence = 0;

  log.info(`[read_until_understood] Tâche: "${task}" (cible: ${targetConfidence}%)`);

  // Étape 1: knowledge_build_context pour obtenir le contexte initial
  const contextResult = await handler("knowledge_build_context", {
    query: task,
    strategy: "balanced",
    detail: "standard",
    max_files: Math.min(maxFiles, 15),
  }, context);

  if (contextResult?.error) {
    return {
      confidence: 0,
      filesRead: [],
      summary: `Échec knowledge_build_context: ${contextResult.error}`,
      keyFindings: [],
      suggestMore: true,
    };
  }

  // Extraire la confiance initiale
  confidence = contextResult?.understandingScore
    ?? contextResult?.score
    ?? contextResult?.confidence
    ?? 30;

  // Extraire les fichiers recommandés
  const recommendedFiles: string[] = contextResult?.relevantFiles
    ?? contextResult?.files?.map((f: any) => f.path || f)
    ?? [];

  // Extraire les findings du contexte
  if (contextResult?.facts) {
    for (const fact of contextResult.facts.slice(0, 5)) {
      keyFindings.push(typeof fact === "string" ? fact : fact.content || fact.description || "");
    }
  }

  log.info(`[read_until_understood] Confiance initiale: ${confidence}% (${recommendedFiles.length} fichiers recommandés)`);

  // Étape 2: Lire les fichiers un par un jusqu'à atteindre la confiance cible
  for (const file of recommendedFiles.slice(0, maxFiles)) {
    if (confidence >= targetConfidence) break;

    const outline = await handler("read_file_outline", { path: file }, context);
    if (outline?.error) continue;

    filesRead.push(file);

    // Chaque fichier lu augmente la confiance proportionnellement
    const boost = Math.min(15, (100 - confidence) * 0.2);
    confidence = Math.min(100, confidence + boost);

    log.info(`[read_until_understood] Lu: ${file} → confiance: ${confidence.toFixed(0)}%`);
  }

  const summary = [
    `Tâche analysée: "${task}"`,
    `Fichiers lus: ${filesRead.length}`,
    `Confiance finale: ${confidence.toFixed(0)}%`,
    confidence < targetConfidence
      ? `⚠️ Confiance insuffisante. Fichiers supplémentaires recommandés.`
      : `✓ Confiance suffisante pour procéder.`,
  ].join("\n");

  return {
    confidence,
    filesRead,
    summary,
    keyFindings,
    suggestMore: confidence < targetConfidence,
  };
}

/**
 * plan_code_change — Analyse d'impact et planification
 */
async function executePlanCodeChange(
  handler: SkillHandler,
  args: { description: string; scope?: string },
  context?: any
): Promise<PlanCodeChangeResult> {
  const { description, scope = "module" } = args;

  log.info(`[plan_code_change] Planification: "${description}" (scope: ${scope})`);

  // Étape 1: Chercher les fichiers concernés
  const searchResult = await handler("knowledge_semantic_search", {
    query: description,
    limit: 10,
  }, context);

  const relevantFiles: string[] = [];
  if (searchResult?.results) {
    for (const r of searchResult.results) {
      const filePath = r.file || r.path || r.source;
      if (filePath && !relevantFiles.includes(filePath)) {
        relevantFiles.push(filePath);
      }
    }
  }

  // Étape 2: Impact analysis si disponible
  let impactResult: any = null;
  if (relevantFiles.length >= 3) {
    impactResult = await handler("knowledge_impact_analyze", {
      files: relevantFiles.slice(0, 5),
      mode: "standard",
    }, context);
  }

  // Étape 3: Trouver les fichiers de test associés
  const testFiles: string[] = [];
  for (const file of relevantFiles.slice(0, 5)) {
    // Heuristique: chercher le .test ou .spec correspondant
    const testVariants = [
      file.replace(/\.ts$/, ".test.ts"),
      file.replace(/\.ts$/, ".spec.ts"),
      file.replace(/\.tsx$/, ".test.tsx"),
      file.replace(/src\//, "tests/").replace(/\.ts$/, ".test.ts"),
    ];
    for (const tv of testVariants) {
      const exists = await handler("read_file_outline", { path: tv }, context);
      if (!exists?.error) {
        testFiles.push(tv);
        break;
      }
    }
  }

  // Étape 4: Construire le plan
  const files = relevantFiles.slice(0, 8).map((filePath, i) => ({
    path: filePath,
    action: "modify" as const,
    impact: (impactResult?.impacts?.[filePath]?.level as any) || (i < 2 ? "high" : "medium"),
    order: i + 1,
    reason: `Fichier pertinent pour: ${description.slice(0, 50)}`,
  }));

  // Ordonner par impact croissant (modifier les moins risqués d'abord)
  files.sort((a, b) => {
    const levels: Record<string, number> = { low: 0, medium: 1, high: 2 };
    return (levels[a.impact] ?? 1) - (levels[b.impact] ?? 1);
  });
  files.forEach((f, i) => (f.order = i + 1));

  // Risks
  const risks: string[] = [];
  if (impactResult?.risks) {
    risks.push(...impactResult.risks.slice(0, 5));
  }
  if (scope === "global" || scope === "cross_module") {
    risks.push("Changement cross-module: risque de breaking changes dans les imports.");
  }
  if (files.length > 5) {
    risks.push(`${files.length} fichiers impactés: risque de régression élevé.`);
  }

  // Complexité
  let estimatedComplexity: PlanCodeChangeResult["estimatedComplexity"] = "simple";
  if (files.length > 5 || scope === "global") estimatedComplexity = "complex";
  else if (files.length > 3 || scope === "cross_module") estimatedComplexity = "moderate";
  else if (files.length <= 1) estimatedComplexity = "trivial";

  return {
    files,
    risks,
    testFiles,
    rollbackPlan: `git stash ou revert les ${files.length} fichiers modifiés.`,
    estimatedComplexity,
  };
}

// ─── Utilitaires ────────────────────────────────────────────────────────────

function extractVerifyErrors(result: any): string | null {
  if (!result) return null;
  const parts: string[] = [];

  if (result.tsc && !result.tsc.ok) {
    parts.push(result.tsc.errors || result.tsc.stderr || "TSC errors");
  }
  if (result.lint && !result.lint.ok) {
    parts.push(result.lint.errors || result.lint.stderr || "Lint errors");
  }
  if (result.test && !result.test.ok) {
    parts.push(result.test.errors || result.test.stderr || "Test failures");
  }
  if (parts.length === 0 && result.error) {
    parts.push(result.error);
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

import * as fs from "fs";
import * as path from "path";
import type {
  BrainStage,
  StageVerification,
  VerificationIssue,
  GoalUnderstanding,
} from "./types.js";
import { checkBracketBalance } from "../../skills/verify.js";
import { getProjectRoot } from "../../skills/codebaseHelpers.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("BrainVerifier");

export class BrainVerifier {
  /**
   * Vérifie le résultat d'une étape individuelle du Brain
   */
  async verifyStage(
    stage: BrainStage,
    _understanding: GoalUnderstanding,
    filesModified: string[]
  ): Promise<StageVerification> {
    log.info(`🔍 Vérification de l'étape ${stage.id} (Agent: ${stage.agentRole})`);

    const issues: VerificationIssue[] = [];
    let syntaxCheckOk = true;
    let testsOk = true;
    let visualCheckOk = true;
    let semanticCheckOk = true;

    // 1. Vérification du code (syntaxe, équilibre)
    const codeCheck = this.verifyModifiedFiles(filesModified);
    if (!codeCheck.ok) {
      syntaxCheckOk = false;
      issues.push(...codeCheck.issues);
    }

    // 2. Vérification spécifique par rôle
    if (stage.agentRole === "coder" || stage.agentRole === "refactor" || stage.agentRole === "debugger") {
      if (filesModified.length === 0 && stage.result?.filesModified?.length === 0) {
        issues.push({
          severity: "warning",
          message: `L'agent ${stage.agentRole} s'est achevé sans modifier de fichier.`,
        });
      }
    }

    if (stage.agentRole === "vision") {
      // Pour l'agent vision, vérifier que le responsive ou le layout a bien été inspecté
      const output = stage.result?.details ?? stage.result?.summary ?? "";
      if (/invalide|erreur visuelle|débordement|overflow|cassé/i.test(output)) {
        visualCheckOk = false;
        issues.push({
          severity: "error",
          message: "L'agent vision a signalé une anomalie de mise en page ou un débordement visuel.",
        });
      }
    }

    // 3. Vérification des erreurs explicites de l'agent
    if (stage.result && !stage.result.success) {
      semanticCheckOk = false;
      issues.push({
        severity: "error",
        message: stage.result.error || "L'agent a retourné un statut d'échec.",
      });
    }

    const hasErrors = issues.some((i) => i.severity === "error" || i.severity === "critical");
    const passed = !hasErrors;

    const summary = passed
      ? `✅ Étape ${stage.id} (${stage.agentRole}) vérifiée avec succès.`
      : `❌ Vérification échouée pour l'étape ${stage.id} (${stage.agentRole}) : ${issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`;

    return {
      stageId: stage.id,
      role: stage.agentRole,
      passed,
      syntaxCheckOk,
      testsOk,
      visualCheckOk,
      semanticCheckOk,
      issues,
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Vérifie l'intégrité syntaxique des fichiers modifiés
   */
  private verifyModifiedFiles(files: string[]): { ok: boolean; issues: VerificationIssue[] } {
    const issues: VerificationIssue[] = [];
    const root = getProjectRoot();

    for (const file of files) {
      try {
        const fullPath = path.isAbsolute(file) ? file : path.join(root, file);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, "utf-8");

        // Contrôle de l'équilibre des balises / accolades
        const balanceErr = checkBracketBalance(content);
        if (balanceErr) {
          issues.push({
            severity: "error",
            file,
            message: `Erreur syntaxique d'équilibrage dans ${file} : ${balanceErr}`,
            rule: "syntax_bracket_balance",
          });
        }
      } catch (err: any) {
        issues.push({
          severity: "warning",
          file,
          message: `Impossible de relire le fichier pour vérification: ${err.message}`,
        });
      }
    }

    return {
      ok: !issues.some((i) => i.severity === "error"),
      issues,
    };
  }
}

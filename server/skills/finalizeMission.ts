import { Skill, validateArgs } from "./base.js";
import { z } from "zod";

/**
 * Skill `finalize_mission` — Couche 1 : déclaration d'outil (schema + handler).
 *
 * Rôle : clôturer une mission en soumettant la synthèse finale et les preuves
 * de vérification sur les 4 niveaux requis.
 *
 * IMPORTANT : ce tool n'est PAS un commit Git. La synchronisation
 * sandbox→workspace est un mécanisme runtime distinct, validé par l'utilisateur.
 * Ce handler se contente de tracer la clôture et les preuves (audit trail).
 *
 * Le protocole d'usage est dans :
 *   server/runtime/prompts/autonomy.md (§8 mission_closure)
 * L'invariant d'application est dans :
 *   server/runtime/prompts/rules/core.ts (procedure.finalize-requires-verification)
 */

const verificationSchema = z.object({
  integrity: z
    .boolean()
    .describe("verify_file (SHA-256) a réussi."),
  compilation: z
    .boolean()
    .describe("verify_typecheck a réussi (0 erreur)."),
  tests: z
    .boolean()
    .describe("verify_run_script({ script: 'test' }) a réussi."),
  behavior: z
    .boolean()
    .describe("Comportement observable validé."),
});

const finalizeMissionInputSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(80)
    .describe("Titre court de la mission (5-80 caractères)."),
  summary: z
    .string()
    .min(1)
    .describe(
      "Synthèse factuelle en 3 phrases maximum : ce qui a changé, où, pourquoi.",
    ),
  files_changed: z
    .array(z.string())
    .min(1, "Au moins un fichier modifié doit être listé.")
    .describe("Liste des chemins relatifs des fichiers modifiés dans la sandbox."),
  verification: verificationSchema,
  next_step: z
    .string()
    .optional()
    .describe(
      "Optionnel. Une seule prochaine étape concrète proposée à l'utilisateur, " +
        "tirée du contexte réel. Omettre si la mission est close ou si rien de pertinent ne s'impose.",
    ),
});

export const finalizeMissionSkill: Skill = {
  name: "finalize_mission",
  permissions: ["read"],
  declarations: [
    {
      name: "finalize_mission",
      description:
        "Clôture une mission en soumettant la synthèse finale et les preuves de vérification. " +
        "À appeler UNIQUEMENT après que TOUTES les vérifications (intégrité, compilation, tests, comportement) " +
        "ont passé. Ne JAMAIS appeler si une vérification est en échec ou non exécutée. " +
        "Ne PAS appeler pour une question informationnelle.",
      parameters: {
        type: "OBJECT",
        properties: {
          title: {
            type: "STRING",
            description: "Titre court de la mission (5-80 caractères).",
          },
          summary: {
            type: "STRING",
            description:
              "Synthèse factuelle en 3 phrases maximum : ce qui a changé, où, pourquoi.",
          },
          files_changed: {
            type: "ARRAY",
            items: { type: "STRING" },
            description:
              "Liste des chemins relatifs des fichiers modifiés dans la sandbox.",
          },
          verification: {
            type: "OBJECT",
            description: "État des 4 niveaux de vérification.",
            properties: {
              integrity: {
                type: "BOOLEAN",
                description: "verify_file (SHA-256) a réussi.",
              },
              compilation: {
                type: "BOOLEAN",
                description: "verify_typecheck a réussi (0 erreur).",
              },
              tests: {
                type: "BOOLEAN",
                description:
                  "verify_run_script({ script: 'test' }) a réussi.",
              },
              behavior: {
                type: "BOOLEAN",
                description: "Comportement observable validé.",
              },
            },
            required: ["integrity", "compilation", "tests", "behavior"],
          },
          next_step: {
            type: "STRING",
            description:
              "Optionnel. Une seule prochaine étape concrète proposée à l'utilisateur.",
          },
        },
        required: ["title", "summary", "files_changed", "verification"],
      },
    },
  ],
  inputSchemas: {
    finalize_mission: finalizeMissionInputSchema,
  },
  handleToolCall: async (name, args) => {
    if (name === "finalize_mission") {
      const validated = validateArgs(
        finalizeMissionSkill.inputSchemas!["finalize_mission"],
        args,
      );

      // Défense en profondeur : refuser la clôture si un niveau est à false.
      // Le prompt (rules/core.ts) est la première barrière, le handler est la seconde.
      const { integrity, compilation, tests, behavior } = validated.verification;
      const failedLevels: string[] = [];
      if (!integrity) failedLevels.push("intégrité");
      if (!compilation) failedLevels.push("compilation");
      if (!tests) failedLevels.push("tests");
      if (!behavior) failedLevels.push("comportement");

      if (failedLevels.length > 0) {
        return {
          ok: false,
          error:
            `Clôture refusée — niveaux de vérification non validés : ${failedLevels.join(", ")}. ` +
            "Retourner en phase RECOVER avant d'appeler finalize_mission.",
          failedLevels,
        };
      }

      const timestamp = new Date().toISOString();
      console.log(
        `[finalize_mission] Mission clôturée à ${timestamp} — "${validated.title}"`,
      );

      return {
        ok: true,
        timestamp,
        title: validated.title,
        summary: validated.summary,
        files_changed: validated.files_changed,
        verification: validated.verification,
        ...(validated.next_step ? { next_step: validated.next_step } : {}),
        message:
          "Mission clôturée avec succès. Les modifications restent en sandbox jusqu'à synchronisation.",
      };
    }
    return undefined;
  },
};

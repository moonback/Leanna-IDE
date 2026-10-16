import { Skill, validateArgs } from "./base.js";
import { z } from "zod";

/**
 * Skill `set_plan` — Couche 1 : déclaration d'outil (schema + handler).
 *
 * Rôle : déclarer ou réviser le plan d'exécution d'une mission complexe.
 * Le handler trace le plan dans la console (télémétrie légère) et le retourne
 * pour que le runtime puisse l'horodater côté session si besoin.
 *
 * Ce fichier ne contient que le schéma et le comportement observable.
 * Le protocole d'usage (quand/pourquoi/préconditions) est dans :
 *   server/runtime/prompts/planning.md
 * L'invariant d'application est dans :
 *   server/runtime/prompts/rules/core.ts (procedure.plan-declaration)
 */

const setPlanInputSchema = z.object({
  plan: z
    .string()
    .min(1, "Le plan ne peut pas être vide.")
    .describe(
      "Plan au format Markdown : liste numérotée d'étapes. " +
        "Chaque étape décrit les fichiers cibles et un critère de succès observable.",
    ),
});

export const setPlanSkill: Skill = {
  name: "set_plan",
  permissions: ["read"],
  declarations: [
    {
      name: "set_plan",
      description:
        "Déclare ou met à jour le plan d'exécution d'une mission complexe. " +
        "À appeler après l'exploration initiale et AVANT la première modification. " +
        "À rappeler à chaque changement de périmètre (nouveau besoin, dépendance inattendue, échec de vérification). " +
        "Ne PAS appeler pour une tâche triviale ou une simple question.",
      parameters: {
        type: "OBJECT",
        properties: {
          plan: {
            type: "STRING",
            description:
              "Plan Markdown en liste numérotée. Chaque étape indique : action, fichiers cibles, critère de succès observable.",
          },
        },
        required: ["plan"],
      },
    },
  ],
  inputSchemas: {
    set_plan: setPlanInputSchema,
  },
  handleToolCall: async (name, args) => {
    if (name === "set_plan") {
      const validated = validateArgs(setPlanSkill.inputSchemas!["set_plan"], args);

      const timestamp = new Date().toISOString();
      console.log(`[set_plan] Plan déclaré à ${timestamp} :\n${validated.plan}`);

      return {
        ok: true,
        timestamp,
        plan: validated.plan,
        message: "Plan enregistré. Procéder aux actions décrites dans l'ordre.",
      };
    }
    return undefined;
  },
};

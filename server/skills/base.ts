import { z } from "zod";

export interface Skill {
  name: string;
  declarations: any[]; // Déclarations des outils pour l'IA
  inputSchemas?: Record<string, z.ZodType<any>>; // Schémas de validation optionnels pour chaque outil
  handleToolCall: (name: string, args: any, context?: any) => Promise<any> | any;
}

/**
 * Valide les arguments d'un appel d'outil en conservant le type de sortie du schéma.
 */
export function validateArgs<T extends z.ZodType<any, any, any>>(
  schema: T,
  args: unknown
): z.output<T> {
  try {
    return schema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Erreur de validation des paramètres : ${error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`);
    }
    throw error;
  }
}

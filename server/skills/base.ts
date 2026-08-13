import { z } from "zod";

export interface Skill {
  name: string;
  declarations: any[]; // Déclarations des outils pour l'IA
  inputSchemas?: Record<string, z.ZodSchema>; // Schémas de validation optionnels pour chaque outil
  handleToolCall: (name: string, args: any, context?: any) => Promise<any> | any;
}

/**
 * Valide les arguments d'un appel d'outil en utilisant le schéma fourni.
 */
export function validateArgs<T>(schema: z.ZodSchema<T>, args: any): T {
  try {
    return schema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Erreur de validation des paramètres : ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

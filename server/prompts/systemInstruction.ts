/**
 * System Instruction — Point d'entrée de la construction du prompt système
 * 
 * Ce fichier est un pont vers le nouveau SystemPromptBuilder (server/runtime/prompts/).
 * Il conserve l'interface publique exacte pour la compatibilité avec server.ts et les routes.
 * 
 * Anciennement : 12 fichiers d'instructions assemblés ici.
 * Maintenant : délègue au SystemPromptBuilder qui utilise des fichiers .md.
 */

import { SystemPromptBuilder } from "../runtime/prompts/SystemPromptBuilder";
import type { ProfileConfig } from "./promptConfig";

export type { ProfileConfig };

// buildLifeInstruction est maintenant un no-op (le contenu est dans base.md)
export function buildLifeInstruction(): string {
  return "";
}

const builder = new SystemPromptBuilder();

/**
 * Construit le prompt système complet.
 * Interface identique à l'ancienne — drop-in replacement.
 */
export function buildSystemInstruction(profile: ProfileConfig = {}): string {
  return builder.build({
    aiName: profile.aiName,
    userName: profile.userName,
    userRole: profile.userRole,
    language: profile.language,
    responseStyle: profile.responseStyle,
    compact: profile.compactPrompt,
    mode: profile.mode,
    agents: profile.agents,
  });
}

export const JARVIS_SYSTEM_INSTRUCTION = buildSystemInstruction();

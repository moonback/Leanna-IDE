/**
 * Index des exports du module runtime/prompts
 * 
 * Ce fichier centralise tous les exports publics du système de prompts.
 * Utilisez ce fichier pour importer les types, builders et utilitaires de prompts.
 */

// Types et interfaces
export type {
  // Types de base
  ResponseStyle,
  Language,
  AssistantMode,
  PromptProfile,
  AgentRole,
  
  // Interfaces
  AgentsConfig,
  ProfileConfig,
  SystemPromptConfig,
} from "./types";

export {
  // Mappings
  LANG_INSTRUCTIONS,
  STYLE_INSTRUCTIONS,
  LANG_INSTRUCTIONS_FR,
  STYLE_INSTRUCTIONS_FR,
  
  // Informations sur les agents
  AGENT_ROLES_INFO,
  ALL_AGENT_ROLES,
} from "./types";

// Builder
export { SystemPromptBuilder, getSystemPromptBuilder, buildSystemInstructionV3 } from "./SystemPromptBuilder";

// Loader
export { loadPromptTemplates, buildSystemPrompt } from "./loader";

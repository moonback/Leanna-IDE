/**
 * Types et configurations partagés pour le système de prompts
 * 
 * Ce fichier centralise tous les types, interfaces et mappings utilisés
 * par les deux systèmes de prompts (server/prompts/ et server/runtime/prompts/)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types de base
// ═══════════════════════════════════════════════════════════════════════════════

export type ResponseStyle = "concise" | "balanced" | "detailed";
export type Language = "fr" | "en" | "es" | "de" | "pt";
export type AssistantMode = "full" | "ask";
export type PromptProfile = "Leanna-agent-v2";

// Rôles des agents - liste complète et unique
export type AgentRole =
  | "coder"
  | "refactor"
  | "debugger"
  | "reviewer"
  | "tester"
  | "security"
  | "architect"
  | "writer"
  | "formatter"
  | "researcher"
  | "proofreader"
  | "translator"
  | "summarizer"
  | "planner";

// ═══════════════════════════════════════════════════════════════════════════════
// Mappings de langue et style
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Instructions de langue pour le prompt système (format anglais)
 * Utilisé pour indiquer au modèle dans quelle langue répondre
 */
export const LANG_INSTRUCTIONS: Record<Language, string> = {
  fr: "Respond exclusively in French.",
  en: "Respond exclusively in English.",
  es: "Respond exclusively in Spanish.",
  de: "Respond exclusively in German.",
  pt: "Respond exclusively in Portuguese.",
};

/**
 * Instructions de style pour le prompt système
 * Utilisé pour contrôler la verbosité des réponses
 */
export const STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  concise: "Be ultra-concise. 1 to 3 sentences unless explicitly requested.",
  balanced: "Adapt length to complexity. Short for the simple, structured for the complex.",
  detailed: "Detailed and structured responses with lists, headings and examples.",
};

/**
 * Mappings de langue pour le footer du prompt (format français)
 * Utilisé dans SystemPromptBuilder pour le footer
 */
export const LANG_INSTRUCTIONS_FR: Record<Exclude<Language, "fr">, string> = {
  en: "Respond exclusively in English.",
  es: "Respond exclusively in Spanish.",
  de: "Respond exclusively in German.",
  pt: "Respond exclusively in Portuguese.",
};

/**
 * Mappings de style pour le footer du prompt (format français)
 * Utilisé dans SystemPromptBuilder pour le footer
 */
export const STYLE_INSTRUCTIONS_FR: Record<ResponseStyle, string> = {
  concise: "Sois ultra-concis. 1 à 3 phrases sauf demande explicite.",
  balanced: "Adapte la longueur à la complexité.",
  detailed: "Réponses détaillées et structurées avec listes et exemples.",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration des agents
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration du système multi-agents
 */
export interface AgentsConfig {
  /** Désactiver complètement le système multi-agents (l'assistant agit seul) */
  enabled: boolean;
  /** Liste des rôles autorisés. Si vide/undefined et enabled=true, tous sont actifs */
  allowedRoles?: AgentRole[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration du profil
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProfileConfig {
  userName?: string;
  userRole?: string;
  aiName?: string;
  aiVoice?: string;
  duoName?: string;
  duoRole?: string;
  language?: Language;
  responseStyle?: ResponseStyle;
  workspace?: string;
  mode?: AssistantMode;
  temperature?: number;
  topP?: number;
  textProvider?: 'gemini' | 'openrouter';
  openrouterModel?: string;
  openrouterApiKey?: string;
  /** Enable compact system prompt to save tokens */
  compactPrompt?: boolean;
  /** System prompt behavior profile. Current version: Leanna-agent-v2 */
  promptProfile?: PromptProfile;
  /** Configuration du système multi-agents */
  agents?: AgentsConfig;
  /** Désactiver le raisonnement structuré (Chain of Thought, etc.) */
  reasoningEnabled?: boolean;
  /** Désactiver les annonces vocales TTS pendant le raisonnement */
  /** Custom system prompt (appended to base instructions) */
  customSystemPrompt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types pour SystemPromptBuilder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration pour le SystemPromptBuilder
 * Aligné sur ProfileConfig pour la compatibilité
 */
export interface SystemPromptConfig {
  /** Nom de l'assistant */
  aiName?: string;
  /** Nom de l'utilisateur */
  userName?: string;
  /** Rôle de l'utilisateur */
  userRole?: string;
  /** Langue de réponse */
  language?: Language;
  /** Style de réponse */
  responseStyle?: ResponseStyle;
  /** Mode compact (économie de tokens) */
  compact?: boolean;
  /** Mode de session : 'full' (agent) ou 'ask' (chat/Q&A documentaire) */
  mode?: AssistantMode;
  /** Configuration des agents (enabled/disabled + rôles autorisés) */
  agents?: AgentsConfig;
  /** Sections à exclure du prompt */
  excludeSections?: string[];
  /** Sections additionnelles à inclure */
  extraSections?: Array<{ id: string; content: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Informations sur les rôles des agents
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Informations détaillées sur chaque rôle d'agent
 * Utilisé pour générer les tableaux de délégation dans le prompt
 */
export const AGENT_ROLES_INFO: Record<AgentRole, { description: string; write: boolean; category: string }> = {
  // Code & Ingénierie logicielle
  coder:       { description: "Implémentation de fonctionnalités, écriture et modification de code propre", write: true, category: "Code" },
  refactor:    { description: "Restructuration, Clean Code, réduction de dette technique et découpage", write: true, category: "Code" },
  debugger:    { description: "Diagnostic d'erreurs/stacktraces, root-cause et patches correctifs ciblés", write: true, category: "Code" },
  reviewer:    { description: "Revue de code, audit de qualité, détection d'anti-patterns et standards", write: false, category: "Code" },
  tester:      { description: "Conception et écriture de tests automatisés (unitaires, intégration)", write: true, category: "Code" },
  security:    { description: "Audit de sécurité applicative, vulnérabilités OWASP et secrets", write: false, category: "Code" },
  architect:   { description: "Conception logicielle, modélisation de données, contrats et modules", write: true, category: "Code" },
  // Rédaction & Documentation
  writer:      { description: "Rédaction de documents (README, guides, articles, rapports)", write: true, category: "Docs" },
  formatter:   { description: "Mise en forme et formatage Markdown", write: true, category: "Docs" },
  researcher:  { description: "Recherche et collecte d'informations", write: false, category: "Docs" },
  proofreader: { description: "Correction orthographique, grammaticale et stylistique", write: true, category: "Docs" },
  translator:  { description: "Traduction et localisation multilingue", write: true, category: "Docs" },
  summarizer:  { description: "Résumés et synthèses condensées", write: true, category: "Docs" },
  planner:     { description: "Plans et structures de documents", write: false, category: "Docs" },
};

/**
 * Liste complète des rôles d'agents pour référence
 */
export const ALL_AGENT_ROLES: AgentRole[] = [
  "coder",
  "refactor",
  "debugger",
  "reviewer",
  "tester",
  "security",
  "architect",
  "writer",
  "formatter",
  "researcher",
  "proofreader",
  "translator",
  "summarizer",
  "planner",
];

// ═══════════════════════════════════════════════════════════════════════════════
// Ré-exports pour compatibilité
// ═══════════════════════════════════════════════════════════════════════════════

export type { ProfileConfig as ProfileConfigType };
export type { AgentsConfig as AgentsConfigType };

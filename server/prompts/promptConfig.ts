export type ResponseStyle = "concise" | "balanced" | "detailed";
export type Language = "fr" | "en" | "es" | "de" | "pt";
export type AssistantMode = "full" | "ask";
export type PromptProfile = "jarvis-agent-v2";
export type AgentRole = "writer" | "formatter" | "researcher" | "proofreader" | "translator" | "summarizer" | "planner";

export interface AgentsConfig {
  /** Désactiver complètement le système multi-agents (l'assistant agit seul) */
  enabled: boolean;
  /** Liste des rôles autorisés. Si vide/undefined et enabled=true, tous sont actifs */
  allowedRoles?: AgentRole[];
}

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
  /** System prompt behavior profile. Current version: jarvis-agent-v2 */
  promptProfile?: PromptProfile;
  /** Configuration du système multi-agents */
  agents?: AgentsConfig;
  /** Désactiver le raisonnement structuré (Chain of Thought, etc.) */
  reasoningEnabled?: boolean;
  /** Custom system prompt (appended to base instructions) */
  customSystemPrompt?: string;
}

export const STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  concise:  "Be ultra-concise. 1 to 3 sentences unless explicitly requested.",
  balanced: "Adapt length to complexity. Short for the simple, structured for the complex.",
  detailed: "Detailed and structured responses with lists, headings and examples.",
};

export const LANG_INSTRUCTIONS: Record<Language, string> = {
  fr: "Respond exclusively in French.",
  en: "Respond exclusively in English.",
  es: "Respond exclusively in Spanish.",
  de: "Respond exclusively in German.",
  pt: "Respond exclusively in Portuguese.",
};

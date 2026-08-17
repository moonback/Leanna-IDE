import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResponseStyle = 'concise' | 'balanced' | 'detailed';
export type Language      = 'fr' | 'en' | 'es' | 'de' | 'pt';
export type AIProvider    = 'gemini' | 'openrouter';
export type AgentRole     = 'coder' | 'test' | 'docs' | 'refactor' | 'security' | 'review' | 'architect';

export interface AgentsConfig {
  enabled: boolean;
  allowedRoles: AgentRole[];
}

export interface UserProfile {
  // User identity
  userName:      string;   // Prénom de l'utilisateur (ex: "Mayss")
  userRole:      string;   // Ex: "développeur full-stack"
  // AI identity
  aiName:        string;   // Nom de l'IA (ex: "Leanna")
  aiVoice:       string;   // Voix Gemini Live (ex: "Aoede")
  // Behaviour
  language:      Language;
  responseStyle: ResponseStyle;
  // Auto Mute
  autoMuteEnabled: boolean;   // Activer le mode muet automatique
  autoMuteTimeout: number;    // Délai en secondes avant muet auto (5-300)
  // Model hyperparameters
  temperature:      number;  // 0.0–2.0, contrôle la créativité
  topP:             number;  // 0.0–1.0, nucleus sampling
  // Multi-model configuration
  textProvider:     AIProvider;   // Provider pour le texte/chat (gemini ou openrouter)
  openrouterModel:  string;       // Modèle OpenRouter sélectionné
  openrouterApiKey: string;       // Clé API OpenRouter (stockée localement)
  // Appearance (kept here so Settings is the single source of truth)
  theme:         'dark' | 'light';
  accentColor:   string;
  // UI features
  floatingOrb:   boolean;  // Afficher l'orb flottant déplaçable
  // Token optimization
  compactPrompt: boolean;  // Utiliser le system prompt compact (−40% tokens)
  // Agent system
  agents:        AgentsConfig;  // Configuration du système multi-agents
  // Git
  gitEnabled:    boolean;  // Activer/désactiver les opérations git
  // Reasoning
  reasoningEnabled: boolean;  // Activer/désactiver le raisonnement structuré (CoT, etc.)
  // Custom system prompt
  customSystemPrompt: string;  // Prompt système personnalisé (ajouté au prompt de base)
}

const STORAGE_KEY = 'jarvis_user_profile';

const DEFAULT_PROFILE: UserProfile = {
  userName:      '',
  userRole:      '',
  aiName:        'Leanna',
  aiVoice:       'Aoede',
  language:      'fr',
  responseStyle: 'balanced',
  // Auto Mute
  autoMuteEnabled: true,   // Activé par défaut
  autoMuteTimeout: 40,     // 40 secondes par défaut
  // Model hyperparameters
  temperature:      0.9,
  topP:             0.95,
  textProvider:     'gemini',
  openrouterModel:  'google/gemini-2.5-flash',
  openrouterApiKey: '',
  theme:         'light',
  accentColor:   '#0ea5e9',
  floatingOrb:   false,
  compactPrompt: true,
  // Agents
  agents: {
    enabled: true,
    allowedRoles: ['coder', 'test', 'docs', 'refactor', 'security', 'review', 'architect'],
  },
  // Git
  gitEnabled: true,
  // Reasoning
  reasoningEnabled: true,
  // Custom system prompt
  customSystemPrompt: '',
};

function load(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PROFILE };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ProfileContextValue {
  profile: UserProfile;
  setField: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => void;
  save: () => void;
  reset: () => void;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: DEFAULT_PROFILE,
  setField: () => {},
  save: () => {},
  reset: () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(load);

  // Apply accent & theme on mount and on change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', profile.theme);
    document.documentElement.style.setProperty('--accent-primary', profile.accentColor);
  }, [profile.theme, profile.accentColor]);

  const setField = useCallback(<K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    // No need to call setProfile here as we're just saving to localStorage
  }, [profile]);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile({ ...DEFAULT_PROFILE });
  }, []);

  const value = useMemo(() => ({ 
    profile, 
    setField, 
    save, 
    reset 
  }), [profile, setField, save, reset]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

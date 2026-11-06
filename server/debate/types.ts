export type DebateProvider = 'gemini' | 'openrouter';

export interface RoxaneAIConfig {
  enabled: boolean;
  name: string;
  provider: DebateProvider;
  model: string;
  voice: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  language: string;
  responseStyle: 'concise' | 'balanced' | 'detailed';
  contradictionLevel: number;
  useSpeech: boolean;
  maxRounds: number;
  maxDurationSeconds: number;
  autoCreateTasks: boolean;
}

export interface DebateTurn {
  id: string;
  speaker: 'leanna' | 'roxane' | 'user';
  text: string;
  round: number;
  createdAt: string;
}

export interface DebateRunRequest {
  topic: string;
  context?: string;
  rounds?: number;
}

export const DEFAULT_ROXANE_CONFIG: RoxaneAIConfig = {
  enabled: true,
  name: 'Roxane',
  provider: 'gemini',
  model: 'gemini-3.8-live',
  voice: 'Kore',
  systemPrompt: "Tu es Roxane, une analyste indépendante, exigeante et constructive. Tu examines les hypothèses, cherches les angles morts, compares les alternatives et contestes les propositions insuffisamment justifiées. Tu ne contredis pas artificiellement : reconnais clairement les bons arguments. Réponds en français, à l'oral, de manière naturelle et concise. Ne prétends jamais avoir vérifié un fait ou un fichier sans preuve.",
  temperature: 0.75,
  topP: 0.9,
  maxTokens: 1200,
  language: 'fr',
  responseStyle: 'balanced',
  contradictionLevel: 80,
  useSpeech: true,
  maxRounds: 3,
  maxDurationSeconds: 600,
  autoCreateTasks: false,
};

export function normalizeRoxaneConfig(value: unknown): RoxaneAIConfig {
  const raw = value && typeof value === 'object' ? value as Partial<RoxaneAIConfig> : {};
  const base = DEFAULT_ROXANE_CONFIG;
  const bounded = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return {
    ...base,
    ...raw,
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) || base.name : base.name,
    provider: raw.provider === 'openrouter' ? 'openrouter' : 'gemini',
    model: typeof raw.model === 'string' ? raw.model.trim().slice(0, 160) || base.model : base.model,
    voice: typeof raw.voice === 'string' ? raw.voice.trim().slice(0, 80) || base.voice : base.voice,
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt.slice(0, 12000) : base.systemPrompt,
    temperature: bounded(raw.temperature, base.temperature, 0, 2),
    topP: bounded(raw.topP, base.topP, 0, 1),
    maxTokens: Math.round(bounded(raw.maxTokens, base.maxTokens, 128, 8192)),
    contradictionLevel: Math.round(bounded(raw.contradictionLevel, base.contradictionLevel, 0, 100)),
    maxRounds: Math.round(bounded(raw.maxRounds, base.maxRounds, 1, 8)),
    maxDurationSeconds: Math.round(bounded(raw.maxDurationSeconds, base.maxDurationSeconds, 60, 1800)),
    enabled: raw.enabled !== false,
    useSpeech: raw.useSpeech !== false,
    autoCreateTasks: raw.autoCreateTasks === true,
    language: typeof raw.language === 'string' ? raw.language.slice(0, 12) : base.language,
    responseStyle: raw.responseStyle === 'concise' || raw.responseStyle === 'detailed' ? raw.responseStyle : 'balanced',
  };
}

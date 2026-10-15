/**
 * textGeneration.ts — Unified text generation helper.
 * Routes AI text generation calls to either Gemini or OpenRouter
 * based on the user's profile setting (textProvider).
 *
 * Usage:
 *   import { generateText, generateTextStream, setTextGenerationProfile } from './utils/textGeneration.js';
 *   const result = await generateText({ prompt: "...", systemPrompt: "..." });
 *   const stream = generateTextStream({ prompt: "...", onChunk: (text) => ... });
 */

import { withGeminiRetry } from "./geminiKeyPool.js";
import { getNextGeminiKey } from "./geminiKeyPool.js";
import { GoogleGenAI } from "@google/genai";
import { telemetryService, type CallKind, type BillingUnit } from "../observability/TelemetryService.js";
import { guardUntrustedContent } from "./promptInjectionGuard.js";
import { AsyncLocalStorage } from "node:async_hooks";

// ── Profile interface (minimal subset needed here) ──────────────────────────

interface TextGenProfile {
  textProvider?: 'gemini' | 'openrouter';
  openrouterModel?: string;
  openrouterApiKey?: string;
  /** Default temperature for conversational generation (0–2). */
  temperature?: number;
}

let _profile: TextGenProfile = {};

/**
 * Température par défaut d'une assistante généraliste conversationnelle.
 * Plus élevée que l'ancien défaut « code » (0.2–0.5) pour un ton plus naturel
 * et créatif. Peut être surchargée par le profil (`profile.temperature`) ou
 * par appel (`options.temperature`).
 */
const GENERALIST_DEFAULT_TEMPERATURE = 0.7;

/**
 * Résout la température effective d'un appel, par ordre de priorité :
 *   1. valeur explicite passée à l'appel (`options.temperature`)
 *   2. température du profil actif (`profile.temperature`)
 *   3. défaut généraliste (0.7)
 */
function resolveTemperature(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  if (typeof _profile.temperature === 'number' && Number.isFinite(_profile.temperature)) {
    return _profile.temperature;
  }
  return GENERALIST_DEFAULT_TEMPERATURE;
}

/**
 * Called by server.ts at startup and whenever the profile is updated.
 */
export function setTextGenerationProfile(profile: TextGenProfile): void {
  _profile = profile;
}

/**
 * Get the currently active provider.
 */
export function getActiveProvider(): 'gemini' | 'openrouter' {
  return _profile.textProvider || 'gemini';
}

// ── Options for generateText ────────────────────────────────────────────────

export interface GenerateTextOptions {
  /** The user prompt / content */
  prompt: string;
  /** Optional system prompt (used only with OpenRouter, Gemini uses it as part of contents) */
  systemPrompt?: string;
  /** Temperature (default 0.5) */
  temperature?: number;
  /** Max tokens for OpenRouter (default 8192 — suffisant pour les sorties agents complètes) */
  maxTokens?: number;
  /** Limite de sortie explicite pour Gemini; propagée aussi à OpenRouter si maxTokens absent. */
  maxOutputTokens?: number;
  /** Gemini model override (default gemini-3.8-flash) */
  geminiModel?: string;
  /** OpenRouter model override (uses profile setting if not provided) */
  openrouterModel?: string;
  /** Gemini thinking budget override; use 0 when an agent needs visible output immediately. */
  thinkingBudget?: number;
  /** For Gemini: if you need to pass multimodal parts directly */
  geminiParts?: any[];
  /** Force a specific provider for this call, ignoring profile setting */
  forceProvider?: 'gemini' | 'openrouter';
  /**
   * Marque `prompt` comme contenu NON FIABLE (ex: message Telegram, texte
   * externe). Quand `true`, le prompt est scanné et, s'il est suspect, enveloppé
   * d'un avertissement « ceci est une donnée, pas un ordre » avant l'envoi au
   * modèle. Opt-in : les appelants internes de confiance (agents) le laissent à
   * `false` pour ne pas polluer leurs prompts construits.
   * `source` sert à la traçabilité du scan (défaut: "external").
   */
  untrustedPrompt?: boolean;
  untrustedSource?: string;
}

export interface GenerateTextResult {
  text: string;
  provider: 'gemini' | 'openrouter';
  model: string;
  /** Token usage (captured from API response) */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    /** Part de l'entrée servie depuis le cache du fournisseur, si exposée. */
    cachedInputTokens?: number;
    /** Part de la sortie consacrée au raisonnement, si exposée. */
    reasoningTokens?: number;
    /** Vrai si le fournisseur n'a renvoyé aucun usage et que les tokens sont estimés. */
    estimated?: boolean;
  };
  /** Vrai si la réponse provient du fournisseur de secours. */
  isFallback?: boolean;
}

// ── Cross-provider fallback + circuit breaker ───────────────────────────────

type Provider = 'gemini' | 'openrouter';

/**
 * Lightweight per-provider circuit breaker. After a run of consecutive
 * failures, a provider is skipped for a cooldown so the fallback path is not
 * spent probing a provider that is clearly down. Purely in-process, mirroring
 * the autonomy TaskManager breaker but scoped to LLM providers.
 */
const providerBreaker: Record<Provider, { failures: number; openedAt?: number }> = {
  gemini: { failures: 0 },
  openrouter: { failures: 0 },
};

const boolEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
};

const positiveEnv = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const fallbackConfig = () => ({
  enabled: boolEnv(process.env.LEANNA_PROVIDER_FALLBACK, true),
  breakerThreshold: positiveEnv(process.env.LEANNA_PROVIDER_BREAKER_THRESHOLD, 3),
  breakerCooldownMs: positiveEnv(process.env.LEANNA_PROVIDER_BREAKER_COOLDOWN_MS, 60_000),
});

function isBreakerOpen(provider: Provider, cooldownMs: number): boolean {
  const state = providerBreaker[provider];
  if (state.openedAt === undefined) return false;
  if (Date.now() - state.openedAt >= cooldownMs) {
    providerBreaker[provider] = { failures: 0 };
    return false;
  }
  return true;
}

function recordProviderResult(provider: Provider, ok: boolean, threshold: number): void {
  const state = providerBreaker[provider];
  if (ok) {
    providerBreaker[provider] = { failures: 0 };
    return;
  }
  const failures = state.failures + 1;
  providerBreaker[provider] = { failures, openedAt: failures >= threshold ? Date.now() : state.openedAt };
}

/** Métadonnées d'une tentative (pour distinguer appel initial et fallback). */
interface AttemptMeta {
  isFallback?: boolean;
  fallbackFrom?: Provider;
}

/** Dispatch to a single provider implementation with no fallback. */
async function generateOnce(provider: Provider, options: GenerateTextOptions, meta: AttemptMeta = {}): Promise<GenerateTextResult> {
  return provider === 'openrouter' ? generateWithOpenRouter(options, meta) : generateWithGemini(options, meta);
}

/**
 * Generate text using the configured provider (Gemini or OpenRouter), with
 * automatic cross-provider fallback.
 *
 * Order of resolution:
 *  1. Primary provider = options.forceProvider || profile.textProvider || 'gemini'.
 *  2. On failure, if fallback is enabled, retry once on the other provider.
 *  3. A per-provider circuit breaker skips a provider that recently failed
 *     repeatedly, so a sustained outage does not add latency to every call.
 *
 * Avant CHAQUE tentative (initiale ou fallback), le budget de la mission du
 * contexte de télémétrie courant est vérifié : un budget épuisé lève
 * BudgetExceededError sans contacter aucun fournisseur.
 *
 * The inner layers are preserved: Gemini keeps its key-pool rotation
 * (withGeminiRetry) and OpenRouter keeps its own timeout handling. This wrapper
 * only adds cross-provider failover on errors those layers rethrow.
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
  options = guardOptionsPrompt(options);
  const primary: Provider = options.forceProvider || _profile.textProvider || 'gemini';
  const { enabled, breakerThreshold, breakerCooldownMs } = fallbackConfig();

  // A caller that forces a provider opts out of cross-provider fallback.
  if (!enabled || options.forceProvider) {
    const release = acquireBudget(primary, options);
    try {
      return await generateOnce(primary, options);
    } finally {
      release();
    }
  }

  const secondary: Provider = primary === 'gemini' ? 'openrouter' : 'gemini';
  const order: Provider[] = [primary, secondary];
  const errors: string[] = [];

  for (const provider of order) {
    if (isBreakerOpen(provider, breakerCooldownMs) && provider !== order[order.length - 1]) {
      errors.push(`${provider}: circuit ouvert (récemment en échec)`);
      continue;
    }
    // Hors du try : un refus budgétaire ne doit PAS déclencher de fallback.
    const release = acquireBudget(provider, options);
    const meta: AttemptMeta = provider === primary ? {} : { isFallback: true, fallbackFrom: primary };
    try {
      const result = await generateOnce(provider, { ...options, forceProvider: provider }, meta);
      recordProviderResult(provider, true, breakerThreshold);
      return result;
    } catch (error) {
      recordProviderResult(provider, false, breakerThreshold);
      errors.push(`${provider}: ${(error as Error).message}`);
    } finally {
      release();
    }
  }

  throw new Error(`Tous les providers ont échoué. ${errors.join(' | ')}`);
}

// ── Telemetry context (per async execution) ─────────────────────────────────

export interface TelemetryContext {
  taskId?: string;
  missionId?: string;
  agentRole?: string;
  toolName?: string;
}

/**
 * Contexte de corrélation propagé par AsyncLocalStorage : chaque tâche/mission
 * concurrente voit SON contexte, quel que soit l'entrelacement des await.
 * (Remplace d'anciennes variables globales mutables qui attribuaient les
 * tokens d'une tâche à la dernière tâche démarrée.)
 */
const telemetryContextStorage = new AsyncLocalStorage<TelemetryContext>();

/**
 * Exécute `fn` avec un contexte de télémétrie. Les champs définis s'ajoutent
 * au contexte parent (ex. une tâche agent hérite du missionId de sa mission).
 */
export function runWithTelemetryContext<T>(context: TelemetryContext, fn: () => T): T {
  const merged: TelemetryContext = { ...(telemetryContextStorage.getStore() ?? {}) };
  for (const [key, value] of Object.entries(context) as Array<[keyof TelemetryContext, string | undefined]>) {
    if (value !== undefined) merged[key] = value;
  }
  return telemetryContextStorage.run(merged, fn);
}

/** Contexte de télémétrie de l'exécution asynchrone courante. */
export function getTelemetryContext(): TelemetryContext {
  return telemetryContextStorage.getStore() ?? {};
}

// ── Budget enforcement (before each provider attempt) ───────────────────────

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED';
  constructor(readonly missionId: string, reason: string) {
    super(`Budget de mission épuisé (${missionId}) — appel modèle refusé avant envoi : ${reason}`);
    this.name = 'BudgetExceededError';
  }
}

/** Estimation documentée : ~4 caractères par token (aucun tokenizer fournisseur local). */
export function estimateTokensFromChars(chars: number): number {
  return chars > 0 ? Math.ceil(chars / 4) : 0;
}

function promptChars(options: GenerateTextOptions): number {
  if (options.geminiParts) {
    return options.geminiParts.reduce(
      (sum: number, part: any) => sum + (typeof part?.text === 'string' ? part.text.length : 0),
      0,
    );
  }
  return (options.systemPrompt?.length ?? 0) + (options.prompt?.length ?? 0);
}

function modelFor(provider: Provider, options: GenerateTextOptions): string {
  return provider === 'openrouter'
    ? options.openrouterModel || _profile.openrouterModel || 'google/gemini-3.6-flash'
    : options.geminiModel || 'gemini-3.8-flash';
}

/** Réserve le budget de la mission courante ou lève BudgetExceededError. */
function acquireBudget(provider: Provider, options: GenerateTextOptions): () => void {
  const { missionId } = getTelemetryContext();
  const reservation = telemetryService.reserveBudget(missionId, {
    model: modelFor(provider, options),
    inputTokens: estimateTokensFromChars(promptChars(options)),
  });
  if (!reservation.allowed) {
    throw new BudgetExceededError(missionId!, reservation.reason);
  }
  return reservation.release;
}

// ── Usage normalisation & recording ─────────────────────────────────────────

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  providerTotalTokens?: number;
  providerCostUsd?: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Gemini `usageMetadata` → tokens facturés. `candidatesTokenCount` n'inclut PAS
 * les « thoughts », pourtant facturés au tarif de sortie : ils sont ajoutés à
 * la sortie. `toolUsePromptTokenCount` est ajouté à l'entrée. Le cache
 * (`cachedContentTokenCount`) est déjà inclus dans `promptTokenCount`.
 */
export function normalizeGeminiUsage(u: any): NormalizedUsage | undefined {
  if (!u || typeof u !== 'object') return undefined;
  const prompt = num(u.promptTokenCount);
  const toolUse = num(u.toolUsePromptTokenCount);
  // Les sessions Live renvoient la sortie dans `responseTokenCount`.
  const candidates = num(u.candidatesTokenCount) || num(u.responseTokenCount);
  const thoughts = num(u.thoughtsTokenCount);
  if (prompt + toolUse + candidates + thoughts === 0 && !num(u.totalTokenCount)) return undefined;
  return {
    inputTokens: prompt + toolUse,
    outputTokens: candidates + thoughts,
    ...(num(u.cachedContentTokenCount) ? { cachedInputTokens: num(u.cachedContentTokenCount) } : {}),
    ...(thoughts ? { reasoningTokens: thoughts } : {}),
    ...(num(u.totalTokenCount) ? { providerTotalTokens: num(u.totalTokenCount) } : {}),
  };
}

/** OpenRouter (format OpenAI) `usage` → tokens facturés. */
export function normalizeOpenRouterUsage(u: any): NormalizedUsage | undefined {
  if (!u || typeof u !== 'object') return undefined;
  const input = num(u.prompt_tokens);
  const output = num(u.completion_tokens);
  if (input + output === 0 && !num(u.total_tokens)) return undefined;
  const cached = num(u.prompt_tokens_details?.cached_tokens);
  const reasoning = num(u.completion_tokens_details?.reasoning_tokens);
  return {
    inputTokens: input,
    outputTokens: output,
    ...(cached ? { cachedInputTokens: cached } : {}),
    ...(reasoning ? { reasoningTokens: reasoning } : {}),
    ...(num(u.total_tokens) ? { providerTotalTokens: num(u.total_tokens) } : {}),
    ...(typeof u.cost === 'number' ? { providerCostUsd: u.cost } : {}),
  };
}

const warnedMissingUsage = new Set<string>();

/**
 * Comptabilise un appel réussi. Sans métadonnées d'usage, les tokens sont
 * ESTIMÉS (et marqués comme tels) plutôt que l'appel ignoré : sinon il
 * échapperait à la fois au coût affiché et au contrôle budgétaire.
 */
function recordUsage(
  provider: Provider,
  model: string,
  usage: NormalizedUsage | undefined,
  inputChars: number,
  outputText: string,
  meta: AttemptMeta,
  streamed: boolean,
  extra: { kind?: CallKind; units?: number; unit?: BillingUnit } = {},
): { tokenUsage: NonNullable<GenerateTextResult['tokenUsage']>; costUsd: number } {
  const ctx = getTelemetryContext();
  const estimated = !usage;
  if (estimated) {
    const key = `${provider}:${model}`;
    if (!warnedMissingUsage.has(key)) {
      warnedMissingUsage.add(key);
      console.warn(`[TextGen] ⚠️ ${key} n'a renvoyé aucune métadonnée d'usage — tokens estimés (~4 car./token).`);
    }
  }
  const normalized: NormalizedUsage = usage ?? {
    inputTokens: estimateTokensFromChars(inputChars),
    outputTokens: estimateTokensFromChars(outputText.length),
  };
  const costUsd = telemetryService.recordTokenUsage({
    missionId: ctx.missionId,
    taskId: ctx.taskId,
    agentRole: ctx.agentRole,
    toolName: ctx.toolName,
    provider,
    model,
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
    cachedInputTokens: normalized.cachedInputTokens,
    reasoningTokens: normalized.reasoningTokens,
    usageSource: estimated ? 'estimated' : 'provider',
    isFallback: meta.isFallback,
    fallbackFrom: meta.fallbackFrom,
    streamed,
    providerCostUsd: normalized.providerCostUsd,
    ...extra,
  });
  return {
    tokenUsage: {
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens,
      totalTokens: normalized.inputTokens + normalized.outputTokens,
      ...(normalized.cachedInputTokens ? { cachedInputTokens: normalized.cachedInputTokens } : {}),
      ...(normalized.reasoningTokens ? { reasoningTokens: normalized.reasoningTokens } : {}),
      ...(estimated ? { estimated: true } : {}),
    },
    costUsd,
  };
}

// ── Helpers publics pour les appels hors wrapper ────────────────────────────
//
// Certains appels ne peuvent pas passer par generateText (messages multimodaux
// OpenRouter, proxy de chat multi-messages, sessions Live). Ces helpers leur
// appliquent les MÊMES règles : budget réservé avant l'envoi, usage enregistré
// avec le contexte de télémétrie courant.

/**
 * Réserve le budget de la mission courante pour un appel direct. Lève
 * BudgetExceededError si l'appel ne peut plus être autorisé (budget déjà
 * dépassé, ou estimation d'entrée qui le ferait dépasser). Appeler la fonction
 * retournée une fois la réponse comptabilisée (ou en échec).
 */
export function reserveModelCallBudget(model: string, promptCharCount: number, kind: CallKind = 'text'): () => void {
  const { missionId } = getTelemetryContext();
  const reservation = telemetryService.reserveBudget(missionId, {
    model,
    // TTS/images ne sont pas facturés en tokens : seule la règle « budget déjà
    // dépassé » s'applique à eux.
    inputTokens: kind === 'tts' || kind === 'image' ? 0 : estimateTokensFromChars(promptCharCount),
    kind,
  });
  if (!reservation.allowed) throw new BudgetExceededError(missionId!, reservation.reason);
  return reservation.release;
}

/**
 * Enregistre l'usage d'un appel direct. `rawUsage` est l'objet d'usage brut du
 * fournisseur (`usage` OpenRouter ou `usageMetadata` Gemini) ; absent, l'usage
 * est estimé à partir de `promptCharCount` et `outputText` (texte, embedding,
 * Live). Pour TTS / images, `units` + `unit` décrivent la quantité facturée.
 * Retourne le coût calculé (0 si l'appel n'est pas tarifé : `unpriced`).
 */
export function recordModelCallUsage(params: {
  provider: Provider;
  model: string;
  rawUsage: unknown;
  promptCharCount: number;
  outputText: string;
  toolName?: string;
  streamed?: boolean;
  kind?: CallKind;
  units?: number;
  unit?: BillingUnit;
}): number {
  const kind = params.kind ?? 'text';
  let normalized = params.provider === 'gemini'
    ? normalizeGeminiUsage(params.rawUsage)
    : normalizeOpenRouterUsage(params.rawUsage);
  // Live : un message sans usage ne correspond à aucune requête facturée.
  if (!normalized && kind === 'live') return 0;
  // TTS / images : la quantité facturée est `units`, pas une estimation de tokens.
  if (!normalized && (kind === 'tts' || kind === 'image')) {
    const cost = (params.rawUsage as { cost?: unknown } | undefined)?.cost;
    normalized = { inputTokens: 0, outputTokens: 0, ...(typeof cost === 'number' ? { providerCostUsd: cost } : {}) };
  }
  const ctx = getTelemetryContext();
  const run = () => recordUsage(
    params.provider,
    params.model,
    normalized,
    params.promptCharCount,
    params.outputText,
    {},
    params.streamed === true,
    { kind, units: params.units, unit: params.unit },
  ).costUsd;
  return params.toolName && !ctx.toolName ? runWithTelemetryContext({ toolName: params.toolName }, run) : run();
}

/**
 * `ai.models.embedContent` avec budget de mission et télémétrie. L'API Gemini
 * ne renvoie pas d'usage pour les embeddings : les tokens d'entrée sont estimés
 * (~4 car./token, `usageSource:'estimated'`) et l'appel est `unpriced` tant
 * qu'aucun tarif d'embedding n'est configuré.
 */
export async function trackedGeminiEmbed(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['embedContent']>[0],
): Promise<Awaited<ReturnType<GoogleGenAI['models']['embedContent']>>> {
  const contents = params.contents as unknown;
  const promptCharCount = typeof contents === 'string'
    ? contents.length
    : JSON.stringify(contents ?? '').length;
  const release = reserveModelCallBudget(params.model, promptCharCount, 'embedding');
  try {
    const response = await ai.models.embedContent(params);
    recordModelCallUsage({
      provider: 'gemini',
      model: params.model,
      rawUsage: undefined,
      promptCharCount,
      outputText: '',
      toolName: 'embeddings',
      kind: 'embedding',
    });
    return response;
  } catch (error) {
    recordFailure('gemini', params.model, error, {});
    throw error;
  } finally {
    release();
  }
}

/** Enregistre l'échec d'un appel direct (aucun token ajouté, coût inconnu). */
export function recordModelCallFailure(provider: Provider, model: string, error: unknown): void {
  recordFailure(provider, model, error, {});
}

function recordFailure(provider: Provider, model: string, error: unknown, meta: AttemptMeta): void {
  const ctx = getTelemetryContext();
  telemetryService.recordFailedCall({
    provider,
    model,
    missionId: ctx.missionId,
    taskId: ctx.taskId,
    agentRole: ctx.agentRole,
    isFallback: meta.isFallback,
    error: ((error as Error)?.message ?? String(error)).slice(0, 300),
  });
}

// ── Streaming support ───────────────────────────────────────────────────────

export interface GenerateTextStreamOptions extends GenerateTextOptions {
  /** Callback appelé pour chaque chunk de texte reçu */
  onChunk: (text: string) => void;
  /** Callback appelé quand le stream est terminé (optionnel) */
  onDone?: (fullText: string) => void;
  /** Callback d'erreur (optionnel) */
  onError?: (error: Error) => void;
  /** Signal d'annulation (optionnel) */
  signal?: AbortSignal;
}

/**
 * Generate text in streaming mode — appelle onChunk au fur et à mesure.
 * Supporte Gemini (generateContentStream) et OpenRouter (SSE).
 * Comme generateText : budget vérifié avant l'envoi, usage comptabilisé en fin
 * de flux (usage fournisseur si présent dans le dernier chunk, sinon estimé).
 */
export async function generateTextStream(options: GenerateTextStreamOptions): Promise<string> {
  options = guardOptionsPrompt(options);
  // `forceProvider` (ex: override de modèle Notebook) prime sur le profil actif.
  const provider = options.forceProvider || _profile.textProvider || 'gemini';

  const release = acquireBudget(provider, options);
  try {
    if (provider === 'openrouter') {
      return await streamWithOpenRouter(options);
    }
    return await streamWithGemini(options);
  } finally {
    release();
  }
}

/**
 * Applique le garde-fou d'injection au `prompt` quand l'appelant l'a marqué
 * `untrustedPrompt`. No-op sinon (prompts internes de confiance) et no-op si
 * des `geminiParts` multimodales sont fournies à la place du texte. Renvoie un
 * nouvel objet d'options (ne mute pas celui de l'appelant).
 */
function guardOptionsPrompt<T extends GenerateTextOptions>(options: T): T {
  if (!options.untrustedPrompt || typeof options.prompt !== 'string' || options.prompt.length === 0) {
    return options;
  }
  const guarded = guardUntrustedContent(options.prompt, options.untrustedSource || 'external');
  if (guarded.promptInjection.flagged) {
    console.warn(
      `[PromptInjectionGuard][TextGen] ⚠️ Prompt non fiable neutralisé ` +
      `(source=${options.untrustedSource || 'external'}, risque=${guarded.promptInjection.riskScore}, ` +
      `motifs=${guarded.promptInjection.findings.join(',') || 'n/a'}).`,
    );
  }
  return { ...options, prompt: guarded.text };
}

function geminiConfig(options: GenerateTextOptions) {
  return {
    temperature: resolveTemperature(options.temperature),
    // maxOutputTokens est la clé "native" Gemini ; maxTokens est le nom
    // générique utilisé par les appelants (ex. chainOfThought.ts) qui
    // partagent le même code avec OpenRouter. Sans ce repli, un appel
    // ne fournissant que `maxTokens` n'appliquait AUCUNE limite sur
    // Gemini (le provider par défaut), ce qui rendait les budgets de
    // tokens du module CoT inopérants dans le cas le plus courant.
    ...(options.maxOutputTokens !== undefined
      ? { maxOutputTokens: options.maxOutputTokens }
      : options.maxTokens !== undefined
        ? { maxOutputTokens: options.maxTokens }
        : {}),
    ...(options.thinkingBudget !== undefined
      ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
      : {}),
  };
}

function geminiParts(options: GenerateTextOptions): any[] {
  return options.geminiParts
    ? options.geminiParts
    : [{ text: options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt }];
}

// ── Gemini streaming implementation ─────────────────────────────────────────

async function streamWithGemini(options: GenerateTextStreamOptions): Promise<string> {
  const model = options.geminiModel || 'gemini-3.8-flash';

  const key = getNextGeminiKey();
  if (!key) throw new Error("Aucune clé Gemini API disponible.");

  const ai = new GoogleGenAI({ apiKey: key });

  let response;
  try {
    response = await ai.models.generateContentStream({
      model,
      contents: [{ role: 'user', parts: geminiParts(options) }],
      config: geminiConfig(options),
    });
  } catch (error) {
    recordFailure('gemini', model, error, {});
    throw error;
  }

  let fullText = "";
  let usageMetadata: unknown;

  try {
    for await (const chunk of response) {
      if (options.signal?.aborted) break;
      // Le dernier chunk porte l'usage cumulé de la requête.
      if ((chunk as any).usageMetadata) usageMetadata = (chunk as any).usageMetadata;

      // Extraire le texte visible (ignorer les parties "thought")
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if ((part as any).thought) continue;
        const text = (part as any).text;
        if (text) {
          fullText += text;
          options.onChunk(text);
        }
      }
    }
  } catch (error) {
    // Flux interrompu : la partie déjà générée est facturée — on la comptabilise.
    recordUsage('gemini', model, normalizeGeminiUsage(usageMetadata), promptChars(options), fullText, {}, true);
    throw error;
  }

  recordUsage('gemini', model, normalizeGeminiUsage(usageMetadata), promptChars(options), fullText, {}, true);
  options.onDone?.(fullText);
  return fullText;
}

// ── OpenRouter streaming implementation ─────────────────────────────────────

async function streamWithOpenRouter(options: GenerateTextStreamOptions): Promise<string> {
  const orKey = _profile.openrouterApiKey?.trim()
    || process.env.OPENROUTER_API_KEY
    || process.env.OPENROUTER_FREE_API_KEY;

  if (!orKey) {
    console.warn('[TextGen] OpenRouter configuré mais aucune clé disponible, fallback Gemini stream');
    return streamWithGemini(options);
  }

  const model = options.openrouterModel || _profile.openrouterModel || 'google/gemini-3.6-flash';

  const messages: any[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  // Si un signal externe est fourni, le propager
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  let fullText = "";
  let usage: unknown;
  let requestSent = false;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://Leanna.local',
        'X-Title': process.env.OPENROUTER_TITLE || 'Leanna',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: resolveTemperature(options.temperature),
        max_tokens: options.maxTokens ?? options.maxOutputTokens ?? 8192,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 300)}`);
    }
    requestSent = true;

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body reader");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          // Le dernier chunk SSE d'OpenRouter porte l'objet `usage`.
          if (parsed.usage) usage = parsed.usage;
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            options.onChunk(content);
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    recordUsage('openrouter', model, normalizeOpenRouterUsage(usage), promptChars(options), fullText, {}, true);
    options.onDone?.(fullText);
    return fullText;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (requestSent) {
      // Réponse acceptée puis flux coupé/annulé : la génération partielle est facturée.
      recordUsage('openrouter', model, normalizeOpenRouterUsage(usage), promptChars(options), fullText, {}, true);
    } else {
      recordFailure('openrouter', model, e, {});
    }
    if (e.name === 'AbortError') {
      options.onDone?.(``);
      return "";
    }
    options.onError?.(e);
    throw e;
  } finally {
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

// ── Gemini non-streaming implementation ─────────────────────────────────────

async function generateWithGemini(options: GenerateTextOptions, meta: AttemptMeta = {}): Promise<GenerateTextResult> {
  const model = options.geminiModel || 'gemini-3.8-flash';

  // Start OTel span for this model call
  const span = telemetryService.startModelCallSpan('gemini', model, getTelemetryContext().taskId);
  span.setAttribute('prompt.length', options.prompt.length);
  if (options.systemPrompt) {
    span.setAttribute('system_prompt.length', options.systemPrompt.length);
  }
  if (meta.isFallback) span.setAttribute('model.fallback_from', meta.fallbackFrom ?? 'unknown');

  // Timeout de 120s pour éviter que l'AgentExecutor se bloque indéfiniment
  // sur un appel Gemini suspendu (réseau lent, modèle surchargé). Le handle est
  // nettoyé en fin d'appel (sinon un timer de 120s survit à chaque requête).
  const GEMINI_TIMEOUT_MS = 120_000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`Gemini timeout après ${GEMINI_TIMEOUT_MS / 1000}s`)), GEMINI_TIMEOUT_MS);
    });

    const response = await Promise.race([
      withGeminiRetry((ai) =>
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: geminiParts(options) }],
          config: geminiConfig(options),
        })
      ),
      timeoutPromise,
    ]);

    const rawResponse = response as {
      text?: string;
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
      usageMetadata?: unknown;
    };
    const visibleParts = (rawResponse.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text!.trim())
      .filter(Boolean);
    const text = rawResponse.text?.trim() || visibleParts.join("\n");

    if (!text) {
      const finishReasons = (rawResponse.candidates ?? [])
        .map((candidate) => candidate.finishReason ?? "unknown")
        .join(", ");
      console.warn(`[TextGen] Gemini n'a renvoyé aucun texte visible (finish: ${finishReasons || "aucun"}).`);
    }

    const { tokenUsage, costUsd } = recordUsage(
      'gemini', model, normalizeGeminiUsage(rawResponse.usageMetadata), promptChars(options), text, meta, false,
    );
    span.setAttribute('tokens.input', tokenUsage.inputTokens);
    span.setAttribute('tokens.output', tokenUsage.outputTokens);
    span.setAttribute('tokens.total', tokenUsage.totalTokens);
    span.setAttribute('tokens.estimated', tokenUsage.estimated === true);
    span.setAttribute('cost.usd', costUsd);

    span.setStatus({ code: 0 }); // OK
    span.end();

    return {
      text,
      provider: 'gemini',
      model,
      tokenUsage,
      ...(meta.isFallback ? { isFallback: true } : {}),
    };
  } catch (error) {
    recordFailure('gemini', model, error, meta);
    span.recordException(error as Error);
    span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
    span.end();
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

// ── OpenRouter implementation ───────────────────────────────────────────────

async function generateWithOpenRouter(options: GenerateTextOptions, meta: AttemptMeta = {}): Promise<GenerateTextResult> {
  const orKey = _profile.openrouterApiKey?.trim()
    || process.env.OPENROUTER_API_KEY
    || process.env.OPENROUTER_FREE_API_KEY;

  if (!orKey) {
    // No cross-provider fallback here: generateText() owns failover and will
    // route to Gemini when OpenRouter is unavailable. Throwing keeps a single
    // failover path and lets a direct forceProvider:'openrouter' caller see a
    // clear error rather than a silent provider switch.
    const error = new Error('OpenRouter configuré mais aucune clé disponible.');
    (error as any).status = 401;
    throw error;
  }

  const model = options.openrouterModel || _profile.openrouterModel || 'google/gemini-3.6-flash';

  // Start OTel span for this model call
  const span = telemetryService.startModelCallSpan('openrouter', model, getTelemetryContext().taskId);
  span.setAttribute('prompt.length', options.prompt.length);
  if (options.systemPrompt) {
    span.setAttribute('system_prompt.length', options.systemPrompt.length);
  }
  if (meta.isFallback) span.setAttribute('model.fallback_from', meta.fallbackFrom ?? 'unknown');

  // Declared outside the try so the catch block can clear the timeout.
  const controller = new AbortController();
  // 120s au lieu de 60s : les agents font des sorties longues (code complet, analyses, délégations)
  // qui peuvent nécessiter plus d'une minute sur des modèles OpenRouter sous charge.
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const messages: any[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://Leanna.local',
        'X-Title': process.env.OPENROUTER_TITLE || 'Leanna',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: resolveTemperature(options.temperature),
        max_tokens: options.maxTokens ?? options.maxOutputTokens ?? 8192,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      const error = new Error(`OpenRouter ${response.status}: ${errText.slice(0, 300)}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    const { tokenUsage, costUsd } = recordUsage(
      'openrouter', model, normalizeOpenRouterUsage(data.usage), promptChars(options), text, meta, false,
    );
    span.setAttribute('tokens.input', tokenUsage.inputTokens);
    span.setAttribute('tokens.output', tokenUsage.outputTokens);
    span.setAttribute('tokens.total', tokenUsage.totalTokens);
    span.setAttribute('tokens.estimated', tokenUsage.estimated === true);
    span.setAttribute('cost.usd', costUsd);

    span.setStatus({ code: 0 }); // OK
    span.end();

    return { text, provider: 'openrouter', model, tokenUsage, ...(meta.isFallback ? { isFallback: true } : {}) };
  } catch (e: any) {
    clearTimeout(timeoutId);

    recordFailure('openrouter', model, e, meta);
    span.recordException(e);
    span.setStatus({ code: 2, message: e.message }); // ERROR
    span.end();

    // Cross-provider fallback is now owned by generateText() (central layer):
    // rethrow so it can decide whether to fail over to Gemini, apply the
    // circuit breaker and avoid a redundant double call. This keeps failover
    // in one place instead of two competing mechanisms.
    throw e;
  }
}

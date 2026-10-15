/**
 * TelemetryService — OpenTelemetry tracing + Token/Cost tracking
 * 
 * Responsabilités :
 * 1. Traces OpenTelemetry : une trace par mission, spans pour tasks/tools/model calls
 * 2. Capture des tokens/coûts réels depuis les réponses Gemini/OpenRouter
 * 3. Store in-memory avec flush périodique vers Supabase
 * 4. Budget guardrails : arrêt automatique au dépassement
 */

import { trace, context, type Span, type Tracer, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Origine des compteurs de tokens :
 *  - `provider`  : valeurs renvoyées par l'API (usageMetadata / usage) ;
 *  - `estimated` : la réponse ne contenait aucune métadonnée d'usage, les
 *    tokens sont estimés (~4 caractères/token) pour ne pas laisser un appel
 *    facturé hors comptabilité ni hors budget.
 */
export type UsageSource = 'provider' | 'estimated';

/**
 * Origine du tarif appliqué :
 *  - `exact`      : clé trouvée telle quelle dans MODEL_PRICING ;
 *  - `normalized` : trouvée après normalisation (préfixe `models/`, suffixe
 *    `-preview-…`, `-latest`, `-001`…) ;
 *  - `free`       : variante OpenRouter `:free` (tarif nul) ;
 *  - `default`    : modèle inconnu → DEFAULT_PRICING (coût NON fiable) ;
 *  - `unpriced`   : appel non textuel (embedding, TTS, image, Live) sans tarif
 *    configuré : coût INCONNU, compté 0 $ et signalé — jamais extrapolé depuis
 *    un tarif de génération de texte.
 */
export type PricingSource = 'exact' | 'normalized' | 'free' | 'default' | 'unpriced';

/** Nature de l'appel facturable. */
export type CallKind = 'text' | 'embedding' | 'tts' | 'image' | 'live';

/** Unité facturée pour les appels non mesurés en tokens. */
export type BillingUnit = 'characters' | 'images';

export interface TokenUsage {
  id: string;
  missionId?: string;
  taskId?: string;
  agentRole?: string;
  toolName?: string;
  provider: 'gemini' | 'openrouter';
  model: string;
  /** Tokens facturés en entrée (inclut les tokens mis en cache). */
  inputTokens: number;
  /** Tokens facturés en sortie (inclut les tokens de raisonnement). */
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp: string;
  /** Part de `inputTokens` servie depuis le cache du fournisseur, si exposée. */
  cachedInputTokens?: number;
  /** Part de `outputTokens` consacrée au raisonnement (« thoughts »), si exposée. */
  reasoningTokens?: number;
  usageSource: UsageSource;
  pricingSource: PricingSource;
  /** Vrai si l'appel a été servi par le fournisseur de secours. */
  isFallback?: boolean;
  /** Fournisseur initial en échec quand `isFallback` est vrai. */
  fallbackFrom?: 'gemini' | 'openrouter';
  streamed?: boolean;
  /** Coût renvoyé par le fournisseur (OpenRouter `usage.cost`), pour comparaison. */
  providerCostUsd?: number;
  /** Nature de l'appel (absent = 'text'). */
  kind?: CallKind;
  /** Quantité facturée hors tokens (caractères TTS, images générées). */
  units?: number;
  unit?: BillingUnit;
}

/** Tentative d'appel modèle en échec (aucun token facturé connu). */
export interface FailedModelCall {
  timestamp: string;
  provider: 'gemini' | 'openrouter';
  model: string;
  missionId?: string;
  taskId?: string;
  agentRole?: string;
  isFallback?: boolean;
  error: string;
}

export interface RecordTokenUsageParams {
  missionId?: string;
  taskId?: string;
  agentRole?: string;
  toolName?: string;
  provider: 'gemini' | 'openrouter';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  usageSource?: UsageSource;
  isFallback?: boolean;
  fallbackFrom?: 'gemini' | 'openrouter';
  streamed?: boolean;
  providerCostUsd?: number;
  kind?: CallKind;
  units?: number;
  unit?: BillingUnit;
}

export interface PersistenceStatus {
  /** Supabase configuré (URL + service role key). */
  configured: boolean;
  /** Persistance coupée à chaud (table absente, etc.). */
  disabled: boolean;
  disabledReason?: string;
  /** Enregistrements en attente d'écriture. */
  pending: number;
  /** Enregistrements définitivement perdus (file pleine / table absente). */
  droppedUnpersisted: number;
  persistedTotal: number;
  /** Schéma `token_usage` sans les colonnes v2 (migration 20261015 absente). */
  legacySchema: boolean;
  lastError?: string;
  lastFlushAt?: string;
}

/** Résultat d'une réservation de budget avant un appel modèle. */
export type BudgetReservation =
  | { allowed: true; release: () => void }
  | { allowed: false; reason: string };

export interface BudgetConfig {
  maxTokens?: number;
  maxCostUsd?: number;
}

export interface BudgetStatus {
  tokensUsed: number;
  costUsd: number;
  exceeded: boolean;
  reason?: string;
}

/** Pricing per 1M tokens (input / output) in USD */
interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pricing Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini models (as of Sept 2026)
  'gemini-3.8-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'gemini-2.5-pro': { inputPer1M: 0.90, outputPer1M: 3.50 },
  'gemini-2.0-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 },
  
  // OpenRouter models (approximations from OR pricing page)
  'google/gemini-3.6-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'google/gemini-2.0-flash-exp': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'anthropic/claude-3.5-sonnet': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-opus': { inputPer1M: 15.00, outputPer1M: 75.00 },
  'openai/gpt-4-turbo': { inputPer1M: 10.00, outputPer1M: 30.00 },
  'openai/gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'openai/gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
};

// Fallback pricing for unknown models
const DEFAULT_PRICING: ModelPricing = { inputPer1M: 0.50, outputPer1M: 1.50 };
const FREE_PRICING: ModelPricing = { inputPer1M: 0, outputPer1M: 0 };

const warnedUnknownModels = new Set<string>();

/**
 * Résout le tarif d'un modèle. Les tarifs sont ceux CONFIGURÉS ci-dessus : ils
 * ne sont pas synchronisés avec les grilles publiques et ne certifient pas la
 * facture réelle. La normalisation ne retire que des suffixes de version /
 * préversion : une variante distincte (ex. `-lite`) n'hérite jamais du tarif
 * du modèle de base et tombe sur DEFAULT_PRICING (source `default`).
 */
export function resolvePricing(
  model: string,
  kind: CallKind = 'text',
): { pricing: ModelPricing; source: PricingSource; key: string } {
  if (MODEL_PRICING[model]) return { pricing: MODEL_PRICING[model], source: 'exact', key: model };

  const lower = (model || '').trim().toLowerCase();
  if (lower.endsWith(':free')) return { pricing: FREE_PRICING, source: 'free', key: lower };

  // Appels non textuels : aucune normalisation ni tarif par défaut (un modèle
  // TTS « …-flash-preview-tts » n'a PAS le tarif du modèle texte « …-flash »).
  if (kind !== 'text') return { pricing: FREE_PRICING, source: 'unpriced', key: 'unpriced' };

  const base = lower.replace(/^models\//, '').replace(/:[a-z0-9._-]+$/, '');
  const candidates = [
    base,
    base.replace(/-(preview|exp|experimental|latest)(-[\w.-]*)?$/, ''),
    base.replace(/-\d{3}$/, ''),
  ];
  for (const key of candidates) {
    if (MODEL_PRICING[key]) return { pricing: MODEL_PRICING[key], source: 'normalized', key };
  }

  if (!warnedUnknownModels.has(model)) {
    warnedUnknownModels.add(model);
    console.warn(
      `[TelemetryService] ⚠️ Tarif inconnu pour le modèle "${model}" — DEFAULT_PRICING appliqué ` +
      `($${DEFAULT_PRICING.inputPer1M}/$${DEFAULT_PRICING.outputPer1M} par 1M). Coût non fiable.`,
    );
  }
  return { pricing: DEFAULT_PRICING, source: 'default', key: 'default' };
}

/**
 * Coût d'un appel à tarification simple. Les tokens mis en cache sont inclus
 * dans `inputTokens` et facturés au tarif d'entrée plein : aucun tarif « cache »
 * n'est configuré, l'estimation est donc volontairement conservatrice (majorante).
 */
function computeCost(pricing: ModelPricing, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * pricing.inputPer1M + (outputTokens / 1_000_000) * pricing.outputPer1M;
}

const nonNegative = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

// ═══════════════════════════════════════════════════════════════════════════════
// TelemetryService
// ═══════════════════════════════════════════════════════════════════════════════

export class TelemetryService {
  private tracer: Tracer;
  private provider: NodeTracerProvider;
  private supabase: SupabaseClient | null = null;
  
  /**
   * Fenêtre glissante des derniers enregistrements : source du dashboard et des
   * agrégations. Indépendante de la file de persistance — un flush réussi ne
   * fait plus disparaître les données du dashboard.
   */
  private recentRecords: TokenUsage[] = [];
  /** File d'attente d'écriture vers Supabase (alimentée seulement si configuré). */
  private pendingFlush: TokenUsage[] = [];
  private recentFailures: FailedModelCall[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  /**
   * Persistance désactivée à chaud si la table `token_usage` est absente
   * (PGRST205). L'état est exposé par getPersistenceStatus() : les métriques
   * restantes sont alors explicitement « en mémoire uniquement ».
   */
  private persistenceDisabled = false;
  private persistenceDisabledReason?: string;
  /** Table `token_usage` sans les colonnes v2 : on n'écrit que les colonnes v1. */
  private legacySchema = false;
  private flushInProgress = false;

  /** Compteurs cumulés depuis le démarrage (non affectés par les fenêtres bornées). */
  private counters = {
    recorded: 0,
    estimatedUsage: 0,
    defaultPriced: 0,
    fallbackCalls: 0,
    failedCalls: 0,
    droppedFromRecent: 0,
    droppedUnpersisted: 0,
    persisted: 0,
    budgetDenials: 0,
  };
  private lastPersistenceError?: string;
  private lastFlushAt?: string;

  /** Budget tracking per mission */
  private missionBudgets = new Map<string, BudgetConfig>();
  private missionUsage = new Map<string, BudgetStatus>();
  /** Réservations en vol (appels lancés mais non encore comptabilisés). */
  private inFlight = new Map<string, { tokens: number; costUsd: number }>();

  /** Active spans registry (for correlation) */
  private activeSpans = new Map<string, Span>();

  private static readonly FLUSH_INTERVAL_MS = 30_000; // 30s
  /** Seuil déclenchant un flush anticipé. */
  private static readonly MAX_IN_MEMORY = 1000;
  /** Borne de la file de persistance (au-delà : perte comptée et signalée). */
  private static readonly MAX_PENDING = 5000;
  private static readonly MAX_RECENT = 5000;
  private static readonly MAX_FAILURES = 200;

  constructor() {
    // Initialize OpenTelemetry provider.
    // OTel SDK v2 API: span processors are passed via the constructor
    // (addSpanProcessor was removed), and resources are built with
    // resourceFromAttributes (the Resource class constructor was removed).
    const otelConsoleExport = getEnv().OTEL_CONSOLE_EXPORT;
    const exportSpans = otelConsoleExport === '1' || otelConsoleExport === 'true';

    this.provider = new NodeTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'leanna-os',
        [ATTR_SERVICE_VERSION]: '1.0.0',
      }),
      // Console export is opt-in (verbose). Traces are still created and can
      // be wired to an OTLP/Jaeger exporter by adding a processor here.
      spanProcessors: exportSpans
        ? [new BatchSpanProcessor(new ConsoleSpanExporter())]
        : [],
    });

    this.provider.register();
    this.tracer = trace.getTracer('leanna-telemetry', '1.0.0');
    
    // Initialize Supabase if credentials available
    this.initSupabase();
    
    // Start periodic flush
    this.startFlushTimer();
  }

  private initSupabase(): void {
    const env = getEnv();
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (url && key) {
      this.supabase = createClient(url, key);
      console.log('[TelemetryService] ✓ Supabase connected for token persistence');
    } else {
      console.warn('[TelemetryService] ⚠️ Supabase not configured — token usage will stay in-memory only');
    }
  }

  private startFlushTimer(): void {
    this.flushInterval = setInterval(() => {
      this.flushToSupabase().catch(err => {
        console.error('[TelemetryService] Flush error:', err);
      });
    }, TelemetryService.FLUSH_INTERVAL_MS);
    // Ne pas maintenir la boucle d'événements ouverte à cause de ce seul timer :
    // permet aux process (ex: runner de tests) de se terminer naturellement.
    this.flushInterval.unref?.();
  }

  // ─── OpenTelemetry Tracing ─────────────────────────────────────────────────

  /**
   * Start a new trace for a mission.
   * Returns the span to be ended when the mission completes.
   */
  startMissionTrace(missionId: string, title: string): Span {
    const span = this.tracer.startSpan('mission', {
      attributes: {
        'mission.id': missionId,
        'mission.title': title,
      },
    });
    
    this.activeSpans.set(`mission:${missionId}`, span);
    return span;
  }

  /**
   * End a mission trace.
   */
  endMissionTrace(missionId: string, success: boolean): void {
    const span = this.activeSpans.get(`mission:${missionId}`);
    if (span) {
      span.setStatus({ code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR });
      span.end();
      this.activeSpans.delete(`mission:${missionId}`);
    }
  }

  /**
   * Start a span for an agent task (child of mission span).
   */
  startTaskSpan(taskId: string, role: string, title: string, missionId?: string): Span {
    const parentSpan = missionId ? this.activeSpans.get(`mission:${missionId}`) : undefined;
    const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
    
    const span = this.tracer.startSpan('agent_task', {
      attributes: {
        'task.id': taskId,
        'task.role': role,
        'task.title': title,
      },
    }, ctx);
    
    this.activeSpans.set(`task:${taskId}`, span);
    return span;
  }

  /**
   * End a task span.
   */
  endTaskSpan(taskId: string, success: boolean): void {
    const span = this.activeSpans.get(`task:${taskId}`);
    if (span) {
      span.setStatus({ code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR });
      span.end();
      this.activeSpans.delete(`task:${taskId}`);
    }
  }

  /**
   * Start a span for a tool call (child of task span).
   */
  startToolSpan(toolName: string, taskId?: string): Span {
    const parentSpan = taskId ? this.activeSpans.get(`task:${taskId}`) : undefined;
    const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
    
    const span = this.tracer.startSpan('tool_call', {
      attributes: {
        'tool.name': toolName,
      },
    }, ctx);
    
    return span;
  }

  /**
   * Start a span for a model call (child of tool/task span).
   */
  startModelCallSpan(provider: string, model: string, taskId?: string): Span {
    const parentSpan = taskId ? this.activeSpans.get(`task:${taskId}`) : undefined;
    const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
    
    const span = this.tracer.startSpan('model_call', {
      attributes: {
        'model.provider': provider,
        'model.name': model,
      },
    }, ctx);
    
    return span;
  }

  // ─── Token & Cost Tracking ─────────────────────────────────────────────────

  /**
   * Record token usage from a model call.
   * Returns the calculated cost.
   */
  recordTokenUsage(params: RecordTokenUsageParams): number {
    const inputTokens = nonNegative(params.inputTokens);
    const outputTokens = nonNegative(params.outputTokens);
    const kind: CallKind = params.kind ?? 'text';
    const resolved = resolvePricing(params.model, kind);
    const pricingSource = resolved.source;
    // Appel non tarifé : le coût fourni par le fournisseur (s'il existe) est le
    // seul chiffre fiable ; sinon 0 $ marqué `unpriced` (coût inconnu).
    const costUsd = pricingSource === 'unpriced'
      ? (typeof params.providerCostUsd === 'number' ? Math.max(0, params.providerCostUsd) : 0)
      : computeCost(resolved.pricing, inputTokens, outputTokens);
    const usageSource: UsageSource = params.usageSource ?? 'provider';

    const usage: TokenUsage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      missionId: params.missionId,
      taskId: params.taskId,
      agentRole: params.agentRole,
      toolName: params.toolName,
      provider: params.provider,
      model: params.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd,
      timestamp: new Date().toISOString(),
      usageSource,
      pricingSource,
      ...(params.cachedInputTokens ? { cachedInputTokens: nonNegative(params.cachedInputTokens) } : {}),
      ...(params.reasoningTokens ? { reasoningTokens: nonNegative(params.reasoningTokens) } : {}),
      ...(params.isFallback ? { isFallback: true, fallbackFrom: params.fallbackFrom } : {}),
      ...(params.streamed ? { streamed: true } : {}),
      ...(typeof params.providerCostUsd === 'number' ? { providerCostUsd: params.providerCostUsd } : {}),
      ...(kind !== 'text' ? { kind } : {}),
      ...(params.units !== undefined ? { units: nonNegative(params.units), unit: params.unit } : {}),
    };

    this.counters.recorded++;
    if (usageSource === 'estimated') this.counters.estimatedUsage++;
    if (pricingSource === 'default') this.counters.defaultPriced++;
    if (usage.isFallback) this.counters.fallbackCalls++;

    this.recentRecords.push(usage);
    if (this.recentRecords.length > TelemetryService.MAX_RECENT) {
      const excess = this.recentRecords.length - TelemetryService.MAX_RECENT;
      this.recentRecords.splice(0, excess);
      this.counters.droppedFromRecent += excess;
    }

    // Update mission budget tracking
    if (params.missionId) {
      this.updateMissionUsage(params.missionId, usage.totalTokens, costUsd);
    }

    // File de persistance : seulement si une persistance est réellement possible,
    // sinon les données resteraient indéfiniment en mémoire (fuite).
    if (this.supabase && !this.persistenceDisabled) {
      this.pendingFlush.push(usage);
      this.enforcePendingBound();
      if (this.pendingFlush.length >= TelemetryService.MAX_IN_MEMORY) {
        this.flushToSupabase().catch(err => {
          console.error('[TelemetryService] Emergency flush failed:', err);
        });
      }
    }

    return costUsd;
  }

  /**
   * Enregistre une tentative d'appel en échec. Aucun token n'est ajouté : le
   * fournisseur ne renvoie pas d'usage sur une erreur, le coût éventuel d'une
   * requête traitée avant l'échec (timeout, coupure) est donc INCONNU — il est
   * compté comme tel, pas comme gratuit.
   */
  recordFailedCall(params: Omit<FailedModelCall, 'timestamp'>): void {
    this.counters.failedCalls++;
    this.recentFailures.push({ ...params, timestamp: new Date().toISOString() });
    if (this.recentFailures.length > TelemetryService.MAX_FAILURES) {
      this.recentFailures.splice(0, this.recentFailures.length - TelemetryService.MAX_FAILURES);
    }
  }

  /**
   * Calculate cost for given token counts (utility method).
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number, kind: CallKind = 'text'): number {
    return computeCost(resolvePricing(model, kind).pricing, nonNegative(inputTokens), nonNegative(outputTokens));
  }

  // ─── Budget Guardrails ─────────────────────────────────────────────────────

  /**
   * Set budget for a mission.
   */
  setMissionBudget(missionId: string, budget: BudgetConfig): void {
    this.missionBudgets.set(missionId, budget);
    this.missionUsage.set(missionId, {
      tokensUsed: 0,
      costUsd: 0,
      exceeded: false,
    });
  }

  /**
   * Check if mission budget is exceeded.
   */
  checkBudget(missionId: string): BudgetStatus {
    return this.missionUsage.get(missionId) || {
      tokensUsed: 0,
      costUsd: 0,
      exceeded: false,
    };
  }

  /**
   * Contrôle PRÉVENTIF avant un appel modèle : refuse l'appel si le budget de
   * la mission est déjà dépassé ou si la consommation enregistrée + les appels
   * en vol + l'estimation d'entrée de cet appel dépasse la limite.
   *
   * Limites (documentées) : seule l'ENTRÉE est estimée (la sortie est inconnue
   * avant génération), donc un appel autorisé peut encore faire franchir la
   * limite de sa sortie ; le budget borne le lancement de nouveaux appels, il
   * ne peut pas interrompre ni annuler une génération déjà facturée.
   */
  reserveBudget(
    missionId: string | undefined,
    estimate: { model: string; inputTokens: number; kind?: CallKind },
  ): BudgetReservation {
    const noop: BudgetReservation = { allowed: true, release: () => {} };
    if (!missionId) return noop;
    const budget = this.missionBudgets.get(missionId);
    if (!budget || (!budget.maxTokens && !budget.maxCostUsd)) return noop;

    const status = this.checkBudget(missionId);
    const deny = (reason: string): BudgetReservation => {
      this.counters.budgetDenials++;
      return { allowed: false, reason };
    };
    if (status.exceeded) return deny(status.reason || 'Budget de mission dépassé');

    const tokens = nonNegative(estimate.inputTokens);
    const costUsd = this.calculateCost(estimate.model, tokens, 0, estimate.kind);
    const reserved = this.inFlight.get(missionId) ?? { tokens: 0, costUsd: 0 };

    if (budget.maxTokens && status.tokensUsed + reserved.tokens + tokens > budget.maxTokens) {
      return deny(
        `Token budget would be exceeded: ${status.tokensUsed} used + ${reserved.tokens} in flight + ~${tokens} estimated > ${budget.maxTokens}`,
      );
    }
    if (budget.maxCostUsd && status.costUsd + reserved.costUsd + costUsd > budget.maxCostUsd) {
      return deny(
        `Cost budget would be exceeded: $${(status.costUsd + reserved.costUsd + costUsd).toFixed(4)} > $${budget.maxCostUsd.toFixed(4)}`,
      );
    }

    this.inFlight.set(missionId, { tokens: reserved.tokens + tokens, costUsd: reserved.costUsd + costUsd });
    let released = false;
    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        const cur = this.inFlight.get(missionId);
        if (!cur) return;
        const next = { tokens: cur.tokens - tokens, costUsd: cur.costUsd - costUsd };
        if (next.tokens <= 0 && next.costUsd <= 1e-12) this.inFlight.delete(missionId);
        else this.inFlight.set(missionId, next);
      },
    };
  }

  /**
   * Clear budget tracking for a mission (after completion).
   */
  clearMissionBudget(missionId: string): void {
    this.missionBudgets.delete(missionId);
    this.missionUsage.delete(missionId);
    this.inFlight.delete(missionId);
  }

  private updateMissionUsage(missionId: string, tokens: number, costUsd: number): void {
    const current = this.missionUsage.get(missionId) || {
      tokensUsed: 0,
      costUsd: 0,
      exceeded: false,
    };

    const updated: BudgetStatus = {
      tokensUsed: current.tokensUsed + tokens,
      costUsd: current.costUsd + costUsd,
      exceeded: current.exceeded,
      ...(current.reason ? { reason: current.reason } : {}),
    };

    const budget = this.missionBudgets.get(missionId);
    if (budget && !updated.exceeded) {
      if (budget.maxTokens && updated.tokensUsed >= budget.maxTokens) {
        updated.exceeded = true;
        updated.reason = `Token budget exceeded: ${updated.tokensUsed} >= ${budget.maxTokens}`;
      } else if (budget.maxCostUsd && updated.costUsd >= budget.maxCostUsd) {
        updated.exceeded = true;
        updated.reason = `Cost budget exceeded: $${updated.costUsd.toFixed(4)} >= $${budget.maxCostUsd.toFixed(4)}`;
      }
    }

    this.missionUsage.set(missionId, updated);
  }

  // ─── Data Retrieval ────────────────────────────────────────────────────────

  /**
   * Get in-memory usage records (for dashboard).
   */
  getUsageRecords(filters?: {
    missionId?: string;
    agentRole?: string;
    provider?: string;
    limit?: number;
  }): TokenUsage[] {
    let records = [...this.recentRecords];

    if (filters?.missionId) {
      records = records.filter(r => r.missionId === filters.missionId);
    }
    if (filters?.agentRole) {
      records = records.filter(r => r.agentRole === filters.agentRole);
    }
    if (filters?.provider) {
      records = records.filter(r => r.provider === filters.provider);
    }

    const limit = filters?.limit || 100;
    return records.slice(-limit);
  }

  getRecentFailures(limit = 50): FailedModelCall[] {
    return this.recentFailures.slice(-limit);
  }

  /**
   * Get aggregated stats (for dashboard).
   * Calculées sur la fenêtre glissante en mémoire (MAX_RECENT enregistrements) :
   * `coverage` indique si des enregistrements plus anciens en sont sortis.
   */
  getAggregatedStats(period?: 'day' | 'hour'): {
    totalTokens: number;
    totalCost: number;
    byModel: Record<string, { tokens: number; cost: number; calls: number }>;
    byAgent: Record<string, { tokens: number; cost: number; calls: number }>;
    byMission: Record<string, { tokens: number; cost: number }>;
    byProvider: Record<string, { tokens: number; cost: number; calls: number }>;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    estimatedCalls: number;
    defaultPricedCalls: number;
    /** Appels non textuels sans tarif configuré : coût inconnu (compté 0 $). */
    unpricedCalls: number;
    byKind: Record<string, { tokens: number; cost: number; calls: number; units: number }>;
    fallbackCalls: number;
    unattributedCalls: number;
    coverage: {
      windowSize: number;
      droppedFromWindow: number;
      failedCallsSinceStart: number;
      budgetDenialsSinceStart: number;
    };
  } {
    const cutoff = period === 'day'
      ? Date.now() - 24 * 60 * 60 * 1000
      : period === 'hour'
      ? Date.now() - 60 * 60 * 1000
      : 0;

    const records = this.recentRecords.filter(r =>
      new Date(r.timestamp).getTime() >= cutoff
    );

    const stats = {
      totalTokens: 0,
      totalCost: 0,
      byModel: {} as Record<string, { tokens: number; cost: number; calls: number }>,
      byAgent: {} as Record<string, { tokens: number; cost: number; calls: number }>,
      byMission: {} as Record<string, { tokens: number; cost: number }>,
      byProvider: {} as Record<string, { tokens: number; cost: number; calls: number }>,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      estimatedCalls: 0,
      defaultPricedCalls: 0,
      unpricedCalls: 0,
      byKind: {} as Record<string, { tokens: number; cost: number; calls: number; units: number }>,
      fallbackCalls: 0,
      unattributedCalls: 0,
      coverage: {
        windowSize: TelemetryService.MAX_RECENT,
        droppedFromWindow: this.counters.droppedFromRecent,
        failedCallsSinceStart: this.counters.failedCalls,
        budgetDenialsSinceStart: this.counters.budgetDenials,
      },
    };

    const bump = (
      bucket: Record<string, { tokens: number; cost: number; calls: number }>,
      key: string,
      record: TokenUsage,
    ) => {
      const entry = (bucket[key] ??= { tokens: 0, cost: 0, calls: 0 });
      entry.tokens += record.totalTokens;
      entry.cost += record.costUsd;
      entry.calls += 1;
    };

    for (const record of records) {
      stats.totalTokens += record.totalTokens;
      stats.totalCost += record.costUsd;
      stats.inputTokens += record.inputTokens;
      stats.outputTokens += record.outputTokens;
      stats.cachedInputTokens += record.cachedInputTokens ?? 0;
      stats.reasoningTokens += record.reasoningTokens ?? 0;
      if (record.usageSource === 'estimated') stats.estimatedCalls++;
      if (record.pricingSource === 'default') stats.defaultPricedCalls++;
      if (record.pricingSource === 'unpriced') stats.unpricedCalls++;
      const k = (stats.byKind[record.kind ?? 'text'] ??= { tokens: 0, cost: 0, calls: 0, units: 0 });
      k.tokens += record.totalTokens;
      k.cost += record.costUsd;
      k.calls += 1;
      k.units += record.units ?? 0;
      if (record.isFallback) stats.fallbackCalls++;
      if (!record.missionId && !record.taskId && !record.agentRole) stats.unattributedCalls++;

      bump(stats.byModel, record.model, record);
      bump(stats.byProvider, record.provider, record);
      if (record.agentRole) bump(stats.byAgent, record.agentRole, record);

      if (record.missionId) {
        const m = (stats.byMission[record.missionId] ??= { tokens: 0, cost: 0 });
        m.tokens += record.totalTokens;
        m.cost += record.costUsd;
      }
    }

    return stats;
  }

  getPersistenceStatus(): PersistenceStatus {
    return {
      configured: this.supabase !== null,
      disabled: this.persistenceDisabled,
      ...(this.persistenceDisabledReason ? { disabledReason: this.persistenceDisabledReason } : {}),
      pending: this.pendingFlush.length,
      droppedUnpersisted: this.counters.droppedUnpersisted,
      persistedTotal: this.counters.persisted,
      legacySchema: this.legacySchema,
      ...(this.lastPersistenceError ? { lastError: this.lastPersistenceError } : {}),
      ...(this.lastFlushAt ? { lastFlushAt: this.lastFlushAt } : {}),
    };
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  private enforcePendingBound(): void {
    const excess = this.pendingFlush.length - TelemetryService.MAX_PENDING;
    if (excess > 0) {
      this.pendingFlush.splice(0, excess);
      this.counters.droppedUnpersisted += excess;
      console.warn(
        `[TelemetryService] ⚠️ File de persistance pleine : ${excess} enregistrement(s) non persisté(s) abandonné(s) ` +
        `(total perdu: ${this.counters.droppedUnpersisted}).`,
      );
    }
  }

  private toRow(u: TokenUsage): Record<string, unknown> {
    const legacy = {
      id: u.id,
      mission_id: u.missionId,
      task_id: u.taskId,
      agent_role: u.agentRole,
      tool_name: u.toolName,
      provider: u.provider,
      model: u.model,
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      total_tokens: u.totalTokens,
      cost_usd: u.costUsd,
      created_at: u.timestamp,
    };
    if (this.legacySchema) return legacy;
    return {
      ...legacy,
      cached_input_tokens: u.cachedInputTokens ?? 0,
      reasoning_tokens: u.reasoningTokens ?? 0,
      usage_source: u.usageSource,
      call_kind: u.kind ?? 'text',
      billed_units: u.units ?? null,
      billed_unit: u.unit ?? null,
      pricing_source: u.pricingSource,
      is_fallback: u.isFallback ?? false,
      fallback_from: u.fallbackFrom ?? null,
      streamed: u.streamed ?? false,
      provider_cost_usd: u.providerCostUsd ?? null,
    };
  }

  private async flushToSupabase(): Promise<void> {
    if (!this.supabase || this.persistenceDisabled || this.flushInProgress || this.pendingFlush.length === 0) return;
    this.flushInProgress = true;

    const toFlush = this.pendingFlush.splice(0, 500); // Flush up to 500 at a time

    try {
      let { error } = await this.supabase.from('token_usage').insert(toFlush.map(u => this.toRow(u)));

      // Colonnes v2 absentes (migration 20261015000000 non appliquée) : repli
      // sur le schéma v1 plutôt que de perdre les données.
      if (error && !this.legacySchema && (error.code === 'PGRST204' || /column .* (does not exist|of 'token_usage')/i.test(error.message ?? ''))) {
        this.legacySchema = true;
        console.warn(
          "[TelemetryService] ⚠️ Colonnes v2 absentes de 'token_usage' — écriture du schéma v1 uniquement " +
          "(cache/raisonnement/estimation/fallback non persistés). Appliquez la migration 20261015000000.",
        );
        ({ error } = await this.supabase.from('token_usage').insert(toFlush.map(u => this.toRow(u))));
      }

      if (error) {
        this.lastPersistenceError = `${error.code ?? ''} ${error.message ?? ''}`.trim();
        // Table absente : désactiver la persistance pour éviter d'inonder les
        // logs et de re-empiler indéfiniment les mêmes enregistrements.
        if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message ?? '')) {
          this.persistenceDisabled = true;
          this.persistenceDisabledReason = "table 'token_usage' introuvable";
          this.counters.droppedUnpersisted += toFlush.length + this.pendingFlush.length;
          this.pendingFlush = [];
          console.warn(
            "[TelemetryService] ⚠️ Table 'token_usage' introuvable — persistance désactivée. " +
            "Exécutez supabase/token_usage_schema.sql dans Supabase pour l'activer. " +
            "Les métriques restent en mémoire uniquement (non durables)."
          );
          return;
        }
        console.error('[TelemetryService] Supabase insert error:', error);
        // Erreur transitoire : ré-empiler pour retenter au prochain flush.
        this.requeue(toFlush);
      } else {
        this.counters.persisted += toFlush.length;
        this.lastFlushAt = new Date().toISOString();
        console.log(`[TelemetryService] ✓ Flushed ${toFlush.length} token usage records to Supabase`);
      }
    } catch (err) {
      this.lastPersistenceError = (err as Error)?.message ?? String(err);
      console.error('[TelemetryService] Flush exception:', err);
      this.requeue(toFlush);
    } finally {
      this.flushInProgress = false;
    }
  }

  /** Ré-empile un lot en tête, en bornant (et comptant) les pertes. */
  private requeue(batch: TokenUsage[]): void {
    this.pendingFlush.unshift(...batch);
    this.enforcePendingBound();
  }

  /**
   * Graceful shutdown: flush remaining records.
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flushToSupabase();
    if (this.pendingFlush.length > 0) {
      console.warn(`[TelemetryService] ⚠️ ${this.pendingFlush.length} enregistrement(s) non persisté(s) à l'arrêt.`);
    }
    await this.provider.shutdown();
  }
}

// ─── Singleton instance ────────────────────────────────────────────────────

export const telemetryService = new TelemetryService();
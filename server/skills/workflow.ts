import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  /** Nom du skill/action à invoquer (ex: "github_list_prs", "memory_store", "automation_search") */
  action: string;
  /** Arguments passés à l'action. Supporte les templates {{prev.result}}, {{steps.stepId.result}} */
  args: Record<string, unknown>;
  /** Nom lisible de l'étape (optionnel) */
  label?: string;
  /** Condition pour exécuter cette étape (expression simple, ex: "prev.status === 'success'") */
  condition?: string;
  /** Comportement en cas d'échec: 'stop' (défaut), 'skip', 'retry' */
  onError?: "stop" | "skip" | "retry";
  /** Nombre max de retries si onError = 'retry' */
  maxRetries?: number;
  /**
   * IDs des étapes dont celle-ci dépend. Si fourni, le moteur construit un
   * DAG et exécute en vagues parallèles (les étapes sans dépendance mutuelle
   * tournent ensemble). Si absent sur toutes les étapes, l'exécution reste
   * strictement séquentielle (ordre du tableau) — rétrocompatible.
   */
  dependsOn?: string[];
  /**
   * Durée maximale d'exécution de l'étape en ms. Au-delà, la tentative est
   * considérée comme échouée (puis retry/skip/stop selon onError).
   * Par défaut: aucun timeout (l'action s'exécute jusqu'à son terme).
   */
  timeoutMs?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  /** Expression d'intervalle pour l'exécution planifiée (ex: "24h", "30m") — optionnel */
  schedule?: string;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  lastRunStatus?: "success" | "partial" | "failed";
}

export interface WorkflowStepResult {
  stepId: string;
  action: string;
  status: "success" | "skipped" | "failed";
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface WorkflowRunResult {
  workflowId: string;
  workflowName: string;
  status: "success" | "partial" | "failed";
  startedAt: string;
  completedAt: string;
  steps: WorkflowStepResult[];
}

/** État temps réel d'un workflow en cours d'exécution */
export interface WorkflowRunState {
  workflowId: string;
  workflowName: string;
  status: "running" | "success" | "partial" | "failed";
  startedAt: string;
  completedAt?: string;
  currentStepIndex: number;
  totalSteps: number;
  currentStepId: string | null;
  currentStepAction: string | null;
  /** Progression en pourcentage (0-100) */
  progress: number;
  /** Durée écoulée en ms */
  elapsedMs: number;
  steps: WorkflowStepRunState[];
}

export interface WorkflowStepRunState {
  stepId: string;
  action: string;
  label?: string;
  status: "pending" | "running" | "success" | "skipped" | "failed";
  error?: string;
  durationMs?: number;
  startedAt?: string;
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const workflowStepSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional().default({}),
  label: z.string().optional(),
  condition: z.string().optional(),
  onError: z.enum(["stop", "skip", "retry"]).optional().default("stop"),
  maxRetries: z.number().int().min(0).max(5).optional().default(2),
  // Plafond raisonnable (1h) pour éviter qu'une étape bloque indéfiniment un run planifié.
  timeoutMs: z.number().int().min(1_000).max(3_600_000).optional(),
  dependsOn: z.array(z.string().min(1)).optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1, "Nom du workflow requis").trim(),
  description: z.string().optional().default(""),
  steps: z.array(workflowStepSchema).min(1, "Au moins une étape requise"),
  schedule: z.string().trim().optional(),
});

export const runWorkflowSchema = z.object({
  workflowId: z.string().min(1, "ID du workflow requis"),
});

export const deleteWorkflowSchema = z.object({
  workflowId: z.string().min(1, "ID du workflow requis"),
});

export const toggleWorkflowSchema = z.object({
  workflowId: z.string().min(1, "ID du workflow requis"),
  enabled: z.boolean(),
});

// ─── Storage ──────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const workflows = new Map<string, WorkflowDefinition>();
const workflowTimers = new Map<string, NodeJS.Timeout>();

/** Suivi temps réel des exécutions en cours */
const activeRuns = new Map<string, WorkflowRunState>();

/** Obtenir l'état d'exécution en cours d'un workflow (ou null s'il n'est pas en cours) */
export function getActiveRun(workflowId: string): WorkflowRunState | null {
  return activeRuns.get(workflowId) || null;
}

/** Obtenir tous les workflows en cours d'exécution */
export function getActiveRuns(): WorkflowRunState[] {
  return Array.from(activeRuns.values());
}

/**
 * Annule et retire le timer de planification d'un workflow.
 * Gère indifféremment les handles setInterval (intervalle) et setTimeout
 * (planning calendaire récursif).
 */
function clearWorkflowTimer(id: string): void {
  const timer = workflowTimers.get(id);
  if (timer) {
    clearInterval(timer);
    clearTimeout(timer);
    workflowTimers.delete(id);
  }
}

// ─── Interval parsing (reused from automation) ────────────────────────────────

function parseInterval(expr: string): number | null {
  const match = expr.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|jour|jours)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "s": case "sec": case "secs": case "second": case "seconds":
      return value * 1000;
    case "m": case "min": case "mins": case "minute": case "minutes":
      return value * 60 * 1000;
    case "h": case "hr": case "hrs": case "hour": case "hours":
      return value * 60 * 60 * 1000;
    case "d": case "day": case "days": case "jour": case "jours":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * Calcule le délai (ms) jusqu'à la prochaine occurrence d'un planning calendaire :
 *   - "daily:HH:MM"          → chaque jour à l'heure dite
 *   - "weekly:<day>@HH:MM"   → chaque semaine le jour dit (mon..sun) à l'heure dite
 * Retourne null si l'expression n'est pas un planning calendaire reconnu.
 */
function nextCalendarDelay(expr: string, from: Date = new Date()): number | null {
  const daily = expr.match(/^daily:(\d{1,2}):(\d{2})$/i);
  if (daily) {
    const h = Number(daily[1]);
    const m = Number(daily[2]);
    if (h > 23 || m > 59) return null;
    const next = new Date(from);
    next.setHours(h, m, 0, 0);
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - from.getTime();
  }

  const weekly = expr.match(/^weekly:([a-z]{3})@(\d{1,2}):(\d{2})$/i);
  if (weekly) {
    const dayKey = weekly[1].toLowerCase();
    const targetDow = WEEKDAY_INDEX[dayKey];
    if (targetDow === undefined) return null;
    const h = Number(weekly[2]);
    const m = Number(weekly[3]);
    if (h > 23 || m > 59) return null;
    const next = new Date(from);
    next.setHours(h, m, 0, 0);
    let dayDiff = (targetDow - next.getDay() + 7) % 7;
    if (dayDiff === 0 && next.getTime() <= from.getTime()) dayDiff = 7;
    next.setDate(next.getDate() + dayDiff);
    return next.getTime() - from.getTime();
  }

  return null;
}

// ─── Template resolution ──────────────────────────────────────────────────────

/**
 * Résout les templates dans les arguments d'une étape.
 * Supporte:
 *  - {{prev.result}}   → résultat de l'étape précédente
 *  - {{prev.status}}   → statut de l'étape précédente
 *  - {{steps.ID.result}} → résultat d'une étape spécifique par son id
 *  - {{steps.ID.status}} → statut d'une étape spécifique
 */
function resolveTemplates(
  args: Record<string, unknown>,
  stepResults: WorkflowStepResult[],
  prevResult: WorkflowStepResult | null
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      resolved[key] = resolveStringTemplate(value, stepResults, prevResult);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      resolved[key] = resolveTemplates(value as Record<string, unknown>, stepResults, prevResult);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

function resolveStringTemplate(
  template: string,
  stepResults: WorkflowStepResult[],
  prevResult: WorkflowStepResult | null
): unknown {
  // If the entire string is a single template placeholder, return the raw value (not stringified)
  const fullMatch = template.match(/^\{\{(.+?)\}\}$/);
  if (fullMatch) {
    return resolveReference(fullMatch[1].trim(), stepResults, prevResult);
  }

  // Otherwise do string interpolation
  return template.replace(/\{\{(.+?)\}\}/g, (_, ref) => {
    const val = resolveReference(ref.trim(), stepResults, prevResult);
    return typeof val === "string" ? val : JSON.stringify(val);
  });
}

/**
 * Accès sécurisé à une propriété imbriquée via un chemin ("a.b.0.c").
 * Protège contre la prototype-pollution et supporte l'indexation de tableaux.
 * Retourne `undefined` dès qu'un maillon est null/undefined.
 */
function getByPath(root: unknown, path: string[]): unknown {
  let current: any = root;
  for (const rawKey of path) {
    if (current === null || current === undefined) return undefined;
    const key = rawKey;
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return undefined;
    }
    // Indexation de tableau par entier (ex: items.0)
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      current = current[Number(key)];
      continue;
    }
    if (typeof current !== "object" && typeof current !== "string") {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Résout une référence de template.
 * Supporte les champs de base (result/status/error) ET l'accès profond :
 *   - prev.result.branch
 *   - steps.ID.result.summary.total
 *   - steps.ID.result.items.0.name  (indexation de tableau)
 */
function resolveReference(
  ref: string,
  stepResults: WorkflowStepResult[],
  prevResult: WorkflowStepResult | null
): unknown {
  // prev.<field>[.<deep.path>]
  if (ref.startsWith("prev.")) {
    if (!prevResult) return undefined;
    const parts = ref.slice(5).split(".");
    return resolveStepField(prevResult, parts);
  }

  // steps.STEP_ID.<field>[.<deep.path>]
  if (ref.startsWith("steps.")) {
    const parts = ref.slice(6).split(".");
    if (parts.length < 2) return undefined;
    const stepId = parts[0];
    const step = stepResults.find((s) => s.stepId === stepId);
    if (!step) return undefined;
    return resolveStepField(step, parts.slice(1));
  }

  return undefined;
}

/**
 * Résout `field[.deep.path]` sur un résultat d'étape.
 * `field` ∈ { result, status, error } ; le reste du chemin descend dans la valeur.
 */
function resolveStepField(step: WorkflowStepResult, parts: string[]): unknown {
  const field = parts[0];
  const rest = parts.slice(1);
  let base: unknown;
  if (field === "result") base = step.result;
  else if (field === "status") base = step.status;
  else if (field === "error") base = step.error;
  else return undefined;

  if (rest.length === 0) return base;
  return getByPath(base, rest);
}

// ─── Condition evaluation (safe, no eval/new Function) ───────────────────────

type Value = any;
type Token = { type: string; value?: any; raw?: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let s = "";
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\" && i + 1 < expr.length) { s += expr[i + 1]; i += 2; }
        else { s += expr[i]; i++; }
      }
      if (i >= expr.length) throw new Error("Unterminated string");
      i++;
      tokens.push({ type: "string", value: s });
      continue;
    }
    if (/\d/.test(ch)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let id = "";
      while (i < expr.length && /[A-Za-z0-9_$]/.test(expr[i])) { id += expr[i]; i++; }
      if (id === "true" || id === "false") tokens.push({ type: "boolean", value: id === "true" });
      else if (id === "null") tokens.push({ type: "null", value: null });
      else if (id === "undefined") tokens.push({ type: "undefined", value: undefined });
      else tokens.push({ type: "ident", value: id, raw: id });
      continue;
    }
    const two = expr.slice(i, i + 2);
    const three = expr.slice(i, i + 3);
    if (three === "===" || three === "!==") { tokens.push({ type: "op", value: three }); i += 3; continue; }
    if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||" || two === "?.") {
      tokens.push({ type: "op", value: two }); i += 2; continue;
    }
    if (ch === "(" || ch === ")" || ch === "!" || ch === "<" || ch === ">" || ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%" || ch === "?" || ch === ":" || ch === "." || ch === "[") {
      if (ch === "[") tokens.push({ type: "lbrack" });
      else if (ch === "(") tokens.push({ type: "lparen" });
      else if (ch === ")") tokens.push({ type: "rparen" });
      else if (ch === "?") tokens.push({ type: "question" });
      else if (ch === ":") tokens.push({ type: "colon" });
      else if (ch === ".") tokens.push({ type: "dot" });
      else tokens.push({ type: "op", value: ch });
      i++;
      if (ch === "[") { if (expr[i - 1 + 1] === undefined) {} /*noop*/ }
      continue;
    }
    if (ch === "]") { tokens.push({ type: "rbrack" }); i++; continue; }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

const PREC: Record<string, number> = {
  "||": 1, "&&": 2,
  "==": 3, "!=": 3, "===": 3, "!==": 3,
  "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
  "!": 7, "u-": 7,
};
const RIGHT_ASSOC = new Set(["?:"]);

function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const stack: Token[] = [];
  let prevTok: Token | null = null;
  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    if (["string", "number", "boolean", "null", "undefined", "ident"].includes(tok.type)) {
      out.push(tok);
    } else if (tok.type === "lparen") {
      stack.push(tok);
    } else if (tok.type === "rparen") {
      while (stack.length && stack[stack.length - 1].type !== "lparen") out.push(stack.pop()!);
      if (!stack.length) throw new Error("Mismatched parens");
      stack.pop();
    } else if (tok.type === "lbrack") {
      stack.push(tok);
    } else if (tok.type === "rbrack") {
      while (stack.length && stack[stack.length - 1].type !== "lbrack") out.push(stack.pop()!);
      if (!stack.length) throw new Error("Mismatched brackets");
      stack.pop();
      out.push({ type: "op", value: "[]" });
    } else if (tok.type === "dot") {
      stack.push({ type: "op", value: "." });
      const next = tokens[idx + 1];
      if (next && next.type === "ident") { out.push(next); idx++; }
      else throw new Error("Expected ident after dot");
      out.push(stack.pop()!);
      prevTok = tok;
      continue;
    } else if (tok.type === "question") {
      stack.push(tok);
    } else if (tok.type === "colon") {
      let foundQuestion = false;
      while (stack.length) {
        const t = stack.pop()!;
        if (t.type === "question") { foundQuestion = true; break; }
        out.push(t);
      }
      if (!foundQuestion) throw new Error("Colon without matching ?");
      stack.push({ type: "op", value: "?:" });
    } else if (tok.type === "op") {
      let opVal = tok.value;
      if (opVal === "-" && (!prevTok || (prevTok.type === "op" || prevTok.type === "lparen" || prevTok.type === "lbrack" || prevTok.type === "question" || prevTok.type === "colon"))) {
        opVal = "u-";
      }
      if (opVal === "+" && (!prevTok || (prevTok.type === "op" || prevTok.type === "lparen" || prevTok.type === "lbrack" || prevTok.type === "question" || prevTok.type === "colon"))) {
        prevTok = tok;
        continue;
      }
      const prec = PREC[opVal];
      if (!prec) throw new Error(`Unknown operator: ${opVal}`);
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type === "op" && top.value !== "?:" && top.value !== "." && top.value !== "[]") {
          const topPrec = PREC[top.value];
          if (!topPrec) break;
          if (topPrec > prec || (topPrec === prec && !RIGHT_ASSOC.has(opVal))) {
            out.push(stack.pop()!);
            continue;
          }
        }
        break;
      }
      stack.push({ type: "op", value: opVal });
    }
    prevTok = tok;
  }
  while (stack.length) {
    const t = stack.pop()!;
    if (t.type === "lparen" || t.type === "lbrack" || t.type === "question") throw new Error("Mismatched brackets/parens");
    out.push(t);
  }
  return out;
}

function safePropGet(obj: any, key: string): Value {
  if (obj === null || obj === undefined) return undefined;
  if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
  return obj[key];
}

function safeIndexGet(obj: any, key: any): Value {
  if (obj === null || obj === undefined) return undefined;
  if (typeof key !== "string" && typeof key !== "number") return undefined;
  if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
  return obj[key];
}

interface EvalCtx {
  prev: { result?: any; status?: any; error?: any };
  steps: Record<string, { result?: any; status?: any; error?: any }>;
}

function evalRpn(rpn: Token[], ctx: EvalCtx): Value {
  const stack: Value[] = [];
  for (const tok of rpn) {
    if (tok.type === "string" || tok.type === "number" || tok.type === "boolean" || tok.type === "null" || tok.type === "undefined") {
      stack.push(tok.value);
    } else if (tok.type === "ident") {
      const name = tok.value;
      if (name === "prev") stack.push(ctx.prev);
      else if (name === "steps") stack.push(ctx.steps);
      else throw new Error(`Unknown identifier: ${name} (only 'prev' and 'steps' are allowed)`);
    } else if (tok.type === "op") {
      const op = tok.value;
      if (op === "!") { const a = stack.pop(); stack.push(!a); }
      else if (op === "u-") { const a = stack.pop(); stack.push(-Number(a)); }
      else if (op === ".") {
        const key = stack.pop() as string;
        const obj = stack.pop();
        stack.push(safePropGet(obj, key));
      } else if (op === "[]") {
        const key = stack.pop();
        const obj = stack.pop();
        stack.push(safeIndexGet(obj, key));
      } else if (op === "?:") {
        const c = stack.pop();
        const a = stack.pop();
        const b = stack.pop();
        stack.push(b ? a : c);
      } else {
        const b = stack.pop();
        const a = stack.pop();
        switch (op) {
          case "||": stack.push(a || b); break;
          case "&&": stack.push(a && b); break;
          case "==": stack.push(a == b); break;
          case "!=": stack.push(a != b); break;
          case "===": stack.push(a === b); break;
          case "!==": stack.push(a !== b); break;
          case "<": stack.push(a < b); break;
          case ">": stack.push(a > b); break;
          case "<=": stack.push(a <= b); break;
          case ">=": stack.push(a >= b); break;
          case "+": stack.push(Number(a) + Number(b)); break;
          case "-": stack.push(Number(a) - Number(b)); break;
          case "*": stack.push(Number(a) * Number(b)); break;
          case "/": stack.push(Number(a) / Number(b)); break;
          case "%": stack.push(Number(a) % Number(b)); break;
          default: throw new Error(`Unknown op in eval: ${op}`);
        }
      }
    }
  }
  if (stack.length !== 1) throw new Error(`Invalid expression (stack size ${stack.length})`);
  return stack[0];
}

function evaluateCondition(
  condition: string,
  stepResults: WorkflowStepResult[],
  prevResult: WorkflowStepResult | null
): boolean {
  try {
    if (typeof condition !== "string") {
      console.warn(`[Workflow] Condition is not a string — skipping evaluation`);
      return true;
    }
    const trimmed = condition.trim();
    if (trimmed.length === 0) return true;
    if (trimmed.length > 500) {
      console.warn(`[Workflow] Condition too long (${trimmed.length} chars) — blocked`);
      return false;
    }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(trimmed)) {
      console.warn(`[Workflow] Condition contains control characters — blocked`);
      return false;
    }

    const tokens = tokenize(trimmed);
    const rpn = toRpn(tokens);

    const prev = prevResult
      ? { result: prevResult.result, status: prevResult.status, error: prevResult.error }
      : { result: undefined, status: undefined, error: undefined };
    const stepsMap: Record<string, any> = {};
    for (const sr of stepResults) {
      stepsMap[sr.stepId] = Object.freeze({ result: sr.result, status: sr.status, error: sr.error });
    }
    const ctx: EvalCtx = {
      prev: Object.freeze(prev),
      steps: Object.freeze(stepsMap),
    };

    return !!evalRpn(rpn, ctx);
  } catch (e: any) {
    console.warn(`[Workflow] Condition evaluation failed: "${condition}" — ${e?.message || e}`);
    return false;
  }
}

// ─── Workflow execution engine ────────────────────────────────────────────────

/**
 * Exécute une promesse avec un timeout optionnel. Si `timeoutMs` est fourni et
 * dépassé, la promesse de résultat est rejetée avec une erreur explicite.
 * Note : l'action sous-jacente n'est pas annulée (pas d'AbortController côté
 * skills), mais son résultat est ignoré et l'étape est marquée en échec.
 */
function withStepTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Étape dépassée après ${timeoutMs}ms (timeout)`)),
      timeoutMs,
    );
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Référence au handleToolCall du SkillManager, injectée au démarrage */
let skillHandler: ((name: string, args: any) => Promise<any>) | null = null;

export function setWorkflowSkillHandler(handler: (name: string, args: any) => Promise<any>) {
  skillHandler = handler;
}

// ─── DAG planning ─────────────────────────────────────────────────────────────

/**
 * Valide les références `dependsOn` et calcule l'ordre d'exécution en vagues
 * (chaque vague = étapes dont toutes les dépendances sont déjà satisfaites).
 * Lève une erreur explicite en cas de dépendance inexistante ou de cycle.
 *
 * Si aucune étape n'a de `dependsOn`, retourne une unique "vague" par étape
 * dans l'ordre du tableau → équivalent strictement séquentiel (rétrocompatible).
 */
export function planWorkflowWaves(steps: WorkflowStep[]): WorkflowStep[][] {
  const byId = new Map<string, WorkflowStep>();
  for (const s of steps) {
    if (byId.has(s.id)) {
      throw new Error(`ID d'étape dupliqué: "${s.id}"`);
    }
    byId.set(s.id, s);
  }

  const hasDeps = steps.some((s) => (s.dependsOn?.length ?? 0) > 0);

  // Pas de dépendances → séquentiel pur (une étape par vague, ordre d'origine).
  if (!hasDeps) {
    return steps.map((s) => [s]);
  }

  // Vérifier que chaque dépendance existe.
  for (const s of steps) {
    for (const dep of s.dependsOn ?? []) {
      if (!byId.has(dep)) {
        throw new Error(`Étape "${s.id}" dépend de "${dep}" qui n'existe pas.`);
      }
      if (dep === s.id) {
        throw new Error(`Étape "${s.id}" ne peut pas dépendre d'elle-même.`);
      }
    }
  }

  // Vagues : tant qu'il reste des étapes, prendre celles dont toutes les
  // dépendances sont déjà "complétées". Détecte les cycles (aucune progression).
  const waves: WorkflowStep[][] = [];
  const completed = new Set<string>();
  const remaining = new Set(steps.map((s) => s.id));

  while (remaining.size > 0) {
    const wave: WorkflowStep[] = [];
    for (const id of remaining) {
      const step = byId.get(id)!;
      const deps = step.dependsOn ?? [];
      if (deps.every((d) => completed.has(d))) {
        wave.push(step);
      }
    }

    if (wave.length === 0) {
      const stuck = Array.from(remaining).join(", ");
      throw new Error(`Dépendance circulaire détectée entre les étapes: ${stuck}`);
    }

    // Préserver l'ordre de déclaration à l'intérieur d'une vague (déterminisme).
    wave.sort((a, b) => steps.indexOf(a) - steps.indexOf(b));

    for (const s of wave) {
      remaining.delete(s.id);
      completed.add(s.id);
    }
    waves.push(wave);
  }

  return waves;
}

/** Contexte mutable partagé pendant un run (suivi temps réel + résultats). */
interface RunContext {
  stepResults: WorkflowStepResult[];
  runState: WorkflowRunState;
  stepIndexById: Map<string, number>;
}

/**
 * Exécute une étape unique (condition, templates, retry, timeout) et met à jour
 * le suivi temps réel. Retourne le résultat typé de l'étape.
 */
async function runSingleStep(step: WorkflowStep, ctx: RunContext): Promise<WorkflowStepResult> {
  const idx = ctx.stepIndexById.get(step.id)!;
  const stateStep = ctx.runState.steps[idx];

  // En mode DAG, `prev` = dernière étape complétée (ordre d'insertion).
  const prevResult = ctx.stepResults.length > 0 ? ctx.stepResults[ctx.stepResults.length - 1] : null;

  stateStep.status = "running";
  stateStep.startedAt = new Date().toISOString();

  // Évaluation de la condition
  if (step.condition) {
    const shouldRun = evaluateCondition(step.condition, ctx.stepResults, prevResult);
    if (!shouldRun) {
      console.log(`[Workflow]   ⏭ Étape "${step.id}" skipped (condition non remplie)`);
      stateStep.status = "skipped";
      const skipped: WorkflowStepResult = { stepId: step.id, action: step.action, status: "skipped", durationMs: 0 };
      return skipped;
    }
  }

  // Résolution des templates dans les arguments
  const resolvedArgs = resolveTemplates(step.args, ctx.stepResults, prevResult);

  const maxAttempts = step.onError === "retry" ? (step.maxRetries || 2) : 1;
  let lastError: string | undefined;
  let result: any;
  let success = false;
  const stepStart = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`[Workflow]   ▷ Étape "${step.id}" → ${step.action}${attempt > 0 ? ` (retry ${attempt})` : ""}${step.timeoutMs ? ` [timeout ${step.timeoutMs}ms]` : ""}`);
      result = await withStepTimeout(skillHandler!(step.action, resolvedArgs), step.timeoutMs);

      if (result && typeof result === "object" && result.error) {
        lastError = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
        if (attempt < maxAttempts - 1) continue;
      } else {
        success = true;
        break;
      }
    } catch (e: any) {
      lastError = e.message || String(e);
      if (attempt < maxAttempts - 1) {
        console.log(`[Workflow]     ⟳ Retry ${attempt + 1}/${maxAttempts - 1}`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // backoff
      }
    }
  }

  const durationMs = Date.now() - stepStart;

  if (success) {
    stateStep.status = "success";
    stateStep.durationMs = durationMs;
    console.log(`[Workflow]   ✓ Étape "${step.id}" réussie (${durationMs}ms)`);
    return { stepId: step.id, action: step.action, status: "success", result, durationMs };
  }

  stateStep.status = "failed";
  stateStep.error = lastError;
  stateStep.durationMs = durationMs;
  console.log(`[Workflow]   ✗ Étape "${step.id}" échouée: ${lastError}`);
  return { stepId: step.id, action: step.action, status: "failed", error: lastError, durationMs };
}

export async function executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowRunResult> {
  if (!skillHandler) {
    throw new Error("Workflow skill handler not configured. Call setWorkflowSkillHandler first.");
  }

  const startedAt = new Date().toISOString();
  const stepResults: WorkflowStepResult[] = [];
  let overallStatus: "success" | "partial" | "failed" = "success";

  // ── Initialisation du suivi temps réel ────────────────────────────────
  const stepIndexById = new Map<string, number>();
  workflow.steps.forEach((s, i) => stepIndexById.set(s.id, i));

  const runState: WorkflowRunState = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "running",
    startedAt,
    currentStepIndex: 0,
    totalSteps: workflow.steps.length,
    currentStepId: null,
    currentStepAction: null,
    progress: 0,
    elapsedMs: 0,
    steps: workflow.steps.map((s) => ({
      stepId: s.id,
      action: s.action,
      label: s.label,
      status: "pending" as const,
    })),
  };
  activeRuns.set(workflow.id, runState);

  // Timer pour mettre à jour le temps écoulé
  const startTime = Date.now();
  const elapsedTimer = setInterval(() => {
    runState.elapsedMs = Date.now() - startTime;
  }, 250);

  const ctx: RunContext = { stepResults, runState, stepIndexById };

  // ── Planification (DAG en vagues, ou séquentiel pur si aucun dependsOn) ──
  let waves: WorkflowStep[][];
  try {
    waves = planWorkflowWaves(workflow.steps);
  } catch (planErr: any) {
    clearInterval(elapsedTimer);
    activeRuns.delete(workflow.id);
    const msg = planErr?.message || String(planErr);
    console.error(`[Workflow] ✗ Planification impossible pour "${workflow.name}": ${msg}`);
    const completedAt = new Date().toISOString();
    return { workflowId: workflow.id, workflowName: workflow.name, status: "failed", startedAt, completedAt, steps: [] };
  }

  const isParallel = waves.some((w) => w.length > 1);
  console.log(`[Workflow] ▶ Démarrage: "${workflow.name}" (${workflow.steps.length} étapes, ${waves.length} vague(s)${isParallel ? ", DAG parallèle" : ""})`);

  let completedCount = 0;
  let aborted = false;

  for (const wave of waves) {
    if (aborted) break;

    // Mettre à jour l'indicateur courant (première étape de la vague).
    const firstStep = wave[0];
    runState.currentStepIndex = stepIndexById.get(firstStep.id) ?? completedCount;
    runState.currentStepId = firstStep.id;
    runState.currentStepAction = firstStep.action;
    runState.progress = Math.round((completedCount / workflow.steps.length) * 100);

    // Exécuter toutes les étapes de la vague en parallèle (1 seule si séquentiel).
    const waveResults = await Promise.all(wave.map((step) => runSingleStep(step, ctx)));

    // Enregistrer les résultats dans l'ordre de la vague.
    for (const res of waveResults) {
      stepResults.push(res);
      completedCount++;

      if (res.status === "failed") {
        const step = workflow.steps[stepIndexById.get(res.stepId)!];
        if ((step.onError ?? "stop") === "stop") {
          overallStatus = "failed";
          aborted = true;
        } else {
          // skip/retry épuisé — on continue mais le run est "partial".
          if (overallStatus === "success") overallStatus = "partial";
        }
      }
    }
  }

  // Si pas d'échec explicite, vérifier si toutes les étapes sont ok
  if (overallStatus === "success") {
    const hasFailed = stepResults.some((s) => s.status === "failed");
    if (hasFailed) overallStatus = "partial";
  }

  const completedAt = new Date().toISOString();
  console.log(`[Workflow] ■ Terminé: "${workflow.name}" → ${overallStatus}`);

  // Finaliser le suivi temps réel
  clearInterval(elapsedTimer);
  runState.status = overallStatus;
  runState.completedAt = completedAt;
  runState.progress = 100;
  runState.elapsedMs = Date.now() - startTime;
  runState.currentStepId = null;
  runState.currentStepAction = null;

  // Garder l'état final visible pendant 10s, puis nettoyer
  setTimeout(() => {
    activeRuns.delete(workflow.id);
  }, 10_000);

  // Mise à jour de l'état du workflow
  workflow.lastRunAt = Date.now();
  workflow.lastRunStatus = overallStatus;
  workflows.set(workflow.id, workflow);

  // Persistance en BDD
  if (supabase) {
    const { error: dbErr } = await supabase
      .from("workflows")
      .update({ last_run_at: completedAt, last_run_status: overallStatus })
      .eq("id", workflow.id);
    if (dbErr) console.error("[Workflow] DB update failed:", dbErr);
  }

  return { workflowId: workflow.id, workflowName: workflow.name, status: overallStatus, startedAt, completedAt, steps: stepResults };
}

// ─── CRUD operations ──────────────────────────────────────────────────────────

export async function createWorkflow(input: z.input<typeof createWorkflowSchema>): Promise<WorkflowDefinition> {
  const parsedInput = createWorkflowSchema.parse(input);
  const id = crypto.randomUUID();
  const workflow: WorkflowDefinition = {
    id,
    name: parsedInput.name,
    description: parsedInput.description,
    steps: parsedInput.steps.map((s) => ({
      id: s.id,
      action: s.action,
      args: s.args,
      label: s.label,
      condition: s.condition,
      onError: s.onError || "stop",
      maxRetries: s.maxRetries,
      timeoutMs: s.timeoutMs,
      dependsOn: s.dependsOn,
    })),
    schedule: parsedInput.schedule,
    enabled: true,
    createdAt: Date.now(),
  };

  // Persistance BDD
  if (supabase) {
    const { error } = await supabase.from("workflows").insert({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      steps: workflow.steps,
      schedule: workflow.schedule || null,
      enabled: workflow.enabled,
    });
    if (error) {
      console.error("[Workflow] DB insert failed:", error);
    }
  }

  workflows.set(id, workflow);

  // Planification si schedule défini
  if (workflow.schedule) {
    scheduleWorkflow(workflow);
  }

  return workflow;
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return workflows.get(id);
}

export function listWorkflows(): WorkflowDefinition[] {
  return Array.from(workflows.values());
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  // Annuler le timer
  clearWorkflowTimer(id);

  // Supprimer en BDD
  if (supabase) {
    await supabase.from("workflows").delete().eq("id", id);
  }

  return workflows.delete(id);
}

export async function toggleWorkflow(id: string, enabled: boolean): Promise<WorkflowDefinition | null> {
  const wf = workflows.get(id);
  if (!wf) return null;

  wf.enabled = enabled;
  workflows.set(id, wf);

  if (enabled && wf.schedule) {
    scheduleWorkflow(wf);
  } else {
    clearWorkflowTimer(id);
  }

  if (supabase) {
    await supabase.from("workflows").update({ enabled }).eq("id", id);
  }

  return wf;
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

function scheduleWorkflow(workflow: WorkflowDefinition): void {
  // Clear existing timer (setInterval ET setTimeout partagent le type Timeout).
  const existing = workflowTimers.get(workflow.id);
  if (existing) {
    clearInterval(existing);
    clearTimeout(existing);
    workflowTimers.delete(workflow.id);
  }

  if (!workflow.schedule || !workflow.enabled) return;

  const runNow = async () => {
    const current = workflows.get(workflow.id);
    if (!current || !current.enabled) return;
    try {
      await executeWorkflow(current);
    } catch (e) {
      console.error(`[Workflow] Scheduled execution failed for "${workflow.name}":`, e);
    }
  };

  // ── Cas 1 : intervalle fixe (ex: "30m", "24h", "2d") ──────────────────
  const intervalMs = parseInterval(workflow.schedule);
  if (intervalMs) {
    const timer = setInterval(runNow, intervalMs);
    workflowTimers.set(workflow.id, timer);
    console.log(`[Workflow] Planifié: "${workflow.name}" toutes les ${workflow.schedule}`);
    return;
  }

  // ── Cas 2 : planning calendaire (ex: "daily:08:00", "weekly:mon@09:00") ──
  const calendarDelay = nextCalendarDelay(workflow.schedule);
  if (calendarDelay !== null) {
    const scheduleNext = () => {
      const delay = nextCalendarDelay(workflow.schedule!);
      if (delay === null) return;
      const timer = setTimeout(async () => {
        await runNow();
        // Re-planifier la prochaine occurrence après exécution.
        const stillEnabled = workflows.get(workflow.id)?.enabled;
        if (stillEnabled) scheduleNext();
      }, delay);
      if (typeof timer.unref === "function") timer.unref();
      workflowTimers.set(workflow.id, timer);
    };
    scheduleNext();
    console.log(`[Workflow] Planifié (calendaire): "${workflow.name}" → ${workflow.schedule} (prochaine occurrence dans ${Math.round(calendarDelay / 1000)}s)`);
    return;
  }

  console.warn(`[Workflow] Schedule invalide pour "${workflow.name}": ${workflow.schedule}`);
}

// ─── Load from DB ─────────────────────────────────────────────────────────────

export async function loadWorkflows(): Promise<void> {
  if (!supabase) return;

  // Clear existing timers (interval + timeout)
  for (const timer of workflowTimers.values()) {
    clearInterval(timer);
    clearTimeout(timer);
  }
  workflowTimers.clear();
  workflows.clear();

  const { data, error } = await supabase.from("workflows").select("*");

  if (error) {
    console.error("[Workflow] Erreur chargement depuis BDD:", error);
    return;
  }

  if (data) {
    for (const row of data) {
      const wf: WorkflowDefinition = {
        id: row.id,
        name: row.name,
        description: row.description || "",
        steps: row.steps || [],
        schedule: row.schedule || undefined,
        enabled: row.enabled ?? true,
        createdAt: new Date(row.created_at).getTime(),
        lastRunAt: row.last_run_at ? new Date(row.last_run_at).getTime() : undefined,
        lastRunStatus: row.last_run_status || undefined,
      };
      workflows.set(wf.id, wf);

      if (wf.enabled && wf.schedule) {
        scheduleWorkflow(wf);
      }
    }
    console.log(`[Workflow] ${data.length} workflow(s) chargé(s) depuis la BDD.`);
  }
}

export function getWorkflowsSnapshot(): WorkflowDefinition[] {
  return Array.from(workflows.values());
}

/**
 * Arrête tous les timers de planification de workflows.
 * À appeler lors du graceful shutdown du serveur pour éviter les
 * MaxListenersExceededWarning et les exécutions zombies après hot-reload.
 */
export function stopAllWorkflowTimers(): void {
  const count = workflowTimers.size;
  for (const timer of workflowTimers.values()) {
    clearInterval(timer);
    clearTimeout(timer);
  }
  workflowTimers.clear();
  console.log(`[Workflow] ${count} timer(s) arrêté(s).`);
}

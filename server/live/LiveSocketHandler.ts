/**
 * LiveSocketHandler — Gestion de la connexion WebSocket Gemini Live.
 *
 * Ce module regroupe TOUTE la logique de la session Gemini Live API
 * qui était inline dans server.ts (≈ lignes 1708–3161).
 *
 * Utilisation dans server.ts :
 *   const { attachLiveWebSocket } = await import('./server/live/LiveSocketHandler');
 *   attachLiveWebSocket(wss, sandboxWss, deps);
 *
 * Sprint 1 — découpage de server.ts.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Behavior } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import type { SkillManagerV2 } from '../runtime/compat/SkillManagerV2.js';
import { buildSystemInstruction, type ProfileConfig } from '../prompts/systemInstruction.js';
import { startConversation, endConversation, saveMessage, getConversationMessages } from '../skills/history.js';
import { isSandboxActive } from '../utils/sandbox.js';
import { subscribeToValidation } from '../utils/postEditValidator.js';
import { estimateTokens, summarizeWithLLM } from '../utils/tokenOptimizer.js';
import { knowledgeGraph, projectMemory, understandingEngine } from '../knowledge/index.js';
import { Supervisor } from '../autonomy/index.js';
import { WORKSPACE_SITE_URL } from '../utils/selfRoot.js';
import type { BrowserPendingEntry, BrowserActionPendingEntry } from '../routes/browser.js';

// Type compatible avec l'ancien SkillManager pour une migration progressive
type SkillManager = SkillManagerV2;

interface SessionContextGate {
  active: boolean;
  confidence: number | null;
  risk: string | null;
  requiredFiles: Set<string>;
  readFiles: Set<string>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LiveSocketDeps {
  skillManager: SkillManager;
  getCurrentProfile: () => ProfileConfig;
  getWorkspaceRoot: () => string;
  createGeminiAI: () => GoogleGenAI;
  activeGeminiSessions: Set<any>;
  browserReadPending: Map<string, BrowserPendingEntry>;
  browserActionPending: Map<string, BrowserActionPendingEntry>;
}

// Plafond de taille (en caractères) appliqué à chaque résultat d'outil injecté
// dans la session Live. La fenêtre réelle du modèle est 131 072 tokens : un
// résultat d'outil unique ne doit pas en consommer une part disproportionnée.
// Plafonds par outil, calibrés selon leur volume typique. ~16k car. ≈ ~5k tokens.
const TOOL_RESULT_CAPS: Record<string, number> = {
  read_project_file: 24_000,
  generate_codebase_markdown: 16_000,
  list_project_files: 10_000,
  // Troncature agressive : les résultats de recherche multi-fichiers peuvent
  // exploser en volume (beaucoup de matches) sans proportionnellement plus
  // de valeur informative. Plafond resserré à 5 000 caractères.
  search_in_files: 5_000,
  browser_read_content: 14_000,
  browser_get_accessibility_snapshot: 12_000,
};
/** Plafond par défaut (caractères) pour un résultat d'outil sans entrée dédiée. */
const DEFAULT_TOOL_RESULT_CAP = 16_000;
/** Plafond global (caractères) pour l'ensemble d'un lot de réponses d'outils. */
const TOOL_RESULT_BATCH_CAP = 32_000;

/** Plafond applicable à un outil donné. */
function toolResultCap(toolName: string): number {
  return TOOL_RESULT_CAPS[toolName] ?? DEFAULT_TOOL_RESULT_CAP;
}

// ─── Constantes retry tool calls ─────────────────────────────────────────────

/** Nombre maximum de tentatives supplémentaires pour les erreurs transientes. */
const TOOL_MAX_RETRIES = 2;
/** Délai de base en ms entre les tentatives (backoff exponentiel : 1s, 2s). */
const TOOL_RETRY_DELAY_MS = 1000;

// ─── Constantes rate limiting audio ──────────────────────────────────────────

/** Débit audio maximum autorisé par connexion WebSocket, en octets/seconde.
 *  Le PCM 16 kHz / 16 bits mono ≈ 31,25 KB/s ; 64 KB/s laisse une marge x2. */
const AUDIO_RATE_LIMIT_BYTES_PER_SEC = 64 * 1024; // 64 KB/s
/** Durée de la fenêtre glissante pour mesurer le débit audio, en ms. */
const AUDIO_RATE_WINDOW_MS = 1000;
/** Nombre de violations avant de logguer un avertissement groupé. */
const AUDIO_RATE_VIOLATION_LOG_INTERVAL = 10;

/**
 * Détermine si une erreur sur un tool call mérite d'être retentée.
 * Seules les erreurs transientes (réseau, IO, timeout) sont retryables.
 * Les erreurs métier (validation, permission, outil introuvable) ne le sont pas.
 */
function isRetryableToolError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const name = (err as any).name ?? '';

  // Erreurs non-retryables : logique métier, permission, validation
  if (name === 'ToolNotFoundError') return false;
  if (name === 'ToolPermissionError') return false;
  if (msg.includes('mode ask') || msg.includes('interdit') || msg.includes('bloqué')) return false;
  if (msg.includes('validation') || msg.includes('invalid') || msg.includes('zod')) return false;
  if (msg.includes('supervisor') || msg.includes('context gate')) return false;

  // Erreurs retryables : timeout, réseau, IO, erreurs génériques d'exécution
  if (name === 'ToolTimeoutError') return true;
  if (msg.includes('timeout') || msg.includes('timed out')) return true;
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('econnreset')) return true;
  if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('socket')) return true;
  if (msg.includes('enoent') || msg.includes('eperm') || msg.includes('ebusy')) return true;

  // Par défaut, réessayer pour les erreurs inconnues (conservative retry)
  return true;
}

/**
 * Attend `ms` millisecondes (pour le backoff entre retries).
 */
function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Coercition des arguments d'outils (robustesse STT) ───────────────────────
// En session vocale, la STT peut mal formater les arguments : chemins avec
// backslashes ou espaces parasites, JSON imbriqué renvoyé sous forme de string,
// nombres/booléens en string. Ces déformations provoquent des erreurs de
// validation (Zod) ou des 400. On applique une passe de normalisation
// CONSERVATRICE avant validation : on ne corrige que les cas non ambigus, jamais
// de devinette agressive qui pourrait fausser un argument volontaire.

/** Noms d'arguments traités comme des chemins de fichiers (normalisation dédiée). */
const PATH_ARG_KEYS = new Set([
  'path', 'newPath', 'oldPath', 'filePath', 'file', 'dir', 'directory', 'folder', 'target',
]);

/**
 * Normalise un chemin de fichier mal formaté par la STT :
 *   - backslashes Windows → slashes POSIX (le workspace est normalisé en slash) ;
 *   - trim des espaces en bordure ;
 *   - suppression d'un préfixe « ./ » redondant ;
 *   - compactage des espaces parasites autour des séparateurs (« src / main .tsx »
 *     → « src/main.tsx ») que la dictée vocale insère fréquemment.
 * Ne touche jamais aux URLs (http/https) ni aux chemins déjà propres.
 */
function normalizeArgPath(value: string): string {
  let p = value.trim();
  if (!p) return value;
  // Ne pas toucher aux URLs.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return value;
  p = p.replace(/\\/g, '/');
  // Espaces autour des séparateurs de chemin : « a / b » → « a/b ».
  p = p.replace(/\s*\/\s*/g, '/');
  // Espace avant une extension de fichier : « main .tsx » → « main.tsx ».
  p = p.replace(/\s+\.(\w+)$/g, '.$1');
  // Préfixe « ./ » redondant.
  p = p.replace(/^\.\//, '');
  return p;
}

/** Détecte une string qui ressemble à un objet/array JSON sérialisé. */
function looksLikeJson(value: string): boolean {
  const t = value.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

/**
 * Applique une coercition conservatrice aux arguments d'un tool call.
 * Retourne les args (potentiellement) corrigés et la liste des corrections
 * appliquées (pour transparence côté client et logs). N'altère jamais l'objet
 * d'origine.
 */
function coerceToolArgs(
  // Réservé à d'éventuelles règles de coercition spécifiques à un outil ; la
  // passe actuelle est générique (clé d'argument uniquement). Préfixe `_` pour
  // satisfaire noUnusedParameters sans perdre la signature d'extension.
  _toolName: string,
  args: unknown,
): { args: Record<string, unknown>; corrections: string[] } {
  const corrections: string[] = [];
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { args: (args as Record<string, unknown>) ?? {}, corrections };
  }

  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };

  for (const [key, raw] of Object.entries(out)) {
    if (typeof raw !== 'string') continue;
    const value = raw;

    // 1. Chemins de fichiers mal formatés par la STT.
    if (PATH_ARG_KEYS.has(key)) {
      const normalized = normalizeArgPath(value);
      if (normalized !== value) {
        out[key] = normalized;
        corrections.push(`${key}: chemin normalisé "${value}" → "${normalized}"`);
      }
      continue; // un chemin n'est ni du JSON ni un scalaire
    }

    // 2. JSON imbriqué renvoyé sous forme de string.
    if (looksLikeJson(value)) {
      try {
        out[key] = JSON.parse(value);
        corrections.push(`${key}: JSON désérialisé depuis une string`);
        continue;
      } catch { /* pas du JSON valide — on laisse tel quel */ }
    }

    // 3. Scalaires évidents et non ambigus (booléens / nombres purs).
    //    On reste strict : uniquement "true"/"false" exacts et nombres entiers
    //    ou décimaux complets, pour ne pas casser un argument textuel légitime.
    const trimmed = value.trim();
    if (trimmed === 'true' || trimmed === 'false') {
      out[key] = trimmed === 'true';
      corrections.push(`${key}: booléen coercé depuis "${value}"`);
    } else if (/^-?\d+(\.\d+)?$/.test(trimmed) && trimmed.length <= 15) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) {
        out[key] = n;
        corrections.push(`${key}: nombre coercé depuis "${value}"`);
      }
    }
  }

  return { args: out, corrections };
}

// ─── Erreurs d'outils constructives (auto-correction du modèle) ───────────────
// Le catch final aplatissait toute erreur en { error: e.message }, perdant les
// métadonnées riches de SkillValidationError (issues Zod, suggestions, code).
// Sans ces détails, le modèle ne peut pas ré-appeler l'outil avec les bons
// arguments. buildToolErrorResponse préserve ces informations pour offrir au
// modèle une erreur exploitable (repair-loop implicite, sans tour forcé).

/**
 * Construit une réponse d'erreur structurée et exploitable par le modèle à
 * partir d'une exception d'exécution d'outil. Pour les erreurs de validation
 * (SkillValidationError et assimilées), on expose les problèmes précis, des
 * suggestions et un rappel des arguments reçus afin de permettre l'auto-correction.
 */
function buildToolErrorResponse(err: any, receivedArgs?: unknown): Record<string, unknown> {
  const message = err?.message ? String(err.message) : 'Erreur inconnue lors de l’exécution de l’outil.';
  const name = err?.name ?? '';
  const code = err?.code ?? '';

  const isValidation =
    name === 'SkillValidationError' ||
    code === 'VALIDATION_ERROR' ||
    /validation|zod/i.test(message);

  if (isValidation) {
    // Problèmes précis : privilégier les issues Zod si disponibles.
    const issues = Array.isArray(err?.zodIssues) && err.zodIssues.length > 0
      ? err.zodIssues.map((i: any) => ({
          field: Array.isArray(i?.path) ? i.path.join('.') || '(root)' : '(root)',
          message: i?.message ?? 'invalide',
          ...(i?.expected !== undefined ? { expected: i.expected } : {}),
          ...(i?.received !== undefined ? { received: i.received } : {}),
        }))
      : undefined;

    const suggestions = Array.isArray(err?.suggestions) && err.suggestions.length > 0
      ? err.suggestions
      : ['Vérifie les champs requis et leurs types, puis rappelle l’outil avec des arguments corrigés.'];

    return {
      error: message,
      code: 'VALIDATION_ERROR',
      recoverable: true,
      ...(issues ? { issues } : {}),
      suggestions,
      // Rappel des arguments reçus : aide le modèle à repérer précisément ce
      // qui doit changer avant de rappeler l'outil.
      ...(receivedArgs !== undefined ? { receivedArgs } : {}),
      hint: 'Corrige les arguments signalés ci-dessus puis rappelle le même outil.',
    };
  }

  // Erreurs non-validation : message brut + indice de récupérabilité si présent.
  return {
    error: message,
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
    ...(typeof err?.recoverable === 'boolean' ? { recoverable: err.recoverable } : {}),
  };
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

function estimateToolTokens(declaration: any): number {
  let tokens = 0;
  tokens += Math.ceil((declaration.name?.length || 0) / 4);
  tokens += Math.ceil((declaration.description?.length || 0) / 4);
  if (declaration.parameters?.properties) {
    for (const [key, val] of Object.entries(declaration.parameters.properties)) {
      tokens += Math.ceil((key.length + ((val as any)?.description?.length || 0)) / 4);
    }
  }
  return tokens + 20;
}

function estimateToolTokensTotal(declarations: any[]): number {
  return declarations.reduce((sum, d) => sum + estimateToolTokens(d), 0);
}

// ─── Attache les WebSocket servers au handler Gemini Live ─────────────────────

export function attachLiveWebSocket(
  wss: WebSocketServer,
  sandboxWss: WebSocketServer,
  deps: LiveSocketDeps,
): void {
  const {
    skillManager,
    getCurrentProfile,
    getWorkspaceRoot,
    createGeminiAI,
    activeGeminiSessions,
  } = deps;

  // ── Sandbox Watcher WebSocket ────────────────────────────────────────────
  sandboxWss.on('connection', async (clientWs) => {
    const { addWatchClient, startWatching } = await import('../utils/sandboxWatcher.js');
    console.log('[SandboxWatch] Client connecté');
    addWatchClient(clientWs);
    if (isSandboxActive()) {
      startWatching();
    }
  });

  // ── Gemini Live WebSocket ────────────────────────────────────────────────
  wss.on('connection', async (clientWs: WebSocket, req: any) => {
    console.log('Client connected to WebSocket');
    const sessionSupervisor = new Supervisor();
    const contextGate: SessionContextGate = {
      active: false,
      confidence: null,
      risk: null,
      requiredFiles: new Set(),
      readFiles: new Set(),
    };

    const unsubscribeValidation = subscribeToValidation((data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.send(JSON.stringify(data)); } catch { /* ignore */ }
      }
    });

    clientWs.on('close', () => {
      unsubscribeValidation();
    });

    const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
    const clientConvId = urlParams.get('conversation_id');

    // ── Persistent conversation tracking ─────────────────────────────────
    let conversationId: string | null = null;
    let assistantBuffer = '';
    let assistantFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let conversationReady: Promise<void> | null = null;
    let lastErrorMessage: string | null = null;
    let lastServerMessage: LiveServerMessage | null = null;

    const busyStateRef = { activeDescription: null as string | null };
    const getBusyDescription = () => busyStateRef.activeDescription;

    // ── Rate limiter audio WebSocket ─────────────────────────────────────────
    // Fenêtre glissante : on accumule les bytes envoyés dans la dernière seconde.
    // Si le débit dépasse AUDIO_RATE_LIMIT_BYTES_PER_SEC, le chunk est ignoré.
    const audioRateState = {
      windowStart: Date.now(),  // début de la fenêtre courante
      bytesInWindow: 0,         // bytes reçus dans la fenêtre
      violations: 0,            // compteur total de violations (ignoré pour reset)
      droppedChunks: 0,         // chunks abandonnés dans la fenêtre courante
    };

    // ── Détection de pause du flux audio ─────────────────────────────────────
    // Quand le micro se coupe (>1s sans chunk audio), la doc Live API recommande
    // d'envoyer `audioStreamEnd` pour vider le buffer audio serveur. On arme un
    // timer à chaque chunk transmis ; s'il expire, on flush et on marque le flux
    // comme terminé jusqu'au prochain chunk.
    const AUDIO_STREAM_IDLE_MS = 1000;
    let audioIdleTimer: ReturnType<typeof setTimeout> | null = null;
    let audioStreamOpen = false;
    // La session Gemini est créée plus bas (dans le try). On la référence via ce
    // holder pour que les closures du timer y accèdent sans souci de portée.
    const sessionRef = { current: null as any };
    const markAudioStreamEnd = () => {
      if (!audioStreamOpen) return;
      audioStreamOpen = false;
      try { sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* ignore si session fermée */ }
    };
    const armAudioIdleTimer = () => {
      audioStreamOpen = true;
      if (audioIdleTimer) clearTimeout(audioIdleTimer);
      audioIdleTimer = setTimeout(markAudioStreamEnd, AUDIO_STREAM_IDLE_MS);
    };

    // ── Synchronisation voix ↔ résultats d'outils (audioGate) ────────────────
    // Problème : les outils sont NON_BLOCKING et `scheduling` n'est pas supporté
    // par gemini-3.8-live-extended-thinking. Rien ne cadence donc l'audio sortant
    // par rapport à `sendToolResponse` : la voix peut parler AVANT que le résultat
    // d'outil ne soit réinjecté, d'où silences et ruptures de flux narratif.
    //
    // Solution serveur : tant qu'au moins un tool call est « en vol », on tamponne
    // les chunks audio du modèle dans un FIFO au lieu de les émettre. Dès que tous
    // les outils sont réglés (sendToolResponse envoyé), on flush le buffer dans
    // l'ordre. Le client reçoit aussi des marqueurs tool_pending/tool_settled pour
    // gérer un éventuel filler d'attente et reprendre la lecture proprement.
    //
    // Garde-fou : un buffer plafonné évite qu'un outil très lent n'accumule un
    // retard audio ingérable. Au-delà du plafond, on laisse l'audio passer (mieux
    // vaut un léger déphasage qu'une latence perçue de plusieurs secondes).
    const AUDIO_BUFFER_MAX_CHUNKS = 200; // ~ quelques secondes de PCM 16 kHz
    const audioGate = {
      pendingTools: 0,              // nombre de tool calls en vol
      buffer: [] as Buffer[],       // chunks audio retenus, dans l'ordre d'arrivée
      overflowed: false,            // le buffer a dépassé le plafond ce cycle
    };

    /** Vide le buffer audio retenu vers le client, dans l'ordre. */
    const flushAudioBuffer = () => {
      if (audioGate.buffer.length === 0) return;
      const chunks = audioGate.buffer;
      audioGate.buffer = [];
      for (const chunk of chunks) {
        if (clientWs.readyState !== WebSocket.OPEN) break;
        try { clientWs.send(chunk); } catch { /* ignore si WS fermé */ }
      }
    };

    /**
     * Émet un chunk audio en respectant le gate : si des outils sont en vol, on
     * bufferise (jusqu'au plafond) pour préserver l'ordre voix ↔ résultat ; sinon
     * on envoie directement. En cas de dépassement du plafond, on bascule en
     * passthrough pour ce cycle afin d'éviter une latence perçue excessive.
     */
    const emitAudioChunk = (chunk: Buffer) => {
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (audioGate.pendingTools > 0 && !audioGate.overflowed) {
        if (audioGate.buffer.length >= AUDIO_BUFFER_MAX_CHUNKS) {
          // Plafond atteint : on abandonne le maintien d'ordre pour ce cycle.
          audioGate.overflowed = true;
          console.warn(
            `[AudioGate] ⚠️ Buffer audio plafonné (${AUDIO_BUFFER_MAX_CHUNKS} chunks) ` +
            `avec ${audioGate.pendingTools} outil(s) en vol → passthrough audio.`,
          );
          flushAudioBuffer();
          try { clientWs.send(chunk); } catch { /* ignore */ }
          return;
        }
        audioGate.buffer.push(chunk);
        return;
      }
      try { clientWs.send(chunk); } catch { /* ignore */ }
    };

    /** Signale le début d'un lot de tool calls (retient l'audio). */
    const onToolPending = (callIds: string[]) => {
      audioGate.pendingTools++;
      try { clientWs.send(JSON.stringify({ type: 'tool_pending', ids: callIds })); } catch {}
    };

    /** Signale la fin d'un lot de tool calls (libère l'audio si plus rien en vol). */
    const onToolSettled = (callIds: string[]) => {
      audioGate.pendingTools = Math.max(0, audioGate.pendingTools - 1);
      try { clientWs.send(JSON.stringify({ type: 'tool_settled', ids: callIds })); } catch {}
      if (audioGate.pendingTools === 0) {
        audioGate.overflowed = false;
        flushAudioBuffer();
      }
    };

    // ── Context window monitoring ────────────────────────────────────────
    // Seuils proactifs : on déclenche le résumé BIEN avant la limite réelle du
    // modèle, car un seul gros résultat d'outil (ex. generate_codebase_markdown
    // sur un projet volumineux) peut faire bondir la taille de session entre deux
    // mesures. Un seuil critique à 70 % laisse la marge nécessaire pour éviter le
    // 'context_too_long' côté Gemini.
    // La fenêtre réelle du modèle est 131 072 tokens en entrée (65 536 en sortie),
    // PAS 1M. La compression serveur (contextWindowCompression) agit AVANT nos
    // seuils UI ; les seuils warn/critical ne sont donc qu'un filet de secours
    // d'affichage si la compression échoue.
    const CONTEXT_WINDOW_TOKENS = 131_072;
    const COMPRESSION_TRIGGER_TOKENS = 90_000; // la compression serveur se déclenche ici
    // Seuils exprimés en pourcentage (source unique de vérité, réutilisée par
    // resolveContextLevel et par la logique d'alerte pour éviter la divergence).
    const INFO_PCT = 40;      // premier repère informatif (pas d'alerte bloquante)
    const WARNING_PCT = 60;   // conversation longue → suggérer un résumé
    const CRITICAL_PCT = 80;  // filet de secours avant context_too_long
    const INFO_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * (INFO_PCT / 100));      // ≈ 52k
    const WARNING_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * (WARNING_PCT / 100));  // ≈ 78k — affichage UI
    const CRITICAL_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * (CRITICAL_PCT / 100)); // ≈ 105k — filet de secours
    // Hystérésis : quand le contexte redescend sous ce pourcentage (ex. après une
    // compression serveur ou un auto-résumé), on réarme les alertes pour pouvoir
    // réalerter si le contexte remonte à nouveau. Évite de rester « bloqué » sur
    // un niveau critique déjà émis alors que la situation a changé.
    const ALERT_REARM_PCT = 50;
    const ALERT_REARM_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * (ALERT_REARM_PCT / 100));

    const conversationCtx = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      maxPromptTokensInTurn: 0,
      // Taille RÉELLE du contexte courant. Dans la Live API, `promptTokenCount`
      // d'un tour contient DÉJÀ tout l'historique cumulé : il ne faut donc PAS
      // additionner les tours (sinon on double-compte et on dépasse 100 %).
      // On mémorise le dernier promptTokenCount comme taille courante, et on y
      // ajoute les tokens des résultats d'outils injectés DEPUIS cette mesure
      // (absents d'usageMetadata) jusqu'au prochain rapport.
      currentContextTokens: 0,
      pendingToolTokens: 0,
      turns: 0,
      warningsIssued: new Set<string>(),
      lastAlertLevel: '' as '' | 'info' | 'warn' | 'critical',
      lastAutoSummarizeAt: 0,
      autoSummarizeCount: 0,
      // ── Vélocité & projection ──────────────────────────────────────────
      // Taille du contexte au tour précédent : sert à calculer la croissance
      // par tour (delta) et à projeter le nombre de tours restants avant
      // saturation. `lastReportedPct` limite les logs redondants au même palier.
      prevContextTokens: 0,
      lastGrowthPerTurn: 0,
      lastReportedPct: -1,
    };

    let autoSummarizeContext: (() => Promise<void>) | null = null;

    const resolveContextLevel = (percent: number): 'ok' | 'info' | 'warn' | 'critical' => {
      if (percent >= CRITICAL_PCT) return 'critical';
      if (percent >= WARNING_PCT) return 'warn';
      if (percent >= INFO_PCT) return 'info';
      return 'ok';
    };

    /**
     * Projette le nombre de tours restants avant saturation à partir de la
     * croissance moyenne par tour. Retourne `null` si la croissance est nulle
     * ou négative (contexte stable ou en baisse : pas de saturation prévisible).
     */
    const projectTurnsUntilFull = (current: number, growthPerTurn: number): number | null => {
      if (growthPerTurn <= 0) return null;
      const remaining = CRITICAL_THRESHOLD - current;
      if (remaining <= 0) return 0;
      return Math.max(0, Math.round(remaining / growthPerTurn));
    };

    const sendContextSize = (
      currentSize: number,
      opts?: { turns?: number; suggestion?: string; level?: 'ok' | 'info' | 'warn' | 'critical' },
    ) => {
      const percent = Math.round((currentSize / CONTEXT_WINDOW_TOKENS) * 100);
      const level = opts?.level ?? resolveContextLevel(percent);
      const growthPerTurn = conversationCtx.lastGrowthPerTurn;
      const turnsUntilFull = projectTurnsUntilFull(currentSize, growthPerTurn);
      try {
        clientWs.send(JSON.stringify({
          context_size: {
            currentSize,
            maxSize: CONTEXT_WINDOW_TOKENS,
            percent,
            level,
            turns: opts?.turns ?? conversationCtx.turns,
            suggestion: opts?.suggestion,
            // Télémétrie de tendance : croissance moyenne par tour et projection
            // du nombre de tours restants avant le seuil critique. Permet au
            // client d'afficher une jauge « qui bouge » plutôt qu'un simple %.
            growthPerTurn,
            ...(turnsUntilFull !== null ? { turnsUntilFull } : {}),
            thresholds: { info: INFO_PCT, warn: WARNING_PCT, critical: CRITICAL_PCT },
          },
        }));
      } catch {}
    };

    const monitorConversationContext = (prompt: number, completion: number) => {
      // Totaux CUMULÉS conservés pour la facturation/télémétrie uniquement.
      conversationCtx.totalPromptTokens += prompt;
      conversationCtx.totalCompletionTokens += completion;
      conversationCtx.maxPromptTokensInTurn = Math.max(conversationCtx.maxPromptTokensInTurn, prompt);
      conversationCtx.turns++;

      // Taille RÉELLE du contexte = promptTokenCount du tour courant (il inclut
      // déjà tout l'historique). On y ajoute la complétion de ce tour, qui fera
      // partie du prochain prompt. Les tokens d'outils en attente sont remis à
      // zéro : ils sont maintenant reflétés dans ce promptTokenCount.
      conversationCtx.pendingToolTokens = 0;
      const current = prompt + completion;

      // ── Vélocité : croissance du contexte depuis le tour précédent ─────────
      // On ignore les deltas négatifs (compression/résumé) pour la projection :
      // seule la croissance nette renseigne sur le risque de saturation.
      if (conversationCtx.prevContextTokens > 0) {
        const delta = current - conversationCtx.prevContextTokens;
        conversationCtx.lastGrowthPerTurn = delta > 0 ? delta : 0;
      }
      conversationCtx.prevContextTokens = current;
      conversationCtx.currentContextTokens = current;

      const currentPct = (current / CONTEXT_WINDOW_TOKENS) * 100;
      const turnPct = (prompt / CONTEXT_WINDOW_TOKENS) * 100;
      const turnsUntilFull = projectTurnsUntilFull(current, conversationCtx.lastGrowthPerTurn);

      // ── Hystérésis : réarmement des alertes ────────────────────────────────
      // Si le contexte est repassé sous le seuil de réarmement (après compression
      // serveur ou auto-résumé), on efface les alertes déjà émises pour pouvoir
      // réalerter proprement si le contexte remonte ensuite.
      if (current < ALERT_REARM_THRESHOLD && conversationCtx.warningsIssued.size > 0) {
        conversationCtx.warningsIssued.clear();
        conversationCtx.lastAlertLevel = '';
      }

      /** Émet une alerte de contexte (log + context_size + context_alert). */
      const emitContextAlert = (
        level: 'info' | 'warn' | 'critical',
        emoji: string,
        suggestion: string,
      ) => {
        conversationCtx.warningsIssued.add(level);
        conversationCtx.lastAlertLevel = level;
        console.warn(`[ContextMonitor] ${emoji} ${level.toUpperCase()}: contexte à ${currentPct.toFixed(1)}%`);
        sendContextSize(current, { level, turns: conversationCtx.turns, suggestion });
        try {
          clientWs.send(JSON.stringify({
            context_alert: {
              level,
              used_tokens: current,
              max_tokens: CONTEXT_WINDOW_TOKENS,
              percent: Math.round(currentPct),
              suggestion,
              turns: conversationCtx.turns,
              growth_per_turn: conversationCtx.lastGrowthPerTurn,
              ...(turnsUntilFull !== null ? { turns_until_full: turnsUntilFull } : {}),
            },
          }));
        } catch {}
      };

      if (current >= CRITICAL_THRESHOLD && !conversationCtx.warningsIssued.has('critical')) {
        emitContextAlert(
          'critical', '🔴',
          'Contexte proche de la limite. Démarrer une nouvelle conversation ou demander un résumé.',
        );
        autoSummarizeContext?.();
      } else if (current >= WARNING_THRESHOLD && !conversationCtx.warningsIssued.has('warn')) {
        emitContextAlert(
          'warn', '🟠',
          'Conversation longue. Envisager un résumé ou knowledge_memory_add.',
        );
      } else if (current >= INFO_THRESHOLD && !conversationCtx.warningsIssued.has('info')) {
        emitContextAlert(
          'info', '🔵',
          'Contexte en croissance. Rien à faire pour l’instant.',
        );
      } else {
        // Log conditionnel : uniquement quand le palier de % change, pour éviter
        // de spammer les logs à chaque tour sans information nouvelle.
        const roundedPct = Math.round(currentPct);
        if (roundedPct !== conversationCtx.lastReportedPct) {
          conversationCtx.lastReportedPct = roundedPct;
          const projection = turnsUntilFull !== null ? ` | ~${turnsUntilFull} tour(s) avant seuil` : '';
          console.log(
            `[ContextMonitor] 🔄 Tour ${conversationCtx.turns}: prompt=${prompt} (${turnPct.toFixed(1)}%)` +
            ` | contexte=${current}/${CONTEXT_WINDOW_TOKENS} (${currentPct.toFixed(1)}%)` +
            ` | +${conversationCtx.lastGrowthPerTurn}/tour${projection}`,
          );
        }
      }

      sendContextSize(current, { turns: conversationCtx.turns });
    };

    const flushAssistantBuffer = async () => {
      if (conversationReady) await conversationReady;
      if (assistantBuffer.trim() && conversationId) {
        const text = assistantBuffer.trim();
        assistantBuffer = '';
        saveMessage('assistant', text, conversationId).catch(e =>
          console.error('[History] Erreur flush assistant:', e),
        );
      }
    };

    // ── Start or resume conversation ────────────────────────────────────
    if (clientConvId) {
      conversationId = clientConvId;
      conversationReady = Promise.resolve();
      console.log(`[History] Conversation reprise: ${conversationId}`);
    } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      conversationReady = startConversation()
        .then(id => {
          conversationId = id;
          console.log(`[History] Conversation prête: ${id}`);
          try { clientWs.send(JSON.stringify({ conversation_id: id })); } catch {}
        })
        .catch(e => console.error('[History] Erreur démarrage conversation:', e));
    }

    // ── Context resume (après overflow) ──────────────────────────────────
    const isContextResume = urlParams.get('context_resume') === '1';
    let contextResumeSummary = '';
    if (isContextResume && clientConvId && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { data } = await supabase.from('conversations').select('summary').eq('id', clientConvId).single();
        if (data?.summary) {
          contextResumeSummary = data.summary;
          console.log(`[ContextResume] 📋 Résumé trouvé pour ${clientConvId} (${contextResumeSummary.length} chars)`);
        } else {
          const messages = await getConversationMessages(clientConvId, 12);
          if (messages.length >= 4) {
            const chatMsgs = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
            const { summary } = await summarizeWithLLM(chatMsgs);
            contextResumeSummary = summary;
            console.log(`[ContextResume] 🧠 Résumé généré à la volée (${summary.length} chars)`);
          }
        }
      } catch (e) {
        console.warn('[ContextResume] Erreur chargement résumé:', e);
      }
    }

    try {
      const currentProfile = getCurrentProfile();
      const requestedSkills = urlParams.get('skills')?.split(',') || undefined;
      const sessionMode = (urlParams.get('mode') as 'ask' | 'full') || currentProfile.mode || 'full';
      const initialQuery = urlParams.get('q') || urlParams.get('query') || '';
      const declarations = skillManager.getToolDeclarations(requestedSkills);

      // ── Tool tier filtering ──────────────────────────────────────────
      const TIER1_CORE_TOOLS = new Set([
        'read_file_outline', 'read_project_file', 'list_project_files',
        'modify_project_file', 'patch_project_file', 'write_project_file',
        'rename_project_file', 'delete_project_file', 'delete_project_folder', 'create_project_directory',
        'search_in_files',
        'open_project_file', 'open_ide', 'get_workspace_info',
        'analyze_project_file',
        'run_project_command',
        'verify_file', 'verify_syntax', 'verify_typecheck', 'security_audit',
        'save_memory', 'search_memory',
        'knowledge_build_context', 'knowledge_semantic_search',
        'knowledge_memory_search',
        'get_current_time',
        'automation_search',
        'browser_navigate', 'browser_search', 'browser_open', 'browser_close',
        'browser_read_content', 'browser_scroll', 'browser_back', 'browser_forward',
        'browser_reload', 'browser_snapshot', 'browser_click', 'browser_type',
        'browser_inspect', 'browser_get_links', 'browser_open_link',
        'browser_summarize_page', 'browser_research',
        // Sprint 1 — J1 : Accessibilité
        'browser_get_accessibility_snapshot', 'browser_click_by_role', 'browser_type_by_label',
        // Sprint 1 — J2 : Robustesse
        'browser_wait_for',
        // Sprint 1 — J3 : Actions primitives
        'browser_get_element_text', 'browser_get_element_attribute',
        'browser_fill_form', 'browser_select_option',
        'reasoning_think',
        'agent_orchestrate', 'agent_status',
        // Missions autonomes — tâches complexes multi-étapes
        'mission_create', 'mission_status',
        'knowledge_search_entities', 'knowledge_status',
        'knowledge_memory_add', 'knowledge_memory_list',
        'knowledge_impact_analyze', 'knowledge_reindex',
        'create_rich_document',
        // Custom skills — toujours disponibles (Tier 1)
        'list_custom_skills', 'create_custom_skill', 'update_custom_skill', 'delete_custom_skill', 'toggle_custom_skill',
        // Project scaffolding — création de nouveau projet
        'project_scaffold', 'project_list_frameworks',
        // Graphify — Graphe de connaissances et architecture
        'graphify_query', 'graphify_path', 'graphify_explain', 'graphify_affected',
        'graphify_god_nodes', 'graphify_read_report', 'graphify_update',
        // Telegram — Envoi de messages et notifications
        'telegram_notify', 'telegram_send_message', 'telegram_send_photo',
        'telegram_send_document', 'telegram_send_from_workspace', 'telegram_broadcast',
        'telegram_get_status', 'telegram_list_users', 'telegram_get_chat_info',
      ]);

      const ASK_MODE_ALLOWED_TOOLS = new Set([
        'list_project_files', 'read_project_file', 'read_file_outline', 'search_in_files',
        'analyze_project_file', 'get_workspace_info', 'open_project_file', 'open_ide', 'security_audit',
        'save_memory', 'search_memory',
        'knowledge_build_context', 'knowledge_semantic_search',
        'knowledge_memory_search', 'knowledge_memory_list',
        'knowledge_search_entities', 'knowledge_status',
        'get_current_time', 'get_weather', 'get_github_user',
        'list_list_all', 'list_get',
        'system_info',
        'search_history', 'list_conversations', 'get_conversation_messages',
        'write_project_file',
        'automation_search',
        'automation_list_scheduled_tasks',
        'agent_delegate', 'agent_orchestrate', 'agent_status',
        'agent_list_tasks', 'agent_list_roles', 'agent_cancel', 'agent_stats',
        // Custom skills — accessibles en mode ask aussi
        'list_custom_skills', 'create_custom_skill', 'update_custom_skill', 'delete_custom_skill', 'toggle_custom_skill',
        // Graphify — interrogeable en mode question (lecture seule sécurisée)
        'graphify_query', 'graphify_path', 'graphify_explain', 'graphify_affected',
        'graphify_god_nodes', 'graphify_read_report', 'graphify_update',
        // Telegram — statut et notifications en mode ask
        'telegram_notify', 'telegram_send_message', 'telegram_get_status', 'telegram_list_users',
      ]);

      let filteredDeclarations: typeof declarations;
      if (sessionMode === 'ask') {
        filteredDeclarations = declarations.filter(d =>
          ASK_MODE_ALLOWED_TOOLS.has(d.name) || (d as any)._mcpServerId || d.name.startsWith('custom_'),
        );
      } else {
        const useDynamicRelevance = process.env.FORCE_TIERED_TOOLS !== 'false';
        if (useDynamicRelevance) {
          if (initialQuery.trim().length > 0) {
            const rel = skillManager.getRelevantToolDeclarations(initialQuery, requestedSkills);
            filteredDeclarations = rel.declarations;
            // Toujours inclure les custom skills même si le score est faible
            const customDeclarations = declarations.filter(d => d.name.startsWith('custom_') && !filteredDeclarations.some((fd: any) => fd.name === d.name));
            filteredDeclarations = [...filteredDeclarations, ...customDeclarations];
          } else {
            filteredDeclarations = declarations.filter(d => TIER1_CORE_TOOLS.has(d.name) || d.name.startsWith('custom_'));
            filteredDeclarations.push({
              name: 'request_tools',
              description: `Demande le chargement d'outils supplémentaires. Catégories: "git", "github", "automation", "lists", "weather", "reasoning", "history", "system", "knowledge", "verify", "security_audit", "guidelines", "selfImprovement", "all".`,
              parameters: {
                type: 'OBJECT',
                properties: {
                  category: {
                    type: 'STRING',
                    description: 'Catégorie d\'outils à charger.',
                  },
                },
                required: ['category'],
              },
            } as any);
          }
        } else {
          filteredDeclarations = declarations;
        }
      }

      // ── Filtrage agents, git, reasoning ─────────────────────────────
      const agentsConfig = currentProfile.agents;
      const agentsEnabled = agentsConfig?.enabled !== false;
      if (!agentsEnabled) {
        const AGENT_TOOLS = new Set(['agent_delegate', 'agent_orchestrate', 'agent_status', 'agent_list_tasks', 'agent_list_roles', 'agent_cancel', 'agent_stats']);
        filteredDeclarations = filteredDeclarations.filter(d => !AGENT_TOOLS.has(d.name));
      }
      filteredDeclarations = filteredDeclarations.filter(d => !d.name.startsWith('git_'));
      if (currentProfile.reasoningEnabled === false) {
        filteredDeclarations = filteredDeclarations.filter(d => !d.name.startsWith('reasoning_'));
      }

      // Toutes les déclarations doivent être NON_BLOCKING : ce modèle traite les
      // réponses d'outils au fur et à mesure sans figer la conversation. Un outil
      // laissé en BLOCKING (défaut serveur) empêcherait le modèle de continuer à
      // parler pendant l'exécution et peut renvoyer une erreur.
      const nonBlockingDeclarations = filteredDeclarations.map((d) => ({ ...d, behavior: Behavior.NON_BLOCKING }));
      const tools = nonBlockingDeclarations.length > 0 ? [{ functionDeclarations: nonBlockingDeclarations }] : undefined;
      const toolTokensEstimate = filteredDeclarations.reduce((sum, d) => sum + estimateToolTokens(d), 0);
      const tokensEconomises = estimateToolTokensTotal(skillManager.getToolDeclarations()) - toolTokensEstimate;

      console.log(`[TokenOptimizer] 🔧 Outils chargés: ${filteredDeclarations.length}/${declarations.length} (mode: ${sessionMode}, agents: ${agentsEnabled ? 'ON' : 'OFF'}, git: OFF)`);
      console.log(`[TokenOptimizer]    Tokens outils estimés: ~${toolTokensEstimate} (économie: ~${tokensEconomises} tokens)`);

      // ── Build system instruction ─────────────────────────────────────
      let systemText = buildSystemInstruction({
        ...currentProfile,
        workspace: getWorkspaceRoot(),
        mode: sessionMode,
      });

      if (WORKSPACE_SITE_URL) {
        systemText += `\n\n[Workspace — Site associé]\nL'URL du site web associé à ce projet est : ${WORKSPACE_SITE_URL}`;
      }

      const voiceName = currentProfile.aiVoice || 'Aoede';
      const temperature = currentProfile.temperature ?? 0.9;
      const topP = currentProfile.topP ?? 0.95;

      // ── Réglage thinking ──────────────────────────────────────────────────
      // includeThoughts → résumés de pensée streamés pour afficher la réflexion.
      const includeThoughts = currentProfile.includeThoughts ?? true;
      // Niveau de réflexion : MEDIUM par défaut, HIGH activable via le profil
      // (missions complexes). Mesure la latence chez toi avant de figer HIGH.
      const profileThinking = String((currentProfile as any).thinkingLevel ?? '').toLowerCase();
      const thinkingLevel =
        profileThinking === 'high' ? ThinkingLevel.HIGH :
        profileThinking === 'low' ? ThinkingLevel.LOW :
        ThinkingLevel.MEDIUM;
      // Le prompt système + mémoire + déclarations d'outils sont renvoyés à CHAQUE
      // session et comptent dans les 131 072 tokens. On serre donc les budgets :
      // ~12k tokens pour le prompt initial (au lieu de 60k = 46 % de la fenêtre !).
      const memoryBudgetTokens = 1000;
      const knowledgeBudgetTokens = 2000;
      const maxMemories = currentProfile.temperature !== undefined && currentProfile.temperature < 0.5 ? 5 : 10;
      const maxConversations = 3;
      const INITIAL_PROMPT_MAX_TOKENS = 12_000;
      const INITIAL_PROMPT_MAX_CHARS = INITIAL_PROMPT_MAX_TOKENS * 4;

      // ── RAG: mémoires ────────────────────────────────────────────────
      let memoryContext = '';
      if ((!requestedSkills || requestedSkills.includes('memory')) && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
          const { data } = await supabase.from('memories').select('content').order('created_at', { ascending: false }).limit(maxMemories);
          if (data && data.length > 0) {
            let usedTokens = 0;
            const optimizedMemories: string[] = [];
            for (const m of data) {
              const content = m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content;
              const estimated = Math.ceil(content.length / 4);
              if (usedTokens + estimated > memoryBudgetTokens) break;
              optimizedMemories.push(content);
              usedTokens += estimated;
            }
            if (optimizedMemories.length > 0) {
              memoryContext = '\n\n[Mémoire contextuelle]\n' + optimizedMemories.map(m => '• ' + m).join('\n');
            }
          }

          const isNewSession = !clientConvId;
          if (!isNewSession && (!requestedSkills || requestedSkills.includes('history'))) {
            const { data: recentConvs } = await supabase
              .from('conversations')
              .select('title, summary, started_at, message_count')
              .order('started_at', { ascending: false })
              .limit(maxConversations);

            if (recentConvs && recentConvs.length > 0) {
              memoryContext += '\n\n[Conversations récentes]\n' +
                recentConvs.map(c => {
                  const title = (c.title || 'Sans titre').slice(0, 50);
                  const summary = c.summary ? c.summary.slice(0, 100) : '';
                  return `• ${title} (${c.message_count}msg)${summary ? ' — ' + summary : ''}`;
                }).join('\n');
            }
          }
        } catch (e) {
          console.error('[RAG] Erreur récupération mémoire:', e);
        }
      }

      // ── Knowledge System context ─────────────────────────────────────
      let knowledgeContext = '';
      try {
        if (knowledgeGraph.isInitialized()) {
          const kgSummary = knowledgeGraph.toContextSummary();
          const pmSummary = projectMemory.toContextSummary(8);
          knowledgeContext = '\n\n[Knowledge System — Contexte Projet]\n' + kgSummary;
          if (pmSummary) knowledgeContext += '\n' + pmSummary;

          if (initialQuery && initialQuery.length > 5) {
            try {
              const ctx = understandingEngine.buildContext(initialQuery, { strategy: 'minimal', detail: 'compact', maxFiles: 4, maxFacts: 5 });
              if (ctx.systemPromptInject) knowledgeContext += '\n\n' + ctx.systemPromptInject;
            } catch { /* non bloquant */ }
          }

          let kTokens = Math.ceil(knowledgeContext.length / 4);
          if (kTokens > knowledgeBudgetTokens) {
            knowledgeContext = knowledgeContext.slice(0, knowledgeBudgetTokens * 4) + '\n…[tronqué — budget Knowledge atteint]';
          }
        }
      } catch { /* module indisponible */ }

      // ── Notebooks context ────────────────────────────────────────────
      // NOTE: L'agent (Leanna) n'a plus accès au contenu des notebooks.
      // Les sources des notebooks ne sont volontairement plus injectées dans
      // le contexte du modèle. Les notebooks restent gérables par l'utilisateur
      // via l'UI et l'API /api/notebooks, mais leur contenu n'est jamais
      // transmis à l'agent.
      let notebookContext = '';

      // ── Hard cap final ───────────────────────────────────────────────
      const buildCombined = () => systemText + memoryContext + knowledgeContext + notebookContext;
      let combinedChars = buildCombined().length;
      const combinedTokensEst = Math.ceil(combinedChars / 4);
      if (combinedTokensEst > INITIAL_PROMPT_MAX_TOKENS) {
        const targetChars = INITIAL_PROMPT_MAX_CHARS - 200;
        const baseLen = systemText.length;
        if (notebookContext && combinedChars > targetChars) {
          const allowance = Math.max(0, targetChars - baseLen - memoryContext.length - knowledgeContext.length);
          notebookContext = allowance <= 0 ? '' : notebookContext.slice(0, allowance) + '\n…[tronqué — budget global atteint]';
          combinedChars = buildCombined().length;
        }
        if (knowledgeContext && combinedChars > targetChars) {
          const allowance = Math.max(0, targetChars - baseLen - memoryContext.length - notebookContext.length);
          knowledgeContext = allowance <= 0 ? '' : knowledgeContext.slice(0, allowance) + '\n…[tronqué]';
          combinedChars = buildCombined().length;
        }
        if (memoryContext && combinedChars > targetChars) {
          const allowance = Math.max(0, targetChars - baseLen - knowledgeContext.length - notebookContext.length);
          memoryContext = allowance <= 0 ? '' : memoryContext.slice(0, allowance) + '\n…[tronqué]';
        }
      }

      // ── Session resumption ───────────────────────────────────────────
      // La session Live n'est valide qu'environ 15 min (WebSocket ~10 min) sans
      // reprise. On active sessionResumption : le serveur émet des handles que
      // l'on relaie au client. Sur GoAway, le client reconnecte avec ce handle
      // (valide ~2 h) au lieu de repartir de zéro — l'état de session est préservé.
      const resumeHandle = urlParams.get('resume_handle') || undefined;
      let latestResumeHandle: string | null = resumeHandle ?? null;

      // ── GoAway handler ───────────────────────────────────────────────
      let goAwayHandled = false;
      let clientWsClosing = false;
      const handleGoAway = (goAway: any) => {
        goAwayHandled = true;
        console.info(`[Gemini Live] 🔄 GoAway reçu — session expire. Turns: ${conversationCtx.turns}`);
        flushAssistantBuffer().catch(() => {});
        clientWs.send(JSON.stringify({
          // Si un handle de reprise est disponible, on demande une reconnexion
          // transparente plutôt qu'un redémarrage complet (pas de re-résumé).
          type: latestResumeHandle ? 'session_resume' : 'session_restart',
          reason: 'goaway',
          detail: goAway,
          conversation_id: conversationId,
          turns_completed: conversationCtx.turns,
          resume_handle: latestResumeHandle ?? undefined,
        }));
        try { session.close(); } catch {}
        if (!clientWsClosing && clientWs.readyState === WebSocket.OPEN) {
          clientWsClosing = true;
          setTimeout(() => {
            try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000, 'goaway_restart'); } catch {}
          }, 200);
        }
      };

      // ── Connect to Gemini Live ───────────────────────────────────────
      const session = await createGeminiAI().live.connect({
        model: 'gemini-3.8-live-extended-thinking',
        config: {
          responseModalities: [Modality.AUDIO],
          temperature,
          topP,
          // Niveau de réflexion du modèle gemini-3.8-live-extended-thinking.
          // Valeurs supportées : 'low' | 'medium' | 'high' (MINIMAL non supporté).
          // Défaut MEDIUM : bon compromis latence/qualité. HIGH réservé aux
          // missions multi-étapes / multi-outils, activable via le profil.
          // includeThoughts → résumés de pensée streamés côté client.
          // Voir https://ai.google.dev/gemini-api/docs/live-api/thinking
          thinkingConfig: { thinkingLevel, includeThoughts },
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: {
            parts: [{ text: systemText + memoryContext + knowledgeContext + notebookContext }],
          },
          tools,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          // Compression serveur : mécanisme PRINCIPAL de gestion de la fenêtre.
          // triggerTokens est une STRING dans le SDK (@google/genai v2.11).
          // slidingWindow vide → fenêtre glissante par défaut du serveur.
          contextWindowCompression: {
            triggerTokens: String(COMPRESSION_TRIGGER_TOKENS),
            slidingWindow: {},
          },
          // Reprise de session : handle passé à la reconnexion (sinon nouvelle
          // session). Le serveur émettra des sessionResumptionUpdate.
          sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            lastServerMessage = message;
            if (message.goAway) handleGoAway(message.goAway);

            // Handle de reprise : le serveur en émet un nouveau régulièrement.
            // On mémorise le dernier handle « resumable » et on le relaie au
            // client, qui le rejouera via ?resume_handle=… à la reconnexion.
            const resumeUpdate = message.sessionResumptionUpdate;
            if (resumeUpdate?.resumable && resumeUpdate.newHandle) {
              latestResumeHandle = resumeUpdate.newHandle;
              try { clientWs.send(JSON.stringify({ type: 'session_resume_handle', handle: resumeUpdate.newHandle })); } catch {}
            }

            // Fin de tour : c'est le vrai signal « le modèle a fini de parler »
            // (turnComplete) ou « génération terminée » (generationComplete).
            // On y rattache le flush du transcript assistant plutôt que de
            // dépendre uniquement du debounce de 2 s ou de la fin d'un tool call.
            if (message.serverContent?.turnComplete || message.serverContent?.generationComplete) {
              if (assistantFlushTimer) { clearTimeout(assistantFlushTimer); assistantFlushTimer = null; }
              flushAssistantBuffer().catch(() => {});
            }

            // ── Statut d'interaction (fin réelle de tour) ─────────────────────
            // Le SDK @google/genai v2.11 n'expose PAS `interactionStatus` sur le
            // flux Live. Les vrais marqueurs de fin de tâche sont :
            //   - generationComplete : le modèle a fini de générer TOUT le contenu
            //   - waitingForInput    : le modèle attend l'utilisateur (donc a fini)
            // À l'inverse, un `turnComplete` seul ne clôt PAS la tâche avec le
            // modèle extended-thinking : ce n'est qu'une phrase d'attente (filler).
            // On dérive donc un statut idle/in_progress qu'on relaie au client
            // pour qu'il ne reste pas bloqué sur un filler.
            const sc = message.serverContent;
            if (sc?.generationComplete || (sc as any)?.waitingForInput) {
              try { clientWs.send(JSON.stringify({ type: 'interaction_status', status: 'idle' })); } catch {}
            }

            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            // Passe par le gate : l'audio est retenu tant qu'un tool call est en
            // vol, puis flushé dans l'ordre une fois le résultat réinjecté.
            if (audio) emitAudioChunk(Buffer.from(audio, 'base64'));

            // Résumés de pensée (includeThoughts) : parts texte marquées
            // `thought: true`. On les émet séparément et on ne les ajoute PAS
            // au transcript assistant (sinon la réflexion polluerait la réponse).
            const thoughtPart = message.serverContent?.modelTurn?.parts?.find(
              (p: any) => p.text && p.thought === true,
            );
            if (thoughtPart?.text) {
              try { clientWs.send(JSON.stringify({ type: 'thought', text: thoughtPart.text })); } catch {}
            }

            const textPart = message.serverContent?.modelTurn?.parts?.find(
              (p: any) => p.text && p.thought !== true,
            );
            if (textPart?.text) {
              clientWs.send(JSON.stringify({ text: textPart.text }));
              assistantBuffer += textPart.text;
              if (assistantFlushTimer) clearTimeout(assistantFlushTimer);
              assistantFlushTimer = setTimeout(flushAssistantBuffer, 2000);
            }

            const inputTranscription = (message.serverContent as any)?.inputTranscription?.text;
            if (inputTranscription) {
              clientWs.send(JSON.stringify({ user_text: inputTranscription }));
              (async () => {
                if (conversationReady) await conversationReady;
                if (conversationId) saveMessage('user', inputTranscription, conversationId).catch(console.error);
              })();
            }

            const outputTranscription = (message.serverContent as any)?.outputTranscription?.text;
            if (outputTranscription) {
              clientWs.send(JSON.stringify({ text: outputTranscription }));
              assistantBuffer += outputTranscription;
              if (assistantFlushTimer) clearTimeout(assistantFlushTimer);
              assistantFlushTimer = setTimeout(flushAssistantBuffer, 2000);
            }

            if (message.serverContent?.interrupted) clientWs.send(JSON.stringify({ interrupted: true }));

            if (message.toolCall) {
              // Le modèle exécute des outils en fond → tour toujours en cours.
              try { clientWs.send(JSON.stringify({ type: 'interaction_status', status: 'in_progress' })); } catch {}
              handleToolCall(
                message.toolCall, session, clientWs, sessionMode, busyStateRef, voiceName,
                deps, sessionSupervisor, contextGate,
                // (B) Les résultats d'outils injectés dans la session comptent dans
                // la fenêtre de contexte, mais n'apparaissent pas dans usageMetadata.
                // On les remonte ici pour que le moniteur (et donc l'auto-résumé)
                // se déclenche à temps.
                (toolTokens: number) => {
                  // Les résultats d'outils s'ajoutent au contexte courant mais ne
                  // sont pas encore reflétés dans un promptTokenCount (le prochain
                  // usageMetadata les intégrera puis remettra pendingToolTokens à 0).
                  conversationCtx.pendingToolTokens += toolTokens;
                  const estimated = conversationCtx.currentContextTokens + conversationCtx.pendingToolTokens;
                  const pct = (estimated / CONTEXT_WINDOW_TOKENS) * 100;
                  console.debug(`[ContextGuard] +${toolTokens} tokens (résultats d'outils) → contexte estimé ${estimated} (${pct.toFixed(1)}%)`);
                  sendContextSize(estimated, { turns: conversationCtx.turns });
                  if (estimated >= CRITICAL_THRESHOLD && !conversationCtx.warningsIssued.has('critical')) {
                    conversationCtx.warningsIssued.add('critical');
                    conversationCtx.lastAlertLevel = 'critical';
                    console.warn(`[ContextGuard] 🔴 Seuil critique atteint via résultats d'outils (${pct.toFixed(1)}%) — déclenchement du résumé.`);
                    autoSummarizeContext?.();
                  }
                },
                // Synchronisation voix ↔ résultat : retient/relâche l'audio autour
                // de l'exécution des outils pour éviter que la voix parle avant que
                // le tool_result ne soit réinjecté.
                { onToolPending, onToolSettled },
              ).catch(e =>
                console.error('[handleToolCall] Erreur non catchée:', e),
              );
            }

            const usageMetadata = (message as any).usageMetadata;
            if (usageMetadata) {
              const promptTokens = usageMetadata.promptTokenCount ?? 0;
              const completionTokens = usageMetadata.candidatesTokenCount ?? usageMetadata.responseTokenCount ?? 0;
              const totalTokens = usageMetadata.totalTokenCount ?? 0;
              // Ventilation par modalité (AUDIO vs TEXT) fournie par le serveur.
              // Utile pour distinguer le coût audio du coût texte dans le moniteur.
              const modalityBreakdown = (usageMetadata.responseTokensDetails ?? [])
                .map((d: any) => ({ modality: d.modality, tokens: d.tokenCount ?? 0 }))
                .filter((d: any) => d.modality);
              monitorConversationContext(promptTokens, completionTokens);
              // Lifetime (facturation) vs contexte courant (occupation fenêtre).
              const lifetimeTotal = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
              const currentContext = conversationCtx.currentContextTokens;
              clientWs.send(JSON.stringify({
                token_usage: {
                  promptTokens, completionTokens, totalTokens,
                  ...(modalityBreakdown.length > 0 ? { modalityBreakdown } : {}),
                  session: {
                    total_prompt_tokens: conversationCtx.totalPromptTokens,
                    total_completion_tokens: conversationCtx.totalCompletionTokens,
                    // Cumul de facturation sur toute la session (peut dépasser la fenêtre).
                    session_total: lifetimeTotal,
                    // Occupation RÉELLE de la fenêtre = dernier promptTokenCount (+ complétion).
                    current_context_tokens: currentContext,
                    context_window: CONTEXT_WINDOW_TOKENS,
                    context_percent: Math.round((currentContext / CONTEXT_WINDOW_TOKENS) * 100),
                    turns: conversationCtx.turns,
                    alert_level: conversationCtx.lastAlertLevel,
                  },
                },
              }));
            }
          },
          onclose: (e: any) => {
            const closeCode = e?.code;
            const closeReasonText = e?.reason;
            let closeReason = 'unknown';
            let closeDetail = '';

            if (goAwayHandled) {
              closeReason = 'session_expired_goaway';
              closeDetail = 'Fermeture normale suite à GoAway';
              console.info(`[Gemini Live] ✅ Session fermée proprement après GoAway`);
            } else if (lastErrorMessage) {
              closeDetail = lastErrorMessage;
              if (lastErrorMessage.toLowerCase().includes('quota') || lastErrorMessage.includes('429')) {
                closeReason = 'quota_gemini';
              } else if (lastErrorMessage.toLowerCase().includes('context') || lastErrorMessage.toLowerCase().includes('token')) {
                closeReason = 'context_too_long';
              } else {
                closeReason = 'generation_error';
              }
            } else if (closeCode === 1008 || closeReasonText?.toLowerCase().includes('limit') || closeReasonText?.toLowerCase().includes('token')) {
              closeReason = 'context_too_long';
              closeDetail = closeReasonText || `Close code ${closeCode}`;
            } else if (lastServerMessage?.goAway) {
              closeReason = 'session_expired_goaway';
              closeDetail = JSON.stringify(lastServerMessage.goAway);
              if (!goAwayHandled) {
                clientWs.send(JSON.stringify({ type: 'session_restart', reason: 'goaway', detail: lastServerMessage.goAway, conversation_id: conversationId, turns_completed: conversationCtx.turns }));
              }
            } else if (closeCode === 1011) {
              closeReason = 'generation_error';
              closeDetail = closeReasonText || `Close code ${closeCode}`;
            } else if ([1000, 1001, 1005].includes(closeCode)) {
              closeReason = 'client_initiated';
              closeDetail = 'Fermeture propre';
            } else {
              closeDetail = closeReasonText || `Close code ${closeCode}`;
            }

            if (closeReason === 'session_expired_goaway') {
              console.info('[Gemini Live] 🔄 Session terminée normalement (GoAway lifecycle)');
              if (!clientWsClosing && clientWs.readyState === WebSocket.OPEN) {
                clientWsClosing = true;
                setTimeout(() => { try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000, 'session_restart_goaway'); } catch {} }, 300);
              }
            } else {
              console.error('[Gemini Live] ❌ Session fermée prématurément !', { reason: closeReason, detail: closeDetail });
              if (closeReason === 'context_too_long' && conversationId) {
                (async () => {
                  try {
                    const messages = await getConversationMessages(conversationId!, 12);
                    if (messages.length >= 4) {
                      const { summary, method } = await summarizeWithLLM(messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
                      clientWs.send(JSON.stringify({ type: 'session_restart', reason: 'context_overflow', conversation_id: conversationId, turns_completed: conversationCtx.turns, summary, summaryMethod: method, messagesSummarized: messages.length }));
                    } else {
                      clientWs.send(JSON.stringify({ type: 'session_restart', reason: 'context_overflow', conversation_id: conversationId, turns_completed: conversationCtx.turns, summary: '', summaryMethod: 'none', messagesSummarized: 0 }));
                    }
                  } catch {
                    clientWs.send(JSON.stringify({ type: 'session_restart', reason: 'context_overflow', conversation_id: conversationId, turns_completed: conversationCtx.turns, summary: '', summaryMethod: 'error', messagesSummarized: 0 }));
                  } finally {
                    if (!clientWsClosing && clientWs.readyState === WebSocket.OPEN) {
                      clientWsClosing = true;
                      setTimeout(() => { try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000, 'context_overflow_restart'); } catch {} }, 200);
                    }
                  }
                })();
              } else {
                clientWs.send(JSON.stringify({ closed: true, reason: 'gemini_session_closed', geminiReason: closeReason, geminiDetail: closeDetail }));
              }
            }
          },
          onerror: (err: any) => {
            lastErrorMessage = err?.message || String(err);
            console.error('[Gemini Live] ❌ Erreur session:', err?.message || err);
            clientWs.send(JSON.stringify({ error: err?.message || String(err) }));
          },
        },
      });

      console.log('[Gemini Live] Session connected successfully');
      sessionRef.current = session;

      // ── Inject context resume summary ─────────────────────────────────
      if (contextResumeSummary) {
        const resumeText = `[CONTEXTE DE LA CONVERSATION PRÉCÉDENTE — Résumé automatique]\n\n${contextResumeSummary}\n\nContinue la conversation en tenant compte de ce résumé.`;
        session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: resumeText }] }] });
        const resumeTokens = estimateTokens(resumeText);
        clientWs.send(JSON.stringify({ type: 'context_resumed', conversation_id: conversationId, summaryTokens: resumeTokens }));
      }

      const initialPromptSize = estimateTokens(buildCombined() + (contextResumeSummary || ''));
      sendContextSize(initialPromptSize, { turns: 0 });

      // ── Auto-summarize setup ────────────────────────────────────────
      // Cooldown et plafond réduits/augmentés : pendant une mission autonome, les
      // outils s'enchaînent en quelques secondes et le contexte grossit vite. Un
      // cooldown de 30 s et un plafond de 6 résumés/session laissent le résumé
      // suivre le rythme sans laisser le contexte déborder.
      // La compression serveur (contextWindowCompression) est désormais le
      // mécanisme PRINCIPAL. L'auto-résumé n'est qu'un repli : cooldown plus long,
      // plafond réduit, seuil de messages plus élevé pour éviter les résumés
      // prématurés qui rajoutent du texte à la session.
      const AUTO_SUMMARIZE_COOLDOWN_MS = 60_000;
      const MAX_AUTO_SUMMARIZES_PER_SESSION = 2;
      const MIN_MESSAGES_FOR_AUTO_SUMMARIZE = 16;

      autoSummarizeContext = async () => {
        if (!conversationId) return;
        const now = Date.now();
        if (now - conversationCtx.lastAutoSummarizeAt < AUTO_SUMMARIZE_COOLDOWN_MS) return;
        if (conversationCtx.autoSummarizeCount >= MAX_AUTO_SUMMARIZES_PER_SESSION) return;

        const messages = await getConversationMessages(conversationId, 40);
        if (messages.length < MIN_MESSAGES_FOR_AUTO_SUMMARIZE) return;

        clientWs.send(JSON.stringify({ type: 'context_summarize_progress', status: 'running', auto: true }));
        try {
          const tokensBefore = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
          const minKeep = 8;       // garder les 8 messages les plus récents intacts
          const toSummarize = messages.slice(0, -minKeep);
          const keptMessages = messages.slice(-minKeep);
          const { summary, method } = await summarizeWithLLM(toSummarize.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
          const summaryText = `[CONTEXTE COMPACTÉ (AUTO) — ${toSummarize.length} messages résumés]\n\n${summary}`;
          session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: summaryText }] }] });
          const summaryTokens = estimateTokens(summaryText);
          const keptTokens = keptMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
          const baseTokens = estimateTokens(buildCombined());
          const newSize = summaryTokens + keptTokens + baseTokens;
          conversationCtx.totalPromptTokens = Math.floor(newSize * 0.7);
          conversationCtx.totalCompletionTokens = Math.floor(newSize * 0.3);
          // Réinitialiser la taille courante estimée : le prochain promptTokenCount
          // la corrigera avec la valeur réelle post-compression.
          conversationCtx.currentContextTokens = newSize;
          conversationCtx.pendingToolTokens = 0;
          conversationCtx.warningsIssued.clear();
          conversationCtx.lastAlertLevel = '';
          conversationCtx.lastAutoSummarizeAt = now;
          conversationCtx.autoSummarizeCount++;
          if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            try {
              const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
              await supabase.from('conversations').update({ summary }).eq('id', conversationId);
            } catch { /* ignore */ }
          }
          clientWs.send(JSON.stringify({ type: 'context_summarized', status: 'success', auto: true, method, tokensBefore, tokensAfter: newSize, tokensSaved: Math.max(0, tokensBefore - newSize), messagesSummarized: toSummarize.length }));
        } catch (e) {
          clientWs.send(JSON.stringify({ type: 'context_summarized', status: 'error', auto: true, error: (e as Error).message }));
        }
      };

      // ── Client message handler ──────────────────────────────────────
      clientWs.on('message', (data, isBinary) => {
        try {
          if (isBinary) {
            const now = Date.now();
            const elapsed = now - audioRateState.windowStart;

            if (elapsed >= AUDIO_RATE_WINDOW_MS) {
              if (audioRateState.droppedChunks > 0) {
                console.warn(`[AudioRateLimit] ${audioRateState.droppedChunks} chunk(s) abandonnés dans la fenêtre précédente (${Math.round(audioRateState.bytesInWindow / 1024)} KB/s)`);
              }
              audioRateState.windowStart = now;
              audioRateState.bytesInWindow = 0;
              audioRateState.droppedChunks = 0;
            }

            const buf = data as Buffer;
            const chunkBytes = buf.byteLength;

            if (audioRateState.bytesInWindow + chunkBytes > AUDIO_RATE_LIMIT_BYTES_PER_SEC) {
              audioRateState.violations++;
              audioRateState.droppedChunks++;
              if (audioRateState.violations % AUDIO_RATE_VIOLATION_LOG_INTERVAL === 1) {
                console.warn(`[AudioRateLimit] Violation #${audioRateState.violations} — débit > ${AUDIO_RATE_LIMIT_BYTES_PER_SEC / 1024} KB/s`);
                try {
                  clientWs.send(JSON.stringify({
                    type: 'audio_rate_limited',
                    violations: audioRateState.violations,
                    limitKBs: Math.round(AUDIO_RATE_LIMIT_BYTES_PER_SEC / 1024),
                  }));
                } catch { /* ignore si WS fermé */ }
              }
            } else {
              audioRateState.bytesInWindow += chunkBytes;
              session.sendRealtimeInput({ audio: { data: buf.toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
              // (Ré)arme le timer d'inactivité : tant que des chunks arrivent, le
              // flux est considéré ouvert ; après 1s de silence → audioStreamEnd.
              armAudioIdleTimer();
            }
            return;
          }

          const msg = JSON.parse(data.toString());

          if (msg.video) {
            session.sendRealtimeInput({ video: { data: msg.video.data, mimeType: msg.video.mimeType } });
          }

          // ── Contexte éditeur (fichier actif, sélection, curseur) ─────────
          // Envoyé par le client avant/pendant une requête vocale pour que Gemini
          // dispose du contexte IDE de l'utilisateur sans qu'il ait à le décrire.
          if (msg.type === 'voice_context') {
            const parts: string[] = [];
            if (msg.openFile) parts.push(`Fichier actif : ${msg.openFile}${msg.language ? ` (${msg.language})` : ''}`);
            if (msg.cursorLine != null) parts.push(`Curseur : ligne ${msg.cursorLine}${msg.cursorColumn != null ? `, colonne ${msg.cursorColumn}` : ''}`);
            if (msg.selection && String(msg.selection).trim().length > 0) {
              const sel = String(msg.selection).slice(0, 1200); // cap à 1200 chars (chaque injection s'accumule)
              parts.push(`Sélection en cours :\n\`\`\`\n${sel}\n\`\`\``);
            }
            
            // Fichiers ouverts (contexte élargi)
            if (msg.openFiles && Array.isArray(msg.openFiles) && msg.openFiles.length > 0) {
              const fileList = msg.openFiles.slice(0, 10).join(', '); // limiter à 10 fichiers
              parts.push(`Fichiers ouverts (${msg.openFiles.length}) : ${fileList}`);
            }
            
            // Erreurs TypeScript actives
            if (msg.tsErrors && Array.isArray(msg.tsErrors) && msg.tsErrors.length > 0) {
              const errorLines = msg.tsErrors.slice(0, 15).map((err: any) => 
                `  • ${err.file}:${err.line}:${err.column} - ${err.message}`
              ).join('\n');
              parts.push(`Erreurs TypeScript détectées (${msg.tsErrors.length}) :\n${errorLines}`);
            }
            
            if (parts.length > 0) {
              const contextText = `[CONTEXTE IDE]\n${parts.join('\n')}`;
              try {
                session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: contextText }] }] });
              } catch (e) {
                console.error('[VoiceContext] Erreur injection contexte éditeur:', e);
              }
            }
          }

          if (msg.type === 'context_resume_summary' && msg.summary && !contextResumeSummary) {
            const resumeText = `[CONTEXTE DE LA CONVERSATION PRÉCÉDENTE]\n\n${msg.summary}\n\nContinue en tenant compte de ce résumé.`;
            try {
              session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: resumeText }] }] });
              clientWs.send(JSON.stringify({ type: 'context_resume_ack', injected: true }));
            } catch (e) {
              console.error('[ContextResume] Erreur injection résumé fallback:', e);
            }
          }

          if (msg.context_exclude && typeof msg.context_exclude === 'string') {
            const excludedPath = msg.context_exclude.trim();
            if (excludedPath) {
              session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `[SYSTEM] Exclure la source du contexte pour les prochains tours: ${excludedPath}` }] }] });
              clientWs.send(JSON.stringify({ type: 'context_source_excluded', path: excludedPath }));
            }
          }

          if (msg.text) {
            // Avec des outils NON_BLOCKING, le modèle génère lui-même ses phrases
            // d'attente. On n'injecte donc plus de texte parlé ; on informe juste
            // l'UI de l'activité en cours (statut, pas transcript).
            if (getBusyDescription()) {
              clientWs.send(JSON.stringify({ type: 'busy_status', busyWith: getBusyDescription() }));
            }
            session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: msg.text }] }] });
            (async () => {
              if (conversationReady) await conversationReady;
              if (conversationId) {
                flushAssistantBuffer();
                saveMessage('user', msg.text, conversationId).catch(console.error);
              }
            })();
          }

          if (msg.type === 'document_context' && msg.summary && msg.fileName) {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: `[DOCUMENT UPLOADÉ] "${msg.fileName}". Analyse:\n\n${msg.summary}` }] }],
            });
            clientWs.send(JSON.stringify({ type: 'document_context_ack', fileName: msg.fileName }));
          }

          if (msg.type === 'summarize_context') {
            (async () => {
              try {
                clientWs.send(JSON.stringify({ type: 'context_summarize_progress', status: 'running' }));
                if (!conversationId) { clientWs.send(JSON.stringify({ type: 'context_summarized', status: 'error', error: 'Aucune conversation active.' })); return; }
                const messages = await getConversationMessages(conversationId, 40);
                if (messages.length < 6) { clientWs.send(JSON.stringify({ type: 'context_summarized', status: 'error', error: 'Conversation trop courte (minimum 6 messages).' })); return; }
                const tokensBefore = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
                const minKeep = 8;       // garder les 8 messages les plus récents intacts
                const toSummarize = messages.slice(0, -minKeep);
                const keptMessages = messages.slice(-minKeep);
                const { summary, method } = await summarizeWithLLM(toSummarize.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
                const summaryText = `[CONTEXTE COMPACTÉ — ${toSummarize.length} messages résumés]\n\n${summary}`;
                session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: summaryText }] }] });
                const summaryTokens = estimateTokens(summaryText);
                const keptTokens = keptMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
                const baseTokens = estimateTokens(buildCombined());
                const newSize = summaryTokens + keptTokens + baseTokens;
                conversationCtx.totalPromptTokens = Math.floor(newSize * 0.7);
                conversationCtx.totalCompletionTokens = Math.floor(newSize * 0.3);
                conversationCtx.currentContextTokens = newSize;
                conversationCtx.pendingToolTokens = 0;
                conversationCtx.warningsIssued.clear();
                conversationCtx.lastAlertLevel = '';
                if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
                  try {
                    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                    await supabase.from('conversations').update({ summary }).eq('id', conversationId);
                  } catch { /* ignore */ }
                }
                clientWs.send(JSON.stringify({ type: 'context_summarized', status: 'success', method, tokensBefore, tokensAfter: newSize, tokensSaved: Math.max(0, tokensBefore - newSize), messagesSummarized: toSummarize.length, summaryPreview: summary.slice(0, 200) }));
              } catch (e) {
                clientWs.send(JSON.stringify({ type: 'context_summarized', status: 'error', error: (e as Error).message }));
              }
            })();
          }

          if (msg.type === 'save-rich-document' && msg.document && msg.path) {
            (async () => {
              try {
                const { resolveSandboxWriteTarget } = await import('../skills/codebaseHelpers.js');
                const { markFileModified, isSandboxActive: sbActive } = await import('../utils/sandbox.js');
                const outputPath: string = String(msg.path).trim();
                if (!outputPath) { clientWs.send(JSON.stringify({ type: 'save-rich-document-result', status: 'error', error: 'Chemin manquant.' })); return; }
                const target = resolveSandboxWriteTarget(outputPath);
                if (!target) { clientWs.send(JSON.stringify({ type: 'save-rich-document-result', status: 'error', error: sbActive() ? `Chemin invalide: "${outputPath}"` : 'Sandbox inactif.' })); return; }
                const content = JSON.stringify(msg.document, null, 2);
                await fs.promises.mkdir(path.dirname(target.sandboxPath), { recursive: true });
                await fs.promises.writeFile(target.sandboxPath, content, 'utf-8');
                markFileModified(outputPath);
                clientWs.send(JSON.stringify({ type: 'save-rich-document-result', status: 'success', path: outputPath, bytes: Buffer.byteLength(content, 'utf-8') }));
                clientWs.send(JSON.stringify({ type: 'ide-action', action: { type: 'file-changed', path: outputPath } }));
              } catch (err: any) {
                clientWs.send(JSON.stringify({ type: 'save-rich-document-result', status: 'error', error: err?.message ?? 'Erreur inconnue.' }));
              }
            })();
          }

          if (msg.type === 'confirm-response' && msg.requestId) {
            import('../utils/confirmationBridge.js').then(({ handleConfirmationResponse }) => {
              handleConfirmationResponse(msg.requestId, msg.approved === true);
            });
          }
        } catch (e) {
          console.error('Error parsing message from client:', e);
        }
      });

      // ── Lifecycle ──────────────────────────────────────────────────
      activeGeminiSessions.add(session);
      sessionSupervisor.setSessionInjector((message: string) => {
        try { session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: message }] }] }); } catch (e) { console.error('[Supervisor] Injection échouée:', e); }
      });

      clientWs.on('close', () => {
        console.log('Client disconnected');
        if (audioIdleTimer) { clearTimeout(audioIdleTimer); audioIdleTimer = null; }
        activeGeminiSessions.delete(session);
        flushAssistantBuffer();
        if (conversationId) {
          endConversation(conversationId).catch(e => console.error('[History] Erreur fin conversation:', e));
        }
        try { session.close(); } catch { /* session déjà fermée */ }
      });

    } catch (err) {
      console.error('Failed to connect to Gemini Live:', err);
      clientWs.send(JSON.stringify({ error: 'Failed to connect to Gemini Live' }));
    }
  });
}

/**
 * Normalise un chemin de fichier pour une comparaison case-insensitive.
 * Convertit les backslashes en slashes, supprime le préfixe './' et met en lowercase.
 * Essentiel pour Windows où les chemins peuvent être Src/App.tsx ou src/app.tsx.
 */
function normalizeContextPath(value: unknown): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

/**
 * Met à jour l'état du Context Gate après l'exécution d'un outil.
 * Tous les chemins sont normalisés en lowercase pour éviter les problèmes
 * de case-sensitivity sur Windows.
 */
function updateContextGate(state: SessionContextGate, toolName: string, args: any, response: any): void {
  // Enregistrer les fichiers lus (tous normalisés en lowercase)
  if (toolName === 'read_project_file' && response && !(response as any).error) {
    const path = normalizeContextPath(args?.path);
    if (path) state.readFiles.add(path);
    return;
  }

  // knowledge_build_context active le gate et définit les fichiers requis
  if (toolName !== 'knowledge_build_context' || !response || response.status !== 'success') return;

  const confidence = Number(response.summary?.confidence ?? response.score?.confidence);
  const risk = String(response.summary?.global_risk ?? response.score?.risk ?? 'unknown');
  state.confidence = Number.isFinite(confidence) ? confidence : null;
  state.risk = risk;
  
  // Normaliser TOUS les fichiers requis en lowercase
  state.requiredFiles = new Set([
    ...(response.batch?.files ?? []).map((file: any) => normalizeContextPath(file.path)),
    ...(response.missing_actions ?? [])
      .filter((action: any) => action.kind === 'read_file' && (action.priority === 'high' || action.priority === 'critical'))
      .map((action: any) => normalizeContextPath(action.target)),
    // ✅ NOUVEAU : Support pour response.requiredFiles (si présent)
    ...(response.requiredFiles ?? []).map((file: any) => normalizeContextPath(file)),
  ].filter(Boolean));
  
  state.active = (state.confidence !== null && state.confidence < 65) || risk === 'high';
}

/**
 * Vérifie si le contexte requis est complet (tous les fichiers requis ont été lus).
 * Tous les chemins sont normalisés en lowercase, donc la comparaison est case-insensitive.
 *
 * Optimisations :
 * - SAFE_TOOLS bypass : certains outils (création, renommage) passent toujours.
 * - Small edits tolérance : modifications < 50 lignes → seuil de confiance abaissé à 55%.
 */
function isContextReady(state: SessionContextGate, toolName?: string, args?: any): boolean {
  if (!state.active) return true;

  // ── SAFE_TOOLS bypass ────────────────────────────────────────────────────
  // Ces outils créent ou renomment des fichiers — ils n'ont pas besoin d'un
  // contexte complet car ils n'écrasent pas de contenu existant critique.
  const SAFE_TOOLS = new Set([
    'write_project_file',       // Création d'un nouveau fichier
    'create_project_directory', // Création de dossier
    'rename_project_file',      // Renommage (pas de modification du contenu)
    'graphify_query',
    'graphify_path',
    'graphify_explain',
    'graphify_affected',
    'graphify_god_nodes',
    'graphify_read_report',
    'graphify_update',
  ]);

  if (toolName && SAFE_TOOLS.has(toolName)) {
    return true;
  }

  // ── Small edits tolérance +10% ───────────────────────────────────────────
  // Un patch < 50 lignes est moins risqué : on tolère une confiance plus basse.
  const isSmallEdit = toolName === 'patch_project_file' &&
    args?.lineStart != null && args?.lineEnd != null &&
    (Number(args.lineEnd) - Number(args.lineStart)) < 50;

  // Seuil normal : 65% ; seuil "small edit" : 55% (tolérance +10%)
  const confidenceThreshold = isSmallEdit ? 55 : 65;

  // Autoriser si :
  //   - la confiance est suffisante (selon le seuil adapté), OU
  //   - le risque n'est pas "high" ET aucun fichier requis n'est défini
  const confidentEnough = state.confidence !== null && state.confidence >= confidenceThreshold;
  const noHighRisk = state.risk !== 'high' && state.requiredFiles.size === 0;

  if (confidentEnough || noHighRisk) return true;

  // Sinon, vérifier que tous les fichiers requis ont été lus
  const allRead = state.requiredFiles.size > 0 &&
    Array.from(state.requiredFiles).every((file) => state.readFiles.has(file));

  // Debug log pour Windows (case-sensitivity)
  if (!allRead && state.requiredFiles.size > 0) {
    const missing = Array.from(state.requiredFiles).filter(f => !state.readFiles.has(f));
    console.log('[ContextGate] Fichiers manquants:', missing);
    console.log('[ContextGate] Fichiers lus:', Array.from(state.readFiles));
  }

  return allRead;
}

// ── Cap sur la taille des résultats d'outils ─────────────────────────────────
// Tronque un résultat d'outil trop volumineux avant son injection dans la
// session Live. On sérialise la réponse, et si elle dépasse le plafond on
// conserve le début (le plus utile) en ajoutant un marqueur de troncature
// explicite pour que le modèle sache que le contenu a été coupé.
function capToolResponse(
  response: unknown,
  toolName: string,
  maxChars = toolResultCap(toolName),
): { response: unknown; truncated: boolean; originalChars: number } {
  let serialized: string;
  try {
    serialized = typeof response === 'string' ? response : JSON.stringify(response);
  } catch {
    // Réponse non sérialisable (rare) : on la laisse telle quelle.
    return { response, truncated: false, originalChars: 0 };
  }

  const originalChars = serialized.length;
  if (originalChars <= maxChars) {
    return { response, truncated: false, originalChars };
  }

  // Troncature tête + queue : on garde 70 % du début (contenu principal) et
  // 30 % de la fin — les erreurs, résumés et statuts arrivent souvent en fin
  // de sortie et seraient perdus par une simple coupe du début.
  const marker =
    `\n\n[…RÉSULTAT TRONQUÉ — outil "${toolName}" : ` +
    `${originalChars} caractères réduits à ${maxChars} (début + fin conservés). ` +
    `Affine la requête (chemin précis, sous-dossier, plage de lignes) pour le détail manquant.]\n\n`;
  const budget = Math.max(0, maxChars - marker.length);
  const headChars = Math.floor(budget * 0.7);
  const tailChars = budget - headChars;
  const head = serialized.slice(0, headChars);
  const tail = tailChars > 0 ? serialized.slice(originalChars - tailChars) : '';

  return {
    response: {
      _truncated: true,
      _tool: toolName,
      _originalChars: originalChars,
      _keptChars: maxChars,
      content: head + marker + tail,
    },
    truncated: true,
    originalChars,
  };
}


// ── handleToolCall ─────────────────────────────────────────────────────────────
async function handleToolCall(
  toolCall: any,
  session: any,
  clientWs: WebSocket,
  mode: 'ask' | 'full' = 'full',
  busyStateRef?: { activeDescription: string | null },
  voiceName = 'Aoede',
  deps?: LiveSocketDeps,
  sessionSupervisor = new Supervisor(),
  contextGate: SessionContextGate = {
    active: false,
    confidence: null,
    risk: null,
    requiredFiles: new Set(),
    readFiles: new Set(),
  },
  onToolResultTokens?: (tokens: number) => void,
  // Marqueurs de synchronisation voix ↔ résultats d'outils. `onToolPending` est
  // appelé au début du lot (retient l'audio côté connexion), `onToolSettled`
  // après `sendToolResponse` (ou en cas d'échec) pour libérer le flux audio.
  audioSync?: {
    onToolPending: (callIds: string[]) => void;
    onToolSettled: (callIds: string[]) => void;
  },
): Promise<void> {
  const functionResponses: any[] = [];
  // IDs des calls de ce lot, pour les marqueurs de synchronisation audio.
  const batchCallIds: string[] = Array.isArray(toolCall?.functionCalls)
    ? toolCall.functionCalls.map((c: any) => c?.id).filter(Boolean)
    : [];
  const skillManager = deps?.skillManager;
  const browserReadPending = deps?.browserReadPending;
  const browserActionPending = deps?.browserActionPending;
  const currentProfile = deps?.getCurrentProfile?.() ?? {};

  const WRITE_TOOLS = new Set([
    'write_project_file', 'modify_project_file', 'patch_project_file', 'rename_project_file',
    'delete_project_file', 'delete_project_folder', 'create_project_directory',
  ]);

  const context = {
    voiceName,
    notifyLiveAPI: (message: string) => {
      try { session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `[BACKGROUND TASK UPDATE] ${message}` }] }] }); } catch (e) { console.error('Failed to notify Live API:', e); }
    },
    emitIdeAction: (action: any) => {
      try { clientWs.send(JSON.stringify({ type: 'ide-action', action })); } catch (e) { console.error('Failed to emit IDE action:', e); }
    },
    emitToClient: (data: any) => {
      try { clientWs.send(JSON.stringify(data)); } catch (e) { console.error('Failed to emit to client:', e); }
    },
    browserReadPending,
    browserActionPending,
    supervisor: sessionSupervisor,
  };

  try { clientWs.send(JSON.stringify({ busy: true })); } catch {}
  // Retient l'audio sortant tant que ce lot d'outils est en vol.
  try { audioSync?.onToolPending(batchCallIds); } catch {}
  if (busyStateRef) {
    const firstCallName = toolCall.functionCalls?.[0]?.name ?? "traitement d'outils";
    busyStateRef.activeDescription = `l'exécution de l'outil "${firstCallName}"`;
  }

  // Tout le corps est enveloppé dans try/finally : quoi qu'il arrive (exception
  // avant la boucle, functionCalls vide/non itérable, etc.), on garantit l'envoi
  // de { busy: false } pour rétablir le micro et éviter le blocage perçu.
  try {
  for (const call of toolCall.functionCalls) {
    // Arguments réellement transmis à l'outil (coercés le cas échéant). Déclaré
    // au scope de l'itération pour rester accessible dans le catch et enrichir
    // l'erreur constructive (receivedArgs). Fallback sur call.args si l'exception
    // survient avant la coercition.
    let receivedArgs: unknown = call.args;
    try {
      // Ask mode guard
      if (mode === 'ask' && WRITE_TOOLS.has(call.name)) {
        const filePath = (call.args?.path || call.args?.newPath || '') as string;
        const isAllowed = call.name === 'write_project_file' && filePath.endsWith('.md');
        if (!isAllowed) {
          functionResponses.push({ id: call.id, name: call.name, response: { error: 'Mode Ask actif : modification de fichiers interdite.' } });
          clientWs.send(JSON.stringify({ tool_used: call.name, info: '[BLOQUÉ - Mode Ask]' }));
          continue;
        }
      }

      clientWs.send(JSON.stringify({ tool_start: call.name, args: call.args }));

      // Supervisor guard
      if (WRITE_TOOLS.has(call.name)) {
        const blockedPath = (call.args?.path || call.args?.newPath || '') as string;
        if (sessionSupervisor.isMissionPaused() || (blockedPath && sessionSupervisor.isFileBlocked(blockedPath))) {
          const reason = sessionSupervisor.isMissionPaused()
            ? 'La mission est en pause après escalade.'
            : `Le fichier "${blockedPath}" est en boucle de correction.`;
          functionResponses.push({ id: call.id, name: call.name, response: { error: `[SUPERVISOR] Écriture bloquée. ${reason}` } });
          clientWs.send(JSON.stringify({ tool_used: call.name, info: `[BLOQUÉ - Supervisor] ${reason}` }));
          continue;
        }
        if (contextGate.active && !isContextReady(contextGate, call.name, call.args)) {
          const pending = Array.from(contextGate.requiredFiles)
            .filter((file) => !contextGate.readFiles.has(file))
            .slice(0, 4)
            .join(', ');
          const reason = pending
            ? `Lis d'abord les fichiers pertinents: ${pending}.`
            : 'Lis le contexte pertinent et relance knowledge_build_context avant de modifier.';
          functionResponses.push({ id: call.id, name: call.name, response: {
            error: `[CONTEXT GATE] Écriture suspendue: confiance ${contextGate.confidence ?? 0}% (${contextGate.risk ?? 'unknown'}). ${reason}`,
            confidence: contextGate.confidence,
            risk: contextGate.risk,
            requiredFiles: Array.from(contextGate.requiredFiles),
          } });
          clientWs.send(JSON.stringify({ tool_used: call.name, info: `[BLOQUÉ - Contexte insuffisant] ${reason}` }));
          continue;
        }
      }

      // request_tools meta-tool
      if (call.name === 'request_tools' && skillManager) {
        const category = String(call.args?.category || '').trim().toLowerCase();
        const { loaded, tools: loadedToolNames } = await skillManager.discoverAndLoad(category);
        if (loaded.length > 0 || category === 'all') {
          try {
            session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `[SYSTEM] Outils "${category}" chargés (${loadedToolNames.length} outils): ${loadedToolNames.join(', ')}. Tu peux maintenant les utiliser.` }] }] });
          } catch { /* ignore */ }
          functionResponses.push({ id: call.id, name: call.name, response: { status: 'success', loaded: category, skills: loaded, tools: loadedToolNames, message: `Outils "${category}" chargés et disponibles.` } });
        } else {
          functionResponses.push({ id: call.id, name: call.name, response: { error: `Catégorie inconnue ou déjà chargée: "${category}".` } });
        }
        continue;
      }

      // Agent role guard
      if (call.name === 'agent_delegate' && (currentProfile as any).agents?.enabled !== false && (currentProfile as any).agents?.allowedRoles?.length) {
        const requestedRole = String(call.args?.role || '').toLowerCase();
        if (!(currentProfile as any).agents.allowedRoles.includes(requestedRole)) {
          functionResponses.push({ id: call.id, name: call.name, response: { error: `Rôle "${requestedRole}" non autorisé. Rôles disponibles: ${(currentProfile as any).agents.allowedRoles.join(', ')}.` } });
          clientWs.send(JSON.stringify({ tool_used: call.name, info: `[BLOQUÉ - Rôle "${requestedRole}" désactivé]` }));
          continue;
        }
      }

      // Git guard
      if (call.name.startsWith('git_')) {
        functionResponses.push({ id: call.id, name: call.name, response: { error: 'Git est entièrement désactivé.' } });
        clientWs.send(JSON.stringify({ tool_used: call.name, info: '[BLOQUÉ - Git désactivé]' }));
        continue;
      }

      // Reasoning guard
      if (call.name.startsWith('reasoning_') && (currentProfile as any).reasoningEnabled === false) {
        functionResponses.push({ id: call.id, name: call.name, response: { error: 'Le raisonnement structuré est désactivé.' } });
        continue;
      }

      if (!skillManager) {
        functionResponses.push({ id: call.id, name: call.name, response: { error: 'SkillManager non disponible.' } });
        continue;
      }

      // ── Coercition des arguments (robustesse STT) ────────────────────────
      // Normalise les arguments mal formatés par la dictée vocale AVANT
      // validation/exécution : chemins, JSON-en-string, scalaires évidents.
      // Conservateur : ne corrige que les cas non ambigus. On journalise les
      // corrections et on les remonte au client pour transparence.
      const { args: effectiveArgs, corrections } = coerceToolArgs(call.name, call.args);
      receivedArgs = effectiveArgs;
      if (corrections.length > 0) {
        console.log(`[ArgCoerce] ${call.name}: ${corrections.join(' | ')}`);
        try {
          clientWs.send(JSON.stringify({ type: 'arg_coerced', tool: call.name, corrections }));
        } catch { /* ignore si WS fermé */ }
      }

      // ── Retry logic pour erreurs transientes ─────────────────────────────
      // MAX_RETRIES=2, délai initial RETRY_DELAY_MS=1000ms, backoff exponentiel.
      // Seules les erreurs réseau/IO/timeout sont retentées (pas les erreurs métier).
      let response: unknown = undefined;
      for (let attempt = 0; attempt <= TOOL_MAX_RETRIES; attempt++) {
        try {
          response = await skillManager.handleToolCall(call.name, effectiveArgs, context);
          break; // Succès — sortir de la boucle
        } catch (toolErr: any) {
          const retryable = isRetryableToolError(toolErr);
          const remaining = TOOL_MAX_RETRIES - attempt;

          if (!retryable || remaining === 0) {
            // Erreur non-retryable ou plus de tentatives — propager
            throw toolErr;
          }

          // Backoff exponentiel : 1s → 2s
          const delay = Math.min(TOOL_RETRY_DELAY_MS * Math.pow(2, attempt), 8000);
          console.warn(`[ToolRetry] ${call.name} — tentative ${attempt + 1}/${TOOL_MAX_RETRIES + 1} échouée (${toolErr.message}). Retry dans ${delay}ms...`);
          try {
            clientWs.send(JSON.stringify({
              tool_retry: call.name,
              attempt: attempt + 1,
              maxRetries: TOOL_MAX_RETRIES,
              error: toolErr.message,
              retryIn: delay,
            }));
          } catch { /* ignore si WS fermé */ }
          await sleepMs(delay);
        }
      }

      const success = !(response && (response as any).error && !(response as any).status);
      try { skillManager.recordToolUsage(call.name, success); } catch {}

      // On utilise les arguments coercés pour tout le suivi aval (context gate,
      // trace client, auto-verify) afin de refléter ce qui a réellement été exécuté.
      updateContextGate(contextGate, call.name, effectiveArgs, response);

      functionResponses.push({ id: call.id, name: call.name, response });
      clientWs.send(JSON.stringify({
        tool_used: call.name,
        info: JSON.stringify(effectiveArgs),
        ...(call.name === 'security_audit' ? { result: response } : {}),
      }));

      // Auto-verify
      const WRITE_TOOLS_VERIFY = ['write_project_file', 'modify_project_file', 'patch_project_file', 'rename_project_file'];
      const VERIFY_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
      const verifyPath = call.name === 'rename_project_file' ? (effectiveArgs as any)?.newPath : (effectiveArgs as any)?.path;
      const verifyExt = verifyPath ? path.extname(verifyPath).toLowerCase() : '';
      if (WRITE_TOOLS_VERIFY.includes(call.name) && verifyPath && VERIFY_EXTENSIONS.has(verifyExt)) {
        try {
          const verifyResult = await skillManager.handleToolCall('verify_file', { path: verifyPath }, context);
          functionResponses.push({ id: `${call.id}_verify`, name: 'verify_file', response: verifyResult });
          clientWs.send(JSON.stringify({ tool_used: 'verify_file', info: JSON.stringify({ path: verifyPath }) }));
          const evaluation = await sessionSupervisor.evaluateVerifyResult(verifyPath, verifyResult);
          if (evaluation.needsCorrection && evaluation.directive) {
            setTimeout(() => {
              try {
                sessionSupervisor.injectDirective(evaluation.directive!);
                clientWs.send(JSON.stringify({ supervisor_action: 'correction_injected', file: verifyPath, attempt: sessionSupervisor.getStats().totalCorrections }));
              } catch (e) { console.error('[Supervisor] Injection échouée:', e); }
            }, 100);
          }
        } catch (verifyErr: any) {
          functionResponses.push({ id: `${call.id}_verify`, name: 'verify_file', response: { error: `Auto-verify échoué: ${verifyErr.message}` } });
        }
      }
    } catch (e: any) {
      console.error(`Error executing tool ${call.name}:`, e);
      // Erreur constructive : préserve les métadonnées de validation (issues Zod,
      // suggestions, arguments reçus) pour que le modèle puisse s'auto-corriger et
      // rappeler l'outil, au lieu d'une string brute non exploitable.
      const errorResponse = buildToolErrorResponse(e, receivedArgs);
      functionResponses.push({ id: call.id, name: call.name, response: errorResponse });
      try {
        clientWs.send(JSON.stringify({
          tool_used: call.name,
          info: `[ERREUR] ${errorResponse.error}`,
        }));
      } catch { /* ignore si WS fermé */ }
    }
  }

  if (functionResponses.length > 0) {
    // ── Cap par outil + enveloppe output/error + comptabilisation tokens ────
    // Pour chaque réponse :
    //   1. On tronque le PAYLOAD (pas l'enveloppe) selon le plafond de l'outil.
    //   2. On l'enveloppe en { output | error } — le SDK distingue succès/erreur
    //      via ces clés dans `response`.
    //   3. On estime les tokens réellement injectés (absents d'usageMetadata).
    // NOTE: le champ `scheduling` (WHEN_IDLE/SILENT/INTERRUPT) N'EST PAS supporté
    // par gemini-3.8-live-extended-thinking (le serveur renvoie « Function
    // response scheduling is not supported for this model » et ferme la session).
    // On déclare donc les outils NON_BLOCKING mais on n'ajoute jamais `scheduling`
    // aux réponses.
    // Un plafond global de lot (TOOL_RESULT_BATCH_CAP) empêche qu'un lot de
    // plusieurs gros résultats ne sature la fenêtre d'un seul coup.
    let injectedTokens = 0;
    let batchChars = 0;
    const wrapped: any[] = [];

    for (const fr of functionResponses) {
      // Budget par outil, resserré si le lot approche le plafond global.
      const remainingBatch = Math.max(2_000, TOOL_RESULT_BATCH_CAP - batchChars);
      const perToolCap = Math.min(toolResultCap(fr.name), remainingBatch);
      const capped = capToolResponse(fr.response, fr.name, perToolCap);
      let payload = capped.response;

      if (capped.truncated) {
        console.warn(
          `[ContextGuard] ✂️ Résultat "${fr.name}" tronqué: ` +
          `${capped.originalChars} → ${perToolCap} caractères.`,
        );
        try {
          clientWs.send(JSON.stringify({
            type: 'tool_result_truncated',
            tool: fr.name,
            originalChars: capped.originalChars,
            keptChars: perToolCap,
          }));
        } catch { /* ignore si WS fermé */ }
      }

      // Distinguer erreur vs sortie : le SDK lit `error` / `output` dans
      // `response`. Une réponse tronquée est un objet { content, _truncated… }.
      const isError = payload !== null && typeof payload === 'object' && 'error' in (payload as any) && !('status' in (payload as any));
      const responseEnvelope: Record<string, unknown> = isError
        ? { error: (payload as any).error }
        : { output: payload };

      const serialized = (() => {
        try { return JSON.stringify(responseEnvelope); } catch { return ''; }
      })();
      batchChars += serialized.length;
      injectedTokens += estimateTokens(serialized);

      wrapped.push({
        id: fr.id,
        name: fr.name,
        response: responseEnvelope,
      });
    }

    session.sendToolResponse({ functionResponses: wrapped });

    // Remonter les tokens injectés au moniteur de contexte de la connexion.
    if (injectedTokens > 0) {
      try { onToolResultTokens?.(injectedTokens); } catch { /* ignore */ }
    }
  }
  } finally {
    // Déblocage garanti du micro + description, quel que soit le chemin (succès,
    // exception avant la boucle, functionCalls vide…). Sans ça, le client peut
    // rester `isBusy=true` et l'utilisateur perçoit un blocage sur les fillers.
    try { clientWs.send(JSON.stringify({ busy: false })); } catch {}
    // Libère l'audio retenu : le résultat d'outil est réinjecté (ou l'échec est
    // acté), donc l'ordre voix ↔ résultat est désormais respecté. Placé dans le
    // finally pour garantir le settle même si functionResponses est vide ou si
    // une exception a interrompu le traitement (sinon l'audio resterait bloqué).
    try { audioSync?.onToolSettled(batchCallIds); } catch {}
    if (busyStateRef) busyStateRef.activeDescription = null;
  }
}

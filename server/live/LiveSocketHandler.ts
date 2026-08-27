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
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { SkillManager } from '../skills/SkillManager';
import { buildSystemInstruction, type ProfileConfig } from '../prompts/systemInstruction';
import { startConversation, endConversation, saveMessage, getConversationMessages } from '../skills/history';
import { isSandboxActive } from '../utils/sandbox';
import { subscribeToValidation } from '../utils/postEditValidator';
import { estimateTokens, summarizeWithLLM } from '../utils/tokenOptimizer';
import { knowledgeGraph, projectMemory, understandingEngine } from '../knowledge';
import { notebookManager } from '../notebooks';
import { supervisor } from '../autonomy';
import { WORKSPACE_SITE_URL } from '../utils/selfRoot';
import type { BrowserPendingEntry, BrowserActionPendingEntry } from '../routes/browser';

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
    browserReadPending,
    browserActionPending,
  } = deps;

  // ── Sandbox Watcher WebSocket ────────────────────────────────────────────
  sandboxWss.on('connection', async (clientWs) => {
    const { addWatchClient, startWatching } = await import('../utils/sandboxWatcher');
    console.log('[SandboxWatch] Client connecté');
    addWatchClient(clientWs);
    if (isSandboxActive()) {
      startWatching();
    }
  });

  // ── Gemini Live WebSocket ────────────────────────────────────────────────
  wss.on('connection', async (clientWs: WebSocket, req: any) => {
    console.log('Client connected to WebSocket');

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

    // ── Context window monitoring ────────────────────────────────────────
    const CONTEXT_WINDOW_TOKENS = 1_000_000;
    const SAFE_BUDGET_TOKENS = Math.floor(CONTEXT_WINDOW_TOKENS * 0.85);
    const WARNING_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * 0.60);
    const CRITICAL_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * 0.85);

    const conversationCtx = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      maxPromptTokensInTurn: 0,
      turns: 0,
      warningsIssued: new Set<string>(),
      lastAlertLevel: '' as '' | 'warn' | 'critical',
      lastAutoSummarizeAt: 0,
      autoSummarizeCount: 0,
    };

    let autoSummarizeContext: (() => Promise<void>) | null = null;

    const resolveContextLevel = (percent: number): 'ok' | 'warn' | 'critical' => {
      if (percent >= 85) return 'critical';
      if (percent >= 60) return 'warn';
      return 'ok';
    };

    const sendContextSize = (
      currentSize: number,
      opts?: { turns?: number; suggestion?: string; level?: 'ok' | 'warn' | 'critical' },
    ) => {
      const percent = Math.round((currentSize / CONTEXT_WINDOW_TOKENS) * 100);
      const level = opts?.level ?? resolveContextLevel(percent);
      try {
        clientWs.send(JSON.stringify({
          context_size: {
            currentSize,
            maxSize: CONTEXT_WINDOW_TOKENS,
            percent,
            level,
            turns: opts?.turns ?? conversationCtx.turns,
            suggestion: opts?.suggestion,
          },
        }));
      } catch {}
    };

    const monitorConversationContext = (prompt: number, completion: number, total: number) => {
      conversationCtx.totalPromptTokens += prompt;
      conversationCtx.totalCompletionTokens += completion;
      conversationCtx.maxPromptTokensInTurn = Math.max(conversationCtx.maxPromptTokensInTurn, prompt);
      conversationCtx.turns++;

      const cumulative = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
      const currentPct = (cumulative / CONTEXT_WINDOW_TOKENS) * 100;
      const turnPct = (prompt / CONTEXT_WINDOW_TOKENS) * 100;

      const baseLog =
        `[ContextMonitor] 🔄 Tour ${conversationCtx.turns}: prompt=${prompt} (${turnPct.toFixed(1)}%)` +
        ` | cumulatif=${cumulative}/${CONTEXT_WINDOW_TOKENS} (${currentPct.toFixed(1)}%)`;

      if (cumulative >= CRITICAL_THRESHOLD && !conversationCtx.warningsIssued.has('critical')) {
        conversationCtx.warningsIssued.add('critical');
        conversationCtx.lastAlertLevel = 'critical';
        console.warn(`[ContextMonitor] 🔴 CRITIQUE: contexte à ${currentPct.toFixed(1)}% !`);
        sendContextSize(cumulative, {
          level: 'critical',
          turns: conversationCtx.turns,
          suggestion: 'Contexte proche de la limite. Démarrer une nouvelle conversation ou demander un résumé.',
        });
        try {
          clientWs.send(JSON.stringify({
            context_alert: {
              level: 'critical',
              used_tokens: cumulative,
              max_tokens: CONTEXT_WINDOW_TOKENS,
              percent: Math.round(currentPct),
              suggestion: 'Contexte proche de la limite. Démarrer une nouvelle conversation ou demander un résumé.',
              turns: conversationCtx.turns,
            },
          }));
        } catch {}
        autoSummarizeContext?.();
      } else if (cumulative >= WARNING_THRESHOLD && !conversationCtx.warningsIssued.has('warn')) {
        conversationCtx.warningsIssued.add('warn');
        conversationCtx.lastAlertLevel = 'warn';
        console.warn(`[ContextMonitor] 🟠 AVERTISSEMENT: contexte à ${currentPct.toFixed(1)}%`);
        sendContextSize(cumulative, {
          level: 'warn',
          turns: conversationCtx.turns,
          suggestion: 'Conversation longue. Envisager un résumé ou knowledge_memory_add.',
        });
        try {
          clientWs.send(JSON.stringify({
            context_alert: {
              level: 'warn',
              used_tokens: cumulative,
              max_tokens: CONTEXT_WINDOW_TOKENS,
              percent: Math.round(currentPct),
              suggestion: 'Conversation longue. Envisager un résumé ou knowledge_memory_add.',
              turns: conversationCtx.turns,
            },
          }));
        } catch {}
      } else {
        console.log(baseLog);
      }

      sendContextSize(cumulative, { turns: conversationCtx.turns });
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
          const messages = await getConversationMessages(clientConvId, 100);
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
        'verify_file', 'verify_syntax', 'verify_typecheck',
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
        'reasoning_think',
        'agent_orchestrate', 'agent_status',
        'knowledge_search_entities', 'knowledge_status',
        'knowledge_memory_add', 'knowledge_memory_list',
        'knowledge_impact_analyze', 'knowledge_reindex',
        'create_rich_document',
        // Custom skills — toujours disponibles (Tier 1)
        'list_custom_skills', 'create_custom_skill', 'update_custom_skill', 'delete_custom_skill', 'toggle_custom_skill',
      ]);

      const ASK_MODE_ALLOWED_TOOLS = new Set([
        'list_project_files', 'read_project_file', 'read_file_outline', 'search_in_files',
        'analyze_project_file', 'get_workspace_info', 'open_project_file', 'open_ide',
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
      ]);

      let filteredDeclarations: typeof declarations;
      let scoringInfo: { always: string[]; dynamic: string[]; scored: { name: string; score: number }[] } | null = null;

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
            scoringInfo = { always: rel.alwaysLoaded, dynamic: rel.dynamicallyLoaded, scored: rel.scoredSkills };
          } else {
            filteredDeclarations = declarations.filter(d => TIER1_CORE_TOOLS.has(d.name) || d.name.startsWith('custom_'));
            filteredDeclarations.push({
              name: 'request_tools',
              description: `Demande le chargement d'outils supplémentaires. Catégories: "git", "github", "automation", "lists", "weather", "reasoning", "history", "system", "knowledge", "verify", "guidelines", "selfImprovement", "all".`,
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
            scoringInfo = { always: Array.from(TIER1_CORE_TOOLS), dynamic: [], scored: [] };
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

      const tools = filteredDeclarations.length > 0 ? [{ functionDeclarations: filteredDeclarations }] : undefined;
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
      const systemTokensEst = Math.ceil((systemText.split(/\s+/).length * 1.3 + systemText.length / 4) / 2);

      const memoryBudgetTokens = 2000;
      const knowledgeBudgetTokens = 3000;
      const notebookBudgetTokens = 15_000;
      const maxMemories = currentProfile.temperature !== undefined && currentProfile.temperature < 0.5 ? 5 : 10;
      const maxConversations = 3;
      const INITIAL_PROMPT_MAX_TOKENS = 60_000;
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
      let notebookContext = '';
      let notebookUsedChars = 0;
      const NOTEBOOK_HEADER_CHARS = 120;
      const MAX_SOURCES_PER_NOTEBOOK = 5;
      const MAX_NOTEBOOKS_TOTAL = 5;
      const MAX_CHARS_PER_SOURCE = 5_000;
      const notebookBudgetChars = notebookBudgetTokens * 4;
      try {
        const allNotebooks = notebookManager.getAllNotebooks();
        if (allNotebooks.length > 0) {
          const sections: string[] = [];
          const selectedNotebooks = allNotebooks.slice(0, MAX_NOTEBOOKS_TOTAL);
          for (const nb of selectedNotebooks) {
            if (notebookUsedChars + NOTEBOOK_HEADER_CHARS > notebookBudgetChars) break;
            if (!nb.sources || nb.sources.length === 0) continue;
            const sourcesToUse = nb.sources.slice(0, MAX_SOURCES_PER_NOTEBOOK);
            const sourceTexts: string[] = [];
            const nbHeader = `## 📓 Notebook : ${nb.title || 'Sans titre'}\n\n`;
            for (const s of sourcesToUse) {
              const title = (s.title || s.origin || 'Source').slice(0, 120);
              const raw = s.summary && s.summary.length > 50 ? s.summary : (s.rawText || s.summary || '');
              const maxCharsForSource = Math.max(200, Math.min(MAX_CHARS_PER_SOURCE, notebookBudgetChars - notebookUsedChars - nbHeader.length - 50));
              const text = raw.length > maxCharsForSource ? raw.slice(0, maxCharsForSource) + '\n…[tronqué]' : raw;
              const block = `### ${title}\n${text}`;
              if (notebookUsedChars + nbHeader.length + block.length + 20 > notebookBudgetChars) break;
              sourceTexts.push(block);
            }
            if (sourceTexts.length > 0) {
              sections.push(nbHeader + sourceTexts.join('\n\n'));
              notebookUsedChars += nbHeader.length + sourceTexts.reduce((sum, t) => sum + t.length + 2, 0);
            }
          }
          if (sections.length > 0) {
            notebookContext = '\n\n[Notebooks — Sources sélectionnées]\n\n' + sections.join('\n\n---\n\n');
          }
        }
      } catch { /* module indisponible */ }

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

      // ── GoAway handler ───────────────────────────────────────────────
      let goAwayHandled = false;
      let clientWsClosing = false;
      const handleGoAway = (goAway: any) => {
        goAwayHandled = true;
        console.info(`[Gemini Live] 🔄 GoAway reçu — session expire. Turns: ${conversationCtx.turns}`);
        flushAssistantBuffer().catch(() => {});
        clientWs.send(JSON.stringify({
          type: 'session_restart',
          reason: 'goaway',
          detail: goAway,
          conversation_id: conversationId,
          turns_completed: conversationCtx.turns,
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
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          temperature,
          topP,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: {
            parts: [{ text: systemText + memoryContext + knowledgeContext + notebookContext }],
          },
          tools,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            lastServerMessage = message;
            if (message.goAway) handleGoAway(message.goAway);

            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) clientWs.send(JSON.stringify({ audio }));

            const textPart = message.serverContent?.modelTurn?.parts?.find(p => p.text);
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
              handleToolCall(message.toolCall, session, clientWs, sessionMode, busyStateRef, voiceName, deps).catch(e =>
                console.error('[handleToolCall] Erreur non catchée:', e),
              );
            }

            const usageMetadata = (message as any).usageMetadata;
            if (usageMetadata) {
              const promptTokens = usageMetadata.promptTokenCount ?? 0;
              const completionTokens = usageMetadata.candidatesTokenCount ?? usageMetadata.responseTokenCount ?? 0;
              const totalTokens = usageMetadata.totalTokenCount ?? 0;
              monitorConversationContext(promptTokens, completionTokens, totalTokens);
              const cumulative = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
              clientWs.send(JSON.stringify({
                token_usage: {
                  promptTokens, completionTokens, totalTokens,
                  session: {
                    total_prompt_tokens: conversationCtx.totalPromptTokens,
                    total_completion_tokens: conversationCtx.totalCompletionTokens,
                    session_total: cumulative,
                    context_window: CONTEXT_WINDOW_TOKENS,
                    context_percent: Math.round((cumulative / CONTEXT_WINDOW_TOKENS) * 100),
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
                    const messages = await getConversationMessages(conversationId!, 200);
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
      const AUTO_SUMMARIZE_COOLDOWN_MS = 5 * 60 * 1000;
      const MAX_AUTO_SUMMARIZES_PER_SESSION = 3;
      const MIN_MESSAGES_FOR_AUTO_SUMMARIZE = 8;

      autoSummarizeContext = async () => {
        if (!conversationId) return;
        const now = Date.now();
        if (now - conversationCtx.lastAutoSummarizeAt < AUTO_SUMMARIZE_COOLDOWN_MS) return;
        if (conversationCtx.autoSummarizeCount >= MAX_AUTO_SUMMARIZES_PER_SESSION) return;

        const messages = await getConversationMessages(conversationId, 200);
        if (messages.length < MIN_MESSAGES_FOR_AUTO_SUMMARIZE) return;

        clientWs.send(JSON.stringify({ type: 'context_summarize_progress', status: 'running', auto: true }));
        try {
          const tokensBefore = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
          const minKeep = 4;
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
      clientWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.audio) {
            session.sendRealtimeInput({ audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' } });
          }
          if (msg.video) {
            session.sendRealtimeInput({ video: { data: msg.video.data, mimeType: msg.video.mimeType } });
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

          if (msg.text) {
            if (getBusyDescription()) {
              clientWs.send(JSON.stringify({ text: `Je suis actuellement en train de ${getBusyDescription()}. Je m'occupe de ta demande dès que j'ai terminé.` }));
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
                const messages = await getConversationMessages(conversationId, 200);
                if (messages.length < 4) { clientWs.send(JSON.stringify({ type: 'context_summarized', status: 'error', error: 'Conversation trop courte (minimum 4 messages).' })); return; }
                const tokensBefore = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
                const minKeep = 4;
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
                const { resolveSandboxWriteTarget } = await import('../skills/codebaseHelpers');
                const { markFileModified, isSandboxActive: sbActive } = await import('../utils/sandbox');
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
            import('../utils/confirmationBridge').then(({ handleConfirmationResponse }) => {
              handleConfirmationResponse(msg.requestId, msg.approved === true);
            });
          }
        } catch (e) {
          console.error('Error parsing message from client:', e);
        }
      });

      // ── Lifecycle ──────────────────────────────────────────────────
      activeGeminiSessions.add(session);
      supervisor.reset();
      supervisor.setSessionInjector((message: string) => {
        try { session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: message }] }] }); } catch (e) { console.error('[Supervisor] Injection échouée:', e); }
      });

      clientWs.on('close', () => {
        console.log('Client disconnected');
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

// ── handleToolCall ─────────────────────────────────────────────────────────────
async function handleToolCall(
  toolCall: any,
  session: any,
  clientWs: WebSocket,
  mode: 'ask' | 'full' = 'full',
  busyStateRef?: { activeDescription: string | null },
  voiceName = 'Aoede',
  deps?: LiveSocketDeps,
): Promise<void> {
  const functionResponses: any[] = [];
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
    reasoningVoiceEnabled: (currentProfile as any).reasoningVoiceEnabled !== false,
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
  };

  try { clientWs.send(JSON.stringify({ busy: true })); } catch {}
  if (busyStateRef) {
    const firstCallName = toolCall.functionCalls?.[0]?.name ?? "traitement d'outils";
    busyStateRef.activeDescription = `l'exécution de l'outil "${firstCallName}"`;
  }

  for (const call of toolCall.functionCalls) {
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
        if (blockedPath && supervisor.isFileBlocked(blockedPath)) {
          functionResponses.push({ id: call.id, name: call.name, response: { error: `[SUPERVISOR] Écriture bloquée sur "${blockedPath}". Ce fichier est en boucle de correction.` } });
          clientWs.send(JSON.stringify({ tool_used: call.name, info: `[BLOQUÉ - Boucle Supervisor: ${blockedPath}]` }));
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

      const response = await skillManager.handleToolCall(call.name, call.args, context);
      const success = !(response && (response as any).error && !(response as any).status);
      try { skillManager.recordToolUsage(call.name, success); } catch {}

      functionResponses.push({ id: call.id, name: call.name, response });
      clientWs.send(JSON.stringify({ tool_used: call.name, info: JSON.stringify(call.args) }));

      // Auto-verify
      const WRITE_TOOLS_VERIFY = ['write_project_file', 'modify_project_file', 'patch_project_file', 'rename_project_file'];
      const VERIFY_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
      const verifyPath = call.name === 'rename_project_file' ? call.args?.newPath : call.args?.path;
      const verifyExt = verifyPath ? path.extname(verifyPath).toLowerCase() : '';
      if (WRITE_TOOLS_VERIFY.includes(call.name) && verifyPath && VERIFY_EXTENSIONS.has(verifyExt)) {
        try {
          const verifyResult = await skillManager.handleToolCall('verify_file', { path: verifyPath }, context);
          functionResponses.push({ id: `${call.id}_verify`, name: 'verify_file', response: verifyResult });
          clientWs.send(JSON.stringify({ tool_used: 'verify_file', info: JSON.stringify({ path: verifyPath }) }));
          const evaluation = supervisor.evaluateVerifyResult(verifyPath, verifyResult);
          if (evaluation.needsCorrection && evaluation.directive) {
            setTimeout(() => {
              try {
                session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: evaluation.directive! }] }] });
                clientWs.send(JSON.stringify({ supervisor_action: 'correction_injected', file: verifyPath, attempt: supervisor.getStats().totalCorrections }));
              } catch (e) { console.error('[Supervisor] Injection échouée:', e); }
            }, 100);
          }
        } catch (verifyErr: any) {
          functionResponses.push({ id: `${call.id}_verify`, name: 'verify_file', response: { error: `Auto-verify échoué: ${verifyErr.message}` } });
        }
      }
    } catch (e: any) {
      console.error(`Error executing tool ${call.name}:`, e);
      functionResponses.push({ id: call.id, name: call.name, response: { error: e.message } });
    }
  }

  try { clientWs.send(JSON.stringify({ busy: false })); } catch {}
  if (busyStateRef) busyStateRef.activeDescription = null;

  if (functionResponses.length > 0) {
    session.sendToolResponse({ functionResponses });
  }
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { buildAuditSteps, isSystemAuditRequest, type AuditStep, type AuditReport } from '../utils/audit';
import type { ScheduledTaskViewModel } from '../components/panels/ScheduledTasksPanel';
import type { WorkflowViewModel } from '../components/panels/WorkflowsPanel';

import { useAudio } from './useAudio';
import { useWebSocket } from './useWebSocket';
import { useToken, type TokenUsage, type TokenUsageSession, type PromptContextState, type ContextAlertLevel } from './useToken';
import { useTranscript, type TranscriptRole, type TranscriptEntry } from './useTranscript';
import { useActivity, type ActivityStep, type ModifiedFile, type ReasoningState, type ReasoningStep } from './useActivity';
import { useProfile } from '../context/UserProfileContext';

// Re-export types to keep existing component imports functional
export type ConnectionStatus = 'idle' | 'connecting' | 'connected';
export type LogType = 'system' | 'action' | 'error' | 'info';

export interface LogEntry {
  id: string;
  type: LogType;
  msg: string;
  timestamp: Date;
}

export type { TranscriptRole, TranscriptEntry, ActivityStep, ModifiedFile, TokenUsage, TokenUsageSession, ReasoningState, ReasoningStep, PromptContextState, ContextAlertLevel };

export function useLiveAPI() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [auditSteps, setAuditSteps] = useState<AuditStep[]>(buildAuditSteps());
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTaskViewModel[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowViewModel[]>([]);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);

  // ── Configuration résumé automatique ───────────────────────────────────────
  const [autoSummarizeEnabled, setAutoSummarizeEnabled] = useState(true);
  const [autoSummarizeThreshold, setAutoSummarizeThreshold] = useState(50);
  const [autoSummarizeKeepTurns, setAutoSummarizeKeepTurns] = useState(8);

  // ── Logger ─────────────────────────────────────────────────────────────────
  const addLog = useCallback((msg: string, type: LogType = 'system') => {
    setLogs(prev => {
      const entry: LogEntry = {
        id: Date.now().toString() + Math.random(),
        type,
        msg,
        timestamp: new Date(),
      };
      const next = [...prev, entry];
      return next.length > 100 ? next.slice(next.length - 100) : next;
    });
  }, []);

  // ── Sub-hooks ──────────────────────────────────────────────────────────────
  const {
    transcript,
    addTranscript,
    clearTranscript,
  } = useTranscript();

  const {
    tokenUsage,
    promptContext,
    addTokenUsage,
    updatePromptContext,
    clearTokenUsage,
  } = useToken();

  const {
      activity,
      isBusy,
      reasoning,
      setIsBusy,
      setReasoning,
      startActivity,
      completeActivity,
      clearActivity,
      resetActivityState,
    } = useActivity();

  // Ref to track isBusy without creating stale closures in audio callbacks
  const isBusyRef = useRef(false);
  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  // Define onAudioData to send recorded raw chunks via WS
  // Block microphone transmission while the assistant is processing (isBusy),
  // otherwise Gemini Live treats incoming audio as user speech and won't speak.
  const handleAudioData = useCallback((base64Data: string) => {
    if (isBusyRef.current) return;
    sendAudioData(base64Data);
  }, []);

    const { profile } = useProfile();

    const {
      muted,
      toggleMute,
      wake,
      playAudioChunk,
      handleInterrupt,
      initAudio,
      cleanupAudio,
      getInputAmplitude,
      getOutputAmplitude,
    } = useAudio({ 
      onAudioData: handleAudioData,
      autoMuteEnabled: profile.autoMuteEnabled,
      autoMuteTimeout: profile.autoMuteTimeout,
    });

  // Define onMessage handler for WS events
  const handleWebSocketMessage = useCallback((msg: any) => {
    if (msg.audio) {
      playAudioChunk(msg.audio);
    }
    if (msg.interrupted) {
      handleInterrupt();
      addLog('Interrupted', 'system');
    }
    if (msg.type === 'ide-action' && msg.action) {
      const a = msg.action;
      window.dispatchEvent(new CustomEvent('jarvis-ide-action', { detail: a }));
      switch (a.type) {
        case 'browser-scroll':
          window.dispatchEvent(new CustomEvent('jarvis-browser-scroll', { detail: a }));
          break;
        case 'browser-back':
        case 'browser-forward':
        case 'browser-reload':
          window.dispatchEvent(new CustomEvent('jarvis-browser-control', { detail: a }));
          break;
        case 'browser-read-request':
          if (a.requestId) {
            window.dispatchEvent(new CustomEvent('jarvis-browser-read-request', {
              detail: { requestId: a.requestId, selector: a.selector ?? null },
            }));
          }
          break;
        case 'browser-click':
          window.dispatchEvent(new CustomEvent('jarvis-browser-click', { detail: a }));
          break;
        case 'browser-type':
          window.dispatchEvent(new CustomEvent('jarvis-browser-type', { detail: a }));
          break;
        case 'browser-snapshot':
          window.dispatchEvent(new CustomEvent('jarvis-browser-snapshot', { detail: a }));
          break;
        case 'browser-inspect':
          window.dispatchEvent(new CustomEvent('jarvis-browser-inspect', { detail: a }));
          break;
        case 'open-rich-document':
          window.dispatchEvent(new CustomEvent('jarvis-open-rich-document', { detail: a }));
          break;
      }
    }
    if (msg.type === 'browser-read-request' && msg.requestId) {
      window.dispatchEvent(new CustomEvent('jarvis-browser-read-request', {
        detail: { requestId: msg.requestId, selector: msg.selector ?? null },
      }));
    }
    // ── Confirmation interactive (fichiers critiques) ──────────────────
    if (msg.type === 'confirm-critical-edit' && msg.requestId) {
      window.dispatchEvent(new CustomEvent('jarvis-confirm-critical-edit', { detail: msg }));
    }
    if (msg.tool_start) {
      // Auto-open IDE when a codebase tool is used
      const IDE_TOOLS = ['list_project_files', 'read_project_file', 'write_project_file',
        'modify_project_file', 'search_in_files', 'open_project_file', 'open_ide',
        'create_project_directory', 'rename_project_file', 'delete_project_file', 'delete_project_folder',
        'analyze_project_file', 'get_workspace_info', 'generate_codebase_markdown'];
      if (IDE_TOOLS.includes(msg.tool_start)) {
        window.dispatchEvent(new CustomEvent('jarvis-ide-action', { detail: { type: 'open-ide' } }));
      }
      startActivity(msg.tool_start, msg.args);
      // Dispatch for AgentPanel real-time tool tracking
      window.dispatchEvent(new CustomEvent('jarvis-tool-start', { detail: { tool: msg.tool_start, args: msg.args } }));
    }
    if (msg.tool_used) {
      addLog(`${msg.tool_used} — ${msg.info}`, 'action');
      completeActivity(msg.tool_used);
      // Dispatch for AgentPanel real-time tool tracking
      window.dispatchEvent(new CustomEvent('jarvis-tool-done', { detail: { tool: msg.tool_used, info: msg.info } }));
    }
    if (msg.error) {
      addLog(msg.error, 'error');
    }
    if (msg.busy !== undefined) {
      setIsBusy(!!msg.busy);
    }
    if (msg.reasoning) {
      setReasoning(msg.reasoning);
      if (msg.reasoning.active) {
        addLog(`🧠 Raisonnement activé: ${msg.reasoning.strategyLabel || msg.reasoning.strategy}`, 'info');
      }
    }
    if (msg.type === 'agent_event') {
      const emoji = msg.event === 'task_started' ? '🤖'
        : msg.event === 'task_completed' ? '✅'
        : msg.event === 'task_failed' ? '❌'
        : '⏳';
      const duration = msg.durationMs ? ` (${(msg.durationMs / 1000).toFixed(1)}s)` : '';
      addLog(`${emoji} Agent ${msg.agentName}: ${msg.detail || msg.title}${duration}`,
        msg.event === 'task_failed' ? 'error' : 'action');
      // Dispatch pour composants qui écoutent les événements agents
      window.dispatchEvent(new CustomEvent('jarvis-agent-event', { detail: msg }));
    }
    if (msg.type === 'build-status') {
      window.dispatchEvent(new CustomEvent('jarvis-build-status', { detail: msg }));
    }
    if (msg.type === 'mission_event') {
      const emoji = msg.event === 'mission_started' ? '🎯'
        : msg.event === 'mission_completed' ? '🏆'
        : msg.event === 'action_completed' ? '⚡'
        : msg.event === 'goal_started' ? '📋'
        : msg.event === 'goal_escalated' ? '⚠️'
        : '🔄';
      addLog(`${emoji} Mission: ${msg.title || msg.goalTitle || msg.skill || msg.event}`,
        msg.event.includes('fail') || msg.event.includes('escalat') ? 'error' : 'action');
      // Dispatch pour composants qui écoutent les événements missions
      window.dispatchEvent(new CustomEvent('jarvis-mission-event', { detail: msg }));
    }
    if (msg.text) {
      addTranscript('assistant', msg.text);
    }
    if (msg.user_text) {
      addTranscript('user', msg.user_text);
    }
    if (msg.token_usage) {
      addTokenUsage(msg.token_usage);
    }
    if (msg.context_size) {
      updatePromptContext(msg.context_size);
    }
    if (msg.context_alert) {
      updatePromptContext(msg.context_alert);
    }
    // ── Redémarrage automatique après dépassement de tokens (context_overflow) ──
    if (msg.type === 'session_restart' && msg.reason === 'context_overflow') {
      const summary = msg.summary || '';
      const messagesSummarized = msg.messagesSummarized || 0;
      const method = msg.summaryMethod || 'unknown';

      addLog(`🔄 Contexte dépassé — redémarrage avec résumé (${messagesSummarized} messages, méthode: ${method})`, 'system');

      // Remplacer le transcript par le résumé + indication de redémarrage
      if (summary) {
        window.dispatchEvent(new CustomEvent('jarvis-summarize-context', {
          detail: {
            summary: `[Redémarrage automatique — ${messagesSummarized} messages de la conversation précédente résumés]\n\n${summary}`,
            summarizedTurns: messagesSummarized,
            retained: [], // On ne garde rien de l'ancien transcript, tout est dans le résumé
          },
        }));
      }

      // Reset les compteurs de tokens (la nouvelle session repart à zéro)
      clearTokenUsage();
    }
  }, [
    playAudioChunk,
    handleInterrupt,
    startActivity,
    completeActivity,
    addLog,
    setIsBusy,
    setReasoning,
    addTranscript,
    addTokenUsage,
    updatePromptContext,
    clearTokenUsage,
  ]);

  const {
    status,
    connected,
    connecting,
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,
    sendAudioData,
    sendVideoFrame,
    sendTextMessage: sendWSMessage,
    sendRawMessage,
  } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onLog: addLog,
  });

  const connect = useCallback((activeSkills: string[] = [], mode: 'full' | 'ask' = 'full') => {
    connectWebSocket(activeSkills, mode, initAudio, () => {
      cleanupAudio();
      clearTokenUsage();
      resetActivityState();
    });
  }, [connectWebSocket, initAudio, cleanupAudio, clearTokenUsage, resetActivityState]);

  const disconnect = useCallback(() => {
    disconnectWebSocket(true);
    cleanupAudio();
    clearTokenUsage();
    resetActivityState();
  }, [disconnectWebSocket, cleanupAudio, clearTokenUsage, resetActivityState]);

  const sendTextMessage = useCallback((text: string, displayText = text) => {
    sendWSMessage(text);
    addTranscript('user', displayText);
  }, [sendWSMessage, addTranscript]);

  // ── Résumé automatique du contexte ─────────────────────────────────────────
  const summarizeContext = useCallback(async (keepTurns: number = 8) => {
    if (transcript.length <= keepTurns) {
      return { summary: '', retainedTurns: transcript.length, summarizedTurns: 0, method: 'local' as const, tokensSaved: 0 };
    }

    const payload = {
      transcript: transcript.map(e => ({ role: e.role, text: e.text })),
      keepTurns,
    };

    try {
      const res = await fetch('/api/tokens/summarize-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.status !== 'success') throw new Error(data.error || 'Summarize failed');

      const { summary, retainedTurns, summarizedTurns, method, tokensSaved } = data;

      // Dispatch pour useTranscript: remplacer le transcript par résumé + tours conservés
      window.dispatchEvent(new CustomEvent('jarvis-summarize-context', {
        detail: {
          summary,
          summarizedTurns,
          retained: transcript.slice(-retainedTurns),
        },
      }));

      // Mettre à jour le contexte prompt pour refléter la réduction
      updatePromptContext({
        currentSize: Math.round(promptContext.currentSize * 0.3),
        percent: Math.round(promptContext.percent * 0.3),
      });

      addLog(`Contexte résumé : ${summarizedTurns} messages condensés (${tokensSaved} tokens économisés)`, 'action');

      return { summary, retainedTurns, summarizedTurns, method, tokensSaved };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SummarizeContext] Failed:', msg);
      addLog(`Échec du résumé du contexte : ${msg}`, 'error');
      return { summary: '', retainedTurns: transcript.length, summarizedTurns: 0, method: 'local' as const, tokensSaved: 0 };
    }
  }, [transcript, promptContext, addLog, updatePromptContext]);

  // ── Déclenchement automatique du résumé ─────────────────────────────────────
  useEffect(() => {
    if (!autoSummarizeEnabled) return;
    if (promptContext.percent < autoSummarizeThreshold) return;

    const triggerSummarize = async () => {
      addLog(`[AutoSummarize] Déclenchement automatique (${transcript.length} tours, seuil: ${autoSummarizeThreshold}, garder: ${autoSummarizeKeepTurns})`, 'info');
      const result = await summarizeContext(autoSummarizeKeepTurns);
      addLog(`[AutoSummarize] Résultat: ${result.summarizedTurns} tours résumés, ${result.tokensSaved} tokens économisés, méthode: ${result.method}`, 'action');
    };

    // Debounce de 500ms pour éviter les déclenchements multiples
    const timer = setTimeout(triggerSummarize, 500);
    return () => clearTimeout(timer);
  }, [promptContext.percent, autoSummarizeEnabled, autoSummarizeThreshold, autoSummarizeKeepTurns, isBusy, summarizeContext, addLog]);
  const refreshScheduledTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/scheduled-tasks');
      const data = await res.json();
      if (Array.isArray(data?.tasks)) {
        setScheduledTasks(data.tasks);
      }
    } catch (error) {
      console.error('Failed to refresh scheduled tasks', error);
    }
  }, []);

  const refreshWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows');
      const data = await res.json();
      if (Array.isArray(data?.workflows)) {
        setWorkflows(data.workflows);
      }
    } catch (error) {
      console.error('Failed to refresh workflows', error);
    }
  }, []);

  const startAuditFlow = useCallback(async (text: string) => {
    if (!isSystemAuditRequest(text)) return;

    // Reset state
    const steps = buildAuditSteps();
    setAuditSteps(steps);
    setAuditReport(null);

    const update = (id: string, patch: Partial<AuditStep>) =>
      setAuditSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

    const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

    try {
      update('os', { status: 'running', detail: 'Lecture de la plateforme…' });
      await delay(400);

      const res = await fetch('/api/audit');
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Audit] HTTP error:', res.status, errorText);
        throw new Error(`Audit API error: ${res.status} - ${errorText}`);
      }

      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.error || 'Audit API error');
      const report: AuditReport = data.report;

      update('os', {
        status: 'done',
        detail: `${report.platform} ${report.arch} — kernel ${report.release}`,
        value: report.platform,
        timestamp: Date.now(),
      });

      update('resources', { status: 'running', detail: 'Lecture CPU et mémoire…' });
      await delay(400);

      const usedGB  = ((report.totalMemoryMB - report.freeMemoryMB) / 1024).toFixed(1);
      const totalGB = (report.totalMemoryMB / 1024).toFixed(1);

      update('resources', {
        status: 'done',
        detail: `${report.cpus} cœurs · RAM ${usedGB}/${totalGB} Go · uptime ${report.uptimeHours}h`,
        value: `${report.cpus} CPU`,
        timestamp: Date.now(),
      });

      update('services', { status: 'running', detail: 'Vérification des clés API…' });
      await delay(400);

      const svcOk  = [report.geminiOk, report.supabaseOk, report.openrouterOk].filter(Boolean).length;
      const svcBad = 3 - svcOk;
      update('services', {
        status: svcBad > 0 ? 'error' : 'done',
        detail: `Gemini ${report.geminiOk ? '✓' : '✗'} · Supabase ${report.supabaseOk ? '✓' : '✗'} · OpenRouter ${report.openrouterOk ? '✓' : '✗'}`,
        value: `${svcOk}/3`,
        timestamp: Date.now(),
      });

      update('skills', { status: 'running', detail: 'Inventaire des modules…' });
      await delay(400);

      update('skills', {
        status: 'done',
        detail: report.activeSkills.join(', '),
        value: `${report.activeSkills.length} actifs`,
        timestamp: Date.now(),
      });

      update('summary', { status: 'running', detail: 'Calcul du score de santé…' });
      await delay(500);

      const score = Math.round(
        (svcOk / 3) * 50 +
        Math.max(0, 50 - ((report.totalMemoryMB - report.freeMemoryMB) / report.totalMemoryMB) * 100 * 0.3)
      );
      update('summary', {
        status: 'done',
        detail: `Score de santé : ${score}/100${svcBad > 0 ? ` · ${svcBad} service(s) manquant(s)` : ' · Tous systèmes opérationnels'}`,
        value: `${score}/100`,
        timestamp: Date.now(),
      });

      setAuditReport(report);

    } catch (err: any) {
      console.error('[Audit] Failed:', err);
      setAuditSteps(prev =>
        prev.map(s => s.status === 'pending' || s.status === 'running'
          ? { ...s, status: 'error', detail: err.message || 'Erreur inattendue' }
          : s
        )
      );
    }
  }, []);

  return {
      status, connected, connecting,
      connect, disconnect,
      muted, toggleMute,
      wake,
      logs, transcript, clearTranscript,
      auditSteps,
      auditReport,
      scheduledTasks,
      refreshScheduledTasks,
      workflows,
      refreshWorkflows,
      startAuditFlow,
      getInputAmplitude, getOutputAmplitude,
      sendVideoFrame, sendTextMessage, sendRawMessage,
      activity, clearActivity,
      isBusy,
      reasoning,
      tokenUsage,
      promptContext,
      summarizeContext,
      // ── Contrôle résumé automatique ─────────────────────────────────────
      autoSummarizeEnabled,
      autoSummarizeThreshold,
      autoSummarizeKeepTurns,
      enableAutoSummarize: () => setAutoSummarizeEnabled(true),
      disableAutoSummarize: () => setAutoSummarizeEnabled(false),
      setAutoSummarizeThreshold,
      setAutoSummarizeKeepTurns,
    };
}
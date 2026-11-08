/**
 * Global store for agent/tool activity — persists even when AgentPanel is unmounted.
 * This ensures no events are lost when the panel is closed.
 */

export interface ToolActivityEntry {
  id: string;
  tool: string;
  label: string;
  agentId: string;
  status: 'running' | 'done';
  timestamp: number;
  endTimestamp?: number;
  args?: any;
  result?: string;
}

export interface AgentTaskEntry {
  id: string;
  role: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'incomplete' | 'failed' | 'cancelled';
  /** Le serveur a accepté la demande ; l'exécuteur termine son arrêt coopératif. */
  cancellationRequested?: boolean;
  agentName: string;
  detail?: string;
  summary?: string;
  timestamp: number;
  durationMs?: number;
  progress?: { current: number; total: number; label: string };
  steps: string[];
}

type Listener = () => void;

const MAX_TOOL_ACTIVITIES = 80;
const STALE_THRESHOLD_MS = 60000;

let toolActivities: ToolActivityEntry[] = [];
let agentTasks: AgentTaskEntry[] = [];
let listeners: Listener[] = [];
let initialized = false;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Tool-Agent Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mapping dynamique outil → agent basé sur les capabilities des rôles d'agents.
 * Ce mapping est généré à partir des définitions centralisées dans server/agents/roles.ts
 * et est mis à jour automatiquement lors de l'initialisation.
 * 
 * Pour les outils non trouvés dans le mapping dynamique, un fallback statique est utilisé.
 */
let toolToAgentCache: Map<string, string> | null = null;

/**
 * Mapping statique de fallback pour les outils non couverts par le mapping dynamique.
 * Ce mapping est progressivement remplacé par le système dynamique basé sur les capabilities.
 */
const FALLBACK_TOOL_TO_AGENT: Record<string, string> = {
  read_project_file: 'writer', write_project_file: 'writer', modify_project_file: 'writer',
  patch_project_file: 'writer', analyze_project_file: 'researcher', search_in_files: 'researcher',
  read_file_outline: 'planner', open_project_file: 'writer',
  list_project_files: 'researcher', create_project_directory: 'writer',
  rename_project_file: 'writer', delete_project_file: 'writer', delete_project_folder: 'writer', get_workspace_info: 'researcher',
  git_status: 'writer', git_diff: 'writer', git_stage: 'writer', git_unstage: 'writer',
  git_commit: 'writer', git_push: 'writer', git_pull: 'writer', git_branches: 'writer',
  git_switch_branch: 'writer', git_log: 'writer',
  system_execute_command: 'writer', system_open: 'writer', system_notify: 'writer',
  automation_navigate: 'researcher', automation_click: 'researcher', automation_type: 'researcher',
  automation_extract: 'researcher', automation_search: 'researcher', automation_snapshot: 'researcher',
  save_memory: 'planner', search_memory: 'researcher', search_history: 'researcher',
  get_conversation_context: 'researcher',
  reasoning_delegate_task: 'planner', reasoning_think: 'planner',
  reasoning_list_strategies: 'planner',
  mission_create: 'planner', mission_status: 'planner', mission_list: 'planner',
  agent_delegate: 'planner', agent_negotiate: 'planner', agent_orchestrate: 'planner',
};

/**
 * Initialise le mapping dynamique outil → agent.
 * Charge le mapping depuis le serveur si disponible (via window), 
 * sinon utilise le fallback statique.
 */
function initializeToolAgentMapping(): void {
  // Essayer de récupérer le mapping depuis le backend
  if (typeof window !== 'undefined' && window.LeannaToolAgentMapping) {
    toolToAgentCache = new Map(Object.entries(window.LeannaToolAgentMapping));
    console.log(`[agentActivityStore] Mapping outil→agent chargé depuis le backend (${toolToAgentCache.size} outils)`);
    return;
  }
  
  // Fallback : créer un mapping à partir du fallback statique
  toolToAgentCache = new Map(Object.entries(FALLBACK_TOOL_TO_AGENT));
  console.log(`[agentActivityStore] Mapping outil→agent initialisé avec fallback statique (${toolToAgentCache.size} outils)`);
}

function notify() {
  for (const fn of listeners) fn();
}

// ─── Tool Activity ───────────────────────────────────────────────────────────

function getAgentForTool(tool: string): string {
  // Vérifier si le cache est initialisé
  if (!toolToAgentCache) {
    initializeToolAgentMapping();
  }
  
  // Chercher dans le cache dynamique
  if (toolToAgentCache) {
    const agent = toolToAgentCache.get(tool);
    if (agent) {
      return agent;
    }
  }
  
  // Fallback vers le mapping statique, puis rôle neutre « Exécution système ».
  // Ne PAS retomber sur 'writer' : cela attribuerait faussement du travail
  // système au Rédacteur (fausse télémétrie).
  return FALLBACK_TOOL_TO_AGENT[tool] ?? UNATTRIBUTED_ROLE;
}

function formatToolLabel(tool: string): string {
  return tool
    .replace(/_/g, ' ')
    .replace(/^(read|write|modify|patch|list|create|delete|rename|get|search|run|verify|save|analyze|open)/, (m) => m + ':')
    .replace(/project file/, 'fichier')
    .replace(/project files/, 'fichiers');
}

function mapStatus(status: string): AgentTaskEntry['status'] {
  if (status === 'running' || status === 'pending' || status === 'completed' || status === 'incomplete' || status === 'failed' || status === 'cancelled') {
    return status;
  }
  // Unknown/future terminal states must not be misrepresented as queued work.
  return 'incomplete';
}

function handleToolStart(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail?.tool) return;
  const agentId = getAgentForTool(detail.tool);
  const id = `${detail.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  toolActivities = [...toolActivities.slice(-(MAX_TOOL_ACTIVITIES - 1)), {
    id,
    tool: detail.tool,
    label: formatToolLabel(detail.tool),
    agentId,
    status: 'running',
    timestamp: Date.now(),
    args: detail.args,
  }];
  notify();
}

function summarizeToolResult(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  let summary: string;
  if (typeof value === 'string') {
    summary = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    summary = String(value);
  } else {
    try {
      summary = JSON.stringify(value);
    } catch {
      summary = '[Résultat non affichable]';
    }
  }
  // Les payloads complets restent dans le flux/outillage ; le chat n'affiche
  // qu'un aperçu borné pour préserver la lisibilité et éviter les gros dumps.
  return summary.length > 240 ? `${summary.slice(0, 237)}…` : summary;
}

function handleToolDone(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail?.tool) return;
  const idx = [...toolActivities].reverse().findIndex(a => a.tool === detail.tool && a.status === 'running');
  if (idx === -1) return;
  const realIdx = toolActivities.length - 1 - idx;
  toolActivities = [...toolActivities];
  toolActivities[realIdx] = {
    ...toolActivities[realIdx],
    status: 'done',
    endTimestamp: Date.now(),
    result: summarizeToolResult(detail.info ?? detail.result),
  };
  notify();
}

function handleAgentEvent(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail || detail.type !== 'agent_event') return;

  const existing = agentTasks.find(t => t.id === detail.taskId);
  const incomingStatus = mapStatus(detail.status);
  const isTerminal = (status: AgentTaskEntry['status']) =>
    status === 'completed' || status === 'incomplete' || status === 'failed' || status === 'cancelled';

  if (existing) {
    // Un événement retardé (progress/running) ne doit jamais ressusciter une
    // tâche terminale ni effacer une demande d'arrêt déjà acceptée.
    if (isTerminal(existing.status) && !isTerminal(incomingStatus)) return;
    if (existing.cancellationRequested && !isTerminal(incomingStatus)) return;

    agentTasks = agentTasks.map(t => t.id === detail.taskId ? {
      ...t,
      status: incomingStatus,
      cancellationRequested: isTerminal(incomingStatus) ? false : t.cancellationRequested,
      detail: detail.detail || t.detail,
      summary: detail.summary || t.summary,
      durationMs: detail.durationMs || t.durationMs,
      progress: detail.progress || t.progress,
      steps: detail.detail && !t.steps.includes(detail.detail)
        ? [...t.steps, detail.detail]
        : t.steps,
    } : t);
  } else {
    agentTasks = [...agentTasks, {
      id: detail.taskId,
      role: detail.role,
      title: detail.title,
      status: mapStatus(detail.status),
      agentName: detail.agentName,
      detail: detail.detail,
      summary: detail.summary,
      timestamp: detail.timestamp ? new Date(detail.timestamp).getTime() : Date.now(),
      durationMs: detail.durationMs,
      progress: detail.progress,
      steps: detail.detail ? [detail.detail] : [],
    }];
  }
  notify();
}

// ─── Cleanup (called periodically) ──────────────────────────────────────────

function cleanup() {
  const now = Date.now();
  const beforeLen = toolActivities.length;
  toolActivities = toolActivities.filter(a =>
    a.status === 'running' || (now - a.timestamp) < STALE_THRESHOLD_MS
  );
  if (toolActivities.length !== beforeLen) notify();
}

// ─── Role → Agent name mapping (mirrors AgentPanel.tsx / AgentsSection.tsx) ──

/**
 * Rôle neutre pour les outils exécutables non rattachés à un agent spécialisé
 * (primitives système : browser, telegram, weather, system_execute, etc.).
 *
 * IMPORTANT : ne JAMAIS retomber sur 'writer' pour ces outils. Attribuer du
 * travail système au « Rédacteur » crée une fausse télémétrie agentique
 * (observabilité, audit, historique, attribution des coûts). Ce rôle doit
 * rester synchronisé avec le fallback backend `UNATTRIBUTED_ROLE`
 * dans server/agents/toolAgentMapper.ts.
 */
export const UNATTRIBUTED_ROLE = 'system';

/**
 * Rôle d'affichage pour une attribution par catégorie (ensemble d'agents).
 * Doit rester synchronisé avec `MULTI_ROLE` côté serveur
 * (server/agents/toolAgentMapper.ts). Un outil marqué `multi` est utilisable
 * par plusieurs agents : on n'en désigne aucun comme propriétaire unique.
 */
export const MULTI_ROLE = 'multi';

const ROLE_TO_AGENT_NAME: Record<string, string> = {
  coder:      'Développeur',
  refactor:   'Refactorisation',
  debugger:   'Débogueur',
  reviewer:   'Revue de Code',
  tester:     'QA & Tests',
  security:   'Sécurité & Audit',
  architect:  'Architecte',
  vision:     'Analyse Visuelle',
  writer:     'Rédacteur',
  formatter:  'Mise en forme',
  researcher: 'Recherche',
  proofreader:'Correcteur',
  translator: 'Traducteur',
  summarizer: 'Synthèse',
  planner:    'Planificateur',
  [UNATTRIBUTED_ROLE]: 'Exécution système',
  [MULTI_ROLE]: 'Plusieurs agents',
};

// ─── Server sync ─────────────────────────────────────────────────────────────

/**
 * Récupère les tâches actives (running/pending) depuis le serveur et les
 * injecte dans le store. Appelé à chaque reconnexion WebSocket pour restaurer
 * le suivi des agents qui tournaient pendant la déconnexion.
 * 
 * Idempotent : les tâches déjà présentes dans le store sont mises à jour,
 * les nouvelles sont ajoutées, les terminées ne sont pas modifiées.
 */
export async function syncActiveTasksFromServer(): Promise<void> {
  try {
    const res = await fetch('/api/agents/tasks');
    if (!res.ok) return;

    const data: { count: number; tasks: Array<{
      id: string;
      role: string;
      title: string;
      status: string;
      priority: string;
      createdAt: string;
      completedAt?: string | null;
      hasResult: boolean;
    }> } = await res.json();

    if (!data?.tasks?.length) return;

    // Ne garder que les tâches actives (running ou pending)
    const activeTasks = data.tasks.filter(t => t.status === 'running' || t.status === 'pending');
    if (activeTasks.length === 0) return;

    let changed = false;

    for (const serverTask of activeTasks) {
      const existing = agentTasks.find(t => t.id === serverTask.id);
      const agentName = ROLE_TO_AGENT_NAME[serverTask.role] ?? serverTask.role;
      const status = mapStatus(serverTask.status);

      if (existing) {
        // Mettre à jour le statut si différent
        if (existing.status !== status) {
          agentTasks = agentTasks.map(t => t.id === serverTask.id ? { ...t, status } : t);
          changed = true;
        }
      } else {
        // Nouvelle tâche inconnue du store — l'ajouter
        agentTasks = [...agentTasks, {
          id: serverTask.id,
          role: serverTask.role,
          title: serverTask.title,
          status,
          agentName,
          detail: `Repris après reconnexion`,
          timestamp: new Date(serverTask.createdAt).getTime(),
          steps: [],
        }];
        changed = true;
      }
    }

    if (changed) notify();
  } catch {
    // Silencieux — la sync est best-effort, elle ne doit jamais casser l'UI
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initActivityStore() {
  if (initialized) {
    console.log('[agentActivityStore] ⚠️ Déjà initialisé, ignoré');
    return;
  }
  initialized = true;
  
  console.log('[agentActivityStore] 🚀 Initialisation...');
  
  // Initialiser le mapping outil → agent
  initializeToolAgentMapping();
  
  window.addEventListener('Leanna-tool-start', handleToolStart);
  window.addEventListener('Leanna-tool-done', handleToolDone);
  window.addEventListener('Leanna-agent-event', handleAgentEvent);
  // Cleanup every 3s
  cleanupInterval = setInterval(cleanup, 3000);
  
  console.log('[agentActivityStore] ✅ Initialisé avec succès');
}

/**
 * Nettoie toutes les ressources du store (event listeners, interval)
 * Doit être appelé lors de la fermeture de l'application ou du reload
 * pour éviter les fuites mémoire.
 */
export function destroyActivityStore() {
  if (!initialized) return;
  
  console.log('[agentActivityStore] 🧹 Nettoyage...');
  
  // Nettoyer les event listeners
  window.removeEventListener('Leanna-tool-start', handleToolStart);
  window.removeEventListener('Leanna-tool-done', handleToolDone);
  window.removeEventListener('Leanna-agent-event', handleAgentEvent);
  
  // Nettoyer l'interval de cleanup
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  
  // Réinitialiser l'état
  toolActivities = [];
  agentTasks = [];
  listeners = [];
  initialized = false;
  
  console.log('[agentActivityStore] ✅ Nettoyé avec succès');
}

/**
 * Nom lisible d'un agent à partir de son rôle (ex: 'writer' → 'Rédacteur').
 * Retourne le rôle brut si inconnu. Exporté pour l'affichage du suivi d'activité.
 */
export function getAgentDisplayName(role: string): string {
  return ROLE_TO_AGENT_NAME[role] ?? role;
}

export function getToolActivities(): ToolActivityEntry[] {
  return toolActivities;
}

export function getAgentTasks(): AgentTaskEntry[] {
  return agentTasks;
}

export function clearCompletedTools() {
  toolActivities = toolActivities.filter(a => a.status === 'running');
  notify();
}

export function clearCompletedTasks() {
  agentTasks = agentTasks.filter(t => t.status === 'running' || t.status === 'pending');
  notify();
}

/**
 * Retire une liste de tâches de l'affichage local uniquement (pas d'appel serveur).
 * À utiliser quand la purge serveur est gérée séparément.
 */
function removeAgentTasksLocal(ids: string[]) {
  if (ids.length === 0) return;
  const toRemove = new Set(ids);
  const before = agentTasks.length;
  agentTasks = agentTasks.filter(t => !toRemove.has(t.id));
  if (agentTasks.length !== before) notify();
}

/**
 * Supprime définitivement une liste de tâches par leur id :
 *  1. retire immédiatement les tâches de l'affichage local (optimiste) ;
 *  2. demande au serveur de les purger de la mémoire ET de la persistance.
 *
 * La suppression côté serveur annule au besoin les tâches encore actives.
 * Best-effort : si l'appel réseau échoue, l'UI reste nettoyée (les tâches
 * actives réapparaîtront à la prochaine resynchronisation si elles tournent
 * toujours — c'est le comportement attendu).
 *
 * @returns le nombre de tâches supprimées côté serveur (0 si réseau en échec).
 */
export async function removeAgentTasks(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  removeAgentTasksLocal(ids);

  try {
    const res = await fetch('/api/agents/tasks/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: ids }),
    });
    if (!res.ok) return 0;
    const data = await res.json().catch(() => null);
    return typeof data?.deleted === 'number' ? data.deleted : ids.length;
  } catch {
    return 0;
  }
}

/**
 * Marque une tâche comme en cours d'annulation dans le store (optimiste),
 * utile pour un retour visuel immédiat avant la confirmation serveur.
 */
function markTaskCancelling(taskId: string) {
  agentTasks = agentTasks.map(t =>
    t.id === taskId && (t.status === 'running' || t.status === 'pending')
      ? {
          ...t,
          cancellationRequested: true,
          detail: 'Demande d’arrêt envoyée — interruption en cours…',
          steps: t.steps.includes('Demande d’arrêt envoyée…') ? t.steps : [...t.steps, 'Demande d’arrêt envoyée…'],
        }
      : t,
  );
  notify();
}

function clearTaskCancelling(taskId: string, message: string) {
  agentTasks = agentTasks.map(t =>
    t.id === taskId
      ? { ...t, cancellationRequested: false, detail: message }
      : t,
  );
  notify();
}

/**
 * Demande au serveur d'annuler une tâche agent (pending ou running).
 * Affiche immédiatement l'état « arrêt demandé », mais ne marque la tâche
 * « annulée » qu'à réception de l'événement terminal émis par l'exécuteur.
 *
 * @returns `true` si le serveur accepte la demande d'arrêt, `false` sinon.
 */
export async function cancelAgentTask(taskId: string): Promise<boolean> {
  const task = agentTasks.find(t => t.id === taskId);
  // Rien à annuler si la tâche est déjà terminée.
  if (task && task.status !== 'running' && task.status !== 'pending') return false;

  markTaskCancelling(taskId);

  try {
    const res = await fetch(`/api/agents/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    });
    if (!res.ok) {
      clearTaskCancelling(taskId, 'Impossible d’arrêter cette tâche — elle a peut-être déjà terminé.');
      return false;
    }
    // Le serveur peut avoir émis l'événement « cancelled » avant la réponse HTTP
    // (cas pending). Le helper ne touche donc qu'aux tâches encore actives.
    markTaskCancelling(taskId);
    return true;
  } catch {
    clearTaskCancelling(taskId, 'Échec réseau : demande d’arrêt non confirmée.');
    return false;
  }
}

/**
 * Demande l'arrêt de toutes les tâches actives visibles dans le store.
 * Chaque tâche conserve son propre cycle de confirmation terminale.
 */
export async function cancelAllAgentTasks(): Promise<{ requested: number; failed: number }> {
  const activeIds = agentTasks
    .filter(t => (t.status === 'running' || t.status === 'pending') && !t.cancellationRequested)
    .map(t => t.id);
  if (activeIds.length === 0) return { requested: 0, failed: 0 };

  const results = await Promise.all(activeIds.map(id => cancelAgentTask(id)));
  return {
    requested: results.filter(Boolean).length,
    failed: results.filter(ok => !ok).length,
  };
}

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

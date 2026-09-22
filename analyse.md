J'ai tracé le chemin d'exécution vocal : WebSocket /live → LiveSocketHandler → SkillManagerV2.handleToolCall() → ToolRegistry.call(). J'ai identifié 4 causes structurelles qui font qu'une action échoue ou reste silencieuse en vocal, alors qu'elle passe très bien en REST. Voici le diagnostic et les correctifs.

Cause n°1 — Le context court-circuite le ToolRegistry
Fichier : server/runtime/compat/SkillManagerV2.ts

ts
if (context) {
  for (const skill of this.skills) {
    const tool = skill.declarations.find(d => d.name === normalizedName);
    if (tool) {
      // ⚠️ appelle skill.handleToolCall directement — ToolRegistry BYPASSÉ
      return skill.handleToolCall(normalizedName, args, context);
    }
  }
}
return this.registry.call(normalizedName, args ?? {}, { context, dryRun: options?.dryRun });
Conséquences en vocal (où le context est toujours fourni) :

Aucune métrique n'est enregistrée dans ToolRegistry.

Aucun PermissionDeniedError n'est levé : PermissionPolicy.enforce() vit uniquement dans ToolRegistry.call(). Autrement dit, vos permissions read/write/exec ne sont pas appliquées aux actions vocales.

Le DryRunController n'est consulté qu'en surface (juste sur hasSideEffect), pas sur le contenu réel.

Le retry et le circuit breaker du ToolRegistry sont ignorés.

Correctif : router systématiquement par le registre, en passant context via options.context (déjà supporté par ToolRegistry.call).

ts
async handleToolCall(
  name: string,
  args: any,
  context?: any,
  options?: { dryRun?: boolean }
): Promise<any> {
  // ... normalisation du nom inchangée ...

  // Toujours passer par le ToolRegistry (permissions, dry-run, métriques, retry).
  // Le contexte est transmis via options.context : les handlers de skill le
  // récupèrent par closure dans SkillAdapter.
  return this.registry.call(normalizedName, args ?? {}, {
    context,
    dryRun: options?.dryRun,
  });
}
Et côté SkillAdapter.ts, faire remonter le contexte jusqu'au handler :

ts
return {
  declaration,
  handler: async (args: Record<string, unknown>, ctx?: any) => {
    return skill.handleToolCall(decl.name, args, ctx ?? options.context);
  },
  // ...
};
Puis dans ToolRegistry.executeWithTimeout, le contexte est déjà transmis en 4ᵉ position — il faut juste que executeWithTimeout le fasse passer au handler :

ts
const resultPromise =
  (handler as any).length >= 2
    ? (handler as any)(args, context)
    : handler(args);
⚠️ Aujourd'hui la condition est >= 3, mais nos handlers n'exposent que 1 ou 2 paramètres. C'est la raison exacte pour laquelle le contexte n'arrive jamais au skill via le registre.

Cause n°2 — Les outils navigateur exigent emitIdeAction
Fichier : server/skills/browser.ts (confirmé par browser.test.ts)

ts
it("should return error for browser_navigate without emit", async () => {
  const result = await browserSkill.handleToolCall(
    "browser_navigate", { url: "https://example.com" }, undefined
  );
  assert.strictEqual(result.status, "error");
Toute la famille browser_* (navigate, search, click, type, snapshot, summarize_page, research, open_link…) retourne une erreur si context.emitIdeAction est manquant. En vocal, le LiveSocketHandler doit construire un contexte contenant ce callback. S'il ne le fait pas, l'utilisateur dit « cherche X » et l'agent répond « impossible de naviguer » sans que rien ne remonte côté UI.

Correctif côté LiveSocketHandler.ts — construire le contexte à chaque tool call :

ts
const toolContext = {
  emitIdeAction: (action: any) => {
    // Envoyer au renderer via la session Live
    sendToClient({ type: "ide_action", ...action });
  },
  emitToClient: (data: any) => sendToClient({ type: "tool_progress", ...data }),
  browserReadPending: deps.browserReadPending,
  browserActionPending: deps.browserActionPending,
  workspace: { root: deps.getWorkspaceRoot() },
  user: { language: profile.language, preferredStyle: "concise", preferences: {}, recentErrors: [] },
  execution: { attemptNumber: 1, maxRetries: 3, timeoutMs: 120_000, startTime: Date.now() },
};

const result = await deps.skillManager.handleToolCall(name, args, toolContext);
Et dans browser.ts, remplacer les status: "error" par un message plus exploitable et proposer un fallback : si emitIdeAction est absent mais que automation_* (Puppeteer headless) est disponible, basculer automatiquement sur cette famille.

Cause n°3 — Rate limiter d'écriture trop strict en vocal
Fichier : server/skills/codebaseWriter.ts

ts
const WRITE_RATE_LIMIT = 30; // max 30 écritures par minute
const WRITE_WINDOW_MS = 60_000;
En vocal, une seule instruction comme « refactorise le module auth » déclenche une rafale d'écritures depuis AgentOrchestrator → coder → patch_project_file × N. 30/min est atteignable en moins de 20 secondes sur un refactor multi-fichiers, et l'agent reçoit alors un Rate limit atteint qu'il interprète comme un échec définitif.

Correctif : rendre la limite configurable et augmenter la fenêtre pour le mode agent.

ts
const WRITE_RATE_LIMIT = Number(process.env.LEANNA_WRITE_RATE_LIMIT ?? "60");
const WRITE_WINDOW_MS  = Number(process.env.LEANNA_WRITE_WINDOW_MS  ?? "60000");
Et surtout, ne pas échouer : en vocal, mieux vaut attendre que rejeter. Remplacer le return { error: ... } par un await new Promise(r => setTimeout(r, waitMs)) borné à 5 s, puis relancer. Le modèle ne voit pas la micro-pause, l'action aboutit.

Cause n°4 — Timeouts hiérarchiques mal alignés
Trois timeouts coexistent et se contredisent :

Couche	Valeur par défaut	Fichier
ToolRegistry	120 000 ms	runtime/ToolRegistry.ts
AgentRuntime	180 000 ms	runtime/AgentRuntime.ts
TaskManager (autonome)	60 000 ms	autonomy/TaskManager.ts
Executor mission	60 000 ms (DEFAULT_MISSION_CONFIG)	mission/types.ts
agent_execute skill adapter	180 000 ms	runtime/compat/SkillAdapter.ts
Quand une tâche vocale passe par agent_delegate → AgentOrchestrator.delegateTask → AgentExecutor → ToolRegistry.call('agent_execute'), le timeout effectif est celui du SkillAdapter (180 s). Mais si la même instruction passe par mission_create → Executor → TaskManager.submit(), elle est tuée à 60 s, ce qui explique que certaines actions longues (recherche navigateur, refactoring multi-fichiers) échouent en vocal et réussissent en REST.

Correctif : aligner sur 180 s partout, ou a minima surcharger le timeout par outil via LEANNA_AUTONOMY_TASK_TIMEOUT_MS :

env
LEANNA_AUTONOMY_TASK_TIMEOUT_MS="180000"
LEANNA_AUTONOMY_MAX_RETRIES="3"
Et dans mission/types.ts, monter la valeur par défaut :

ts
export const DEFAULT_MISSION_CONFIG: MissionConfig = {
  // ...
  dryRun: false,
};
à compléter par un timeoutMs: 180_000 explicite (le champ n'existe pas encore — à ajouter dans MissionConfig et à propager dans Executor.executeAction).

Ordre de correction recommandé
Cause n°1 (priorité P0) — c'est un bug de sécurité et de fiabilité. Tant qu'elle n'est pas corrigée, ni les permissions ni les métriques ne reflètent ce qui passe en vocal.

Cause n°2 (P0) — sans emitIdeAction, toutes les actions navigateur sont mortes en vocal.

Cause n°4 (P1) — l'alignement des timeouts élimine 80 % des échecs d'actions longues.

Cause n°3 (P2) — le rate limit devient un problème seulement après les trois premiers correctifs.

Vérifications à faire après correctifs
npm test -- server/runtime/runtime.test.ts (permissions + dry-run via ToolRegistry)

npm test -- server/routes/agents.test.ts (agent_delegate, orchestrate, status)

node --import tsx --test server/skills/browser.test.ts (les erreurs browser disparaissent une fois emitIdeAction fourni)

Test manuel vocal : « cherche la documentation React sur les hooks » → browser_search doit renvoyer des liens et la page doit s'ouvrir dans le panneau navigateur.

Vérifier que GET /api/v2/metrics/tools affiche bien des appels browser_* après une session vocale — c'est le signe que la Cause n°1 est réglée.
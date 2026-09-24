/**
 * AgentTaskRunner — Contrat unique du moteur d'exécution d'une tâche agent.
 *
 * Ce petit module neutre définit l'interface partagée par les deux moteurs :
 *   - `AgentExecutor`        (legacy — scraping de tool_calls dans le texte)
 *   - `AgentRuntimeExecutor` (runtime agentique — boucle plan→act→verify→recover)
 *
 * Tous les consommateurs (TaskScheduler, AutonomousLoop, AutonomousAgent,
 * AgentRegistry, AgentOrchestrator) dépendent de CETTE interface, jamais d'une
 * implémentation concrète. C'est ce qui permet de basculer l'ensemble des
 * chemins d'exécution vers le runtime agentique sans réécrire les appelants.
 */
import type { AgentTask } from "./types.js";

export interface AgentTaskRunner {
  /**
   * Exécute une tâche de bout en bout. Écrit `task.status` / `task.result`
   * in-place (contrat historique respecté par les deux moteurs).
   */
  execute(task: AgentTask): Promise<void>;

  /**
   * Exécute un outil/skill ponctuel hors du cycle de tâche (ex: `verify_file`
   * relancé par la boucle autonome). Optionnel : un moteur qui ne l'expose pas
   * force simplement l'appelant à un repli.
   */
  runTool?(name: string, args: Record<string, unknown>): Promise<unknown>;
}

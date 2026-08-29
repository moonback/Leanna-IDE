/**
 * PromptBuilder — Stub de compatibilité
 * 
 * Le vrai builder est maintenant dans server/runtime/prompts/SystemPromptBuilder.ts
 * Ce fichier existe uniquement pour que AgentExecutor.ts continue à fonctionner.
 */

import type { AgentDefinition, AgentTask } from "./types";

export class PromptBuilder {
  build(agent: AgentDefinition, task: AgentTask, fileContents: string[]): string {
    const parts: string[] = [
      agent.systemPrompt,
      "",
      `# Tâche : ${task.title}`,
      "",
      task.description,
    ];

    if (task.context.instructions) {
      parts.push("", "## Instructions supplémentaires", task.context.instructions);
    }

    if (fileContents.length > 0) {
      parts.push(
        "",
        "## Fichiers de contexte (instantané initial)",
        ...fileContents,
        "",
        "Les fichiers ci-dessus sont un instantané initial du workspace actif. Utilise-les immédiatement. Après une écriture, l'exécuteur fournira un bloc « Fichiers en mémoire » : ce dernier est le seul état autoritaire et remplace tout contenu initial du même chemin."
      );
    }

    if (task.context.previousResults?.length) {
      parts.push("", "## Résultats précédents");
      for (const prev of task.context.previousResults) {
        parts.push(`- ${prev.success ? "✓" : "✗"} ${prev.summary}`);
      }
    }

    parts.push(
      "",
      "## Contrat d'exécution obligatoire",
      "Exécute le travail avant de répondre : une intention telle que « Je vais… », « Je dois… » ou un plan seul n'est jamais un résultat.",
      "Pour toute action sur un fichier, émet d'abord uniquement un JSON valide au format {\"tool_calls\":[{\"name\":\"nom_outil\",\"parameters\":{...}}]}; les pseudo-appels JavaScript et les blocs Markdown ne sont pas exécutés. Après chaque observation, poursuis avec le prochain tool_calls jusqu'à l'écriture et la vérification, puis rends le rapport final.",
      "Termine impérativement par :",
      "## Résultats vérifiés",
      "- Constats ou changements réellement obtenus, avec fichiers concernés.",
      "## Preuves d'exécution",
      "- Fichiers lus : ...",
      "- Fichiers modifiés : ...",
      "- Outils/commandes exécutés : ...",
      "- Vérification : PASS ou FAIL, avec le résultat observé.",
      "Les seuls appels structurés exécutables sont : list_project_files, read_project_file, read_file_outline, search_in_files, analyze_project_file, write_project_file, apply_patch, patch_project_file, verify_*, reasoning_think et knowledge_*. Ne demande jamais bash, shell, find, ls ou /workspace.",
      "Pour enrichir la mémoire projet avec des découvertes durables (stack, conventions, architecture), utilise knowledge_memory_add.",
      "Pour déléguer à un autre agent, écris un bloc textuel ## DÉLÉGATION dans ta réponse. N'émets JAMAIS {\"tool_calls\":[{\"name\":\"agent_delegate\"...}]} ni agent_orchestrate — ces outils ne sont pas disponibles ici.",
      "Sans preuve concrète, déclare explicitement la tâche incomplète et explique le blocage."
    );

    return parts.join("\n");
  }
}

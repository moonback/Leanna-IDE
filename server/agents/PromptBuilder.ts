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
        "## Fichiers de contexte",
        ...fileContents,
        "",
        "Les fichiers ci-dessus proviennent du workspace actif. Utilise-les immédiatement : ne demande ni archive, ni code source supplémentaire avant d'avoir analysé ce contexte."
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
      "Pour toute modification, fournis les fichiers complets dans un format pris en charge puis attends leur écriture et leur vérification.",
      "Termine impérativement par :",
      "## Résultats vérifiés",
      "- Constats ou changements réellement obtenus, avec fichiers concernés.",
      "## Preuves d'exécution",
      "- Fichiers lus : ...",
      "- Fichiers modifiés : ...",
      "- Outils/commandes exécutés : ...",
      "- Vérification : PASS ou FAIL, avec le résultat observé.",
      "Les seuls appels structurés exécutables sont : list_project_files, read_project_file, read_file_outline, search_in_files, analyze_project_file, write_project_file, modify_project_file, patch_project_file et verify_*. Ne demande jamais bash, shell, find, ls ou /workspace.",
      "Sans preuve concrète, déclare explicitement la tâche incomplète et explique le blocage."
    );

    return parts.join("\n");
  }
}

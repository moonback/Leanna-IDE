/**
 * Agent Plugins — Auto-discovery et export
 * 
 * Pour ajouter un nouvel agent :
 * 1. Créer un fichier <nom>.agent.ts dans ce dossier
 * 2. Exporter un AgentPlugin via defineAgent()
 * 3. L'importer ici
 * 
 * Aucune modification du runtime n'est nécessaire.
 */

export { defineAgent } from "./plugin";
export type { AgentConfig } from "./plugin";

export { architectAgent } from "./architect.agent";
export { reviewAgent } from "./review.agent";
export { securityAgent } from "./security.agent";
export { testAgent } from "./test.agent";
export { refactorAgent } from "./refactor.agent";
export { docsAgent } from "./docs.agent";

import type { AgentPlugin } from "../AgentRuntime";
import { architectAgent } from "./architect.agent";
import { reviewAgent } from "./review.agent";
import { securityAgent } from "./security.agent";
import { testAgent } from "./test.agent";
import { refactorAgent } from "./refactor.agent";
import { docsAgent } from "./docs.agent";

/**
 * Tous les agents par défaut.
 * Le runtime les enregistre tous au démarrage.
 */
export const defaultAgents: AgentPlugin[] = [
  architectAgent,
  reviewAgent,
  securityAgent,
  testAgent,
  refactorAgent,
  docsAgent,
];

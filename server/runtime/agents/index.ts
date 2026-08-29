/**
 * Agent Plugins — Auto-discovery et export
 * 
 * Agents spécialisés dans la rédaction de documents.
 * 
 * Pour ajouter un nouvel agent :
 * 1. Créer un fichier <nom>.agent.ts dans ce dossier
 * 2. Exporter un AgentPlugin via defineAgent()
 * 3. L'importer ici
 * 
 * Aucune modification du runtime n'est nécessaire.
 */

export { defineAgent } from "./plugin.js";
export type { AgentConfig } from "./plugin.js";

export { writerAgent } from "./writer.agent";
export { formatterAgent } from "./formatter.agent";
export { researcherAgent } from "./researcher.agent";
export { proofreaderAgent } from "./proofreader.agent";
export { translatorAgent } from "./translator.agent";
export { summarizerAgent } from "./summarizer.agent";
export { plannerAgent } from "./planner.agent";

import type { AgentPlugin } from "../AgentRuntime.js";
import { writerAgent } from "./writer.agent";
import { formatterAgent } from "./formatter.agent";
import { researcherAgent } from "./researcher.agent";
import { proofreaderAgent } from "./proofreader.agent";
import { translatorAgent } from "./translator.agent";
import { summarizerAgent } from "./summarizer.agent";
import { plannerAgent } from "./planner.agent";

/**
 * Tous les agents par défaut — spécialisés rédaction de documents.
 * Le runtime les enregistre tous au démarrage.
 */
export const defaultAgents: AgentPlugin[] = [
  writerAgent,
  formatterAgent,
  researcherAgent,
  proofreaderAgent,
  translatorAgent,
  summarizerAgent,
  plannerAgent,
];

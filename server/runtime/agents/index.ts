/**
 * Agent Plugins — Auto-discovery et export
 * 
 * Plugins spécialisés dans la rédaction de documents pour AgentRuntime.
 *
 * Ce registre est indépendant de server/agents/roles.ts : ses IDs sont
 * utilisés par AgentRuntime.submit() et les workflows runtime, pas par
 * l'outil conversationnel agent_delegate.
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

export { writerAgent } from "./writer.agent.js";
export { formatterAgent } from "./formatter.agent.js";
export { researcherAgent } from "./researcher.agent.js";
export { proofreaderAgent } from "./proofreader.agent.js";
export { translatorAgent } from "./translator.agent.js";
export { summarizerAgent } from "./summarizer.agent.js";
export { plannerAgent } from "./planner.agent.js";

export { engineeringAgents } from "./engineering.agents.js";
export {
  setAgenticRuntimeProvider,
  hasAgenticRuntimeProvider,
} from "./agenticBridge.js";

import type { AgentPlugin } from "../AgentRuntime.js";
import { writerAgent } from "./writer.agent.js";
import { formatterAgent } from "./formatter.agent.js";
import { researcherAgent } from "./researcher.agent.js";
import { proofreaderAgent } from "./proofreader.agent.js";
import { translatorAgent } from "./translator.agent.js";
import { summarizerAgent } from "./summarizer.agent.js";
import { plannerAgent } from "./planner.agent.js";
import { engineeringAgents } from "./engineering.agents.js";

/**
 * Agents de rédaction — exécutés par l'exécuteur LLM par défaut de defineAgent
 * (un seul appel modèle, adapté à la production de documents).
 */
const writingAgents: AgentPlugin[] = [
  writerAgent,
  formatterAgent,
  researcherAgent,
  proofreaderAgent,
  translatorAgent,
  summarizerAgent,
  plannerAgent,
];

/**
 * Tous les agents par défaut = 7 rédaction + 8 ingénierie = 15.
 *
 * Les 8 agents d'ingénierie délèguent leur exécution à la boucle agentique
 * partagée (plan→act→verify) via le pont `runViaAgentic`, branché au bootstrap
 * par `setAgenticRuntimeProvider`. Le runtime les enregistre tous au démarrage,
 * ce qui aligne « agents runtime » sur « agents de délégation » (15 = 15) et
 * fait disparaître le warning `delegationOnlyRoles`.
 */
export const defaultAgents: AgentPlugin[] = [
  ...writingAgents,
  ...engineeringAgents,
];

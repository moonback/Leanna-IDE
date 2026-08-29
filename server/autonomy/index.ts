/**
 * AUTONOMY MODULE — Point d'entrée
 *
 * Exporte les trois composants du moteur d'autonomie :
 * 1. Supervisor — Boucle de contrôle serveur-side
 * 2. SmartSkills — Skills composites avec boucle intégrée
 * 3. Intégration avec le handleToolCall existant
 */

export { Supervisor, supervisor } from "./Supervisor.js";
export type { SupervisorConfig, MissionObjective, SessionInjector } from "./Supervisor.js";

export { createSmartSkills } from "./SmartSkills.js";
export type { SkillHandler } from "./SmartSkills.js";

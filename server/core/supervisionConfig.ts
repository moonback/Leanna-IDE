/**
 * Politique canonique de supervision, partagée par le Mission Executor et les
 * tâches agents (IMP-04 / IMP-05) : même variable, même règle de risque.
 *
 * LEANNA_SUPERVISED (prioritaire, y compris une valeur explicite "false") :
 *   - "true" | "1" | "all"  → toute exécution passe par le LeannaSupervisor ;
 *   - "risky" (défaut)      → seules les exécutions capables de muter le
 *                             workspace sont supervisées ;
 *   - "false" | "0" | "off" → aucune supervision (opt-out explicite).
 * Les alias historiques LEANNA_MISSION_SUPERVISED / LEANNA_AGENT_SUPERVISED
 * ("true"/"1" → all) ne sont lus que si la variable canonique est absente.
 */
export type SupervisionMode = "all" | "risky" | "off";

function parseMode(value: string | undefined): SupervisionMode | undefined {
  const v = (value ?? "").toLowerCase().trim();
  if (v === "true" || v === "1" || v === "all") return "all";
  if (v === "false" || v === "0" || v === "off") return "off";
  if (v === "risky") return "risky";
  return undefined;
}

export function supervisionModeFromEnv(env: NodeJS.ProcessEnv = process.env): SupervisionMode {
  const canonical = parseMode(env.LEANNA_SUPERVISED);
  if (canonical) return canonical;
  const legacy = [env.LEANNA_MISSION_SUPERVISED, env.LEANNA_AGENT_SUPERVISED].map(parseMode);
  return legacy.includes("all") ? "all" : "risky";
}

/** Faits de risque d'une exécution, évalués de la même façon par les deux moteurs. */
export interface ExecutionRisk {
  /** L'exécution peut écrire, exécuter ou supprimer (outils write/exec/dangerous, ou fichiers ciblés). */
  mutates: boolean;
}

/** Règle unique : l'exécution doit-elle passer par le Supervisor ? */
export function requiresSupervision(mode: SupervisionMode, risk: ExecutionRisk): boolean {
  return mode === "all" || (mode === "risky" && risk.mutates);
}

/** Vrai si le Supervisor doit être branché (tout mode sauf "off"). */
export function supervisionEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return supervisionModeFromEnv(env) !== "off";
}

/** Backward-compatible exported name for older Agent bootstrap callers. */
export function agentSupervisionEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return supervisionEnabledFromEnv(env);
}

/** Backward-compatible exported name for older Mission bootstrap callers. */
export function missionSupervisionEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return supervisionEnabledFromEnv(env);
}

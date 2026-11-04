/**
 * Canonical configuration for the shared Agent/Mission supervision mode.
 *
 * LEANNA_SUPERVISED has precedence, including an explicit false value.
 * Legacy flags remain compatible when the canonical variable is absent.
 */
export function supervisionEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const enabled = (value: string | undefined): boolean => {
    const normalized = (value ?? "").toLowerCase().trim();
    return normalized === "true" || normalized === "1";
  };
  if (env.LEANNA_SUPERVISED !== undefined) return enabled(env.LEANNA_SUPERVISED);
  return enabled(env.LEANNA_MISSION_SUPERVISED) || enabled(env.LEANNA_AGENT_SUPERVISED);
}

/** Backward-compatible exported name for older Agent bootstrap callers. */
export function agentSupervisionEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return supervisionEnabledFromEnv(env);
}

/** Backward-compatible exported name for older Mission bootstrap callers. */
export function missionSupervisionEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return supervisionEnabledFromEnv(env);
}

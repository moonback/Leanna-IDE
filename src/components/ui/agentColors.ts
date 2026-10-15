/**
 * agentColors.ts — couleur Nebula de chaque rôle d'agent.
 *
 * Les 19 rôles statiques (STATIC_AGENT_ROLES) sont regroupés en 6 familles,
 * chacune liée à un token CSS de src/styles/nebula.css. La couleur suit
 * l'agent partout (listes, graphe, timeline, particules 3D).
 * Un rôle inconnu (agent personnalisé) retombe sur la famille « knowledge ».
 */

export type AgentFamily = 'design' | 'build' | 'quality' | 'perf' | 'security' | 'knowledge';

const ROLE_FAMILY: Record<string, AgentFamily> = {
  architect: 'design', planner: 'design', ui_ux: 'design',
  coder: 'build', refactor: 'build', debugger: 'build', formatter: 'build',
  tester: 'quality', reviewer: 'quality', proofreader: 'quality', accessibility: 'quality',
  performance: 'perf', seo: 'perf',
  security: 'security',
  writer: 'knowledge', researcher: 'knowledge', documentation: 'knowledge',
  translator: 'knowledge', summarizer: 'knowledge',
};

export function agentFamily(role: string): AgentFamily {
  return ROLE_FAMILY[role] ?? 'knowledge';
}

/** Valeur CSS (`var(--nb-agent-…)`) utilisable dans un style inline. */
export function agentColor(role: string): string {
  return `var(--nb-agent-${agentFamily(role)})`;
}

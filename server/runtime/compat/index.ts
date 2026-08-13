/**
 * Compatibility Layer — Pont entre l'ancien et le nouveau système
 * 
 * Exports pour la migration progressive.
 * Ce module sera supprimé une fois la migration complète (Phase 6).
 */

export { SkillManagerV2 } from "./SkillManagerV2";
export {
  adaptSkill,
  adaptAllSkills,
  createToolCallProxy,
} from "./SkillAdapter";
export type { LegacySkill, LegacySkillDeclaration, AdaptOptions } from "./SkillAdapter";
export {
  convertLegacySkill,
  registerLegacySkills,
  createOrchestratorProxy,
} from "./LegacyBridge";
export type { LegacySkill as BridgeLegacySkill } from "./LegacyBridge";

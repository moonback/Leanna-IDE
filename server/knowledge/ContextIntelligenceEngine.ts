import type { ProjectFact } from "./types.js";

export type MemoryDecision = "keep" | "verify" | "refresh" | "merge" | "discard" | "transmit";
export interface ContextFactAssessment { factId: string; decision: MemoryDecision; confidence: number; reasons: string[]; duplicateOf?: string; }
export interface VerifiedMissionLearning { missionId: string; overallSuccess: boolean; verificationPassed: boolean; evidenceIds: string[]; summary: string; relatedFiles: string[]; }
export interface LearningCandidate { missionId: string; content: string; sourceFiles: string[]; evidenceIds: string[]; confidence: number; requiresHumanReview: true; }
export interface ContextIntelligenceReport { assessments: ContextFactAssessment[]; learningCandidates: LearningCandidate[]; counts: Record<MemoryDecision, number>; }
export interface ContextIntelligenceOptions { now?: number; staleAfterMs?: number; minimumKeepConfidence?: number; duplicateSimilarity?: number; maxLearningCandidates?: number; }
const DEFAULTS = { staleAfterMs: 90 * 24 * 60 * 60 * 1000, minimumKeepConfidence: 0.55, duplicateSimilarity: 0.82, maxLearningCandidates: 5 };
function tokens(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_./-]+/).filter((token) => token.length > 2));
}
function similarity(left: string, right: string): number {
  const a = tokens(left), b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
function timestamp(value: string): number { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; }

/** Deterministic, advisory memory policy. It never mutates or deletes ProjectMemory facts. */
export class ContextIntelligenceEngine {
  assess(input: { facts: ProjectFact[]; workspaceFiles: ReadonlySet<string>; missions?: VerifiedMissionLearning[] }, options: ContextIntelligenceOptions = {}): ContextIntelligenceReport {
    const config = { ...DEFAULTS, ...options }, now = config.now ?? Date.now();
    const sourceIsCurrent = (fact: ProjectFact): boolean => !fact.sourceFile ||
      input.workspaceFiles.has(fact.sourceFile.replace(/\\/g, "/"));
    const rank = (fact: ProjectFact): number => fact.confidence * (1 + fact.usageCount);
    const ranked = [...input.facts].sort((a, b) => {
      const sourceDelta = Number(sourceIsCurrent(b)) - Number(sourceIsCurrent(a));
      return sourceDelta || rank(b) - rank(a);
    });
    const assessments: ContextFactAssessment[] = [], canonical: ProjectFact[] = [];
    for (const fact of ranked) {
      const age = Math.max(0, now - timestamp(fact.updatedAt || fact.createdAt));
      const source = fact.sourceFile?.replace(/\\/g, "/");
      const sourceMissing = Boolean(source && !input.workspaceFiles.has(source));
      const duplicate = canonical.find((candidate) => candidate.category === fact.category &&
        similarity(fact.content, candidate.content) >= config.duplicateSimilarity);
      if (duplicate) {
        assessments.push({ factId: fact.id, decision: "merge", confidence: fact.confidence,
          reasons: ["Contenu similaire à un fait mieux classé ; fusion à proposer, sans suppression automatique."], duplicateOf: duplicate.id });
        continue;
      }
      canonical.push(fact);
      let decision: MemoryDecision = "keep";
      const reasons: string[] = [];
      if (sourceMissing) { decision = "verify"; reasons.push("Le fichier source est absent de l'inventaire actuel du workspace."); }
      else if (age >= config.staleAfterMs && !fact.isStructural && fact.usageCount === 0) { decision = "refresh"; reasons.push("Fait ancien, non structurel et jamais réutilisé : actualiser avant injection."); }
      else if (fact.confidence < config.minimumKeepConfidence) { decision = "verify"; reasons.push("Confiance sous le seuil de conservation sans vérification."); }
      else if (source && input.workspaceFiles.has(source)) { decision = "transmit"; reasons.push("Source présente dans le workspace ; injection à condition que la mission soit pertinente."); }
      else reasons.push("Fait conservé ; aucune preuve suffisante pour le déclasser.");
      assessments.push({ factId: fact.id, decision, confidence: fact.confidence, reasons });
    }
    const learningCandidates = (input.missions ?? [])
      .filter((m) => m.overallSuccess && m.verificationPassed && m.evidenceIds.length > 0 && m.summary.trim().length >= 30)
      .slice(0, config.maxLearningCandidates)
      .map((m) => ({ missionId: m.missionId, content: m.summary.trim(),
        sourceFiles: m.relatedFiles.filter((file) => input.workspaceFiles.has(file)),
        evidenceIds: [...new Set(m.evidenceIds)], confidence: 0.8, requiresHumanReview: true as const }));
    const counts: Record<MemoryDecision, number> = { keep: 0, verify: 0, refresh: 0, merge: 0, discard: 0, transmit: 0 };
    for (const item of assessments) counts[item.decision]++;
    return { assessments, learningCandidates, counts };
  }
}

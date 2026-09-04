import type { SkillTuningStore, SkillTuningProposal } from "./SkillTraceStore.js";

const MIN_CALLS = 5;
const MAX_SUCCESS_RATE = 0.8;
const MIN_NEGATIVE_FEEDBACK = 2;

export async function generateSkillTuningProposals(store: SkillTuningStore): Promise<SkillTuningProposal[]> {
  const metrics = await store.getMetrics({ limit: 500 });
  const proposals: SkillTuningProposal[] = [];

  for (const metric of metrics) {
    const negativeFeedback = metric.feedback.incorrect + metric.feedback.needsImprovement;
    const hasEnoughEvidence = metric.calls >= MIN_CALLS && (
      metric.successRate < MAX_SUCCESS_RATE || negativeFeedback >= MIN_NEGATIVE_FEEDBACK
    );
    if (!hasEnoughEvidence) continue;

    const confidence = Math.min(
      0.95,
      Math.round((0.5 + Math.min(metric.calls, 20) / 40 + Math.min(negativeFeedback, 5) / 20) * 100) / 100,
    );
    const hypothesis = metric.successRate < MAX_SUCCESS_RATE
      ? `Le skill ${metric.toolName} échoue trop souvent dans les interactions observées.`
      : `Le feedback utilisateur indique que le skill ${metric.toolName} nécessite des ajustements.`;

    proposals.push(await store.createProposal({
      toolName: metric.toolName,
      status: "proposed",
      hypothesis,
      evidence: {
        calls: metric.calls,
        failures: metric.failures,
        successRate: metric.successRate,
        averageDurationMs: metric.averageDurationMs,
        feedback: metric.feedback,
      },
      proposedChange: {
        type: "review_skill_contract",
        actions: [
          "Examiner la description et les paramètres exposés au modèle",
          "Ajouter une validation explicite des prérequis avant exécution",
          "Ajouter ou renforcer un test ciblé reproduisant l'échec",
        ],
        automaticApplication: false,
      },
      expectedMetric: "Réduire les échecs et atteindre un taux de succès supérieur ou égal à 80 %.",
      confidence,
    }));
  }

  return proposals;
}
// ─── Insights proactifs de l'écran d'accueil ─────────────────────────────────
// À partir de signaux déjà disponibles côté client (état git, fichiers récents,
// heure locale), propose 1 à 3 actions que Leanna peut prendre en charge.
// Fonction pure : testable sans DOM ni réseau.

export type InsightKind = 'review' | 'plan' | 'recap' | 'audit';

export interface HomeInsight {
  id: string;
  kind: InsightKind;
  title: string;
  /** Pourquoi cette suggestion maintenant (le signal observé). */
  reason: string;
  /** Invite envoyée à l'assistante si l'utilisateur accepte. */
  prompt: string;
}

export interface HomeInsightInput {
  now: Date;
  /** Nombre de fichiers modifiés dans le dépôt (null si inconnu / pas de git). */
  changedFiles: number | null;
  branch?: string | null;
  workspaceName?: string | null;
}

const MAX_INSIGHTS = 3;

/** « 1 fichier modifié » / « 3 fichiers modifiés ». */
function modifiedFiles(n: number): string {
  return n > 1 ? `${n} fichiers modifiés` : `${n} fichier modifié`;
}

export function buildHomeInsights(input: HomeInsightInput): HomeInsight[] {
  const { now, changedFiles, branch, workspaceName } = input;
  const insights: HomeInsight[] = [];
  const hour = now.getHours();

  // 1. Modifications non commitées : le signal le plus actionnable.
  if (changedFiles && changedFiles > 0) {
    const files = modifiedFiles(changedFiles);
    insights.push({
      id: 'git-review',
      kind: 'review',
      title: changedFiles >= 15 ? `${files} s'accumulent` : `${files} à relire`,
      reason: branch ? `Non commités sur ${branch}` : 'Modifications non commitées',
      prompt:
        `J'ai des modifications non commitées (${files})${branch ? ` sur la branche ${branch}` : ''}. ` +
        'Passe-les en revue (git status + diff), signale les risques ou oublis, puis propose un découpage en commits avec leurs messages.',
    });
  }

  // 2. Rituel selon le moment de la journée.
  if (hour >= 5 && hour < 11) {
    insights.push({
      id: 'plan-day',
      kind: 'plan',
      title: 'Planifier la journée',
      reason: 'Bien démarrer la matinée',
      prompt: "Aide-moi à planifier ma journée : demande-moi mes priorités et contraintes, puis propose un plan réaliste par blocs horaires.",
    });
  } else if (hour >= 17) {
    insights.push({
      id: 'recap-day',
      kind: 'recap',
      title: 'Faire le bilan du jour',
      reason: 'Clôturer la journée',
      prompt: "Fais le bilan de ma journée de travail sur ce projet (commits et fichiers modifiés aujourd'hui), puis liste ce qui reste à faire demain.",
    });
  } else if (workspaceName) {
    insights.push({
      id: 'audit',
      kind: 'audit',
      title: 'Bilan de santé du projet',
      reason: workspaceName,
      prompt: 'Fais un bilan de santé rapide du projet : erreurs TypeScript, TODO/FIXME récents, tests manquants et dépendances à risque. Classe par priorité.',
    });
  }

  return insights.slice(0, MAX_INSIGHTS);
}

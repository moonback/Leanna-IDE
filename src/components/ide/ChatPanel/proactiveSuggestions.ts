// ─── Suggestions proactives du chat ──────────────────────────────────────────
// Déduit, à partir de l'état réel de la conversation (dernier message, outils
// exécutés, erreurs), les prochaines étapes les plus probables. Fonction pure :
// aucune requête réseau, testable isolément.

import type { ActivityStep } from '../../../hooks/useActivity.js';
import type { TranscriptEntry } from '../../../hooks/useTranscript.js';

export type SuggestionKind = 'start' | 'fix' | 'verify' | 'reply' | 'followup';

export interface ProactiveSuggestion {
  id: string;
  label: string;
  prompt: string;
  kind: SuggestionKind;
}

export interface SuggestionContext {
  transcript: readonly Pick<TranscriptEntry, 'role' | 'text'>[];
  activity: readonly Pick<ActivityStep, 'tool' | 'label' | 'status' | 'detail'>[];
}

export interface SuggestionSet {
  /** Titre de la rangée : « Suggestions » au démarrage, « Prochaines étapes » ensuite. */
  title: string;
  items: ProactiveSuggestion[];
}

const MAX_ITEMS = 4;

const WRITE_TOOLS = new Set([
  'write_project_file', 'modify_project_file', 'patch_project_file',
  'rename_project_file', 'delete_project_file',
]);

const STARTERS: ProactiveSuggestion[] = [
  { id: 'start-explain', kind: 'start', label: 'Expliquer ce fichier', prompt: 'Explique le fichier actuellement ouvert.' },
  { id: 'start-terminal', kind: 'start', label: "Corriger l'erreur du terminal", prompt: 'Analyse la dernière erreur du terminal et propose un correctif.' },
  { id: 'start-summary', kind: 'start', label: 'Résumer le projet', prompt: 'Donne-moi un résumé de la structure et du rôle de ce projet.' },
  { id: 'start-plan', kind: 'start', label: 'Planifier ma journée', prompt: "Aide-moi à organiser ma journée : demande-moi mes priorités puis propose un plan réaliste." },
];

/** Suggestions de départ, exposées pour compatibilité. */
export const STARTER_SUGGESTIONS: readonly ProactiveSuggestion[] = STARTERS;

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

/** Extrait le chemin cible d'un libellé d'outil (« Modifier src/a.ts » → « src/a.ts »). */
function targetOf(step: Pick<ActivityStep, 'label' | 'detail'>): string | null {
  const m = step.label.match(/^\S+\s+(\S+\.[\w]+)$/);
  return m ? m[1] : null;
}

/** La dernière réponse se termine-t-elle par une question fermée (offre d'action) ? */
function endsWithOffer(text: string): boolean {
  const tail = text.trim().split(/\n/).pop()?.trim() ?? '';
  return /\?\s*[)»"]?$/.test(tail);
}

/**
 * Calcule les suggestions à afficher au-dessus du champ de saisie.
 * L'ordre exprime la priorité : réparer > répondre > vérifier > approfondir.
 */
export function buildProactiveSuggestions({ transcript, activity }: SuggestionContext): SuggestionSet {
  const messages = transcript.filter(e => e.text?.trim());
  if (messages.length === 0) {
    return { title: 'Suggestions', items: STARTERS.slice(0, MAX_ITEMS) };
  }

  const items: ProactiveSuggestion[] = [];
  const push = (s: ProactiveSuggestion) => {
    if (items.length < MAX_ITEMS && !items.some(i => i.id === s.id)) items.push(s);
  };

  const last = messages[messages.length - 1];
  const recent = activity.slice(-12);

  // 1. Échec récent d'un outil → diagnostic prioritaire.
  const failed = [...recent].reverse().find(s => s.status === 'error');
  if (failed) {
    push({
      id: 'fix-error',
      kind: 'fix',
      label: `Diagnostiquer « ${failed.label} »`,
      prompt: `L'étape « ${failed.label} » a échoué${failed.detail ? ` (${failed.detail.slice(0, 200)})` : ''}. Trouve la cause racine et corrige-la.`,
    });
  }

  // 2. L'assistante attend une réponse → réponses rapides.
  if (last.role === 'assistant' && endsWithOffer(last.text)) {
    push({ id: 'reply-yes', kind: 'reply', label: 'Oui, vas-y', prompt: 'Oui, vas-y.' });
    push({ id: 'reply-no', kind: 'reply', label: 'Non, autre approche', prompt: 'Non. Propose-moi une autre approche.' });
  }

  // 3. Fichiers modifiés → vérifier, tester, résumer.
  const written = recent.filter(s => s.status === 'done' && WRITE_TOOLS.has(s.tool));
  if (written.length > 0) {
    const files = [...new Set(written.map(targetOf).filter((f): f is string => !!f))];
    const scope = files.length === 1 ? basename(files[0]) : `les ${files.length || written.length} fichiers modifiés`;
    const ranChecks = recent.some(s => /^(verify_|run_tests|quality_loop)/.test(s.tool));
    if (!ranChecks) {
      push({ id: 'verify', kind: 'verify', label: 'Vérifier (types + tests)', prompt: `Vérifie ${scope} : typecheck puis tests ciblés, et corrige ce qui échoue.` });
    }
    push({ id: 'tests', kind: 'verify', label: `Écrire des tests`, prompt: `Écris des tests pour ${scope}.` });
    push({ id: 'commit', kind: 'followup', label: 'Préparer le commit', prompt: 'Résume les changements effectués et propose un message de commit conventionnel.' });
  }

  // 4. Suites génériques mais utiles, si la place le permet.
  if (last.role === 'assistant') {
    push({ id: 'deeper', kind: 'followup', label: 'Approfondir', prompt: 'Approfondis ta dernière réponse avec un exemple concret.' });
    push({ id: 'next', kind: 'followup', label: 'Et ensuite ?', prompt: 'Quelle est la prochaine étape la plus utile ? Propose-la et dis-moi si tu peux la faire.' });
  }

  return { title: 'Prochaines étapes', items };
}

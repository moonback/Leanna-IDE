import { Lightbulb, Pencil, ShieldCheck } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// activityPhases — classification partagée des outils en phases du cycle agentique.
//
// Source de vérité UNIQUE pour le regroupement « Planification → Écriture →
// Vérification », consommée à la fois par UnifiedTimeline (timeline du chat) et
// par AgentProgressBar (barre d'activité de l'IDE). Un seul endroit à faire
// évoluer quand un nouvel outil apparaît, pour éviter que les deux surfaces
// divergent.
// ═══════════════════════════════════════════════════════════════════════════════

export type Phase = 'planning' | 'writing' | 'verification';

export const PHASE_META: Record<Phase, { label: string; icon: typeof Lightbulb; color: string }> = {
  planning:     { label: 'Planification', icon: Lightbulb,   color: 'var(--color-warning)' },
  writing:      { label: 'Écriture',      icon: Pencil,      color: 'var(--accent-primary)' },
  verification: { label: 'Vérification',  icon: ShieldCheck, color: 'var(--color-success)' },
};

export const PHASE_ORDER: Phase[] = ['planning', 'writing', 'verification'];

/** Classe un outil dans l'une des trois phases de la timeline. */
export function toolToPhase(tool: string): Phase {
  // Skills personnalisés : traités comme une ACTION (ils exécutent une
  // instruction utilisateur). Court-circuit AVANT les regex ci-dessous pour
  // éviter qu'un skill nommé p.ex. custom_search_* ne tombe en « Planification ».
  if (tool.startsWith('custom_')) {
    return 'writing';
  }
  if (/reason|think|plan|search|find|grep|list|analyze|memory|knowledge|get_workspace|read_file_outline/.test(tool)) {
    return 'planning';
  }
  if (/write|modify|patch|create|delete|rename|git_|commit|push|stage/.test(tool)) {
    return 'writing';
  }
  if (/test|verify|validate|read_project_file|open_project_file|lint|check/.test(tool)) {
    return 'verification';
  }
  // Par défaut : écriture (action) si non classé.
  return 'writing';
}

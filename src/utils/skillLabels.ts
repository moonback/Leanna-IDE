/**
 * skillLabels — Convertit les noms techniques d'outils/skills (ex.
 * `read_project_file`) en libellés lisibles décrivant ce que fait l'action
 * (ex. « Lire un fichier »), pour l'affichage dans le panneau des missions.
 *
 * Les outils connus ont un libellé français dédié. Les outils inconnus tombent
 * sur un repli générique : `snake_case` → « Snake case ».
 */

const SKILL_LABELS: Record<string, string> = {
  // ── Codebase ────────────────────────────────────────────────────────────
  list_project_files: 'Lister les fichiers',
  read_project_file: 'Lire un fichier',
  read_file_outline: 'Analyser la structure du fichier',
  write_project_file: 'Écrire un fichier',
  search_in_files: 'Rechercher dans les fichiers',
  delete_project_file: 'Supprimer un fichier',
  move_project_file: 'Déplacer un fichier',
  apply_patch: 'Appliquer une modification',

  // ── Mémoire ─────────────────────────────────────────────────────────────
  search_memory: 'Rechercher dans la mémoire',
  save_memory: 'Enregistrer en mémoire',
  recall_memory: 'Se rappeler un souvenir',

  // ── Terminal / système ──────────────────────────────────────────────────
  run_command: 'Exécuter une commande',
  run_terminal: 'Exécuter dans le terminal',
  execute_shell: 'Exécuter une commande shell',

  // ── Web / navigateur ────────────────────────────────────────────────────
  web_search: 'Rechercher sur le web',
  web_fetch: 'Consulter une page web',
  browse_url: 'Ouvrir une page web',
  browser_navigate: 'Naviguer dans le navigateur',

  // ── Git ─────────────────────────────────────────────────────────────────
  git_status: 'Consulter l\u2019état Git',
  git_diff: 'Comparer les modifications Git',
  git_commit: 'Créer un commit',

  // ── Connaissance ────────────────────────────────────────────────────────
  query_knowledge_graph: 'Interroger le graphe de connaissances',
  build_knowledge_graph: 'Construire le graphe de connaissances',
};

/**
 * Retourne un libellé lisible pour un nom d'outil/skill.
 * @param skill Nom technique de l'outil (ex. `read_project_file`).
 */
export function skillLabel(skill: string | undefined | null): string {
  if (!skill) return 'Action';

  const known = SKILL_LABELS[skill];
  if (known) return known;

  // Skills personnalisés : `custom_<nom>` → « Nom »
  const custom = skill.startsWith('custom_') ? skill.slice('custom_'.length) : skill;

  // Repli générique : snake_case / kebab-case → « Phrase capitalisée ».
  const words = custom.replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Action';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

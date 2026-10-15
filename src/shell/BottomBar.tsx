/**
 * BottomBar — barre inférieure du shell v3 (hors IDE, qui garde sa StatusBar) :
 * workspace, branche Git et activité des agents en direct.
 */
import { FolderOpen, GitBranch, Activity } from 'lucide-react';
import type { AgentActivitySummary, GitSummary } from './useShellData.js';

export interface BottomBarProps {
  workspace: string | null;
  git: GitSummary | null;
  agents: AgentActivitySummary;
}

export function activityText(agents: AgentActivitySummary): string {
  const n = agents.live.filter(t => t.status === 'running').length;
  if (n === 0) return agents.live.length > 0 ? `${agents.live.length} tâche(s) en attente` : 'Aucune tâche en cours';
  return n === 1 ? '1 agent exécute une tâche' : `${n} agents exécutent des tâches en parallèle`;
}

export function BottomBar({ workspace, git, agents }: BottomBarProps) {
  return (
    <footer className="nb-bottombar" aria-label="Barre d'état du cockpit">
      <span className="nb-bottombar__item">
        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
        {workspace ? `Workspace : ${workspace}` : 'Aucun projet ouvert'}
      </span>
      {git && (
        <span className="nb-bottombar__item">
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
          {git.branch}
          {git.changes > 0 && <span className="nb-bottombar__muted">· {git.changes} modif.</span>}
        </span>
      )}
      <span className="nb-bottombar__spacer" />
      <span className="nb-bottombar__item nb-bottombar__activity" role="status" aria-live="polite">
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        {activityText(agents)}
      </span>
    </footer>
  );
}

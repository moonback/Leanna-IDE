/**
 * CockpitShell — cadre applicatif v3 (flag uiV3), phase 2 du plan
 * docs/PLAN_REFONTE_UI_IMMERSIVE.md.
 *
 *   ┌──────────────────────── TopBar ────────────────────────┐
 *   │ nav (GlobalSidebar) │        main        │ RightRail   │
 *   └─────────────── BottomBar (hors IDE) ───────────────────┘
 *
 * La navigation et le contenu sont passés en props : la logique existante
 * (NavSidebar, routes, IdeView) est réutilisée telle quelle. Dans l'IDE,
 * la BottomBar est masquée (StatusBar) et le rail est fermé par défaut.
 */
import { useLocation } from 'react-router-dom';
import { ROUTES } from '../config/navigation.js';
import { TopBar } from './TopBar.js';
import { RightRail } from './RightRail.js';
import { BottomBar } from './BottomBar.js';
import { useRightRailOpen } from './useShellPrefs.js';
import { SceneLayer } from '../scene/SceneLayer.js';
import {
  useAgentActivity, useLiveMissions, useSystemMetrics, useBackendOnline, useGitSummary, useWorkspaceName,
} from './useShellData.js';

export interface CockpitShellProps {
  nav: React.ReactNode;
  children: React.ReactNode;
}

export function CockpitShell({ nav, children }: CockpitShellProps) {
  const { pathname } = useLocation();
  const isIde = pathname === ROUTES.home || pathname === ROUTES.ide;
  const [railOpen, setRailOpen] = useRightRailOpen(isIde ? 'ide' : 'global');

  const agents = useAgentActivity();
  const { missions } = useLiveMissions();
  const metrics = useSystemMetrics();
  const online = useBackendOnline();
  const git = useGitSummary();
  const workspace = useWorkspaceName();

  return (
    <div className="nb-shell" data-context={isIde ? 'ide' : 'global'}>
      <SceneLayer activeAgents={agents.live.filter(t => t.status === 'running').length} />
      <TopBar
        online={online}
        activeAgents={agents.activeRoles}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen(!railOpen)}
      />
      <div className="nb-shell__body">
        {nav}
        {children}
        {railOpen && <RightRail agents={agents} missions={missions} metrics={metrics} />}
      </div>
      {!isIde && <BottomBar workspace={workspace} git={git} agents={agents} />}
    </div>
  );
}

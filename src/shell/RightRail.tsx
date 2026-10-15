/**
 * RightRail — colonne droite du shell v3 : agents actifs, missions en cours,
 * ressources machine. Données réelles uniquement (voir useShellData.ts) ;
 * chaque section a un état vide explicite.
 */
import { useNavigate } from 'react-router-dom';
import { Bot, Milestone, Cpu, ChevronRight } from 'lucide-react';
import { AgentChip } from '../components/ui/AgentChip.js';
import { ProgressBeam } from '../components/ui/ProgressBeam.js';
import { RingGauge } from '../components/ui/RingGauge.js';
import { agentColor } from '../components/ui/agentColors.js';
import { BarButton } from '../components/ui/BarButton.js';
import { getAgentDisplayName } from '../stores/agentActivityStore.js';
import { ROUTES } from '../config/navigation.js';
import type { AgentActivitySummary, ShellMission, SystemMetrics } from './useShellData.js';

const MAX_AGENTS = 5;
const MAX_MISSIONS = 4;

const MISSION_STATUS: Record<ShellMission['status'], { label: string; color: string }> = {
  in_progress: { label: 'En cours', color: 'var(--nb-cyan)' },
  pending: { label: 'En attente', color: 'var(--nb-violet)' },
  paused: { label: 'En pause', color: 'var(--nb-amber)' },
  blocked: { label: 'Bloquée', color: 'var(--color-error)' },
};

function RailSection({ icon, heading, action, children }: {
  icon: React.ReactNode; heading: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="nb-rail__section nb-glass-1" aria-label={heading}>
      <div className="nb-rail__head">
        <span className="nb-rail__icon" aria-hidden="true">{icon}</span>
        <h2 className="nb-rail__title nb-display">{heading}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface RightRailProps {
  agents: AgentActivitySummary;
  missions: ShellMission[] | null;
  metrics: SystemMetrics | null;
}

export function RightRail({ agents, missions, metrics }: RightRailProps) {
  const navigate = useNavigate();
  const seeAll = (path: string, what: string) => (
    <BarButton
      className="nb-rail__more"
      icon={<ChevronRight className="h-3.5 w-3.5" />}
      label={`Voir tout : ${what}`}
      onClick={() => navigate(path)}
    />
  );

  return (
    <aside className="nb-rail" aria-label="Agents, missions et ressources">
      <RailSection icon={<Bot className="h-4 w-4" />} heading="Agents IA" action={seeAll(`${ROUTES.pilotage}?tab=swarm`, 'agents')}>
        {agents.live.length === 0 ? (
          <p className="nb-rail__empty">Aucun agent actif. Les agents apparaissent ici dès qu'une tâche démarre.</p>
        ) : (
          <ul className="nb-rail__list">
            {agents.live.slice(0, MAX_AGENTS).map(task => (
              <li key={task.id} className="nb-rail__agent" style={{ '--nb-card-color': agentColor(task.role) } as React.CSSProperties}>
                <AgentChip
                  agentRole={task.role}
                  label={task.agentName || getAgentDisplayName(task.role)}
                  status={task.status === 'running' ? 'running' : 'idle'}
                />
                <span className="nb-rail__sub">{task.title}</span>
              </li>
            ))}
            {agents.live.length > MAX_AGENTS && (
              <li className="nb-rail__sub">+ {agents.live.length - MAX_AGENTS} autre(s)</li>
            )}
          </ul>
        )}
      </RailSection>

      <RailSection icon={<Milestone className="h-4 w-4" />} heading="Missions en cours" action={seeAll(`${ROUTES.pilotage}?tab=missions`, 'missions')}>
        {missions === null ? (
          <p className="nb-rail__empty">Missions indisponibles (serveur injoignable).</p>
        ) : missions.length === 0 ? (
          <p className="nb-rail__empty">Aucune mission en cours.</p>
        ) : (
          <ul className="nb-rail__list">
            {missions.slice(0, MAX_MISSIONS).map(m => {
              const meta = MISSION_STATUS[m.status];
              return (
                <li key={m.id} className="nb-rail__mission">
                  <ProgressBeam
                    label={m.title}
                    value={m.progress ?? 0}
                    running={m.status === 'in_progress'}
                    color={meta.color}
                  />
                  <span className="nb-rail__sub">
                    {meta.label}{m.progress === null ? ' · plan en préparation' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </RailSection>

      <RailSection icon={<Cpu className="h-4 w-4" />} heading="Ressources">
        {metrics === null ? (
          <p className="nb-rail__empty">Mesures indisponibles.</p>
        ) : (
          <>
            <div className="nb-rail__gauges">
              <RingGauge label="CPU" value={metrics.cpu.percent} color="var(--nb-green)" size={76} />
              <RingGauge label="RAM" value={metrics.memory.percent} color="var(--nb-cyan)" size={76} />
            </div>
            <p className="nb-rail__sub">
              {metrics.cpu.cores} cœurs · {(metrics.memory.usedMB / 1024).toFixed(1)} / {(metrics.memory.totalMB / 1024).toFixed(1)} Go · serveur {metrics.process.rssMB} Mo
            </p>
          </>
        )}
      </RailSection>
    </aside>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Bot, MessageSquare, Sparkles, Target, Wrench, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TranscriptEntry } from '../../hooks/useTranscript.js';
import type { AgentTaskEntry, ToolActivityEntry } from '../../stores/agentActivityStore.js';
import type { MissionActivity } from './activity.js';
import { StatPill } from './StatPill.js';
import { MissionCard } from './MissionCard.js';
import { AgentCard } from './AgentCard.js';
import { ToolRow } from './ToolRow.js';
import { TranscriptList } from './TranscriptList.js';

export type LivePanel = 'activity' | 'conversation';

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
      {icon}{children}
    </h3>
  );
}

/**
 * Contenu du drawer de la vue live : onglets « Activité » (missions, agents,
 * outils) et « Conversation » (historique de la session).
 */
export function LiveDrawer({
  panel, onSelect, connected, aiName, transcript, onClearTranscript,
  missions: activeMissions, agents: sortedAgents, tools,
  runningAgentsCount, runningToolsCount, reduceMotion,
}: {
  panel: LivePanel; onSelect: (p: LivePanel | null) => void; connected: boolean; aiName: string;
  transcript: TranscriptEntry[]; onClearTranscript: () => void;
  missions: MissionActivity[]; agents: AgentTaskEntry[]; tools: ToolActivityEntry[];
  runningAgentsCount: number; runningToolsCount: number; reduceMotion: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAllTools, setShowAllTools] = useState(false);
  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const allToolsReversed = useMemo(() => [...tools].reverse(), [tools]);
  const recentTools = useMemo(
    () => (showAllTools ? allToolsReversed.slice(0, 30) : allToolsReversed.slice(0, 8)),
    [allToolsReversed, showAllTools],
  );
  const hasActivity = sortedAgents.length > 0 || recentTools.length > 0 || activeMissions.length > 0;
  const clearTranscript = onClearTranscript;

  return (
    <>
      <div className="flex flex-shrink-0 items-center gap-1 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
        <div className="flex rounded-[var(--radius-lg)] p-0.5" style={{ backgroundColor: 'var(--bg-ctrl)', border: '1px solid var(--border-base)' }} role="tablist">
          {([['activity', 'Activité', Activity], ['conversation', 'Conversation', MessageSquare]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => panel !== id && onSelect(id)}
              className="relative flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ color: panel === id ? '#fff' : 'var(--text-muted)' }}>
              {panel === id && (
                <motion.span layoutId="orb-tab" className="absolute inset-0 rounded-[var(--radius-md)]" style={{ backgroundColor: 'var(--accent-primary)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
              )}
              <Icon className="relative h-3.5 w-3.5" /><span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {panel === 'activity' && activeMissions.length > 0 && <StatPill icon={<Target className="h-3 w-3" />} value={activeMissions.length} label="Missions en cours" color="var(--accent-primary)" />}
          {panel === 'activity' && runningAgentsCount > 0 && <StatPill icon={<Bot className="h-3 w-3" />} value={runningAgentsCount} label="Agents actifs" color="var(--color-accent-alt)" />}
          {panel === 'activity' && runningToolsCount > 0 && <StatPill icon={<Wrench className="h-3 w-3" />} value={runningToolsCount} label="Outils en exécution" color="var(--color-success)" />}
          <button type="button" onClick={() => onSelect(null)} title="Fermer (Échap)" aria-label="Fermer le panneau"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ color: 'var(--text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar px-4 py-4">
        {panel === 'conversation' ? (
          <TranscriptList entries={transcript} aiName={aiName} onClear={clearTranscript} reduceMotion={reduceMotion} />
        ) : !hasActivity ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="max-w-[220px] text-xs leading-relaxed">
              {connected ? 'Aucune action en cours. Demande une tâche à l\'assistant.' : 'Connecte-toi pour suivre les actions des agents et missions.'}
            </p>
          </div>
        ) : (
          <>
            {activeMissions.length > 0 && (
              <section className="flex flex-col gap-2">
                <SectionTitle icon={<Target className="h-3 w-3" />}>Missions</SectionTitle>
                {activeMissions.map(m => (
                  <MissionCard key={m.missionId} m={m} isOpen={!!expanded[`mission:${m.missionId}`]} onToggle={() => toggleExpanded(`mission:${m.missionId}`)} />
                ))}
              </section>
            )}

            {sortedAgents.length > 0 && (
              <section className="flex flex-col gap-2">
                <SectionTitle icon={<Bot className="h-3 w-3" />}>Agents</SectionTitle>
                <AnimatePresence initial={false}>
                  {sortedAgents.map(task => (
                    <AgentCard key={task.id} task={task} isOpen={!!expanded[`agent:${task.id}`]} onToggle={() => toggleExpanded(`agent:${task.id}`)} reduceMotion={reduceMotion} />
                  ))}
                </AnimatePresence>
              </section>
            )}

            {recentTools.length > 0 && (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <SectionTitle icon={<Wrench className="h-3 w-3" />}>Actions récentes</SectionTitle>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-dimmed)' }}>{allToolsReversed.length}</span>
                </div>
                <AnimatePresence initial={false}>
                  {recentTools.map(tool => (
                    <ToolRow key={tool.id} tool={tool} isOpen={!!expanded[`tool:${tool.id}`]} onToggle={() => toggleExpanded(`tool:${tool.id}`)} reduceMotion={reduceMotion} />
                  ))}
                </AnimatePresence>
                {allToolsReversed.length > 8 && (
                  <button type="button" onClick={() => setShowAllTools(v => !v)}
                    className="self-start rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                    style={{ color: 'var(--accent-primary)' }}>
                    {showAllTools ? 'Réduire' : `Voir plus (${allToolsReversed.length - recentTools.length})`}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
